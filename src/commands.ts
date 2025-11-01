import type { Context } from 'koishi'
import type { Config } from './config'
import { getDiceAdapter, DiceAdapter } from './wasm'
import { logger } from './index'
import {
  registerRollCommand,
  registerCOCCheckCommand,
  registerGrowthCommand,
  registerCOCGeneratorCommand,
  registerSanityCheckCommand,
  registerDNDGeneratorCommand,
  registerDeckCommands,
  registerCharacterCommands,
  registerAttributeCommands,
} from './commands/index'

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
  if (!diceAdapter) {
    throw new Error('Dice adapter not initialized')
  }

  // .r 基础掷骰命令
  registerRollCommand(ctx, config, diceAdapter)
  
  // .rc COC检定命令
  if (config.enableCOC) {
    registerCOCCheckCommand(ctx, config, diceAdapter)
  }
  
  // .draw 抽卡命令
  if (config.enableCustomDeck) {
    registerDeckCommands(ctx, config, diceAdapter)
  }
  
  // .pc 角色卡命令
  if (config.enableCharacterCard) {
    registerCharacterCommands(ctx, config, diceAdapter)
  }
  
  // .st 属性设置命令 (COC)
  if (config.enableCOC) {
    registerAttributeCommands(ctx, config, diceAdapter)
  }
  
  // .en 成长检定命令 (COC)
  if (config.enableCOC) {
    registerGrowthCommand(ctx, config, diceAdapter)
  }
  
  // .coc 人物作成命令
  if (config.enableCOC) {
    registerCOCGeneratorCommand(ctx, config, diceAdapter)
  }
  
  // .dnd 人物作成命令
  if (config.enableDND) {
    registerDNDGeneratorCommand(ctx, config, diceAdapter)
  }
  
  // .sc 理智检定命令 (COC)
  if (config.enableCOC) {
    registerSanityCheckCommand(ctx, config, diceAdapter)
  }
}
