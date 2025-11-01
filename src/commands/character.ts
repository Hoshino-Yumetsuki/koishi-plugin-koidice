import type { Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import {
  saveCharacter,
  loadCharacter,
  deleteCharacter as deleteCharacterFile,
  listCharacters,
  getCharacterAttribute,
  setCharacterAttribute,
  getAllAttributes,
} from '../utils/storage'

/**
 * 角色卡命令 .pc
 */
export function registerCharacterCommands(parent: Command, config: Config, diceAdapter: DiceAdapter) {
  parent.subcommand('pc', '角色卡管理')

  parent.subcommand('pc.new <name:text>', '创建角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        // 检查是否已存在
        const existing = loadCharacter(name)
        if (existing) {
          return `角色卡 ${name} 已存在`
        }
        
        // 创建空角色卡
        const success = saveCharacter(name, {})
        return success ? `已创建角色卡: ${name}` : '创建角色卡失败'
      } catch (error) {
        logger.error('创建角色卡错误:', error)
        return '创建角色卡时发生错误'
      }
    })

  parent.subcommand('pc.set <name:text> <attr:text> <value:number>', '设置角色属性')
    .action(async ({ session }, name, attr, value) => {
      if (!name || !attr || value === undefined) {
        return '参数不完整 用法: .pc.set <角色名> <属性名> <属性值>'
      }

      try {
        const success = setCharacterAttribute(name, attr, value, config.maxAttributesPerCard)
        if (!success) {
          return `设置失败 可能是属性数量已达上限(${config.maxAttributesPerCard})`
        }
        return `已设置 ${name} 的 ${attr} = ${value}`
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })

  parent.subcommand('pc.get <name:text> <attr:text>', '查询角色属性')
    .action(async ({ session }, name, attr) => {
      if (!name || !attr) {
        return '参数不完整 用法: .pc.get <角色名> <属性名>'
      }

      try {
        const value = getCharacterAttribute(name, attr)
        return value >= 0 ? `${name} 的 ${attr} = ${value}` : '未找到该属性'
      } catch (error) {
        logger.error('查询属性错误:', error)
        return '查询属性时发生错误'
      }
    })

  parent.subcommand('pc.del <name:text>', '删除角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        const success = deleteCharacterFile(name)
        return success ? `已删除角色卡: ${name}` : '角色卡不存在'
      } catch (error) {
        logger.error('删除角色卡错误:', error)
        return '删除角色卡时发生错误'
      }
    })

  parent.subcommand('pc.list', '列出所有角色卡')
    .action(async ({ session }) => {
      try {
        const characters = listCharacters()
        if (characters.length === 0) {
          return '还没有任何角色卡'
        }
        return `当前角色卡列表 (${characters.length}个):\n${characters.map((name, i) => `${i + 1}. ${name}`).join('\n')}`
      } catch (error) {
        logger.error('列出角色卡错误:', error)
        return '列出角色卡时发生错误'
      }
    })

  parent.subcommand('pc.show [name:text]', '查看角色卡详情')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }
      
      try {
        const character = loadCharacter(name)
        if (!character) {
          return `角色卡 ${name} 不存在`
        }
        
        const attrs = character.attributes
        const attrCount = Object.keys(attrs).length
        
        if (attrCount === 0) {
          return `角色卡: ${name}\n还没有任何属性`
        }
        
        const attrLines = Object.entries(attrs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `  ${key}: ${value}`)
          .join('\n')
        
        const createdDate = new Date(character.createdAt).toLocaleString('zh-CN')
        const updatedDate = new Date(character.updatedAt).toLocaleString('zh-CN')
        
        return `角色卡: ${name}\n` +
               `属性数量: ${attrCount}/${config.maxAttributesPerCard}\n` +
               `创建时间: ${createdDate}\n` +
               `更新时间: ${updatedDate}\n` +
               `属性列表:\n${attrLines}`
      } catch (error) {
        logger.error('显示角色卡错误:', error)
        return '显示角色卡时发生错误'
      }
    })
}

/**
 * 属性设置命令 .st (COC)
 */
export function registerAttributeCommands(parent: Command, config: Config, diceAdapter: DiceAdapter) {
  parent.subcommand('st', '角色属性管理')
    .action(async ({ session }) => {
      return '用法: .st <属性名> <属性值> 或 .st show 查看属性'
    })

  parent.subcommand('st.set <attr:text> <value:number>', '设置当前角色属性')
    .action(async ({ session }, attr, value) => {
      if (!attr || value === undefined) {
        return '参数不完整 用法: .st.set <属性名> <属性值>'
      }

      try {
        // 使用用户ID作为默认角色名
        const characterName = `user_${session.userId}`
        const success = setCharacterAttribute(characterName, attr, value, config.maxAttributesPerCard)
        if (!success) {
          return `设置失败 可能是属性数量已达上限(${config.maxAttributesPerCard})`
        }
        return `已设置 ${attr} = ${value}`
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })

  parent.subcommand('st.show', '查看当前角色属性')
    .action(async ({ session }) => {
      try {
        const characterName = `user_${session.userId}`
        const attrs = getAllAttributes(characterName)
        
        if (!attrs || Object.keys(attrs).length === 0) {
          return '还没有设置任何属性 使用 .st.set <属性名> <值> 设置'
        }
        
        const attrLines = Object.entries(attrs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `  ${key}: ${value}`)
          .join('\n')
        
        return `${session.username} 的属性:\n${attrLines}`
      } catch (error) {
        logger.error('显示属性错误:', error)
        return '显示属性时发生错误'
      }
    })

  parent.subcommand('st.clr', '清空当前角色属性')
    .action(async ({ session }) => {
      try {
        const characterName = `user_${session.userId}`
        const success = deleteCharacterFile(characterName)
        return success ? '已清除角色属性' : '没有要清除的属性'
      } catch (error) {
        logger.error('清除属性错误:', error)
        return '清除属性时发生错误'
      }
    })
}
