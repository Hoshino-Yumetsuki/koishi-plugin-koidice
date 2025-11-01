#pragma once
#ifndef DICE_WASM_TYPES_H
#define DICE_WASM_TYPES_H

#include <string>
#include <vector>

namespace DiceWasm {

// 掷骰结果结构
struct RollResult {
    int total;              // 总点数
    std::string expression; // 表达式
    std::string detail;     // 详细结果
    int error_code;         // 错误码 (0表示成功)
    std::string error_msg;  // 错误信息
};

// COC检定结果
struct COCCheckResult {
    int roll_value;         // 掷骰值
    int skill_value;        // 技能值
    int success_level;      // 成功等级: 0-大失败, 1-失败, 2-成功, 3-困难成功, 4-极难成功, 5-大成功
    std::string description;// 结果描述
    int error_code;
    std::string error_msg;
};

// 角色卡属性
struct CharacterAttribute {
    std::string name;
    int value;
};

// 牌堆抽取结果
struct DeckDrawResult {
    std::string card;       // 抽到的卡牌
    int remaining;          // 剩余数量
    int error_code;
    std::string error_msg;
};

} // namespace DiceWasm

#endif // DICE_WASM_TYPES_H
