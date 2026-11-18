import type { Context, Session } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import { GameSessionService } from '../services/game-session-service';

interface AnkoSession {
  scope: string;
  title: string;
  options: string[];
}

declare module 'koishi' {
  interface Tables { koidice_anko: AnkoSession }
}

const queues = new Map<string, Promise<unknown>>();

async function scopeFor(session: Session, games: GameSessionService): Promise<string> {
  const game = await games.getSession(session);
  return JSON.stringify(game ? [session.platform, `game:${game.id}`] : [session.platform, games.areaKey(session)]);
}

export function registerAnkoCommands(register: RegisterCommand, ctx: Context, _config: Config) {
  ctx.model.extend('koidice_anko', {
    scope: 'string', title: 'text', options: 'json'
  }, { primary: 'scope' });
  const games = new GameSessionService(ctx);
  return register('ak [...args:text]', '安价/安科 - 分歧选择系统')
    .usage('.ak#[标题][+选项|选项]、.ak+选项、.ak-序号、.ak=、.ak show、.ak clr')
    .action(async ({ session }, ...args) => {
      if (!session?.userId) return '无法获取会话信息';
      const scope = await scopeFor(session, games);
      const run = async () => {
        const input = args.join(' ').trim();
        const [stored] = await ctx.database.get('koidice_anko', { scope });
        let current = stored;
        const save = async () => {
          if (stored) await ctx.database.set('koidice_anko', { scope }, { title: current.title, options: current.options });
          else await ctx.database.create('koidice_anko', current);
        };
        const show = () => !current ? '当前没有进行中的分歧\n使用 .ak# [标题] 创建新分歧' :
          `分歧「${current.title}」\n${current.options.length ? current.options.map((option, index) => `${index + 1}. ${option}`).join('\n') : '暂无选项'}`;
        if (!input || input === 'show') return show();
        const creation = /^(?:#|new(?:\s+|$))(.*)$/isu.exec(input);
        if (creation) {
          const [title, ...parts] = creation[1].split('+');
          const options = parts.join('+').split('|').map((item) => item.trim()).filter(Boolean);
          if (options.length > 100 || input.length > 10000) return '选项过多或内容过长';
          current = { scope, title: title.trim() || '未命名分歧', options };
          await save();
          return `已创建新分歧「${current.title}」${options.length ? `\n${show()}` : '，请使用 .ak+ 添加选项'}`;
        }
        const addition = /^(?:\+|add(?:\s+|$))(.*)$/isu.exec(input);
        if (addition) {
          const options = addition[1].split('|').map((item) => item.trim()).filter(Boolean);
          if (!options.length) return '请输入要添加的选项';
          if (!current) current = { scope, title: '未命名分歧', options: [] };
          if (current.options.length + options.length > 100 || input.length > 10000) return '选项过多或内容过长';
          current.options.push(...options);
          await save();
          return `已添加 ${options.length} 个选项:\n${show()}`;
        }
        const deletion = /^(?:-|del(?:\s+|$))(.*)$/isu.exec(input);
        if (deletion) {
          if (!current) return '当前没有进行中的分歧';
          const value = deletion[1].trim();
          const index = /^\d+$/.test(value) ? Number(value) : NaN;
          if (!Number.isSafeInteger(index) || index < 1 || index > current.options.length) return `无效的序号，请输入 1-${current.options.length} 之间的数字`;
          const [deleted] = current.options.splice(index - 1, 1);
          await save();
          return `已删除选项 ${index}: ${deleted}`;
        }
        if (input === '=' || input === 'get') {
          if (!current?.options.length) return '当前分歧没有任何选项';
          const index = Math.floor(Math.random() * current.options.length);
          const result = `${session.username || session.userId} 的安价结果:\n「${current.title}」\n抽取到: ${index + 1}. ${current.options[index]}`;
          await ctx.database.remove('koidice_anko', { scope });
          return result;
        }
        if (input === 'clr' || input === 'clear') {
          if (!current) return '当前没有进行中的分歧';
          await ctx.database.remove('koidice_anko', { scope });
          return `已清除分歧「${current.title}」`;
        }
        return '未知命令，使用 .ak 查看帮助';
      };
      const previous = queues.get(scope) || Promise.resolve();
      const result = previous.catch(() => {}).then(run);
      queues.set(scope, result);
      try { return await result; } finally { if (queues.get(scope) === result) queues.delete(scope); }
    });
}
