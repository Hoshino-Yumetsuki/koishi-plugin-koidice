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
  pluginRules: Map<string, any>,
  templateAliasMap?: Map<string, Record<string, string>>
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

      // 将插件命令注册为子命令: koidice.<插件名>.<命令名>
      const pluginName = descriptor.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
      const fullCmd = `koidice.${pluginName}.${koishiCmd}`

      logger.info(`  - ${fullCmd} -> ${scriptName}`)

      // 注册 Koishi 命令
      // 创建基础命令,然后为常见的子命令(show, list等)注册子命令
      const baseCmd = ctx
        .command(`${fullCmd} [action:text] [...args]`)
        .usage(
          config.rule
            ? `[${config.rule}] ${descriptor.title || descriptor.name}`
            : descriptor.title || descriptor.name
        )
        .action(async ({ session }, action, ...args) => {
          // 将 action 和 args 组合为完整参数
          const allArgs = action ? [action, ...args] : args
          // 准备扩展上下文
          const context = await buildExtensionContext(
            ctx,
            session,
            allArgs,
            characterService,
            gameSessionService,
            pluginRules,
            templateAliasMap
          )

          try {
            // 调用 WASM 扩展
            logger.debug(
              `Calling ${scriptName} with suffix: "${context.suffix}"`
            )
            let result = adapter.callExtension(scriptName, context)

            // 脚本执行后，重新读取名片缓存（因为脚本可能更新了名片）
            let updatedCard = context.card
            try {
              const guildId = session?.guildId || session?.channelId || ''
              if (guildId) {
                const cardKey = `card#${session.userId}`
                const cardData = await ctx.database.get('koidice_group_data', {
                  guildId,
                  dataKey: cardKey
                })
                if (cardData.length > 0) {
                  updatedCard = cardData[0].dataValue || ''
                }
              }
            } catch (error) {
              logger.debug('重新读取名片缓存失败:', error)
            }

            // 替换占位符
            if (result && typeof result === 'string') {
              result = replacePlaceholders(result, {
                username: session.username,
                userId: session.userId,
                guildId: session.guildId,
                channelId: session.channelId,
                charName: context.char?.__Name || context.char?.name,
                card: updatedCard
              })
              logger.debug(`Extension result (${scriptName}): ${result}`)
            }

            return result
          } catch (error) {
            logger.error(`Extension error (${scriptName}):`, error)
            return `[错误] ${error.message}`
          }
        })

      // 为常见的子命令注册别名
      // 例如: team show, team list 等
      const commonSubCommands = ['show', 'list', 'add', 'remove', 'del', 'set']
      for (const subCmd of commonSubCommands) {
        baseCmd
          .subcommand(`.${subCmd} [...args]`)
          .action(async ({ session }, ...args) => {
            // 将子命令名作为第一个参数
            const allArgs = [subCmd, ...args]
            const context = await buildExtensionContext(
              ctx,
              session,
              allArgs,
              characterService,
              gameSessionService,
              pluginRules,
              templateAliasMap
            )

            try {
              logger.debug(
                `Calling ${scriptName} with suffix: "${context.suffix}"`
              )
              let result = adapter.callExtension(scriptName, context)

              // 脚本执行后，重新读取名片缓存
              let updatedCard = context.card
              try {
                const guildId = session?.guildId || session?.channelId || ''
                if (guildId) {
                  const cardKey = `card#${session.userId}`
                  const cardData = await ctx.database.get(
                    'koidice_group_data',
                    {
                      guildId,
                      dataKey: cardKey
                    }
                  )
                  if (cardData.length > 0) {
                    updatedCard = cardData[0].dataValue || ''
                  }
                }
              } catch (error) {
                logger.debug('重新读取名片缓存失败:', error)
              }

              // 替换占位符
              if (result && typeof result === 'string') {
                result = replacePlaceholders(result, {
                  username: session.username,
                  userId: session.userId,
                  guildId: session.guildId,
                  channelId: session.channelId,
                  charName: context.char?.__Name || context.char?.name,
                  card: updatedCard
                })
                logger.debug(`Extension result (${scriptName}): ${result}`)
              }

              return result
            } catch (error) {
              logger.error(`Extension error (${scriptName}):`, error)
              return `[错误] ${error.message}`
            }
          })
      }

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
  pluginRules: Map<string, any>,
  templateAliasMap?: Map<string, Record<string, string>>
): Promise<any> {
  // 加载角色卡数据
  // 优先使用群组绑定的角色卡,如果没有则使用全局激活的角色卡
  let charData
  try {
    let activeCard

    // 如果在群聊中,优先使用群组绑定的角色卡
    if (session?.guildId) {
      activeCard = await characterService.getBoundCard(session)
      if (activeCard) {
        logger.debug(`Using bound card: ${activeCard.cardName}`)
      }
    }

    // 如果没有群组绑定,使用全局激活的角色卡
    if (!activeCard) {
      activeCard = await characterService.getActiveCard(session)
      if (activeCard) {
        logger.debug(`Using active card: ${activeCard.cardName}`)
      }
    }

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
      logger.debug(`gameData.pls after gameToContext:`, gameData.pls)

      // 预先缓存所有游戏玩家的角色卡数据
      const playerList = JSON.parse(gameSession.playerList || '[]')
      logger.debug(
        `Caching cards for ${playerList.length} players:`,
        playerList
      )
      for (const playerId of playerList) {
        try {
          const playerCard = await characterService.getActiveCard({
            userId: playerId,
            platform: session.platform
          } as any)
          logger.debug(`Player ${playerId} card:`, playerCard)
          if (playerCard) {
            const attrs =
              typeof playerCard.attributes === 'string'
                ? JSON.parse(playerCard.attributes)
                : playerCard.attributes
            const cardData = {
              __Name: playerCard.cardName,
              name: playerCard.cardName,
              type: playerCard.cardType,
              ...attrs
            }
            // 序列化并缓存
            const cacheKey = `player_card#${playerId}`
            const guildId = session?.guildId || session?.channelId || ''
            await ctx.database.upsert('koidice_group_data', [
              {
                guildId,
                dataKey: cacheKey,
                dataValue: JSON.stringify(cardData)
              }
            ])
          }
        } catch (_error) {
          // 忽略缓存失败
        }
      }
    }
  } catch (_error) {
    // 忽略获取游戏会话失败
  }

  // 读取缓存的名片
  let cardText = ''
  try {
    const guildId = session?.guildId || session?.channelId || ''
    if (guildId) {
      const cardKey = `card#${session.userId}`
      const cardData = await ctx.database.get('koidice_group_data', {
        guildId,
        dataKey: cardKey
      })
      if (cardData.length > 0) {
        cardText = cardData[0].dataValue || ''
      }
    }
  } catch (error) {
    logger.debug('获取名片缓存失败:', error)
  }

  // 准备扩展上下文
  return {
    suffix: args.join(' '),
    uid: session?.userId || '',
    gid: session?.guildId || session?.channelId || '',
    private: !session?.guildId,
    char: charData,
    card: cardText, // 缓存的名片文本
    game: gameData || {},
    pluginRules: Object.fromEntries(pluginRules),
    templateAliasMap: templateAliasMap
      ? Object.fromEntries(templateAliasMap)
      : {},
    // 获取其他玩家角色卡的函数（异步，但不在 Lua 中使用）
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
