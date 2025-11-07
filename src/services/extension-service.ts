import type { Context } from 'koishi'
import type { DiceAdapter } from '../wasm'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as toml from '@iarna/toml'
import { logger } from '../index'
import { CharacterService } from './character'
import { GameSessionService } from './game-session-service'
import type {
  DescriptorJson,
  ReplyConfig,
  LoadedPlugin
} from './extension/types'
import { wrapLuaScript } from './extension/script-wrapper'
import { loadRulebooks } from './extension/rulebook-loader'
import { registerPluginCommands } from './extension/command-registry'

/**
 * 扩展加载和管理服务
 */
export class ExtensionService {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map()
  private pluginRules: Map<string, any> = new Map()
  private pluginDir: string
  private characterService: CharacterService
  private gameSessionService: GameSessionService

  constructor(
    private ctx: Context,
    private adapter: DiceAdapter
  ) {
    // 插件目录: data/koidice/plugins/
    this.pluginDir = path.join(ctx.baseDir, 'data', 'koidice', 'plugins')
    // 初始化角色卡服务
    this.characterService = new CharacterService(ctx, adapter)
    // 初始化游戏会话服务
    this.gameSessionService = new GameSessionService(ctx)
  }

  /**
   * 初始化：扫描并加载所有插件
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Extension System')

    // 确保插件目录存在
    try {
      await fs.mkdir(this.pluginDir, { recursive: true })
      logger.info(`Plugin directory: ${this.pluginDir}`)
    } catch (error) {
      logger.error('Failed to create plugin directory:', error)
      return
    }

    // 扫描插件目录
    const pluginDirs = await this.scanPluginDirectory()
    logger.info(`Found ${pluginDirs.length} plugin(s)`)

    // 加载每个插件
    for (const dir of pluginDirs) {
      try {
        await this.loadPlugin(dir)
      } catch (error) {
        logger.error(`Failed to load plugin from ${path.basename(dir)}:`, error)
      }
    }

    logger.info(`Successfully loaded ${this.loadedPlugins.size} plugin(s)`)
    logger.info('Extension System Ready')
  }

  /**
   * 扫描插件目录
   */
  private async scanPluginDirectory(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(this.pluginDir, entry.name))
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  /**
   * 加载单个插件（原始 Dice 格式）
   */
  async loadPlugin(pluginPath: string): Promise<boolean> {
    const pluginName = path.basename(pluginPath)
    logger.info(`Loading plugin: ${pluginName}`)

    // 1. 读取 descriptor.json
    let descriptor: DescriptorJson
    try {
      const descriptorPath = path.join(pluginPath, 'descriptor.json')
      const content = await fs.readFile(descriptorPath, 'utf-8')
      descriptor = JSON.parse(content)
      logger.info(
        `Descriptor: ${descriptor.title || descriptor.name} v${descriptor.ver}`
      )
    } catch (error) {
      logger.error(`Failed to read descriptor.json:`, error)
      return false
    }

    // 2. 扫描 script/ 目录，加载所有 Lua/JS 脚本
    const scripts = new Map<string, string>()
    const scriptDir = path.join(pluginPath, 'script')
    try {
      await this.loadScriptsRecursive(
        scriptDir,
        scriptDir,
        descriptor.name,
        scripts
      )
      logger.info(`Loaded ${scripts.size} script(s)`)
    } catch (_error) {
      logger.warn(`No scripts found or error loading scripts`)
    }

    // 3. 加载脚本到 WASM
    for (const [scriptName, code] of scripts) {
      try {
        // 根据文件扩展名判断类型
        const isLua = scriptName.endsWith('.lua')
        const isJs = scriptName.endsWith('.js')

        // 移除扩展名得到 WASM 脚本名
        const wasmScriptName = scriptName.replace(/\.(lua|js)$/, '')

        let success = false
        if (isLua) {
          // 使用包装函数处理 Lua 脚本
          const processedCode = wrapLuaScript(code, descriptor)
          success = this.adapter.loadLuaExtension(wasmScriptName, processedCode)

          // 同时用简短名称注册（去掉插件名前缀）
          // 例如: Maid-TRPG.Maid.overview -> Maid.overview
          if (success && wasmScriptName.startsWith(`${descriptor.name}.`)) {
            const shortName = wasmScriptName.substring(
              descriptor.name.length + 1
            )
            this.adapter.loadLuaExtension(shortName, processedCode)
          }
        } else if (isJs) {
          success = this.adapter.loadJSExtension(wasmScriptName, code)

          // 同时用简短名称注册
          if (success && wasmScriptName.startsWith(`${descriptor.name}.`)) {
            const shortName = wasmScriptName.substring(
              descriptor.name.length + 1
            )
            this.adapter.loadJSExtension(shortName, code)
          }
        } else {
          logger.warn(`Unknown script type: ${scriptName}`)
          continue
        }

        if (success) {
          logger.info(`Loaded: ${wasmScriptName}`)
        } else {
          logger.warn(`Failed: ${wasmScriptName}`)
        }
      } catch (error) {
        logger.error(`Error loading ${scriptName}:`, error)
      }
    }

    // 4. 读取 rulebook/ 目录，加载规则文件
    const rulebookDir = path.join(pluginPath, 'rulebook')
    try {
      await loadRulebooks(rulebookDir, descriptor.name, this.pluginRules)
    } catch (error) {
      logger.debug(`No rulebooks found:`, error)
    }

    // 5. 读取 reply/ 目录，解析命令配置
    const commands = new Map<string, ReplyConfig>()
    const replyDir = path.join(pluginPath, 'reply')
    try {
      await this.loadReplyConfigs(replyDir, commands)
      logger.info(`Found ${commands.size} command(s)`)
    } catch (_error) {
      logger.warn(`No reply configs found`)
    }

    // 6. 注册 Koishi 命令 - 这是核心部分！
    if (commands.size > 0) {
      await registerPluginCommands(
        this.ctx,
        this.adapter,
        descriptor,
        commands,
        this.characterService,
        this.gameSessionService,
        this.pluginRules
      )
    }

    // 保存插件信息
    const plugin: LoadedPlugin = {
      name: descriptor.name,
      path: pluginPath,
      descriptor,
      scripts,
      commands
    }
    this.loadedPlugins.set(descriptor.name, plugin)

    logger.info(`Plugin loaded: ${descriptor.name}`)
    return true
  }

