import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { parseAttributeList } from './parser';
import { logger } from '../../index';

export function registerStDelCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('st.del [args:text]', '删除人物卡属性')
    .usage('.st.del [人物卡名--]属性名 [属性名...]')
    .example('.st.del 力量 敏捷')
    .example('.st.del Alice--力量 敏捷')
    .example('.st.del Alice--all')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息';
      }
      try {
        if (!args || args.trim() === '') {
          return '请指定要删除的属性名，或使用 all 删除整个人物卡';
        }


        const { cardName, attributes } = parseAttributeList(args, diceAdapter);
        const targetCard = cardName || null;

        if (attributes.length === 1 && attributes[0].toLowerCase() === 'all') {
          const card = cardName ? await characterService.getCard(session, cardName) : await characterService.getActiveCard(session);
          if (!card) return '人物卡不存在';
          await ctx.database.set('koidice_character', card.id, { attributes: '{}', updatedAt: new Date() });
          return `已清空人物卡 ${card.cardName} 的属性`;
        }

        // 删除指定属性
        if (attributes.length > 0) {
          const currentAttrs = await characterService.getAttributes(session, targetCard);

          if (!currentAttrs || Object.keys(currentAttrs).length === 0) {
            return `人物卡 ${cardName || '当前'} 还没有任何属性`;
          }

          // 创建新的属性对象，排除要删除的属性
          const newAttrs = { ...currentAttrs };
          const deleted: string[] = [];
          const notFound: string[] = [];

          for (const attr of attributes) {
            if (attr in newAttrs) {
              delete newAttrs[attr];
              deleted.push(attr);
            } else {
              notFound.push(attr);
            }
          }

          if (deleted.length === 0) {
            return `未找到指定的属性: ${notFound.join(', ')}`;
          }


          // 更新属性
          // 需要先获取卡片，然后直接更新数据库
          const card = targetCard
            ? await characterService.getCard(session, targetCard)
            : await characterService.getActiveCard(session);

          if (card) {
            await ctx.database.set('koidice_character', card.id, {
              attributes: JSON.stringify(newAttrs),
              updatedAt: new Date()
            });
          }

          let result = `已删除 ${deleted.join(', ')}`;
          if (notFound.length > 0) {
            result += `\n未找到: ${notFound.join(', ')}`;
          }
          return result;
        }

        return '请指定要删除的属性名';
      } catch (error) {
        logger.error('删除属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '删除属性时发生错误';
      }
    });
}
