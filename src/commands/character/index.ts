/**
 * 人物卡命令模块
 * 导出所有人物卡相关命令
 */
import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import type { ExtensionService } from '../../services/extension-service';
import { registerStSetCommand } from './st-set';
import { registerStShowCommand } from './st-show';
import { registerStSwitchCommand } from './st-switch';
import { registerStDelCommand } from './st-del';
import { registerStClrCommand } from './st-clr';
import { registerPcCommands } from '../pc';

export function registerCharacterCommands(
  register: RegisterCommand,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  registerStShowCommand(register, ctx, diceAdapter);
  registerStSwitchCommand(register, ctx, diceAdapter);
  registerStDelCommand(register, ctx, diceAdapter);
  registerStClrCommand(register, ctx, diceAdapter);

  registerStSetCommand(register, ctx, diceAdapter);

  // 注册.pc多人物卡命令
  registerPcCommands(register, ctx, diceAdapter, extensionService);
}

export * from './types';
export * from './parser';
