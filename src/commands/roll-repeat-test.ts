import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeRollRepeat } from './roll';

test('dice repeat counts are rolled once and preserve the following reason', () => {
  const calls: string[] = [];
  const roll = (expression: string) => {
    calls.push(expression);
    return { total: 1, errorCode: 0, errorMsg: '' };
  };
  assert.deepEqual(normalizeRollRepeat('1d1# 采样', 20, 100, 1000, roll), { command: '1# 采样' });
  assert.deepEqual(calls, ['1d1']);
  assert.deepEqual(normalizeRollRepeat('20', 20, 100, 1000, roll), { command: '20' });
  assert.deepEqual(calls, ['1d1']);
  assert.match(normalizeRollRepeat('1d1001#', 20, 100, 1000, roll).error!, /面数/);
  assert.match(normalizeRollRepeat('101d1#', 20, 100, 1000, roll).error!, /数量/);
  assert.match(normalizeRollRepeat('1d1#', 20, 100, 1000, () => ({ total: 11, errorCode: 0, errorMsg: '' })).error!, /轮数/);
});
