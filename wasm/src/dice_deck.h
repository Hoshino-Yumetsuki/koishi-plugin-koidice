#pragma once
#include <string>
#include <emscripten/val.h>

// 牌堆功能（使用 Dice! CardDeck）
emscripten::val drawFromDeck(const std::string& deckName, int count = 1);
std::string listDecks();
int getDeckSize(const std::string& deckName);
bool deckExists(const std::string& deckName);
