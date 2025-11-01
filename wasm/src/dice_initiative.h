#pragma once
#include <string>
#include <vector>
#include <map>
#include <emscripten/val.h>

// 先攻条目
struct InitiativeEntry {
    std::string name;
    int initiative;
};

// 先攻列表
struct InitiativeList {
    std::vector<InitiativeEntry> entries;
    int currentRound;
    int currentIndex;
};

// 先攻列表管理
emscripten::val addInitiative(const std::string& channelId, const std::string& name, int initiative);
emscripten::val rollInitiative(const std::string& channelId, const std::string& name, int modifier = 0);
bool removeInitiative(const std::string& channelId, const std::string& name);
bool clearInitiative(const std::string& channelId);
emscripten::val nextInitiativeTurn(const std::string& channelId);
std::string getInitiativeList(const std::string& channelId);
int getInitiativeCount(const std::string& channelId);

// 持久化
std::string serializeInitiative(const std::string& channelId);
bool deserializeInitiative(const std::string& channelId, const std::string& jsonStr);
