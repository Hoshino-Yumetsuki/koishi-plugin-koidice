import { Argv, type Command, type Context, type Session } from 'koishi';
import { communityCommandsEnabled } from './commands/community';
import { tableChannelCommandsEnabled } from './commands/table-links';

export type RegisterCommand = <D extends string>(
  definition: D, description: string, ...aliases: string[]
) => Command<never, never, Argv.ArgumentType<D>>;

// Only split suffixes that belong to a Dice! grammar. In particular, .rollout is not .r.
const compact = /^(?:(rdc)(?=[bp+\-\d])|(rdx|rsr|rbh|rws|武术|coc[67]?s?|dnd|setcoc|set)(?=\d)|(rnc)(?=[+\-\d])|(rfc)(?=[bw]\d)|(ak)(?=[#+=\-])|(drawh?)(?=_)|(r[ashc]?h?|hs?|ri|en|sc|ww?h?)(?=\d|[+\-(#]|[dfbpk](?:\d|\b)|[^\x00-\x7f])|(st)(?=[^\x00-\x7f&]|&|[a-z]+[:=+\-\d]))/iu;

export function createCommandRegistrar(ctx: Context, diceStyle: boolean) {
  const prefix = diceStyle ? '' : 'koidice.';
  const roots = new Set<string>();

  ctx.before('command/execute', async ({ session, command }) => {
    if (!session || !command || !ctx.filter(session)) return;
    const name = command.name;
    if (!name.startsWith(prefix)) return;
    const [root] = name.slice(prefix.length).split('.', 1);
    if (!roots.has(root)) return;
    if (root !== 'bot' && root !== 'chan' && (!await tableChannelCommandsEnabled(ctx, session)
        || !await communityCommandsEnabled(ctx, session, root))) return '';
  });

  // Koishi's own before-parse hook returns undefined to let the next parser run.
  const parseDice = (content: string, session: Session): Argv | undefined => {
    const { hasAt, appel, content: original } = session.stripped;
    if (!ctx.filter(session) || (hasAt && !appel)) return;
    const marked = diceStyle && /^[.。．!！]/u.test(original);
    const wushu = diceStyle && /^武术\d/u.test(original);
    let body = marked ? original.slice(1).trimStart() : content;
    if (!marked && !wushu && !session.isDirect && !appel && session.stripped.prefix === null) return;
    if (!diceStyle) {
      const namespace = /^(?:koidice|koid)[.\s]+/i.exec(body);
      if (!namespace) return;
      body = body.slice(namespace[0].length);
    }
    const token = /^([^\s]+)/u.exec(body)?.[1];
    if (!token) return;
    let path = token.toLowerCase();
    if (path === 'help' && (marked || !diceStyle)) path = 'dicehelp';
    let rest = body.slice(token.length);
    let cmd = ctx.$commander.resolve(prefix + path, session);
    if (!cmd) {
      const head = compact.exec(token)?.[0];
      if (!head) return;
      path = head.toLowerCase();
      cmd = ctx.$commander.resolve(prefix + path, session);
      rest = ' ' + body.slice(head.length);
    }
    if (!cmd || !roots.has(cmd.name.slice(prefix.length).split('.', 1)[0])) return;
    // A parent may accept its own arguments (.st 力量60) as well as named children (.st show).
    const child = /^\s+([^\s.]+)(?=\s|$)/u.exec(rest);
    const nested = child && ctx.$commander.resolve(`${cmd.name}.${child[1]}`, session);
    if (nested && nested.parent === cmd && child) {
      path = nested.name.slice(prefix.length);
      rest = rest.slice(child[0].length);
    }
    if (marked || wushu) session.stripped.prefix ??= marked ? original[0] : '';
    return Argv.parse(prefix + path + rest);
  };
  ctx.on('before-parse', parseDice as (content: string, session: Session) => Argv, true);

  if (!diceStyle) {
    ctx.command('koidice', 'Koidice 跑团框架')
      .alias('koid')
      .usage('使用 koidice.<子命令> 或 koid.<子命令> 调用功能');
  }

  const register: RegisterCommand = <D extends string>(definition: D, description: string, ...aliases: string[]) => {
    const [root] = definition.split(/[. ]/, 1);
    if (diceStyle) {
      if (!roots.has(root) && ctx.$commander.get(root)) {
        throw new Error(`Dice! 顶层命令 ${root} 已被占用，请解决命名冲突或关闭 Dice! 风格命令`);
      }
    }
    roots.add(root);
    // 添加命名空间不会改变 Koishi 从参数声明推断的类型。
    const command = ctx.command((prefix + definition) as D, description);
    for (const alias of aliases) command.alias(prefix + alias);
    return command;
  };
  function listCommands(): Command[] {
    const result: Command[] = [];
    const visit = (command: Command) => { result.push(command); command.children.forEach(visit); };
    for (const root of roots) {
      const command = ctx.$commander.get(prefix + root);
      if (command) visit(command);
    }
    return result;
  }
  return { register, listCommands };
}
