import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { CharacterService } from '../services/character-service';
import { GameSessionService } from '../services/game-session-service';

function groupKey(session: Session): string {
  return `${session.platform}:${session.selfId}:${session.guildId ? session.channelId : `dm:${session.userId}`}`;
}

export async function getCOCRule(ctx: Context, session: Session): Promise<number> {
  const game = await new GameSessionService(ctx).getSession(session);
  if (game) {
    const configured = JSON.parse(game.config || '{}').rr_rc;
    const value = configured === undefined || configured === null || configured === '' ? NaN : Number(configured);
    if (Number.isInteger(value) && value >= 0 && value <= 7) return value;
  }
  const rows = await ctx.database.get('koidice_group_data', {
    guildId: groupKey(session), dataKey: 'cocRule'
  });
  return rows.length ? Number(rows[0].dataValue) : 0;
}

export async function getDefaultDice(ctx: Context, session: Session, config: Config, diceAdapter: DiceAdapter): Promise<number> {
  const card = await new CharacterService(ctx, diceAdapter).getActiveCard(session);
  if (card) {
    const rows = await ctx.database.get('koidice_user_data', {
      userId: `${session.platform}:${session.userId}`, dataKey: `defaultDice:${card.id}`
    });
    if (rows.length) return Number(rows[0].dataValue);
    return 100;
  }
  const rows = await ctx.database.get('koidice_user_settings', {
    userId: session.userId, platform: session.platform
  });
  return rows[0]?.defaultDice ?? config.defaultDice;
}

export function registerSettingsCommands(register: RegisterCommand, ctx: Context, config: Config, diceAdapter: DiceAdapter) {
  register('set [dice:number]', '设置默认骰面数').action(async ({ session }, dice) => {
    if (!session?.userId) return '无法获取会话信息';
    if (dice !== undefined && (!Number.isInteger(dice) || dice < 1 || dice > Math.min(1000, config.maxDiceFace))) {
      return `骰子面数必须在 1-${Math.min(1000, config.maxDiceFace)} 之间`;
    }
    const card = await new CharacterService(ctx, diceAdapter).getActiveCard(session);
    if (card) {
      const query = { userId: `${session.platform}:${session.userId}`, dataKey: `defaultDice:${card.id}` };
      const rows = await ctx.database.get('koidice_user_data', query);
      if (dice === undefined) {
        if (rows.length) await ctx.database.remove('koidice_user_data', query);
      } else if (rows.length) {
        await ctx.database.set('koidice_user_data', query, { dataValue: String(dice), updatedAt: new Date() });
      } else {
        await ctx.database.create('koidice_user_data', { ...query, dataValue: String(dice), updatedAt: new Date() });
      }
    } else {
      const query = { userId: session.userId, platform: session.platform };
      const rows = await ctx.database.get('koidice_user_settings', query);
      if (dice === undefined) {
        if (rows.length) await ctx.database.set('koidice_user_settings', query, { defaultDice: config.defaultDice, updatedAt: new Date() });
      } else if (rows.length) {
        await ctx.database.set('koidice_user_settings', query, { defaultDice: dice, updatedAt: new Date() });
      } else {
        await ctx.database.create('koidice_user_settings', { ...query, defaultDice: dice, showDetail: true, createdAt: new Date(), updatedAt: new Date() });
      }
    }
    return dice === undefined ? `已重置默认骰为 D${card ? 100 : config.defaultDice}` : `已设置默认骰为 D${dice}`;
  });

  register('setcoc [rule:text]', '设置COC检定房规').action(async ({ session }, rule) => {
    if (!session?.userId) return '无法获取会话信息';
    const query = { guildId: groupKey(session), dataKey: 'cocRule' };
    if (!rule || rule === 'show') return `当前COC房规: ${await getCOCRule(ctx, session)}`;
    const games = new GameSessionService(ctx);
    const game = !session.isDirect && await games.getSession(session);
    if (!session.isDirect && !(game && games.isGM(game, session.userId))
        && !session.event.member?.roles?.some(role => role.id === 'owner' || role.id === 'admin')
        && (await session.observeUser(['authority'])).authority < 4) return '需要桌主或群管理员权限';
    if (rule !== 'clr' && !/^[0-7]$/.test(rule)) return 'COC房规必须在 0-7 之间';
    if (game && (rule !== 'clr' || JSON.parse(game.config || '{}').rr_rc !== undefined)) {
      await games.setConfig(game.id, 'rr_rc', rule === 'clr' ? undefined : Number(rule));
      return rule === 'clr' ? '已清除本桌COC房规' : `已设置本桌COC房规为 ${rule}`;
    }
    if (rule === 'clr') {
      await ctx.database.remove('koidice_group_data', query);
      return '已清除COC房规';
    }
    const rows = await ctx.database.get('koidice_group_data', query);
    if (rows.length) {
      await ctx.database.set('koidice_group_data', query, { dataValue: rule, updatedAt: new Date() });
    } else {
      await ctx.database.create('koidice_group_data', { ...query, dataValue: rule, updatedAt: new Date() });
    }
    return `已设置COC房规为 ${rule}`;
  });
}
