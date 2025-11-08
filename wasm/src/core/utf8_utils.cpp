#include "utf8_utils.h"
#include <simdutf.h>
#include <algorithm>

namespace koidice {

bool isValidUTF8(const std::string& str) {
    return simdutf::validate_utf8(str.c_str(), str.length());
}

size_t utf8Length(const std::string& str) {
    if (str.empty()) return 0;
    if (!isValidUTF8(str)) return 0;
    return simdutf::count_utf8(str.c_str(), str.length());
}

size_t utf8CharToByte(const std::string& str, size_t charPos) {
    if (str.empty() || !isValidUTF8(str)) return std::string::npos;

    const char* data = str.c_str();
    size_t bytePos = 0;
    size_t currentChar = 0;

    while (bytePos < str.length() && currentChar < charPos) {
        // 获取当前字符的字节长度
        if ((data[bytePos] & 0x80) == 0) {
            // 1-byte character (0xxxxxxx)
            bytePos += 1;
        } else if ((data[bytePos] & 0xE0) == 0xC0) {
            // 2-byte character (110xxxxx)
            bytePos += 2;
        } else if ((data[bytePos] & 0xF0) == 0xE0) {
            // 3-byte character (1110xxxx)
            bytePos += 3;
        } else if ((data[bytePos] & 0xF8) == 0xF0) {
            // 4-byte character (11110xxx)
            bytePos += 4;
        } else {
            // Invalid UTF-8
            return std::string::npos;
        }
        currentChar++;
    }

    return (currentChar == charPos) ? bytePos : std::string::npos;
}

std::string utf8Substr(const std::string& str, size_t charPos, size_t charLen) {
    if (str.empty() || !isValidUTF8(str)) return "";

    size_t totalChars = utf8Length(str);
    if (charPos >= totalChars) return "";

    // 计算实际截取的字符数
    if (charLen == std::string::npos || charPos + charLen > totalChars) {
        charLen = totalChars - charPos;
    }

    if (charLen == 0) return "";

    // 找到起始字节位置
    size_t startByte = utf8CharToByte(str, charPos);
    if (startByte == std::string::npos) return "";

    // 找到结束字节位置
    size_t endByte = utf8CharToByte(str, charPos + charLen);
    if (endByte == std::string::npos) {
        endByte = str.length();
    }

    return str.substr(startByte, endByte - startByte);
}

bool utf8StartsWith(const std::string& str, const std::string& prefix) {
    return str.size() >= prefix.size() &&
           str.compare(0, prefix.size(), prefix) == 0;
}

std::string utf8RemovePrefix(const std::string& str, const std::string& prefix) {
    if (utf8StartsWith(str, prefix)) {
        return str.substr(prefix.size());
    }
    return str;
}

bool isValidAttributeName(const std::string& name) {
    if (name.empty() || !isValidUTF8(name)) return false;

    // 转换为 UTF-32 以便逐字符检查
    size_t expectedLength = simdutf::utf32_length_from_utf8(name.c_str(), name.length());
    std::u32string u32str(expectedLength, 0);

    size_t actualLength = simdutf::convert_utf8_to_utf32(
        name.c_str(),
        name.length(),
        reinterpret_cast<char32_t*>(&u32str[0])
    );

    u32str.resize(actualLength);

    for (char32_t ch : u32str) {
        bool isLetter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
        bool isDigit = (ch >= '0' && ch <= '9');
        bool isChinese = (ch >= 0x4E00 && ch <= 0x9FFF);  // CJK 统一汉字
        bool isUnderscore = (ch == '_');

        if (!isLetter && !isDigit && !isChinese && !isUnderscore) {
            return false;
        }
    }

    return true;
}

} // namespace koidice
