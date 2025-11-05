import type { Context } from 'koishi'

/**
 * 人物卡数据模型
 */
export interface CharacterCard {
  id: number // 自增主键
  userId: string // 用户 ID
  platform: string // 平台 (如 'onebot', 'discord')
  cardName: string // 人物卡名称
  cardType: string // 人物卡类型 (如 'COC7', 'DND5E')
  isActive: boolean // 是否为当前激活的卡
  attributes: string // JSON 字符串，存储属性数据
  createdAt: Date // 创建时间
  updatedAt: Date // 更新时间
}

/**
 * 用户设置数据模型
 */
export interface UserSettings {
  id: number // 自增主键
  userId: string // 用户 ID
  platform: string // 平台
  defaultDice: number // 默认骰子面数
  showDetail: boolean // 是否显示详细结果
  createdAt: Date // 创建时间
  updatedAt: Date // 更新时间
}

/**
 * 先攻列表数据模型
 */
export interface InitiativeList {
  id: number // 自增主键
  channelId: string // 频道 ID
  platform: string // 平台
  data: string // JSON 字符串，存储先攻列表数据
  updatedAt: Date // 更新时间
}

/**
 * 旁观者数据模型
 */
export interface Observer {
  id: number // 自增主键
  channelId: string // 频道 ID
  platform: string // 平台
  userId: string // 用户 ID
  isEnabled: boolean // 旁观模式是否开启（仅对频道记录有效）
  createdAt: Date // 创建时间
}

/**
 * 昵称数据模型
 */
export interface Nickname {
  id: number // 自增主键
  userId: string // 用户 ID
  guildId: string | null // 群组 ID，null 表示全局昵称
  nickname: string // 昵称
  createdAt: Date // 创建时间
  updatedAt: Date // 更新时间
}

/**
 * 人物卡群组绑定数据模型
 */
export interface CharacterBinding {
  id: number // 自增主键
  userId: string // 用户 ID
  platform: string // 平台
  guildId: string // 群组 ID，空字符串表示全局默认
  cardName: string // 绑定的人物卡名称
  createdAt: Date // 创建时间
  updatedAt: Date // 更新时间
}

/**
 * 人物卡掷骰统计数据模型
 */
export interface CharacterStats {
  id: number // 自增主键
  userId: string // 用户 ID
  platform: string // 平台
  cardName: string // 人物卡名称
  totalRolls: number // 总掷骰次数
  criticalSuccess: number // 大成功次数
  extremeSuccess: number // 极难成功次数
  hardSuccess: number // 困难成功次数
  regularSuccess: number // 普通成功次数
  failure: number // 失败次数
  fumble: number // 大失败次数
  updatedAt: Date // 更新时间
}

/**
 * 扩展数据库表
 */
declare module 'koishi' {
  interface Tables {
    koidice_character: CharacterCard
    koidice_user_settings: UserSettings
    koidice_initiative: InitiativeList
    koidice_observer: Observer
    koidice_nickname: Nickname
    koidice_character_binding: CharacterBinding
    koidice_character_stats: CharacterStats
  }
}

/**
 * 初始化数据库表
 */
export function extendDatabase(ctx: Context) {
  // 人物卡表
  ctx.model.extend(
    'koidice_character',
    {
      id: 'unsigned',
      userId: 'string',
      platform: 'string',
      cardName: 'string',
      cardType: 'string',
      isActive: 'boolean',
      attributes: 'text',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['userId', 'platform', 'cardName']]
    }
  )

  // 用户设置表
  ctx.model.extend(
    'koidice_user_settings',
    {
      id: 'unsigned',
      userId: 'string',
      platform: 'string',
      defaultDice: 'integer',
      showDetail: 'boolean',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['userId', 'platform']]
    }
  )

  // 先攻列表表
  ctx.model.extend(
    'koidice_initiative',
    {
      id: 'unsigned',
      channelId: 'string',
      platform: 'string',
      data: 'text',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['channelId', 'platform']]
    }
  )

  // 旁观者表
  ctx.model.extend(
    'koidice_observer',
    {
      id: 'unsigned',
      channelId: 'string',
      platform: 'string',
      userId: 'string',
      isEnabled: 'boolean',
      createdAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['channelId', 'platform', 'userId']]
    }
  )

  // 昵称表
  ctx.model.extend(
    'koidice_nickname',
    {
      id: 'unsigned',
      userId: 'string',
      guildId: 'string',
      nickname: 'string',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['userId', 'guildId']]
    }
  )

  // 人物卡群组绑定表
  ctx.model.extend(
    'koidice_character_binding',
    {
      id: 'unsigned',
      userId: 'string',
      platform: 'string',
      guildId: 'string',
      cardName: 'string',
      createdAt: 'timestamp',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['userId', 'platform', 'guildId']]
    }
  )

  // 人物卡掷骰统计表
  ctx.model.extend(
    'koidice_character_stats',
    {
      id: 'unsigned',
      userId: 'string',
      platform: 'string',
      cardName: 'string',
      totalRolls: 'unsigned',
      criticalSuccess: 'unsigned',
      extremeSuccess: 'unsigned',
      hardSuccess: 'unsigned',
      regularSuccess: 'unsigned',
      failure: 'unsigned',
      fumble: 'unsigned',
      updatedAt: 'timestamp'
    },
    {
      autoInc: true,
      primary: 'id',
      unique: [['userId', 'platform', 'cardName']]
    }
  )
}
