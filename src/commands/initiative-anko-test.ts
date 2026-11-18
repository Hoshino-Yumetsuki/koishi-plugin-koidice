import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { registerAnkoCommands } from './anko';
import { registerInitiativeCommands } from './initiative';

test('anko and initiative persist by game and isolate fallback rooms and bots', async () => {
  const tables = new Map<string, Record<string, unknown>[]>();
  tables.set('koidice_game_session', [{ id: 1, platform: 'test', areas: JSON.stringify([JSON.stringify(['bot', 'channel', 'a']), JSON.stringify(['bot', 'channel', 'b'])]) }]);
  const database = {
    async get(table: string, query: Record<string, unknown>) {
      return (tables.get(table) || []).filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).map((row) => structuredClone(row));
    },
    async create(table: string, row: Record<string, unknown>) {
      const rows = tables.get(table) || []; tables.set(table, rows); rows.push(structuredClone(row)); return row;
    },
    async set(table: string, query: Record<string, unknown>, patch: Record<string, unknown>) {
      for (const row of tables.get(table) || []) if (Object.entries(query).every(([key, value]) => row[key] === value)) Object.assign(row, structuredClone(patch));
    },
    async remove(table: string, query: Record<string, unknown>) {
      tables.set(table, (tables.get(table) || []).filter((row) => !Object.entries(query).every(([key, value]) => row[key] === value)));
    }
  };
  type Handler = (context: { session: Session }, ...args: string[]) => Promise<string>;
  const handlers = new Map<string, Handler>();
  interface CommandStub { usage(): CommandStub; alias(): CommandStub; action(handler: Handler): CommandStub; subcommand(definition: string): CommandStub }
  const makeCommand = (name: string): CommandStub => ({
    usage() { return this; }, alias() { return this; },
    action(handler: Handler) { handlers.set(name, handler); return this; },
    subcommand(definition: string) { return makeCommand(name + definition.split(' ')[0]); }
  });
  const register = ((definition: string) => makeCommand(definition.split(' ')[0])) as unknown as RegisterCommand;
  const ctx = { database, model: { extend() {} } } as unknown as Context;
  const lists = new Map<string, Record<string, number>>();
  const adapter = {
    clearInitiative(key: string) { return lists.delete(key); },
    deserializeInitiative(key: string, data: string) { lists.set(key, JSON.parse(data)); return true; },
    serializeInitiative(key: string) { return JSON.stringify(lists.get(key) || {}); },
    getInitiativeCount(key: string) { return Object.keys(lists.get(key) || {}).length; },
    getInitiativeList(key: string) { return JSON.stringify(lists.get(key)); },
    addInitiative(key: string, name: string, value: number) { const list = lists.get(key) || {}; list[name] = value; lists.set(key, list); return true; },
    removeInitiative(key: string, name: string) { const list = lists.get(key); if (!list || !(name in list)) return false; delete list[name]; return true; },
    roll(expression: string) { return { errorCode: 0, total: /^\d+$/.test(expression) ? Number(expression) : 10, detail: expression }; }
  } as unknown as DiceAdapter;
  registerAnkoCommands(register, ctx, {} as Config);
  registerInitiativeCommands(register, ctx, {} as Config, adapter);
  const session = (channelId: string, selfId = 'bot') => ({ platform: 'test', channelId, selfId, userId: 'u', username: 'U' }) as Session;
  const call = (name: string, who: Session, ...args: string[]) => handlers.get(name)!({ session: who }, ...args);
  await call('ak', session('a'), '#fork+red|blue');
  assert.match(await call('ak', session('b'), 'show'), /red/);
  assert.match(await call('ak', session('a'), '-1x'), /无效/);
  assert.match(await call('ak', session('c'), 'show'), /没有/);
  await call('ak', session('c'), '#other');
  assert.match(await call('ak', session('c', 'other'), 'show'), /没有/);
  assert.match(await call('ak', session('b'), '='), /red|blue/);
  assert.match(await call('ak', session('a'), 'show'), /没有/);
  await call('ri', session('a'), '+5 3#wolf');
  assert.match(await call('init.list', session('b')), /wolf3/);
  await call('ri', session('a'), '80 Boss');
  assert.match(await call('init.list', session('b')), /"Boss":80/);
  await call('ri', session('a'), '-1 Some');
  assert.match(await call('init.list', session('b')), /"Some":10/);
  assert.match(await call('init', session('c')), /没有/);
  await call('init.clr', session('b'));
  assert.match(await call('init', session('a')), /没有/);
  assert.match(await call('ri', session('a'), '+5 11#wolf'), /1-10/);
});
