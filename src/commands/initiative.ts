import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDataPath } from '../utils/path'

/**
 * 获取先攻列表文件路径
 */
function getInitiativeFilePath(channelId: string): string {
  return resolve(getDataPath(), `initiative_${channelId}.json`)
}

/**
 * 加载先攻列表
 */
function loadInitiative(channelId: string, diceAdapter: DiceAdapter): void {
  try {
    const filePath = getInitiativeFilePath(channelId)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8')
      diceAdapter.deserializeInitiative(channelId, content)
    }
  } catch (error) {
    logger.error('加载先攻列表失败:', error)
  }
}

/**
 * 保存先攻列表
 */
function saveInitiative(channelId: string, diceAdapter: DiceAdapter): void {
  try {
    const filePath = getInitiativeFilePath(channelId)
    const content = diceAdapter.serializeInitiative(channelId)
    writeFileSync(filePath, content, 'utf-8')
  } catch (error) {
    logger.error('保存先攻列表失败:', error)
  }
}

/**
 * 先攻列表命令 .init / .ri
 */
export function registerInitiativeCommands(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  // 先攻列表主命令
  parent.subcommand('.init', '先攻列表管理').action(async () => {
    return (
      '用法:\n' +
      '.init <名称> <先攻值> - 添加到先攻列表\n' +
      '.init list - 显示先攻列表\n' +
      '.init clr - 清空先攻列表\n' +
      '.init del <名称> - 移除指定条目\n' +
      '.init next - 下一个回合'
    )
  })

  // 添加先攻
  parent
    .subcommand('.init <name:text> [initiative:number]', '添加先攻')
    .action(async ({ session }, name, initiative) => {
      if (!name) {
        return '请指定名称'
      }

      try {
        const channelId = session.channelId || session.userId

        // 如果没有提供先攻值，自动掷骰
        let initValue = initiative
        if (initValue === undefined) {
          const rollResult = diceAdapter.roll('1d20', 20)
          if (rollResult.errorCode !== 0) {
            return `掷骰失败: ${rollResult.errorMsg}`
          }
          initValue = rollResult.total
        }

        // 加载现有列表
        loadInitiative(channelId, diceAdapter)

        // 添加到WASM先攻列表
        if (!diceAdapter.addInitiative(channelId, name, initValue)) {
          return '添加先攻失败'
        }

        // 保存
        saveInitiative(channelId, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `已添加 ${name} 到先攻列表，先攻值: ${initValue}\n\n${list}`
      } catch (error) {
        logger.error('添加先攻错误:', error)
        return '添加先攻时发生错误'
      }
    })

  // 显示先攻列表
  parent
    .subcommand('.init.list', '显示先攻列表')
    .alias('.init.show')
    .action(async ({ session }) => {
      try {
        const channelId = session.channelId || session.userId

        // 加载列表
        loadInitiative(channelId, diceAdapter)

        const count = diceAdapter.getInitiativeCount(channelId)

        if (count === 0) {
          return '当前没有先攻列表'
        }

        return diceAdapter.getInitiativeList(channelId)
      } catch (error) {
        logger.error('显示先攻列表错误:', error)
        return '显示先攻列表时发生错误'
      }
    })

  // 清空先攻列表
  parent
    .subcommand('.init.clr', '清空先攻列表')
    .alias('.init.clear')
    .action(async ({ session }) => {
      try {
        const channelId = session.channelId || session.userId

        if (diceAdapter.clearInitiative(channelId)) {
          // 删除文件
          try {
            const fs = require('node:fs')
            const filePath = getInitiativeFilePath(channelId)
            if (existsSync(filePath)) {
              fs.unlinkSync(filePath)
            }
          } catch {}
          return '已清空先攻列表'
        } else {
          return '没有要清空的先攻列表'
        }
      } catch (error) {
        logger.error('清空先攻列表错误:', error)
        return '清空先攻列表时发生错误'
      }
    })

  // 移除先攻条目
  parent
    .subcommand('.init.del <name:text>', '移除先攻条目')
    .alias('.init.rm')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定要移除的名称'
      }

      try {
        const channelId = session.channelId || session.userId

        // 加载列表
        loadInitiative(channelId, diceAdapter)

        if (diceAdapter.getInitiativeCount(channelId) === 0) {
          return '当前没有先攻列表'
        }

        if (!diceAdapter.removeInitiative(channelId, name)) {
          return `未找到 ${name} `
        }

        const count = diceAdapter.getInitiativeCount(channelId)
        if (count === 0) {
          // 删除文件
          try {
            const fs = require('node:fs')
            const filePath = getInitiativeFilePath(channelId)
            if (existsSync(filePath)) {
              fs.unlinkSync(filePath)
            }
          } catch {}
          return `已移除 ${name}，先攻列表已清空`
        }

        // 保存
        saveInitiative(channelId, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `已移除 ${name}\n\n${list}`
      } catch (error) {
        logger.error('移除先攻条目错误:', error)
        return '移除先攻条目时发生错误'
      }
    })

  // 下一个回合
  parent
    .subcommand('.init.next', '下一个回合')
    .alias('.init.n')
    .action(async ({ session }) => {
      try {
        const channelId = session.channelId || session.userId

        // 加载列表
        loadInitiative(channelId, diceAdapter)

        if (diceAdapter.getInitiativeCount(channelId) === 0) {
          return '当前没有先攻列表'
        }

        const result = diceAdapter.nextInitiativeTurn(channelId)

        if (!result.success) {
          return result.message || '切换回合失败'
        }

        // 保存
        saveInitiative(channelId, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `轮到 ${result.currentName} 行动！\n\n${list}`
      } catch (error) {
        logger.error('下一回合错误:', error)
        return '切换回合时发生错误'
      }
    })

  // 快速先攻 .ri
  parent
    .subcommand('.ri [modifier:number]', '快速先攻检定')
    .action(async ({ session }, modifier = 0) => {
      try {
        const channelId = session.channelId || session.userId
        const name = session.username || `用户${session.userId}`

        // 加载现有列表
        loadInitiative(channelId, diceAdapter)

        // 调用WASM先攻检定
        const result = diceAdapter.rollInitiative(channelId, name, modifier)

        if (!result.success) {
          return result.message || '先攻检定失败'
        }

        // 保存
        saveInitiative(channelId, diceAdapter)

        const list = diceAdapter.getInitiativeList(channelId)
        return `${name} 的先攻检定: ${result.detail}\n\n${list}`
      } catch (error) {
        logger.error('快速先攻错误:', error)
        return '先攻检定时发生错误'
      }
    })
}
