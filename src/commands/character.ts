import type { Context } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { DiceAdapter } from '../wasm';
import type { ExtensionService } from '../services/extension-service';

import { registerCharacterCommands } from './character/index';

/**
 * 注册所有人物卡相关命令
 * @param register 命令注册函数
 * @param ctx Koishi Context
 * @param diceAdapter Dice适配器
 * @param extensionService 扩展服务
 */
export function registerAttributeCharacterCommands(
  register: RegisterCommand,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  registerCharacterCommands(register, ctx, diceAdapter, extensionService);
}
