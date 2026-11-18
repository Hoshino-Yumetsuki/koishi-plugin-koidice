/**
 * .pc build 根据模板生成属性命令
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
 * 注册 .pc build 命令
 */
export function registerPcBuildCommand(register: RegisterCommand, ctx: Context, diceAdapter: DiceAdapter, config?: Config, extensionService?: ExtensionService) {
  const characterService = new CharacterService(ctx, diceAdapter);

  register('pc.build [args:text]', '为人物卡生成属性')
    .usage('.pc.build ([生成参数]:)(卡名)')
    .example('.pc.build')
    .example('.pc.build Alice')
    .example('.pc.build 80:Alice')
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

        const cardType = targetCard.cardType;
        const builtin = /^COC[67]$/i.test(cardType);
        if (builtin && preset.toLowerCase() !== 'pc') return '不支持的模板生成参数';
        if (!builtin && !extensionService?.getTemplate(cardType)) return `暂不支持 ${cardType} 类型的属性生成喵~`;
        let attributes: Record<string, number> = {};
        await mutateAttributes(ctx, session, cardName, (existing) => {
          const initial = existing as Record<string, number>;
          const generated = builtin
            ? JSON.parse(diceAdapter.parseCOCAttributes(cardType.toUpperCase() === 'COC7' ? diceAdapter.generateCOC7() : diceAdapter.generateCOC6())) as Record<string, number>
            : extensionService!.generatePresetAttributes(cardType, preset, initial, config);
          if (!Object.keys(generated).length) throw new Error('生成属性失败喵~');
          attributes = Object.fromEntries(Object.entries(generated).filter(([key]) => existing[key] == null));
          const merged = { ...existing, ...attributes };
          if (Object.keys(merged).length > (config?.maxAttributesPerCard ?? 50)) throw new Error('人物卡属性数量已达上限');
          return merged;
        });
        await characterService.bindCard(session, cardName);

        const attrText = Object.entries(attributes)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');

        return `已为人物卡 ${cardName} 生成属性:\n${attrText}`;
      } catch (error) {
        logger.error('生成属性错误:', error);
        const message = error instanceof Error ? error.message : String(error);
        return message || '生成属性时发生错误';
      }
    });
}
