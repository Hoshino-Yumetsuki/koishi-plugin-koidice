import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDataPath } from '../utils/path'

/**
 * 用户设置
 */
interface UserSettings {
  defaultDice?: number
  cocRule?: number
  nickname?: string
}

/**
 * 获取设置文件路径
 */
function getSettingsFilePath(userId: string): string {
  return resolve(getDataPath(), `settings_${userId}.json`)
}

/**
 * 加载用户设置
 */
function loadSettings(userId: string): UserSettings {
  try {
    const filePath = getSettingsFilePath(userId)
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    logger.error('加载设置失败:', error)
  }
  return {}
}

/**
 * 保存用户设置
 */
function saveSettings(userId: string, settings: UserSettings): void {
  try {
    const filePath = getSettingsFilePath(userId)
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (error) {
    logger.error('保存设置失败:', error)
  }
}

/**
 * 设置命令 .set / .setcoc / .nn
 */
export function registerSettingsCommands(
  parent: Command,
  _config: Config,
  _diceAdapter: DiceAdapter
) {
  // 设置默认骰
  parent
    .subcommand('set [dice:number]', '设置默认骰面数')
    .action(async ({ session }, dice) => {
      try {
        const userId = session.userId
        const settings = loadSettings(userId)

        if (dice === undefined) {
          // 重置为默认值
          delete settings.defaultDice
          saveSettings(userId, settings)
          return '已重置默认骰为 D100'
        }

        if (dice < 2 || dice > 1000) {
          return '骰子面数必须在 2-1000 之间'
        }

        settings.defaultDice = dice
        saveSettings(userId, settings)
        return `已设置默认骰为 D${dice}`
      } catch (error) {
        logger.error('设置默认骰错误:', error)
        return '设置失败'
      }
    })

  // 设置COC房规
  parent
    .subcommand('setcoc [rule:number]', '设置COC检定房规')
    .action(async ({ session }, rule) => {
      try {
        const userId = session.userId
        const settings = loadSettings(userId)

        if (rule === undefined) {
          // 显示当前房规
          const currentRule = settings.cocRule ?? 0
          const ruleDesc = [
            '0: 规则书 - 出1大成功，不满50出96-100大失败，满50出100大失败',
            '1: 出1大成功，出100大失败',
            '2: 出1-5且<=成功率大成功，出100或出96-99且>成功率大失败',
            '3: 出1-5大成功，出96-100大失败',
            '4: 不满50出1-5且<=成功率大成功，满50出1-2且<=成功率大成功；不满50出96-100大失败，满50出99-100大失败',
            '5: 出1-5且<=(成功率/10)大成功，出96-100且>(成功率/10)大失败'
          ]
          return `当前COC房规: ${currentRule}\n${ruleDesc[currentRule] || '未知房规'}\n\n使用 .setcoc <0-5> 设置房规`
        }

        if (rule < 0 || rule > 5) {
          return 'COC房规必须在 0-5 之间\n0=规则书 1=出1大成功出100大失败 2=困难极难大成功 3=1-5大成功96-100大失败 4=困难极难大成功(满50) 5=困难极难大失败'
        }

        settings.cocRule = rule
        saveSettings(userId, settings)
        return `已设置COC房规为 ${rule}`
      } catch (error) {
        logger.error('设置COC房规错误:', error)
        return '设置失败'
      }
    })

  // 设置昵称
  parent
    .subcommand('nn [nickname:text]', '设置昵称')
    .action(async ({ session }, nickname) => {
      try {
        const userId = session.userId
        const settings = loadSettings(userId)

        if (!nickname) {
          // 显示当前昵称
          if (settings.nickname) {
            return `当前昵称: ${settings.nickname}`
          } else {
            return `当前昵称: ${session.username || '未设置'}`
          }
        }

        if (nickname === 'del' || nickname === 'clr') {
          // 删除昵称
          delete settings.nickname
          saveSettings(userId, settings)
          return '已删除昵称设置'
        }

        // 移除前导符号
        nickname = nickname.replace(/^[.!！。]/, '')

        if (nickname.length > 20) {
          return '昵称长度不能超过20个字符'
        }

        settings.nickname = nickname
        saveSettings(userId, settings)
        return `已设置昵称为: ${nickname}`
      } catch (error) {
        logger.error('设置昵称错误:', error)
        return '设置失败'
      }
    })
}

/**
 * 获取用户默认骰
 */
export function getUserDefaultDice(userId: string): number {
  const settings = loadSettings(userId)
  return settings.defaultDice ?? 100
}

/**
 * 获取用户COC房规
 */
export function getUserCOCRule(userId: string): number {
  const settings = loadSettings(userId)
  return settings.cocRule ?? 0
}

/**
 * 获取用户昵称
 */
export function getUserNickname(userId: string, defaultName: string): string {
  const settings = loadSettings(userId)
  return settings.nickname ?? defaultName
}
