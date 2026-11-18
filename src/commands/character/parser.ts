import type { ParsedStCommand, AttributeOperation } from './types';
import type { DiceAdapter } from '../../wasm';

/** 解析属性赋值、增减及表达式。 */
export function parseStCommand(input: string, adapter: Pick<DiceAdapter, 'normalizeAttributeName'>): ParsedStCommand {
  let text = input.trim();
  let cardName: string | undefined;
  const separator = text.search(/::|--/);
  if (separator >= 0) {
    cardName = text.slice(0, separator).trim();
    text = text.slice(separator + 2).trim();
  }
  const operations: AttributeOperation[] = [];
  const pattern = /\s*(&?[^\s:=+\-\d]+)\s*([:=+\-]?)\s*([^\s]+)/gy;
  let position = 0;
  while (position < text.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (!match) throw new Error('属性格式无效');
    const [, rawName, operator, value] = match;
    const expression = rawName.startsWith('&');
    const attr = adapter.normalizeAttributeName(expression ? rawName.slice(1) : rawName);
    if (!attr || value.length > 200) throw new Error('属性格式无效');
    if (expression) {
      if (operator !== '=' || !/^[\d\sDd+*/().%\-]+$/.test(value)) throw new Error('骰子表达式无效');
      operations.push({ attr, op: 'set', value, expression: true });
    } else {
      if (!/^(?:\d+(?:\.\d+)?|\d*[dD]\d+(?:[+*/-]\d+)*)$/.test(value)) throw new Error('属性值无效');
      operations.push({ attr, op: operator === '+' ? 'add' : operator === '-' ? 'sub' : 'set', value });
    }
    position = pattern.lastIndex;
  }
  return { cardName, operations };
}

/**
 * 解析属性名列表（用于 show 和 del 命令）
 * 支持格式：
 * - 力量 敏捷
 * - Alice--力量 敏捷
 * - all
 */
export function parseAttributeList(
  input: string,
  adapter: Pick<DiceAdapter, 'normalizeAttributeName'>
): {
  cardName?: string;
  attributes: string[];
} {
  const separator = input.search(/::|--/);
  const cardName = separator < 0 ? undefined : input.slice(0, separator).trim();
  const text = separator < 0 ? input : input.slice(separator + 2);
  return { cardName, attributes: text.trim().split(/\s+/).filter(Boolean).map(name => adapter.normalizeAttributeName(name)) };
}
