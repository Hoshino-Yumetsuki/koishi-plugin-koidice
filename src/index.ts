import { type Context, Logger, Schema } from 'koishi'
import type { Config } from './config'
import { initializeDiceAdapter, registerCommands } from './commands'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 读取版本号
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
export const version = packageJson.version
import { getDataPath } from './utils/path'
import { createLogger, setLoggerLevel } from './utils/logger'

export let logger: Logger

export async function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx, 'koidice')
  setupLogger(config)

  // 确保数据目录存在
  try {
    const dataPath = getDataPath()
    logger.info('数据目录: ' + dataPath)
  } catch (error) {
    logger.error('创建数据目录失败:', error)
  }

  // 初始化WASM模块
  try {
    await initializeDiceAdapter()
  } catch (error) {
    logger.error('Dice WASM模块加载失败:', error)
    throw error
  }

  // 注册所有命令
  registerCommands(ctx, config)

  // 清理资源
  ctx.on('dispose', () => {
    logger.info('Dice插件卸载')
  })
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG)
  }
}

export * from './config'
export { name } from './config'
