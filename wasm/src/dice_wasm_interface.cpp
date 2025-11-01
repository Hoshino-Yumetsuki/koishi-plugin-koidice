#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>
#include <memory>
#include <sstream>
#include <vector>
#include <ctime>
#include <cstdlib>
#include "dice_wasm_types.h"

// 包含Dice!核心头文件
#include "../../Dice/Dice/RD.h"
#include "../../Dice/Dice/RandomGenerator.h"
#include "../../Dice/Dice/RDConstant.h"

// 初始化随机数生成器
static bool g_random_initialized = false;

void ensureRandomInit() {
    if (!g_random_initialized) {
        std::srand(static_cast<unsigned>(std::time(nullptr)));
        g_random_initialized = true;
    }
}

// 错误码到错误消息的映射
std::string getErrorMessage(int_errno err) {
    switch (err) {
        case 0: return "";
        case Value_Err: return "数值错误";
        case Input_Err: return "输入格式错误";
        case ZeroDice_Err: return "骰子数量不能为0";
        case ZeroType_Err: return "骰子面数不能为0";
        case DiceTooBig_Err: return "骰子数量或面数过大";
        case TypeTooBig_Err: return "骰子类型过大";
        case AddDiceVal_Err: return "加骰数值错误";
        case DiceCnt_Err: return "骰子计数错误";
        default: return "未知错误";
    }
}

using namespace emscripten;
using namespace DiceWasm;

// ============ 核心掷骰功能 ============

/**
 * 执行基础掷骰
 * @param expression 掷骰表达式，如 "1d100", "3d6+5"
 * @param defaultDice 默认骰子面数
 * @return 掷骰结果对象
 */
val rollDice(const std::string& expression, int defaultDice = 100) {
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
        result.set("detail", rd.FormCompleteString());
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

/**
 * COC7版规则检定
 * @param skillValue 技能值
 * @param bonusDice 奖励骰数量 (正数为奖励，负数为惩罚)
 * @return 检定结果
 */
val cocCheck(int skillValue, int bonusDice = 0) {
    ensureRandomInit();
    val result = val::object();
    
    try {
        if (skillValue < 0 || skillValue > 100) {
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "");
            result.set("errorCode", Value_Err);
            result.set("errorMsg", "技能值必须在0-100之间");
            return result;
        }
        
        // 使用Dice!的RD类进行掷骰
        std::string diceExpr;
        if (bonusDice > 0) {
            // 奖励骰 (Bonus Dice)
            diceExpr = "B" + std::to_string(bonusDice);
        } else if (bonusDice < 0) {
            // 惩罚骰 (Penalty Dice)
            diceExpr = "P" + std::to_string(-bonusDice);
        } else {
            // 普通1d100
            diceExpr = "1d100";
        }
        
        RD rd(diceExpr, 100);
        int_errno err = rd.Roll();
        
        if (err != 0) {
            result.set("rollValue", 0);
            result.set("skillValue", skillValue);
            result.set("successLevel", 0);
            result.set("description", "");
            result.set("errorCode", err);
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }
        
        int rollValue = rd.intTotal;
        
        // 判定成功等级
        int successLevel = 0; // 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
        std::string description;
        
        // 大失败: >= 96 或技能值<50时掷出100
        if (rollValue >= 96 || (skillValue < 50 && rollValue == 100)) {
            successLevel = 0;
            description = "大失败";
        }
        // 大成功: <= 5 且 <= 技能值
        else if (rollValue <= 5 && rollValue <= skillValue) {
            successLevel = 5;
            description = "大成功";
        }
        // 极难成功: <= 技能值/5
        else if (rollValue <= skillValue / 5) {
            successLevel = 4;
            description = "极难成功";
        }
        // 困难成功: <= 技能值/2
        else if (rollValue <= skillValue / 2) {
            successLevel = 3;
            description = "困难成功";
        }
        // 成功: <= 技能值
        else if (rollValue <= skillValue) {
            successLevel = 2;
            description = "成功";
        }
        // 失败
        else {
            successLevel = 1;
            description = "失败";
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
        result.set("description", "");
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("rollValue", 0);
        result.set("skillValue", skillValue);
        result.set("successLevel", 0);
        result.set("description", "");
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }
    
    return result;
}

/**
 * 暗骰投掷
 * @param expression 掷骰表达式
 * @param defaultDice 默认骰子面数
 * @return 只返回是否成功，不返回具体数值
 */
val hiddenRoll(const std::string& expression, int defaultDice = 100) {
    ensureRandomInit();
    val result = val::object();
    
    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();
        
        result.set("success", err == 0);
        result.set("errorCode", err);
        result.set("errorMsg", err == 0 ? "" : getErrorMessage(err));
        
    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }
    
    return result;
}

