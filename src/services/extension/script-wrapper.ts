import type { DescriptorJson } from './types';

/**
 * 生成 Lua 脚本包装代码
 */
export function wrapLuaScript(code: string, _descriptor: DescriptorJson): string {
  const trimmedCode = code.trim();

  // 如果已经是函数格式，直接返回
  if (trimmedCode.match(/^return\s+function/)) {
    return trimmedCode;
  }

  // 包装脚本，提供全局函数访问
  return `return function(msg)
  local event = msg.event
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


  -- 属性别名映射表(从插件模板加载)
  -- 格式: { ["Maid"] = { ["Favor"] = "宠爱", ["Stress"] = "压力", ... } }
  local templateAliasMap = msg.templateAliasMap or {}


  -- 为角色卡添加别名查找元表
  local function addAliasMetatable(card)
    if not card or type(card) ~= "table" then
      return card
    end

    -- 获取角色卡类型对应的别名映射
    local cardType = card.type
    local aliasMap = templateAliasMap[cardType]

    if aliasMap then
      local mt = {
        __index = function(t, key)
          -- 先尝试直接访问
          local value = rawget(t, key)
          if value ~= nil then
            return value
          end

          -- 如果没找到,尝试通过别名查找
          local chineseName = aliasMap[key]
          if chineseName then
            return rawget(t, chineseName)
          end

          return nil
        end
      }
      setmetatable(card, mt)
    end

    return card
  end


  local function getPlayerCard(uid, gid)
    if gid and gid ~= msg.gid then return nil end
    return addAliasMetatable(uid == msg.uid and msg.char or (msg.playerCards or {})[uid])
  end


  if msg.game and msg.game.pls then
    local pls_mt = {
      __index = {
        totable = function(self)
          dice.log("totable() called, returning pls array")
          return self
        end
      }
    }
    setmetatable(msg.game.pls, pls_mt)
  end
  if msg.char then msg.char = addAliasMetatable(msg.char) end

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
end`;
}

/** Evaluate a local Dice mod reply file inside the existing bounded Lua sandbox. */
export function wrapLuaReplyScript(code: string): string {
  return `return function(msg)
  local msg_reply, event = {}, {}
  local __definitions = event
  ${code}
  if msg.__eventKey then
    local item = __definitions[msg.__eventKey]
    local callback = item and item.action and item.action.lua
    if type(callback) ~= "function" then error("event callback not found") end
    for k in pairs(__definitions) do __definitions[k] = nil end
    for k, v in pairs(msg.event or {}) do __definitions[k] = v end
    return callback()
  end
  if type(msg_reply) ~= "table" or type(event) ~= "table" then error("msg_reply and event must be tables") end
  if msg.__replyKey then
    local item = msg_reply[msg.__replyKey]
    local callback = item and item.echo
    if type(callback) == "table" then callback = callback.lua end
    if type(callback) ~= "function" then error("reply callback not found") end
    return callback(msg)
  end
  local count = 0
  local function encode(value, depth)
    count = count + 1
    if count > 4096 or depth > 16 then error("reply data limit exceeded") end
    local kind = type(value)
    if kind == "function" then return '"__koidice_lua_callback__"' end
    if kind == "nil" then return "null" end
    if kind == "boolean" then return tostring(value) end
    if kind == "number" then
      if value ~= value or value == math.huge or value == -math.huge then error("invalid reply number") end
      return tostring(value)
    end
    if kind == "string" then
      return '"' .. value:gsub('[%z\\1-\\31\\\\"]', function(c)
        if c == '"' or c == string.char(92) then return string.char(92) .. c end
        return string.char(92) .. string.format('u%04x', string.byte(c))
      end) .. '"'
    end
    if kind ~= "table" then error("unsupported reply data") end
    local array, n = true, 0
    for k in pairs(value) do
      n = n + 1
      if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then array = false end
    end
    local parts = {}
    if array and n > 0 then
      for i = 1, n do
        if value[i] == nil then error("sparse reply array") end
        parts[#parts + 1] = encode(value[i], depth + 1)
      end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    for k, v in pairs(value) do
      if type(k) ~= "string" then error("invalid reply key") end
      parts[#parts + 1] = encode(k, depth + 1) .. ':' .. encode(v, depth + 1)
    end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  return encode({ reply = msg_reply, event = event }, 0)
end`;
}

/**
 * 替换结果中的占位符
 */
export function replacePlaceholders(
  result: string,
  context: {
    username?: string;
    userId?: string;
    guildId?: string;
    channelId?: string;
    charName?: string;
    card?: string;
  }
): string {
  return result
    .replace(/\{self\}/g, context.username || context.userId || '你')
    .replace(/\{nick\}/g, context.username || context.userId || '你')
    .replace(/\{uid\}/g, context.userId || '')
    .replace(/\{gid\}/g, context.guildId || context.channelId || '')
    .replace(/\{card\}/g, context.card || context.charName || '角色卡')
    .replace(/\{pc\}/g, context.charName || '');
}
