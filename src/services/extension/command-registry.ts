import type { Context } from 'koishi'
import type { DiceAdapter } from '../../wasm'
import type { DescriptorJson, ReplyConfig } from './types'
import { logger } from '../../index'
import { replacePlaceholders } from './script-wrapper'
import type { CharacterService } from '../character-service'
import type { GameSessionService } from '../game-session-service'

/**
 * 注册插件命令到 Koishi
 */
export async function registerPluginCommands(
  ctx: Context,
  adapter: DiceAdapter,
  descriptor: DescriptorJson,
  commands: Map<string, ReplyConfig>,
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, any>
): Promise<void> {
  if (commands.size === 0) {
    logger.info(`No commands to register`)
    return
  }

  logger.info(`Registering ${commands.size} command(s):`)

  for (const [cmdName, config] of commands) {
    try {
      // 提取命令信息
      const prefix = config.keyword?.prefix || `.${cmdName}`
      let scriptName = config.echo?.lua || config.echo?.js

      if (!scriptName) {
        logger.warn(`No script specified for command: ${cmdName}`)
        continue
      }

      // 如果脚本名不包含插件名前缀，添加它
      if (!scriptName.startsWith(`${descriptor.name}.`)) {
        scriptName = `${descriptor.name}.${scriptName}`
      }

      // 去掉前缀的 "." 得到命令名
      const koishiCmd = prefix.startsWith('.') ? prefix.substring(1) : prefix
      logger.info(`  - ${koishiCmd} -> ${scriptName}`)

      // 注册 Koishi 命令
      ctx
        .command(`${koishiCmd} [...args]`)
        .usage(
          config.rule
            ? `[${config.rule}] ${descriptor.title || descriptor.name}`
            : descriptor.title || descriptor.name
        )
        .action(async ({ session }, ...args) => {
          // 准备扩展上下文
          const context = await buildExtensionContext(
            ctx,
            session,
            args,
            characterService,
            gameSessionService,
            pluginRules
          )

          try {
            // 调用 WASM 扩展
            logger.debug(
              `Calling ${scriptName} with suffix: "${context.suffix}"`
            )
            let result = adapter.callExtension(scriptName, context)

            // 替换占位符
            if (result && typeof result === 'string') {
              result = replacePlaceholders(result, {
                username: session.username,
                userId: session.userId,
                guildId: session.guildId,
                channelId: session.channelId,
                charName: context.char?.__Name || context.char?.name
              })
            }

            return result
          } catch (error) {
            logger.error(`Extension error (${scriptName}):`, error)
            return `[错误] ${error.message}`
          }
        })

      // 添加权限检查
      if (config.type === 'Game' && config.limit?.grp_id?.nor === 0) {
        // 仅群聊可用
        // TODO: 添加权限检查逻辑
      }
    } catch (error) {
      logger.error(`Failed to register command ${cmdName}:`, error)
    }
  }
}

/**
 * 构建扩展上下文
 */
async function buildExtensionContext(
  ctx: Context,
  session: any,
  args: string[],
  characterService: CharacterService,
  gameSessionService: GameSessionService,
  pluginRules: Map<string, any>
): Promise<any> {
  // 加载角色卡数据
  let charData
  try {
    const activeCard = await characterService.getActiveCard(session)
    if (activeCard) {
      const attrs =
        typeof activeCard.attributes === 'string'
          ? JSON.parse(activeCard.attributes)
          : activeCard.attributes
      charData = {
        __Name: activeCard.cardName,
        name: activeCard.cardName,
        type: activeCard.cardType,
        ...attrs
      }
    }
  } catch (error) {
    logger.debug('获取角色卡失败:', error)
  }

  // 加载游戏会话数据
  let gameData
  try {
    const gameSession = await gameSessionService.getSession(session)
    if (gameSession) {
      gameData = gameSessionService.gameToContext(gameSession)
    }
  } catch (error) {
    logger.debug('获取游戏会话失败:', error)
  }

  // 准备扩展上下文
  return {
    suffix: args.join(' '),
    uid: session?.userId || '',
    gid: session?.guildId || session?.channelId || '',
    private: !session?.guildId,
    char: charData,
    game: gameData || {},
    pluginRules: Object.fromEntries(pluginRules),
    // 获取其他玩家角色卡的函数
    getPlayerCard: async (uid: string, gid?: string) => {
      try {
        const cards = await ctx.database.get('koidice_character_binding', {
          userId: uid,
          platform: session.platform,
          guildId: gid || session.guildId || ''
        })
        if (cards.length > 0) {
          const cardName = cards[0].cardName
          const charCards = await ctx.database.get('koidice_character', {
            userId: uid,
            platform: session.platform,
            cardName
          })
          if (charCards.length > 0) {
            const card = charCards[0]
            const attrs =
              typeof card.attributes === 'string'
                ? JSON.parse(card.attributes)
                : card.attributes
            return {
              __Name: card.cardName,
              name: card.cardName,
              type: card.cardType,
              ...attrs
            }
          }
        }
      } catch (error) {
        logger.error('获取玩家角色卡失败:', error)
      }
      return undefined
    },
    // 数据存储回调
    setGroupConf: async (gid: string, key: string, value: any) => {
      try {
        await ctx.database.upsert('koidice_group_data', [
          {
            guildId: gid,
            dataKey: key,
            dataValue: JSON.stringify(value)
          }
        ])
      } catch (error) {
        logger.error('设置群组配置失败:', error)
      }
    },
    setGroupData: async (gid: string, key: string, value: any) => {
      try {
        await ctx.database.upsert('koidice_group_data', [
          {
            guildId: gid,
            dataKey: key,
            dataValue: JSON.stringify(value)
          }
        ])
      } catch (error) {
        logger.error('存储群组数据失败:', error)
      }
    },
    getGroupData: async (gid: string, key: string) => {
      try {
        const rows = await ctx.database.get('koidice_group_data', {
          guildId: gid,
          dataKey: key
        })
        if (rows.length > 0) {
          return JSON.parse(rows[0].dataValue)
        }
      } catch (error) {
        logger.error('读取群组数据失败:', error)
      }
      return undefined
    },
    setUserData: async (uid: string, key: string, value: any) => {
      try {
        await ctx.database.upsert('koidice_user_data', [
          {
            userId: uid,
            dataKey: key,
            dataValue: JSON.stringify(value)
          }
        ])
      } catch (error) {
        logger.error('存储用户数据失败:', error)
      }
    },
    getUserData: async (uid: string, key: string) => {
      try {
        const rows = await ctx.database.get('koidice_user_data', {
          userId: uid,
          dataKey: key
        })
        if (rows.length > 0) {
          return JSON.parse(rows[0].dataValue)
        }
      } catch (error) {
        logger.error('读取用户数据失败:', error)
      }
      return undefined
    }
  }
}
