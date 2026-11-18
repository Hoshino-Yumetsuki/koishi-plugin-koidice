import type { Context, Session } from 'koishi';
import { RE2JS } from 're2js';
import type { DiceAdapter, ExtensionDataSnapshot, ExtensionDataWrite } from '../../wasm';
import type {
  DescriptorJson,
  ExtensionContext,
  ReplyConfig,
  ReplyEcho,
  ReplyLimit,
  ReplyMatchMode
} from './types';
import { logger } from '../../index';
import { communityCommandsEnabled, communityRepliesEnabled } from '../../commands/community';
import { getActiveCard } from '../character/card-operations';
import { tableChannelCommandsEnabled } from '../../commands/table-links';
import { getUserNickname } from '../../commands/nickname';
import { replacePlaceholders } from './script-wrapper';
import type { CharacterService } from '../character-service';
import type { GameSessionService } from '../game-session-service';

interface MatchResult {
  suffix: string;
}

interface RegisteredReply {
  config: ReplyConfig;
  scriptName?: string;
  matchers: Array<{ mode: ReplyMatchMode; value: string | RE2JS }>;
}

export async function registerPluginCommands(
  ctx: Context,
  adapter: DiceAdapter,
  descriptor: DescriptorJson,
  commands: Map<string, ReplyConfig>,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<Array<() => void>> {
  const disposers: Array<() => void> = [];
  const replies: RegisteredReply[] = [];

  for (const [name, config] of commands) {
    const echo = normalizeEcho(config.echo);
    const script = echo.lua || echo.js;
    const scriptName = script
      ? script.startsWith(`${descriptor.name}.`)
        ? script
        : `${descriptor.name}.${script}`
      : undefined;
    const matchers = compileMatchers(name, config);
    if (!matchers.length) continue;
    replies.push({ config, scriptName, matchers });
  }

  if (!replies.length) return disposers;

  const dispose = ctx.middleware(async (session, next) => {
    const content = session.stripped?.content ?? session.content ?? '';
    for (const mode of ['match', 'prefix', 'search', 'regex'] as const) {
      const candidates = replies
        .map((reply) => ({ reply, matched: matchReply(reply, content, mode) }))
        .filter((candidate) => candidate.matched)
        .sort((left, right) => right.matched!.matchedLength - left.matched!.matchedLength);
      for (const { reply, matched } of candidates) {
        const type = (reply.config.type || 'Reply').toLowerCase();
        if (type === 'nor') continue;
        if (type === 'game' || reply.config.rule) {
          const game = await gameSessionService.getSession(session);
          if (!game || !gameSessionService.isParticipant(game, session.userId || '')) continue;
          if (reply.config.rule && gameSessionService.gameToContext(game).rule !== reply.config.rule) continue;
        }
        if (type === 'reply' && !(await communityRepliesEnabled(ctx, session))) continue;
        if (!allowsSession(reply.config.limit, session)) continue;
        if (!passesProbability(reply.config.limit?.prob)) continue;
        if (!(await tableChannelCommandsEnabled(ctx, session))) continue;
        if (!(await communityCommandsEnabled(ctx, session))) continue;
        const result = await executeReply(
          ctx,
          adapter,
          descriptor,
          reply,
          matched!.suffix,
          session,
          characterService,
          gameSessionService,
          pluginRules,
          templateAliasMap
        );
        if (result) await session.send(result);
        return;
      }
    }
    return next();
  }, true);
  disposers.push(dispose);
  return disposers;
}

function compileMatchers(name: string, config: ReplyConfig) {
  const keyword = config.keyword || {};
  const result: RegisteredReply['matchers'] = [];
  const append = (mode: ReplyMatchMode, input?: string | string[]) => {
    for (const value of asArray(input)) {
      if (!value) continue;
      if (mode === 'regex') {
        try {
          if (value.length > 512) throw new Error('pattern exceeds 512 characters');
          result.push({ mode, value: RE2JS.compile(`\\A(?:${value})\\z`, RE2JS.CASE_INSENSITIVE) });
        } catch (error) {
          logger.warn(`Invalid extension regex ${value}: ${String(error)}`);
        }
      } else {
        result.push({ mode, value });
      }
    }
  };
  append('match', keyword.match ?? keyword.Match);
  append('prefix', keyword.prefix ?? keyword.Prefix);
  append('search', keyword.search ?? keyword.Search);
  append('regex', keyword.regex ?? keyword.Regex);
  if (!result.length && !asArray(keyword.regex ?? keyword.Regex).length) append('match', name);
  return result;
}

function matchReply(
  reply: RegisteredReply,
  content: string,
  mode: ReplyMatchMode
): (MatchResult & { matchedLength: number }) | undefined {
  const foldedContent = content.toLocaleLowerCase();
  for (const matcher of reply.matchers) {
    if (matcher.mode !== mode) continue;
    if (matcher.value instanceof RE2JS) {
      if (content.length > 4096) continue;
      const match = matcher.value.exec(content);
      if (match) {
        return { suffix: match[1] ?? '', matchedLength: match[0].length };
      }
      continue;
    }
    const keyword = matcher.value;
    const foldedKeyword = keyword.toLocaleLowerCase();
    if (mode === 'match' && foldedContent === foldedKeyword) {
      return { suffix: '', matchedLength: keyword.length };
    }
    if (mode === 'prefix' && foldedContent.startsWith(foldedKeyword)) {
      return { suffix: content.slice(keyword.length).trim(), matchedLength: keyword.length };
    }
    if (mode === 'search') {
      const index = foldedContent.indexOf(foldedKeyword);
      if (index >= 0) {
        return {
          suffix: content.slice(index + keyword.length).trim(),
          matchedLength: keyword.length
        };
      }
    }
  }
}

async function executeReply(
  ctx: Context,
  adapter: DiceAdapter,
  descriptor: DescriptorJson,
  reply: RegisteredReply,
  suffix: string,
  session: Session,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<string> {
  try {
    const context = await buildExtensionContext(
      ctx,
      session,
      suffix,
      characterService,
      gameSessionService,
      pluginRules,
      templateAliasMap
    );
    if (reply.config.callbackKey) context.__replyKey = reply.config.callbackKey;
    let result = '';
    const echo = normalizeEcho(reply.config.echo);
    if (reply.scriptName) {
      const snapshot = await loadDataSnapshot(ctx, session.platform, session.selfId, descriptor.name, context.uid, context.gid);
      const call = adapter.callExtension(reply.scriptName, context, snapshot);
      result = call.result;
      if (!result.startsWith('[Error]')) await persistWrites(ctx, session.platform, session.selfId, descriptor.name, call.writes);
    } else if (echo.deck?.length) {
      result = drawReplyCard(echo.deck);
    } else {
      result = echo.text || '';
    }
    return replacePlaceholders(result, {
      username: await getUserNickname(session, ctx),
      userId: session.userId,
      guildId: session.guildId,
      charName:
        typeof context.char?.__Name === 'string'
          ? context.char.__Name
          : typeof context.char?.name === 'string'
            ? context.char.name
            : '',
      card: context.card
    });
  } catch (error) {
    logger.error(`Extension reply failed (${descriptor.name}):`, error);
    return `[错误] ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function buildExtensionContext(
  ctx: Context,
  session: Session,
  suffix: string,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, unknown>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<ExtensionContext> {
  let char: Record<string, unknown> | undefined;
  try {
    const active =
      (session.guildId && (await characterService.getBoundCard(session))) ||
      (await characterService.getActiveCard(session));
    if (active) {
      const attributes =
        typeof active.attributes === 'string' ? JSON.parse(active.attributes) : active.attributes;
      char = {
        __Name: active.cardName,
        name: active.cardName,
        type: active.cardType,
        ...attributes
      };
    }
  } catch (error) {
    logger.debug('读取扩展角色卡失败:', error);
  }

  let game: Record<string, unknown> = {};
  try {
    const current = await gameSessionService.getSession(session);
    if (current) game = gameSessionService.gameToContext(current);
  } catch (error) {
    logger.debug('读取扩展游戏会话失败:', error);
  }

  const playerCards: Record<string, Record<string, unknown>> = {};
  if (Array.isArray(game.pls)) {
    for (const uid of game.pls) {
      if (typeof uid !== 'string') continue;
      const player = await getActiveCard(ctx, {
        userId: uid, platform: session.platform, guildId: session.guildId
      } as Session);
      if (!player) continue;
      const attributes = typeof player.attributes === 'string'
        ? JSON.parse(player.attributes) : player.attributes;
      playerCards[uid] = { __Name: player.cardName, name: player.cardName, type: player.cardType, ...attributes };
    }
  }
  const gid = session.guildId || '';
  const cardRows = gid
    ? await ctx.database.get('koidice_group_data', {
        guildId: gid,
        dataKey: `card#${session.userId}`
      })
    : [];

  return {
    suffix,
    uid: session.userId || '',
    gid,
    private: !session.guildId,
    char,
    card: cardRows[0]?.dataValue || '',
    game,
    playerCards,
    pluginRules: Object.fromEntries(pluginRules),
    templateAliasMap: templateAliasMap ? Object.fromEntries(templateAliasMap) : {}
  };
}

function drawReplyCard(cards: string[]): string {
  if (cards.length === 1) return cards[0];
  const entries = cards.map((card) => {
    const match = /::(\d{1,6})::/u.exec(card);
    const weight = match ? Number(match[1]) : 0;
    return weight > 0 && match
      ? { value: card.slice(match.index + match[0].length), weight }
      : { value: card, weight: 1 };
  });
  let choice = Math.floor(Math.random() * entries.reduce((sum, entry) => sum + entry.weight, 0));
  for (const entry of entries) {
    if (choice < entry.weight) return entry.value;
    choice -= entry.weight;
  }
  return '';
}

export async function loadDataSnapshot(
  ctx: Context,
  platform: string,
  selfId: string,
  plugin: string,
  uid: string,
  gid: string
): Promise<ExtensionDataSnapshot> {
  const users = uid ? await ctx.database.get('koidice_user_data', { userId: JSON.stringify([platform, selfId, plugin, uid]) }) : [];
  const groups = gid ? await ctx.database.get('koidice_group_data', { guildId: JSON.stringify([platform, selfId, plugin, gid]) }) : [];
  return {
    users: users.map((row) => ({ id: uid, key: row.dataKey, value: row.dataValue })),
    groups: groups.map((row) => ({ id: gid, key: row.dataKey, value: row.dataValue }))
  };
}

export async function persistWrites(ctx: Context, platform: string, selfId: string, plugin: string, writes: ExtensionDataWrite[], active = () => true) {
  const users = new Map<string, { userId: string; dataKey: string; dataValue: string }>();
  const groups = new Map<string, { guildId: string; dataKey: string; dataValue: string }>();
  for (const write of writes) {
    const key = JSON.stringify([write.id, write.key]);
    const owner = JSON.stringify([platform, selfId, plugin, write.id]);
    if (write.scope === 'user') users.set(key, { userId: owner, dataKey: write.key, dataValue: write.value });
    else if (write.scope === 'group') groups.set(key, { guildId: owner, dataKey: write.key, dataValue: write.value });
  }
  if (users.size && active()) await ctx.database.upsert('koidice_user_data', [...users.values()], ['userId', 'dataKey']);
  if (groups.size && active()) await ctx.database.upsert('koidice_group_data', [...groups.values()], ['guildId', 'dataKey']);
}

function allowsSession(limit: ReplyLimit | undefined, session: Session): boolean {
  return (
    allowsId(limit?.user_id, session.userId || '') && allowsId(limit?.grp_id, session.guildId || '')
  );
}

function allowsId(limit: ReplyLimit['user_id'], id: string): boolean {
  if (!limit) return true;
  if (typeof limit === 'string' || Array.isArray(limit)) return asArray(limit).includes(id);
  const only = asArray(limit.only);
  const not = asArray(limit.not);
  if (only.length && !only.includes(id)) return false;
  if (not.includes(id)) return false;
  const nor = asArray(limit.nor).map(String);
  if (nor.includes('0') && !id) return false;
  return !nor.includes(id);
}

function passesProbability(probability?: number): boolean {
  if (!probability) return true;
  return Math.random() * 100 < Math.max(0, Math.min(100, probability));
}

function normalizeEcho(echo: ReplyConfig['echo']): ReplyEcho {
  if (typeof echo === 'string') return { text: echo };
  if (Array.isArray(echo)) return { deck: echo };
  return echo || {};
}

function asArray<T>(value?: T | T[]): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}
