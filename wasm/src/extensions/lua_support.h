#pragma once
#ifndef LUA_SUPPORT_H
#define LUA_SUPPORT_H

#include <string>
#include <memory>
#include <map>
#include "../../../Dice/Dice/DiceAttrVar.h"

// Lua 前向声明
struct lua_State;

namespace koidice {
namespace extensions {

// Lua 扩展支持
class LuaExtension {
public:
    LuaExtension();
    ~LuaExtension();

    // 加载脚本
    bool loadScript(const std::string& name, const std::string& code, const std::string& originalCode = "");

    // 执行脚本并返回结果
    std::string execute(const std::string& name, const AttrObject& context);

    // 卸载脚本
    void unload(const std::string& name);

    // 检查脚本是否已加载
    bool has(const std::string& name) const;

    // 清理所有脚本
    void cleanup();

    // 获取最后一次错误
    std::string getLastError() const;

private:
    struct Script {
        std::string name;
        std::string code;
        int functionRef;  // Lua 注册表中的函数引用
    };

    lua_State* L;
    std::map<std::string, Script> scripts;
    std::string lastError;

    // 初始化 Lua 状态
    void initLuaState();

    // 注册 dice API
    void registerDiceAPI();

    // 辅助函数：将 AttrObject 转换为 Lua table
    void pushAttrObject(const AttrObject& obj);

    // 辅助函数：从 Lua 栈顶获取字符串结果
    std::string getResultString();
};

} // namespace extensions
} // namespace koidice

#endif // LUA_SUPPORT_H
