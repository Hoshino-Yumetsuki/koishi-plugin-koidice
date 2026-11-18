import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import type { RollResult } from '../wasm/types';
import { GameSessionService } from '../services/game-session-service';

const queues = new Map<string, Promise<unknown>>();

export function registerInitiativeCommands(register: RegisterCommand, ctx: Context, _config: Config, diceAdapter: DiceAdapter) {
  const games = new GameSessionService(ctx);
  const run = async (session: Session, operation: (key: string) => Promise<string>) => {
    const game = await games.getSession(session);
    const key = JSON.stringify(game ? [session.platform, `game:${game.id}`] : [session.platform, games.areaKey(session)]);
    const previous = queues.get(key) || Promise.resolve();
    const result = previous.catch(() => {}).then(async () => {
      const [record] = await ctx.database.get('koidice_initiative', { channelId: key, platform: session.platform });
      diceAdapter.clearInitiative(key);
      if (record?.data) diceAdapter.deserializeInitiative(key, record.data);
      return operation(key);
    });
    queues.set(key, result);
    try { return await result; } finally { if (queues.get(key) === result) queues.delete(key); }
  };
  const save = async (session: Session, key: string) => {
    const query = { channelId: key, platform: session.platform };
    const [record] = await ctx.database.get('koidice_initiative', query);
    const data = diceAdapter.serializeInitiative(key);
    if (record) await ctx.database.set('koidice_initiative', query, { data, updatedAt: new Date() });
    else await ctx.database.create('koidice_initiative', { ...query, data, updatedAt: new Date() });
  };
  const init = register('init', '先攻列表').action(async ({ session }) => {
    if (!session?.userId) return '无法获取会话信息';
    return run(session, async (key) => diceAdapter.getInitiativeCount(key) ? diceAdapter.getInitiativeList(key) : '当前没有先攻列表');
  });
  init.subcommand('.list', '查看先攻列表').alias('.show').action(async ({ session }) => {
    if (!session?.userId) return '无法获取会话信息';
    return run(session, async (key) => diceAdapter.getInitiativeCount(key) ? diceAdapter.getInitiativeList(key) : '当前没有先攻列表');
  });
  init.subcommand('.clr', '清空先攻列表').action(async ({ session }) => {
    if (!session?.userId) return '无法获取会话信息';
    return run(session, async (key) => {
      if (!diceAdapter.clearInitiative(key)) return '没有要清空的先攻列表';
      await ctx.database.remove('koidice_initiative', { channelId: key, platform: session.platform });
      return '已清空先攻列表';
    });
  });
  init.subcommand('.del <name:text>', '移除先攻条目').action(async ({ session }, name) => {
    if (!session?.userId) return '无法获取会话信息';
    if (!name) return '请指定要移除的名称';
    return run(session, async (key) => {
      if (!diceAdapter.removeInitiative(key, name)) return `未找到 ${name}`;
      await save(session, key);
      return `已移除 ${name}\n\n${diceAdapter.getInitiativeList(key)}`;
    });
  });
  init.subcommand('.next', '下一个回合').action(async ({ session }) => {
    if (!session?.userId) return '无法获取会话信息';
    return run(session, async (key) => {
      if (!diceAdapter.getInitiativeCount(key)) return '当前没有先攻列表';
      const result = diceAdapter.nextInitiativeTurn(key);
      if (!result.success) return result.message || '切换回合失败';
      await save(session, key);
      return `轮到 ${result.currentName} 行动！\n\n${diceAdapter.getInitiativeList(key)}`;
    });
  });
  register('ri [...args:text]', '先攻掷骰').usage('.ri [加值/表达式] [角色名]，支持 .ri+5 3#木乃伊')
    .action(async ({ session }, ...args) => {
      if (!session?.userId) return '无法获取会话信息';
      let expression = '1d20';
      let name = session.username || `用户${session.userId}`;
      const input = args.join(' ').trim();
      if (input) {
        const [first, ...rest] = input.split(/\s+/);
        if (/^[+-][0-9dDkK+\-*/()]+$/.test(first)) { expression += first; name = rest.join(' ') || name; }
        else if (/^[0-9dDkK+\-*/()]+$/.test(first) && !first.includes('#')) { expression = first; name = rest.join(' ') || name; }
        else name = input;
      }
      if (name.length > 200 || expression.length > 200) return '先攻参数过长';
      let count = 1;
      const multiple = /^(.*?)#(.*)$/.exec(name);
      if (multiple) {
        const countExpr = multiple[1].trim();
        name = multiple[2].trim();
        if (!name) return '请指定角色名';
        if (countExpr) {
          const rolled = diceAdapter.roll(countExpr, 20);
          if (rolled.errorCode !== 0) return `掷骰失败: ${rolled.errorMsg}`;
          count = rolled.total;
        }
        if (!Number.isInteger(count) || count < 1 || count > 10) return '先攻数量须为 1-10';
      }
      const rolls: RollResult[] = [];
      for (let i = 0; i < count; i++) {
        const rolled = diceAdapter.roll(expression, 20);
        if (rolled.errorCode !== 0) return `掷骰失败: ${rolled.errorMsg}`;
        if (!Number.isSafeInteger(rolled.total) || rolled.total < -2147483648 || rolled.total > 2147483647) return '先攻值超出范围';
        rolls.push(rolled);
      }
      return run(session, async (key) => {
        for (let i = 0; i < rolls.length; i++) {
          if (!diceAdapter.addInitiative(key, multiple ? `${name}${i + 1}` : name, rolls[i].total)) return '添加先攻失败';
        }
        await save(session, key);
        return `${name} 的先攻: ${rolls.map((roll) => roll.detail).join('，')}\n\n${diceAdapter.getInitiativeList(key)}`;
      });
    });
}
