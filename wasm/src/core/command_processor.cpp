#include "command_processor.h"
#include "roll_handler.h"
#include "check_handler.h"
#include "utils.h"
#include "utf8_utils.h"
#include "../../../Dice/Dice/RD.h"
#include "../../../Dice/Dice/Jsonio.h"
#include <regex>
#include <sstream>

namespace koidice {

namespace {
std::shared_ptr<DiceSession> loadRoulette(const nlohmann::json& state) {
    auto game = std::make_shared<DiceSession>("koishi-roll");
    for (const auto& entry : state.items()) {
        const auto& data = entry.value();
        const auto face = data.at("face").get<size_t>();
        const auto copy = data.at("copy").get<size_t>();
        auto& wheel = game->roulette[face];
        wheel.face = face;
        wheel.copy = copy;
        data.at("pool").get_to(wheel.pool);
        data.at("sizRes").get_to(wheel.sizRes);
        if (!face || face > 100 || !copy || copy > 100 / face || wheel.pool.size() != face * copy || wheel.sizRes > wheel.pool.size()) {
            throw std::invalid_argument("轮盘骰记录无效");
        }
    }
    return game;
}

void saveRoulette(nlohmann::json& state, const DiceSession& game, emscripten::val& result) {
    bool changed = false;
    for (const auto& [face, wheel] : game.roulette) {
        auto& data = state.at(std::to_string(face));
        if (data["sizRes"] == wheel.sizRes && data["pool"] == wheel.pool) continue;
        data["sizRes"] = wheel.sizRes;
        data["pool"] = wheel.pool;
        changed = true;
    }
    if (changed) result.set("roulette", state.dump());
}
}

emscripten::val CommandProcessor::processRoll(
    const std::string& rawCommand,
    const std::string& userId,
    const std::string& channelId,
    bool isHidden,
    bool isSimple,
    int defaultDice
) {
    return processTableRoll(rawCommand, isHidden, isSimple, defaultDice, {});
}

emscripten::val CommandProcessor::processTableRoll(const std::string& rawCommand, bool isHidden, bool isSimple, int defaultDice, const std::string& roulette) {
    ensureRandomInit();

    std::string expression;
    std::string reason;
    int rounds = 1;

    // 解析命令
    parseRollExpression(rawCommand, expression, reason, rounds, defaultDice);
    if (rounds < 1 || rounds > 10) {
        emscripten::val result = emscripten::val::object();
        result.set("success", false);
        result.set("errorMsg", "掷骰轮数必须在1-10之间");
        return result;
    }

    if (roulette.empty() || roulette == "{}") return RollHandler::roll(expression, reason, rounds, isHidden, isSimple, defaultDice);
    auto state = nlohmann::json::parse(roulette);
    auto game = loadRoulette(state);
    auto result = RollHandler::roll(expression, reason, rounds, isHidden, isSimple, defaultDice, game);
    if (result["success"].as<bool>()) saveRoulette(state, *game, result);
    return result;
}

emscripten::val CommandProcessor::drawRouletteBatch(const std::string& roulette, emscripten::val faces) {
    ensureRandomInit();
    auto state = nlohmann::json::parse(roulette.empty() ? "{}" : roulette);
    auto game = loadRoulette(state);
    auto result = emscripten::val::object();
    auto rolls = emscripten::val::array();
    const auto length = faces["length"].as<unsigned>();
    for (unsigned i = 0; i < length; ++i) {
        const auto face = faces[i].as<size_t>();
        if (game->roulette.count(face)) rolls.call<void>("push", game->roulette[face].roll());
        else rolls.call<void>("push", emscripten::val::undefined());
    }
    result.set("rolls", rolls);
    saveRoulette(state, *game, result);
    return result;
}

emscripten::val CommandProcessor::processCheck(
    const std::string& rawCommand,
    const std::string& userId,
    int rule
) {
    return processCheckWithRolls(rawCommand, userId, rule, emscripten::val::undefined());
}

emscripten::val CommandProcessor::processCheckWithRolls(
    const std::string& rawCommand, const std::string& userId, int rule, emscripten::val rolls
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
    return CheckHandler::check(skillName, skillValue, rounds, bonusDice, difficulty, autoSuccess, rule, rolls);
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

    std::regex roundsRegex(R"(^([\dDd+\-*/xX()]+)#(.*)$)");
    std::smatch match;
    if (std::regex_match(trimmedInput, match, roundsRegex)) {
        RD count(match[1].str(), defaultDice);
        if (count.Roll() != 0) { rounds = 0; return; }
        rounds = count.intTotal;
        if (rounds > 10 || rounds < 1) return;
        trimmedInput = trim(match[2].str());
    }

    // 分离表达式和原因
    static const std::regex exprRegex(R"(^([\d#dfpbkDFPBKxX+\-*/()\s]+)(.*)$)");

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

    std::regex roundsRegex(R"(^(\d+)#(.*)$)");
    std::smatch match;
    if (std::regex_match(expr, match, roundsRegex)) {
        rounds = std::stoi(match[1].str());
        expr = trim(match[2].str());
    }
    std::regex bonusRegex(R"(^([pb])(\d*)(.*)$)", std::regex::icase);
    if (std::regex_match(expr, match, bonusRegex)) {
        int count = match[2].str().empty() ? 1 : std::stoi(match[2].str());
        bonusDice = (match[1].str() == "p" || match[1].str() == "P") ? -count : count;
        expr = match[3].str();
    }

    expr = trim(expr);

    // 解析难度关键词
    if (utf8StartsWith(expr, "自动成功")) {
        autoSuccess = true;
        expr = utf8RemovePrefix(expr, "自动成功");
    }
    if (utf8StartsWith(expr, "困难")) {
        difficulty = Difficulty::Hard;
        expr = utf8RemovePrefix(expr, "困难");
    } else if (utf8StartsWith(expr, "极难")) {
        difficulty = Difficulty::Extreme;
        expr = utf8RemovePrefix(expr, "极难");
    } else if (utf8StartsWith(expr, "极限")) {
        difficulty = Difficulty::Extreme;
        expr = utf8RemovePrefix(expr, "极限");
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
