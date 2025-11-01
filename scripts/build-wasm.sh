#!/bin/bash
# Dice WASM 构建脚本 (Linux/Mac)
# 使用 Emscripten 编译 C++ 代码为 WASM

set -e

BUILD_TYPE="${1:-Release}"
CLEAN="${2:-false}"

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WASM_DIR="$PROJECT_ROOT/wasm"
BUILD_DIR="$WASM_DIR/build"
OUTPUT_DIR="$PROJECT_ROOT/lib"

echo "=== Dice WASM Build Script ==="
echo "Project root: $PROJECT_ROOT"
echo "WASM directory: $WASM_DIR"
echo "Build directory: $BUILD_DIR"
echo "Output directory: $OUTPUT_DIR"
echo "Build type: $BUILD_TYPE"
echo ""

# 检查 Emscripten 是否安装
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc command not found"
    echo "Please install and activate Emscripten SDK:"
    echo "  1. Download emsdk: git clone https://github.com/emscripten-core/emsdk.git"
    echo "  2. Install: cd emsdk && ./emsdk install latest"
    echo "  3. Activate: ./emsdk activate latest"
    echo "  4. Set environment: source ./emsdk_env.sh"
    exit 1
fi

# 显示 Emscripten 版本
echo "Emscripten version: $(emcc --version | head -n 1)"
echo ""

# 清理构建目录
if [ "$CLEAN" = "true" ] && [ -d "$BUILD_DIR" ]; then
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
fi

# 创建构建目录
if [ ! -d "$BUILD_DIR" ]; then
    echo "Creating build directory..."
    mkdir -p "$BUILD_DIR"
fi

# 创建输出目录
if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Creating output directory..."
    mkdir -p "$OUTPUT_DIR"
fi

# 进入构建目录
cd "$BUILD_DIR"

# 配置 CMake
echo "Configuring CMake..."
emcmake cmake .. -DCMAKE_BUILD_TYPE="$BUILD_TYPE"

# 编译
echo ""
echo "Starting compilation..."
cmake --build . --config "$BUILD_TYPE"

# 复制产物到输出目录
echo ""
echo "Copying artifacts to output directory..."

if [ -f "dice.wasm" ]; then
    cp dice.wasm "$OUTPUT_DIR/"
    echo "  ✓ dice.wasm"
else
    echo "  ✗ dice.wasm not found"
fi

if [ -f "dice.js" ]; then
    cp dice.js "$OUTPUT_DIR/"
    echo "  ✓ dice.js"
else
    echo "  ✗ dice.js not found"
fi

echo ""
echo "=== Build completed! ==="
