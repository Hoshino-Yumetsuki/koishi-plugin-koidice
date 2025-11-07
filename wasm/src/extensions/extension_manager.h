#pragma once
#ifndef EXTENSION_MANAGER_H
#define EXTENSION_MANAGER_H

#include <string>
#include <memory>
#include <map>
#include <functional>
#include "../../../Dice/Dice/DiceAttrVar.h"

namespace koidice {
namespace extensions {

// 扩展类型
enum class ExtensionType {
    Lua,
    JavaScript
};

// 扩展回调函数类型
// 参数: msg context (包含 uid, gid, suffix, char, game 等)
// 返回: 回复字符串
using ExtensionCallback = std::function<std::string(const AttrObject&)>;

// 数据存储回调函数类型
// 用于从 C++ 回调到 TypeScript 层进行数据库操作
using DataGetCallback = std::function<std::string(const std::string& id, const std::string& key)>;
using DataSetCallback = std::function<void(const std::string& id, const std::string& key, const std::string& value)>;

// 扩展信息
struct ExtensionInfo {
    std::string name;
    std::string version;
    std::string author;
    ExtensionType type;
    bool loaded;

    ExtensionInfo() : type(ExtensionType::Lua), loaded(false) {}
};

// 扩展管理器
class ExtensionManager {
public:
    static ExtensionManager& getInstance();

    // 加载 Lua 扩展
    // name: 扩展名称（如 "Maid.sn"）
    // code: Lua 脚本代码（包装后的）
    // originalCode: 原始 Lua 脚本代码（用于 loadLua）
    // returns: 是否成功
    bool loadLuaExtension(const std::string& name, const std::string& code, const std::string& originalCode = "");

    // 加载 JavaScript 扩展
    // name: 扩展名称（如 "Maid.team"）
    // code: JS 脚本代码
    // returns: 是否成功
    bool loadJSExtension(const std::string& name, const std::string& code);

    // 调用扩展
    // name: 扩展名称
    // context: 消息上下文（包含 msg.suffix, msg.uid, msg.gid 等）
    // returns: 扩展返回的字符串
    std::string callExtension(const std::string& name, const AttrObject& context);

    // 卸载扩展
    bool unloadExtension(const std::string& name);

    // 列出所有已加载的扩展
    std::string listExtensions();

    // 检查扩展是否存在
    bool hasExtension(const std::string& name);

    // 获取扩展信息
    ExtensionInfo getExtensionInfo(const std::string& name);

    // ============ 数据存储回调 ============

    // 设置用户数据获取回调
    void setUserDataGetCallback(DataGetCallback callback);

    // 设置用户数据设置回调
    void setUserDataSetCallback(DataSetCallback callback);

    // 设置群组数据获取回调
    void setGroupDataGetCallback(DataGetCallback callback);

    // 设置群组数据设置回调
    void setGroupDataSetCallback(DataSetCallback callback);

    // 调用用户数据获取回调
    std::string callUserDataGet(const std::string& uid, const std::string& key);

    // 调用用户数据设置回调
    void callUserDataSet(const std::string& uid, const std::string& key, const std::string& value);

    // 调用群组数据获取回调
    std::string callGroupDataGet(const std::string& gid, const std::string& key);

    // 调用群组数据设置回调
    void callGroupDataSet(const std::string& gid, const std::string& key, const std::string& value);

    // 清理所有扩展
    void cleanup();

    ~ExtensionManager();

private:
    ExtensionManager();
    ExtensionManager(const ExtensionManager&) = delete;
    ExtensionManager& operator=(const ExtensionManager&) = delete;

    class Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace extensions
} // namespace koidice

#endif // EXTENSION_MANAGER_H
