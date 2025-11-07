/**
 * 原始 Dice 插件格式类型定义
 */

export interface DescriptorJson {
  name: string
  title?: string
  ver: string
  author?: string
  brief?: string
  desc?: string
  dice_build?: number
  repo?: string
  comment?: string
}

export interface ReplyConfig {
  type?: string // "Game" 等
  rule?: string // 游戏规则，如 "Maid"
  keyword?: {
    prefix?: string // 命令前缀，如 ".team"
  }
  echo?: {
    lua?: string // Lua 脚本名称
    js?: string // JS 脚本名称
  }
  limit?: any // 限制条件
}

export interface LoadedPlugin {
  name: string
  path: string
  descriptor: DescriptorJson
  scripts: Map<string, string> // scriptName -> code
  commands: Map<string, ReplyConfig> // commandName -> config
}

/**
 * 扩展系统类型定义
 */

export interface ExtensionManifest {
  name: string
  version: string
  author?: string
  description?: string
  type: 'lua' | 'js'
  /** 脚本文件映射: { "ScriptName": "path/to/script.lua" } */
  scripts: Record<string, string>
  /** 命令注册配置（可选） */
  commands?: ExtensionCommand[]
  /** 依赖的其他扩展 */
  dependencies?: string[]
}

export interface ExtensionCommand {
  /** 命令名称（不含前缀） */
  name: string
  /** 命令别名 */
  alias?: string[]
  /** 命令描述 */
  description?: string
  /** 调用的脚本名称 */
  script: string
  /** 游戏规则限制（如 "Maid"） */
  rule?: string
  /** 权限要求 */
  permissions?: Array<'game' | 'group' | 'private'>
}

export interface ExtensionContext {
  /** 命令参数（去除命令名后的部分） */
  suffix: string
  /** 用户 ID */
  uid: string
  /** 群组 ID（私聊时为空） */
  gid?: string
  /** 是否为私聊 */
  private: boolean
  /** 当前角色卡（如果有） */
  char?: any
  /** 游戏会话（如果有） */
  game?: any
  /** 获取其他玩家角色卡的回调 */
  getPlayerCard?: (uid: string) => Promise<any>
  /** 存储数据的回调 */
  setGroupData?: (gid: string, key: string, value: any) => Promise<void>
  getGroupData?: (gid: string, key: string) => Promise<any>
  setUserData?: (uid: string, key: string, value: any) => Promise<void>
  getUserData?: (uid: string, key: string) => Promise<any>
}

export interface LoadedExtension {
  manifest: ExtensionManifest
  path: string
  loaded: boolean
  commands: ExtensionCommand[]
}
