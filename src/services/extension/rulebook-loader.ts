import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../index';

/**
 * 加载规则文件（YAML 格式）
 */
export async function loadRulebooks(
  rulebookDir: string,
  pluginName: string,
  pluginRules: Map<string, Record<string, string>>
): Promise<void> {
  logger.debug(`Scanning rulebook directory: ${rulebookDir}`);
  const yaml = await import('js-yaml');
  const files = await fs.readdir(rulebookDir);
  logger.debug(`Found ${files.length} files in rulebook directory`);
  const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  logger.debug(`Found ${yamlFiles.length} YAML files`);

  for (const file of yamlFiles) {
    try {
      const filePath = path.join(rulebookDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const ruleData = yaml.load(content);
      if (!ruleData || typeof ruleData !== 'object' || !('rule' in ruleData) || !('manual' in ruleData)) continue;
      if (typeof ruleData.rule !== 'string' || !ruleData.manual || typeof ruleData.manual !== 'object' || Array.isArray(ruleData.manual)) continue;
      const manual: Record<string, string> = {};
      for (const [key, value] of Object.entries(ruleData.manual)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') manual[key] = String(value);
      }
      pluginRules.set(ruleData.rule, { ...pluginRules.get(ruleData.rule), ...manual });
      logger.info(`Loaded rulebook: ${ruleData.rule} from ${pluginName} with ${Object.keys(manual).length} entries`);
    } catch (error) {
      logger.error(`Error loading rulebook ${file}:`, error);
    }
  }
}
