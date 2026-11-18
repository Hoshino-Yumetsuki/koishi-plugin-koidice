#pragma once
#include <string>
#include <emscripten/val.h>

namespace koidice {

// 理智检定功能
std::string getTempInsanity(int index);
std::string getLongInsanity(int index);
std::string getPhobia(int index);
std::string getMania(int index);
emscripten::val generateInsanity(bool temporary);
emscripten::val sanityCheck(int currentSan, const std::string& successLoss, const std::string& failureLoss);
emscripten::val sanityCheckWithRule(int currentSan, const std::string& successLoss, const std::string& failureLoss, int rule, int suppliedRoll);

} // namespace koidice
