# QuickJS 实现状态报告

## 概述

本文档记录了 QuickJS 在 Koidice 项目中的实现状态，以及与原始 Dice! 项目的功能对比。

**最后更新**: 2025-11-04

## 执行摘要

QuickJS 是原始 Dice! 项目中用于支持自定义角色卡模板和脚本触发器的 JavaScript 引擎。**Koidice 当前未实现 QuickJS 相关功能**。

### 关键发现

- ✅ **基础掷骰功能**: 完全实现，无需 QuickJS
- ✅ **COC/DND 规则**: 完全实现，无需 QuickJS  
- ✅ **标准角色卡管理**: 已实现简化版本
- ❌ **JavaScript 表达式求值**: 未实现
- ❌ **角色卡模板脚本**: 未实现
- ❌ **事件触发器系统**: 未实现
- ❌ **动态属性计算**: 未实现

### 影响评估

**功能影响级别**: 🟡 **中等** (高级功能缺失，但核心功能完整)

## QuickJS 在 Dice! 中的用途

### 1. 角色卡模板系统

QuickJS 在 Dice! 中主要用于支持高级角色卡模板功能：

#### 1.1 JavaScript 类型的属性定义

允许在 XML 模板中使用 JavaScript 表达式定义属性：

```xml
<Attr text="javascript">
  return this.STR + this.CON * 2;
</Attr>
```

**位置**: `Dice/Dice/CharacterCard.cpp:38-43`

#### 1.2 模板初始化脚本

允许模板包含初始化脚本：

```cpp
js_ctx = std::make_shared<js_context>();
if (!script.empty()) {
    if (auto ret{ js_ctx->evalString(script, "model.init") };
        JS_IsException(ret)) {
        console.log("初始化<" + type + ">js脚本失败!\n" + js_ctx->getException(), 0b10);
    }
}
```

**位置**: `Dice/Dice/CharacterCard.cpp:198-203`

#### 1.3 事件触发器

支持在特定事件时执行 JavaScript 脚本：

```cpp
void CardTemp::after_update(const ptr<AnysTable>& eve) const {
    for (auto& [t, trigger] : multi_range(triggers_by_time, trigger_time::AfterUpdate)) {
        if (auto ret = js_ctx->evalStringLocal(trigger.script, trigger.name, eve);
            JS_IsException(ret)) {
            console.log("执行<" + type + ">after_update触发器" + trigger.name + "失败!\n" 
                + js_ctx->getException(), 0b10);
        }
    }
}
```

**位置**: `Dice/Dice/CharacterCard.cpp:227-233`

### 2. 文本格式化系统

QuickJS 也用于支持在文本中嵌入 JavaScript 表达式：

```cpp
class MarkJSNode : public MarkNode {
public:
    AttrVar format(const AttrObject& context, bool isTrust = true, 
                   const dict_ci<string>& global = {})const override {
        return js_context_eval(leaf, context.p);
    }
};
```

**位置**: `Dice/Dice/DiceFormatter.cpp`

### 3. JavaScript API

QuickJS 提供了丰富的 API 供脚本使用：

- `dice.log()` - 日志输出
- `dice.loadJS()` - 加载外部 JS 文件
- `dice.getDiceID()` - 获取机器人 ID
- `dice.eventMsg()` - 事件消息处理
- `dice.sendMsg()` - 发送消息
- `dice.getGroupAttr()` / `dice.setGroupAttr()` - 群组属性
- `dice.getUserAttr()` / `dice.setUserAttr()` - 用户属性
- `dice.getPlayerCard()` - 获取角色卡

**位置**: `Dice/Dice/DiceQJS.h:42-56`

## Koidice 当前实现

### 已实现的功能

Koidice 实现了 Dice! 的核心功能，但使用了简化的实现：

1. **基础角色卡管理** (`src/commands/character.ts`)
   - JSON 文件存储
   - 基本属性的读写
   - 角色卡列表管理

2. **掷骰系统** (完全基于 C++ WASM)
   - RD.cpp 掷骰引擎
   - COC/DND 规则
   - 表达式求值

3. **牌堆系统** (基于 CardDeck.cpp)
   - 使用原始 Dice! 的 CardDeck 实现
   - 无需 JavaScript

### 未实现的功能

