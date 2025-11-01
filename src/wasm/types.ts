/**
 * Dice WASM 模块类型定义
 */

export interface RollResult {
  total: number
  expression: string
  detail: string
  errorCode: number
  errorMsg: string
}

export interface COCCheckResult {
  rollValue: number
  skillValue: number
  successLevel: number // 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
  description: string
  errorCode: number
  errorMsg: string
}

export interface HiddenRollResult {
  success: boolean
  errorCode: number
  errorMsg: string
}

export interface DeckDrawResult {
  cards: string[]
  remaining: number
  errorCode: number
  errorMsg: string
}

export enum SuccessLevel {
  CriticalFailure = 0,
  Failure = 1,
  Success = 2,
  HardSuccess = 3,
  ExtremeSuccess = 4,
  CriticalSuccess = 5,
}

/**
 * Dice WASM 模块接口
 */
export interface DiceModule {
  // 核心掷骰功能
  rollDice(expression: string, defaultDice?: number): RollResult
  cocCheck(skillValue: number, bonusDice?: number): COCCheckResult
  hiddenRoll(expression: string, defaultDice?: number): HiddenRollResult
  getMaxValue(expression: string, defaultDice?: number): number
  getMinValue(expression: string, defaultDice?: number): number

  // 牌堆功能
  drawCard(deckName: string, count?: number): DeckDrawResult
  resetDeck(deckName: string): void

  // 角色卡功能
  createCharacter(characterName: string): boolean
  setCharacterAttr(characterName: string, attrName: string, attrValue: number): boolean
  getCharacterAttr(characterName: string, attrName: string): number
  deleteCharacter(characterName: string): boolean

  // 工具函数
  getVersion(): string
  initialize(): boolean
}

/**
 * Emscripten 模块工厂类型
 */
export interface EmscriptenModuleFactory {
  (): Promise<DiceModule>
}
