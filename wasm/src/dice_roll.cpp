#include "dice_roll.h"
#include "../../Dice/Dice/RD.h"
#include "../../Dice/Dice/RandomGenerator.h"
#include <emscripten/val.h>
#include <regex>

using namespace emscripten;

// 全局随机数生成器初始化标志
static bool randomInitialized = false;

void ensureRandomInit() {
    if (!randomInitialized) {
        // WASM 环境使用默认随机数生成器
        randomInitialized = true;
    }
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

        result.set("total", rd.intTotal);
        result.set("expression", rd.strDice);
        result.set("detail", rd.FormCompleteString());
        result.set("errorCode", static_cast<int>(err));
        result.set("errorMsg", getErrorMessage(err));

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
    ensureRandomInit();
    val result = val::object();

    try {
        if (skillValue < 0 || skillValue > 100) {
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "技能值必须在0-100之间");
            result.set("errorCode", Input_Err);
            result.set("errorMsg", "技能值超出范围");
            return result;
        }

        // 使用RD类的B/P骰子功能，直接复用Dice原本的实现
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
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "掷骰失败");
            result.set("errorCode", static_cast<int>(err));
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

        result.set("rollValue", rollValue);
        result.set("skillValue", skillValue);
        result.set("successLevel", successLevel);
        result.set("description", description);
        result.set("errorCode", 0);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "异常");
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "未知异常");
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

val skillCheck(const std::string& expression, int rule) {
    ensureRandomInit();
    val result = val::object();
    
    try {
        // 解析表达式格式: [轮数#][奖惩][难度]技能名 [技能值]
        std::string expr = expression;
        int rounds = 1;
        int bonusDice = 0;
        int difficulty = 1;  // 1=普通, 2=困难, 5=极难
        bool autoSuccess = false;
        
        // 解析轮数和奖惩骰 (例: 3#p, 2#b) - 参考 DiceEvent.cpp 的解析逻辑
        std::regex roundRegex("^(\\d+)#([pb]?)(.+)$", std::regex::icase);
        std::smatch roundMatch;
        if (std::regex_match(expr, roundMatch, roundRegex)) {
            rounds = std::min(std::stoi(roundMatch[1].str()), 9);
            std::string bonusType = roundMatch[2].str();
            if (bonusType == "p" || bonusType == "P") bonusDice = -1;
            else if (bonusType == "b" || bonusType == "B") bonusDice = 1;
            expr = roundMatch[3].str();
        }
        
        // 去除空格
        expr.erase(0, expr.find_first_not_of(" \t\n\r"));
        expr.erase(expr.find_last_not_of(" \t\n\r") + 1);
        
        // 解析难度关键词 - 参考 DiceEvent.cpp 3623-3638行
        if (expr.find("自动成功") == 0) {
            autoSuccess = true;
            expr = expr.substr(12);
        } else if (expr.find("困难") == 0) {
            difficulty = 2;
            expr = expr.substr(6);
        } else if (expr.find("极难") == 0 || expr.find("极限") == 0) {
            difficulty = 5;
            expr = expr.substr(6);
        }
        
        expr.erase(0, expr.find_first_not_of(" \t\n\r"));
        
        // 分离技能名和技能值
        size_t spacePos = expr.find(' ');
        std::string skillName;
        int skillValue = 0;
        
        if (spacePos != std::string::npos) {
            skillName = expr.substr(0, spacePos);
            std::string valueStr = expr.substr(spacePos + 1);
            valueStr.erase(0, valueStr.find_first_not_of(" \t\n\r"));
            
            try {
                skillValue = std::stoi(valueStr);
            } catch (...) {
                result.set("errorCode", Input_Err);
                result.set("errorMsg", "技能值格式错误");
                result.set("skillName", skillName);
                return result;
            }
        } else {
            result.set("errorCode", Input_Err);
            result.set("errorMsg", "缺少技能值");
            return result;
        }
        
        // 验证技能值并应用难度修正 - 参考 DiceEvent.cpp 3692-3696行
        int finalSkillValue = skillValue / difficulty;
        if (finalSkillValue < 0 || finalSkillValue > 1000) {
            result.set("errorCode", Input_Err);
            result.set("errorMsg", "技能值必须在0-1000之间");
            result.set("skillName", skillName);
            result.set("skillValue", skillValue);
            return result;
        }
        
        // 执行检定 - 使用 RD 类和 RollSuccessLevel 函数
        val results = val::array();
        
        for (int i = 0; i < rounds; i++) {
            // 使用RD类的B/P骰子功能，直接复用Dice原本的实现
            std::string rollExpression;
            if (bonusDice > 0) {
                rollExpression = std::to_string(bonusDice) + "B";
            } else if (bonusDice < 0) {
                rollExpression = std::to_string(-bonusDice) + "P";
            } else {
                rollExpression = "1D100";
            }
            
            RD rdRoll(rollExpression, 100);
            int_errno err = rdRoll.Roll();
            if (err != 0) {
                result.set("errorCode", static_cast<int>(err));
                result.set("errorMsg", getErrorMessage(err));
                return result;
            }
            
            int rollValue = rdRoll.intTotal;
            
            // 使用 RD.cpp 中的 RollSuccessLevel 函数判定 - 参考 DiceEvent.cpp 3724行
            SuccessLevel successLevel = autoSuccess && rollValue <= finalSkillValue 
                ? SuccessLevel::RegularSuccess 
                : RollSuccessLevel(rollValue, finalSkillValue, rule);
            
            val roundResult = val::object();
            roundResult.set("rollValue", rollValue);
            roundResult.set("skillValue", finalSkillValue);
            roundResult.set("successLevel", static_cast<int>(successLevel));
            
            // 设置描述 - 参考 DiceEvent.cpp 3725-3741行
            std::string description;
            switch (successLevel) {
                case SuccessLevel::Fumble: description = "大失败"; break;
                case SuccessLevel::Failure: description = autoSuccess ? "成功" : "失败"; break;
                case SuccessLevel::RegularSuccess: description = "成功"; break;
                case SuccessLevel::HardSuccess: description = "困难成功"; break;
                case SuccessLevel::ExtremeSuccess: description = "极难成功"; break;
                case SuccessLevel::Critical: description = "大成功"; break;
            }
            roundResult.set("description", description);
            
            results.call<void>("push", roundResult);
        }
        
        result.set("skillName", skillName);
        result.set("originalSkillValue", skillValue);
        result.set("finalSkillValue", finalSkillValue);
        result.set("difficulty", difficulty);
        result.set("rounds", rounds);
        result.set("results", results);
        result.set("errorCode", 0);
        result.set("errorMsg", "");
        
    } catch (const std::exception& e) {
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }
    
    return result;
}

bool hiddenRoll(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();
        return err == 0;
    } catch (...) {
        return false;
    }
}

int getMaxValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Max();
        if (err != 0) {
            return -1;
        }
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}

int getMinValue(const std::string& expression, int defaultDice) {
    ensureRandomInit();
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Min();
        if (err != 0) {
            return -1;
        }
        return rd.intTotal;
    } catch (...) {
        return -1;
    }
}
