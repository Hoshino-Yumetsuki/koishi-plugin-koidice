#pragma once
#include <string>
#include <vector>
#include <emscripten/val.h>

// 通用类型定义

namespace koidice {

// 错误码类型
using ErrorCode = int;

// 成功等级枚举（与Dice保持一致）
enum class SuccessLevel {
    Fumble = 0,          // 大失败
    Failure = 1,         // 失败
    RegularSuccess = 2,  // 成功
    HardSuccess = 3,     // 困难成功
    ExtremeSuccess = 4,  // 极难成功
    Critical = 5         // 大成功
};

// 难度等级
enum class Difficulty {
    Normal = 1,    // 普通
    Hard = 2,      // 困难（/2）
    Extreme = 5    // 极难（/5）
};

// 掷骰结果
struct RollResult {
    int total;
    std::string expression;
    std::string detail;
    ErrorCode errorCode;
    std::string errorMsg;
    
    emscripten::val toJS() const;
};

// 单次检定结果
struct CheckRoundResult {
    int rollValue;
    int skillValue;
    SuccessLevel successLevel;
    std::string description;
    
    emscripten::val toJS() const;
};

// 完整检定结果
struct CheckResult {
    std::string skillName;
    int originalSkillValue;
    int finalSkillValue;
    Difficulty difficulty;
    int rounds;
    std::vector<CheckRoundResult> results;
    ErrorCode errorCode;
    std::string errorMsg;
    
    emscripten::val toJS() const;
};

// 命令解析结果
struct CommandContext {
    std::string userId;
    std::string channelId;
    std::string rawCommand;
    std::string commandType;  // "roll", "check", "coc", etc.
    std::string expression;
    std::string reason;
    int rounds = 1;
    bool isHidden = false;
    bool isSimple = false;
};

} // namespace koidice
