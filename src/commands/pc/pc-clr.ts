/**
 * .pc clr 清空所有人物卡命令
 */
import type { Command, Context } from 'koishi'
import type { DiceAdapter } from '../../wasm'
import { CharacterService } from '../../services/character-service'
import { logger } from '../../index'

/**
 * 注册 .pc clr 命令
 */
export function registerPcClrCommand(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.pc.clr', '清空所有人物卡')
    .usage('.pc.clr')
    .example('.pc.clr')
    .action(async ({ session }) => {
      try {
        const count = await characterService.clearAllCards(session)

        return count > 0
          ? `已清空所有人物卡 (共${count}张)`
          : '没有人物卡需要清空喵~'
      } catch (error) {
        logger.error('清空人物卡错误:', error)
        return error.message || '清空人物卡时发生错误'
      }
    })
}
