/**
 * 人物卡命令相关类型定义
 */

/**
 * 属性操作类型
 */
export type AttributeOperation = {
  attr: string;
  op: 'set' | 'add' | 'sub';
  value: string | number;
  expression?: boolean;
};

/**
 * 解析后的命令参数
 */
export interface ParsedStCommand {
  cardName?: string;
  operations: AttributeOperation[];
}
