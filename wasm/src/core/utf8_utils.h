#pragma once
#include <string>
#include <vector>

namespace koidice {

// UTF-8 验证
bool isValidUTF8(const std::string& str);

// 获取 UTF-8 字符数量（字符数，非字节数）
size_t utf8Length(const std::string& str);

// 安全的字符串截取（按字符而非字节）
// charPos: 字符起始位置
// charLen: 要截取的字符数，npos 表示到末尾
std::string utf8Substr(const std::string& str, size_t charPos, size_t charLen = std::string::npos);

// 检查字符串是否以指定前缀开始（UTF-8 安全）
bool utf8StartsWith(const std::string& str, const std::string& prefix);

// 移除前缀（UTF-8 安全）
// 如果 str 以 prefix 开头，返回移除后的字符串；否则返回原字符串
std::string utf8RemovePrefix(const std::string& str, const std::string& prefix);

// 验证属性名（仅允许字母、数字、中文、下划线）
bool isValidAttributeName(const std::string& name);

// 获取字符串中第 N 个字符的字节位置
// 返回 std::string::npos 表示越界
size_t utf8CharToByte(const std::string& str, size_t charPos);

} // namespace koidice
