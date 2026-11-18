import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import { GameSessionService } from '../services/game-session-service';

function userIds(data: string): string[] {
  const ids: unknown = JSON.parse(data || '[]');
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** Hidden results go to the GM and observers, never to a mode marker or an unrelated table. */
export async function getObservers(ctx: Context, session: Session) {
  if (session.isDirect) return [];
  const service = new GameSessionService(ctx);
  const game = await service.getSession(session);
  if (!game) return [];
  const observers = await service.getConfig(game.id, 'no_ob') ? [] : userIds(game.observerList);
  return [...new Set([...userIds(game.gmList), ...observers])];
}

export async function sendHidden(ctx: Context, session: Session, detail: string) {
  const recipients = new Set([session.userId!, ...await getObservers(ctx, session)]);
  await Promise.all([...recipients].map(async id => {
    try { await session.bot.sendPrivateMessage(id, detail); }
    catch (error) { ctx.logger('koidice').warn('私发暗骰结果失败:', error); }
  }));
}

export function registerObserverCommands(register: RegisterCommand, ctx: Context) {
  const games = new GameSessionService(ctx);
  register('ob [action:string]', '旁观模式').userFields(['authority']).action(async ({ session }, action) => {
    if (!session?.userId || session.isDirect) return '旁观模式仅在群聊中可用';
    const op = action?.toLowerCase() || 'join';
    const game = op === 'join' ? await games.getOrCreateForArea(session) : await games.getSession(session);
    if (!game) return '当前窗口没有游戏';
    const uid = session.userId;
    const host = (session.user?.authority ?? 0) >= 3 || session.event.member?.roles?.some(role => role.id === 'owner' || role.id === 'admin');
    switch (op) {
      case 'join':
        if (await games.getConfig(game.id, 'no_ob')) return '本桌旁观模式已关闭';
        return await games.addObserver(game.id, uid) ? `${session.username} 已加入旁观` : '你已经在旁观列表中';
      case 'exit':
        return await games.removeObserver(game.id, uid) ? `${session.username} 已退出旁观` : '你不在旁观列表中';
      case 'list': {
        const ids = userIds(game.observerList);
        return ids.length ? `旁观者列表：${ids.join('、')}` : '当前没有旁观者';
      }
      case 'clr':
      case 'clear':
        if (!host && !games.isGM(game, uid)) return '需要群管理员或 GM 权限';
        await ctx.database.set('koidice_game_session', { id: game.id }, { observerList: '[]' });
        return '已清除所有旁观者';
      case 'on':
      case 'off':
        if (!host) return '需要群管理员权限';
        await games.setConfig(game.id, 'no_ob', op === 'off');
        return op === 'on' ? '已开启旁观模式' : '已关闭旁观模式';
      default:
        return '用法：.ob join/exit/list/clr/on/off';
    }
  });
}
