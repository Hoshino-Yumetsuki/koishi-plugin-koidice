#pragma once
#include <string>
#include <emscripten/val.h>

// 规则速查功能（使用 Dice! GetRule）
std::string queryRule(const std::string& query);
std::string queryRuleWithSystem(const std::string& system, const std::string& keyword);
