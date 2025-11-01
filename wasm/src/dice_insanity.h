#pragma once
#include <string>
#include <emscripten/val.h>

// 疯狂症状功能
std::string getTempInsanity(int index);
std::string getLongInsanity(int index);
std::string getPhobia(int index);
std::string getMania(int index);

// 理智检定功能
emscripten::val sanityCheck(int currentSan, const std::string& successLoss, const std::string& failureLoss);
