/**
 * 人物卡解析相关函数
 * 用于解析 COC 输出等格式
 */
#include "dice_character_parse.h"
#include <charconv>
#include <string_view>

/**
 * 解析 COC 输出格式的属性
 * 格式：力量STR=3D6*5=60/30/12 体质CON=3D6*5=40/20/8
 * 提取：力量=60, 体质=40
 */
std::string parseCOCAttributes(const std::string& input) {
    static constexpr std::string_view names[] = {
        "力量", "体质", "体型", "敏捷", "外貌", "智力", "意志", "教育", "幸运"
    };
    std::string json = "{";
    std::string_view rest(input);
    while (!rest.empty()) {
        const auto end = rest.find('\n');
        const auto line = rest.substr(0, end);
        for (const auto name : names) {
            if (line.substr(0, name.size()) != name) continue;
            const auto equals = line.rfind('=');
            if (equals == line.npos) break;
            auto value = line.substr(equals + 1);
            value = value.substr(0, value.find_first_of("/\r"));
            int score;
            const auto parsed = std::from_chars(value.data(), value.data() + value.size(), score);
            if (parsed.ec == std::errc{} && parsed.ptr == value.data() + value.size()) {
                if (json.size() != 1) json += ',';
                json += '"';
                json += name;
                json += "\":";
                json += std::to_string(score);
            }
            break;
        }
        if (end == rest.npos) break;
        rest.remove_prefix(end + 1);
    }
    return json + '}';
}

