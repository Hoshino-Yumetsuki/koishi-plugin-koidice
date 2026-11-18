/**
 * .pc 多人物卡命令模块
 * 导出所有.pc相关命令
 */
import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import type { ExtensionService } from '../../services/extension-service';
import { registerPcNewCommand } from './pc-new';
import { registerPcTagCommand } from './pc-tag';
import { registerPcShowCommand } from './pc-show';
import { registerPcNnCommand } from './pc-nn';
import { registerPcCpyCommand } from './pc-cpy';
import { registerPcDelCommand } from './pc-del';
import { registerPcListCommand } from './pc-list';
import { registerPcGrpCommand } from './pc-grp';
import { registerPcBuildCommand } from './pc-build';
import { registerPcRedoCommand } from './pc-redo';
import { registerPcClrCommand } from './pc-clr';
import { registerPcStatCommand } from './pc-stat';

/**
 * 注册所有.pc命令
 */
export function registerPcCommands(
  register: RegisterCommand,
  ctx: Context,
  diceAdapter: DiceAdapter,
  extensionService?: ExtensionService
) {
  // 注册子命令到parent
  registerPcNewCommand(register, ctx, diceAdapter, extensionService);
  registerPcTagCommand(register, ctx, diceAdapter);
  registerPcShowCommand(register, ctx, diceAdapter);
  registerPcNnCommand(register, ctx, diceAdapter);
  registerPcCpyCommand(register, ctx, diceAdapter);
  registerPcDelCommand(register, ctx, diceAdapter);
  registerPcListCommand(register, ctx, diceAdapter);
  registerPcGrpCommand(register, ctx, diceAdapter);
  registerPcBuildCommand(register, ctx, diceAdapter);
  registerPcRedoCommand(register, ctx, diceAdapter);
  registerPcClrCommand(register, ctx, diceAdapter);
  registerPcStatCommand(register, ctx, diceAdapter);
}
