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

/**
 * 规范化属性名
 * @param name 属性名
 * @return 规范化后的属性名
 */
std::string normalizeAttributeName(const std::string& name);
