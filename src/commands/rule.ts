import type { Context, Command } from 'koishi'
import type { Config } from '../config'
import type { DiceAdapter } from '../wasm'
import { logger } from '../index'
import { getRule, listRules, type RuleEntry } from '../data/rules'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getDataPath } from '../utils/path'

/**
 * 远程规则数据
 */
interface RemoteRuleData {
  version: string
  rules: Record<string, Record<string, RuleEntry>>
  lastUpdate: number
}

/**
 * 规则缓存
 */
let remoteRulesCache: RemoteRuleData | null = null

/**
 * 获取规则缓存文件路径
 */
function getRulesCachePath(): string {
  return resolve(getDataPath(), 'rules_cache.json')
}

/**
 * 加载本地缓存
 */
function loadLocalCache(): RemoteRuleData | null {
  try {
    const cachePath = getRulesCachePath()
    if (existsSync(cachePath)) {
      const content = readFileSync(cachePath, 'utf-8')
      return JSON.parse(content)
    }
  } catch (error) {
    logger.error('加载规则缓存失败:', error)
  }
  return null
}

/**
 * 保存本地缓存
 */
function saveLocalCache(data: RemoteRuleData): void {
  try {
    const cachePath = getRulesCachePath()
    writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (error) {
    logger.error('保存规则缓存失败:', error)
  }
}

/**
 * 从远程服务器拉取规则
 */
async function fetchRemoteRules(ctx: Context): Promise<RemoteRuleData | null> {
  try {
    // 使用 Dice! 官方 Kokona API
    const ruleUrl = 'http://api.kokona.tech:5555/rules'
    
    logger.info('正在从 Kokona 规则库拉取规则...')
    const response = await ctx.http.post(ruleUrl, '', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Koishi-Plugin-Koidice',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    
    if (response) {
      const data: RemoteRuleData = {
        version: response.version || '1.0.0',
        rules: response.rules || {},
        lastUpdate: Date.now()
      }
      
      // 保存到缓存
      saveLocalCache(data)
      remoteRulesCache = data
      
      logger.info('规则拉取成功')
      return data
    }
  } catch (error) {
    logger.error('拉取远程规则失败:', error)
  }
  return null
}

/**
 * 获取规则数据（优先使用缓存）
 */
function getRulesData(): RemoteRuleData | null {
  if (!remoteRulesCache) {
    remoteRulesCache = loadLocalCache()
  }
  return remoteRulesCache
}

/**
 * 从远程数据查找规则
 */
function findRemoteRule(system: string, keyword: string): RuleEntry | null {
  const data = getRulesData()
  if (!data || !data.rules) {
    return null
  }
  
  const lowerKeyword = keyword.toLowerCase()
  const lowerSystem = system.toLowerCase()
  
  // 查找指定系统的规则
  if (lowerSystem && data.rules[lowerSystem]) {
    const systemRules = data.rules[lowerSystem]
    
    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (key.toLowerCase() === lowerKeyword || entry.name.toLowerCase() === lowerKeyword) {
        return entry
      }
    }
    
    // 模糊匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (key.toLowerCase().includes(lowerKeyword) || entry.name.toLowerCase().includes(lowerKeyword)) {
        return entry
      }
    }
  }
  
  // 搜索所有系统
  for (const systemRules of Object.values(data.rules)) {
    // 精确匹配
    for (const [key, entry] of Object.entries(systemRules)) {
      if (key.toLowerCase() === lowerKeyword || entry.name.toLowerCase() === lowerKeyword) {
        return entry
      }
    }
  }
  
  // 模糊匹配
  for (const systemRules of Object.values(data.rules)) {
    for (const [key, entry] of Object.entries(systemRules)) {
      if (key.toLowerCase().includes(lowerKeyword) || entry.name.toLowerCase().includes(lowerKeyword)) {
        return entry
      }
    }
  }
  
  return null
}

/**
 * 规则速查命令 .rule / .rules
 */
export function registerRuleCommands(parent: Command, config: Config, diceAdapter: DiceAdapter) {
  const ctx = parent.ctx
  parent.subcommand('rule [query:text]', '规则速查')
    .alias('rules')
    .action(async ({ session }, query) => {
      try {
        if (!query) {
          return '用法:\n' +
                 '.rule <词条> - 查询规则\n' +
                 '.rule list - 列出所有规则\n' +
                 '.rule update - 更新远程规则\n' +
                 '.rule coc:<词条> - 查询COC规则\n' +
                 '.rule dnd:<词条> - 查询DND规则\n' +
                 '例如: .rule 大成功'
        }
        
        // 更新远程规则
        if (query.toLowerCase() === 'update') {
          const result = await fetchRemoteRules(ctx)
          if (result) {
            return `规则库已更新\n版本: ${result.version}\n更新时间: ${new Date(result.lastUpdate).toLocaleString('zh-CN')}`
          } else {
            return '更新失败，请检查网络连接喵~'
          }
        }
        
        // 列出规则
        if (query.toLowerCase() === 'list') {
          const coc = listRules('coc')
          const dnd = listRules('dnd')
          
          let result = `=== 内置规则 ===\n`
          result += `COC: ${coc.join(', ')}\n`
          result += `DND: ${dnd.join(', ')}\n`
          
          // 显示远程规则信息
          const remoteData = getRulesData()
          if (remoteData) {
            result += `\n=== 远程规则库 ===\n`
            result += `版本: ${remoteData.version}\n`
            result += `系统: ${Object.keys(remoteData.rules).join(', ')}\n`
            result += `更新时间: ${new Date(remoteData.lastUpdate).toLocaleString('zh-CN')}`
          } else {
            result += `\n使用 .rule update 拉取远程规则库`
          }
          
          return result
        }
        
        // 解析系统和关键词
        let system = ''
        let keyword = query
        
        if (query.includes(':')) {
          const parts = query.split(':', 2)
          system = parts[0].trim()
          keyword = parts[1].trim()
        }
        
        // 先查询内置规则
        let rule = getRule(system, keyword)
        
        // 如果没找到，查询远程规则
        if (!rule) {
          rule = findRemoteRule(system, keyword)
        }
        
        if (!rule) {
          return `未找到规则: ${keyword}\n使用 .rule list 查看所有规则\n或使用 .rule update 更新远程规则库`
        }
        
        return `【${rule.name}】\n${rule.content}`
      } catch (error) {
        logger.error('规则速查错误:', error)
        return '查询失败喵~'
      }
    })
  
  // 启动时加载缓存
  remoteRulesCache = loadLocalCache()
  
  // 如果缓存过期（超过7天），后台更新
  if (remoteRulesCache) {
    const daysSinceUpdate = (Date.now() - remoteRulesCache.lastUpdate) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > 7) {
      logger.info('规则缓存已过期，后台更新中...')
      fetchRemoteRules(ctx).catch(err => {
        logger.error('后台更新规则失败:', err)
      })
    }
  }
}
