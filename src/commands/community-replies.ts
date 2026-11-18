import { randomInt } from 'node:crypto';
import type { Context, Session } from 'koishi';
import { h } from '../koishi-runtime';
import { RE2JS } from 're2js';
import type { RegisterCommand } from '../command-scope';
import { communityRepliesEnabled } from './community';
import { tableChannelCommandsEnabled } from './table-links';

interface RuntimeReply { id: string; scope: string; title: string; mode: string; keyword: string; echo: string; type: string }
interface RuntimeHelp { id: string; scope: string; topic: string; text: string }
declare module 'koishi' {
  interface Tables { koidice_runtime_reply: RuntimeReply; koidice_runtime_help: RuntimeHelp }
}

const scope = (session: Session) => JSON.stringify([session.platform, session.selfId]);
const id = (session: Session, name: string) => JSON.stringify([scope(session), name]);

export async function runtimeHelp(ctx: Context, session: Session, topic: string) {
  return (await ctx.database.get('koidice_runtime_help', { id: id(session, topic) }))[0]?.text;
}

export async function runtimeReplyKeywords(ctx: Context, session: Session) {
  return (await ctx.database.get('koidice_runtime_reply', { scope: scope(session) })).map(row => row.keyword);
}

export function registerRuntimeReplies(register: RegisterCommand, ctx: Context) {
  ctx.model.extend('koidice_runtime_reply', { id: 'string', scope: 'string', title: 'string', mode: 'string', keyword: 'text', echo: 'text', type: 'string' }, { primary: 'id' });
  ctx.model.extend('koidice_runtime_help', { id: 'string', scope: 'string', topic: 'string', text: 'text' }, { primary: 'id' });

  register('helpdoc <topic:string> [text:text]', '管理帮助词条').action(async ({ session }, topic, text) => {
    if (!session?.userId) return '无法获取用户信息';
    if (((await session.observeUser(['authority'])).authority || 0) < 4) return '需要骰主权限';
    if (!topic || topic.length > 128) return '用法：.helpdoc 词条 [内容|reset]';
    topic = topic.toLowerCase();
    const key = id(session, topic);
    if (!text) return await runtimeHelp(ctx, session, topic) || '没有自定义帮助词条';
    if (text === 'reset') { await ctx.database.remove('koidice_runtime_help', { id: key }); return '帮助词条已重置'; }
    if (text.length > 10000) return '帮助词条过长';
    await ctx.database.upsert('koidice_runtime_help', [{ id: key, scope: scope(session), topic, text }]);
    return '帮助词条已设置';
  });

  ctx.middleware(async (session, next) => {
    if (!session.userId || session.userId === session.selfId || session.event.user?.isBot) return next();
    const content = session.stripped?.content ?? session.content ?? '';
    if (!content || content.length > 4096 || !(await communityRepliesEnabled(ctx, session)) || !(await tableChannelCommandsEnabled(ctx, session))) return next();
    if (session.argv?.command || /^[.。．!！]/u.test(content) || /^(?:koidice|koid)[.\s]/iu.test(content)) return next();
    const rows = await ctx.database.get('koidice_runtime_reply', { scope: scope(session) });
    const modes = ['match', 'prefix', 'search', 'regex'];
    const matches = rows.flatMap<{ row: RuntimeReply; word: string; match?: string[] }>(row => {
      if (row.mode === 'regex') {
        try {
          const match = row.keyword.length <= 512 ? RE2JS.compile(`\\A(?:${row.keyword})\\z`, RE2JS.CASE_INSENSITIVE).exec(content) : null;
          return match ? [{ row, word: content, match }] : [];
        } catch {
          return [];
        }
      }
      return row.keyword.split('|').filter(word => word && (row.mode === 'match' ? content === word : row.mode === 'prefix' ? content.startsWith(word) : row.mode === 'search' && content.includes(word))).map(word => ({ row, word }));
    });
    matches.sort((a, b) => modes.indexOf(a.row.mode) - modes.indexOf(b.row.mode) || b.word.length - a.word.length || a.row.title.localeCompare(b.row.title));
    const chosen = matches[0]?.row;
    if (!chosen) return next();
    const replies = chosen.type === 'deck' ? JSON.parse(chosen.echo) as string[] : [chosen.echo];
    const result = replies[randomInt(replies.length)];
    const match = matches[0].match;
    const formatted = match ? result.replace(/\$\$|\$&|\$\d{1,2}/gu, token => {
      if (token === '$$') return '$';
      if (token === '$&') return match[0];
      const index = Number(token.slice(1));
      return index > 0 && index < match.length ? match[index] ?? '' : token;
    }) : result;
    await session.send(h.text(formatted));
  }, true);
}

