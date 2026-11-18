import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { Config } from '../../config';
import type { DiceAdapter } from '../../wasm';
import { logger } from '../../index';
import { CharacterService } from '../../services/character-service';
import { GameSessionService } from '../../services/game-session-service';
import { recordDiceStatistics } from '../../services/character/card-stats';

/**
 * 解析成长检定参数
 * 支持格式:
 * .en 技能名 - 从人物卡获取技能值
 * .en 技能名 技能值 - 指定技能值
 * .en 技能名 技能值 原因 - 带原因
 * .en 技能名 +1D3/1D10 原因 - Pulp规则特殊成长
 */
interface ParsedGrowthArgs {
  skillName: string;
  skillValue?: number;
  growthFormula?: string; // Pulp规则的成长公式，如 +1D3/1D10
  reason?: string;
}

function parseGrowthCommand(args: string[]): ParsedGrowthArgs | null {
  if (!args[0]) return null;
  const match = args[0].match(/^([^\d]+)(\d+)?$/);
  if (!match) return null;
  const result: ParsedGrowthArgs = { skillName: match[1] };
  let index = 1;
  if (match[2]) result.skillValue = Number(match[2]);
  else if (args[index] && /^\d+$/.test(args[index])) result.skillValue = Number(args[index++]);
  if (args[index] && /^[+-][\ddD+*()\-]+(?:\/[+-]?[\ddD+*()\-]+)?$/.test(args[index])) {
    result.growthFormula = args[index++];
  }
  result.reason = args.slice(index).join(' ');
  return result;
}

/**
 * 成长检定命令 .en
 * COC规则，用法：
 * .en [技能名称]([技能值]) - 已经.st时，可省略最后的参数,调用人物卡属性时，成长后的值会自动更新
 * .en 教育 60 教育增强 - 指定技能值和原因
 * .en 幸运 +1D3/1D10 幸运成长 - Pulp规则中的幸运成长
 */
export function registerGrowthCommand(
  register: RegisterCommand,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('en [...args:text]', '成长检定')
    .usage('用法: .en [技能名称]([技能值]) [原因]')
    .example('.en 教育 - 从人物卡获取教育值进行成长检定')
    .example('.en 教育 60 - 对教育60进行成长检定')
    .example('.en 教育 60 教育增强 - 带原因的成长检定')
    .example('.en 幸运 +1D3/1D10 幸运成长 - Pulp规则的特殊成长')
    .action(async ({ session }, ...rawArgs) => {
      const args = rawArgs.join(' ').trim().split(/\s+/);
      if (!session) {
        return '无法获取会话信息';
      }
      const parsed = parseGrowthCommand(args);
      if (!parsed) {
        return '请指定技能名称\n用法: .en [技能名称]([技能值]) [原因]';
      }

      try {
        // 确定最终的技能值
        let currentValue = parsed.skillValue;
        let shouldUpdateCard = false;

        // 如果没有指定技能值，从人物卡获取
        if (currentValue === undefined) {
          const value = await characterService.getAttribute(session, parsed.skillName);
          if (value === null) {
            return `未找到技能 ${parsed.skillName}，请指定技能值或先使用 .st ${parsed.skillName} <值> 设置`;
          }
          currentValue = value;
          shouldUpdateCard = true;
        }


        // 标准成长检定：掷1D100，大于当前值则成长1D10
        const roulette = await new GameSessionService(ctx).drawRoulette(session, 100, diceAdapter);
        const checkRoll = roulette === undefined ? diceAdapter.roll('1d100', 100) : { total: roulette, detail: `1D100=${roulette}`, errorCode: 0, errorMsg: '' };
        if (checkRoll.errorCode !== 0) {
          return `检定掷骰失败: ${checkRoll.errorMsg}`;
        }
        const card = await characterService.getActiveCard(session);
        if (card) {
          await characterService.updateStats(session, card.cardName, { totalRolls: 1 });
          await recordDiceStatistics(ctx, session, card.cardName, card.id, 100, [checkRoll.total]);
        }

        let newValue = currentValue;
        let growthAmount = 0;
        let growthDetail = '';

        const succeeded = checkRoll.total > currentValue || checkRoll.total > 95;
        const formulas = parsed.growthFormula?.split('/') ?? ['1d10'];
        const formula = succeeded ? formulas[formulas.length - 1] : formulas.length > 1 ? formulas[0] : undefined;
        if (formula) {
          const growthRoll = diceAdapter.roll(formula, 100);
          if (growthRoll.errorCode !== 0) {
            return `成长掷骰失败: ${growthRoll.errorMsg}`;
          }

          growthAmount = growthRoll.total;
          newValue = currentValue + growthAmount;
          growthDetail = growthRoll.detail;

          // 更新人物卡
          if (shouldUpdateCard) {
            await characterService.setAttributes(session, null, {
              [parsed.skillName]: newValue
            });
          }
        }

        // 构建输出消息
        const parts = [session.username];
        if (parsed.reason) {
          parts.push(parsed.reason);
        }

        if (formula) {
          parts.push(
            `${parsed.skillName} ${checkRoll.detail}/${currentValue} 成长${succeeded ? '成功' : '失败'} ${growthDetail} → ${newValue}`
          );
        } else {
          parts.push(`${parsed.skillName} ${checkRoll.detail}/${currentValue} 成长失败`);
        }

        return parts.join(' ');
      } catch (error) {
        logger.error('成长检定错误:', error);
        return '成长检定时发生错误';
      }
    });
}
