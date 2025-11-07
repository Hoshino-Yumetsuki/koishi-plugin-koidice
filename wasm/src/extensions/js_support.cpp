#include "js_support.h"
#include "extension_manager.h"
#include "../core/roll_handler.h"
#include "../core/check_handler.h"
#include "../features/rule.h"
#include <quickjs.h>
#include <stdexcept>
#include <cstring>
#include <emscripten/val.h>

namespace koidice {
namespace extensions {

// ============ QuickJS辅助函数 ============

static std::string js_to_string(JSContext* ctx, JSValueConst val) {
    const char* str = JS_ToCString(ctx, val);
    if (!str) return "";
    std::string result(str);
    JS_FreeCString(ctx, str);
    return result;
}

static JSValue js_from_string(JSContext* ctx, const std::string& str) {
    return JS_NewString(ctx, str.c_str());
}

// ============ QuickJS API 函数 ============

// dice.roll(expression[, defaultDice])
static JSValue js_dice_roll(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "Expected at least 1 argument");
    }

    std::string expr = js_to_string(ctx, argv[0]);
    int defaultDice = 100;
    if (argc >= 2) {
        JS_ToInt32(ctx, &defaultDice, argv[1]);
    }

    auto result = koidice::RollHandler::rollOnce(expr, defaultDice);

    // 返回对象
    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "total", JS_NewInt32(ctx, result.total));
    JS_SetPropertyStr(ctx, obj, "detail", js_from_string(ctx, result.detail));
    JS_SetPropertyStr(ctx, obj, "errorCode", JS_NewInt32(ctx, result.errorCode));
    JS_SetPropertyStr(ctx, obj, "errorMsg", js_from_string(ctx, result.errorMsg));

    return obj;
}

// dice.cocCheck(skillValue[, bonusDice])
static JSValue js_dice_cocCheck(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "Expected at least 1 argument");
    }

    int skillValue = 0, bonusDice = 0;
    JS_ToInt32(ctx, &skillValue, argv[0]);
    if (argc >= 2) {
        JS_ToInt32(ctx, &bonusDice, argv[1]);
    }

    // 调用 CheckHandler::cocCheck，返回 emscripten::val
    emscripten::val jsResult = koidice::CheckHandler::cocCheck(skillValue, bonusDice);

    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "rollValue", JS_NewInt32(ctx, jsResult["rollValue"].as<int>()));
    JS_SetPropertyStr(ctx, obj, "skillValue", JS_NewInt32(ctx, jsResult["skillValue"].as<int>()));
    JS_SetPropertyStr(ctx, obj, "successLevel", JS_NewInt32(ctx, jsResult["successLevel"].as<int>()));
    JS_SetPropertyStr(ctx, obj, "description", js_from_string(ctx, jsResult["description"].as<std::string>()));

    return obj;
}

// dice.log(message)
static JSValue js_dice_log(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_UNDEFINED;
    }

    std::string msg = js_to_string(ctx, argv[0]);
    printf("[JS Extension] %s\n", msg.c_str());

    return JS_UNDEFINED;
}

// dice.queryRule(query)
static JSValue js_dice_queryRule(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_UNDEFINED;
    }

    std::string query = js_to_string(ctx, argv[0]);
    std::string result = koidice::queryRule(query);

    // 返回结果对象
    JSValue obj = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, obj, "success", JS_NewBool(ctx, !result.empty()));
    JS_SetPropertyStr(ctx, obj, "content", js_from_string(ctx, result));
    JS_SetPropertyStr(ctx, obj, "error", js_from_string(ctx, result.empty() ? "Not found" : ""));

    return obj;
}

// dice.getUserData(uid, key)
static JSValue js_dice_getUserData(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 2) {
        return JS_UNDEFINED;
    }

    std::string uid = js_to_string(ctx, argv[0]);
    std::string key = js_to_string(ctx, argv[1]);

    std::string value = ExtensionManager::getInstance().callUserDataGet(uid, key);
    return js_from_string(ctx, value);
}

// dice.setUserData(uid, key, value)
static JSValue js_dice_setUserData(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 3) {
        return JS_UNDEFINED;
    }

    std::string uid = js_to_string(ctx, argv[0]);
    std::string key = js_to_string(ctx, argv[1]);
    std::string value = js_to_string(ctx, argv[2]);

    ExtensionManager::getInstance().callUserDataSet(uid, key, value);
    return JS_UNDEFINED;
}

// dice.getGroupData(gid, key)
static JSValue js_dice_getGroupData(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 2) {
        return JS_UNDEFINED;
    }

    std::string gid = js_to_string(ctx, argv[0]);
    std::string key = js_to_string(ctx, argv[1]);

    std::string value = ExtensionManager::getInstance().callGroupDataGet(gid, key);
    return js_from_string(ctx, value);
}

// dice.setGroupData(gid, key, value)
static JSValue js_dice_setGroupData(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 3) {
        return JS_UNDEFINED;
    }

    std::string gid = js_to_string(ctx, argv[0]);
    std::string key = js_to_string(ctx, argv[1]);
    std::string value = js_to_string(ctx, argv[2]);

    ExtensionManager::getInstance().callGroupDataSet(gid, key, value);
    return JS_UNDEFINED;
}

