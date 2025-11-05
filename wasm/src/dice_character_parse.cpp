/**
 * 人物卡解析相关函数
 * 用于解析 COC 输出等格式
 */
#include "dice_character_parse.h"
#include <regex>
#include <sstream>
#include <map>

/**
 * 解析 COC 输出格式的属性
 * 格式：力量STR=3D6*5=60/30/12 体质CON=3D6*5=40/20/8
 * 提取：力量=60, 体质=40
 */
std::string parseCOCAttributes(const std::string& input) {
    // 简单返回空 JSON，不做任何解析
    return "{}";
}

/**
 * 规范化属性名
 * 将英文缩写转换为中文全名
 */
std::string normalizeAttributeName(const std::string& name) {
    static const std::map<std::string, std::string> aliases = {
        {"str", "力量"}, {"strength", "力量"},
        {"con", "体质"}, {"constitution", "体质"},
        {"siz", "体型"}, {"size", "体型"},
        {"dex", "敏捷"}, {"dexterity", "敏捷"},
        {"app", "外貌"}, {"appearance", "外貌"},
        {"int", "智力"}, {"intelligence", "智力"},
        {"pow", "意志"}, {"power", "意志"},
        {"edu", "教育"}, {"education", "教育"},
        {"luck", "幸运"}, {"luk", "幸运"},
        {"san", "理智"}, {"sanity", "理智"},
        {"hp", "生命"}, {"mp", "魔法"},
        {"db", "伤害加值"}, {"mov", "移动力"}, {"move", "移动力"}
    };
    
    // 转换为小写
    std::string lower = name;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    
    auto it = aliases.find(lower);
    if (it != aliases.end()) {
        return it->second;
    }
    
    return name;
}
