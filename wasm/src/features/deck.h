#pragma once
#include <string>
#include <vector>
#include <emscripten/val.h>

namespace koidice {

// 牌堆功能（使用 Dice! CardDeck）
emscripten::val drawFromDeck(const std::string& deckName, int count = 1);
std::string listDecks();
int getDeckSize(const std::string& deckName);
bool deckExists(const std::string& deckName);

// 支持权重的洗牌算法
emscripten::val shuffleDeck(const std::string& deckName, int count = -1);

} // namespace koidice
