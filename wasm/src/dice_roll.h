#pragma once
#include <string>
#include <emscripten/val.h>
#include "../../Dice/Dice/RDConstant.h"

// 工具函数
void ensureRandomInit();
std::string getErrorMessage(int_errno err);

// 掷骰功能
emscripten::val rollDice(const std::string& expression, int defaultDice = 100);
emscripten::val cocCheck(int skillValue, int bonusDice = 0);
emscripten::val skillCheck(const std::string& expression, int rule = 1);
bool hiddenRoll(const std::string& expression, int defaultDice = 100);
int getMaxValue(const std::string& expression, int defaultDice = 100);
int getMinValue(const std::string& expression, int defaultDice = 100);
