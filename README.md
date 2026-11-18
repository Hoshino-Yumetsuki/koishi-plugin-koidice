# koishi-plugin-koidice

[![npm](https://img.shields.io/npm/v/koishi-plugin-koidice?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-koidice)
[![License](https://img.shields.io/github/license/Hoshino-Yumetsuki/koidice?style=flat-square)](./LICENSE)

Dice! 的完整 Koishi 移植版本，通过 WebAssembly 技术将 Dice! 的 C++ 核心移植到 Koishi 平台。

<i>插件处于早期开发阶段，如果存在 Bug 请开 Issue</i>

## 特性

- **完整的掷骰功能** - 支持复杂的掷骰表达式
- **COC7 规则支持** - 完整的克苏鲁神话 TRPG 规则
- **自定义牌堆** - 灵活的抽卡系统
- **角色卡管理** - 创建和管理角色属性
- **高性能** - 基于 WebAssembly，接近原生性能
- **易于扩展** - 模块化设计，便于添加新功能

## 安装

```bash
# 使用 Koishi 插件市场安装（推荐）
# 或使用命令行
yarn add koishi-plugin-koidice
```

## 快速开始

默认使用 `koidice.r 1d100` 或 `koid.r 1d100` 掷骰，消息前照常加上 Koishi 配置的指令前缀。

要直接发送下方示例中的 `.r`、`.rc`、`.pc.new`，请在插件的「基础设置」中开启 **使用 Dice! 风格命令**（`diceStyleCommands: true`）。此模式不注册 `koidice` 或 `koid`；`.`、`。`、`!`、`！` 都可直接触发骰子命令，无需更改 Koishi 的全局前缀。开启前请确认其他插件没有占用 `r`、`draw` 等顶层命令名。

### 基础掷骰

```
.r 1d100          # 掷一个100面骰
.r 3d6+5          # 掷三个6面骰并加5
.r 2d20 攻击      # 掷骰并附带原因
.rh 1d100         # 暗骰
```

### COC 检定

```
.rc 50            # 技能值50的检定
.ra 侦查 60       # 使用 rc 的别名检定侦查
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

# 编译 TypeScript
yarn build:ts

# 完整构建
yarn build:all
```

## 架构

本项目采用三层架构：

1. **Koishi 插件层** - 命令注册、会话管理
2. **WASM 适配器层** - TypeScript 友好的 API 封装
3. **C++ 核心层** - Dice! 原生核心逻辑

通过 WebAssembly 技术，我们能够：

- 复用 Dice! 的成熟核心代码
- 获得接近原生的性能
- 保持跨平台兼容性

## 许可证

本项目采用 [AGPL-3.0](./LICENSE) 许可证。

Dice! 核心采用 AGPL-3.0 许可证。

## 致谢

- [Dice!](https://github.com/Dice-Developer-Team/Dice) - 原始项目
- [Koishi](https://koishi.chat/) - 优秀的聊天机器人框架
- [Emscripten](https://emscripten.org/) - WebAssembly 工具链
