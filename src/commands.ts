import type { Context } from 'koishi';
import type { Config } from './config';
import { createCommandRegistrar } from './command-scope';
import type { ExtensionService } from './services/extension-service';
import { getDiceAdapter, type DiceAdapter } from './wasm';
import { logger } from './index';
import {
  registerRollCommand,
  registerCheckCommand,
  registerCOCCommands,
  registerDNDGeneratorCommand,
  registerDeckCommands,
  registerAttributeCharacterCommands,
  registerInsanityCommands,
  registerInitiativeCommands,
  registerSettingsCommands,
  registerObserverCommands,
  registerWODCommands,
  registerRuleCommands,
  registerNicknameCommands,
  registerAnkoCommands,
  registerGameCommands
} from './commands/index';
import { registerExtensionCommands } from './commands/extension';

let diceAdapter: DiceAdapter | null = null;

/**
 * 初始化 Dice 适配器
 */
export async function initializeDiceAdapter() {
  if (!diceAdapter) {
    diceAdapter = await getDiceAdapter();
    logger.info(`Dice WASM 模块加载成功: ${diceAdapter.getVersion()}`);
  }
  return diceAdapter;
}

/**
 * 注册所有命令
 */
export async function registerCommands(
  ctx: Context,
  config: Config,
  extensionService?: ExtensionService | null
) {
  if (!diceAdapter) {
    throw new Error('Dice adapter not initialized');
  }

  const register = createCommandRegistrar(ctx, config.diceStyleCommands);
  registerDeckCommands(register, config, diceAdapter);
  registerAttributeCharacterCommands(register, ctx, diceAdapter, extensionService || undefined);
  registerRollCommand(register, ctx, config, diceAdapter);
  registerNicknameCommands(register, ctx, config, diceAdapter);
  registerAnkoCommands(register, ctx, config);
  registerGameCommands(register, ctx, config);

  if (config.enableCOC) {
    registerCheckCommand(register, ctx, config, diceAdapter);
    registerCOCCommands(register, ctx, config, diceAdapter);
    registerInsanityCommands(register, config, diceAdapter);
  }

  if (config.enableDND) {
    registerDNDGeneratorCommand(register, config, diceAdapter);
  }

  registerInitiativeCommands(register, ctx, config, diceAdapter);
  registerSettingsCommands(register, ctx, config, diceAdapter);
  registerObserverCommands(register, ctx, config, diceAdapter);
  registerWODCommands(register, ctx, config, diceAdapter);
  registerRuleCommands(register, config, diceAdapter, ctx, extensionService);

  // 注册扩展管理命令
  if (extensionService) {
    registerExtensionCommands(register, ctx, config, extensionService);
  }
}