// loadJS(scriptName)
static JSValue js_loadJS(JSContext* ctx, JSValueConst this_val, int argc, JSValueConst* argv) {
    if (argc < 1) {
        return JS_ThrowTypeError(ctx, "Expected 1 argument");
    }

    std::string scriptName = js_to_string(ctx, argv[0]);

    // 从全局对象获取脚本注册表
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue registry = JS_GetPropertyStr(ctx, global, "__KOIDICE_SCRIPTS__");
    JS_FreeValue(ctx, global);

    if (JS_IsUndefined(registry)) {
        JS_FreeValue(ctx, registry);
        return JS_ThrowReferenceError(ctx, "Script registry not found");
    }

    JSValue func = JS_GetPropertyStr(ctx, registry, scriptName.c_str());
    JS_FreeValue(ctx, registry);

    if (JS_IsUndefined(func)) {
        JS_FreeValue(ctx, func);
        return JS_ThrowReferenceError(ctx, "Script '%s' not found", scriptName.c_str());
    }

    return func;
}

// ============ JSExtension 类实现 ============

JSExtension::JSExtension() : rt(nullptr), ctx(nullptr), lastError("") {
    initJSRuntime();
}

JSExtension::~JSExtension() {
    cleanup();
}

void JSExtension::initJSRuntime() {
    rt = JS_NewRuntime();
    if (!rt) {
        throw std::runtime_error("Failed to create QuickJS runtime");
    }

    ctx = JS_NewContext(rt);
    if (!ctx) {
        JS_FreeRuntime(rt);
        throw std::runtime_error("Failed to create QuickJS context");
    }

    // 注册 dice API
    registerDiceAPI();

    // 创建脚本注册表
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue registry = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, global, "__KOIDICE_SCRIPTS__", registry);
    JS_FreeValue(ctx, global);
}

void JSExtension::registerDiceAPI() {
    JSValue global = JS_GetGlobalObject(ctx);

    // 创建 dice 对象
    JSValue dice = JS_NewObject(ctx);

    // 注册函数
    JS_SetPropertyStr(ctx, dice, "roll",
        JS_NewCFunction(ctx, js_dice_roll, "roll", 2));
    JS_SetPropertyStr(ctx, dice, "cocCheck",
        JS_NewCFunction(ctx, js_dice_cocCheck, "cocCheck", 2));
    JS_SetPropertyStr(ctx, dice, "log",
        JS_NewCFunction(ctx, js_dice_log, "log", 1));
    JS_SetPropertyStr(ctx, dice, "queryRule",
        JS_NewCFunction(ctx, js_dice_queryRule, "queryRule", 1));

    // 注册数据存储 API
    JS_SetPropertyStr(ctx, dice, "getUserData",
        JS_NewCFunction(ctx, js_dice_getUserData, "getUserData", 2));
    JS_SetPropertyStr(ctx, dice, "setUserData",
        JS_NewCFunction(ctx, js_dice_setUserData, "setUserData", 3));
    JS_SetPropertyStr(ctx, dice, "getGroupData",
        JS_NewCFunction(ctx, js_dice_getGroupData, "getGroupData", 2));
    JS_SetPropertyStr(ctx, dice, "setGroupData",
        JS_NewCFunction(ctx, js_dice_setGroupData, "setGroupData", 3));

    JS_SetPropertyStr(ctx, global, "dice", dice);

    // 注册 loadJS
    JS_SetPropertyStr(ctx, global, "loadJS",
        JS_NewCFunction(ctx, js_loadJS, "loadJS", 1));

    JS_FreeValue(ctx, global);
}

bool JSExtension::loadScript(const std::string& name, const std::string& code) {
    if (scripts.find(name) != scripts.end()) {
        lastError = "Script '" + name + "' already loaded";
        return false;
    }

    // 编译并执行脚本
    JSValue result = JS_Eval(ctx, code.c_str(), code.length(), name.c_str(),
                             JS_EVAL_TYPE_GLOBAL);

    if (JS_IsException(result)) {
        lastError = getException();
        return false;
    }

    // 检查返回值是否为函数
    if (!JS_IsFunction(ctx, result)) {
        lastError = "Script must evaluate to a function";
        JS_FreeValue(ctx, result);
        return false;
    }

    // 保存到脚本注册表
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue registry = JS_GetPropertyStr(ctx, global, "__KOIDICE_SCRIPTS__");
    JS_SetPropertyStr(ctx, registry, name.c_str(), result);
    JS_FreeValue(ctx, registry);
    JS_FreeValue(ctx, global);

    Script script;
    script.name = name;
    script.code = code;
    script.function = result; // 注意：这里只是保存引用，实际函数在 registry 中
    scripts[name] = script;

    return true;
}

