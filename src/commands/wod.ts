import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * WOD骰池命令 .ww
 */
export function registerWODCommands(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // .ww 骰池（显示详细）
  parent
    .subcommand('.ww <expression:text>', 'WOD骰池（显示详细）')
    .action(async ({ session }, expression) => {
      if (!expression) {
        return '用法: .ww <骰子数>a<加骰线>\n例如: .ww 10a8 表示投10个骰子，8点及以上加骰'
      }

      try {
        const result = parseAndRollWOD(expression, diceAdapter, true)
        return `${session.username}: ${result}`
      } catch (error) {
        logger.error('WOD骰池错误:', error)
        return `骰池失败: ${error.message}`
      }
    })

  // .w 骰池（只显示结果）
  parent
    .subcommand('.w <expression:text>', 'WOD骰池（只显示结果）')
    .action(async ({ session }, expression) => {
      if (!expression) {
        return '用法: .w <骰子数>a<加骰线>\n例如: .w 10a8 表示投10个骰子，8点及以上加骰'
      }

      try {
        const result = parseAndRollWOD(expression, diceAdapter, false)
        return `${session.username}: ${result}`
      } catch (error) {
        logger.error('WOD骰池错误:', error)
        return `骰池失败: ${error.message}`
      }
    })
}

/**
 * 解析并投掷WOD骰池
 */
function parseAndRollWOD(
  expression: string,
  diceAdapter: DiceAdapter,
  showDetail: boolean
): string {
  // 解析表达式 例如: 10a8
  const match = expression.match(/^(\d+)a(\d+)$/i)
  if (!match) {
    throw new Error('表达式格式错误，应为: <骰子数>a<加骰线>，例如: 10a8')
  }

  const diceCount = parseInt(match[1], 10)
  const againLine = parseInt(match[2], 10)

  if (diceCount < 1 || diceCount > 100) {
    throw new Error('骰子数量必须在1-100之间')
  }

  if (againLine < 2 || againLine > 10) {
    throw new Error('加骰线必须在2-10之间')
  }

  // 投掷骰子
  const results: number[] = []
  let totalDice = diceCount
  let successCount = 0

  for (let i = 0; i < totalDice; i++) {
    const roll = diceAdapter.roll('1d10', 10)
    if (roll.errorCode !== 0) {
      throw new Error(roll.errorMsg)
    }

    const value = roll.total
    results.push(value)

    // 计算成功数（8-10为成功）
    if (value >= 8) {
      successCount++
    }

    // 加骰
    if (value >= againLine && totalDice < 100) {
      totalDice++
    }
  }

  // 格式化输出
  if (showDetail) {
    const detailStr = results
      .map((v) => {
        if (v >= againLine) return `[${v}!]` // 加骰
        if (v >= 8) return `[${v}]` // 成功
        if (v === 1) return `(${v})` // 失败
        return `${v}`
      })
      .join(' ')

    return `WOD骰池 ${diceCount}a${againLine}:\n${detailStr}\n成功数: ${successCount}`
  } else {
    return `WOD骰池 ${diceCount}a${againLine}: 成功数 ${successCount}`
  }
}