  /**
   * 递归加载脚本文件
   * @param dir 当前目录
   * @param scriptRoot 脚本根目录（用于计算相对路径）
   * @param baseName 插件基础名称
   * @param scripts 脚本集合
   */
  private async loadScriptsRecursive(
    dir: string,
    scriptRoot: string,
    baseName: string,
    scripts: Map<string, string>
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // 递归子目录
        await this.loadScriptsRecursive(fullPath, scriptRoot, baseName, scripts)
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.lua') || entry.name.endsWith('.js'))
      ) {
        // 读取脚本文件
        const code = await fs.readFile(fullPath, 'utf-8')

        // 脚本名称格式: BaseName.subdir.filename (含扩展名，用于判断类型)
        // 例如: script/Maid/team.lua -> Maid-TRPG.Maid.team.lua
        const relativePath = path.relative(scriptRoot, fullPath)
        const scriptName = `${baseName}.${relativePath.replace(/[/\\]/g, '.')}`

        scripts.set(scriptName, code)
      }
    }
  }

  /**
   * 加载 reply 配置（TOML 格式）
   */
  private async loadReplyConfigs(
    replyDir: string,
    commands: Map<string, ReplyConfig>
  ): Promise<void> {
    const files = await fs.readdir(replyDir)
    const tomlFiles = files.filter((f) => f.endsWith('.toml'))

    for (const file of tomlFiles) {
      const filePath = path.join(replyDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const config = toml.parse(content) as any

      logger.debug(`Parsing ${file}, keys:`, Object.keys(config))

      // TOML 格式: [reply._commandName] 会被解析为嵌套对象
      // { reply: { _commandName: { ... } } }
      if (config.reply && typeof config.reply === 'object') {
        for (const commandName of Object.keys(config.reply)) {
          logger.debug(`  Found command: ${commandName}`)
          commands.set(commandName, config.reply[commandName] as ReplyConfig)
        }
      }
    }
  }

  /**
   * 列出所有已加载的插件
   */
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values())
  }

  /**
   * 获取插件信息
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name)
  }

  /**
   * 查询插件规则
   */
  queryPluginRule(ruleName: string, keyword: string): string | undefined {
    const manual = this.pluginRules.get(ruleName)
    if (manual?.[keyword]) {
      return manual[keyword]
    }
    return undefined
  }

  /**
   * 列出所有插件规则系统
   */
  listPluginRules(): string[] {
    return Array.from(this.pluginRules.keys())
  }

  /**
   * 重载插件
   */
  async reloadPlugin(name: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(name)
    if (!plugin) {
      logger.warn(`Plugin not found: ${name}`)
      return false
    }

    // 卸载旧脚本
    for (const scriptName of plugin.scripts.keys()) {
      const wasmScriptName = scriptName.replace(/\.(lua|js)$/, '')
      this.adapter.unloadExtension(wasmScriptName)
    }

    // 重新加载
    this.loadedPlugins.delete(name)
    return await this.loadPlugin(plugin.path)
  }
}