std::string JSExtension::execute(const std::string& name, const AttrObject& context) {
    auto it = scripts.find(name);
    if (it == scripts.end()) {
        return "[Error] Script '" + name + "' not found";
    }

    // 获取函数
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue registry = JS_GetPropertyStr(ctx, global, "__KOIDICE_SCRIPTS__");
    JSValue func = JS_GetPropertyStr(ctx, registry, name.c_str());
    JS_FreeValue(ctx, registry);

    if (!JS_IsFunction(ctx, func)) {
        JS_FreeValue(ctx, func);
        JS_FreeValue(ctx, global);
        return "[Error] Script function not found";
    }

    // 转换 context 为 JS 对象
    JSValue contextObj = pushAttrObject(context);

    // 调用函数
    JSValue result = JS_Call(ctx, func, global, 1, &contextObj);
    JS_FreeValue(ctx, func);
    JS_FreeValue(ctx, contextObj);
    JS_FreeValue(ctx, global);

    if (JS_IsException(result)) {
        lastError = getException();
        return "[Error] " + lastError;
    }

    // 获取返回值
    std::string resultStr = getResultString(result);
    JS_FreeValue(ctx, result);

    return resultStr;
}

void JSExtension::unload(const std::string& name) {
    auto it = scripts.find(name);
    if (it != scripts.end()) {
        // 从注册表中删除
        JSValue global = JS_GetGlobalObject(ctx);
        JSValue registry = JS_GetPropertyStr(ctx, global, "__KOIDICE_SCRIPTS__");
        JS_SetPropertyStr(ctx, registry, name.c_str(), JS_UNDEFINED);
        JS_FreeValue(ctx, registry);
        JS_FreeValue(ctx, global);

        scripts.erase(it);
    }
}

bool JSExtension::has(const std::string& name) const {
    return scripts.find(name) != scripts.end();
}

void JSExtension::cleanup() {
    scripts.clear();
    if (ctx) {
        JS_FreeContext(ctx);
        ctx = nullptr;
    }
    if (rt) {
        JS_FreeRuntime(rt);
        rt = nullptr;
    }
}

std::string JSExtension::getLastError() const {
    return lastError;
}

JSValue JSExtension::pushAttrObject(const AttrObject& obj) {
    if (!obj) {
        return JS_NULL;
    }

    JSValue jsObj = JS_NewObject(ctx);

    // 转换字典项 - 使用公共接口
    auto& dict = obj->as_dict();
    for (const auto& pair : dict) {
            JSValue val = JS_UNDEFINED;
            const AttrVar& attr = pair.second;

            switch (attr.type) {
                case AttrVar::Type::Boolean:
                    val = JS_NewBool(ctx, attr.bit);
                    break;
                case AttrVar::Type::Integer:
                    val = JS_NewInt32(ctx, attr.attr);
                    break;
                case AttrVar::Type::Number:
                    val = JS_NewFloat64(ctx, attr.number);
                    break;
                case AttrVar::Type::U8String:
                case AttrVar::Type::GBString:
                    val = js_from_string(ctx, attr.text);
                    break;
                case AttrVar::Type::Table:
                    val = pushAttrObject(attr.table);
                    break;
                default:
                    val = JS_NULL;
                    break;
            }

            JS_SetPropertyStr(ctx, jsObj, pair.first.c_str(), val);
    }

    // 转换数组项 - 使用公共接口
    auto listPtr = obj->to_list();
    if (listPtr) {
        int idx = 0;
        for (const auto& attr : *listPtr) {
            JSValue val = JS_UNDEFINED;

            switch (attr.type) {
                case AttrVar::Type::Boolean:
                    val = JS_NewBool(ctx, attr.bit);
                    break;
                case AttrVar::Type::Integer:
                    val = JS_NewInt32(ctx, attr.attr);
                    break;
                case AttrVar::Type::Number:
                    val = JS_NewFloat64(ctx, attr.number);
                    break;
                case AttrVar::Type::U8String:
                case AttrVar::Type::GBString:
                    val = js_from_string(ctx, attr.text);
                    break;
                case AttrVar::Type::Table:
                    val = pushAttrObject(attr.table);
                    break;
                default:
                    val = JS_NULL;
                    break;
            }

            JS_SetPropertyUint32(ctx, jsObj, idx++, val);
        }
    }

    return jsObj;
}

std::string JSExtension::getResultString(JSValue val) {
    if (JS_IsString(val)) {
        return js_to_string(ctx, val);
    } else if (JS_IsBool(val)) {
        return JS_ToBool(ctx, val) ? "true" : "false";
    } else if (JS_IsNumber(val)) {
        double num;
        JS_ToFloat64(ctx, &num, val);
        return std::to_string(num);
    } else if (JS_IsNull(val) || JS_IsUndefined(val)) {
        return "";
    } else {
        return "[Unsupported return type]";
    }
}

std::string JSExtension::getException() {
    JSValue exception = JS_GetException(ctx);
    std::string error = js_to_string(ctx, exception);
    JS_FreeValue(ctx, exception);
    return error;
}

} // namespace extensions
} // namespace koidice
