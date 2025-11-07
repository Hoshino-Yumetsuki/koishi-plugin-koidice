#include "extension_manager.h"
#include "lua_support.h"
#include "js_support.h"
#include <sstream>

namespace koidice {
namespace extensions {

// Pimpl 实现
class ExtensionManager::Impl {
public:
    std::unique_ptr<LuaExtension> luaExt;
    std::unique_ptr<JSExtension> jsExt;
    std::map<std::string, ExtensionInfo> extensions;

    // 数据存储回调
    DataGetCallback userDataGetCallback;
    DataSetCallback userDataSetCallback;
    DataGetCallback groupDataGetCallback;
    DataSetCallback groupDataSetCallback;

    Impl() {
        luaExt = std::make_unique<LuaExtension>();
        jsExt = std::make_unique<JSExtension>();
    }
};

ExtensionManager::ExtensionManager() : pImpl(std::make_unique<Impl>()) {}

ExtensionManager::~ExtensionManager() {
    cleanup();
}

ExtensionManager& ExtensionManager::getInstance() {
    static ExtensionManager instance;
    return instance;
}

bool ExtensionManager::loadLuaExtension(const std::string& name, const std::string& code, const std::string& originalCode) {
    if (!pImpl->luaExt->loadScript(name, code, originalCode)) {
        return false;
    }

    ExtensionInfo info;
    info.name = name;
    info.type = ExtensionType::Lua;
    info.loaded = true;
    pImpl->extensions[name] = info;

    return true;
}

bool ExtensionManager::loadJSExtension(const std::string& name, const std::string& code) {
    if (!pImpl->jsExt->loadScript(name, code)) {
        return false;
    }

    ExtensionInfo info;
    info.name = name;
    info.type = ExtensionType::JavaScript;
    info.loaded = true;
    pImpl->extensions[name] = info;

    return true;
}

std::string ExtensionManager::callExtension(const std::string& name, const AttrObject& context) {
    auto it = pImpl->extensions.find(name);
    if (it == pImpl->extensions.end()) {
        return "[Error] Extension '" + name + "' not found";
    }

    const ExtensionInfo& info = it->second;

    try {
        if (info.type == ExtensionType::Lua) {
            return pImpl->luaExt->execute(name, context);
        } else {
            return pImpl->jsExt->execute(name, context);
        }
    } catch (const std::exception& e) {
        return std::string("[Error] ") + e.what();
    }
}

bool ExtensionManager::unloadExtension(const std::string& name) {
    auto it = pImpl->extensions.find(name);
    if (it == pImpl->extensions.end()) {
        return false;
    }

    const ExtensionInfo& info = it->second;

    if (info.type == ExtensionType::Lua) {
        pImpl->luaExt->unload(name);
    } else {
        pImpl->jsExt->unload(name);
    }

    pImpl->extensions.erase(it);
    return true;
}

std::string ExtensionManager::listExtensions() {
    if (pImpl->extensions.empty()) {
        return "No extensions loaded.";
    }

    std::ostringstream oss;
    oss << "Loaded extensions (" << pImpl->extensions.size() << "):\n";

    for (const auto& pair : pImpl->extensions) {
        const ExtensionInfo& info = pair.second;
        oss << "  - " << info.name;
        oss << " [" << (info.type == ExtensionType::Lua ? "Lua" : "JS") << "]";
        if (!info.version.empty()) {
            oss << " v" << info.version;
        }
        oss << "\n";
    }

    return oss.str();
}

bool ExtensionManager::hasExtension(const std::string& name) {
    return pImpl->extensions.find(name) != pImpl->extensions.end();
}

ExtensionInfo ExtensionManager::getExtensionInfo(const std::string& name) {
    auto it = pImpl->extensions.find(name);
    if (it != pImpl->extensions.end()) {
        return it->second;
    }
    return ExtensionInfo();
}

// ============ 数据存储回调实现 ============

void ExtensionManager::setUserDataGetCallback(DataGetCallback callback) {
    pImpl->userDataGetCallback = callback;
}

void ExtensionManager::setUserDataSetCallback(DataSetCallback callback) {
    pImpl->userDataSetCallback = callback;
}

void ExtensionManager::setGroupDataGetCallback(DataGetCallback callback) {
    pImpl->groupDataGetCallback = callback;
}

void ExtensionManager::setGroupDataSetCallback(DataSetCallback callback) {
    pImpl->groupDataSetCallback = callback;
}

std::string ExtensionManager::callUserDataGet(const std::string& uid, const std::string& key) {
    if (pImpl->userDataGetCallback) {
        return pImpl->userDataGetCallback(uid, key);
    }
    return "";  // 如果回调未设置，返回空字符串
}

void ExtensionManager::callUserDataSet(const std::string& uid, const std::string& key, const std::string& value) {
    if (pImpl->userDataSetCallback) {
        pImpl->userDataSetCallback(uid, key, value);
    }
}

std::string ExtensionManager::callGroupDataGet(const std::string& gid, const std::string& key) {
    if (pImpl->groupDataGetCallback) {
        return pImpl->groupDataGetCallback(gid, key);
    }
    return "";  // 如果回调未设置，返回空字符串
}

void ExtensionManager::callGroupDataSet(const std::string& gid, const std::string& key, const std::string& value) {
    if (pImpl->groupDataSetCallback) {
        pImpl->groupDataSetCallback(gid, key, value);
    }
}

void ExtensionManager::cleanup() {
    if (pImpl) {
        pImpl->luaExt->cleanup();
        pImpl->jsExt->cleanup();
        pImpl->extensions.clear();
    }
}

} // namespace extensions
} // namespace koidice
