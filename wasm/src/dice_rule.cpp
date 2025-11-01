#include "dice_rule.h"
#include "../../Dice/Dice/GetRule.h"
#include "../../Dice/Dice/DiceRule.h"
#include <sstream>

using namespace emscripten;

std::string queryRule(const std::string& query) {
    try {
        std::string rawStr = query;
        std::string result;
        
        if (GetRule::analyze(rawStr, result)) {
            return result;
        }
        
        // 如果本地查询失败，返回错误信息
        return "";
    } catch (...) {
        return "";
    }
}

std::string queryRuleWithSystem(const std::string& system, const std::string& keyword) {
    try {
        std::string result;
        
        if (GetRule::get(system, keyword, result)) {
            return result;
        }
        
        return "";
    } catch (...) {
        return "";
    }
}
