#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "../core/command_processor.h"
#include "../core/utils.h"
#include "../features/character.h"
#include "../features/insanity.h"
#include "../features/initiative.h"
#include "../features/deck.h"
#include "../features/rule.h"
#include "../../../Dice/Dice/RD.h"

using namespace emscripten;
using namespace koidice;

// 导入features命名空间的函数
using koidice::generateCOC7Character;
using koidice::generateCOC6Character;
using koidice::generateCOC7CharacterDetailed;
using koidice::generateCOC6CharacterDetailed;
using koidice::generateCOC7Multiple;
using koidice::generateCOC6Multiple;
using koidice::generateDNDCharacter;
using koidice::getTempInsanity;
using koidice::getLongInsanity;
using koidice::getPhobia;
using koidice::getMania;
using koidice::sanityCheck;
using koidice::addInitiative;
using koidice::rollInitiative;
using koidice::removeInitiative;
using koidice::clearInitiative;
using koidice::nextInitiativeTurn;
using koidice::getInitiativeList;
using koidice::getInitiativeCount;
using koidice::serializeInitiative;
using koidice::deserializeInitiative;
using koidice::drawFromDeck;
using koidice::listDecks;
using koidice::getDeckSize;
using koidice::deckExists;
using koidice::queryRule;
using koidice::queryRuleBySystem;
using koidice::listRuleKeys;
using koidice::listRulesBySystem;

// ============ 工具函数 ============

bool initialize() {
    try {
        ensureRandomInit();
        return true;
    } catch (...) {
        return false;
    }
}

std::string getVersion() {
    return "1.0.0"; // 从version.h读取
}

// ============ Emscripten绑定 ============

EMSCRIPTEN_BINDINGS(dice_module) {
    // === 核心命令处理 ===
    function("processRoll", &CommandProcessor::processRoll);
    function("processCheck", &CommandProcessor::processCheck);
    function("processCOCCheck", &CommandProcessor::processCOCCheck);
    
    // === 角色生成 ===
    function("generateCOC7Character", &generateCOC7Character);
    function("generateCOC6Character", &generateCOC6Character);
    function("generateCOC7CharacterDetailed", &generateCOC7CharacterDetailed);
    function("generateCOC6CharacterDetailed", &generateCOC6CharacterDetailed);
    function("generateCOC7Multiple", &generateCOC7Multiple);
    function("generateCOC6Multiple", &generateCOC6Multiple);
    function("generateDNDCharacter", &generateDNDCharacter);
    
    // === 理智检定 ===
    function("sanityCheck", &sanityCheck);
    function("getTempInsanity", &getTempInsanity);
    function("getLongInsanity", &getLongInsanity);
    function("getPhobia", &getPhobia);
    function("getMania", &getMania);
    
    // === 先攻系统 ===
    function("addInitiative", &addInitiative);
    function("rollInitiative", &rollInitiative);
    function("removeInitiative", &removeInitiative);
    function("clearInitiative", &clearInitiative);
    function("nextInitiativeTurn", &nextInitiativeTurn);
    function("getInitiativeList", &getInitiativeList);
    function("getInitiativeCount", &getInitiativeCount);
    function("serializeInitiative", &serializeInitiative);
    function("deserializeInitiative", &deserializeInitiative);
    
    // === 牌堆系统 ===
    function("drawFromDeck", &drawFromDeck);
    function("listDecks", &listDecks);
    function("getDeckSize", &getDeckSize);
    function("deckExists", &deckExists);
    
    // === 规则查询 ===
    function("queryRule", &queryRule);
    function("queryRuleBySystem", &queryRuleBySystem);
    function("listRuleKeys", &listRuleKeys);
    function("listRulesBySystem", &listRulesBySystem);
    
    // === 工具函数 ===
    function("initialize", &initialize);
    function("getVersion", &getVersion);
    
    // === 注册容器 ===
    register_vector<std::string>("VectorString");
}
