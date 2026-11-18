import { h, type Context, type Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { GameSessionService } from '../services/game-session-service';

export function registerGameLog(register: RegisterCommand, ctx: Context, games: GameSessionService) {
  const queues = new Map<number, Promise<void>>();
  async function serial<T>(id: number, action: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) || Promise.resolve();
    const result = previous.then(action);
    const current = result.then(() => undefined, () => undefined);
    queues.set(id, current);
    try { return await result; } finally {
      if (queues.get(id) === current) queues.delete(id);
    }
  }

  async function capture(session: Session, text: string, author: string) {
    if (session.isDirect || !session.channelId || !session.userId || !text) return;
    const game = await games.getSession(session);
    if (game && game.guildId !== games.areaKey(session)) return;
    if (!game?.isLogging) return;
    await serial(game.id, async () => {
      const [latest] = await ctx.database.get('koidice_game_session', { id: game.id });
      if (!latest?.isLogging) return;
      const participants: string[] = JSON.parse(latest.logParticipants || '[]');
      if (!participants.includes(session.userId!)) return;
      const entries: string[] = JSON.parse(latest.logEntries || '[]');
      const entry = `[${new Date().toISOString()}] ${author}: ${text}`;
      if (entry.length > 16384 || JSON.stringify(entries).length + entry.length > 1000000) {
        entries.push('[日志已暂停：达到大小限制]');
        await ctx.database.set('koidice_game_session', { id: game.id }, { logEntries: JSON.stringify(entries), isLogging: false });
        return;
      }
      entries.push(entry);
      await ctx.database.set('koidice_game_session', { id: game.id }, { logEntries: JSON.stringify(entries) });
    });
  }

  ctx.middleware(async (session, next) => {
    const text = session.content || '';
    if (session.stripped?.appel) return next();
    if (!/^[.。．!！/]/u.test(text.trimStart()) && !/^(?:koidice|koid)\./i.test(text.trimStart())) {
      await capture(session, text, session.username || session.userId || '');
    }
    return next();
  }, true);

  const log = register('log', '游戏日志');
  for (const action of ['new', 'on', 'off', 'end', 'join', 'leave', 'status'] as const) {
    log.subcommand(`.${action} [name:text]`, '管理游戏日志').action(async ({ session }, name) => {
      if (!session?.userId) return '无法获取用户会话信息';
      if (session.isDirect) return '日志仅可在游戏群聊中管理';
      let game = await games.getSession(session);
      if (!game && (action === 'new' || action === 'on')) {
        game = await games.getOrCreateForArea(session);
        await games.addGM(game.id, session.userId);
        game = await games.getSession(session);
      }
      if (!game) return '当前窗口没有进行中的游戏';
      if (game.guildId !== games.areaKey(session)) return '日志只能在创建游戏的群聊中管理';
      if (!['join', 'leave', 'status'].includes(action) && !games.isParticipant(game, session.userId)) return '只有游戏参与者可以管理日志';
      if (name && (name.length > 100 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /^\.+$/.test(name))) return '日志名称不是合法文件名';
      return serial(game.id, async () => {
        const [latest] = await ctx.database.get('koidice_game_session', { id: game!.id });
        if (!latest) return '游戏已结束';
        const participants: string[] = JSON.parse(latest.logParticipants || '[]');
        if (action === 'status') return `日志${latest.isLogging ? '记录中' : '未记录'}；已同意记录的用户：${participants.join(', ') || '无'}`;
        if (action === 'join' || action === 'leave') {
          const next = participants.filter((id) => id !== session.userId);
          if (action === 'join') next.push(session.userId!);
          await ctx.database.set('koidice_game_session', { id: latest.id }, { logParticipants: JSON.stringify(next) });
          return action === 'join' ? '你已同意记录此桌后续群聊消息，可随时使用 .log leave 撤回' : '已停止记录你的后续消息';
        }
        if (action === 'new' || (action === 'on' && !latest.logName)) {
          if (latest.logName && latest.logEntries !== '[]') return '请先使用 .log end 保存当前日志';
          const logName = name || String(Date.now());
          await ctx.database.set('koidice_game_session', { id: latest.id }, { logName, logEntries: '[]', logParticipants: '[]', isLogging: true });
          return `已开始记录日志「${logName}」；仅记录使用 .log join 同意的用户，可用 .log leave 撤回`;
        }
        if (!latest.logName) return '没有正在记录的日志';
        if (action === 'on') {
          if (latest.isLogging) return '日志已经在记录中';
          await ctx.database.set('koidice_game_session', { id: latest.id }, { isLogging: true });
          return `已继续记录日志「${latest.logName}」`;
        }
        if (action === 'off') {
          if (!latest.isLogging) return '日志已经暂停';
          await ctx.database.set('koidice_game_session', { id: latest.id }, { isLogging: false });
          return `已暂停记录日志「${latest.logName}」`;
        }
        const entries: string[] = JSON.parse(latest.logEntries || '[]');
        if (!games.isGM(latest, session.userId!)) return '只有 GM 可以发送日志';
        if (entries.length) {
          try {
            const file = h.file(Buffer.from(entries.join('\n'), 'utf8'), 'text/plain');
            file.attrs.title = `${latest.logName}.txt`;
            const sent = await session.send(file);
            if (!sent?.length) throw new Error('日志发送失败');
          } catch {
            await ctx.database.set('koidice_game_session', { id: latest.id }, { isLogging: false });
            return '日志发送失败，记录已保留，请再次使用 .log end';
          }
        }
        await ctx.database.set('koidice_game_session', { id: latest.id }, { logName: '', logEntries: '[]', logParticipants: '[]', isLogging: false });
        return entries.length ? '日志已发送' : '日志已结束，本次无记录';
      });
    });
  }
}