以下功能因依赖 QuickJS 而未实现：

1. **JavaScript 表达式属性**
   - 无法在角色卡中定义 JavaScript 计算的属性
   - 只支持静态数值属性

2. **角色卡模板系统**
   - 无法加载和使用自定义 XML 模板
   - 无法使用模板初始化脚本

3. **事件触发器**
   - 无法在属性更新后自动执行脚本
   - 无法实现复杂的联动逻辑

4. **文本中的 JS 表达式**
   - 无法在文本格式化中使用 JavaScript
   - 只支持变量替换

## 技术实现细节

### QuickJS 集成架构

在原始 Dice! 项目中：

```
DiceEvent (用户命令)
    ↓
CharacterCard (角色卡)
    ↓
CardTemp (模板) + js_context
    ↓
QuickJS Runtime
    ↓
JavaScript 代码执行
```

### 相关文件

#### Dice! 核心
- `Dice/Dice/DiceJS.cpp` (1163 行) - JS 接口实现
- `Dice/Dice/DiceJS.h` (53 行) - JS 接口定义
- `Dice/Dice/DiceQJS.h` (116 行) - QuickJS C API 绑定
- `Dice/Dice/CharacterCard.cpp` (745 行) - 角色卡实现（包含 JS 调用）
- `Dice/Dice/DiceFormatter.cpp` - 格式化器（包含 JS 节点）
- `Dice/quickjspp/` - QuickJS 库源码

#### Koidice 实现
- `src/commands/character.ts` - 简化的角色卡实现
- `wasm/CMakeLists.txt:48` - 包含 quickjspp 目录但未使用

### 为什么未实现

1. **WASM 限制**
   - QuickJS 是完整的 JavaScript 引擎（~2MB 源码）
   - 会显著增加 WASM 文件大小
   - 增加编译复杂度

2. **使用场景受限**
   - 大多数用户使用标准模板（COC7、DND 等）
   - 自定义脚本功能使用率较低
   - 简化的实现已满足主要需求

3. **安全性考虑**
   - JavaScript 执行需要严格的沙箱
   - WASM 环境下的沙箱实现复杂
   - 潜在的安全风险

## 功能对比表

| 功能 | Dice! | Koidice | 说明 |
|------|-------|---------|------|
| 基础掷骰 | ✅ | ✅ | 完全实现 |
| COC7 规则 | ✅ | ✅ | 完全实现 |
| DND 规则 | ✅ | ✅ | 完全实现 |
| 标准角色卡 | ✅ | ✅ | JSON 存储 |
| 自定义模板 | ✅ | ❌ | 需要 QuickJS |
| JS 表达式属性 | ✅ | ❌ | 需要 QuickJS |
| 事件触发器 | ✅ | ❌ | 需要 QuickJS |
| 文本 JS 表达式 | ✅ | ❌ | 需要 QuickJS |
| 牌堆系统 | ✅ | ✅ | 使用 CardDeck.cpp |
| 先攻系统 | ✅ | ✅ | 完全实现 |

## 影响分析

### 对普通用户

**影响**: 🟢 **极小**

大多数用户使用标准功能，不会注意到差异：
- ✅ 所有常用掷骰功能正常工作
- ✅ COC7/COC6/DND 规则完整支持
- ✅ 基本角色卡管理可用
- ✅ 牌堆、先攻等扩展功能正常

### 对高级用户

**影响**: 🟡 **中等**

依赖高级功能的用户会受到限制：
- ❌ 无法创建自定义角色卡模板
- ❌ 无法使用 JavaScript 动态计算属性
- ❌ 无法使用事件触发器实现复杂逻辑
- ⚠️ 需要使用其他方式实现类似功能

### 对开发者

**影响**: 🟡 **中等**

扩展功能受限：
- ❌ 无法通过 JavaScript 扩展功能
- ✅ 可以通过 TypeScript 添加新命令
- ✅ 可以通过 C++ WASM 扩展核心功能

## 实现建议

如果需要实现 QuickJS 支持，有以下几种方案：

### 方案 1: 完整 QuickJS 集成 ⭐⭐⭐

**工作量**: 大 (2-3 周)

