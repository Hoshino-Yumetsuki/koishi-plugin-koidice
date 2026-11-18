import type { Context, Session } from 'koishi';
import type { DiceAdapter } from '../../wasm';
import type { LoadedPlugin } from './types';
import { logger } from '../../index';
import { loadDataSnapshot, persistWrites } from './command-registry';

function seconds(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const parts = value as Record<string, unknown>;
  if (Object.keys(parts).some((key) => !['second', 'minute', 'hour', 'day'].includes(key))) return;
  let total = 0;
  for (const [key, factor] of Object.entries({ second: 1, minute: 60, hour: 3600, day: 86400 })) {
    const part = parts[key] ?? 0;
    if (typeof part !== 'number' || !Number.isInteger(part) || part < 0) return;
    total += part * factor;
  }
  return total;
}

function atLocalTime(hour: number, minute: number, run: () => void): () => void {
  let timer: NodeJS.Timeout;
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    timer = setTimeout(() => { schedule(); run(); }, next.getTime() - now.getTime());
  };
  schedule();
  return () => clearTimeout(timer);
}

export function registerPluginEvents(ctx: Context, adapter: DiceAdapter, plugin: LoadedPlugin): Array<() => void> {
  const disposers: Array<() => void> = [];
  let active = true;
  disposers.push(() => { active = false; });
  if (plugin.events.size > 128) throw new Error(`Too many events in ${plugin.name}`);
  for (const [id, definition] of plugin.events) {
    if (Array.isArray(definition.trigger.clock) && definition.trigger.clock.length > 32) throw new Error(`Too many clocks in ${plugin.name}/${id}`);
  }
  for (const [id, definition] of plugin.events) {
    const { trigger, action } = definition;
    const actionKeys = Object.keys(action);
    if (actionKeys.length !== 1 || !['lua', 'js'].includes(actionKeys[0])) {
      logger.warn(`Unsupported event action ${plugin.name}/${id}`);
      continue;
    }
    const source = action[actionKeys[0]];
    if (!definition.script && (typeof source !== 'string' || !source)) {
      logger.warn(`Unsupported event script ${plugin.name}/${id}`);
      continue;
    }
    const script = definition.script ?? (String(source).startsWith(`${plugin.name}.`) ? String(source) : `${plugin.name}.${source}`);
    if (!plugin.scriptNames.has(script)) {
      logger.warn(`Event script not found: ${plugin.name}/${id}`);
      continue;
    }
    const invoke = async (event: Record<string, unknown>, session?: Session) => {
      if (!active) return;
      try {
        const context = { __eventKey: definition.callbackKey, event, suffix: '', uid: String(event.uid ?? ''), gid: String(event.gid ?? ''), private: !event.gid, card: '', game: {}, playerCards: {}, pluginRules: {}, templateAliasMap: {} };
        const snapshot = session ? await loadDataSnapshot(ctx, session.platform, session.selfId, plugin.name, context.uid, context.gid) : undefined;
        if (!active) return;
        const { result, writes } = adapter.callExtension(script, context, snapshot);
        if (result.startsWith('[Error]')) logger.warn(`Event ${plugin.name}/${id}: ${result}`);
        else if (session && active) await persistWrites(ctx, session.platform, session.selfId, plugin.name, writes, () => active);
      } catch (error) {
        logger.warn(`Event ${plugin.name}/${id} failed: ${String(error)}`);
      }
    };
    const unknown = Object.keys(trigger).filter((key) => !['hook', 'cycle', 'clock'].includes(key));
    if (unknown.length) logger.warn(`Unsupported event triggers ${plugin.name}/${id}: ${unknown.join(', ')}`);
    if (trigger.hook !== undefined) {
      const hook = trigger.hook;
      if (hook === 'StartUp') {
        disposers.push(ctx.on('ready', () => invoke({ Event: hook })));
      } else if (hook === 'DayNew' || hook === 'DayEnd') {
        disposers.push(atLocalTime(0, 0, () => {
          const day = new Date();
          if (hook === 'DayEnd') day.setDate(day.getDate() - 1);
          void invoke({ Event: hook, year: day.getFullYear(), month: day.getMonth() + 1, day: day.getDate() });
        }));
      } else if (hook === 'Message') {
        disposers.push(ctx.on('message', async session => {
          if (!session.platform || !session.selfId || !session.userId) return;
          const event: Record<string, unknown> = { Event: hook, uid: session.userId, fromMsg: session.content ?? '' };
          if (session.guildId) event.gid = session.guildId;
          if (session.channelId && session.guildId) event.chid = session.channelId;
          if (session.messageId) event.msgid = session.messageId;
          if (session.timestamp) event.time = Math.floor(session.timestamp / 1000);
          await invoke(event, session);
        }));
      } else {
        logger.warn(`Unsupported event hook ${plugin.name}/${id}: ${String(hook)}`);
      }
    }
    if (trigger.cycle !== undefined) {
      const cycle = seconds(trigger.cycle);
      if (!cycle || !Number.isSafeInteger(cycle) || cycle < 1 || cycle > 2147483) {
        logger.warn(`Invalid event cycle ${plugin.name}/${id}`);
      } else {
        const timer = setInterval(() => { void invoke({ id }); }, cycle * 1000);
        disposers.push(() => clearInterval(timer));
      }
    }
    if (trigger.clock !== undefined) {
      const clocks = Array.isArray(trigger.clock) ? trigger.clock : [trigger.clock];
      for (const clock of clocks) {
        if (!clock || typeof clock !== 'object' || Array.isArray(clock)) { logger.warn(`Invalid event clock ${plugin.name}/${id}`); continue; }
        const { hour, minute } = clock as Record<string, unknown>;
        if (!Number.isInteger(hour) || !Number.isInteger(minute) || (hour as number) < 0 || (hour as number) > 23 || (minute as number) < 0 || (minute as number) > 59) { logger.warn(`Invalid event clock ${plugin.name}/${id}`); continue; }
        disposers.push(atLocalTime(hour as number, minute as number, () => { void invoke({ id }); }));
      }
    }
  }
  return disposers;
}
