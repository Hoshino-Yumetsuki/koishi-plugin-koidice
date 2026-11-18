import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Context, Session } from 'koishi';
import type { DiceAdapter } from '../wasm';
import { deckScope, gameDeckScope, drawDeck, makeDeck, DeckService } from './deck-service';

const adapter = { resolveDeckCard: (value: string) => value === '{weight}' ? '2' : value.replace('{x}', 'resolved') } as DiceAdapter;

test('deck draws without replacement and respects public weights', () => {
  const deck = makeDeck(['::{weight}::{x}', 'last'], true, adapter);
  const cards = drawDeck(deck, 10, adapter).sort();
  assert.deepEqual(cards, ['last', 'resolved', 'resolved']);
  assert.deepEqual(drawDeck(deck, 1, adapter), []);
  const custom = makeDeck(['{x}', '::2::literal'], false, adapter);
  assert.deepEqual(drawDeck(custom, 10, adapter).sort(), ['literal', 'literal', '{x}'].sort());
});

test('deck storage keys isolate groups, private users, games and platforms', () => {
  const group = { platform: 'test', guildId: '1', channelId: '2', isDirect: false };
  assert.notEqual(deckScope(group as unknown as Session), deckScope({ ...group, isDirect: true, userId: '1' } as unknown as Session));
  assert.notEqual(deckScope(group as unknown as Session), deckScope({ ...group, platform: 'other' } as unknown as Session));
  assert.notEqual(gameDeckScope('test', 42), gameDeckScope('test', 43));
  assert.notEqual(gameDeckScope('test', 42), gameDeckScope('other', 42));
});

test('concurrent transactions retain both mutations', async () => {
  let data: string | undefined;
  const database = {
    async get() { return data ? [{ data }] : []; },
    async set(_table: string, _query: unknown, value: { data: string }) { data = value.data; },
    async create(_table: string, value: { data: string }) { data = value.data; }
  };
  const service = new DeckService({ database } as unknown as Context);
  await Promise.all(['a', 'b'].map((name) => service.transact('scope', async (decks) => {
    await Promise.resolve();
    decks[name] = makeDeck([name], false, adapter);
    return { result: null, changed: true };
  })));
  assert.deepEqual(Object.keys(JSON.parse(data!)).sort(), ['a', 'b']);
});
