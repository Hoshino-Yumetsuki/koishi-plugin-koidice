import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'

/**
 * 旁观者列表（按频道存储）
 */
const observers = new Map<string, Set<string>>()

/**
 * 旁观模式开关（按频道存储）
 */
const observerMode = new Map<string, boolean>()

/**
 * 旁观模式命令 .ob
 */
export function registerObserverCommands(
  parent: Command,
  _config: Config,
  _diceAdapter: DiceAdapter
) {
  parent
    .subcommand('ob [action:text]', '旁观模式')
    .action(async ({ session }, action) => {
      const channelId = session.channelId
      const userId = session.userId

      if (!channelId) {
        return '旁观模式仅在群聊中可用'
      }

      try {
        if (!action) {
          return (
            '用法:\n' +
            '.ob join - 加入旁观\n' +
            '.ob exit - 退出旁观\n' +
            '.ob list - 查看旁观者\n' +
            '.ob clr - 清除所有旁观者\n' +
            '.ob on/off - 开启/关闭旁观模式'
          )
        }

        const lowerAction = action.toLowerCase()

        switch (lowerAction) {
          case 'join': {
            if (!observerMode.get(channelId)) {
              return '本桌旁观模式未开启'
            }

            if (!observers.has(channelId)) {
              observers.set(channelId, new Set())
            }
            observers.get(channelId)?.add(userId)
            return `${session.username} 已加入旁观`
          }

          case 'exit': {
            const channelObservers = observers.get(channelId)
            if (!channelObservers || !channelObservers.has(userId)) {
              return '你不在旁观列表中'
            }
            channelObservers.delete(userId)
            return `${session.username} 已退出旁观`
          }

          case 'list': {
            const channelObservers = observers.get(channelId)
            if (!channelObservers || channelObservers.size === 0) {
              return '当前没有旁观者'
            }
            return `旁观者列表:\n${Array.from(channelObservers)
              .map((id, i) => `${i + 1}. ${id}`)
              .join('\n')}`
          }

          case 'clr':
          case 'clear': {
            observers.delete(channelId)
            return '已清除所有旁观者'
          }

          case 'on': {
            observerMode.set(channelId, true)
            return '已开启旁观模式'
          }

          case 'off': {
            observerMode.set(channelId, false)
            observers.delete(channelId)
            return '已关闭旁观模式'
          }

          default:
            return '未知操作 使用 .ob 查看帮助'
        }
      } catch (error) {
        logger.error('旁观模式错误:', error)
        return '操作失败'
      }
    })
}

/**
 * 检查用户是否为旁观者
 */
export function isObserver(channelId: string, userId: string): boolean {
  const channelObservers = observers.get(channelId)
  return channelObservers ? channelObservers.has(userId) : false
}

/**
 * 获取频道的旁观者列表
 */
export function getObservers(channelId: string): string[] {
  const channelObservers = observers.get(channelId)
  return channelObservers ? Array.from(channelObservers) : []
}

/**
 * 检查旁观模式是否开启
 */
export function isObserverModeEnabled(channelId: string): boolean {
  return observerMode.get(channelId) ?? false
}

/**
 * 清理所有旁观者数据 (插件卸载时调用)
 */
export function clearAllObservers(): void {
  observers.clear()
  observerMode.clear()
}
