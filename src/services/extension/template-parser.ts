/**
 * 插件角色卡模板解析器
 * 解析 Dice 插件的 XML 格式角色卡模板
 */
import { XMLParser } from 'fast-xml-parser';

export interface TemplateProperty {
  name: string; // 中文名
  alias: string; // 英文别名
  text?: string; // 计算公式类型 (如 'javascript')
  formula?: string; // 计算公式内容
  defaultValue?: number; // 默认值
}

export interface CharacterTemplate {
  name: string; // 模板名称
  properties: TemplateProperty[];
  presets: Record<string, Array<{ name: string; text: string; value: string }>>;
}

/**
 * 解析 XML 格式的角色卡模板
 * @param xmlContent XML 文件内容
 * @returns 解析后的模板对象
 */
export function parseTemplate(xmlContent: string): CharacterTemplate | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });

    const result = parser.parse(xmlContent);

    if (!result?.model) return null;

    const model = result.model;
    const templateName = model['@_name'];

    if (!templateName) return null;

    const properties: TemplateProperty[] = [];
    if (model.property && typeof model.property === 'object') {
      for (const nodes of Object.values(model.property)) {
        for (const node of (Array.isArray(nodes) ? nodes : [nodes]) as unknown[]) {
          if (!node || typeof node !== 'object' || !('@_name' in node)) continue;
          const data = node as Record<string, unknown>;
          if (typeof data['@_name'] !== 'string') continue;
          const prop: TemplateProperty = {
            name: data['@_name'],
            alias: typeof data['@_alias'] === 'string' ? data['@_alias'] : ''
          };
          if (typeof data['@_text'] === 'string') prop.text = data['@_text'];
          if (data['#text'] !== undefined) {
            if (prop.text) prop.formula = String(data['#text']).trim();
            else if (Number.isFinite(Number(data['#text']))) prop.defaultValue = Number(data['#text']);
          }
          properties.push(prop);
        }
      }
    }
    const presets: CharacterTemplate['presets'] = {};
    for (const nodes of Object.values(model.presets || {})) {
      for (const preset of (Array.isArray(nodes) ? nodes : [nodes]) as unknown[]) {
        if (!preset || typeof preset !== 'object' || !('@_name' in preset)) continue;
        const data = preset as Record<string, unknown>;
        if (typeof data['@_name'] !== 'string') continue;
        const shapes: CharacterTemplate['presets'][string] = [];
        for (const [tag, children] of Object.entries(data)) {
          if (tag.startsWith('@_')) continue;
          for (const child of (Array.isArray(children) ? children : [children]) as unknown[]) {
            if (!child || typeof child !== 'object' || !('@_name' in child)) continue;
            const shape = child as Record<string, unknown>;
            if (typeof shape['@_name'] !== 'string') continue;
            shapes.push({ name: shape['@_name'], text: String(shape['@_text'] || ''), value: String(shape['#text'] ?? '') });
          }
        }
        presets[data['@_name']] = shapes;
      }
    }

    return {
      name: templateName,
      properties,
      presets
    };
  } catch (error) {
    console.error('解析模板失败:', error);
    return null;
  }
}

