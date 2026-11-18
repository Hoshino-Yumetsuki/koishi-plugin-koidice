import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { Config } from '../../config';
import type { DiceAdapter } from '../../wasm';
import { logger } from '../../index';
import { CharacterService } from '../../services/character-service';
import { getCOCRule } from '../settings';
import { GameSessionService } from '../../services/game-session-service';
import { recordDiceStatistics } from '../../services/character/card-stats';
import { getUserNickname } from '../nickname';

/**
 * 理智检定命令 .sc
 * 核心逻辑在 wasm/src/features/insanity.cpp 的 sanityCheck 函数中实现
 * TypeScript 层负责参数解析、人物卡交互和消息格式化
 *
 * 用法：.sc [成功损失]/[失败损失] ([当前san值]) ([原因])
 * 示例：
 * .sc 0/1d6 - 从人物卡获取SAN值
 * .sc 0/1d6 70 - 指定当前SAN值为70
 * .sc 1d10/1d100 直面外神 - 带原因
 */
export function registerSanityCheckCommand(
  register: RegisterCommand,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('sc [...args:text]', '理智检定')
    .usage('用法: .sc [成功损失]/[失败损失] ([当前san值]) ([原因])')
    .example('.sc 0/1d6 - 从人物卡获取SAN值')
    .example('.sc 0/1d6 70 - 指定当前SAN值为70')
    .example('.sc 1d10/1d100 直面外神 - 带原因')
    .action(async ({ session }, ...rawArgs) => {
      const args = rawArgs.join(' ').trim().split(/\s+/);
      if (!session) {
        return '无法获取会话信息';
      }
      const [sanCost] = args;
      if (!sanCost) {
        return '请指定损失表达式\n用法: .sc [成功损失]/[失败损失] ([当前san值]) ([原因])';
      }
      try {
        // 验证损失表达式格式
        if (!sanCost.includes('/')) {
          return '损失表达式格式错误\n格式: 成功损失/失败损失 (如: 0/1d6)';
        }

        const lossParts = sanCost.split('/');
        if (lossParts.length !== 2) {
          return '损失表达式格式错误\n格式: 成功损失/失败损失 (如: 0/1d6)';
        }

        const [successLoss, failureLoss] = lossParts.map((part) => part.trim());
        if (successLoss === undefined || failureLoss === undefined) {
          return '损失表达式格式错误\n格式: 成功损失/失败损失 (如: 0/1d6)';
        }

        // 验证损失表达式字符（参考 DiceEvent.cpp 3871-3883行）
        const validChars = /^[0-9dD+-]+$/;
        if (!validChars.test(successLoss) || !validChars.test(failureLoss)) {
          return '损失表达式包含无效字符\n只能包含数字、d、+、-';
        }
        for (const loss of [successLoss, failureLoss]) {
          const checked = diceAdapter.roll(loss, 100);
          if (checked.errorCode !== 0) return `损失表达式错误: ${checked.errorMsg}`;
        }

        // 解析当前SAN值和原因
        let currentSan: number | undefined;
        let reason = '';

        const secondArg = args[1];
        if (secondArg !== undefined) {
          // 尝试解析第二个参数为数字
          const sanValue = /^\d+$/.test(secondArg) ? Number(secondArg) : NaN;
          if (!Number.isNaN(sanValue)) {
            currentSan = sanValue;
            // 剩余参数作为原因
            if (args.length > 2) {
              reason = args.slice(2).join(' ');
            }
          } else {
            // 第二个参数不是数字，所有剩余参数作为原因
            reason = args.slice(1).join(' ');
          }
        }

        // 如果没有指定SAN值，从人物卡获取（参考 DiceEvent.cpp 3859-3867行）
        let shouldUpdateCard = false;
        if (currentSan === undefined) {
          const value = await characterService.getAttribute(session, '理智');
          if (value === null) {
            return '未设定SAN值，请指定SAN值或先使用 .st 理智 <值> 设置';
          }
          currentSan = value;
          shouldUpdateCard = true;
        }

        // 执行理智检定
        const card = await characterService.getActiveCard(session);
        const rule = await getCOCRule(ctx, session);
        const validation = diceAdapter.sanityCheck(currentSan, successLoss, failureLoss, rule);
        if (validation.errorCode !== 0) return `理智检定失败: ${validation.errorMsg}`;
        const roulette = await new GameSessionService(ctx).drawRoulette(session, 100, diceAdapter);
        const result = roulette === undefined ? validation : diceAdapter.sanityCheck(currentSan, successLoss, failureLoss, rule, roulette);

        if (result.errorCode !== 0) {
          return `理智检定失败: ${result.errorMsg}`;
        }
        if (card) {
          const keys = ['fumble', 'failure', 'regularSuccess', 'hardSuccess', 'extremeSuccess', 'criticalSuccess'] as const;
          const key = keys[result.successLevel];
          await characterService.updateStats(session, card.cardName, key ? { totalRolls: 1, [key]: 1 } : { totalRolls: 1 });
          await recordDiceStatistics(ctx, session, card.cardName, card.id, 100, [result.rollValue], { rate: currentSan, result: result.rollValue });
        }

        // 更新人物卡
        if (shouldUpdateCard && result.sanLoss !== 0) {
          await characterService.setAttributes(session, null, {
            理智: result.newSan
          });
        }

        // 构建输出消息
        const successLevelText = ['大失败', '失败', '成功', '困难成功', '极难成功', '大成功'][
          result.successLevel
        ];

        const messageParts = [await getUserNickname(session, ctx)];
        if (reason) {
          messageParts.push(reason);
        }
        messageParts.push(`1D100=${result.rollValue}/${currentSan} ${successLevelText}`);
        messageParts.push(`理智损失: ${result.lossDetail}`);
        messageParts.push(`当前理智: ${currentSan} → ${result.newSan}`);

        return messageParts.join('\n');
      } catch (error) {
        logger.error('理智检定错误:', error);
        return '理智检定时发生错误';
      }
    });
}
