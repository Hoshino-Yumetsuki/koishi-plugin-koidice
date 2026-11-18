# koishi-plugin-koidice

[![npm](https://img.shields.io/npm/v/koishi-plugin-koidice?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-koidice)
[![License](https://img.shields.io/github/license/Hoshino-Yumetsuki/koidice?style=flat-square)](./LICENSE)

Koidice 是基于 [Dice! C++ 核心](https://github.com/Dice-Developer-Team/Dice/tree/7e17e653c64be673f37460d104256b4da28c6e46) 的 Koishi 跑团框架，不是完整的 Dice! 机器人。附带的[上游用户手册](./User_Manual.md)对应 Dice! 2.7.0beta5；本插件支持的命令请以 `.help 指令` 为准。

<i>插件处于早期开发阶段，如果存在 Bug 请开 Issue</i>

## 特性

- **掷骰与检定**：普通、暗骰、简化、多轮、奖惩骰、保留骰、Fudge；COC6/7 人物作成、理智、疯狂、成长，DND 人物作成及 D20 检定。`.setcoc 0`–`.setcoc 7` 支持规则书及上游房规，包括绿色三角洲（6）、BRP（7）；有游戏时按桌设置。
- **其他骰系**：WOD 骰池、双重十字、暗影狂奔、永夜后日谈、祸不单行、山屋惊魂及武术。`.help 指令` 查看当前配置实际注册的命令。
- **桌内状态**：GM/PL/旁观者、先攻、轮盘骰、牌堆实例、安价安科、多角色卡及昵称。日志仅记录主动 `.log join` 的用户；跨桌转发需双方配置且发言人主动 `.link optin`。
- **本地资源**：`data/koidice/decks/` 放置 JSON/YAML 公共牌堆（如 `{"线索":["钥匙","纸条"]}`），`rules/` 放置规则，`plugins/` 放置本地扩展；均相对于 Koishi 的 `baseDir`。`.mod list` 查看安装状态。
- **回复与扩展**：`.reply` 支持完全、前缀、包含和 RE2 正则匹配；`.helpdoc` 可设置本地帮助。Lua / QuickJS 扩展从本地加载，在 WASM 中运行。角色卡模板支持数值运算和属性引用，不是任意 JavaScript 运行环境。
- **职责边界**：`.game kick` 只移除本桌玩家，不改变群成员身份。群管理、入群欢迎、好友请求、OneBot 通知及机器人运营策略由宿主或其他 Koishi 插件实现。Koidice 不注册 `.group`、`.groups`、`.dismiss`、`.welcome` 等宿主命令，也不调用适配器私有 API。
- **频道设置**：原 `.group` 下的跑团开关迁至 `.chan.settings`，沿用原频道设置。例如 `.chan.settings draw off` 只停用本频道的抽牌，`draw on` 恢复。若曾使用插件内的黑名单、限频或敏感词，请先在宿主配置相应策略；Koidice 不再执行这些策略。
- **扩展兼容范围**：支持 `Message`、`StartUp`、`DayNew`、`DayEnd` 和定时触发；不转发群管或好友事件。不提供 Dice! Windows GUI、原生 Python 或远程脚本安装。

## 安装

```bash
# 使用 Koishi 插件市场安装（推荐）
# 或使用命令行
yarn add koishi-plugin-koidice
```

## 快速开始

默认使用 `koidice.r 1d100` 或 `koid.r 1d100` 掷骰，消息前照常加上 Koishi 配置的指令前缀。

要直接发送下方示例中的 `.r`、`.rc`、`.pc.new`，请在插件的「基础设置」中开启 **使用 Dice! 风格命令**（`diceStyleCommands: true`）。此模式不注册 `koidice` 或 `koid`；`.`、`。`、`．`、`!`、`！` 都可直接触发骰子命令，无需更改 Koishi 的全局前缀。开启前请确认其他插件没有占用 `r`、`draw` 等顶层命令名。

### 基础掷骰

```
.r 1d100          # 掷一个100面骰
.r 3d6+5          # 掷三个6面骰并加5
.r 2d20 攻击      # 掷骰并附带原因
.rh 1d100         # 暗骰
.ri -1 调查员      # 掷 1D20-1，把结果记入「调查员」的先攻条目
```

### COC 检定

```
.rc 50            # 技能值50的检定
.ra 侦查 60       # 使用 rc 的别名检定侦查
.rc 调查员::力量+10/2 推门  # 使用自己的指定角色卡；先加 10，再除以 2
.coc6s2           # 一次生成两组 COC6 属性
```

### 牌堆抽卡

```
.draw 塔罗牌      # 从塔罗牌堆抽一张
.draw.list        # 列出所有牌堆
```

### 角色卡管理

```
.pc.new 调查员    # 创建角色卡
.pc.show 调查员   # 查看角色卡
.pc.list          # 列出自己的人物卡
.pc.del 调查员    # 删除角色卡
```

### 构建

```bash
# 安装依赖
yarn install

# 编译 WASM 模块（需要先安装 Emscripten）
yarn build:wasm

# 用 tsdown 生成 ESM、CommonJS 和类型声明，保留 lib/ 下的 WASM 产物
yarn build:ts

# 完整构建
yarn build

# 构建完成后，用 Koishi Mock 和内存数据库测试两种注册模式
yarn test:koishi
```

## 架构

WASM 直接编译 `Dice/Dice/` 中的 `RD.cpp`、`DiceSession.cpp`、`CardDeck.cpp` 等上游源码。普通掷骰和桌内轮盘分别走 `RD::Roll`、`DiceRoulette::roll`；内置公共牌堆用 `DeckInfo` 处理权重和不放回抽取；`.ti`、`.li` 调用上游的 `TempInsane`、`LongInsane`。这些规则不需要在 TypeScript 中再实现一份。

Koishi 层负责命令注册、身份和权限、消息投递，以及桌内状态的持久化。自定义牌堆保留原数据库格式和引用展开限制。WOD 骰池继续由插件执行：上游 `DicePool::roll` 没有总加骰上限，不能保证 `maxDiceCount` 生效。构建不链接 QQ/OneBot 驱动。

## 许可证

本项目采用 [AGPL-3.0](./LICENSE) 许可证。

Dice! 核心采用 AGPL-3.0 许可证。

## 致谢

- [Dice!](https://github.com/Dice-Developer-Team/Dice) - 原始项目
- [Koishi](https://koishi.chat/) - 优秀的聊天机器人框架
- [Emscripten](https://emscripten.org/) - WebAssembly 工具链
