import type { DescriptorJson } from './types'

/**
 * 生成 Lua 脚本包装代码
 */
export function wrapLuaScript(
  code: string,
  _descriptor: DescriptorJson
): string {
  const trimmedCode = code.trim()

  // 如果已经是函数格式，直接返回
  if (trimmedCode.match(/^return\s+function/)) {
    return trimmedCode
  }

  // 包装脚本，提供全局函数访问
  return `return function(msg)
  -- 提取 dice API 为局部变量（同步版本）
  -- 自定义 queryRule 函数，支持插件规则
  local function queryRule(query)
    -- 插件规则会通过 msg.pluginRules 传递
    if msg.pluginRules then
      for ruleName, manual in pairs(msg.pluginRules) do
        if manual[query] then
          return manual[query]
        end
      end
    end
    -- 如果插件规则中没找到，使用 dice.queryRule
    local result = dice.queryRule(query)
    if result and result.success then
      return result.content
    end
    return nil
  end

  local function setGroupConf(gid, key, value)
    dice.setGroupData(gid, key, tostring(value))
  end
  local function getGroupConf(gid, key)
    return dice.getGroupData(gid, key)
  end
  local function setGroupData(gid, key, value)
    dice.setGroupData(gid, key, tostring(value))
  end
  local function getGroupData(gid, key)
    return dice.getGroupData(gid, key)
  end
  local function setUserData(uid, key, value)
    dice.setUserData(uid, key, tostring(value))
  end
  local function getUserData(uid, key)
    return dice.getUserData(uid, key)
  end

  -- getPlayerCard 需要从 msg 获取（因为它需要访问数据库）
  local function getPlayerCard(uid, gid)
    -- 这个函数暂时返回 nil，因为需要异步数据库访问
    return nil
  end

  -- 为 game.pls 等数组添加 totable() 方法（兼容原版 Dice）
  if msg.game and msg.game.pls then
    local pls_mt = {
      __index = {
        totable = function(self)
          return self
        end
      }
    }
    setmetatable(msg.game.pls, pls_mt)
  end

  -- 原始脚本代码
  local __result = (function()
${code}
  end)()

  -- 替换占位符（如果返回字符串）
  if type(__result) == "string" then
    __result = __result:gsub("{card}", tostring(msg.card or ""))
    __result = __result:gsub("{pc}", tostring(msg.char and msg.char.__Name or ""))
  end

  return __result
end`
}

/**
 * 替换结果中的占位符
 */
export function replacePlaceholders(
  result: string,
  context: {
    username?: string
    userId?: string
    guildId?: string
    channelId?: string
    charName?: string
  }
): string {
  return result
    .replace(/\{self\}/g, context.username || context.userId || '你')
    .replace(/\{nick\}/g, context.username || context.userId || '你')
    .replace(/\{uid\}/g, context.userId || '')
    .replace(/\{gid\}/g, context.guildId || context.channelId || '')
    .replace(/\{card\}/g, context.charName || '角色卡')
    .replace(/\{pc\}/g, context.charName || '')
}
