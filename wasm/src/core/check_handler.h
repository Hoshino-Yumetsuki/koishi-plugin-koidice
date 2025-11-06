#pragma once
#include <string>
#include <emscripten/val.h>
#include "../types/common_types.h"

namespace koidice {

/**
 * 检定处理器
 * 封装所有技能检定逻辑
 */
class CheckHandler {
public:
    /**
     * 执行技能检定
     * @param skillName 技能名
     * @param skillValue 技能值
     * @param rounds 检定轮数
     * @param bonusDice 奖惩骰数量（正=奖励，负=惩罚）
     * @param difficulty 难度等级
     * @param autoSuccess 是否自动成功
     * @param rule COC房规（0-5）
     * @return JS对象，包含检定结果
     */
    static emscripten::val check(
        const std::string& skillName,
        int skillValue,
        int rounds,
        int bonusDice,
        Difficulty difficulty,
        bool autoSuccess,
        int rule
    );

    /**
     * COC简化检定（兼容旧接口）
     * @param skillValue 技能值
     * @param bonusDice 奖惩骰数量
     * @return JS对象，包含检定结果
     */
    static emscripten::val cocCheck(int skillValue, int bonusDice);

private:
    /**
     * 单次检定
     */
    static CheckRoundResult checkOnce(
        int skillValue,
        int bonusDice,
        bool autoSuccess,
        int rule
    );
};

} // namespace koidice
