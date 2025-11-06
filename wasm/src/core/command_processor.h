#pragma once
#include <string>
#include <emscripten/val.h>
#include "../types/common_types.h"

namespace koidice {

/**
 * 统一命令处理器
 * 负责解析和分发所有骰子命令
 */
class CommandProcessor {
public:
    /**
     * 处理掷骰命令
     * 支持格式：
     * - .r 1d100 原因
     * - .r 3#1d6 伤害
     * - .rh 1d100 （暗骰）
     * - .rs 1d10+3 （简化输出）
     *
     * @param rawCommand 原始命令字符串（不含命令前缀）
     * @param userId 用户ID
     * @param channelId 频道ID（私聊为空）
     * @param isHidden 是否暗骰
     * @param isSimple 是否简化输出
     * @param defaultDice 默认骰子面数
     * @return JS对象，包含 {success, message, results}
     */
    static emscripten::val processRoll(
        const std::string& rawCommand,
        const std::string& userId,
        const std::string& channelId,
        bool isHidden = false,
        bool isSimple = false,
        int defaultDice = 100
    );

    /**
     * 处理技能检定命令
     * 支持格式：
     * - .rc 技能名 成功率
     * - .rc 困难技能名 成功率
     * - .rc 极难技能名 成功率
     * - .rc 3#技能名 成功率
     * - .rc 3#b技能名 成功率 （奖励骰）
     * - .rc 3#p技能名 成功率 （惩罚骰）
     *
     * @param rawCommand 原始命令字符串
     * @param userId 用户ID
     * @param rule COC房规（0-5）
     * @return JS对象，包含检定结果
     */
    static emscripten::val processCheck(
        const std::string& rawCommand,
        const std::string& userId,
        int rule = 0
    );

    /**
     * 处理COC检定命令（简化版）
     * 格式：.coc 技能值 [奖惩骰数量]
     *
     * @param skillValue 技能值
     * @param bonusDice 奖励/惩罚骰数量（正数=奖励，负数=惩罚）
     * @return JS对象，包含检定结果
     */
    static emscripten::val processCOCCheck(
        int skillValue,
        int bonusDice = 0
    );

private:
    // 解析掷骰表达式和原因
    static void parseRollExpression(
        const std::string& input,
        std::string& expression,
        std::string& reason,
        int& rounds,
        int defaultDice
    );

    // 解析检定表达式
    static void parseCheckExpression(
        const std::string& input,
        std::string& skillName,
        int& skillValue,
        int& rounds,
        int& bonusDice,
        Difficulty& difficulty,
        bool& autoSuccess
    );
};

} // namespace koidice
