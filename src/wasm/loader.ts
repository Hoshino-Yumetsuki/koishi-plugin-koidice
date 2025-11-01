import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { DiceModule, EmscriptenModuleFactory } from './types'

/**
 * WASM 模块加载器
 */
export class DiceWasmLoader {
  private module: DiceModule | null = null
  private loadPromise: Promise<DiceModule> | null = null
  private initialized = false

  /**
   * 加载 WASM 模块
   */
  async load(): Promise<DiceModule> {
    // 如果已经加载，直接返回
    if (this.module) {
      return this.module
    }

    // 如果正在加载，返回加载Promise
    if (this.loadPromise) {
      return this.loadPromise
    }

    // 开始加载
    this.loadPromise = this.loadInternal()
    this.module = await this.loadPromise
    return this.module
  }

  /**
   * 内部加载逻辑
   */
  private async loadInternal(): Promise<DiceModule> {
    try {
      // 获取WASM文件路径
      const wasmPath = this.getWasmPath()
      const jsPath = wasmPath.replace('.wasm', '.js')

      // 动态导入JS文件
      const createModule = await this.importModuleFactory(jsPath)

      // 读取WASM二进制
      const _wasmBinary = await readFile(wasmPath)

      // 创建模块实例
      const module = await createModule()

      // 初始化模块
      if (!module.initialize()) {
        throw new Error('Failed to initialize Dice WASM module')
      }

      this.initialized = true
      return module as DiceModule
    } catch (error) {
      this.loadPromise = null
      throw new Error(`Failed to load Dice WASM module: ${error.message}`)
    }
  }

  /**
   * 获取WASM文件路径
   */
  private getWasmPath(): string {
    // 在生产环境中，WASM文件应该在lib目录下
    const libPath = resolve(__dirname, '../../lib/dice.wasm')
    return libPath
  }

  /**
   * 动态导入模块工厂
   */
  private async importModuleFactory(
    jsPath: string
  ): Promise<EmscriptenModuleFactory> {
    try {
      const module = await import(jsPath)
      return module.default || module
    } catch (error) {
      throw new Error(
        `Failed to import module factory from ${jsPath}: ${error.message}`
      )
    }
  }

  /**
   * 获取已加载的模块
   */
  getModule(): DiceModule | null {
    return this.module
  }

  /**
   * 检查模块是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 卸载模块（清理资源）
   */
  unload(): void {
    this.module = null
    this.loadPromise = null
    this.initialized = false
  }
}

// 单例实例
let loaderInstance: DiceWasmLoader | null = null

/**
 * 获取全局加载器实例
 */
export function getDiceWasmLoader(): DiceWasmLoader {
  if (!loaderInstance) {
    loaderInstance = new DiceWasmLoader()
  }
  return loaderInstance
}

/**
 * 便捷函数：加载并获取WASM模块
 */
export async function loadDiceWasm(): Promise<DiceModule> {
  const loader = getDiceWasmLoader()
  return loader.load()
}
