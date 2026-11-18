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
    int rule,
    emscripten::val suppliedRolls
) {
    emscripten::val result = emscripten::val::object();

    try {
        if (rounds < 1 || rounds > 9 || bonusDice < -9 || bonusDice > 9) {
            result.set("success", false);
            result.set("errorMsg", "检定轮数及奖惩骰数量必须在1-9之间");
            return result;
        }
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
            int suppliedRoll = suppliedRolls.isUndefined() ? 0 : suppliedRolls[i].as<int>();
            CheckRoundResult roundResult = checkOnce(finalSkillValue, bonusDice, autoSuccess, rule, suppliedRoll);

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

        if (bonusDice < -9 || bonusDice > 9) throw std::invalid_argument("奖惩骰数量超过限制");
        const auto roll = checkOnce(skillValue, bonusDice, false, 0, 0);
        result.set("success", roll.rollValue != 0);
        result.set("rollValue", roll.rollValue);
        result.set("skillValue", skillValue);
        result.set("successLevel", static_cast<int>(roll.successLevel));
        result.set("description", roll.description);

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
    int rule,
    int suppliedRoll
) {
    CheckRoundResult result;
    result.skillValue = skillValue;

    // 使用RD类的B/P骰子功能
    std::string expression;
    if (bonusDice > 0) {
        expression = "B" + std::to_string(bonusDice);
    } else if (bonusDice < 0) {
        expression = "P" + std::to_string(-bonusDice);
    } else {
        expression = "1D100";
    }

    RD rd(expression, 100);
    int_errno err = suppliedRoll > 0 ? 0 : rd.Roll();

    if (err != 0) {
        result.rollValue = 0;
        result.successLevel = SuccessLevel::Failure;
        result.description = "掷骰失败: " + getErrorMessage(err);
        return result;
    }

    result.rollValue = suppliedRoll > 0 ? suppliedRoll : rd.intTotal;
    if (suppliedRoll > 0 && bonusDice != 0) {
        int units = suppliedRoll % 10;
        int tens = suppliedRoll / 10;
        for (int i = 0; i < std::abs(bonusDice); ++i) {
            RD extra("1D10", 10);
            if (extra.Roll() != 0) break;
            int candidate = units == 0 ? extra.intTotal : extra.intTotal - 1;
            if ((bonusDice > 0 && candidate < tens) || (bonusDice < 0 && candidate > tens)) tens = candidate;
        }
        result.rollValue = tens * 10 + units;
    }

    // 使用Dice的RollSuccessLevel函数判定
    SuccessLevel level = static_cast<SuccessLevel>(RollSuccessLevel(result.rollValue, skillValue, rule));
    if (autoSuccess && level == SuccessLevel::Failure) level = SuccessLevel::RegularSuccess;

    result.successLevel = level;
    result.description = getSuccessLevelDesc(static_cast<int>(level), autoSuccess);

    return result;
}

} // namespace koidice
