import type { Context } from 'koishi';
import type { RegisterCommand } from '../../command-scope';
import type { DiceAdapter } from '../../wasm';
import type { ExtensionService } from '../../services/extension-service';
import { CharacterService } from '../../services/character-service';
import { getUserKey, serializeCharacterUpdate } from '../../services/character';

export function registerPcTemplateCommands(register: RegisterCommand, ctx: Context, adapter: DiceAdapter, extensions?: ExtensionService) {
  const cards = new CharacterService(ctx, adapter);

  register('pc.type [type:text]', '查看或设置人物卡模板').action(async ({ session }, type) => {
    if (!session) return '无法获取会话信息喵~';
    const card = await cards.getBoundCard(session);
    if (!card) return '当前没有绑定人物卡';
    const name = type?.trim();
    if (!name) return `模板类: ${card.cardType}`;
    const selected = /^COC[67]$/i.test(name) ? name.toUpperCase() : extensions?.getTemplate(name)?.name;
    if (!selected) return `未知人物卡模板: ${name}`;
    const { userId, platform } = getUserKey(session);
    await serializeCharacterUpdate(ctx, session, () => ctx.database.set('koidice_character',
      { userId, platform, cardName: card.cardName }, { cardType: selected, updatedAt: new Date() }).then(() => undefined));
    return `已将人物卡 ${card.cardName} 的模板设为 ${selected}`;
  });

  register('pc.temp', '查看人物卡模板').action(async ({ session }) => {
    if (!session) return '无法获取会话信息喵~';
    const card = await cards.getBoundCard(session);
    if (!card) return '当前没有绑定人物卡';
    const template = extensions?.getTemplate(card.cardType);
    const properties = template?.properties.map(property => property.name) ?? [];
    return `pc模板:${card.cardType}${properties.length ? `\n预设属性:${properties.join('/')}` : ''}`;
  });

  register('pc.tojson [cardName:text]', '导出人物卡 JSON').action(async ({ session }, cardName) => {
    if (!session) return '无法获取会话信息喵~';
    const card = cardName?.trim() ? await cards.getCard(session, cardName.trim()) : await cards.getBoundCard(session);
    if (!card) return cardName?.trim() ? `人物卡 ${cardName.trim()} 不存在喵~` : '当前没有绑定人物卡';
    const attributes = JSON.parse(card.attributes);
    return JSON.stringify({ ...attributes, __Name: card.cardName, __Type: card.cardType });
  });
}
