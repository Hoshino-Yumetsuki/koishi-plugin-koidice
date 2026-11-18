import { randomInt } from 'node:crypto';
import type { Context, Session } from 'koishi';
import type { DiceAdapter } from '../wasm';

interface DeckStore {
  scope: string;
  data: string;
}

declare module 'koishi' {
  interface Tables {
    koidice_decks: DeckStore;
  }
}

interface Deck {
  cards: string[];
  remaining: number[];
  public: boolean;
  external?: boolean;
}

type Decks = Record<string, Deck>;

export function registerDeckSchema(ctx: Context) {
  ctx.model.extend('koidice_decks', { scope: 'string', data: 'text' }, { primary: 'scope' });
}

export function deckScope(session: Session): string {
  const id = session.isDirect ? session.userId : session.guildId || session.channelId;
  if (!id) throw new Error('无法获取会话信息');
  return JSON.stringify([session.platform, session.isDirect ? 'private' : 'group', id]);
}

export function gameDeckScope(platform: string, gameId: number): string {
  return JSON.stringify([platform, 'game', gameId]);
}

export function makeDeck(cards: string[], isPublic: boolean, adapter: DiceAdapter, maxCards = 256, external = false): Deck {
  if (!cards.length || cards.length > maxCards) throw new Error(`牌堆须包含 1-${maxCards} 张卡面`);
  const expanded: string[] = [];
  for (const raw of cards) {
    let card = raw;
    let count = 1;
    const match = /::(.*?)::/u.exec(raw);
    if (match) {
      const value = isPublic ? adapter.resolveDeckCard(match[1]) : match[1];
      if (/^[1-9]\d{0,2}$/u.test(value)) {
        count = Number(value);
        card = raw.slice(match.index + match[0].length);
      }
    }
    if (expanded.length + count > 1024) throw new Error('牌堆展开后不能超过 1024 张');
    for (let i = 0; i < count; i++) expanded.push(card);
  }
  return { cards: expanded, remaining: expanded.map((_, i) => i), public: isPublic, external };
}

export function drawDeck(deck: Deck, count: number, adapter: DiceAdapter, resolveExternal?: (card: string) => string): string[] {
  const result: string[] = [];
  while (count-- > 0 && deck.remaining.length) {
    const index = randomInt(deck.remaining.length);
    const card = deck.cards[deck.remaining[index]];
    deck.remaining[index] = deck.remaining[deck.remaining.length - 1];
    deck.remaining.pop();
    result.push(deck.public ? adapter.resolveDeckCard(card) : deck.external && resolveExternal ? resolveExternal(card) : card);
  }
  return result;
}

export class DeckService {
  private locks = new Map<string, Promise<void>>();
  constructor(private ctx: Context) {}

  async transact<T>(scope: string, action: (decks: Decks) => Promise<{ result: T; changed: boolean }>): Promise<T> {
    const previous = this.locks.get(scope) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(scope, current);
    await previous;
    try {
      const [row] = await this.ctx.database.get('koidice_decks', { scope });
      const decks: Decks = row ? JSON.parse(row.data) : Object.create(null);
      const { result, changed } = await action(decks);
      if (changed) {
        const data = JSON.stringify(decks);
        if (row) await this.ctx.database.set('koidice_decks', { scope }, { data });
        else await this.ctx.database.create('koidice_decks', { scope, data });
      }
      return result;
    } finally {
      release();
      if (this.locks.get(scope) === current) this.locks.delete(scope);
    }
  }
}
