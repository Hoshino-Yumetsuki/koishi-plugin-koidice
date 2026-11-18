import type { RegisterCommand } from '../../command-scope';
import type { Config } from '../../config';
import type { DiceAdapter } from '../../wasm';
import { logger } from '../../index';

/**
 * COC人物作成命令
 * .coc - COC7版单次生成
 * .coc N - COC7版N次生成
 * .coc6 - COC6版单次生成
 * .coc6 N - COC6版N次生成
 * .coc7 - COC7版单次生成
 * .coc7 N - COC7版N次生成
 * .cocd - COC7版详细生成（含背景）
 * .coc6d - COC6版详细生成（含背景）
 * .coc7d - COC7版详细生成（含背景）
 */
export function registerCOCGeneratorCommand(
  register: RegisterCommand,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  for (const version of [6, 7]) {
    const aliases = version === 7 ? ['coc', 'cocs', 'coc7s'] : ['coc6s'];
    register(`coc${version} [count:string]`, `COC${version}版人物作成`, ...aliases).action(({ session }, count) => {
      if (!session) return '无法获取会话信息';
      if (count && !/^(?:[1-9]|10)$/.test(count)) return '生成数量必须在1-10之间';
      const result = version === 7 ? diceAdapter.generateCOC7Multiple(Number(count || 1)) : diceAdapter.generateCOC6Multiple(Number(count || 1));
      return `${session.username} 的COC${version}版人物:\n${result}`;
    });
    register(`coc${version}d`, `COC${version}版详细人物作成（含背景）`, ...(version === 7 ? ['cocd'] : [])).action(({ session }) => {
      if (!session) return '无法获取会话信息';
      const result = version === 7 ? diceAdapter.generateCOC7Detailed() : diceAdapter.generateCOC6Detailed();
      const background = version === 7 ? generateCOC7Background(diceAdapter) : generateCOC6Background(diceAdapter);
      return `${session.username} 的COC${version}版人物（详细）:\n${result}\n${background}`;
    });
  }
}

/**
 * 生成COC7版背景信息
 */
function generateCOC7Background(diceAdapter: DiceAdapter): string {
  try {
    const parts: string[] = [];

    // 性别
    const gender = diceAdapter.drawFromDeck('性别', 1);
    if (gender.success && gender.cards.length > 0) {
      parts.push(`性别=${gender.cards[0]}`);
    }

    // 年龄 (7D6+8)
    const ageRoll = diceAdapter.roll('7d6+8', 6);
    if (ageRoll.errorCode === 0) {
      parts.push(`年龄=${ageRoll.total}`);
    }

    // 职业
    const occupation = diceAdapter.drawFromDeck('调查员职业', 1);
    if (occupation.success && occupation.cards.length > 0) {
      parts.push(`职业=${occupation.cards[0]}`);
    }

    // 个人描述
    const description = diceAdapter.drawFromDeck('个人描述', 1);
    if (description.success && description.cards.length > 0) {
      parts.push(`个人描述=${description.cards[0]}`);
    }

    // 重要之人
    const importantPerson = diceAdapter.drawFromDeck('重要之人', 1);
    if (importantPerson.success && importantPerson.cards.length > 0) {
      parts.push(`重要之人=${importantPerson.cards[0]}`);
    }

    // 思想信念
    const belief = diceAdapter.drawFromDeck('思想信念', 1);
    if (belief.success && belief.cards.length > 0) {
      parts.push(`思想信念=${belief.cards[0]}`);
    }

    // 意义非凡之地
    const place = diceAdapter.drawFromDeck('意义非凡之地', 1);
    if (place.success && place.cards.length > 0) {
      parts.push(`意义非凡之地=${place.cards[0]}`);
    }

    // 宝贵之物
    const treasure = diceAdapter.drawFromDeck('宝贵之物', 1);
    if (treasure.success && treasure.cards.length > 0) {
      parts.push(`宝贵之物=${treasure.cards[0]}`);
    }

    // 特质
    const trait = diceAdapter.drawFromDeck('调查员特点', 1);
    if (trait.success && trait.cards.length > 0) {
      parts.push(`特质=${trait.cards[0]}`);
    }

    return parts.length > 0 ? `\n${parts.join(' ')}` : '';
  } catch (error) {
    logger.error('生成背景信息错误:', error);
    return '';
  }
}

/**
 * 生成COC6版背景信息
 */
function generateCOC6Background(diceAdapter: DiceAdapter): string {
  try {
    const parts: string[] = [];

    // 性别
    const gender = diceAdapter.drawFromDeck('性别', 1);
    if (gender.success && gender.cards.length > 0) {
      parts.push(`性别=${gender.cards[0]}`);
    }

    // 年龄 (7D6+8)
    const ageRoll = diceAdapter.roll('7d6+8', 6);
    if (ageRoll.errorCode === 0) {
      parts.push(`年龄=${ageRoll.total}`);
    }

    // 职业
    const occupation = diceAdapter.drawFromDeck('调查员职业', 1);
    if (occupation.success && occupation.cards.length > 0) {
      parts.push(`职业=${occupation.cards[0]}`);
    }

    return parts.length > 0 ? `\n${parts.join(' ')}` : '';
  } catch (error) {
    logger.error('生成背景信息错误:', error);
    return '';
  }
}
