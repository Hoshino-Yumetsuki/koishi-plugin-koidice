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
 * 扩展数据库表
 */
declare module 'koishi' {
  interface Tables {
    koidice_character: CharacterCard
  }
}

/**
 * 初始化数据库表
 */
export function extendDatabase(ctx: Context) {
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
}
