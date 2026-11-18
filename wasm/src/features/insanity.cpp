#include "insanity.h"
#include "../core/utils.h"
#include "../../../Dice/Dice/RDConstant.h"
#include "../../../Dice/Dice/RD.h"
#include <cstring>
#include <memory>
#include <map>
#include "../../../Dice/Dice/DiceAttrVar.h"
#include <algorithm>

using namespace emscripten;

namespace koidice {


std::string getTempInsanity(int index) {
    if (index < 1 || index > 10) {
        return "索引超出范围";
    }
    return TempInsanity[index];
}

std::string getLongInsanity(int index) {
    if (index < 1 || index > 10) {
        return "索引超出范围";
    }
    return LongInsanity[index];
}

std::string getPhobia(int index) {
    if (index < 1 || index >= std::size(strFear)) {
        return "未知恐惧症";
    }
    return strFear[index];
}

std::string getMania(int index) {
    if (index < 1 || index >= std::size(strPanic)) {
        return "未知躁狂症";
    }
    return strPanic[index];
}

val generateInsanity(bool temporary) {
    ensureRandomInit();
    AnysTable vars;
    if (temporary) TempInsane(vars);
    else LongInsane(vars);

    const std::string response = vars.get_str("res");
    const std::string duration = vars.get_str("dur");
    const std::string detailRoll = vars.get_str("detail_roll");
    val result = val::object();
    result.set("symptom", response.substr(response.find("\n症状: ") + std::string("\n症状: ").size()));
    result.set("duration", duration.substr(duration.find('=') + 1));
    result.set("detailRoll", detailRoll.empty() ? "" : "1d100=" + detailRoll.substr(detailRoll.find('=') + 1));
    result.set("detail", vars.get_str("detail"));
    return result;
}

val sanityCheckWithRule(int currentSan, const std::string& successLoss, const std::string& failureLoss, int rule, int suppliedRoll) {
    ensureRandomInit();
    val result = val::object();

    try {
        if (currentSan <= 0) {
            result.set("rollValue", 0);
            result.set("successLevel", 0);
            result.set("sanLoss", 0);
            result.set("lossDetail", "");
            result.set("newSan", currentSan);
            result.set("errorCode", -1);
            result.set("errorMsg", "SAN值无效，必须大于0");
            return result;
        }

        RD rd("1d100", 100);
        int_errno err = suppliedRoll > 0 ? 0 : rd.Roll();
        if (err != 0) {
            result.set("rollValue", 0);
            result.set("successLevel", 0);
            result.set("sanLoss", 0);
            result.set("lossDetail", "");
            result.set("newSan", currentSan);
            result.set("errorCode", err);
            result.set("errorMsg", getErrorMessage(err));
            return result;
        }

        int rollValue = suppliedRoll > 0 ? suppliedRoll : rd.intTotal;
        int successLevel = static_cast<int>(RollSuccessLevel(rollValue, currentSan, rule));

        // 根据成功等级计算理智损失
        int sanLoss = 0;
        std::string lossDetail;
        std::string lossExpr;

        if (successLevel == 0) {
            // 大失败 - 取失败损失的最大值
            lossExpr = failureLoss;
            RD maxLossRd(lossExpr, 100);
            err = maxLossRd.Max();
            if (err != 0) {
                result.set("errorCode", err);
                result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
                return result;
            }
            sanLoss = maxLossRd.intTotal;
            lossDetail = "Max{" + failureLoss + "}=" + std::to_string(sanLoss);
        } else if (successLevel == 1) {
            // 失败 - 掷失败损失骰
            lossExpr = failureLoss;
            RD lossRd(lossExpr, 100);
            err = lossRd.Roll();
            if (err != 0) {
                result.set("rollValue", rollValue);
                result.set("successLevel", successLevel);
                result.set("sanLoss", 0);
                result.set("lossDetail", "");
                result.set("newSan", currentSan);
                result.set("errorCode", err);
                result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
                return result;
            }
            sanLoss = lossRd.intTotal;
            lossDetail = lossRd.FormShortString();
        } else {
            // 成功 (包括困难成功、极难成功、大成功) - 掷成功损失骰
            lossExpr = successLoss;
            RD lossRd(lossExpr, 100);
            err = lossRd.Roll();
            if (err != 0) {
                result.set("rollValue", rollValue);
                result.set("successLevel", successLevel);
                result.set("sanLoss", 0);
                result.set("lossDetail", "");
                result.set("newSan", currentSan);
                result.set("errorCode", err);
                result.set("errorMsg", "损失表达式错误: " + getErrorMessage(err));
                return result;
            }
            sanLoss = lossRd.intTotal;
            lossDetail = lossRd.FormShortString();
        }

        int newSan = std::max(0, currentSan - sanLoss);

        result.set("rollValue", rollValue);
        result.set("successLevel", successLevel);
        result.set("sanLoss", sanLoss);
        result.set("lossDetail", lossDetail);
        result.set("newSan", newSan);
        result.set("errorCode", 0);
        result.set("errorMsg", "");

    } catch (const std::exception& e) {
        result.set("rollValue", 0);
        result.set("successLevel", 0);
        result.set("sanLoss", 0);
        result.set("lossDetail", "");
        result.set("newSan", currentSan);
        result.set("errorCode", -1);
        result.set("errorMsg", std::string("异常: ") + e.what());
    } catch (...) {
        result.set("rollValue", 0);
        result.set("successLevel", 0);
        result.set("sanLoss", 0);
        result.set("lossDetail", "");
        result.set("newSan", currentSan);
        result.set("errorCode", -1);
        result.set("errorMsg", "未知异常");
    }

    return result;
}

val sanityCheck(int currentSan, const std::string& successLoss, const std::string& failureLoss) {
    return sanityCheckWithRule(currentSan, successLoss, failureLoss, 0, 0);
}

} // namespace koidice
