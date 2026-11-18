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

test('deck scopes distinguish platforms, groups and private users', () => {
  const group = { platform: 'test', guildId: '1', channelId: '2', isDirect: false };
  assert.notEqual(deckScope(group as unknown as Session), deckScope({ ...group, isDirect: true, userId: '1' } as unknown as Session));
  assert.notEqual(deckScope(group as unknown as Session), deckScope({ ...group, platform: 'other' } as unknown as Session));
});

test('linked rooms share game decks while other games and platforms stay isolated', async () => {
  const rows = new Map<string, string>();
  const database = {
    async get(_table: string, query: { scope: string }) { const data = rows.get(query.scope); return data ? [{ data }] : []; },
    async set(_table: string, query: { scope: string }, value: { data: string }) { rows.set(query.scope, value.data); },
    async create(_table: string, value: { scope: string; data: string }) { rows.set(value.scope, value.data); }
  };
  const service = new DeckService({ database } as unknown as Context);
  const firstRoom = gameDeckScope('test', 42);
  const linkedRoom = gameDeckScope('test', 42);
  await service.transact(firstRoom, async (decks) => {
    decks.shared = makeDeck(['one'], false, adapter);
    return { result: null, changed: true };
  });
  const read = (scope: string) => service.transact(scope, async (decks) => ({ result: Object.keys(decks), changed: false }));
  assert.deepEqual(await read(linkedRoom), ['shared']);
  assert.deepEqual(await read(gameDeckScope('test', 43)), []);
  assert.deepEqual(await read(gameDeckScope('other', 42)), []);
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