export async function manageRuntimeReply(ctx: Context, session: Session, input: string): Promise<string> {
  const [action, ...rest] = input.trim().split(/\s+/u);
  const authority = (await session.observeUser(['authority'])).authority || 0;
  if (authority < (action === 'get' ? 2 : 4)) return '需要骰主权限';
  if (action === 'list') {
    const rows = await ctx.database.get('koidice_runtime_reply', { scope: scope(session) });
    return rows.length ? rows.map(row => row.title).sort().join('、') : '没有自定义回复';
  }
  if (action === 'show' || action === 'get' || action === 'del') {
    const title = rest.join(' ');
    const key = id(session, title);
    const [row] = await ctx.database.get('koidice_runtime_reply', { id: key });
    if (!row) return '没有找到该回复';
    if (action === 'del') { await ctx.database.remove('koidice_runtime_reply', { id: key }); return '回复已删除'; }
    return action === 'show' ? `${row.title}: ${row.mode}=${row.keyword} ${row.type}=${row.echo}` : row.echo;
  }
  let title = action;
  let mode = 'match';
  let keyword = action;
  let type = 'text';
  let echo = rest.join(' ');
  if (action === 'set') {
    const attrs = input.slice(3).trim().split(/\t+/u);
    title = ''; keyword = ''; echo = '';
    for (const field of attrs) {
      const match = /^(Title|Type|Match|Prefix|Search|Regex|Text|Deck|Lua|JavaScript|Python)\s*[:=]\s*([\s\S]*)$/iu.exec(field.trim());
      if (!match) return '格式错误：使用制表符分隔 Title、Match/Prefix/Search/Regex 和 Text/Deck';
      const name = match[1].toLowerCase();
      const value = match[2];
      if (name === 'title') title = value;
      else if (name === 'type') { if (value.toLowerCase() !== 'reply') return '仅支持回复类型'; }
      else if (['lua', 'javascript', 'python'].includes(name)) return '不支持脚本回复';
      else if (['match', 'prefix', 'search', 'regex'].includes(name)) { mode = name; keyword = value; }
      else { type = name; echo = value; }
    }
    title ||= keyword;
  } else if (action === 're') {
    mode = 'regex';
    keyword = rest.shift() || '';
    title = keyword;
    echo = rest.join(' ');
  }
  if (action !== 'set' && !echo && title) {
    const key = id(session, title);
    const rows = await ctx.database.get('koidice_runtime_reply', { id: key });
    if (!rows.length) return '没有找到该回复';
    await ctx.database.remove('koidice_runtime_reply', { id: key });
    return '回复已删除';
  }
  if (!title || !keyword || !echo || title.length > 128 || keyword.length > 512 || echo.length > 10000) return '用法：.reply 关键词 回复内容，或 .reply set Match=关键词<TAB>Text=内容';
  if (mode === 'regex') {
    try { RE2JS.compile(`\\A(?:${keyword})\\z`, RE2JS.CASE_INSENSITIVE); }
    catch { return '正则表达式无效或包含不支持的语法'; }
  }
  if (type === 'deck') {
    const items = echo.split('|').map(item => item.trim()).filter(Boolean);
    if (!items.length || items.length > 100) return '回复选项数量无效';
    echo = JSON.stringify(items);
  }
  await ctx.database.upsert('koidice_runtime_reply', [{ id: id(session, title), scope: scope(session), title, mode, keyword, echo, type }]);
  return '回复已设置';
}
