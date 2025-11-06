#pragma once
#include <string>
#include "../../Dice/Dice/RDConstant.h"

namespace koidice {

// 随机数初始化
void ensureRandomInit();

// 错误消息转换
std::string getErrorMessage(int_errno err);

// 成功等级描述
std::string getSuccessLevelDesc(int level, bool autoSuccess = false);

// 字符串工具
std::string trim(const std::string& str);
bool startsWith(const std::string& str, const std::string& prefix);
bool endsWith(const std::string& str, const std::string& suffix);

} // namespace koidice
