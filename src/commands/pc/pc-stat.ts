/**
 * .pc stat 查看角色掷骰统计命令
 */
import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

/**
 * 注册 .pc stat 命令
 */
export function registerPcStatCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('pc.stat [cardName:text]', '查看角色掷骰统计')
    .usage('.pc.stat ([卡名])')
    .example('.pc.stat')
    .example('.pc.stat Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        let targetName = '';

        if (cardName?.trim()) {
          targetName = cardName.trim();
          const card = await characterService.getCard(session, targetName);
          if (!card) {
            return `人物卡 ${targetName} 不存在喵~`;
          }
        } else {
          const boundCard = await characterService.getBoundCard(session);
          if (!boundCard) {
            return '当前没有绑定人物卡，请使用 .pc.tag 绑定或指定卡名喵~';
          }
          targetName = boundCard.cardName;
        }

        const card = await characterService.getCard(session, targetName);
        const stats = await characterService.getStats(session, targetName);
        const attrs = JSON.parse(stats?.nativeCounters || '{}') as Record<string, number>;
        const settings = await ctx.database.get('koidice_user_data', {
          userId: `${session.platform}:${session.userId}`, dataKey: `defaultDice:${card!.id}`
        });
        const face = settings.length ? Number(settings[0].dataValue) : 100;
        const count = Number(attrs[`__StatD${face}Cnt`]) || 0;
        const checks = Number(attrs.__StatRcCnt) || 0;
        const native: string[] = [];
        if (face <= 100 && count > 0) {
          const mean = (Number(attrs[`__StatD${face}Sum`]) || 0) / count;
          const variance = Math.max(0, (Number(attrs[`__StatD${face}SqrSum`]) || 0) / count - mean * mean);
          native.push(`D${face}统计次数: ${count}`, `均值: ${mean.toFixed(2)} [期望 ${(face + 1) / 2}]`);
          if (variance > 0) native.push(`标准差: ${Math.sqrt(variance).toFixed(2)} [期望 ${Math.sqrt((face * face - 1) / 12).toFixed(2)}]`);
        }
        if (checks > 0) {
          const success = Number(attrs.__StatRcSumSuc) || 0;
          native.push(`检定成功率: ${success}/${checks}=${(success / checks * 100).toFixed(2)}% [期望 ${((Number(attrs.__StatRcSumRate) || 0) / checks).toFixed(2)}%]`);
          const low = Number(attrs.__StatRcCnt5) || 0, high = Number(attrs.__StatRcCnt96) || 0;
          native.push(`5- | 96+ 出现率: ${(low / checks * 100).toFixed(2)}%(${low}) | ${(high / checks * 100).toFixed(2)}%(${high})`);
          if (attrs.__StatRcCnt1 || attrs.__StatRcCnt100) native.push(`1 | 100 出现数: ${attrs.__StatRcCnt1 || 0} | ${attrs.__StatRcCnt100 || 0}`);
        }
        if (!stats || stats.totalRolls === 0) {
          return native.length ? `人物卡 ${targetName} 的掷骰统计:\n${native.join('\n')}` : `人物卡 ${targetName} 还没有掷骰记录喵~`;
        }

        const successRate =
          stats.totalRolls > 0
            ? (
                ((stats.criticalSuccess +
                  stats.extremeSuccess +
                  stats.hardSuccess +
                  stats.regularSuccess) /
                  stats.totalRolls) *
                100
              ).toFixed(1)
            : '0.0';

        return `人物卡 ${targetName} 的掷骰统计:
总掷骰次数: ${stats.totalRolls}
大成功: ${stats.criticalSuccess} (${((stats.criticalSuccess / stats.totalRolls) * 100).toFixed(1)}%)
极难成功: ${stats.extremeSuccess} (${((stats.extremeSuccess / stats.totalRolls) * 100).toFixed(1)}%)
困难成功: ${stats.hardSuccess} (${((stats.hardSuccess / stats.totalRolls) * 100).toFixed(1)}%)
普通成功: ${stats.regularSuccess} (${((stats.regularSuccess / stats.totalRolls) * 100).toFixed(1)}%)
失败: ${stats.failure} (${((stats.failure / stats.totalRolls) * 100).toFixed(1)}%)
大失败: ${stats.fumble} (${((stats.fumble / stats.totalRolls) * 100).toFixed(1)}%)
总成功率: ${successRate}%${native.length ? `\n${native.join('\n')}` : ''}`;
      } catch (error) {
        logger.error('查看统计错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '查看统计时发生错误';
      }
    });
}