/**
 * 获取掷骰表达式的最大值
 * @param expression 掷骰表达式
 * @param defaultDice 默认骰子面数
 * @return 最大可能值
 */
int getMaxValue(const std::string& expression, int defaultDice = 100) {
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

/**
 * 获取掷骰表达式的最小值
 * @param expression 掷骰表达式
 * @param defaultDice 默认骰子面数
 * @return 最小可能值
 */
int getMinValue(const std::string& expression, int defaultDice = 100) {
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

// ============ 牌堆功能 ============

/**
 * 从牌堆中抽取卡牌
 * @param deckName 牌堆名称
 * @param count 抽取数量
 * @return 抽取结果
 */
val drawCard(const std::string& deckName, int count = 1) {
    val result = val::object();
    
    try {
        // TODO: 实现牌堆抽取逻辑
        result.set("cards", val::array());
        result.set("remaining", 0);
        result.set("errorCode", 0);
        result.set("errorMsg", "");
        
    } catch (const std::exception& e) {
        result.set("cards", val::array());
        result.set("remaining", 0);
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("Exception: ") + e.what());
    }
    
    return result;
}

/**
 * 重置牌堆
 * @param deckName 牌堆名称
 */
void resetDeck(const std::string& deckName) {
    try {
        // TODO: 实现牌堆重置逻辑
    } catch (...) {
        // 静默失败
    }
}

// ============ 角色卡功能 ============

/**
 * 创建角色卡
 * @param characterName 角色名称
 * @return 是否成功
 */
bool createCharacter(const std::string& characterName) {
    try {
        // TODO: 实现角色卡创建逻辑
        return true;
    } catch (...) {
        return false;
    }
}

/**
 * 设置角色属性
 * @param characterName 角色名称
 * @param attrName 属性名称
 * @param attrValue 属性值
 * @return 是否成功
 */
bool setCharacterAttr(const std::string& characterName, 
                      const std::string& attrName, 
                      int attrValue) {
    try {
        // TODO: 实现属性设置逻辑
        return true;
    } catch (...) {
        return false;
    }
}

/**
 * 获取角色属性
 * @param characterName 角色名称
 * @param attrName 属性名称
 * @return 属性值，失败返回-1
 */
int getCharacterAttr(const std::string& characterName, 
                     const std::string& attrName) {
    try {
        // TODO: 实现属性获取逻辑
        return 0;
    } catch (...) {
        return -1;
    }
}

/**
 * 删除角色卡
 * @param characterName 角色名称
 * @return 是否成功
 */
bool deleteCharacter(const std::string& characterName) {
    try {
        // TODO: 实现角色卡删除逻辑
        return true;
    } catch (...) {
        return false;
    }
}

// ============ 工具函数 ============

/**
 * 获取版本信息
 * @return 版本字符串
 */
std::string getVersion() {
    return "Dice! WASM v1.0.0-beta.1 (Based on Dice! Core)";
}

/**
 * 初始化Dice模块
 * @return 是否成功
 */
bool initialize() {
    try {
        ensureRandomInit();
        return true;
    } catch (...) {
        return false;
    }
}

// ============ Emscripten绑定 ============

EMSCRIPTEN_BINDINGS(dice_module) {
    // 核心掷骰功能
    function("rollDice", &rollDice);
    function("cocCheck", &cocCheck);
    function("hiddenRoll", &hiddenRoll);
    function("getMaxValue", &getMaxValue);
    function("getMinValue", &getMinValue);
    
    // 牌堆功能
    function("drawCard", &drawCard);
    function("resetDeck", &resetDeck);
    
    // 角色卡功能
    function("createCharacter", &createCharacter);
    function("setCharacterAttr", &setCharacterAttr);
    function("getCharacterAttr", &getCharacterAttr);
    function("deleteCharacter", &deleteCharacter);
    
    // 工具函数
    function("getVersion", &getVersion);
    function("initialize", &initialize);
}
