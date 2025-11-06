#pragma once
#include <string>
#include <emscripten/val.h>
#include "../../Dice/Dice/RDConstant.h"

namespace koidice {

// 随机数初始化
void ensureRandomInit();

// 使用 JavaScript 的加密随机数生成器
int getSecureRandomInt(int min, int max);

// 错误消息转换
std::string getErrorMessage(int_errno err);

// 掷骰函数
emscripten::val rollDice(const std::string& expression, int defaultDice = 100);

// COC检定
emscripten::val cocCheck(int skillValue, int bonusDice = 0);

// 技能检定
emscripten::val skillCheck(const std::string& expression, int rule = 1);

// 暗骰
emscripten::val hiddenRoll(const std::string& expression, int defaultDice = 100);

// 获取最大值/最小值
int getMaxValue(const std::string& expression, int defaultDice = 100);
int getMinValue(const std::string& expression, int defaultDice = 100);

// 成功等级描述
std::string getSuccessLevelDesc(int level, bool autoSuccess = false);

// 字符串工具
std::string trim(const std::string& str);
bool startsWith(const std::string& str, const std::string& prefix);
bool endsWith(const std::string& str, const std::string& suffix);

} // namespace koidice