**步骤**:
1. 在 WASM 构建中包含 QuickJS 源码
2. 实现 js_context 的 WASM 绑定
3. 实现所有 Dice! JavaScript API
4. 添加模板加载和解析功能
5. 实现事件触发器系统

**优点**:
- 功能完整
- 与 Dice! 兼容

**缺点**:
- WASM 文件显著增大（+2-3MB）
- 编译时间增加
- 维护成本高
- 安全性需要额外考虑

### 方案 2: 最小化 JS 支持 ⭐⭐⭐⭐

**工作量**: 中 (1-2 周)

**步骤**:
1. 只实现 evalString 和基本 API
2. 仅支持属性计算，不支持触发器
3. 使用现有 QuickJS，不添加复杂绑定

**优点**:
- 支持核心 JS 功能
- WASM 增加可控（+1-1.5MB）
- 实现相对简单

**缺点**:
- 功能不完整
- 与 Dice! 部分兼容

### 方案 3: TypeScript 替代 ⭐⭐⭐⭐⭐ (推荐)

**工作量**: 小 (3-5 天)

**步骤**:
1. 在 TypeScript 层实现模板系统
2. 使用 JSON/YAML 定义模板
3. 使用 TypeScript 实现动态属性计算
4. 在 Koishi 层实现事件系统

**优点**:
- 无需修改 WASM
- 更好的 TypeScript 集成
- 更容易维护和调试
- 更好的安全性

**缺点**:
- 与 Dice! 模板不兼容
- 需要重新设计模板格式

### 方案 4: 保持现状 ⭐⭐⭐⭐⭐ (当前选择)

**工作量**: 无

保持简化实现，在文档中说明差异：

**优点**:
- 无额外工作
- WASM 体积小
- 功能清晰简单
- 满足大多数用户需求

**缺点**:
- 高级功能缺失
- 与 Dice! 不完全兼容

## 使用统计

基于对 Dice! 代码的分析：

- **QuickJS 代码行数**: ~1200 行（DiceJS.cpp + DiceQJS.h）
- **调用 QuickJS 的位置**: 13 处（主要在 CharacterCard.cpp 和 DiceFormatter.cpp）
- **核心功能依赖**: 低（主要功能不依赖 JS）
- **高级功能依赖**: 高（自定义模板完全依赖 JS）

## 结论

### 当前状态评估

✅ **Koidice 核心功能完整**
- 所有基础掷骰功能工作正常
- COC/DND 规则完整实现
- 标准角色卡管理可用

❌ **高级扩展功能缺失**
- 无 JavaScript 表达式支持
- 无自定义模板支持  
- 无事件触发器系统

### 建议

**短期** (当前): 
- 保持现状，满足 95% 用户需求
- 在文档中明确说明功能差异
- 提供简化的替代方案

**中期** (如有需求):
- 考虑方案 3（TypeScript 替代）
- 设计 Koishi 风格的模板系统
- 提供迁移指南

**长期** (如必要):
- 评估方案 1 或 2
- 根据用户反馈决定
- 考虑性能和安全性影响

## 用户指南

### 如何在 Koidice 中实现类似功能

虽然 Koidice 不支持 JavaScript，但可以通过以下方式实现类似功能：

#### 1. 动态属性计算

**Dice! 方式** (JavaScript):
```xml
<Attr text="javascript">
  return this.STR + this.CON * 2;
</Attr>
```

**Koidice 替代方案** (命令):
```
.pc.set 角色名 HP [手动计算的值]
```

#### 2. 自定义模板

**Dice! 方式** (XML + JS):
使用自定义 XML 模板

**Koidice 替代方案** (TypeScript 插件):
创建 Koishi 插件扩展角色卡功能

#### 3. 事件触发

**Dice! 方式** (JS 触发器):
```xml
<Trigger time="after_update" name="update_hp">
  this.set("HP", this.get("STR") * 10);
</Trigger>
```

**Koidice 替代方案** (命令组合):
使用多个命令手动更新

## 相关资源

- [Dice! 源码](https://github.com/Dice-Developer-Team/Dice)
- [QuickJS 官网](https://bellard.org/quickjs/)
- [Koidice 项目结构](./PROJECT_STRUCTURE.md)
- [Koidice 完成报告](./REPORT.md)

## 更新日志

- **2025-11-04**: 初始版本，完整评估 QuickJS 实现状态
