#pragma once
#include <string>
#include <emscripten/val.h>
#include "../types/common_types.h"

namespace koidice {

/**
 * 掷骰处理器
 * 封装所有掷骰相关逻辑
 */
class RollHandler {
public:
    /**
     * 执行掷骰
     * @param expression 掷骰表达式
     * @param reason 掷骰原因
     * @param rounds 掷骰轮数
     * @param isHidden 是否暗骰
     * @param isSimple 是否简化输出
     * @param defaultDice 默认骰子面数
     * @return JS对象，包含掷骰结果
     */
    static emscripten::val roll(
        const std::string& expression,
        const std::string& reason,
        int rounds,
        bool isHidden,
        bool isSimple,
        int defaultDice
    );

    /**
     * 单次掷骰（内部使用）
     */
    static RollResult rollOnce(const std::string& expression, int defaultDice);
};

} // namespace koidice
