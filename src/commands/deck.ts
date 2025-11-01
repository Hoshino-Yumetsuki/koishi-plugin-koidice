import type { Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * 牌堆命令 .draw
 */
export function registerDeckCommands(ctx: Context, config: Config, diceAdapter: DiceAdapter) {
  ctx.command('draw <deck:text>', '从牌堆抽卡')
    .option('count', '-n <count:number> 抽取数量', { fallback: 1 })
    .action(async ({ session, options }, deck) => {
      if (!deck) {
        return '请指定牌堆名称'
      }
      
      // 限制单次抽取数量
      const maxDrawCount = 10
      if (options.count > maxDrawCount) {
        return `单次最多抽取${maxDrawCount}张`
      }

      try {
        const cards = diceAdapter.drawCard(deck, options.count)
        return `${session.username} 从 ${deck} 抽到: ${cards.join(', ')}`
      } catch (error) {
        logger.error('抽卡错误:', error)
        return '抽卡时发生错误'
      }
    })

  ctx.command('draw.reset <deck:text>', '重置牌堆')
    .action(async ({ session }, deck) => {
      if (!deck) {
        return '请指定牌堆名称'
      }

      try {
        diceAdapter.resetDeck(deck)
        return `已重置牌堆: ${deck}`
      } catch (error) {
        logger.error('重置牌堆错误:', error)
        return '重置牌堆时发生错误'
      }
    })
}
