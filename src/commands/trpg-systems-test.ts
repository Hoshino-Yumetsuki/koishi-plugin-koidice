import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { rollTRPGSystem } from './trpg-systems';

function rolls(...values: number[]) {
  return (sides: number) => {
    const value = values.shift();
    assert.ok(value !== undefined && value >= 1 && value <= sides);
    return value;
  };
}

test('D20 advantage, modifiers and threshold', () => {
  assert.match(rollTRPGSystem('rdc', 'B+2 攀爬 15', rolls(4, 14)), /16，成功/);
  assert.match(rollTRPGSystem('rdc', 'P -1 10', rolls(3, 19)), /2，失败/);
});

test('Double Cross rerolls each critical die and uses character critical', () => {
  assert.match(rollTRPGSystem('rdx', '3', rolls(8, 10, 1, 9, 2, 4), { 暴击值: 8 }), /= 24$/);
  assert.match(rollTRPGSystem('rdx', '1c2', () => 10), /强制终止/);
  assert.throws(() => rollTRPGSystem('rdx', '1c1', rolls(1)));
});

test('Shadowrun hits and critical glitches, Betrayal zero-sided values', () => {
  assert.match(rollTRPGSystem('rsr', '3', rolls(1, 1, 2)), /命中0，严重失误/);
  assert.match(rollTRPGSystem('rbh', '3', rolls(1, 2, 3)), /\[0, 1, 2\] = 3/);
});

test('Nechronica attack locations and excess damage', () => {
  assert.match(rollTRPGSystem('rnc', '+3', rolls(8)), /攻击方选择，额外伤害1/);
  assert.match(rollTRPGSystem('rnc', '', rolls(6)), /防御方选择/);
  assert.match(rollTRPGSystem('rnc', '', rolls(1)), /大失败/);
});

test('Fiasco subtracts colour totals, including ties', () => {
  assert.match(rollTRPGSystem('rfc', 'b2w1', rolls(1, 2, 6)), /白\[1, 2\] 黑\[6\]，黑 3/);
  assert.match(rollTRPGSystem('rfc', 'w1b1', rolls(4, 4)), /平局 0/);
  assert.throws(() => rollTRPGSystem('rfc', 'b100w100', rolls()));
});

test('Wushu yin and yang use the specified or character trait threshold', () => {
  assert.match(rollTRPGSystem('rws', '2阴1阳取身手', rolls(2, 5, 3), { 身手: 3 }), /阴\[2, 5\]命中1；阳\[3\]命中1/);
  assert.match(rollTRPGSystem('rws', '2(取2)', rolls(2, 3)), /命中1/);
  assert.throws(() => rollTRPGSystem('rws', '1取不存在', rolls(1)));
});
