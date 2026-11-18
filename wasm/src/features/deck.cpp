#include "deck.h"
#include "../../../Dice/Dice/CardDeck.h"
#include "DiceSession.h"
#include <sstream>

using namespace emscripten;

namespace koidice {

static const std::vector<std::string>* findPublicDeck(const std::string& name) {
    const auto builtin = CardDeck::mPublicDeck.find(name);
    if (builtin != CardDeck::mPublicDeck.end()) return &builtin->second;
    const auto external = CardDeck::mExternPublicDeck.find(name);
    return external == CardDeck::mExternPublicDeck.end() ? nullptr : &external->second;
}

std::string listDecks() {
    try {
        std::ostringstream oss;
        oss << "=== 可用牌堆 ===" << std::endl;

        bool hasDecks = false;
        for (const auto& [name, deck] : CardDeck::mPublicDeck) {
            oss << "- " << name << " (" << deck.size() << "张)" << std::endl;
            hasDecks = true;
        }

        for (const auto& [name, deck] : CardDeck::mExternPublicDeck) {
            oss << "- " << name << " [扩展] (" << deck.size() << "张)" << std::endl;
            hasDecks = true;
        }

        if (!hasDecks) {
            return "没有可用的牌堆";
        }

        return oss.str();
    } catch (...) {
        return "获取牌堆列表失败";
    }
}

int getDeckSize(const std::string& deckName) {
    const auto* deck = findPublicDeck(deckName);
    return deck ? static_cast<int>(deck->size()) : -1;
}

bool deckExists(const std::string& deckName) {
    return findPublicDeck(deckName) != nullptr;
}

val getPublicDeck(const std::string& deckName) {
    const auto* deck = findPublicDeck(deckName);
    if (!deck) return val::null();
    val cards = val::array();
    for (size_t i = 0; i < deck->size(); ++i) cards.set(i, (*deck)[i]);
    return cards;
}

bool isBuiltinDeck(const std::string& deckName) {
    return CardDeck::mPublicDeck.count(deckName) != 0;
}

std::string resolveDeckCard(const std::string& card) {
    return CardDeck::draw(card);
}

static val drawPublicDeck(const std::string& deckName, int count, size_t limit) {
    val result = val::object();

    try {
        const auto* source = findPublicDeck(deckName);
        if (!source) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 不存在");
            result.set("cards", val::array());
            return result;
        }

        if (source->empty()) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 为空");
            result.set("cards", val::array());
            return result;
        }

        DeckInfo deck(*source);
        const auto size = deck.sizRes;
        const auto drawCount = count <= 0 ? size : std::min(size, static_cast<size_t>(count));
        if (drawCount > limit) {
            result.set("success", false);
            result.set("message", "抽取数量过大，最多" + std::to_string(limit) + "张");
            result.set("cards", val::array());
            return result;
        }

        val jsCards = val::array();
        for (size_t i = 0; i < drawCount; ++i) jsCards.set(i, deck.draw());

        result.set("success", true);
        result.set("message", "");
        result.set("cards", jsCards);
        result.set("totalCards", size);

    } catch (const std::exception& e) {
        result.set("success", false);
        result.set("message", std::string("异常: ") + e.what());
        result.set("cards", val::array());
    } catch (...) {
        result.set("success", false);
        result.set("message", "未知异常");
        result.set("cards", val::array());
    }

    return result;
}

val drawFromDeck(const std::string& deckName, int count) {
    return drawPublicDeck(deckName, count, 1024);
}

val shuffleDeck(const std::string& deckName, int count) {
    return drawPublicDeck(deckName, count, 100);
}

} // namespace koidice
