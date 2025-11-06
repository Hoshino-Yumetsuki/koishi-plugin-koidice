#pragma once
#include <string>

namespace koidice {

// 角色生成功能
std::string generateCOC7Character();
std::string generateCOC6Character();
std::string generateCOC7CharacterDetailed();
std::string generateCOC6CharacterDetailed();
std::string generateCOC7Multiple(int count);
std::string generateCOC6Multiple(int count);
std::string generateDNDCharacter(int count = 1);

} // namespace koidice