function evaluateFormula(formula: string, resolve: (name: string) => number = () => { throw new Error('未知属性'); }): number {
  let index = 0;

  function skipWhitespace(): void {
    while (/\s/.test(formula[index] ?? '')) index++;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (true) {
      skipWhitespace();
      const operator = formula[index];
      if (operator !== '+' && operator !== '-') return value;
      index++;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (true) {
      skipWhitespace();
      const operator = formula[index];
      if (operator !== '*' && operator !== '/' && operator !== '%') return value;
      index++;
      const right = parseFactor();
      if (operator === '*') value *= right;
      else if (operator === '/') value /= right;
      else value %= right;
    }
  }

  function parseFactor(): number {
    skipWhitespace();
    const operator = formula[index];
    if (operator === '+' || operator === '-') {
      index++;
      const value = parseFactor();
      return operator === '-' ? -value : value;
    }

    if (formula[index] === '(') {
      index++;
      const value = parseExpression();
      skipWhitespace();
      if (formula[index++] !== ')') throw new Error('缺少右括号');
      return value;
    }

    const reference = formula.slice(index).match(/^this\.([\p{L}\p{N}_]+)|^this\[['"]([^'"]+)['"]\]/u);
    if (reference) {
      index += reference[0].length;
      return resolve(reference[1] || reference[2]);
    }
    const call = formula.slice(index).match(/^Math\.(floor|ceil|round|trunc)\s*\(/);
    if (call) {
      index += call[0].length;
      const value = parseExpression();
      skipWhitespace();
      if (formula[index++] !== ')') throw new Error('缺少右括号');
      return Math[call[1] as 'floor' | 'ceil' | 'round' | 'trunc'](value);
    }
    const match = formula.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) throw new Error('不支持的公式');
    index += match[0].length;
    return Number(match[0]);
  }

  const result = parseExpression();
  skipWhitespace();
  if (index !== formula.length) throw new Error('不支持的公式');
  return result;
}

/**
 * 根据模板生成默认属性
 * @param template 角色卡模板
 * @returns 属性对象 (只使用中文名)
 */
export function generateDefaultAttributes(template: CharacterTemplate): Record<string, number> {
  const attributes: Record<string, number> = Object.create(null);
  const aliases = createAliasMap(template);
  const pending = new Set<string>();
  const resolve = (name: string): number => {
    const key = aliases[name] || aliases[name.toLowerCase()] || name;
    if (Object.hasOwn(attributes, key)) return attributes[key];
    const prop = template.properties.find(p => p.name === key);
    if (!prop) return 0;
    if (pending.has(key)) throw new Error(`属性公式循环引用: ${key}`);
    pending.add(key);
    const value = prop.formula && prop.text?.toLowerCase() === 'javascript'
      ? evaluateFormula(prop.formula, resolve) : prop.defaultValue ?? 0;
    pending.delete(key);
    if (!Number.isFinite(value)) throw new Error(`属性公式无效: ${key}`);
    return attributes[key] = value;
  };
  for (const prop of template.properties) resolve(prop.name);
  return attributes;
}

export function generatePresetAttributes(
  template: CharacterTemplate, presets: string, initial: Record<string, number>,
  adapter: { roll(expression: string): { errorCode: number; total: number } },
  limits: { maxDiceCount: number; maxDiceFace: number }
): Record<string, number> {
  const aliases = createAliasMap(template);
  const canonical = (name: string) => aliases[name] || aliases[name.toLowerCase()] || name;
  const attributes: Record<string, number> = Object.create(null);
  for (const [key, value] of Object.entries(initial)) attributes[canonical(key)] = value;
  const shapes = new Map<string, { name: string; text: string; value: string }>();
  for (const name of (presets || 'pc').split(':').filter(Boolean)) {
    const preset = Object.entries(template.presets).find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (!preset) throw new Error(`未知生成参数: ${name}`);
    for (const shape of preset[1]) {
      const key = canonical(shape.name);
      if (!Object.hasOwn(attributes, key) && !shapes.has(key)) shapes.set(key, shape);
    }
  }
  const active = new Set<string>();
  const resolve = (name: string): number => {
    const key = canonical(name);
    if (Object.hasOwn(attributes, key)) {
      if (typeof attributes[key] !== 'number' || !Number.isFinite(attributes[key])) throw new Error(`属性不是数字: ${key}`);
      return attributes[key];
    }
    if (active.has(key)) throw new Error(`属性公式循环引用: ${key}`);
    const shape = shapes.get(key);
    const prop = template.properties.find(p => p.name === key);
    if (!shape && !prop) return 0;
    active.add(key);
    const text = (shape ? shape.text : prop?.text || '').toLowerCase();
    const expression = shape ? shape.value.trim() : prop?.formula || String(prop?.defaultValue ?? 0);
    let value: number;
    if (text === 'javascript') value = evaluateFormula(expression, resolve);
    else if (text === 'dicexp') {
      const expanded = expression.replace(/\{([^{}]+)\}/gu, (_, ref: string) => String(resolve(ref.trim())));
      if (!/^[\d\s.dD+*/%()\-]+$/u.test(expanded)) throw new Error(`不支持的骰式: ${expression}`);
      let count = 0;
      for (const match of expanded.matchAll(/(\d*)[dD](\d+)/gu)) {
        count += Number(match[1] || 1);
        if (Number(match[2]) < 1 || Number(match[2]) > limits.maxDiceFace) throw new Error('骰子面数超出限制');
      }
      if (count > limits.maxDiceCount) throw new Error('骰子数量超出限制');
      const result = adapter.roll(expanded);
      if (result.errorCode) throw new Error(`骰式无效: ${expression}`);
      value = result.total;
    } else {
      if (text || !expression || !Number.isFinite(Number(expression))) throw new Error(`不支持的属性值: ${key}`);
      value = Number(expression);
    }
    active.delete(key);
    if (!Number.isFinite(value)) throw new Error(`属性公式无效: ${key}`);
    if (shape) attributes[key] = value;
    return value;
  };
  for (const key of shapes.keys()) resolve(key);
  return attributes;
}

/**
 * 创建属性别名映射表
 * @param template 角色卡模板
 * @returns 别名到中文名的映射
 */
export function createAliasMap(template: CharacterTemplate): Record<string, string> {
  const aliasMap: Record<string, string> = Object.create(null);
  for (const prop of template.properties) {
    for (const alias of prop.alias.split('/')) if (alias) {
      aliasMap[alias] = prop.name;
      aliasMap[alias.toLowerCase()] = prop.name;
    }
  }
  return aliasMap;
}
