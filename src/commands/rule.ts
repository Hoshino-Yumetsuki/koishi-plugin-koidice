import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import type { ExtensionService } from '../services/extension-service';
import { logger } from '../index';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { load } from 'js-yaml';
import { GameSessionService } from '../services/game-session-service';
import coc7 from '../../examples/rules/coc7.yaml';

type Rules = Record<string, Record<string, string>>;

const builtin: Rules = { [coc7.rule]: coc7.manual };

function loadLocalRules(baseDir: string): Rules {
  const rules: Rules = {};
  const dir = resolve(baseDir, 'data', 'koidice', 'rules');
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase();
    if (!['.json', '.yaml', '.yml'].includes(ext)) continue;
    try {
      const text = readFileSync(resolve(dir, file), 'utf8');
      const data: unknown = ext === '.json' ? JSON.parse(text) : load(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const record = Object.fromEntries(Object.entries(data));
      const name = typeof record.rule === 'string' && record.manual ? record.rule : basename(file, ext);
      const entries = record.manual && typeof record.rule === 'string' ? record.manual : record;
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      const system = name.toLowerCase();
      rules[system] ??= {};
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value === 'string') rules[system][key.toLowerCase()] = value;
        else if (value && typeof value === 'object' && 'content' in value && typeof value.content === 'string') {
          rules[system][key.toLowerCase()] = value.content;
        }
      }
    } catch (error) {
      logger.error(`加载规则文件 ${file} 失败:`, error);
    }
  }
  return rules;
}

export function registerRuleCommands(
  register: RegisterCommand,
  config: Config,
  _diceAdapter: DiceAdapter,
  ctx: Context,
  extensionService?: ExtensionService | null
) {
  const games = new GameSessionService(ctx);
  const local = loadLocalRules(ctx.baseDir);
  const remoteCache = new Map<string, string>();
  const remote = async (session: Session, system: string, keyword: string): Promise<string | undefined> => {
    if (!config.ruleEndpoint) return undefined;
    try {
      const url = new URL(config.ruleEndpoint);
      if (url.protocol !== 'https:' || url.username || url.password) return undefined;
      const key = JSON.stringify([session.platform, session.selfId, url.href, system.toLowerCase(), keyword.toLowerCase()]);
      const cached = remoteCache.get(key);
      if (cached !== undefined) return cached;
      const form = new URLSearchParams({ Name: keyword, v: '20190114' });
      if (system) form.set('Type', `Rules-${system}`);
      const response = await fetch(url, {
        method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return undefined;
      const content = await response.text();
      if (!content.trim()) return undefined;
      remoteCache.set(key, content);
      return content;
    } catch (error) {
      logger.debug('查询远程规则失败:', error);
      return undefined;
    }
  };
  const systems = () => [...new Set([
    ...Object.keys(builtin), ...Object.keys(local), ...(extensionService?.listPluginRules() || [])
  ].map((name: string) => name.toLowerCase()))].sort();
  const lookup = (system: string, keyword: string): string | undefined => {
    const name = system.toLowerCase() === 'coc' ? 'coc7' : system.toLowerCase();
    const key = keyword.toLowerCase();
    const pluginName = extensionService?.listPluginRules().find((item: string) => item.toLowerCase() === name);
    // Extension manuals use exact keys; Dice! matches manual entries exactly.
    const plugin = pluginName && extensionService ? (extensionService.queryPluginRule(pluginName, keyword) ??
      extensionService.queryPluginRule(pluginName, keyword.toUpperCase())) : undefined;
    const builtInName = Object.keys(builtin).find((item) => item.toLowerCase() === name);
    const builtInKey = builtInName && Object.keys(builtin[builtInName]).find((item) => item.toLowerCase() === key);
    return local[name]?.[key] ?? plugin ?? (builtInName && builtInKey ? builtin[builtInName][builtInKey] : undefined);
  };

  const setRule = async (session: Session, query?: string) => {
    const input = (query || '').trim();
    const match = /^set(?:\s*[:：]\s*|\s+|$)(.*)$/i.exec(input);
    if (!match && !/^clr$/i.test(input)) return '用法：.rule set [规则]；查询规则请使用 .rules [规则:]词条';
    const value = match?.[1].trim() || '';
    const game = await games.getSession(session);
    if (game) {
      if (!games.isGM(game, session.userId!)) return '只有 GM 可以设置游戏规则';
      await games.setConfig(game.id, 'rule', value || undefined);
    } else {
      const key = { userId: JSON.stringify([session.platform, session.selfId, session.userId]), dataKey: 'defaultRule' };
      const rows = await ctx.database.get('koidice_user_data', key);
      if (!value) await ctx.database.remove('koidice_user_data', key);
      else if (rows.length) await ctx.database.set('koidice_user_data', key, { dataValue: value, updatedAt: new Date() });
      else await ctx.database.create('koidice_user_data', { ...key, dataValue: value, updatedAt: new Date() });
    }
    return value ? `已设置默认规则 ${value}` : '已重置默认规则';
  };
  const queryRule = async (session: Session, query?: string) => {
    const text = (query || '').trim();
    if (/^set(?:\s|[:：]|$)/i.test(text) || /^clr$/i.test(text)) return setRule(session, text);
    const colon = text.search(/[:：]/u);
    const explicit = colon >= 0 ? text.slice(0, colon).trim() : '';
    const keyword = (colon >= 0 ? text.slice(colon + 1) : text).trim();
    if (!keyword || (colon >= 0 && !explicit)) return '用法：.rules [规则:]词条';
    if (explicit) {
      const content = lookup(explicit, keyword) ?? await remote(session, explicit, keyword);
      return content === undefined ? `未找到规则: ${explicit}:${keyword}` : `【${keyword}】\n${content}`;
    }
    const game = await games.getSession(session);
    const gameRule = game && JSON.parse(game.config || '{}').rule;
    const [userRule] = game ? [] : await ctx.database.get('koidice_user_data', {
      userId: JSON.stringify([session.platform, session.selfId, session.userId]), dataKey: 'defaultRule'
    });
    const selected = typeof gameRule === 'string' && gameRule ? gameRule : userRule?.dataValue;
    const candidates = game && selected ? [selected] : [selected, ...systems()];
    for (const system of candidates) {
      if (!system || typeof system !== 'string') continue;
      const content = lookup(system, keyword);
      if (content !== undefined) return `【${keyword}】\n${content}`;
    }
    const content = await remote(session, selected || '', keyword);
    if (content !== undefined) return `【${keyword}】\n${content}`;
    return `未找到规则: ${keyword}`;
  };
  register('rule [query:text]', '规则速查').action(async ({ session }, query) => {
    if (!session?.userId) return '无法获取会话信息';
    return queryRule(session, query);
  });
  register('rules [query:text]', '规则速查').action(async ({ session }, query) => {
    if (!session?.userId) return '无法获取会话信息';
    return queryRule(session, query);
  });

  register('rule.list', '列出所有规则').action(() => `可用规则：${systems().join('、') || '无'}`);
}
