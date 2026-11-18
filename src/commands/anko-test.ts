import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import { registerAnkoCommands } from './anko';

test('anko choices persist by game and isolate fallback rooms and bots', async () => {
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
  registerAnkoCommands(register, ctx, {} as Config);
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
});
