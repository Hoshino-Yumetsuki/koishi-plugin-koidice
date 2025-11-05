import type { Context, Session } from 'koishi'
import type {
  CharacterCard,
  CharacterBinding,
  CharacterStats
} from '../database'
import type { DiceAdapter } from '../wasm/adapter'
import { logger } from '../index'

/**
 * 人物卡服务
 * 负责人物卡的 CRUD 操作，结合 Koishi 数据库和 Dice C++ 实现
 */
export class CharacterService {
  constructor(
    private ctx: Context,
    private diceAdapter: DiceAdapter
  ) {}

  /**
   * 获取用户的唯一标识
   */
  private getUserKey(session: Session): { userId: string; platform: string } {
    return {
      userId: session.userId,
      platform: session.platform
    }
  }

  /**
   * 获取用户当前激活的人物卡
   */
  async getActiveCard(session: Session): Promise<CharacterCard | null> {
    const { userId, platform } = this.getUserKey(session)
    const cards = await this.ctx.database.get('koidice_character', {
      userId,
      platform,
      isActive: true
    })
    return cards[0] || null
  }

  /**
   * 获取用户的所有人物卡
   */
  async getAllCards(session: Session): Promise<CharacterCard[]> {
    const { userId, platform } = this.getUserKey(session)
    return await this.ctx.database.get('koidice_character', {
      userId,
      platform
    })
  }

  /**
   * 获取指定名称的人物卡
   */
  async getCard(
    session: Session,
    cardName: string
  ): Promise<CharacterCard | null> {
    const { userId, platform } = this.getUserKey(session)
    const cards = await this.ctx.database.get('koidice_character', {
      userId,
      platform,
      cardName
    })
    return cards[0] || null
  }

  /**
   * 创建新人物卡
   */
  async createCard(
    session: Session,
    cardName: string,
    cardType: string = 'COC7',
    attributes: Record<string, number> = {}
  ): Promise<CharacterCard> {
    const { userId, platform } = this.getUserKey(session)

    // 检查是否已存在同名卡
    const existing = await this.getCard(session, cardName)
    if (existing) {
      throw new Error(`人物卡 ${cardName} 已存在`)
    }

    // 如果是第一张卡，自动设为激活
    const allCards = await this.getAllCards(session)
    const isActive = allCards.length === 0

    const now = new Date()
    const card = await this.ctx.database.create('koidice_character', {
      userId,
      platform,
      cardName,
      cardType,
      isActive,
      attributes: JSON.stringify(attributes),
      createdAt: now,
      updatedAt: now
    })

    logger.info(`创建人物卡: ${userId}@${platform} - ${cardName}`)
    return card
  }

  /**
   * 设置人物卡属性
   */
  async setAttributes(
    session: Session,
    cardName: string | null,
    attributes: Record<string, number>
  ): Promise<void> {
    let card: CharacterCard | null

    if (cardName) {
      card = await this.getCard(session, cardName)
      if (!card) {
        // 如果卡不存在，创建新卡
        card = await this.createCard(session, cardName, 'COC7', attributes)
        return
      }
    } else {
      card = await this.getActiveCard(session)
      if (!card) {
        throw new Error('没有激活的人物卡，请先创建或指定人物卡名称')
      }
    }

    // 合并现有属性
    const currentAttrs = JSON.parse(card.attributes) as Record<string, number>
    const newAttrs = { ...currentAttrs, ...attributes }

    await this.ctx.database.set('koidice_character', card.id, {
      attributes: JSON.stringify(newAttrs),
      updatedAt: new Date()
    })

    logger.debug(`更新人物卡属性: ${card.cardName}`)
  }

  /**
   * 获取人物卡属性
   */
  async getAttributes(
    session: Session,
    cardName: string | null
  ): Promise<Record<string, number> | null> {
    const card = cardName
      ? await this.getCard(session, cardName)
      : await this.getActiveCard(session)

    if (!card) return null

    return JSON.parse(card.attributes) as Record<string, number>
  }

  /**
   * 切换激活的人物卡
   */
  async switchCard(session: Session, cardName: string): Promise<void> {
    const { userId, platform } = this.getUserKey(session)

    // 检查目标卡是否存在
    const targetCard = await this.getCard(session, cardName)
    if (!targetCard) {
      throw new Error(`人物卡 ${cardName} 不存在`)
    }

    // 取消所有卡的激活状态
    await this.ctx.database.set(
      'koidice_character',
      { userId, platform },
      { isActive: false }
    )

    // 激活目标卡
    await this.ctx.database.set('koidice_character', targetCard.id, {
      isActive: true
    })

    logger.info(`切换人物卡: ${userId}@${platform} -> ${cardName}`)
  }

