#pragma once
#ifndef JS_SUPPORT_H
#define JS_SUPPORT_H

#include <string>
#include <memory>
#include <map>
#include "../../../Dice/Dice/DiceAttrVar.h"

// QuickJS 前向声明
typedef struct JSRuntime JSRuntime;
typedef struct JSContext JSContext;
typedef uint64_t JSValue;

namespace koidice {
namespace extensions {

// JavaScript 扩展支持
class JSExtension {
public:
    JSExtension();
    ~JSExtension();

    // 加载脚本
    bool loadScript(const std::string& name, const std::string& code);

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
        JSValue function;  // JS 函数对象
    };

    JSRuntime* rt;
    JSContext* ctx;
    std::map<std::string, Script> scripts;
    std::string lastError;

    // 初始化 JS 运行时
    void initJSRuntime();

    // 注册 dice API
    void registerDiceAPI();

    // 辅助函数：将 AttrObject 转换为 JS object
    JSValue pushAttrObject(const AttrObject& obj);

    // 辅助函数：从 JS 值获取字符串结果
    std::string getResultString(JSValue val);

    // 辅助函数：获取异常信息
    std::string getException();
};

} // namespace extensions
} // namespace koidice

#endif // JS_SUPPORT_H
