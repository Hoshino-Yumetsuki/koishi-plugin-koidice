#include "deck.h"
#include "../core/utils.h"
#include "../../../Dice/Dice/CardDeck.h"
#include "../../../Dice/Dice/RandomGenerator.h"
#include <sstream>
#include <algorithm>
#include <map>

using namespace emscripten;

namespace koidice {

// 解析牌堆项目，提取权重和内容
struct DeckItem {
    std::string content;
    int weight;
};

std::vector<DeckItem> parseDeckItems(const std::vector<std::string>& deck) {
    std::vector<DeckItem> items;

    for (const auto& str : deck) {
        DeckItem item;
        item.weight = 1; // 默认权重为1

        // 检查是否有权重标记 ::权重::内容
        size_t l = str.find("::");
        size_t r = (l != std::string::npos) ? str.find("::", l + 2) : std::string::npos;

        if (l != std::string::npos && r != std::string::npos) {
            try {
                std::string weightStr = str.substr(l + 2, r - l - 2);
                // 尝试解析权重（可能是表达式）
                std::string resolvedWeight = CardDeck::draw(weightStr);
                if (resolvedWeight.length() <= 6) {
                    int w = std::stoi(resolvedWeight);
                    if (w > 0) {
                        item.weight = w;
                        item.content = str.substr(r + 2);
                    } else {
                        item.content = str;
                    }
                } else {
                    item.content = str;
                }
            } catch (...) {
                item.content = str;
            }
        } else {
            item.content = str;
        }

        items.push_back(item);
    }

    return items;
}

val drawFromDeck(const std::string& deckName, int count) {
    // 直接使用洗牌算法，确保最大随机性
    return shuffleDeck(deckName, count);
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
    try {
        if (CardDeck::mPublicDeck.count(deckName)) {
            return static_cast<int>(CardDeck::mPublicDeck[deckName].size());
        }

        if (CardDeck::mExternPublicDeck.count(deckName)) {
            return static_cast<int>(CardDeck::mExternPublicDeck[deckName].size());
        }

        return -1;
    } catch (...) {
        return -1;
    }
}

bool deckExists(const std::string& deckName) {
    return CardDeck::findDeck(deckName) >= 0;
}

// 支持权重的洗牌算法（Fisher-Yates 改进版）
val shuffleDeck(const std::string& deckName, int count) {
    ensureRandomInit();
    val result = val::object();

    try {
        // 检查牌堆是否存在
        if (CardDeck::mPublicDeck.count(deckName) == 0 &&
            CardDeck::mExternPublicDeck.count(deckName) == 0) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 不存在");
            result.set("cards", val::array());
            return result;
        }

        // 获取牌堆
        std::vector<std::string> sourceDeck;
        if (CardDeck::mPublicDeck.count(deckName)) {
            sourceDeck = CardDeck::mPublicDeck[deckName];
        } else {
            sourceDeck = CardDeck::mExternPublicDeck[deckName];
        }

        if (sourceDeck.empty()) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 为空");
            result.set("cards", val::array());
            return result;
        }

        // 解析牌堆项目（提取权重）
        std::vector<DeckItem> items = parseDeckItems(sourceDeck);

        // 根据权重展开牌堆（每个权重为n的牌变成n张）
        std::vector<std::string> expandedDeck;
        for (const auto& item : items) {
            for (int i = 0; i < item.weight; i++) {
                expandedDeck.push_back(item.content);
            }
        }

        if (expandedDeck.empty()) {
            result.set("success", false);
            result.set("message", "牌堆 " + deckName + " 展开后为空");
            result.set("cards", val::array());
            return result;
        }

        // 确定抽取数量
        int drawCount = count;

        // count <= 0 表示抽取全部
        if (drawCount <= 0) {
            drawCount = static_cast<int>(expandedDeck.size());
        }

        // 限制最大抽取数量
        if (drawCount > static_cast<int>(expandedDeck.size())) {
            drawCount = static_cast<int>(expandedDeck.size());
        }

        if (drawCount > 100) {
            result.set("success", false);
            result.set("message", "抽取数量过大，最多100张");
            result.set("cards", val::array());
            return result;
        }

        // Fisher-Yates 洗牌算法（使用 JavaScript 加密随机数）
        // 从后向前遍历，每次随机选择一个位置与当前位置交换
        for (int i = expandedDeck.size() - 1; i > 0; i--) {
            int j = getSecureRandomInt(0, i);
            std::swap(expandedDeck[i], expandedDeck[j]);
        }

        // 取前 drawCount 张牌
        std::vector<std::string> drawnCards;
        for (int i = 0; i < drawCount; i++) {
            // 解析嵌套牌堆引用
            std::string card = CardDeck::draw(expandedDeck[i]);
            drawnCards.push_back(card);
        }

        // 转换为 JavaScript 数组
        val jsCards = val::array();
        for (size_t i = 0; i < drawnCards.size(); i++) {
            jsCards.set(i, drawnCards[i]);
        }

        result.set("success", true);
        result.set("message", "");
        result.set("cards", jsCards);
        result.set("totalCards", static_cast<int>(expandedDeck.size()));

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

} // namespace koidice
