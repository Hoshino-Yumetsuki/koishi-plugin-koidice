import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { parseStCommand } from './parser';
import { logger } from '../../index';
import type { Config } from '../../config';
import { mutateAttributes } from '../../services/character/card-operations';

export function registerStSetCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter, config?: Config) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('st [...args:text]', '人物卡管理')
    .usage('.st [人物卡名--]属性名 属性值 [属性名 属性值]...')
    .example('.st 力量 60 敏捷 70')
    .example('.st Alice--力量 60 体质 40')
    .action(async ({ session }, ...args) => {
      if (!session) {
        return '无法获取会话信息';
      }
      // 将数组参数合并为字符串
      const argsStr = args.join(' ');
      // 没有参数：显示所有人物卡列表
      if (!argsStr || argsStr.trim() === '') {
        try {
          const cards = await characterService.getAllCards(session);

          if (cards.length === 0) {
            return (
              '还没有任何人物卡\n' +
              '使用 .st 属性名 属性值 来创建人物卡\n' +
              '例如: .st 力量 60 敏捷 70'
            );
          }

          const activeCard = await characterService.getActiveCard(session);
          const cardList = cards
            .map((card) => {
              const active = card.id === activeCard?.id ? ' ★' : '';
              return `- ${card.cardName}${active}`;
            })
            .join('\n');

          return `${session.username} 的人物卡列表:\n${cardList}\n\n★ 表示当前激活的人物卡`;
        } catch (error) {
          logger.error('显示人物卡列表错误:', error);
          const message = error instanceof Error ? error.message : String(error);
          return message || '显示人物卡列表时发生错误';
        }
      }

      // 解析格式
      try {
        const { cardName, operations } = parseStCommand(argsStr, diceAdapter);

        logger.debug('解析结果:', { cardName, operations, argsStr });

        if (operations.length === 0) {
          return '未识别到有效的属性设置，请检查格式';
        }

        const targetCard = cardName || null;
        const results: string[] = [];

        // 处理每个操作
        let diceCount = 0;
        for (const op of operations) {
          const raw = op.value;
          if (typeof raw === 'string') {
            for (const match of raw.matchAll(/(\d*)[dD](\d+)/g)) {
              diceCount += Number(match[1] || 1);
              if (diceCount > (config?.maxDiceCount ?? 100) || Number(match[2]) > (config?.maxDiceFace ?? 1000)) {
                throw new Error('骰子数量或面数超过限制');
              }
            }
          }
        }
        await mutateAttributes(ctx, session, targetCard, (attributes) => {
          const keys = new Set([...Object.keys(attributes), ...operations.map((op) => op.attr)]);
          if (keys.size > (config?.maxAttributesPerCard ?? 50)) throw new Error('人物卡属性数量已达上限');
          for (const op of operations) {
            const raw = op.value;
            let value: string | number;
            if (op.expression) value = String(raw);
            else if (typeof raw === 'string' && /d/i.test(raw)) {
              const roll = diceAdapter.roll(raw);
              if (roll.errorCode) throw new Error(roll.errorMsg || '骰子表达式无效');
              value = roll.total;
            } else value = Number(raw);
            if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('属性值无效');
            if (op.op === 'set') {
              attributes[op.attr] = value;
              results.push(`${op.attr}=${value}`);
            } else {
              const currentValue = attributes[op.attr] ?? 0;
              if (typeof currentValue !== 'number' || typeof value !== 'number') throw new Error('属性不是数值');
              const newValue = op.op === 'add' ? currentValue + value : currentValue - value;
              if (!Number.isFinite(newValue)) throw new Error('属性值无效');
              attributes[op.attr] = newValue;
              results.push(`${op.attr}${op.op === 'add' ? '+' : '-'}${value}=${newValue}`);
            }
          }
          return attributes;
        });

        const prefix = cardName ? `人物卡 ${cardName}` : session.username;
        return `${prefix} ${results.join(' ')}`;
      } catch (error) {
        logger.error('设置属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '设置属性时发生错误';
      }
    });
}
