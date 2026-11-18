/**
 * .pc new 创建新人物卡命令
 */
import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import { CharacterService } from '../../services/character-service';
import type { ExtensionService } from '../../services/extension-service';
import type { Config } from '../../config';
import { logger } from '../../index';

/**
 * 注册 .pc new 命令
 */
export function registerPcNewCommand(
  register: RegisterCommand,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService,
  config?: Config
) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('pc.new [args:text]', '创建新人物卡')
    .usage('.pc.new ([模板]:([生成参数]:))([卡名])')
    .example('.pc.new')
    .example('.pc.new Alice')
    .example('.pc.new COC7:Alice')
    .example('.pc.new COC7:80:Alice')
    .example('.pc.new Maid:女仆小红')
    .action(async ({ session }, args) => {
      if (!session) {
        return '无法获取会话信息喵~';
      }
      try {
        // 检查人物卡数量限制
        const allCards = await characterService.getAllCards(session);
        if (allCards.length >= 16) {
          return '人物卡数量已达上限（16张），请先删除一些人物卡喵~';
        }

        let cardType = 'COC7';
        let cardName = '';
        let presets = '';

        const parts = args?.trim().split(':') ?? [];
        if (parts.length > 1) {
          cardType = parts[0].trim() || 'COC7';
          cardName = parts[parts.length - 1].trim();
          presets = parts.slice(1, -1).join(':');
        } else if (parts.length === 1) {
          if (/^COC[67]$/i.test(parts[0]) || extensionService?.getTemplate(parts[0])) cardType = parts[0];
          else cardName = parts[0];
        }
        if (/^coc[67]$/i.test(cardType)) cardType = cardType.toUpperCase();
        if (cardName.includes('=')) return '卡名不能包含等号';

        // 如果没有指定卡名，生成随机姓名
        if (!cardName) {
          const nameResult = diceAdapter.drawFromDeck('随机姓名', 1);
          if (!nameResult.success || !nameResult.cards.length) return '随机姓名生成失败';
          cardName = nameResult.cards[0].trim();
          if (!cardName) return '随机姓名生成失败';
        }

        let attributes: Record<string, number> = {};
        if (presets) {
          if (/^COC[67]$/i.test(cardType) && presets.toLowerCase() === 'pc') {
            attributes = JSON.parse(diceAdapter.parseCOCAttributes(cardType === 'COC7' ? diceAdapter.generateCOC7() : diceAdapter.generateCOC6()));
          } else if (extensionService?.getTemplate(cardType)) {
            attributes = extensionService.generatePresetAttributes(cardType, presets, {}, config);
          } else {
            return '不支持的模板生成参数';
          }
        }
        if (presets && !Object.keys(attributes).length) return '生成属性失败喵~';
        if (Object.keys(attributes).length > (config?.maxAttributesPerCard ?? 50)) return '人物卡属性数量已达上限';

        // 创建人物卡
        await characterService.createCard(session, cardName, cardType, attributes);
        await characterService.bindCard(session, cardName);

        const attrText =
          Object.keys(attributes).length > 0
            ? `\n已生成属性: ${Object.entries(attributes)
                .map(([k, v]) => `${k}=${v}`)
                .join(' ')}`
            : '';

        return `已创建${cardType}人物卡: ${cardName}${attrText}`;
      } catch (error) {
        logger.error('创建人物卡错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '创建人物卡时发生错误';
      }
    });
}
