import type { Command, Context } from 'koishi'
import type { DiceAdapter } from '../wasm'

import { registerCharacterCommands } from './character/index'

/**
 * 注册所有人物卡相关命令
 * @param parent 父命令
 * @param ctx Koishi Context
 * @param diceAdapter Dice适配器
 */
export function registerAttributeCharacterCommands(
  parent: Command,
  ctx: Context,
  diceAdapter: DiceAdapter
) {
  registerCharacterCommands(parent, ctx, diceAdapter)
}
