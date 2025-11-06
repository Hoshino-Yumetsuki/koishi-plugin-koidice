#include "check_handler.h"
#include "utils.h"
#include "../../../Dice/Dice/RD.h"
#include <algorithm>

namespace koidice {

emscripten::val CheckHandler::check(
    const std::string& skillName,
    int skillValue,
    int rounds,
    int bonusDice,
    Difficulty difficulty,
    bool autoSuccess,
    int rule
) {
    emscripten::val result = emscripten::val::object();
    
    try {
        // 验证技能值
        if (skillValue < 0 || skillValue > 1000) {
            result.set("success", false);
            result.set("errorMsg", "技能值必须在0-1000之间");
            return result;
        }
        
        // 应用难度修正
        int finalSkillValue = skillValue / static_cast<int>(difficulty);
        
        // 执行多轮检定
        emscripten::val results = emscripten::val::array();
        
        for (int i = 0; i < rounds; i++) {
            CheckRoundResult roundResult = checkOnce(finalSkillValue, bonusDice, autoSuccess, rule);
            
            emscripten::val jsRound = emscripten::val::object();
            jsRound.set("rollValue", roundResult.rollValue);
            jsRound.set("skillValue", roundResult.skillValue);
            jsRound.set("successLevel", static_cast<int>(roundResult.successLevel));
            jsRound.set("description", roundResult.description);
            
            results.call<void>("push", jsRound);
        }
        
        result.set("success", true);
        result.set("skillName", skillName);
        result.set("originalSkillValue", skillValue);
        result.set("finalSkillValue", finalSkillValue);
        result.set("difficulty", static_cast<int>(difficulty));
        result.set("rounds", rounds);
        result.set("results", results);
        
    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("errorMsg", "未知异常");
    }
    
    return result;
}

emscripten::val CheckHandler::cocCheck(int skillValue, int bonusDice) {
    emscripten::val result = emscripten::val::object();
    
    try {
        if (skillValue < 0 || skillValue > 100) {
            result.set("success", false);
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "技能值必须在0-100之间");
            return result;
        }
        
        // 使用RD类的B/P骰子功能
        std::string expression;
        if (bonusDice > 0) {
            expression = std::to_string(bonusDice) + "B";  // B = 奖励骰(Bonus)
        } else if (bonusDice < 0) {
            expression = std::to_string(-bonusDice) + "P"; // P = 惩罚骰(Penalty)
        } else {
            expression = "1D100";
        }
        
        RD rd(expression, 100);
        int_errno err = rd.Roll();
        
        if (err != 0) {
            result.set("success", false);
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "掷骰失败");
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }
        
        int rollValue = rd.intTotal;
        int successLevel = 1; // 默认失败
        std::string description = "失败";
        
        // 判定成功等级
        if (rollValue <= 5 || (rollValue <= skillValue && rollValue <= 5)) {
            successLevel = 5; // 大成功
            description = "大成功";
        } else if (rollValue >= 96) {
            successLevel = 0; // 大失败
            description = "大失败";
        } else if (rollValue <= skillValue / 5) {
            successLevel = 4; // 极难成功
            description = "极难成功";
        } else if (rollValue <= skillValue / 2) {
            successLevel = 3; // 困难成功
            description = "困难成功";
        } else if (rollValue <= skillValue) {
            successLevel = 2; // 成功
            description = "成功";
        }
        
        result.set("success", true);
        result.set("rollValue", rollValue);
        result.set("skillValue", skillValue);
        result.set("successLevel", successLevel);
        result.set("description", description);
        
    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "异常");
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "未知异常");
        result.set("errorMsg", "未知异常");
    }
    
    return result;
}

CheckRoundResult CheckHandler::checkOnce(
    int skillValue,
    int bonusDice,
    bool autoSuccess,
    int rule
) {
    CheckRoundResult result;
    result.skillValue = skillValue;
    
    // 使用RD类的B/P骰子功能
    std::string expression;
    if (bonusDice > 0) {
        expression = std::to_string(bonusDice) + "B";
    } else if (bonusDice < 0) {
        expression = std::to_string(-bonusDice) + "P";
    } else {
        expression = "1D100";
    }
    
    RD rd(expression, 100);
    int_errno err = rd.Roll();
    
    if (err != 0) {
        result.rollValue = 0;
        result.successLevel = SuccessLevel::Failure;
        result.description = "掷骰失败: " + getErrorMessage(err);
        return result;
    }
    
    result.rollValue = rd.intTotal;
    
    // 使用Dice的RollSuccessLevel函数判定
    SuccessLevel level = autoSuccess && result.rollValue <= skillValue 
        ? SuccessLevel::RegularSuccess 
        : static_cast<SuccessLevel>(RollSuccessLevel(result.rollValue, skillValue, rule));
    
    result.successLevel = level;
    result.description = getSuccessLevelDesc(static_cast<int>(level), autoSuccess);
    
    return result;
}

} // namespace koidice
