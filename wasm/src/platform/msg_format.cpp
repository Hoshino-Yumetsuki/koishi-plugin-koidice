#include "MsgFormat.h"
#include "StrExtern.hpp"
#include <cctype>

string strip(std::string origin)
{
    while (true) {
        if (origin[0] == '!' || origin[0] == '.' || isspace(static_cast<unsigned char>(origin[0]))) {
            origin.erase(origin.begin());
        } else if (auto dot{ origin.substr(0, 3) }; dot == "！" || dot == "。" || dot == "．") {
            origin.erase(origin.begin(), origin.begin() + 3);
        } else return origin;
    }
}

std::string to_binary(int b)
{
    ResList res;
    for (int i = 0; i < 14; i++) {
        if (b & (1 << i)) res << std::to_string(i);
    }
    return res.dot("+").show();
}

unsigned int ResList::intPageLen = 512;
ResList& ResList::operator<<(std::string s) {
    while (isspace(static_cast<unsigned char>(s[0]))) s.erase(s.begin());
    if (s.empty()) return *this;
    if (isOrder) s = to_string(vRes.size() + 1) + ". " + s;
    vRes.push_back(s);
    if (size_t len = wstrlen(s.c_str()); len > intMaxLen) intMaxLen = len;
    return *this;
}
std::string ResList::show(size_t limPage) const {
    if (empty()) return {};
    std::string s, strHead, strSepa;
    unsigned int lenPage(0), cntPage(0), lenItem(0);
    if (intMaxLen > intLineLen || isLineBreak) {
        strHead = sHead + "\n";
        strSepa = strLongSepa;
    } else {
        strSepa = sDot;
    }
    for (auto it = vRes.begin(); it != vRes.end(); it++) {
        lenItem = wstrlen(it->c_str());
        if (lenPage + lenItem > intPageLen && !s.empty()) {
            if (limPage && limPage <= cntPage + 1) return s;
            if (cntPage++ == 0) s = "\f[第" + std::to_string(cntPage++) + "页]" + (strHead.empty() ? "\n" : "") + s;
            s += "\f[第" + std::to_string(cntPage) + "页]\n" + *it;
            lenPage = 0;
        } else if (it == vRes.begin()) s = strHead + *it;
        else s += strSepa + *it;
        lenPage += lenItem;
    }
    return s;
}

std::string listDeck(const std::vector<std::string>& v)
{
    ResList list;
    list.setDot(" | ", "\n| ");
    for (auto& val : v) list << val;
    return list.show();
}
std::string listDeck(const VarArray& v)
{
    ShowList list;
    for (auto& val : v) list << val;
    return list.show("\n|");
}
