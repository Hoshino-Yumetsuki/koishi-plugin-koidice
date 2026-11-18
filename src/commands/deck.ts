import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { GameSessionService } from '../services/game-session-service';
import { DeckService, deckScope, gameDeckScope, drawDeck, makeDeck, registerDeckSchema } from '../services/deck-service';
import { PublicDecks } from '../services/deck-public';
import { getUserNickname } from './nickname';
import { getObservers } from './observer';
import { logger } from '../index';

export function registerDeckCommands(register: RegisterCommand, ctx: Context, config: Config, diceAdapter: DiceAdapter) {
  registerDeckSchema(ctx);
  const games = new GameSessionService(ctx);
  const publicDecks = config.enableCustomDeck ? new PublicDecks(ctx, diceAdapter) : null;

  async function scope(session: Session): Promise<string> {
    const game = await games.getSession(session);
    return game ? gameDeckScope(session.platform, game.id) : deckScope(session);
  }
  const service = new DeckService(ctx);

  async function canManage(session: Session): Promise<boolean> {
    if (session.isDirect) return true;
    if (session.event.member?.roles?.some((role) => role.id === 'owner' || role.id === 'admin')) return true;
    const user = await session.observeUser(['authority']);
    return (user.authority || 0) >= 3;
  }

  async function members(session: Session): Promise<string[]> {
    if (session.isDirect || !session.guildId) throw new Error('群成员牌堆仅支持群聊');
    const cards: string[] = [];
    const seen = new Set<string>();
    let next: string | undefined;
    do {
      const page = await session.bot.getGuildMemberList(session.guildId, next);
      for (const member of page.data) {
        if (member.user?.id) cards.push(member.name || member.nick || member.user.name || member.user.id);
        if (cards.length > 256) throw new Error('群成员超过 256 人，无法创建牌堆');
      }
      next = page.next;
      if (next && seen.has(next)) throw new Error('获取群成员列表失败');
      if (next) seen.add(next);
    } while (next);
    if (!cards.length) throw new Error('群成员列表获取失败');
    return cards;
  }

  const deck = register('deck', '管理牌堆实例');
  deck.subcommand('.show [name:text]', '查看牌堆').action(async ({ session }, name) => {
    if (!config.enableCustomDeck) return '自定义牌堆已禁用，仍可抽取公共牌堆';
    if (!session) return '无法获取会话信息';
    return service.transact(await scope(session), async (decks) => {
      if (!name) return { result: Object.keys(decks).map((key) => `${key}[${decks[key].remaining.length}/${decks[key].cards.length}]`).join('、') || '牌堆实例列表为空', changed: false };
      const item = Object.hasOwn(decks, name) ? decks[name] : undefined;
      return { result: item ? `${name}: ${item.remaining.map((i) => item.cards[i]).join(' | ') || '已空'}` : '牌堆实例不存在', changed: false };
    });
  });

  async function change(session: Session, action: string, input = ''): Promise<string> {
    if (!(await canManage(session))) return '需要群管理员或信任权限';
    const game = action === 'set' || action === 'new' ? await games.getOrCreateForArea(session) : await games.getSession(session);
    const key = game ? gameDeckScope(session.platform, game.id) : deckScope(session);
    if (action === 'set' || action === 'new') {
      const equals = input.indexOf('=');
      const name = (equals < 0 ? (action === 'new' ? 'new' : input.split(/\s+/u)[0]) : input.slice(0, equals)).trim();
      const source = (equals < 0 ? input : input.slice(equals + 1)).trim();
      if (!name || name.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(name)) return '牌堆名称无效';
      let cards: string[];
      let isPublic = false;
      let external = false;
      if (action === 'new') {
        if (source.length > 32768) return '牌堆内容过长';
        cards = source.split('|').map((card) => card.trim()).filter(Boolean);
      } else if (source === 'member' || source === '群成员') {
        cards = await members(session);
      } else if (/^range(?:\s|$)/u.test(source)) {
        const parts = source.split(/\s+/u).slice(1);
        if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^-?\d{1,15}$/u.test(part))) return '范围参数无效';
        let start = Number(parts[0]);
        let end = parts[1] === undefined ? 0 : Number(parts[1]);
        const step = parts[2] === undefined ? 1 : Number(parts[2]);
        if (![start, end, step].every(Number.isSafeInteger) || step <= 0 || start === end) return '范围参数无效';
        if (start > end) [start, end] = [end, start];
        if (end - start > 1000 * step) return '范围过大';
        cards = [];
        for (let i = start; i <= end; i += step) cards.push(String(i));
      } else {
        if (!source || source.startsWith('_')) return '公共牌堆不存在';
        const builtin = diceAdapter.isBuiltinDeck(source);
        const publicCards = builtin ? diceAdapter.getPublicDeck(source) : publicDecks?.get(source) || diceAdapter.getPublicDeck(source);
        if (!publicCards) return '公共牌堆不存在';
        cards = publicCards;
        isPublic = builtin;
        external = !builtin;
      }
      const item = makeDeck(cards, isPublic, diceAdapter, action === 'set' ? 1024 : 256, external);
      return service.transact(key, async (decks) => {
        if (!Object.hasOwn(decks, name) && Object.keys(decks).length >= 10) return { result: '牌堆实例已达上限', changed: false };
        decks[name] = item;
        return { result: `已创建牌堆实例 ${name}`, changed: true };
      });
    }
    return service.transact(key, async (decks) => {
      if (action === 'clr') {
        for (const key of Object.keys(decks)) delete decks[key];
        return { result: '已清空牌堆实例', changed: true };
      }
      const name = input.trim();
      const item = Object.hasOwn(decks, name) ? decks[name] : undefined;
      if (!item) return { result: '牌堆实例不存在', changed: false };
      if (action === 'del') delete decks[name];
      else item.remaining = item.cards.map((_, i) => i);
      return { result: action === 'del' ? `已删除牌堆 ${name}` : `已重置牌堆 ${name}`, changed: true };
    });
  }

  for (const action of ['set', 'new', 'reset', 'del', 'clr']) {
    deck.subcommand(`.${action} [input:text]`, '修改牌堆实例').action(async ({ session }, input) => {
      if (!config.enableCustomDeck) return '自定义牌堆已禁用，仍可抽取公共牌堆';
      if (!session) return '无法获取会话信息';
      try { return await change(session, action, input); }
      catch (error) { logger.warn('牌堆操作失败:', error); return error instanceof Error ? error.message : '牌堆操作失败'; }
    });
  }

  async function draw(session: Session, input: string, hidden: boolean): Promise<string> {
    const match = /^\s*(\S+)(?:\s+(\S+))?\s*$/u.exec(input || '');
    if (!match) return '用法：draw 牌堆名 [数量]';
    const name = match[1].replace(/^_+/u, '');
    hidden ||= name !== match[1];
    if (!name || (match[2] && !/^[1-9]\d{0,3}$/u.test(match[2]))) return '牌堆名或数量无效';
    const count = match[2] ? Number(match[2]) : 1;
    if (count > 1024) return '抽取数量不能超过 1024';
    const cards = await service.transact(await scope(session), async (decks) => {
      const instance = config.enableCustomDeck && Object.hasOwn(decks, name) ? decks[name] : undefined;
      if (!instance && diceAdapter.isBuiltinDeck(name)) {
        const draw = diceAdapter.drawFromDeck(name, count);
        if (!draw.success) throw new Error(draw.message);
        return { result: draw.cards, changed: false };
      }
      const source = instance ? null : publicDecks?.get(name) || (config.enableCustomDeck ? diceAdapter.getPublicDeck(name) : null);
      if (!instance && !source) throw new Error('牌堆不存在');
      const item = instance || makeDeck(source!, false, diceAdapter, 1024, true);
      if (!item.remaining.length) throw new Error('牌堆已空');
      return { result: drawDeck(item, count, diceAdapter, publicDecks ? (card) => publicDecks.resolve(card) : undefined), changed: !!instance };
    });
    const nickname = await getUserNickname(session, ctx);
    const detail = `${nickname} 从牌堆 ${name} 抽取了: ${cards.join(' | ')}`;
    if (!hidden || session.isDirect) return detail;
    const userId = session.userId;
    if (!userId) throw new Error('无法获取用户信息');
    try { await session.bot.sendPrivateMessage(userId, detail); }
    catch (error) { logger.warn('私发暗抽结果失败:', error); return '暗抽结果私发失败'; }
    if (session.channelId) {
      const observers = await getObservers(ctx, session);
      for (const observer of new Set(observers)) {
        if (observer === userId || observer === '__mode__') continue;
        try { await session.bot.sendPrivateMessage(observer, detail); }
        catch (error) { logger.warn('私发旁观者失败:', error); }
      }
    }
    return `${nickname} 进行了一次暗抽`;
  }

  for (const command of ['draw', 'drawh']) {
    register(`${command} [input:text]`, '从牌堆抽卡').action(async ({ session }, input) => {
      if (!session) return '无法获取会话信息';
      try { return await draw(session, input || '', command === 'drawh'); }
      catch (error) { logger.warn('抽卡失败:', error); return error instanceof Error ? error.message : '抽卡失败'; }
    });
  }
  const listDecks = () => {
    const external = publicDecks?.list() || [];
    return diceAdapter.listDecks() + (external.length ? `\n扩展牌堆: ${external.join('、')}` : '');
  };
  register('draw.list', '列出公共牌堆').action(listDecks);
  return listDecks;
}
