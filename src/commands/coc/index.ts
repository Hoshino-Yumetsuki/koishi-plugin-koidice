import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { Config } from '../../config';
import type { DiceAdapter } from '../../wasm';

import { registerGrowthCommand } from './growth';
import { registerSanityCheckCommand } from './sanity';
import { registerCOCGeneratorCommand } from './generator';

/**
 * 注册所有COC相关命令
 * @param register 命令注册函数
 * @param ctx Koishi Context
 * @param config 配置
 * @param diceAdapter Dice适配器
 */
export function registerCOCCommands(
  register: RegisterCommand,
  ctx: Context,
  config: Config,
  diceAdapter: DiceAdapter
) {
  registerGrowthCommand(register, ctx, config, diceAdapter);
  registerSanityCheckCommand(register, ctx, config, diceAdapter);
  registerCOCGeneratorCommand(register, config, diceAdapter);
}

// 导出各个子模块
export * from './growth';
export * from './sanity';
export * from './generator';
