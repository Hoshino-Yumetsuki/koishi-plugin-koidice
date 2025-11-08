/**
 * 人物卡解析相关函数
 * 用于解析 COC 输出等格式
 */
#include "dice_character_parse.h"
#include "features/character_parser.h"
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

