import type { Context, Session } from 'koishi';
import type { CharacterStats } from '../../database';
import { getUserKey, getCard, getActiveCard, serializeCharacterUpdate } from './card-operations';

export async function recordDiceStatistics(
  ctx: Context, session: Session, cardName: string, cardId: number, face: number, values: number[],
  check?: { rate: number; result: number }
): Promise<void> {
  await serializeCharacterUpdate(ctx, session, async () => {
    const card = await getCard(ctx, session, cardName);
    if (!card || card.id !== cardId) return;
    const { userId, platform } = getUserKey(session);
    const query = { userId, platform, cardName };
    const [existing] = await ctx.database.get('koidice_character_stats', query);
    const counters: Record<string, number> = JSON.parse(existing?.nativeCounters || '{}');
    const add = (key: string, value: number) => { counters[key] = (Number(counters[key]) || 0) + value; };
    if (Number.isInteger(face) && face > 0) {
      for (const value of values) {
        if (!Number.isInteger(value) || value <= 0 || value > face) continue;
        add(`__StatD${face}Cnt`, 1);
        add(`__StatD${face}Sum`, value);
        add(`__StatD${face}SqrSum`, value * value);
      }
    }
    if (check && check.rate > 0 && check.rate < 100 && check.result > 0 && check.result <= 100) {
      add('__StatRcCnt', 1);
      if (check.result <= check.rate) add('__StatRcSumSuc', 1);
      if (check.result === 1) add('__StatRcCnt1', 1);
      if (check.result <= 5) add('__StatRcCnt5', 1);
      if (check.result >= 96) add('__StatRcCnt96', 1);
      if (check.result === 100) add('__StatRcCnt100', 1);
      add('__StatRcSumRate', check.rate);
    }
    const nativeCounters = JSON.stringify(counters);
    const updatedAt = new Date();
    if (existing) await ctx.database.set('koidice_character_stats', query, { nativeCounters, updatedAt });
    else await ctx.database.create('koidice_character_stats', { ...query, nativeCounters, totalRolls: 0, criticalSuccess: 0, extremeSuccess: 0, hardSuccess: 0, regularSuccess: 0, failure: 0, fumble: 0, updatedAt });
  });
}

/**
 * 获取人物卡统计
 */
export async function getStats(
  ctx: Context,
  session: Session,
  cardName: string | null
): Promise<CharacterStats | null> {
  const { userId, platform } = getUserKey(session);

  // 确定目标卡
  const targetCard = cardName
    ? await getCard(ctx, session, cardName)
    : await getActiveCard(ctx, session);

  if (!targetCard) {
    return null;
  }

  const stats = await ctx.database.get('koidice_character_stats', {
    userId,
    platform,
    cardName: targetCard.cardName
  });

  return stats[0] || null;
}

/**
 * 更新人物卡统计
 */
export async function updateStats(
  ctx: Context,
  session: Session,
  cardName: string,
  statsUpdate: Partial<
    Pick<
      CharacterStats,
      | 'totalRolls'
      | 'criticalSuccess'
      | 'extremeSuccess'
      | 'hardSuccess'
      | 'regularSuccess'
      | 'failure'
      | 'fumble'
    >
  >
): Promise<void> {
  return serializeCharacterUpdate(ctx, session, async () => {
  const { userId, platform } = getUserKey(session);

  // 检查卡片是否存在
  const card = await getCard(ctx, session, cardName);
  if (!card) {
    throw new Error(`人物卡 "${cardName}" 不存在`);
  }

  const now = new Date();

  // 查询现有统计
  const existing = await ctx.database.get('koidice_character_stats', {
    userId,
    platform,
    cardName
  });

  if (existing.length > 0) {
    // 更新统计
    const current = existing[0];
    await ctx.database.set(
      'koidice_character_stats',
      { userId, platform, cardName },
      {
        totalRolls: (current.totalRolls || 0) + (statsUpdate.totalRolls || 0),
        criticalSuccess: (current.criticalSuccess || 0) + (statsUpdate.criticalSuccess || 0),
        extremeSuccess: (current.extremeSuccess || 0) + (statsUpdate.extremeSuccess || 0),
        hardSuccess: (current.hardSuccess || 0) + (statsUpdate.hardSuccess || 0),
        regularSuccess: (current.regularSuccess || 0) + (statsUpdate.regularSuccess || 0),
        failure: (current.failure || 0) + (statsUpdate.failure || 0),
        fumble: (current.fumble || 0) + (statsUpdate.fumble || 0),
        updatedAt: now
      }
    );
  } else {
    // 创建新统计
    await ctx.database.create('koidice_character_stats', {
      userId,
      platform,
      cardName,
      totalRolls: statsUpdate.totalRolls || 0,
      criticalSuccess: statsUpdate.criticalSuccess || 0,
      extremeSuccess: statsUpdate.extremeSuccess || 0,
      hardSuccess: statsUpdate.hardSuccess || 0,
      regularSuccess: statsUpdate.regularSuccess || 0,
      failure: statsUpdate.failure || 0,
      fumble: statsUpdate.fumble || 0,
      nativeCounters: '{}',
      updatedAt: now
    });
  }
  });
}
