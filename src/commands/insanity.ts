import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';

/**
 * 疯狂症状命令 .ti / .li
 */
export function registerInsanityCommands(
  register: RegisterCommand,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  for (const temporary of [true, false]) {
    const label = temporary ? '临时疯狂症状' : '永久/不定疯狂症状';
    register(temporary ? 'ti' : 'li', label).action(async ({ session }) => {
      if (!session) return '无法获取会话信息';
      try {
        const result = diceAdapter.generateInsanity(temporary);
        const symptom = result.symptom
          .replace(/{dur}/g, () => result.duration)
          .replace(/{pc}/g, () => session.username)
          .replace(/{nick}/g, () => session.username)
          .replace(/{detail_roll}/g, () => result.detailRoll)
          .replace(/{detail}/g, () => result.detail);
        return `${session.username} 的${label}:\n${symptom}`;
      } catch (error) {
        logger.error(temporary ? '临时疯狂症状错误:' : '永久疯狂症状错误:', error);
        return temporary ? '生成临时疯狂症状时发生错误' : '生成永久疯狂症状时发生错误';
      }
    });
  }
}
