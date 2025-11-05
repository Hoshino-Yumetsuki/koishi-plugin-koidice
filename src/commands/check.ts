import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import { DiceAdapter } from '../wasm'
import type { COCCheckResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'
import { normalizeAttributeName } from './character/types'

/**
 * 解析 ra/rc 命令参数
 * 格式: .ra[h][p/b数字] [属性] [属性值] [掷骰原因]
 */
interface ParsedCheckArgs {
  hidden: boolean
  bonusDice: number // 正数为奖励骰，负数为惩罚骰
  attrName?: string
  attrValue?: number
  reason?: string
}

/**
 * 解析命令参数
 */
function parseCheckCommand(
  commandName: string,
  args: string[]
): ParsedCheckArgs {
  const result: ParsedCheckArgs = {
    hidden: false,
    bonusDice: 0
  }

  // 解析命令名中的修饰符 (如 .rah, .rahp2, .rcb1)
  let modifiers = commandName.replace(/^\.r[ac]/, '')

  // 检查是否有暗骰标记
  if (modifiers.includes('h')) {
    result.hidden = true
    modifiers = modifiers.replace('h', '')
  }

  // 解析奖励/惩罚骰
  const bonusMatch = modifiers.match(/b(\d*)/)
  const penaltyMatch = modifiers.match(/p(\d*)/)

  if (bonusMatch) {
    const count = bonusMatch[1] ? parseInt(bonusMatch[1], 10) : 1
    result.bonusDice = Math.min(Math.max(count, 1), 3) // 限制在1-3之间
  } else if (penaltyMatch) {
    const count = penaltyMatch[1] ? parseInt(penaltyMatch[1], 10) : 1
    result.bonusDice = -Math.min(Math.max(count, 1), 3) // 负数表示惩罚
  }

  // 解析参数
  if (args.length === 0) {
    return result
  }

  // 第一个参数可能是纯数字（属性值）或属性名
  const firstArg = args[0]
  const firstArgNum = parseFloat(firstArg)

  if (!Number.isNaN(firstArgNum)) {
    // 第一个参数是数字，作为属性值
    result.attrValue = firstArgNum
    // 剩余的作为原因
    if (args.length > 1) {
      result.reason = args.slice(1).join(' ')
    }
  } else {
    // 第一个参数是属性名
    result.attrName = firstArg

    // 检查第二个参数是否是数字
    if (args.length > 1) {
      const secondArgNum = parseFloat(args[1])
      if (!Number.isNaN(secondArgNum)) {
        result.attrValue = secondArgNum
        // 剩余的作为原因
        if (args.length > 2) {
          result.reason = args.slice(2).join(' ')
        }
      } else {
        // 第二个参数不是数字，作为原因
        result.reason = args.slice(1).join(' ')
      }
    }
  }

  return result
}

/**
 * COC7 属性默认值映射
 */
const DEFAULT_ATTRIBUTE_VALUES: Record<string, number> = {
  力量: 50,
  体质: 50,
  体型: 50,
  敏捷: 50,
  外貌: 50,
  智力: 50,
  意志: 50,
  教育: 50,
  幸运: 50
}

/**
 * 判定掷骰命令 .ra / .rc
 */
export function registerCheckCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  // 注册 .ra 命令
  const _raCommand = parent
    .subcommand('.ra [...args:text]', '判定掷骰')
    .usage('用法: .ra[h][p/b数字] [属性] [属性值] [掷骰原因]')
    .example('.ra 80 - 进行成功率为80的D100判定')
    .example('.ra 力量80 - 力量为80，进行D100判定')
    .example('.ra 力量 - 从人物卡中获取力量值，进行D100判定')
    .example('.rah 力量 - 从人物卡中获取力量值，进行D100暗骰判定')
    .example('.rahp2 力量 - 从人物卡中获取力量值，进行带有两个惩罚骰的暗骰判定')
    .action(async ({ session }, ...args) => {
      return await handleCheckCommand(
        session,
        characterService,
        diceAdapter,
        '.ra',
        args
      )
    })

  // 注册 .rc 命令（与 .ra 相同）
  parent
    .subcommand('.rc [...args:text]', '判定掷骰')
    .usage('用法: .rc[h][p/b数字] [属性] [属性值] [掷骰原因]')
    .example('.rc 80 - 进行成功率为80的D100判定')
    .example('.rc 力量80 - 力量为80，进行D100判定')
    .example('.rc 力量 - 从人物卡中获取力量值，进行D100判定')
    .example('.rch 力量 - 从人物卡中获取力量值，进行D100暗骰判定')
    .example('.rchp2 力量 - 从人物卡中获取力量值，进行带有两个惩罚骰的暗骰判定')
    .action(async ({ session }, ...args) => {
      return await handleCheckCommand(
        session,
        characterService,
        diceAdapter,
        '.rc',
        args
      )
    })

  // 注册变体命令以支持修饰符
  registerCheckVariants(parent, characterService, diceAdapter, '.ra')
  registerCheckVariants(parent, characterService, diceAdapter, '.rc')
}

