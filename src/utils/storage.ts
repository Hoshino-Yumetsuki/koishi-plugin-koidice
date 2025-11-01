import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { getCharacterDataPath } from './path'
import { logger } from '../index'

/**
 * 角色卡数据结构
 */
export interface CharacterData {
  name: string
  attributes: Record<string, number>
  createdAt: number
  updatedAt: number
}

/**
 * 获取角色卡文件路径
 */
function getCharacterFilePath(characterName: string): string {
  return resolve(getCharacterDataPath(), `${characterName}.json`)
}

/**
 * 保存角色卡数据
 */
export function saveCharacter(characterName: string, attributes: Record<string, number>): boolean {
  try {
    const filePath = getCharacterFilePath(characterName)
    const now = Date.now()
    
    let data: CharacterData
    if (existsSync(filePath)) {
      // 更新现有角色卡
      const existing = loadCharacter(characterName)
      data = {
        name: characterName,
        attributes: { ...existing?.attributes, ...attributes },
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
    } else {
      // 创建新角色卡
      data = {
        name: characterName,
        attributes,
        createdAt: now,
        updatedAt: now,
      }
    }
    
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    logger.error('保存角色卡失败:', error)
    return false
  }
}

/**
 * 加载角色卡数据
 */
export function loadCharacter(characterName: string): CharacterData | null {
  try {
    const filePath = getCharacterFilePath(characterName)
    if (!existsSync(filePath)) {
      return null
    }
    
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as CharacterData
  } catch (error) {
    logger.error('加载角色卡失败:', error)
    return null
  }
}

/**
 * 删除角色卡
 */
export function deleteCharacter(characterName: string): boolean {
  try {
    const filePath = getCharacterFilePath(characterName)
    if (existsSync(filePath)) {
      const fs = require('node:fs')
      fs.unlinkSync(filePath)
      return true
    }
    return false
  } catch (error) {
    logger.error('删除角色卡失败:', error)
    return false
  }
}

/**
 * 列出所有角色卡
 */
export function listCharacters(): string[] {
  try {
    const dataPath = getCharacterDataPath()
    if (!existsSync(dataPath)) {
      return []
    }
    
    const files = readdirSync(dataPath)
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
  } catch (error) {
    logger.error('列出角色卡失败:', error)
    return []
  }
}

/**
 * 获取角色卡属性
 */
export function getCharacterAttribute(characterName: string, attrName: string): number {
  const character = loadCharacter(characterName)
  if (!character) {
    return -1
  }
  return character.attributes[attrName] ?? -1
}

/**
 * 设置角色卡属性
 */
export function setCharacterAttribute(
  characterName: string,
  attrName: string,
  attrValue: number,
  maxAttributes: number = 50
): boolean {
  try {
    const character = loadCharacter(characterName)
    const attributes = character?.attributes || {}
    
    // 检查属性数量限制
    if (!attributes[attrName] && Object.keys(attributes).length >= maxAttributes) {
      logger.warn(`角色卡 ${characterName} 属性数量已达上限 ${maxAttributes}`)
      return false
    }
    
    attributes[attrName] = attrValue
    return saveCharacter(characterName, attributes)
  } catch (error) {
    logger.error('设置角色卡属性失败:', error)
    return false
  }
}

/**
 * 获取角色卡所有属性
 */
export function getAllAttributes(characterName: string): Record<string, number> | null {
  const character = loadCharacter(characterName)
  return character?.attributes || null
}
