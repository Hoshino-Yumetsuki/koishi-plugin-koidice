import { createHash } from 'node:crypto';
import type { Command, Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import { manageRuntimeReply, registerRuntimeReplies, runtimeHelp, runtimeReplyKeywords } from './community-replies';

interface CommunityState {
  id: string;
  platform: string;
  selfId: string;
  guildId: string;
  channelId: string;
  botOff: boolean;
  replyOff: boolean;
  meOff: boolean;
  jrrpOff: boolean;
  helpOff: boolean;
  drawOff: boolean;
  obOff: boolean;
}

declare module 'koishi' {
  interface Tables {
    koidice_community: CommunityState;
  }
}

export interface CommunityOptions {
  diceStyle?: boolean;
  listCommands?: () => Command[];
  listDecks?: () => string;
  listReplies?: () => string[];
}

function key(session: Session): string | undefined {
  if (!session.guildId || !session.channelId || session.isDirect) return;
  return JSON.stringify([session.platform, session.selfId, session.guildId, session.channelId]);
}

async function state(ctx: Context, session: Session): Promise<CommunityState | undefined> {
  const id = key(session);
  if (!id) return;
  return (await ctx.database.get('koidice_community', { id }))[0];
}

async function update(ctx: Context, session: Session, values: Partial<CommunityState>) {
  const id = key(session);
  if (!id) return;
  const existing = await state(ctx, session);
  if (existing) await ctx.database.set('koidice_community', { id }, { platform: session.platform, selfId: session.selfId, guildId: session.guildId!, channelId: session.channelId!, ...values });
  else await ctx.database.create('koidice_community', { id, platform: session.platform, selfId: session.selfId, guildId: session.guildId!, channelId: session.channelId!, ...values });
}

export async function communityCommandsEnabled(ctx: Context, session: Session, root?: string): Promise<boolean> {
  const settings = await state(ctx, session);
  if (settings?.botOff && !session.stripped.appel) return false;
  if ((root === 'draw' || root === 'drawh') && settings?.drawOff) return false;
  if (root === 'ob' && settings?.obOff) return false;
  return true;
}

export async function communityRepliesEnabled(ctx: Context, session: Session): Promise<boolean> {
  const settings = await state(ctx, session);
  return !settings?.botOff && !settings?.replyOff;
}

async function isAdmin(session: Session): Promise<boolean> {
  if (!session.guildId || !session.userId || session.isDirect) return false;
  let roles = session.event.member?.roles;
  if (!roles && typeof session.bot.getGuildMember === 'function') {
    try { roles = (await session.bot.getGuildMember(session.guildId, session.userId)).roles; } catch { return false; }
  }
  return !!roles?.some(role => role.id === 'owner' || role.id === 'admin');
}

function targetsSelf(session: Session, target?: string): boolean {
  if (!target) return true;
  return target === session.selfId || (target.length === 4 && session.selfId.endsWith(target));
}

const help: Record<string, string> = {
  '指令': '.bot on/off、.reply on/off、.help、.me、.jrrp、.chan.settings',
  bot: '.bot on/off [骰子 ID 或末四位]：群管理员开关指令',
  reply: '.reply on/off：群管理员开关关键词回复',
  me: '.me 动作；.me on/off 开关群内动作',
  jrrp: '.jrrp：查看今日人品；.jrrp on/off 开关',
  'chan.settings': '.chan.settings 查看本频道跑团设置；.chan.settings <bot|reply|jrrp|me|help|draw|ob> <on|off> 开关对应功能'
};

export function registerCommunityCommands(register: RegisterCommand, ctx: Context, options: CommunityOptions = {}) {
  ctx.model.extend('koidice_community', {
    id: 'string', platform: 'string', selfId: 'string', guildId: 'string', channelId: 'string', botOff: 'boolean', replyOff: 'boolean', meOff: 'boolean',
    jrrpOff: 'boolean', helpOff: 'boolean', drawOff: 'boolean', obOff: 'boolean'
  }, { primary: 'id' });
  registerRuntimeReplies(register, ctx);

  const helpText = async (topic: string, session: Session): Promise<string> => {
    const query = topic.trim().toLowerCase().replace(/^[.。．!！]/u, '').replace(/^koid(?:ice)?\./, '');
    const custom = await runtimeHelp(ctx, session, query);
    if (custom !== undefined) return custom;
    if (query === '全牌堆列表' || query === '扩展牌堆') return options.listDecks?.() || '当前无法获取牌堆列表';
    if (query === '回复列表') {
      const replies = [...new Set([...(options.listReplies?.() || []), ...await runtimeReplyKeywords(ctx, session)])];
      return replies.length ? `回复关键词：${replies.join('、')}` : '当前没有已加载的回复关键词';
    }
    const commands = options.listCommands?.() || [];
    const prefix = options.diceStyle ? '' : 'koidice.';
    const names = (command: Command) => [command.name, ...Object.keys(command._aliases)].map(name => name.startsWith(prefix) ? name.slice(prefix.length) : name);
    if (!query || query === '指令') {
      const list = commands.filter(command => !command.parent || command.parent.name === 'koidice').map(command => names(command)[0]);
      return list.length ? `指令：${[...new Set(list)].sort().join('、')}\n使用 .help 词条 查看详情` : help['指令'];
    }
    const command = commands.find(item => names(item).includes(query === 'help' ? 'dicehelp' : query));
    if (command) {
      const title = `${options.diceStyle ? '.' : 'koidice.'}${names(command)[0]}${command.declaration}`;
      const descriptions = ctx.i18n.get(`commands.${command.name}.description`, session.locales);
      const description = Object.values(descriptions)[0] || '';
      const usage = typeof command._usage === 'function' ? await command._usage(session) : command._usage;
      return [title, description, usage || help[query], ...command._examples].filter(Boolean).join('\n');
    }
    if (help[query]) return help[query];
    const candidates = [...new Set([...commands.flatMap(names), ...Object.keys(help), '全牌堆列表', '回复列表'])];
    const ranked = candidates.map(name => ({ name, score: ctx.i18n.compare(name, query) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    return ranked.length ? `没有找到该帮助词条，你是否想查询：${ranked.slice(0, 3).map(item => item.name).join('、')}` : '没有找到该帮助词条';
  };

  register('bot [operation:string] [target:string]', '群内开关骰子').action(async ({ session }, operation, target) => {
    if (!session || !key(session)) return '请在群内使用';
    if (!targetsSelf(session, target)) return;
    if (!operation) return `骰子当前${(await state(ctx, session))?.botOff ? '停用' : '启用'}`;
    if (!['on', 'off'].includes(operation)) return '用法：.bot on/off [骰子 ID 或末四位]';
    if (!await isAdmin(session)) return '仅群管理员可操作';
    await update(ctx, session, { botOff: operation === 'off' });
    return `骰子已${operation === 'on' ? '启用' : '停用'}`;
  });

  register('reply [operation:text]', '管理关键词回复').action(async ({ session }, operation) => {
    if (!session) return '无法获取用户信息';
    if (operation !== 'on' && operation !== 'off') return manageRuntimeReply(ctx, session, operation || '');
    if (!key(session)) return '请在群内使用';
    if (!await isAdmin(session)) return '仅群管理员可操作';
    await update(ctx, session, { replyOff: operation === 'off' });
    return `关键词回复已${operation === 'on' ? '启用' : '停用'}`;
  });

  register('dicehelp [topic:text]', 'Dice! 帮助').action(async ({ session }, topic) => {
    if (session && (await state(ctx, session))?.helpOff) return '本群已禁用帮助';
    if (!session) return '无法获取用户会话信息';
    return helpText(topic || '', session);
  });

  register('me [action:text]', '第三人称动作').action(async ({ session }, action) => {
    if (!session || !key(session)) return '请在群内使用；不支持向其他群转发';
    if (!action?.trim()) return '用法：.me 动作';
    action = action.trim();
    if (action === 'on' || action === 'off') {
      if (!await isAdmin(session)) return '仅群管理员可操作';
      await update(ctx, session, { meOff: action === 'off' });
      return `me 已${action === 'on' ? '启用' : '停用'}`;
    }
    if ((await state(ctx, session))?.meOff) return '本群已禁用 me';
    return `${session.username} ${action}`;
  });

  register('jrrp [operation:string]', '今日人品').action(async ({ session }, operation) => {
    if (!session?.userId) return '无法获取用户信息';
    if (operation === 'on' || operation === 'off') {
      if (!key(session)) return '请在群内使用';
      if (!await isAdmin(session)) return '仅群管理员可操作';
      await update(ctx, session, { jrrpOff: operation === 'off' });
      return `jrrp 已${operation === 'on' ? '启用' : '停用'}`;
    }
    if (operation) return '用法：.jrrp [on/off]';
    if ((await state(ctx, session))?.jrrpOff) return '本群已禁用 jrrp';
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    const digest = createHash('sha256').update(JSON.stringify([date, session.platform, session.userId])).digest();
    return `${session.username}今天的人品值是: ${digest.readUInt32BE(0) % 100 + 1}`;
  });

  const switches = { bot: 'botOff', reply: 'replyOff', jrrp: 'jrrpOff', me: 'meOff', help: 'helpOff', draw: 'drawOff', ob: 'obOff' } as const;
  register('chan.settings [feature:string] [mode:string]', '管理本频道的跑团功能').action(async ({ session }, feature, mode) => {
    if (!session || !key(session) || !session.guildId || !session.channelId) return '请在目标群内使用';
    if (!await isAdmin(session)) return '仅群管理员可操作';
    if (!feature || feature === 'state') {
      const settings = await state(ctx, session);
      return Object.entries(switches).map(([name, field]) => `${name}: ${settings?.[field] ? 'off' : 'on'}`).join('，');
    }
    if (!Object.hasOwn(switches, feature) || (mode !== 'on' && mode !== 'off')) return help['chan.settings'];
    await update(ctx, session, { [switches[feature as keyof typeof switches]]: mode === 'off' });
    return '本频道的跑团设置已更新';
  });
}
