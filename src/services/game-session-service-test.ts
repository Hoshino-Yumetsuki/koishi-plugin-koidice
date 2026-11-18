import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Context, Session } from 'koishi';
import { GameSessionService } from './game-session-service';
import createDiceModule from '../../lib/dice.js';

test('roulette draws without replacement, resets, and remains isolated by area', async () => {
  const adapter = await createDiceModule();
  const rows: Record<string, unknown>[] = [];
  const database = {
    async get(_table: string, query: Record<string, unknown>) {
      return rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)).map((row) => ({ ...row }));
    },
    async create(_table: string, row: Record<string, unknown>) {
      const created = { ...row, id: rows.length + 1 };
      rows.push(created);
      return { ...created };
    },
    async set(_table: string, query: Record<string, unknown>, patch: Record<string, unknown>) {
      for (const row of rows) if (Object.entries(query).every(([key, value]) => row[key] === value)) Object.assign(row, patch);
    }
  };
  const games = new GameSessionService({ database } as unknown as Context);
  const first = { platform: 'test', selfId: 'bot', isDirect: false, channelId: 'one', userId: 'gm' } as Session;
  const second = { platform: 'test', selfId: 'bot', isDirect: false, channelId: 'two', userId: 'gm' } as Session;
  const game = await games.createSession(first);
  const other = await games.createSession(second);
  assert.notEqual(game.name, other.name);
  await games.addGM(game.id, 'gm');
  await games.setRoulette(game.id, 3, { pool: [1, 2, 3], sizRes: 3, face: 3, copy: 1 });
  assert.equal(await games.drawRoulette(second, 3, adapter), undefined);
  assert.equal(await games.getSession({ ...first, selfId: 'other-bot' } as Session), null);
  assert.equal(await games.getSession({ ...first, isDirect: true } as Session), null);
  assert.equal(await games.drawRoulette({ ...first, userId: 'outsider' } as Session, 3, adapter), undefined);
  const draws = await games.drawRouletteBatch(first, [3, 3, 3, 7], adapter);
  assert.equal(draws.pop(), undefined);
  assert.deepEqual(draws.sort(), [1, 2, 3]);
  const afterDraw = await games.getRoulette(game.id, 3);
  assert.equal(afterDraw.sizRes, 0);
  assert.deepEqual(afterDraw.pool.slice().sort(), [1, 2, 3]);
  const next = await Promise.all([games.drawRoulette(first, 3, adapter), games.drawRoulette(first, 3, adapter)]);
  assert.equal(new Set(next).size, 2);
  assert.equal((await games.getRoulette(game.id, 3)).sizRes, 1);
  await games.resetRoulette(game.id);
  const state = await games.getRoulette(game.id, 3);
  assert.equal(state.sizRes, 3);
});
