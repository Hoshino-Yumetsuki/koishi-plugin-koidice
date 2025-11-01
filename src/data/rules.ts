/**
 * 规则速查数据
 * 简化版，包含常用TRPG规则
 */

export interface RuleEntry {
  name: string
  content: string
}

/**
 * COC规则
 */
export const COCRules: Record<string, RuleEntry> = {
  '大成功': {
    name: '大成功',
    content: '掷出01-05，且结果≤技能值时为大成功。大成功时自动成功，且效果拔群。'
  },
  '大失败': {
    name: '大失败',
    content: '技能值<50时，掷出96-100为大失败；技能值≥50时，掷出100为大失败。大失败时自动失败，且可能有严重后果。'
  },
  '困难成功': {
    name: '困难成功',
    content: '检定结果≤技能值的1/2时为困难成功。'
  },
  '极难成功': {
    name: '极难成功',
    content: '检定结果≤技能值的1/5时为极难成功。'
  },
  '奖励骰': {
    name: '奖励骰',
    content: '投掷1个额外的十位骰，从中选择最有利的结果。每个奖励骰可以多投1个十位骰。'
  },
  '惩罚骰': {
    name: '惩罚骰',
    content: '投掷1个额外的十位骰，从中选择最不利的结果。每个惩罚骰可以多投1个十位骰。'
  },
  '理智检定': {
    name: '理智检定',
    content: '面对超自然恐怖时进行的检定。成功损失较少SAN值，失败损失较多。损失5+SAN值需进行临时疯狂检定。'
  },
  '临时疯狂': {
    name: '临时疯狂',
    content: '单次损失5点或更多理智值时触发。持续1d10轮或1d10小时，期间角色行为异常。'
  },
  '不定疯狂': {
    name: '不定疯狂',
    content: '理智值降至0时触发。持续1d10小时，之后理智值恢复至1d10。'
  },
  '永久疯狂': {
    name: '永久疯狂',
    content: '理智值降至当前最大值的1/5以下时触发。角色获得永久性精神障碍。'
  }
}

/**
 * DND规则
 */
export const DNDRules: Record<string, RuleEntry> = {
  '优势': {
    name: '优势',
    content: '投掷2个d20，取较高的结果。'
  },
  '劣势': {
    name: '劣势',
    content: '投掷2个d20，取较低的结果。'
  },
  '熟练加值': {
    name: '熟练加值',
    content: '根据角色等级获得的加值，用于熟练的技能、豁免和攻击。1-4级+2，5-8级+3，9-12级+4，13-16级+5，17-20级+6。'
  },
  '先攻': {
    name: '先攻',
    content: '战斗开始时，每个参与者投1d20+敏捷调整值，决定行动顺序。'
  },
  '攻击检定': {
    name: '攻击检定',
    content: '1d20+力量/敏捷调整值+熟练加值(如果熟练)。结果≥目标AC则命中。'
  },
  '豁免检定': {
    name: '豁免检定',
    content: '1d20+相应属性调整值+熟练加值(如果熟练)。用于抵抗法术和特殊效果。'
  },
  '死亡豁免': {
    name: '死亡豁免',
    content: '生命值降至0时，每轮进行1d20检定。10+为成功，3次成功稳定，3次失败死亡。投1为2次失败，投20为恢复1点生命值。'
  },
  '短休': {
    name: '短休',
    content: '至少1小时的休息。可以花费生命骰恢复生命值。'
  },
  '长休': {
    name: '长休',
    content: '至少8小时的休息，其中至少6小时睡眠。恢复所有生命值和最多一半的生命骰。'
  }
}

/**
 * 通用规则
 */
export const CommonRules: Record<string, RuleEntry> = {
  '暗骰': {
    name: '暗骰',
    content: '只有GM和投骰者能看到结果的掷骰。用于隐藏信息或制造悬念。'
  },
  '公开骰': {
    name: '公开骰',
    content: '所有人都能看到结果的掷骰。用于透明的判定。'
  },
  '对抗检定': {
    name: '对抗检定',
    content: '双方各投一次检定，较高者获胜。用于直接竞争的情况。'
  }
}

/**
 * 获取规则
 */
export function getRule(system: string, keyword: string): RuleEntry | null {
  const lowerKeyword = keyword.toLowerCase()
  
  let rules: Record<string, RuleEntry>
  switch (system.toLowerCase()) {
    case 'coc':
    case 'coc7':
      rules = COCRules
      break
    case 'dnd':
    case 'dnd5e':
    case '5e':
      rules = DNDRules
      break
    default:
      rules = { ...COCRules, ...DNDRules, ...CommonRules }
  }
  
  // 精确匹配
  for (const [key, entry] of Object.entries(rules)) {
    if (key.toLowerCase() === lowerKeyword || entry.name.toLowerCase() === lowerKeyword) {
      return entry
    }
  }
  
  // 模糊匹配
  for (const [key, entry] of Object.entries(rules)) {
    if (key.toLowerCase().includes(lowerKeyword) || entry.name.toLowerCase().includes(lowerKeyword)) {
      return entry
    }
  }
  
  return null
}

/**
 * 列出所有规则
 */
export function listRules(system: string): string[] {
  let rules: Record<string, RuleEntry>
  switch (system.toLowerCase()) {
    case 'coc':
    case 'coc7':
      rules = COCRules
      break
    case 'dnd':
    case 'dnd5e':
    case '5e':
      rules = DNDRules
      break
    default:
      rules = { ...COCRules, ...DNDRules, ...CommonRules }
  }
  
  return Object.keys(rules)
}
