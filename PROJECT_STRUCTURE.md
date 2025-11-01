# 目录树

```
koidice/
├── Dice/                          # Dice! C++ 核心（Git 子模块）
│   ├── Dice/                      # 核心源代码
│   │   ├── RD.cpp/h              # 掷骰引擎
│   │   ├── RandomGenerator.cpp/h  # 随机数生成器
│   │   ├── DiceSession.cpp/h     # 会话管理
│   │   ├── CardDeck.cpp/h        # 牌堆系统
│   │   ├── CharacterCard.cpp/h   # 角色卡系统
│   │   ├── GetRule.cpp/h         # 规则系统
│   │   └── ...                   # 其他核心文件
│   ├── QQAPI/                    # QQ API（未使用）
│   ├── quickjspp/                # QuickJS（未使用）
│   └── CMakeLists.txt            # 原始 CMake 配置
│
├── wasm/                          # WASM 构建配置
│   ├── CMakeLists.txt            # Emscripten CMake 配置
│   ├── include/                  # WASM 头文件
│   │   └── dice_wasm_types.h    # WASM 类型定义
│   ├── src/                      # WASM 接口实现
│   │   └── dice_wasm_interface.cpp  # C++ 到 JS 的导出接口
│   └── build/                    # 构建输出（gitignore）
│       ├── dice.wasm            # WASM 二进制
│       └── dice.js              # Emscripten 胶水代码
│
├── src/                          # TypeScript 源代码
│   ├── index.ts                 # 插件主入口
│   ├── dice-config.ts           # 配置定义
│   └── wasm/                    # WASM 相关
│       ├── types.ts             # TypeScript 类型定义
│       ├── loader.ts            # WASM 模块加载器
│       ├── adapter.ts           # WASM 适配器
│       └── index.ts             # WASM 模块导出
│
├── scripts/                      # 构建脚本
│   ├── build-wasm.ps1           # Windows WASM 构建脚本
│   └── build-wasm.sh            # Linux/Mac WASM 构建脚本
│
├── lib/                          # 构建产物（gitignore）
│   ├── dice.wasm                # WASM 二进制
│   ├── dice.js                  # WASM 胶水代码
│   ├── index.mjs                # ES Module
│   ├── index.cjs                # CommonJS
│   └── index.d.ts               # TypeScript 类型定义
│
├── node_modules/                 # npm 依赖（gitignore）
│
├── .gitignore                    # Git 忽略配置
├── .gitmodules                   # Git 子模块配置
├── package.json                  # npm 包配置
├── tsconfig.json                 # TypeScript 配置
├── rolldown.config.js            # Rolldown 构建配置
├── biome.json                    # Biome 代码格式化配置
│
├── README.md                     # 项目说明
├── WASM_BUILD.md                 # WASM 构建详细指南
├── QUICKSTART.md                 # 快速开始指南
└── PROJECT_STRUCTURE.md          # 本文档
```

# 数据流

## 用户命令 → 响应流程

```
用户输入 ".r 1d100"
    ↓
Koishi 解析命令
    ↓
src/index.ts 的命令处理器
    ↓
src/wasm/adapter.ts 的 roll() 方法
    ↓
src/wasm/loader.ts 获取 WASM 模块
    ↓
lib/dice.js (Emscripten 胶水代码)
    ↓
lib/dice.wasm (WebAssembly 二进制)
    ↓
wasm/src/dice_wasm_interface.cpp 的 rollDice()
    ↓
Dice/Dice/RD.cpp 的掷骰逻辑
    ↓
返回结果（逐层返回）
    ↓
格式化为消息
    ↓
发送给用户
```

## 构建流程

```
源代码修改
    ↓
┌─────────────────┬─────────────────┐
│   C++ 代码修改   │  TypeScript 修改 │
│                 │                 │
│ yarn build:wasm │  yarn build:ts  │
│       ↓         │       ↓         │
│  emcc 编译      │  rolldown 打包  │
│       ↓         │       ↓         │
│  dice.wasm      │  index.mjs      │
│  dice.js        │  index.cjs      │
│                 │  index.d.ts     │
└─────────────────┴─────────────────┘
            ↓
      lib/ 目录
            ↓
    可以使用的插件
```

# 扩展指南

## 添加新的 C++ 函数

1. **在 `wasm/src/dice_wasm_interface.cpp` 中添加函数**：
```cpp
val myNewFunction(const std::string& param) {
    val result = val::object();
    // 实现逻辑
    return result;
}

EMSCRIPTEN_BINDINGS(dice_module) {
    function("myNewFunction", &myNewFunction);
}
```

2. **在 `src/wasm/types.ts` 中添加类型**：
```typescript
export interface DiceModule {
    myNewFunction(param: string): MyResult
}
```

3. **在 `src/wasm/adapter.ts` 中封装**：
```typescript
myNewFunction(param: string): MyResult {
    const module = this.ensureModule()
    return module.myNewFunction(param)
}
```

4. **在 `src/index.ts` 中使用**：
```typescript
ctx.command('mynew <param:text>')
    .action(async ({ session }, param) => {
        const result = diceAdapter!.myNewFunction(param)
        return formatResult(result)
    })
```

## 添加新的 TypeScript 功能

直接在 `src/index.ts` 中添加命令处理器即可，无需修改 C++ 代码。

# 依赖关系

```
Koishi 插件
    ↓ 依赖
TypeScript 适配器
    ↓ 依赖
WASM 加载器
    ↓ 依赖
WASM 模块 (dice.wasm + dice.js)
    ↓ 依赖
C++ 核心 (Dice!)
```
