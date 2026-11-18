import { randomInt } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { Context } from 'koishi';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

export class PublicDecks {
  private decks = new Map<string, string[]>();

  constructor(ctx: Context, private adapter: DiceAdapter) {
    const dir = join(ctx.baseDir, 'data', 'koidice', 'decks');
    let files: string[];
    try { files = readdirSync(dir).filter((name) => !name.startsWith('.') && /\.(json|ya?ml)$/iu.test(name)).sort(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn('读取公共牌堆目录失败:', error);
      return;
    }
    for (const file of files.slice(0, 100)) {
      try {
        const path = join(dir, file);
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('文件过大或不是普通文件');
        const text = readFileSync(path, 'utf8');
        const parsed: unknown = file.toLowerCase().endsWith('.json') ? JSON.parse(text) : load(text, { json: false });
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('牌堆文件必须为名称到卡面数组的映射');
        const entries = Object.entries(parsed);
        if (entries.length > 1000) throw new Error('牌堆过多');
        for (const [name, value] of entries) {
          if (!name || name.length > 100 || name.startsWith('_') || !Array.isArray(value) || value.length < 1 || value.length > 1024 || !value.every((card) => typeof card === 'string' && card.length <= 4096)) throw new Error(`无效牌堆: ${name}`);
        }
        for (const [name, value] of entries) this.decks.set(name, value as string[]);
      } catch (error) { logger.warn(`加载公共牌堆 ${file} 失败:`, error); }
    }
  }

  get(name: string): string[] | null {
    return this.decks.get(name) || null;
  }

  list(): string[] { return [...this.decks.keys()]; }

  resolve(card: string, depth = 0, budget = { remaining: 64 }): string {
    if (depth >= 8 || card.length > 32768 || budget.remaining <= 0) return card;
    return card.replace(/(^|[^\\])\{(%?[^{}]{1,100})\}/gu, (whole, prefix: string, ref: string) => {
      if (budget.remaining-- <= 0) return whole;
      const name = ref.startsWith('%') ? ref.slice(1) : ref;
      const builtIn = this.adapter.isBuiltinDeck(name) ? this.adapter.getPublicDeck(name) : null;
      const cards = builtIn || this.get(name);
      if (!cards?.length) return whole;
      if (builtIn) {
        const result = this.adapter.drawFromDeck(name, 1);
        return prefix + (result.success ? result.cards[0] || '' : whole.slice(prefix.length));
      }
      const weighted: { card: string; weight: number }[] = [];
      let total = 0;
      for (const item of cards) {
        const match = /::([1-9]\d{0,2})::/u.exec(item);
        const weight = match ? Number(match[1]) : 1;
        total += weight;
        weighted.push({ card: match ? item.slice(match.index + match[0].length) : item, weight });
      }
      let pick = randomInt(total);
      for (const item of weighted) {
        if (pick < item.weight) return prefix + this.resolve(item.card, depth + 1, budget);
        pick -= item.weight;
      }
      return whole;
    });
  }
}
