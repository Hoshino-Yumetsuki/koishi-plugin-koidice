/**
 * 人物卡解析相关函数头文件
 */
#pragma once
#include <string>

/**
 * 解析 COC 输出格式的属性
 * @param input COC 输出字符串
 * @return JSON 格式的属性对象
 */
std::string parseCOCAttributes(const std::string& input);

