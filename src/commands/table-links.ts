import type { Context, Session } from 'koishi';
import { h } from '../koishi-runtime';
import type { RegisterCommand } from '../command-scope';

interface TableLink {
  id: string;
  platform: string;
  selfId: string;
  guildId: string;
  channelId: string;
  target: string;
  direction: string;
  active: boolean;
}

interface TableLinkConsent { id: string; }
interface TableChannel { id: string; enabled: boolean; }

declare module 'koishi' {
  interface Tables {
    koidice_table_link: TableLink;
    koidice_table_link_consent: TableLinkConsent;
    koidice_table_channel: TableChannel;
  }
}

function endpoint(session: Session): string | undefined {
  if (session.isDirect || !session.guildId || !session.channelId || !session.selfId) return;
  return JSON.stringify([session.platform, session.selfId, session.guildId, session.channelId]);
}

async function isAdmin(session: Session): Promise<boolean> {
  if (!session.guildId || !endpoint(session) || !session.userId) return false;
  let roles = session.event.member?.roles;
  if (!roles && typeof session.bot.getGuildMember === 'function') {
    try { roles = (await session.bot.getGuildMember(session.guildId, session.userId)).roles; } catch { return false; }
  }
  return !!roles?.some(role => role.id === 'owner' || role.id === 'admin');
}

export async function tableChannelCommandsEnabled(ctx: Context, session: Session): Promise<boolean> {
  const id = endpoint(session);
  if (!id) return true;
  const [setting] = await ctx.database.get('koidice_table_channel', { id });
  return setting?.enabled !== false;
}

function safeText(value: string): boolean {
  return !!value && value.length <= 1000 && !/[\r\n\x00-\x1f\x7f<>@]/u.test(value)
    && !/^[.。．!！/]/u.test(value)
    && !/(?:密码|口令|密钥|令牌|暗骰|秘密|secret|password|token|api.?key|https?:\/\/|\b\d+d\d+\b|骰|掷|投点|检定)/iu.test(value);
}

export function registerTableLinks(register: RegisterCommand, ctx: Context) {
  ctx.model.extend('koidice_table_link', {
    id: 'string', platform: 'string', selfId: 'string', guildId: 'string', channelId: 'string',
    target: 'string', direction: 'string', active: 'boolean',
  }, { primary: 'id' });
  ctx.model.extend('koidice_table_link_consent', { id: 'string' }, { primary: 'id' });
  ctx.model.extend('koidice_table_channel', { id: 'string', enabled: 'boolean' }, { primary: 'id' });

  async function forward(session: Session, current: TableLink, text: string): Promise<boolean> {
    if (!current.active || current.direction === 'from' || !safeText(text)) return false;
    const peers = await ctx.database.get('koidice_table_link', {
      platform: session.platform, selfId: session.selfId, channelId: current.target,
      target: session.channelId, active: true,
    });
    const eligible = peers.filter(peer => peer.id !== current.id && peer.direction !== 'to');
    if (eligible.length !== 1) return false;
    const peer = eligible[0];
    await session.bot.sendMessage(peer.channelId, h.text(`[链接消息] ${text}`), peer.guildId);
    return true;
  }

  ctx.middleware(async (session, next) => {
    const id = endpoint(session);
    if (!id || !session.userId || session.userId === session.selfId || session.event.user?.isBot
      || !session.elements?.length || session.elements.some(element => element.type !== 'text')) return next();
    const text = session.content?.trim() || '';
    if (!safeText(text) || text.startsWith('[链接消息]') || ctx.$commander.resolve(text.split(/\s/u, 1)[0], session)) return next();
    const [current] = await ctx.database.get('koidice_table_link', { id });
    if (current) {
      const consentId = JSON.stringify([id, current.target, session.userId]);
      const [consent] = await ctx.database.get('koidice_table_link_consent', { id: consentId });
      if (consent) await forward(session, current, text);
    }
    return next();
  }, true);

  register('link [operation:string] [argument:text]', '经双方授权的跨桌消息链接')
    .action(async ({ session }, operation, argument) => {
      if (!session) return;
      const id = endpoint(session);
      if (!id) return '链接仅支持群组频道，不支持私聊';
      const [current] = await ctx.database.get('koidice_table_link', { id });
      const op = operation?.toLowerCase();
      if (!op || op === 'state' || op === 'list') {
        if (!current) return '本频道没有链接';
        return `本频道链接：${current.direction} g${current.target}，${current.active ? '已开启' : '已关闭'}；需双方配置互补方向并开启。使用 .link optin 开启本人消息转发，.link optout 关闭。`;
      }
      if (op === 'optin' || op === 'optout') {
        if (!session.userId) return '无法确认用户身份';
        if (!current) return '请先配置链接';
        const consentId = JSON.stringify([id, current.target, session.userId]);
        if (op === 'optout') await ctx.database.remove('koidice_table_link_consent', { id: consentId });
        else if (!(await ctx.database.get('koidice_table_link_consent', { id: consentId })).length) {
          await ctx.database.create('koidice_table_link_consent', { id: consentId });
        }
        return op === 'optin' ? '已同意转发本人普通文本；使用 .link optout 撤回' : '已撤回本人消息转发同意';
      }
      if (op === 'say') {
        const text = argument?.trim() || '';
        if (!safeText(text)) return '仅允许发送单行普通文本，不转发指令、暗骰或疑似秘密';
        return current && await forward(session, current, text) ? '已发送' : '链接未开启或目标频道未授权接收';
      }
      if (!await isAdmin(session)) return '仅本频道的群管理员可管理链接';
      if (op === 'close' || op === 'start') {
        if (!current) return '本频道没有链接';
        await ctx.database.set('koidice_table_link', { id }, { active: op === 'start' });
        return `本频道链接已${op === 'start' ? '开启' : '关闭'}`;
      }
      if (op === 'to' || op === 'from' || op === 'with') {
        const match = /^g([^\s]+)$/u.exec(argument?.trim() || '');
        if (!match || match[1] === session.channelId) return '用法：.link to/from/with g频道ID；目标须在同一平台和机器人下';
        const values = { platform: session.platform, selfId: session.selfId, guildId: session.guildId,
          channelId: session.channelId, target: match[1], direction: op, active: true };
        if (current) await ctx.database.set('koidice_table_link', { id }, values);
        else await ctx.database.create('koidice_table_link', { id, ...values });
        return '本频道已授权链接；目标频道也必须配置互补方向并开启。用户须使用 .link optin 同意转发本人文本。';
      }
      return '用法：.link to/from/with g频道ID、start、close、state、list、optin、optout 或 say 内容';
    });

  register('chan [operation:string] [target:string]', '频道命令开关').action(async ({ session }, operation, target) => {
    if (!session) return;
    const id = endpoint(session);
    if (!id) return '仅支持群组频道';
    if (target && target !== session.selfId && !(target.length === 4 && session.selfId.endsWith(target))) return;
    if (operation !== 'on' && operation !== 'off') return '用法：.chan on/off [机器人ID或末四位]';
    if (!await isAdmin(session)) return '仅本频道的群管理员可管理频道命令';
    const [existing] = await ctx.database.get('koidice_table_channel', { id });
    if (existing) await ctx.database.set('koidice_table_channel', { id }, { enabled: operation === 'on' });
    else await ctx.database.create('koidice_table_channel', { id, enabled: operation === 'on' });
    return `本频道命令已${operation === 'on' ? '开启' : '关闭'}`;
  });
}
