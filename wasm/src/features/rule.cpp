#include "rule.h"
#include "../../../Dice/Dice/GlobalVar.h"
#include <algorithm>

namespace koidice {

std::string queryRule(const std::string& key) {
    try {
        std::string keyLower = key;
        std::transform(keyLower.begin(), keyLower.end(), keyLower.begin(), ::tolower);

        for (const auto& [msgKey, value] : GlobalMsg) {
            std::string msgKeyLower = msgKey;
            std::transform(msgKeyLower.begin(), msgKeyLower.end(), msgKeyLower.begin(), ::tolower);

            if (msgKeyLower == keyLower || msgKeyLower.find(keyLower) != std::string::npos) {
                return value;
            }
        }

        return "未找到规则: " + key;
    } catch (const std::exception& e) {
        return std::string("查询异常: ") + e.what();
    } catch (...) {
        return "未知异常";
    }
}

std::string queryRuleBySystem(const std::string& system, const std::string& key) {
    return queryRule(system + ":" + key);
}

std::vector<std::string> listRuleKeys() {
    std::vector<std::string> keys;

    for (const auto& [key, value] : GlobalMsg) {
        if (key.find("str") == 0) continue;
        keys.push_back(key);
    }

    return keys;
}

std::vector<std::string> listRulesBySystem(const std::string& system) {
    std::vector<std::string> keys;
    std::string sysLower = system;
    std::transform(sysLower.begin(), sysLower.end(), sysLower.begin(), ::tolower);

    for (const auto& [key, value] : GlobalMsg) {
        std::string keyLower = key;
        std::transform(keyLower.begin(), keyLower.end(), keyLower.begin(), ::tolower);

        if (sysLower == "coc" && (keyLower.find("coc") != std::string::npos || 
                                   keyLower.find("检定") != std::string::npos ||
                                   keyLower.find("疯狂") != std::string::npos)) {
            keys.push_back(key);
        } else if (sysLower == "dnd" && keyLower.find("dnd") != std::string::npos) {
            keys.push_back(key);
        }
    }

    return keys;
}

} // namespace koidice