  /**
   * 删除人物卡
   */
  async deleteCard(session: Session, cardName: string): Promise<boolean> {
    const card = await this.getCard(session, cardName)
    if (!card) return false

    const result = await this.ctx.database.remove('koidice_character', card.id)

    // 如果删除的是激活卡，自动激活第一张卡
    if (card.isActive) {
      const remaining = await this.getAllCards(session)
      if (remaining.length > 0) {
        await this.ctx.database.set('koidice_character', remaining[0].id, {
          isActive: true
        })
      }
    }

    logger.info(`删除人物卡: ${card.cardName}`)
    return result.matched > 0
  }

  /**
   * 使用 C++ 实现解析 COC 输出并设置属性
   */
  async parseAndSetCOCAttributes(
    session: Session,
    cardName: string | null,
    cocOutput: string
  ): Promise<Record<string, number>> {
    try {
      // 调用 WASM 函数解析 COC 输出
      const jsonResult = this.diceAdapter.parseCOCAttributes(cocOutput)

      // 检查返回值
      if (!jsonResult || typeof jsonResult !== 'string') {
        logger.warn('WASM 解析返回空结果')
        return {}
      }

      const attributes = JSON.parse(jsonResult) as Record<string, number>

      if (Object.keys(attributes).length > 0) {
        await this.setAttributes(session, cardName, attributes)
      }

      return attributes
    } catch (error) {
      logger.error('解析 COC 属性失败:', error)
      return {}
    }
  }

  /**
   * 获取当前群组绑定的人物卡
   */
  async getBoundCard(session: Session): Promise<CharacterCard | null> {
    const { userId, platform } = this.getUserKey(session)
    const guildId = session.guildId || ''

    // 查找群组绑定
    const bindings = await this.ctx.database.get('koidice_character_binding', {
      userId,
      platform,
      guildId
    })

    if (bindings.length > 0) {
      return await this.getCard(session, bindings[0].cardName)
    }

    // 如果没有群组绑定，查找全局绑定
    if (guildId !== '') {
      const globalBindings = await this.ctx.database.get(
        'koidice_character_binding',
        {
          userId,
          platform,
          guildId: ''
        }
      )

      if (globalBindings.length > 0) {
        return await this.getCard(session, globalBindings[0].cardName)
      }
    }

    return null
  }

  /**
   * 绑定人物卡到群组
   */
  async bindCard(session: Session, cardName: string | null): Promise<void> {
    const { userId, platform } = this.getUserKey(session)
    const guildId = session.guildId || ''

    if (!cardName) {
      // 解绑
      await this.ctx.database.remove('koidice_character_binding', {
        userId,
        platform,
        guildId
      })
      logger.info(`解绑人物卡: ${userId}@${platform} 在 ${guildId || '全局'}`)
      return
    }

    // 检查卡是否存在
    const card = await this.getCard(session, cardName)
    if (!card) {
      throw new Error(`人物卡 ${cardName} 不存在`)
    }

    // 查找现有绑定
    const existing = await this.ctx.database.get('koidice_character_binding', {
      userId,
      platform,
      guildId
    })

    const now = new Date()
    if (existing.length > 0) {
      // 更新绑定
      await this.ctx.database.set('koidice_character_binding', existing[0].id, {
        cardName,
        updatedAt: now
      })
    } else {
      // 创建新绑定
      await this.ctx.database.create('koidice_character_binding', {
        userId,
        platform,
        guildId,
        cardName,
        createdAt: now,
        updatedAt: now
      })
    }

    logger.info(
      `绑定人物卡: ${userId}@${platform} -> ${cardName} 在 ${guildId || '全局'}`
    )
  }

  /**
   * 获取所有群组绑定
   */
  async getAllBindings(session: Session): Promise<CharacterBinding[]> {
    const { userId, platform } = this.getUserKey(session)
    return await this.ctx.database.get('koidice_character_binding', {
      userId,
      platform
    })
  }

  /**
   * 重命名人物卡
   */
  async renameCard(
    session: Session,
    oldName: string,
    newName: string
  ): Promise<void> {
    const { userId, platform } = this.getUserKey(session)

    // 检查旧卡是否存在
    const oldCard = await this.getCard(session, oldName)
    if (!oldCard) {
      throw new Error(`人物卡 ${oldName} 不存在`)
    }

    // 检查新名称是否已存在
    const newCard = await this.getCard(session, newName)
    if (newCard) {
      throw new Error(`人物卡 ${newName} 已存在`)
    }

    // 更新卡名
    await this.ctx.database.set('koidice_character', oldCard.id, {
      cardName: newName,
      updatedAt: new Date()
    })

    // 更新所有绑定
    await this.ctx.database.set(
      'koidice_character_binding',
      { userId, platform, cardName: oldName },
      { cardName: newName, updatedAt: new Date() }
    )

    // 更新统计
    await this.ctx.database.set(
      'koidice_character_stats',
      { userId, platform, cardName: oldName },
      { cardName: newName, updatedAt: new Date() }
    )

    logger.info(`重命名人物卡: ${oldName} -> ${newName}`)
  }

