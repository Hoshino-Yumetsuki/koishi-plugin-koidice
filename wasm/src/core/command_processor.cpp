#include "command_processor.h"
#include "roll_handler.h"
#include "check_handler.h"
#include "utils.h"
#include <regex>
#include <sstream>

namespace koidice {

emscripten::val CommandProcessor::processRoll(
    const std::string& rawCommand,
    const std::string& userId,
    const std::string& channelId,
    bool isHidden,
    bool isSimple,
    int defaultDice
) {
    ensureRandomInit();
    
    std::string expression;
    std::string reason;
    int rounds = 1;
    
    // 解析命令
    parseRollExpression(rawCommand, expression, reason, rounds, defaultDice);
    
    // 调用掷骰处理器
    return RollHandler::roll(expression, reason, rounds, isHidden, isSimple, defaultDice);
}

emscripten::val CommandProcessor::processCheck(
    const std::string& rawCommand,
    const std::string& userId,
    int rule
) {
    ensureRandomInit();
    
    std::string skillName;
    int skillValue = 0;
    int rounds = 1;
    int bonusDice = 0;
    Difficulty difficulty = Difficulty::Normal;
    bool autoSuccess = false;
    
    // 解析命令
    parseCheckExpression(rawCommand, skillName, skillValue, rounds, bonusDice, difficulty, autoSuccess);
    
    // 调用检定处理器
    return CheckHandler::check(skillName, skillValue, rounds, bonusDice, difficulty, autoSuccess, rule);
}

emscripten::val CommandProcessor::processCOCCheck(int skillValue, int bonusDice) {
    ensureRandomInit();
    return CheckHandler::cocCheck(skillValue, bonusDice);
}

void CommandProcessor::parseRollExpression(
    const std::string& input,
    std::string& expression,
    std::string& reason,
    int& rounds,
    int defaultDice
) {
    std::string trimmedInput = trim(input);
    
    if (trimmedInput.empty()) {
        expression = "1d" + std::to_string(defaultDice);
        reason = "";
        rounds = 1;
        return;
    }
    
    // 解析多轮掷骰：3#1d6
    std::regex roundsRegex(R"(^(\d+)#(.+)$)");
    std::smatch match;
    
    if (std::regex_match(trimmedInput, match, roundsRegex)) {
        rounds = std::stoi(match[1].str());
        if (rounds > 10) rounds = 10;
        if (rounds < 1) rounds = 1;
        trimmedInput = match[2].str();
    }
    
    // 分离表达式和原因
    // 表达式包含：数字、d、D、+、-、*、/、(、)、b、B、p、P、k、K
    std::regex exprRegex(R"(^([\d#dpbkDPBK+\-*/()\s]+)(.*)$)");
    
    if (std::regex_match(trimmedInput, match, exprRegex)) {
        expression = trim(match[1].str());
        reason = trim(match[2].str());
        
        // 如果表达式只是纯数字，视为原因
        if (std::regex_match(expression, std::regex(R"(^\d+$)"))) {
            reason = trimmedInput;
            expression = "";
        }
    } else {
        reason = trimmedInput;
        expression = "";
    }
    
    // 如果没有表达式，使用默认
    if (expression.empty()) {
        expression = "1d" + std::to_string(defaultDice);
    }
}

void CommandProcessor::parseCheckExpression(
    const std::string& input,
    std::string& skillName,
    int& skillValue,
    int& rounds,
    int& bonusDice,
    Difficulty& difficulty,
    bool& autoSuccess
) {
    std::string expr = trim(input);
    
    // 解析轮数和奖惩骰：3#b技能名 60
    std::regex roundsRegex(R"(^(\d+)#([pb]?)(.+)$)", std::regex::icase);
    std::smatch match;
    
    if (std::regex_match(expr, match, roundsRegex)) {
        rounds = std::min(std::stoi(match[1].str()), 10);
        std::string bonusType = match[2].str();
        if (bonusType == "p" || bonusType == "P") bonusDice = -1;
        else if (bonusType == "b" || bonusType == "B") bonusDice = 1;
        expr = match[3].str();
    }
    
    expr = trim(expr);
    
    // 解析难度关键词
    if (startsWith(expr, "自动成功")) {
        autoSuccess = true;
        expr = expr.substr(12); // "自动成功" = 12 bytes in UTF-8
    } else if (startsWith(expr, "困难")) {
        difficulty = Difficulty::Hard;
        expr = expr.substr(6); // "困难" = 6 bytes
    } else if (startsWith(expr, "极难") || startsWith(expr, "极限")) {
        difficulty = Difficulty::Extreme;
        expr = expr.substr(6); // "极难"/"极限" = 6 bytes
    }
    
    expr = trim(expr);
    
    // 分离技能名和技能值
    size_t spacePos = expr.find_last_of(' ');
    if (spacePos != std::string::npos) {
        skillName = trim(expr.substr(0, spacePos));
        std::string valueStr = trim(expr.substr(spacePos + 1));
        
        try {
            skillValue = std::stoi(valueStr);
        } catch (...) {
            // 解析失败，整个作为技能名
            skillName = expr;
            skillValue = -1; // 标记需要从人物卡获取
        }
    } else {
        skillName = expr;
        skillValue = -1; // 标记需要从人物卡获取
    }
}

} // namespace koidice
