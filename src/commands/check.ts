import type { Context } from 'koishi';
import type { RegisterCommand } from '../command-scope';
import type { Config } from '../config';
import type { DiceAdapter } from '../wasm';
import { logger } from '../index';
import { CharacterService } from '../services/character-service';
import { getCOCRule } from './settings';
import { GameSessionService } from '../services/game-session-service';
import { getUserNickname } from './nickname';
import { sendHidden } from './observer';
import { recordDiceStatistics } from '../services/character/card-stats';


// Dice! applies multiplication, signed adjustments, then division before difficulty.
const checkArgs = /^(?:(\d+)#)?\s*(?:([bp])(\d*)(?![a-z]))?\s*(_?)\s*(.*)$/iu;
const skillArgs = /^(自动成功)?(简单|困难|极难|极限)?\s*([^\s\d*+\-/=:]*)(?:\*(\d+))?((?:[+-]\d+)*)(?:\/(\d+))?\s*[:=]?\s*(\d+)?(?:\s+(.*))?$/u;

export function registerCheckCommand(
  register: RegisterCommand,
  ctx: Context,
  _config: Config,
  diceAdapter: DiceAdapter
) {
  const characterService = new CharacterService(ctx, diceAdapter);

  for (const hidden of [false, true]) {
  register(hidden ? 'rch [expression:text]' : 'rc [expression:text]', '技能检定', ...(hidden ? ['rah'] : ['ra', 'check']))
    .action(async ({ session }, expression) => {
      if (!session) {
        return '无法获取会话信息';
      }
      if (!session.userId) {
        return '无法获取用户信息';
      }

      if (!expression) {
        return '请指定检定表达式\n格式: .rc [轮数#][难度]技能名 [成功率]\n示例: .rc 困难理智 50';
      }

      try {
        const args = checkArgs.exec(expression.trim());
        if (!args) return '检定表达式无效';
        const [, repeat, mode, bonus, hide, body] = args;
        const isHidden = hidden || !!hide;
        const rounds = Number(repeat ?? 1);
        if (rounds < 1 || rounds > 9 || (mode && (Number(bonus || 1) < 1 || Number(bonus || 1) > 9))) return '检定轮数及奖惩骰数量必须在1-9之间';

        let subject = body;
        let card = await characterService.getActiveCard(session);
        const named = /^([^:\s]+?)(::?|的)(.+)$/u.exec(body);
        if (named && !(named[2] === ':' && /^\d/.test(named[3]))) {
          const selected = await characterService.getCard(session, named[1]);
          if (selected) { card = selected; subject = named[3]; }
          else if (named[2] !== '的') return `人物卡 ${named[1]} 不存在`;
        }
        const parsed = skillArgs.exec(subject.trim());
        if (!parsed) return '检定表达式无效';
        const [, automatic, difficulty, skill, multiple, adjustments, divisor, explicit, reason] = parsed;
        if (!skill && explicit === undefined) return '请指定技能或成功率';
        let base = explicit === undefined ? undefined : Number(explicit);
        if (base === undefined) {
          if (card) {
            const attributes = typeof card.attributes === 'string' ? JSON.parse(card.attributes) : card.attributes;
            const value = attributes[diceAdapter.normalizeAttributeName(skill)];
            if (typeof value === 'number') base = value;
          }
          if (base === undefined && (!card || /^COC[67]$/i.test(card.cardType))) base = diceAdapter.defaultSkillValue(skill);
          if (base === undefined || base < 0) return `未找到技能 ${skill}，请指定成功率或先使用 .st ${skill} <值> 设置`;
        }
        let add = 0;
        for (const [term] of adjustments.matchAll(/[+-]\d+/g)) add += Number(term);
        const rate = Math.trunc(((base * Number(multiple ?? 1) + add) * (difficulty === '简单' ? 2 : 1)) / Number(divisor ?? 1));
        if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1000) return '检定成功率必须在0-1000之间';
        const rule = await getCOCRule(ctx, session);
        const finalExpression = `${rounds}#${mode || ''}${bonus || ''}${automatic || ''}${difficulty === '简单' ? '' : difficulty || ''}检定 ${rate}`;
        const rolls = await new GameSessionService(ctx).drawRouletteBatch(session, Array(rounds).fill(100), diceAdapter);
        const result = rolls.some((value) => value !== undefined)
          ? diceAdapter.processCheckWithRolls(finalExpression, session.userId, rule, rolls.map((value) => value ?? 0))
          : diceAdapter.processCheck(finalExpression, session.userId, rule);

        if (!result.success) {
          return result.errorMsg || '检定失败';
        }
        if (card) {
          const keys = ['fumble', 'failure', 'regularSuccess', 'hardSuccess', 'extremeSuccess', 'criticalSuccess'] as const;
          const stats: Record<string, number> = { totalRolls: result.results.length };
          for (const round of result.results) {
            const key = keys[round.successLevel];
            if (key) stats[key] = (stats[key] || 0) + 1;
            if (!mode) await recordDiceStatistics(ctx, session, card.cardName, card.id, 100, [round.rollValue], { rate: result.finalSkillValue, result: round.rollValue });
          }
          await characterService.updateStats(session, card.cardName, stats);
        }

        // 格式化输出
        const parts = [await getUserNickname(session, ctx), reason, `${skill || '检定'}${multiple ? `*${multiple}` : ''}${adjustments}${divisor ? `/${divisor}` : ''}`].filter(Boolean);

        if (result.rounds === 1) {
          const r = result.results[0];
          if (!r) {
            return '检定失败';
          }
          parts.push(`${r.rollValue}/${result.finalSkillValue}`);
          if (result.difficulty === 2) {
            parts.push('(困难)');
          } else if (result.difficulty === 5) {
            parts.push('(极难)');
          }
          parts.push(r.description);
        } else {
          const roundResults = result.results.map((r: any, i: number) => {
            let str = `#${i + 1} ${r.rollValue}/${result.finalSkillValue}`;
            if (result.difficulty === 2) {
              str += '(困难)';
            } else if (result.difficulty === 5) {
              str += '(极难)';
            }
            str += ` ${r.description}`;
            return str;
          });
          parts.push(roundResults.join(' '));
        }

        const message = parts.join(' ');
        if (isHidden && !session.isDirect && session.guildId) {
          await sendHidden(ctx, session, message);
          return `${parts[0]} 进行了暗中检定`;
        }
        return message;
      } catch (error) {
        logger.error('技能检定错误:', error);
        return '检定时发生错误';
      }
    });
  }
}