  /**
   * 复制人物卡
   */
  async copyCard(
    session: Session,
    sourceName: string,
    targetName: string
  ): Promise<void> {
    const { userId, platform } = this.getUserKey(session)

    // 获取源卡
    const sourceCard = await this.getCard(session, sourceName)
    if (!sourceCard) {
      throw new Error(`人物卡 ${sourceName} 不存在`)
    }

    // 检查目标卡是否存在
    const targetCard = await this.getCard(session, targetName)
    if (targetCard) {
      // 如果存在，更新属性
      await this.ctx.database.set('koidice_character', targetCard.id, {
        attributes: sourceCard.attributes,
        cardType: sourceCard.cardType,
        updatedAt: new Date()
      })
    } else {
      // 如果不存在，创建新卡
      const now = new Date()
      await this.ctx.database.create('koidice_character', {
        userId,
        platform,
        cardName: targetName,
        cardType: sourceCard.cardType,
        isActive: false,
        attributes: sourceCard.attributes,
        createdAt: now,
        updatedAt: now
      })
    }

    logger.info(`复制人物卡: ${sourceName} -> ${targetName}`)
  }

  /**
   * 清空所有人物卡
   */
  async clearAllCards(session: Session): Promise<number> {
    const { userId, platform } = this.getUserKey(session)

    // 删除所有卡
    const result = await this.ctx.database.remove('koidice_character', {
      userId,
      platform
    })

    // 删除所有绑定
    await this.ctx.database.remove('koidice_character_binding', {
      userId,
      platform
    })

    // 删除所有统计
    await this.ctx.database.remove('koidice_character_stats', {
      userId,
      platform
    })

    logger.info(`清空所有人物卡: ${userId}@${platform}`)
    return result.matched
  }

  /**
   * 获取人物卡统计
   */
  async getStats(
    session: Session,
    cardName: string | null
  ): Promise<CharacterStats | null> {
    const { userId, platform } = this.getUserKey(session)
    const targetCardName =
      cardName || (await this.getBoundCard(session))?.cardName

    if (!targetCardName) {
      return null
    }

    const stats = await this.ctx.database.get('koidice_character_stats', {
      userId,
      platform,
      cardName: targetCardName
    })

    return stats[0] || null
  }

  /**
   * 更新人物卡统计
   */
  async updateStats(
    session: Session,
    cardName: string,
    statsUpdate: Partial<
      Omit<CharacterStats, 'id' | 'userId' | 'platform' | 'cardName'>
    >
  ): Promise<void> {
    const { userId, platform } = this.getUserKey(session)

    const existing = await this.ctx.database.get('koidice_character_stats', {
      userId,
      platform,
      cardName
    })

    const now = new Date()
    if (existing.length > 0) {
      // 更新统计
      const current = existing[0]
      await this.ctx.database.set('koidice_character_stats', current.id, {
        totalRolls: (current.totalRolls || 0) + (statsUpdate.totalRolls || 0),
        criticalSuccess:
          (current.criticalSuccess || 0) + (statsUpdate.criticalSuccess || 0),
        extremeSuccess:
          (current.extremeSuccess || 0) + (statsUpdate.extremeSuccess || 0),
        hardSuccess:
          (current.hardSuccess || 0) + (statsUpdate.hardSuccess || 0),
        regularSuccess:
          (current.regularSuccess || 0) + (statsUpdate.regularSuccess || 0),
        failure: (current.failure || 0) + (statsUpdate.failure || 0),
        fumble: (current.fumble || 0) + (statsUpdate.fumble || 0),
        updatedAt: now
      })
    } else {
      // 创建新统计
      await this.ctx.database.create('koidice_character_stats', {
        userId,
        platform,
        cardName,
        totalRolls: statsUpdate.totalRolls || 0,
        criticalSuccess: statsUpdate.criticalSuccess || 0,
        extremeSuccess: statsUpdate.extremeSuccess || 0,
        hardSuccess: statsUpdate.hardSuccess || 0,
        regularSuccess: statsUpdate.regularSuccess || 0,
        failure: statsUpdate.failure || 0,
        fumble: statsUpdate.fumble || 0,
        updatedAt: now
      })
    }
  }
}
