import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';

export function registerStClrCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('st.clr [cardName:text]', '清空人物卡属性')
    .usage('.st.clr [人物卡名]')
    .example('.st.clr')
    .example('.st.clr Alice')
    .action(async ({ session }, cardName) => {
      if (!session) {
        return '无法获取会话信息';
      }
      try {
        const card = cardName ? await characterService.getCard(session, cardName) : await characterService.getActiveCard(session);
        if (!card) return '人物卡不存在';
        await ctx.database.set('koidice_character', card.id, { attributes: '{}', updatedAt: new Date() });
        return `已清空人物卡 ${card.cardName} 的属性`;
      } catch (error) {
        logger.error('删除人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '删除人物卡时发生错误';
      }
    });
}
