import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { rollWOD } from './wod';

test('WOD explosions, target, modifiers and overflow', () => {
  const dice = [10, 7, 8, 2];
  assert.equal(rollWOD('2a8+1', 7, 10, () => dice.shift()!, true), '2a8+1 = {10,7}+{8}+{2}+1 = 4');
  assert.equal(rollWOD('1a11', 8, 1, () => 10, false), '1a11 = 1');
  assert.throws(() => rollWOD('1a10', 8, 2, () => 10, false), /超过限制/);
});
