#pragma once
#include <string>
#include <vector>

namespace koidice {

/**
 * 查询规则（返回字符串）
 */
std::string queryRule(const std::string& key);

/**
 * 按系统查询规则
 */
std::string queryRuleBySystem(const std::string& system, const std::string& key);

/**
 * 列出所有规则关键词
 */
std::vector<std::string> listRuleKeys();

/**
 * 列出指定系统的规则
 */
std::vector<std::string> listRulesBySystem(const std::string& system);

} // namespace koidice
