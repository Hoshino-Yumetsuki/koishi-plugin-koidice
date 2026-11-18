import type { Context } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';
import { sendHidden } from './observer';
import { recordDiceStatistics } from '../services/character/card-stats';
import { getDefaultDice } from './settings';
import { CharacterService } from '../services/character-service';
import { GameSessionService } from '../services/game-session-service';
import { getUserNickname } from './nickname';

export function normalizeRollRepeat(raw: string, defaultDice: number, maxCount: number, maxFace: number, roll: (expression: string, faces: number) => { total: number; errorCode: number; errorMsg: string }): { command: string; error?: string } {
  const match = raw.match(/^\s*([\ddD+\-*/xX()]+)#(.*)$/);
  if (!match) return { command: raw };
  const countExpression = match[1];
  let diceCount = 0;
  for (const die of countExpression.matchAll(/(\d*)[dD](\d*)/g)) {
    diceCount += Number(die[1] || 1);
    if (Number(die[2] || defaultDice) > maxFace) return { command: raw, error: '骰子面数超过限制' };
  }
  if (diceCount > maxCount) return { command: raw, error: '骰子数量超过限制' };
  const count = roll(countExpression, defaultDice);
  if (count.errorCode !== 0) return { command: raw, error: count.errorMsg || '掷骰轮数表达式无效' };
  if (count.total < 1 || count.total > 10) return { command: raw, error: '掷骰轮数必须在1-10之间' };
  return { command: `${count.total}#${match[2]}` };
}

/**
 * 掷骰命令 .r / .rh / .rs
 * 支持功能:
 * - 基础掷骰: .r 1d100
 * - 多轮掷骰: .r 3#1d6 (掷3次)
 * - 暗骰: .rh 1d100
 * - 简化输出: .rs 1d10+1d6+3 (只显示结果)
 */
export function registerRollCommand(
  register: RegisterCommand,
  ctx: Context,
  config: Config,
  diceAdapter: DiceAdapter
) {
  // 注册 .r 命令（普通掷骰）
  register('r [...args:text]', '掷骰')
    .usage('用法: .r [掷骰表达式] [原因]')
    .example('.r 1d100 - 掷一个百面骰')
    .example('.r 3#1d6 伤害 - 掷3次d6')
    .example('.r 1d10+1d6+3 沙鹰伤害 - 复杂表达式')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, false, false, args);
    });

  // 注册 .rh 命令（暗骰）
  register('rh [...args:text]', '暗骰', 'h')
    .usage('用法: .rh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, true, false, args);
    });

  // 注册 .rs 命令（简化输出）
  register('rs [...args:text]', '掷骰（简化输出）')
    .usage('用法: .rs [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, false, true, args);
    });

  // 注册 .rsh 命令（暗骰+简化输出）
  register('rsh [...args:text]', '暗骰（简化输出）', 'hs')
    .usage('用法: .rsh [掷骰表达式] [原因]')
    .action(async ({ session }, ...args) => {
      return await handleRollCommand(session, ctx, diceAdapter, config, true, true, args);
    });
}

/**
 * 处理掷骰命令
 */
async function handleRollCommand(
  session: any,
  ctx: Context,
  diceAdapter: DiceAdapter,
  config: Config,
  isHidden: boolean,
  isSimple: boolean,
  args: string[]
): Promise<string> {
  if (!session) {
    return '无法获取会话信息';
  }

  try {
    const nickname = await getUserNickname(session, ctx);
    let rawCommand = args.join(' ');
    const match = rawCommand.match(/^(\d+#)?([^\s]+)(.*)$/);
    if (match) {
      const expression = await new CharacterService(ctx, diceAdapter).getExpression(session, match[2]);
      if (expression) rawCommand = `${match[1] || ''}${expression}${match[3]}`;
    }
    const defaultDice = await getDefaultDice(ctx, session, config, diceAdapter);
    const repeat = normalizeRollRepeat(rawCommand, defaultDice, config.maxDiceCount, config.maxDiceFace, (expression, faces) => diceAdapter.roll(expression, faces));
    if (repeat.error) return repeat.error;
    rawCommand = repeat.command;
    const parsed = rawCommand.trim().match(/^(?:(\d+)#)?([\d#dfpbkDFPBKxX+\-*/()\s]*)(.*)$/);
    const rounds = Number(parsed?.[1] || 1);
    let expression = parsed?.[2]?.trim() || '';
    if (/^\d+$/.test(expression)) expression = '';
    const terms = [...expression.matchAll(/(\d*)d?f|(\d*)d(\d*)(?:k\d*)?|[bp]\d*/gi)];
    let diceCount = 0;
    for (const term of terms) {
      const fudge = term[1] !== undefined;
      const die = term[2] !== undefined;
      const count = fudge ? Number(term[1] || 4) : die ? Number(term[2] || 1) : 1 + Number(term[0].slice(1) || 1);
      const face = fudge ? 3 : die ? Number(term[3] || defaultDice) : 100;
      if (face > config.maxDiceFace || count > config.maxDiceCount || (!die && !fudge && count > 10)) return '骰子数量或面数超过限制';
      diceCount += count;
    }
    if (!terms.length && !expression) {
      diceCount = 1;
      if (defaultDice > config.maxDiceFace) return '默认骰面数超过限制';
    }
    if (diceCount * rounds > config.maxDiceCount) return '骰子数量超过限制';
    isSimple = isSimple || !config.showDetail;
    const characterService = new CharacterService(ctx, diceAdapter);
    const card = await characterService.getActiveCard(session);

    const result = await new GameSessionService(ctx).roll(session, roulette =>
      diceAdapter.processTableRoll(rawCommand, isHidden, isSimple, defaultDice, roulette));

    if (!result.success) {
      return result.errorMsg || '掷骰失败';
    }
    if (card) {
      await characterService.updateStats(session, card.cardName, { totalRolls: result.results?.length ?? 0 });
      if (defaultDice <= 100 && (!expression || new RegExp(`^1?d${defaultDice}$`, 'i').test(expression))) {
        await recordDiceStatistics(ctx, session, card.cardName, card.id, defaultDice, (result.results || []).map(round => round.total));
      }
    }

    const parts = [nickname];
    if (result.reason) parts.push(result.reason);

    if (result.results && result.results.length > 0) {
      if (isSimple) {
        const totals = result.results.map((r: any) => r.total);
        parts.push(totals.length === 1 ? String(totals[0] ?? '') : `{ ${totals.join(', ')} }`);
      } else {
        const details = result.results.map((r: any, i: number) =>
          (result.rounds ?? 1) > 1 ? `#${i + 1} ${r.detail}` : r.detail
        );
        parts.push(details.join(' '));
      }
    }

    const message = parts.join(' ');
    if (!isHidden || session.isDirect || !session.guildId) return message;
    await sendHidden(ctx, session, message);
    return [nickname, '进行了暗骰', result.reason].filter(Boolean).join(' ');
  } catch (error) {
    logger.error('掷骰错误:', error);
    return '掷骰时发生错误';
  }
}
