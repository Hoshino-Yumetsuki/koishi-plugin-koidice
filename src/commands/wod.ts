import type { Context } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { CharacterService } from '../services/character-service';
import { GameSessionService } from '../services/game-session-service';
import { getObservers } from './observer';
import { getUserNickname } from './nickname';

// DicePool treats the first number as a pool, and later bare numbers as modifiers.
export function rollWOD(expression: string, target: number, maxDice: number, roll: () => number, detailed: boolean): string {
  const match = /^(-?\d+)(?:[aAdD](\d*))?((?:[+-]\d+(?:[aAdD]\d*)?)*)$/.exec(expression);
  if (!match) throw new Error('骰池表达式格式错误');
  let count = Number(match[1]);
  let again = match[2] === undefined || match[2] === '' ? 10 : Number(match[2]);
  let extra = 0;
  for (const term of match[3].matchAll(/([+-])(\d+)(?:[aAdD](\d*))?/g)) {
    const number = Number(term[2]) * (term[1] === '-' ? -1 : 1);
    if (term[3] === undefined) extra += number;
    else {
      count += number;
      if (term[3]) again = Number(term[3]);
    }
  }
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(extra) || !count || Math.abs(count) > maxDice)
    throw new Error(`骰子数量必须在 1-${maxDice} 之间`);
  if (again < 5 || again > 11) throw new Error('加骰线必须在5-11之间');
  let pending = Math.abs(count);
  let rolled = 0;
  let successes = extra;
  const generations: number[][] = [];
  while (pending) {
    if (rolled + pending > maxDice) throw new Error(`加骰后骰子数量超过限制 (${maxDice})`);
    const values: number[] = [];
    let next = 0;
    for (let i = 0; i < pending; i++) {
      const value = roll();
      values.push(value);
      if (value >= target) successes++;
      if (value >= again) next++;
    }
    rolled += pending;
    generations.push(values);
    pending = next;
  }
  const detail = detailed ? ` = ${generations.map((values) => `{${values.join(',')}}`).join('+')}${extra > 0 ? `+${extra}` : extra < 0 ? extra : ''}` : '';
  return `${expression}${detail} = ${successes}`;
}

export function registerWODCommands(register: RegisterCommand, ctx: Context, config: Config, diceAdapter: DiceAdapter) {
  const characters = new CharacterService(ctx, diceAdapter);
  const games = new GameSessionService(ctx);
  for (const [name, detailed, hidden] of [['w', false, false], ['ww', true, false], ['wh', false, true], ['wwh', true, true]] as const) {
    register(`${name} [...args:text]`, 'WOD骰池')
      .usage(`用法: .${name} [次数#]骰子数a加骰线 [原因]`)
      .action(async ({ session }, ...args) => {
        if (!session) return '无法获取会话信息';
        try {
          if (config.maxDiceFace < 10) throw new Error('骰子面数超过限制');
          const raw = args.join(' ').trim();
          if (!raw) return `用法: .${name} [次数#]骰子数a加骰线 [原因]`;
          const [input, ...reasonParts] = raw.split(/\s+/);
          const attributes = await characters.getAttributes(session, null) || {};
          let expression = input;
          for (const key of Object.keys(attributes).sort((a, b) => b.length - a.length)) {
            const value: unknown = attributes[key];
            if (typeof value === 'number' || typeof value === 'string') expression = expression.split(key).join(String(value));
          }
          const attachedReason = /^([\daA+\-#dD]*\d|[\daA+\-#dD]*a)([^\daA+\-#].*)$/.exec(expression);
          if (attachedReason) {
            expression = attachedReason[1];
            reasonParts.unshift(attachedReason[2]);
          }
          const repeat = /^(.*?)#(.*)$/.exec(expression);
          let rounds = 1;
          if (repeat) {
            const times = repeat[1] || '1';
            for (const die of times.matchAll(/(\d*)d(\d*)/gi)) {
              if (Number(die[1] || 1) > config.maxDiceCount || Number(die[2] || 10) > config.maxDiceFace)
                throw new Error('掷骰次数表达式超过骰子限制');
            }
            const result = diceAdapter.roll(times, 10);
            if (result.errorCode) throw new Error(result.errorMsg);
            rounds = result.total;
            if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('掷骰次数必须在1-10之间');
            expression = repeat[2];
          }
          const game = await games.getSession(session);
          const gameConfig = game ? JSON.parse(game.config || '{}') : {};
          const target = gameConfig.__DPTarget ?? attributes.__DPTarget ?? 8;
          if (typeof target !== 'number' || !Number.isFinite(target)) throw new Error('骰池成功线无效');
          const results: string[] = [];
          for (let i = 0; i < rounds; i++) {
            results.push(rollWOD(expression, target, config.maxDiceCount, () => {
              const result = diceAdapter.roll('1d10', 10);
              if (result.errorCode) throw new Error(result.errorMsg);
              return result.total;
            }, detailed && config.showDetail));
          }
          const reason = reasonParts.join(' ');
          const nickname = await getUserNickname(session, ctx);
          const message = [nickname, reason, ...results].filter(Boolean).join(' ');
          if (hidden && !session.isDirect && session.guildId) {
            await session.bot.sendPrivateMessage(session.userId, message);
            for (const observer of await getObservers(ctx, session)) {
              if (observer !== session.userId) await session.bot.sendPrivateMessage(observer, message);
            }
            return [nickname, '进行了暗骰', reason].filter(Boolean).join(' ');
          }
          return message;
        } catch (error) {
          return `骰池失败: ${error instanceof Error ? error.message : String(error)}`;
        }
      });
  }
}
