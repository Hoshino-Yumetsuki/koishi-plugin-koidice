#include "roll_handler.h"
#include "utils.h"
#include "../../../Dice/Dice/RD.h"
#include <vector>

namespace koidice {

emscripten::val RollHandler::roll(
    const std::string& expression,
    const std::string& reason,
    int rounds,
    bool isHidden,
    bool isSimple,
    int defaultDice
) {
    emscripten::val result = emscripten::val::object();
    emscripten::val results = emscripten::val::array();

    try {
        // 执行多轮掷骰
        for (int i = 0; i < rounds; i++) {
            RollResult rollResult = rollOnce(expression, defaultDice);

            if (rollResult.errorCode != 0) {
                result.set("success", false);
                result.set("errorMsg", rollResult.errorMsg);
                return result;
            }

            emscripten::val roundResult = emscripten::val::object();
            roundResult.set("total", rollResult.total);
            roundResult.set("expression", rollResult.expression);
            roundResult.set("detail", rollResult.detail);

            results.call<void>("push", roundResult);
        }

        result.set("success", true);
        result.set("results", results);
        result.set("reason", reason);
        result.set("rounds", rounds);
        result.set("isHidden", isHidden);
        result.set("isSimple", isSimple);

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("success", false);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

RollResult RollHandler::rollOnce(const std::string& expression, int defaultDice) {
    RollResult result;

    try {
        RD rd(expression, defaultDice);
        int_errno err = rd.Roll();

        result.total = rd.intTotal;
        result.expression = rd.strDice;
        result.detail = rd.FormCompleteString();
        result.errorCode = err;
        result.errorMsg = err != 0 ? getErrorMessage(err) : "";

    } catch (const std::exception& e) {
        result.total = 0;
        result.expression = expression;
        result.detail = "";
        result.errorCode = -1;
        result.errorMsg = std::string("异常: ") + e.what();
    } catch (...) {
        result.total = 0;
        result.expression = expression;
        result.detail = "";
        result.errorCode = -1;
        result.errorMsg = "未知异常";
    }

    return result;
}

} // namespace koidice
