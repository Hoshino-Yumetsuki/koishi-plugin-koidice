# Dice WASM 构建脚本
# 使用 Emscripten 编译 C++ 代码为 WASM

param(
    [string]$BuildType = "Release",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# 项目路径
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WasmDir = Join-Path $ProjectRoot "wasm"
$BuildDir = Join-Path $WasmDir "build"
$OutputDir = Join-Path $ProjectRoot "lib"

Write-Host "=== Dice WASM Build ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "WASM dir: $WasmDir"
Write-Host "Build dir: $BuildDir"
Write-Host "Output dir: $OutputDir"
Write-Host "Build type: $BuildType"
Write-Host ""

# 显示 Emscripten 版本
$EmccVersion = emcc --version | Select-Object -First 1
Write-Host "Emscripten version: $EmccVersion" -ForegroundColor Green
Write-Host ""

# 清理构建目录
if ($Clean -and (Test-Path $BuildDir)) {
    Write-Host "Cleaning build directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $BuildDir
}

# 创建构建目录
if (-not (Test-Path $BuildDir)) {
    Write-Host "Creating build directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
}

# 创建输出目录
if (-not (Test-Path $OutputDir)) {
    Write-Host "Creating output directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# 进入构建目录
Push-Location $BuildDir

try {
    # 配置 CMake
    Write-Host "Configuring CMake..." -ForegroundColor Cyan
    emcmake cmake .. -DCMAKE_BUILD_TYPE=$BuildType

    if ($LASTEXITCODE -ne 0) {
        throw "CMake configuration failed"
    }

    # 编译
    Write-Host ""
    Write-Host "Starting compilation..." -ForegroundColor Cyan
    cmake --build . --config $BuildType

    if ($LASTEXITCODE -ne 0) {
        throw "Compilation failed"
    }

    # 复制产物到输出目录
    Write-Host ""
    Write-Host "Copying artifacts to output directory..." -ForegroundColor Cyan

    $WasmFile = Join-Path $BuildDir "dice.wasm"
    $JsFile = Join-Path $BuildDir "dice.js"

    if (Test-Path $WasmFile) {
        Copy-Item $WasmFile $OutputDir -Force
        Write-Host "  ✓ dice.wasm" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ dice.wasm not found" -ForegroundColor Red
    }

    if (Test-Path $JsFile) {
        Copy-Item $JsFile $OutputDir -Force
        Write-Host "  ✓ dice.js" -ForegroundColor Green
    }
    else {
        Write-Host "  ✗ dice.js not found" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== Build completed! ===" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "=== Build failed! ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
