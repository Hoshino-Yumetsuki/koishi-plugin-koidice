import type { Context } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { CharacterService } from '../services/character-service';

const help: Record<string, string> = {
  rdc: '用法: .rdc(B/P) (+/-加值) (理由) (成功阈值)',
  rdx: '用法: .rdx骰数c暴击值（暴击值默认读取人物卡，或为10）',
  rsr: '用法: .rsr骰数',
  rnc: '用法: .rnc (+/-修正值)',
  rfc: '用法: .rfc b白骰数w黑骰数',
  rbh: '用法: .rbh骰数',
  rws: '用法: .rws骰数取成功等级 或 武术X阴Y阳取S（成功等级默认2）',
};

/** The random source returns a uniformly distributed integer from 1 through sides. */
export function rollTRPGSystem(
  system: string, input: string, roll: (sides: number) => number,
  attributes: Record<string, number> = {}
): string {
  const text = input.trim();
  const number = (s: string, min: number, max: number, name: string) => {
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name}必须在${min}-${max}之间`);
    return n;
  };
  const pool = (count: number, sides: number) => Array.from({ length: count }, () => roll(sides));
  const count = (s: string) => number(s, 1, 100, '骰子数量');
  if (system === 'rdc') {
    if (!text) return help.rdc;
    const match = /^([bp])?\s*([+-]\s*\d+)?\s*(.*?)\s*$/i.exec(text)!;
    const mode = match[1]?.toLowerCase();
    const modifier = match[2] ? number(match[2].replace(/\s/g, ''), -100000, 100000, '加值') : 0;
    let reason = match[3];
    let target: number | undefined;
    const targetMatch = /(?:^|\s)(\d+)\s*$/.exec(reason);
    if (targetMatch) {
      target = number(targetMatch[1], 0, 100000, '成功阈值');
      reason = reason.slice(0, targetMatch.index).trim();
    }
    const dice = pool(mode ? 2 : 1, 20);
    const selected = mode === 'b' ? Math.max(...dice) : Math.min(...dice);
    const total = selected + modifier;
    return `D20检定${reason ? `（${reason}）` : ''}: [${dice.join(', ')}]${modifier >= 0 ? '+' : ''}${modifier} = ${total}${target === undefined ? '' : `，${total >= target ? '成功' : '失败'}（阈值${target}）`}`;
  }
  if (system === 'rdx') {
    const match = /^(\d+)(?:c(\d+))?$/i.exec(text.replace(/\s/g, ''));
    if (!match) return help.rdx;
    let diceCount = count(match[1]);
    const critical = number(match[2] ?? String(attributes['暴击值'] ?? 10), 2, 10, '暴击值');
    const rounds: number[][] = [];
    let total = 0;
    for (let round = 0; round <= 30; round++) {
      const dice = pool(diceCount, 10);
      rounds.push(dice);
      const hits = dice.filter((value) => value >= critical).length;
      if (!hits) { total += Math.max(...dice); break; }
      total += 10;
      if (round === 30) return `双重十字: ${rounds.map((d) => `[${d.join(', ')}]`).join(' → ')} = ${total}（重骰超过30次，强制终止）`;
      diceCount = hits;
    }
    return `双重十字: ${rounds.map((d) => `[${d.join(', ')}]`).join(' → ')} = ${total}`;
  }
  if (system === 'rsr' || system === 'rbh') {
    if (!/^\d+$/.test(text)) return help[system];
    const dice = pool(count(text), system === 'rsr' ? 6 : 3).map((n) => system === 'rbh' ? n - 1 : n);
    if (system === 'rbh') return `山屋惊魂: [${dice.join(', ')}] = ${dice.reduce((a, b) => a + b, 0)}`;
    const hits = dice.filter((n) => n >= 5).length;
    const glitch = dice.filter((n) => n === 1).length > dice.length / 2;
    return `暗影狂奔: [${dice.join(', ')}]，命中${hits}${glitch ? (hits ? '，失误' : '，严重失误') : ''}`;
  }
  if (system === 'rnc') {
    if (text && !/^[+-]\d+$/.test(text)) return help.rnc;
    const modifier = text ? number(text, -100000, 100000, '修正值') : 0;
    const die = roll(10);
    const value = die + modifier;
    const location = ['防御方选择', '脚（无脚则攻击方选择）', '躯干（无躯干则攻击方选择）', '手臂（无手臂则攻击方选择）', '头（无头则攻击方选择）', '攻击方选择'];
    const result = value <= 1 ? '大失败' : value < 6 ? '失败' : value >= 11 ? '大成功' : '成功';
    return `永夜后日谈攻击: ${die}${modifier >= 0 ? '+' : ''}${modifier} = ${value}，${result}${value >= 6 ? `，命中${location[Math.min(value - 6, 5)]}${value > 10 ? `，额外伤害${value - 10}` : ''}` : ''}`;
  }
  if (system === 'rfc') {
    const match = /^(?:b(\d+)w(\d+)|w(\d+)b(\d+))$/i.exec(text.replace(/\s/g, ''));
    if (!match) return help.rfc;
    const white = number(match[1] ?? match[4], 0, 100, '白骰数量');
    const black = number(match[2] ?? match[3], 0, 100, '黑骰数量');
    if (!black && !white || black + white > 100) throw new Error('骰子总数必须在1-100之间');
    const w = pool(white, 6), b = pool(black, 6);
    const diff = w.reduce((a, n) => a + n, 0) - b.reduce((a, n) => a + n, 0);
    return `祸不单行: 白[${w.join(', ')}] 黑[${b.join(', ')}]，${diff === 0 ? '平局 0' : `${diff > 0 ? '白' : '黑'} ${Math.abs(diff)}`}`;
  }
  if (system === 'rws') {
    const match = /^(?:(\d+)阴(\d+)阳|(\d+))(?:[（(]?取([^()（）]+)[）)]?)?$/i.exec(text.replace(/\s/g, ''));
    if (!match) return help.rws;
    const yin = match[1] === undefined ? 0 : number(match[1], 0, 100, '阴骰数量');
    const yang = match[2] === undefined ? 0 : number(match[2], 0, 100, '阳骰数量');
    const total = match[3] === undefined ? yin + yang : count(match[3]);
    if (total < 1 || total > 100) throw new Error('骰子总数必须在1-100之间');
    const trait = match[4];
    const threshold = number(trait === undefined ? '2' : /^\d+$/.test(trait) ? trait : String(attributes[trait] ?? ''), 1, 6, '成功等级');
    const describe = (label: string, dice: number[]) => `${label}[${dice.join(', ')}]命中${dice.filter((n) => n <= threshold).length}`;
    return `武术（成功等级${threshold}）: ${match[3] !== undefined ? describe('骰', pool(total, 6)) : `${describe('阴', pool(yin, 6))}；${describe('阳', pool(yang, 6))}`}`;
  }
  throw new Error('未知规则');
}

export function registerTRPGSystemCommands(register: RegisterCommand, ctx: Context, _config: Config, diceAdapter: DiceAdapter) {
  const characters = new CharacterService(ctx, diceAdapter);
  for (const system of ['rdc', 'rdx', 'rsr', 'rnc', 'rfc', 'rbh', 'rws']) {
    register(`${system} [expression:text]`, help[system], ...(system === 'rws' ? ['武术'] : []))
      .action(async ({ session }, expression) => {
        if (!session?.userId) return '无法获取用户信息';
        try {
          const attributes = system === 'rdx' || system === 'rws'
            ? await characters.getAttributes(session, null) ?? {} : {};
          return rollTRPGSystem(system, expression ?? '', (sides) => {
            const result = diceAdapter.roll(`1d${sides}`, sides);
            if (result.errorCode !== 0) throw new Error(result.errorMsg || '掷骰失败');
            return result.total;
          }, attributes);
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      });
  }
}
