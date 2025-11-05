import type { Command, Context } from 'koishi'
import type { Config } from '../config'
import { DiceAdapter } from '../wasm'
import type { COCCheckResult, RollResult } from '../wasm'
import { logger } from '../index'
import { CharacterService } from '../services/character-service'

/**
 * COC检定命令 .rc
 */
export function registerCOCCheckCommand(
  parent: Command,
  _ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  parent
    .subcommand('.rc <skill:number>', 'COC技能检定')
    .alias('.check')
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

        const result: COCCheckResult = diceAdapter.cocCheck(skill, bonusDice)

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
 * 成长检定命令 .en
 */
export function registerGrowthCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)

  parent
    .subcommand('.en <skill:text>', '成长检定')
    .action(async ({ session }, skill) => {
      if (!skill) {
        return '请指定技能名称'
      }

      try {
        // 获取当前技能值
        const attributes = await characterService.getAttributes(session, null)
        if (!attributes || !(String(skill) in attributes)) {
          return `未找到技能 ${skill}，请先使用 .st.set ${skill} <值> 设置`
        }

        const currentValue = attributes[String(skill)]

        // 成长检定: 1d100 > 当前技能值
        const result: RollResult = diceAdapter.roll('1d100', 100)

        if (result.errorCode !== 0) {
          return `检定失败: ${result.errorMsg}`
        }

        const rollValue = result.total

        if (rollValue > currentValue) {
          // 成功，进行成长
          const growthResult: RollResult = diceAdapter.roll('1d10', 10)
          const growth = growthResult.total
          const newValue = Math.min(currentValue + growth, 99)

          await characterService.setAttributes(session, null, {
            [String(skill)]: newValue
          })

          return (
            `${session.username} ${skill} 成长检定\n` +
            `${rollValue}/${currentValue} 成功\n` +
            `${skill} 增长 ${growth} 点: ${currentValue} → ${newValue}`
          )
        } else {
          return (
            `${session.username} ${skill} 成长检定\n` +
            `${rollValue}/${currentValue} 失败\n` +
            `${skill} 未能成长`
          )
        }
      } catch (error) {
        logger.error('成长检定错误:', error)
        return '成长检定时发生错误'
      }
    })
}

/**
 * COC人物作成命令 .coc
 */
export function registerCOCGeneratorCommand(
  parent: Command,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  parent
    .subcommand('.coc [version:text]', 'COC7人物作成')
    .option('count', '-n <count:number> 生成数量', { fallback: 1 })
    .action(async ({ session }, version) => {
      try {
        const ver = version?.toLowerCase() || '7'
        let result: string

        if (ver === '6') {
          result = diceAdapter.generateCOC6()
        } else {
          result = diceAdapter.generateCOC7()
        }

        return `${session.username} 的COC${ver}版人物:\n${result}`
      } catch (error) {
        logger.error('人物作成错误:', error)
        return '人物作成时发生错误'
      }
    })
}

/**
 * 理智检定命令 .sc
 */
export function registerSanityCheckCommand(
  parent: Command,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter)
  parent
    .subcommand('.sc <success:text> <failure:text>', '理智检定')
    .option('san', '-s <san:number> 当前理智值')
    .action(async ({ session, options }, loss) => {
      if (!loss) {
        return '请指定损失表达式 格式: .sc 成功损失/失败损失 [-s 当前SAN值]'
      }

      try {
        // 解析损失表达式 "1/1d6" 或 "0/1d10"
        const parts = loss.split('/')
        if (parts.length !== 2) {
          return '损失表达式格式错误 格式: 成功损失/失败损失 (如: 0/1d6)'
        }

        const successLoss = parts[0].trim()
        const failureLoss = parts[1].trim()

        // 获取当前SAN值
        let currentSan = options.san
        if (currentSan === undefined) {
          // 尝试从角色卡获取
          const attributes = await characterService.getAttributes(session, null)
          if (!attributes || !('理智' in attributes)) {
            return '未设定SAN值，请使用 -s 参数指定或先 .st.set 理智 <值> '
          }
          currentSan = attributes.理智
        }

        if (currentSan < 0 || currentSan > 99) {
          return 'SAN值必须在0-99之间'
        }

        // 执行理智检定
        const result = diceAdapter.sanityCheck(
          currentSan,
          successLoss,
          failureLoss
        )

        if (result.errorMsg) {
          return `理智检定失败: ${result.errorMsg}`
        }

        // 更新角色卡SAN值
        await characterService.setAttributes(session, null, {
          理智: result.newSan
        })

        const successText = result.success ? '成功' : '失败'
        return (
          `${session.username} 的理智检定:\n` +
          `${result.rollValue}/${currentSan} ${successText}\n` +
          `理智减少 ${result.sanLoss} 点\n` +
          `当前理智: ${result.newSan}`
        )
      } catch (error) {
        logger.error('理智检定错误:', error)
        return '理智检定时发生错误'
      }
    })
}
