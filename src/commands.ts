import type { Context, Session } from 'koishi'
import type { Config } from './config'
import { getDiceAdapter, DiceAdapter } from './wasm'
import type { RollResult, COCCheckResult } from './wasm'
import { logger } from './index'
import { getDataPath } from './utils/path'

let diceAdapter: DiceAdapter | null = null

/**
 * 初始化 Dice 适配器
 */
export async function initializeDiceAdapter() {
  if (!diceAdapter) {
    diceAdapter = await getDiceAdapter()
    logger.info('Dice WASM 模块加载成功: ' + diceAdapter.getVersion())
  }
  return diceAdapter
}

/**
 * 注册所有命令
 */
export function registerCommands(ctx: Context, config: Config) {
  // .r 基础掷骰命令
  registerRollCommand(ctx, config)
  
  // .rc COC检定命令
  if (config.enableCOC) {
    registerCOCCheckCommand(ctx, config)
  }
  
  // .draw 抽卡命令
  if (config.enableCustomDeck) {
    registerDeckCommands(ctx, config)
  }
  
  // .pc 角色卡命令
  if (config.enableCharacterCard) {
    registerCharacterCommands(ctx, config)
  }
  
  // .st 属性设置命令 (COC)
  if (config.enableCOC) {
    registerAttributeCommands(ctx, config)
  }
  
  // .en 成长检定命令 (COC)
  if (config.enableCOC) {
    registerGrowthCommand(ctx, config)
  }
}

/**
 * 基础掷骰命令 .r
 */
function registerRollCommand(ctx: Context, config: Config) {
  ctx.command('r <expression:text>', '掷骰子')
    .alias('roll')
    .option('reason', '-r <reason:text> 掷骰原因')
    .option('hidden', '-h 暗骰')
    .action(async ({ session, options }, expression) => {
      if (!expression) {
        expression = `1d${config.defaultDice}`
      }

      try {
        if (options.hidden) {
          const success = diceAdapter!.hiddenRoll(expression, config.defaultDice)
          return `${session.username} 进行了暗骰${options.reason ? ` (${options.reason})` : ''}`
        }

        const result: RollResult = diceAdapter!.roll(expression, config.defaultDice)
        
        if (result.errorCode !== 0) {
          return `掷骰失败: ${result.errorMsg}`
        }

        const parts = [session.username]
        if (options.reason) {
          parts.push(options.reason)
        }
        parts.push(result.detail)
        
        return parts.join(' ')
      } catch (error) {
        logger.error('掷骰错误:', error)
        return '掷骰时发生错误'
      }
    })
}

/**
 * COC检定命令 .rc
 */
function registerCOCCheckCommand(ctx: Context, config: Config) {
  ctx.command('rc <skill:number>', 'COC技能检定')
    .alias('check')
    .option('bonus', '-b <bonus:number> 奖励骰数')
    .option('penalty', '-p <penalty:number> 惩罚骰数')
    .option('reason', '-r <reason:text> 检定原因')
    .action(async ({ session, options }, skill) => {
      if (!skill || skill < 0 || skill > 100) {
        return '技能值必须在0-100之间'
      }

      try {
        let bonusDice = 0
        if (options.bonus) bonusDice = options.bonus
        if (options.penalty) bonusDice = -options.penalty

        const result: COCCheckResult = diceAdapter!.cocCheck(skill, bonusDice)
        
        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        const parts = [session.username]
        if (options.reason) {
          parts.push(options.reason)
        }
        parts.push(`${result.rollValue}/${result.skillValue}`)
        parts.push(DiceAdapter.formatSuccessLevel(result.successLevel))
        
        return parts.join(' ')
      } catch (error) {
        logger.error('COC检定错误:', error)
        return '检定时发生错误'
      }
    })
}

/**
 * 牌堆命令 .draw
 */
function registerDeckCommands(ctx: Context, config: Config) {
  ctx.command('draw <deck:text>', '从牌堆抽卡')
    .option('count', '-n <count:number> 抽取数量', { fallback: 1 })
    .action(async ({ session, options }, deck) => {
      if (!deck) {
        return '请指定牌堆名称'
      }

      try {
        const cards = diceAdapter!.drawCard(deck, options.count)
        return `${session.username} 从 ${deck} 抽到: ${cards.join(', ')}`
      } catch (error) {
        logger.error('抽卡错误:', error)
        return '抽卡时发生错误'
      }
    })

  ctx.command('draw.reset <deck:text>', '重置牌堆')
    .action(async ({ session }, deck) => {
      if (!deck) {
        return '请指定牌堆名称'
      }

      try {
        diceAdapter!.resetDeck(deck)
        return `已重置牌堆: ${deck}`
      } catch (error) {
        logger.error('重置牌堆错误:', error)
        return '重置牌堆时发生错误'
      }
    })
}

/**
 * 角色卡命令 .pc
 */
