import type { Argv, Command, Context } from 'koishi';

export type RegisterCommand = <D extends string>(
  definition: D, description: string, ...aliases: string[]
) => Command<never, never, Argv.ArgumentType<D>>;

export function createCommandRegistrar(ctx: Context, diceStyle: boolean): RegisterCommand {
  const prefix = diceStyle ? '' : 'koidice.';
  const roots = new Set<string>();

  if (diceStyle) {
    // Koishi 的点号表示子命令；Dice! 的首个标点是消息触发符，不属于命令名。
    ctx.middleware((session, next) => {
      const { content, hasAt, appel } = session.stripped;
      if (hasAt && !appel) return next();
      const match = /^[.。!！]([^\s]+)/u.exec(content);
      if (!match) return next();
      const command = ctx.$commander.resolve(match[1], session);
      if (!command || !roots.has(command.name.split('.', 1)[0])) return next();
      return session.execute(content.slice(1), next);
    });
  } else {
    ctx.command('koidice', 'Dice! TRPG骰子机器人')
      .alias('koid')
      .usage('使用 koidice.<子命令> 或 koid.<子命令> 调用功能');
  }

  return <D extends string>(definition: D, description: string, ...aliases: string[]) => {
    if (diceStyle) {
      const [root] = definition.split(/[. ]/, 1);
      if (!roots.has(root) && ctx.$commander.get(root)) {
        throw new Error(`Dice! 顶层命令 ${root} 已被占用，请解决命名冲突或关闭 Dice! 风格命令`);
      }
      roots.add(root);
    }
    // 添加命名空间不会改变 Koishi 从参数声明推断的类型。
    const command = ctx.command((prefix + definition) as D, description);
    for (const alias of aliases) command.alias(prefix + alias);
    return command;
  };
}
