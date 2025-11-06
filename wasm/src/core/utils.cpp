#include "utils.h"
#include <algorithm>
#include <cctype>

namespace koidice {

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
