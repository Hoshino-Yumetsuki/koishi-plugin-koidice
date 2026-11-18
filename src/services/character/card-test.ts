import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Context, Session } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import createDiceModule from '../../../lib/dice.js';
import { parseStCommand, parseAttributeList } from '../../commands/character/parser';
import { createCard, getActiveCard, setAttributes, getExpression, copyCard, mutateAttributes } from './card-operations';
import { registerStSetCommand } from '../../commands/character/st-set';
import type { RegisterCommand } from '../../command-scope';
import type { Config } from '../../config';
import { bindCard } from './card-binding';
import { updateStats, getStats } from './card-stats';

const native = createDiceModule();

test('parses compact assignments, aliases, card names and expressions', async () => {
  const adapter = await native;
  assert.deepEqual(parseStCommand('卡特::san+1D6', adapter).operations[0], { attr: '理智', op: 'add', value: '1D6' });
  assert.deepEqual(parseStCommand('&沙漠之鹰=1D10+1D6+3', adapter).operations[0], { attr: '沙漠之鹰', op: 'set', value: '1D10+1D6+3', expression: true });
  assert.deepEqual(parseAttributeList('灵感', adapter).attributes, ['智力']);
});

test('bindings and expressions are scoped and copying replaces existing attributes', async () => {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {};
  let id = 0;
  const matches = (row: Row, query: Row) => Object.entries(query).every(([key, value]) => row[key] === value);
  const db = {
    async get(table: string, query: Row) { return (tables[table] ?? []).filter(row => matches(row, query)); },
    async create(table: string, data: Row) { const row = { ...data, id: ++id }; (tables[table] ??= []).push(row); return row; },
    async set(table: string, query: Row, values: Row) { for (const row of tables[table] ?? []) if (matches(row, query)) Object.assign(row, values); },
    async remove(table: string, query: Row) { tables[table] = (tables[table] ?? []).filter(row => !matches(row, query)); }
  };
  const ctx = { database: db } as unknown as Context;
  const dm = { userId: 'u', platform: 'p' } as Session;
  const group = { ...dm, guildId: 'g' } as Session;
  await createCard(ctx, dm, 'default', 'COC7', { 力量: 10 });
  await createCard(ctx, dm, 'Alice', 'COC7', { 力量: 50 });
  await bindCard(ctx, group, 'Alice');
  await setAttributes(ctx, group, null, { 武器: '1D6+1' });
  assert.equal(await getExpression(ctx, group, '武器'), '1D6+1');
  assert.equal(await getExpression(ctx, dm, '武器'), null);
  await copyCard(ctx, dm, 'Alice', 'default');
  assert.equal(JSON.parse((await getActiveCard(ctx, dm))!.attributes).力量, 50);
  await bindCard(ctx, group, null);
  assert.equal((await getActiveCard(ctx, group))!.cardName, 'default');
  await Promise.all(Array.from({ length: 10 }, () => updateStats(ctx, dm, 'default', { totalRolls: 1 })));
  assert.equal((await getStats(ctx, dm, 'default'))?.totalRolls, 10);
  await Promise.all(Array.from({ length: 10 }, () => mutateAttributes(ctx, dm, 'default', (attrs) => {
    attrs.力量 = Number(attrs.力量) + 1;
    return attrs;
  })));
  assert.equal(JSON.parse((await getActiveCard(ctx, dm))!.attributes).力量, 60);
  await assert.rejects(mutateAttributes(ctx, dm, 'default', (attrs) => {
    attrs.力量 = 999;
    throw new Error('invalid roll');
  }), /invalid roll/);
  assert.equal(JSON.parse((await getActiveCard(ctx, dm))!.attributes).力量, 60);
});

test('st rejects dice exceeding configured limits before rolling', async () => {
  let action: ((context: { session: Session }, ...args: string[]) => Promise<string>) | undefined;
  const command = {
    usage() { return this; }, example() { return this; },
    action(fn: typeof action) { action = fn; return this; }
  };
  const register = (() => command) as unknown as RegisterCommand;
  let rolls = 0;
  const dice = { normalizeAttributeName: (await native).normalizeAttributeName, roll() { rolls++; return { total: 1 }; } } as unknown as DiceAdapter;
  const database = { async get() { return []; } };
  const config = { maxAttributesPerCard: 50, maxDiceCount: 2, maxDiceFace: 20 } as Config;
  registerStSetCommand(register, { database } as unknown as Context, dice, config);
  assert.ok(action);
  const reply = await action({ session: { userId: 'u', platform: 'p' } as Session }, '力量+3D6');
  assert.match(reply, /超过限制/);
  assert.equal(rolls, 0);
});