function registerCharacterCommands(ctx: Context, config: Config) {
  ctx.command('pc', '角色卡管理')

  ctx.command('pc.new <name:text>', '创建角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        const success = diceAdapter!.createCharacter(name)
        return success ? `已创建角色卡: ${name}` : '创建角色卡失败'
      } catch (error) {
        logger.error('创建角色卡错误:', error)
        return '创建角色卡时发生错误'
      }
    })

  ctx.command('pc.set <name:text> <attr:text> <value:number>', '设置角色属性')
    .action(async ({ session }, name, attr, value) => {
      if (!name || !attr || value === undefined) {
        return '参数不完整 用法: .pc.set <角色名> <属性名> <属性值>'
      }

      try {
        const success = diceAdapter!.setCharacterAttr(name, attr, value)
        return success ? `已设置 ${name} 的 ${attr} = ${value}` : '设置属性失败'
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })

  ctx.command('pc.get <name:text> <attr:text>', '查询角色属性')
    .action(async ({ session }, name, attr) => {
      if (!name || !attr) {
        return '参数不完整 用法: .pc.get <角色名> <属性名>'
      }

      try {
        const value = diceAdapter!.getCharacterAttr(name, attr)
        return value >= 0 ? `${name} 的 ${attr} = ${value}` : '未找到该属性'
      } catch (error) {
        logger.error('查询属性错误:', error)
        return '查询属性时发生错误'
      }
    })

  ctx.command('pc.del <name:text>', '删除角色卡')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }

      try {
        const success = diceAdapter!.deleteCharacter(name)
        return success ? `已删除角色卡: ${name}` : '删除角色卡失败'
      } catch (error) {
        logger.error('删除角色卡错误:', error)
        return '删除角色卡时发生错误'
      }
    })

  ctx.command('pc.list', '列出所有角色卡')
    .action(async ({ session }) => {
      // TODO: 实现角色卡列表功能
      return '此功能尚未实现'
    })

  ctx.command('pc.show <name:text>', '显示角色卡详情')
    .action(async ({ session }, name) => {
      if (!name) {
        return '请指定角色名称'
      }
      // TODO: 实现角色卡显示功能
      return '此功能尚未实现'
    })
}

/**
 * 属性设置命令 .st (COC)
 */
function registerAttributeCommands(ctx: Context, config: Config) {
  ctx.command('st', '角色属性管理')
    .action(async ({ session }) => {
      return '用法: .st <属性名> <属性值> 或 .st show 查看属性'
    })

  ctx.command('st.set <attr:text> <value:number>', '设置当前角色属性')
    .action(async ({ session }, attr, value) => {
      if (!attr || value === undefined) {
        return '参数不完整 用法: .st.set <属性名> <属性值>'
      }

      try {
        // 使用用户ID作为默认角色名
        const characterName = `user_${session.userId}`
        const success = diceAdapter!.setCharacterAttr(characterName, attr, value)
        return success ? `已设置 ${attr} = ${value}` : '设置属性失败'
      } catch (error) {
        logger.error('设置属性错误:', error)
        return '设置属性时发生错误'
      }
    })

  ctx.command('st.show', '显示当前角色属性')
    .action(async ({ session }) => {
      // TODO: 实现属性显示功能
      return '此功能尚未实现'
    })

  ctx.command('st.clr', '清除当前角色属性')
    .action(async ({ session }) => {
      try {
        const characterName = `user_${session.userId}`
        const success = diceAdapter!.deleteCharacter(characterName)
        return success ? '已清除角色属性' : '清除失败'
      } catch (error) {
        logger.error('清除属性错误:', error)
        return '清除属性时发生错误'
      }
    })
}

/**
 * 成长检定命令 .en (COC)
 */
function registerGrowthCommand(ctx: Context, config: Config) {
  ctx.command('en <skill:text>', '技能成长检定')
    .action(async ({ session }, skill) => {
      if (!skill) {
        return '请指定技能名称'
      }

      try {
        // 获取当前技能值
        const characterName = `user_${session.userId}`
        const currentValue = diceAdapter!.getCharacterAttr(characterName, skill)
        
        if (currentValue < 0) {
          return `未找到技能 ${skill}，请先设置技能值`
        }

        // 成长检定: 1d100 > 当前技能值
        const result: RollResult = diceAdapter!.roll('1d100', 100)
        
        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        const rollValue = result.total
        
        if (rollValue > currentValue) {
          // 成功，进行成长
          const growthResult: RollResult = diceAdapter!.roll('1d10', 10)
          const growth = growthResult.total
          const newValue = Math.min(currentValue + growth, 99)
          
          diceAdapter!.setCharacterAttr(characterName, skill, newValue)
          
          return `${session.username} ${skill} 成长检定\n` +
                 `${rollValue}/${currentValue} 成功\n` +
                 `${skill} 增长 ${growth} 点: ${currentValue} → ${newValue}`
        } else {
          return `${session.username} ${skill} 成长检定\n` +
                 `${rollValue}/${currentValue} 失败\n` +
                 `${skill} 未能成长`
        }
      } catch (error) {
        logger.error('成长检定错误:', error)
        return '成长检定时发生错误'
      }
    })
}
