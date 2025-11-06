#include "utils.h"
#include "check_handler.h"
#include "command_processor.h"
#include "../../Dice/Dice/RD.h"
#include <algorithm>
#include <cctype>
#include <sstream>

using namespace emscripten;

namespace koidice {

static bool randomInitialized = false;

void ensureRandomInit() {
    if (!randomInitialized) {
        randomInitialized = true;
    }
}

int getSecureRandomInt(int min, int max) {
    if (min > max) {
        std::swap(min, max);
    }

    if (min == max) {
        return min;
    }

    // node crypto: crypto.getRandomValues()
    val crypto = val::global("crypto");
    val uint32Array = val::global("Uint32Array").new_(1);
    crypto.call<void>("getRandomValues", uint32Array);
    unsigned int randomValue = uint32Array[0].as<unsigned int>();

    // 无偏映射算法
    unsigned int range = max - min + 1;
    unsigned long long product = static_cast<unsigned long long>(randomValue) * range;
    unsigned int result = product >> 32; // 取高32位

    return min + result;
}

std::string getErrorMessage(int_errno err) {
    switch (err) {
        case Value_Err: return "数值错误";
        case Input_Err: return "输入错误";
        case ZeroDice_Err: return "骰子数量为0";
        case ZeroType_Err: return "骰子面数为0";
        case DiceTooBig_Err: return "骰子数量过大";
        case TypeTooBig_Err: return "骰子面数过大";
        case AddDiceVal_Err: return "加骰错误";
        case DiceCnt_Err: return "骰子计数错误";
        default: return "未知错误";
    }
}

val rollDice(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    val result = val::object();

    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();

        if (err != 0) {
            result.set("total", 0);
            result.set("expression", expression);
            result.set("detail", "");
            result.set("errorCode", err);
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }

        result.set("total", rd.intTotal);
        result.set("expression", expression);
        result.set("detail", rd.FormShortString());
        result.set("errorCode", 0);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("total", 0);
        result.set("expression", expression);
        result.set("detail", "");
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("total", 0);
        result.set("expression", expression);
        result.set("detail", "");
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

val cocCheck(int skillValue, int bonusDice) {
    return CheckHandler::cocCheck(skillValue, bonusDice);
}

val skillCheck(const std::string& expression, int rule) {
    ensureRandomInit();
    val result = val::object();

    try {
        // 解析表达式格式: "rollValue/skillValue" 或 "skillName skillValue"
        std::istringstream iss(expression);
        std::string part1, part2;

        // 尝试用 / 分割
        size_t slashPos = expression.find('/');
        if (slashPos != std::string::npos) {
            // 格式: rollValue/skillValue
            part1 = expression.substr(0, slashPos);
            part2 = expression.substr(slashPos + 1);

            int rollValue = std::stoi(trim(part1));
            int skillValue = std::stoi(trim(part2));

            // 计算成功等级
            int successLevel = 1; // 默认失败

            // 大成功判定
            if (rollValue <= 5 && rollValue <= skillValue) {
                successLevel = 5;
            }
            // 大失败判定
            else if (rollValue == 100 || (rollValue > 95 && rollValue > skillValue)) {
                successLevel = 0;
            }
            // 失败
            else if (rollValue > skillValue) {
                successLevel = 1;
            }
            // 成功等级判定
            else {
                int hardThreshold = skillValue / 2;
                int extremeThreshold = skillValue / 5;

                if (rollValue <= extremeThreshold) {
                    successLevel = 4; // 极难成功
                } else if (rollValue <= hardThreshold) {
                    successLevel = 3; // 困难成功
                } else {
                    successLevel = 2; // 成功
                }
            }

            // 构建结果
            val results = val::array();
            val round = val::object();
            round.set("rollValue", rollValue);
            round.set("skillValue", skillValue);
            round.set("successLevel", successLevel);
            round.set("description", getSuccessLevelDesc(successLevel));
            results.call<void>("push", round);

            result.set("skillName", "");
            result.set("originalSkillValue", skillValue);
            result.set("finalSkillValue", skillValue);
            result.set("difficulty", 1);
            result.set("rounds", 1);
            result.set("results", results);
            result.set("errorCode", 0);
            result.set("errorMsg", "");
        } else {
            result.set("errorCode", -1);
            result.set("errorMsg", "表达式格式错误，应为 rollValue/skillValue");
        }

    } catch (const std::exception& e) {
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

val hiddenRoll(const std::string& expression, int defaultDice) {
    val result = val::object();
    val rollResult = rollDice(expression, defaultDice);

    int errorCode = rollResult["errorCode"].as<int>();
    result.set("success", errorCode == 0);
    result.set("errorCode", errorCode);
    result.set("errorMsg", rollResult["errorMsg"].as<std::string>());

    return result;
}

int getMaxValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        rd.Max();
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}

int getMinValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        rd.Min();
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}

std::string getSuccessLevelDesc(int level, bool autoSuccess) {
    switch (level) {
        case 0: return "大失败";
        case 1: return autoSuccess ? "成功" : "失败";
        case 2: return "成功";
        case 3: return "困难成功";
        case 4: return "极难成功";
        case 5: return "大成功";
        default: return "未知";
    }
}

std::string trim(const std::string& str) {
    const char* whitespace = " \t\n\r\f\v";
    size_t start = str.find_first_not_of(whitespace);
    if (start == std::string::npos) return "";
    size_t end = str.find_last_not_of(whitespace);
    return str.substr(start, end - start + 1);
}

bool startsWith(const std::string& str, const std::string& prefix) {
    return str.size() >= prefix.size() &&
           str.compare(0, prefix.size(), prefix) == 0;
}

bool endsWith(const std::string& str, const std::string& suffix) {
    return str.size() >= suffix.size() &&
           str.compare(str.size() - suffix.size(), suffix.size(), suffix) == 0;
}

} // namespace koidice
