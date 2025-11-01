import type { Context } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import type { RollResult } from '../wasm'
import { logger } from '../index'

/**
 * 基础掷骰命令 .r
 */
export function registerRollCommand(ctx: Context, config: Config, diceAdapter: DiceAdapter) {
  ctx.command('r <expression:text>', '掷骰子')
    .alias('roll')
    .option('reason', '-r <reason:text> 掷骰原因')
    .option('hidden', '-h 暗骰')
    .action(async ({ session, options }, expression) => {
      if (!expression) {
        expression = `1d${config.defaultDice}`
      }

      try {
        if (options.hidden) {
          const success = diceAdapter.hiddenRoll(expression, config.defaultDice)
          return `${session.username} 进行了暗骰${options.reason ? ` (${options.reason})` : ''}`
        }

        const result: RollResult = diceAdapter.roll(expression, config.defaultDice)
        
        if (result.errorCode !== 0) {
          return `掷骰失败: ${result.errorMsg}`
        }

        const parts = [session.username]
        if (options.reason) {
          parts.push(options.reason)
        }
        
        // 根据配置决定是否显示详细结果
        if (config.showDetail) {
          parts.push(result.detail)
        } else {
          parts.push(`结果: ${result.total}`)
        }
        
        return parts.join(' ')
      } catch (error) {
        logger.error('掷骰错误:', error)
        return '掷骰时发生错误'
      }
    })
}
