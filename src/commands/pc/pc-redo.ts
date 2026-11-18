/**
 * .pc redo 清空并重新生成属性命令
 */
import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import { logger } from '../../index';
import type { Config } from '../../config';
import type { ExtensionService } from '../../services/extension-service';
import { mutateAttributes } from '../../services/character';

/**
 * 注册 .pc redo 命令
 */
export function registerPcRedoCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter, config?: Config, extensionService?: ExtensionService) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('pc.redo [args:text]', '清空并重新生成人物卡属性')
    .usage('.pc.redo ([生成参数]:)(卡名)')
    .example('.pc.redo')
    .example('.pc.redo Alice')
    .example('.pc.redo 80:Alice')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        let cardName = '';
        let preset = 'pc';

        if (args?.trim()) {
          const parts = args.trim().split(':');
          cardName = parts.pop()?.trim() ?? '';
          preset = parts.join(':') || 'pc';
        }

        // 获取目标卡
        let targetCard = null;
        if (cardName) {
          targetCard = await characterService.getCard(session, cardName);
          if (!targetCard) {
            targetCard = await characterService.createCard(session, cardName);
          }
        } else {
          targetCard = await characterService.getBoundCard(session);
          if (!targetCard) {
            return '当前没有绑定人物卡，请使用 .pc.tag 绑定或指定卡名喵~';
          }
          cardName = targetCard.cardName;
        }

        // 根据卡类型生成属性
        let attributes: Record<string, number> = {};
        const cardType = targetCard.cardType;
        if ((cardType.toUpperCase() === 'COC7' || cardType.toUpperCase() === 'COC6') && preset.toLowerCase() !== 'pc') return '不支持的模板生成参数';

        if (cardType === 'COC7') {
          const cocResult = diceAdapter.generateCOC7();
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else if (cardType === 'COC6') {
          const cocResult = diceAdapter.generateCOC6();
          const jsonResult = diceAdapter.parseCOCAttributes(cocResult);
          if (jsonResult && typeof jsonResult === 'string') {
            try {
              attributes = JSON.parse(jsonResult) as Record<string, number>;
            } catch (e) {
              logger.warn('解析COC属性失败:', e);
            }
          }
        } else {
          if (!extensionService?.getTemplate(cardType)) return `暂不支持 ${cardType} 类型的属性生成喵~`;
          attributes = extensionService.generatePresetAttributes(cardType, preset, {}, config);
        }

        if (Object.keys(attributes).length === 0) {
          return '生成属性失败喵~';
        }
        if (Object.keys(attributes).length > (config?.maxAttributesPerCard ?? 50)) return '人物卡属性数量已达上限';

        await mutateAttributes(ctx, session, cardName, () => attributes);
        await characterService.bindCard(session, cardName);

        const attrText = Object.entries(attributes)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');

        return `已重新生成人物卡 ${cardName} 的属性:\n${attrText}`;
      } catch (error) {
        logger.error('重新生成属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '重新生成属性时发生错误';
      }
    });
}