/**
 * 注册命令变体（支持 h, p, b 修饰符）
 */
function registerCheckVariants(
  parent: Command,
  characterService: CharacterService,
  diceAdapter: DiceAdapter,
  baseCmd: string
) {
  const variants = [
    'h',
    'p',
    'p1',
    'p2',
    'p3',
    'b',
    'b1',
    'b2',
    'b3',
    'hp',
    'hp1',
    'hp2',
    'hp3',
    'hb',
    'hb1',
    'hb2',
    'hb3'
  ]

  for (const variant of variants) {
    const cmdName = `${baseCmd}${variant}`
    parent
      .subcommand(`${cmdName} [...args:text]`, '判定掷骰')
      .action(async ({ session }, ...args) => {
        return await handleCheckCommand(
          session,
          characterService,
          diceAdapter,
          cmdName,
          args
        )
      })
  }
}

/**
 * 处理判定命令
 */
async function handleCheckCommand(
  session: any,
  characterService: CharacterService,
  diceAdapter: DiceAdapter,
  commandName: string,
  args: string[]
): Promise<string> {
  try {
    const parsed = parseCheckCommand(commandName, args)

    // 确定最终的属性值
    let finalValue: number | undefined = parsed.attrValue
    let displayAttrName = parsed.attrName

    // 如果没有指定属性值，尝试从人物卡获取
    if (finalValue === undefined) {
      if (parsed.attrName) {
        // 规范化属性名
        const normalizedAttr = normalizeAttributeName(parsed.attrName)
        displayAttrName = normalizedAttr

        // 从人物卡获取属性
        const attributes = await characterService.getAttributes(session, null)
        if (attributes && normalizedAttr in attributes) {
          finalValue = attributes[normalizedAttr]
        } else {
          // 尝试使用默认值
          if (normalizedAttr in DEFAULT_ATTRIBUTE_VALUES) {
            finalValue = DEFAULT_ATTRIBUTE_VALUES[normalizedAttr]
          } else {
            return `未找到属性 ${parsed.attrName}，请先设置人物卡或指定属性值`
          }
        }
      } else {
        return '请指定属性值或属性名\n用法: .ra[h][p/b数字] [属性] [属性值] [掷骰原因]'
      }
    }

    // 验证属性值范围
    if (finalValue < 0 || finalValue > 1000) {
      return '属性值必须在0-1000之间'
    }

    // 如果是暗骰
    if (parsed.hidden) {
      const _success = diceAdapter.hiddenRoll('1d100', 100)
      const parts = [session.username, '进行了暗骰']
      if (displayAttrName) {
        parts.push(`(${displayAttrName})`)
      }
      if (parsed.reason) {
        parts.push(parsed.reason)
      }
      return parts.join(' ')
    }

    // 执行判定
    const result: COCCheckResult = diceAdapter.cocCheck(
      finalValue,
      parsed.bonusDice
    )

    if (result.errorCode !== 0) {
      return `判定失败: ${result.errorMsg}`
    }

    // 构建输出消息
    const parts = [session.username]

    // 添加属性名或原因
    if (displayAttrName && parsed.reason) {
      parts.push(`${displayAttrName} ${parsed.reason}`)
    } else if (displayAttrName) {
      parts.push(displayAttrName)
    } else if (parsed.reason) {
      parts.push(parsed.reason)
    }

    // 添加判定结果
    parts.push(`${result.rollValue}/${result.skillValue}`)
    parts.push(DiceAdapter.formatSuccessLevel(result.successLevel))

    return parts.join(' ')
  } catch (error) {
    logger.error('判定掷骰错误:', error)
    return '判定掷骰时发生错误'
  }
}
