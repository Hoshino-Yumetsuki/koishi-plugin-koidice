#include "character_parser.h"
#include "../core/utils.h"
#include "../core/utf8_utils.h"
#include <regex>
#include <algorithm>
#include <cctype>
#include <sstream>
#include <emscripten/val.h>

namespace koidice {

std::string normalizeAttributeName(const std::string& name) {
    const auto key = trim(name);
    // These keys are stored in Koishi cards (including cards from custom templates).
    // Do not apply the entire COC skill table: e.g. 体力 may be distinct from 生命.
    static const dict_ci<> extra = {
        {"strength", "力量"}, {"constitution", "体质"}, {"size", "体型"},
        {"dexterity", "敏捷"}, {"appearance", "外貌"}, {"intelligence", "智力"},
        {"power", "意志"}, {"education", "教育"}, {"sanity", "理智"},
        {"生命值", "生命"}, {"魔法值", "魔法"}, {"db", "伤害加值"},
        {"伤害奖励", "伤害加值"}, {"move", "移动力"}, {"灵感", "智力"}, {"侦查", "侦察"}
    };
    if (const auto it = extra.find(key); it != extra.end()) return it->second;
    if (const auto it = SkillNameReplace.find(key); it != SkillNameReplace.end()) {
        // Only the built-in attribute abbreviations are shared across card types.
        static const std::unordered_set<std::string> attributes = {
            "力量", "体质", "体型", "敏捷", "外貌", "智力", "意志", "教育", "幸运", "理智", "生命", "魔法", "移动力"
        };
        if (!key.empty() && static_cast<unsigned char>(key.front()) < 128 && attributes.count(it->second)) return it->second;
    }
    return name;
}

emscripten::val parseStCommand(const std::string& input) {
    std::string text = trim(input);
    std::string cardName;
    std::vector<AttributeOperation> operations;

    // 解析人物卡名称（格式：名称--属性 值）
    std::regex cardRegex(R"(^(.+?)--(.+)$)");
    std::smatch match;

    if (std::regex_match(text, match, cardRegex)) {
        cardName = trim(match[1].str());
        text = trim(match[2].str());
    }

    // 按空格分割
    std::vector<std::string> parts;
    std::istringstream iss(text);
    std::string part;
    while (iss >> part) {
        if (!part.empty()) {
            parts.push_back(part);
        }
    }

    // 简单的"属性名 值"配对解析
    for (size_t i = 0; i + 1 < parts.size(); i += 2) {
        const std::string& attrName = parts[i];
        const std::string& valueStr = parts[i + 1];

        // 验证属性名
        if (!isValidAttributeName(attrName)) {
            continue;
        }

        // 解析数值
        try {
            int value = std::stoi(valueStr);
            operations.push_back({
                normalizeAttributeName(attrName),
                "set",
                value
            });
        } catch (...) {
            // 忽略无效数值
            continue;
        }
    }

    // 转换为 JS 对象
    emscripten::val result = emscripten::val::object();

    if (!cardName.empty()) {
        result.set("cardName", cardName);
    }

    emscripten::val jsOperations = emscripten::val::array();
    for (size_t i = 0; i < operations.size(); ++i) {
        emscripten::val op = emscripten::val::object();
        op.set("attr", operations[i].attr);
        op.set("op", operations[i].op);
        op.set("value", operations[i].value);
        jsOperations.set(i, op);
    }
    result.set("operations", jsOperations);

    return result;
}

emscripten::val parseAttributeList(const std::string& input) {
    std::string text = trim(input);
    std::string cardName;
    std::vector<std::string> attributes;

    // 解析人物卡名称（格式：名称--属性1 属性2）
    std::regex cardRegex(R"(^(.+?)--(.+)$)");
    std::smatch match;

    if (std::regex_match(text, match, cardRegex)) {
        cardName = trim(match[1].str());
        text = trim(match[2].str());
    }

    // 分割属性名
    std::istringstream iss(text);
    std::string attr;
    while (iss >> attr) {
        if (!attr.empty()) {
            attributes.push_back(normalizeAttributeName(attr));
        }
    }

    // 转换为 JS 对象
    emscripten::val result = emscripten::val::object();

    if (!cardName.empty()) {
        result.set("cardName", cardName);
    }

    emscripten::val jsAttributes = emscripten::val::array();
    for (size_t i = 0; i < attributes.size(); ++i) {
        jsAttributes.set(i, attributes[i]);
    }
    result.set("attributes", jsAttributes);

    return result;
}

} // namespace koidice
