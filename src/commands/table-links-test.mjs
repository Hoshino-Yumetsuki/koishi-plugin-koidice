// Run with: bun src/commands/table-links-test.mjs
import { strict as assert } from 'node:assert';
import { registerTableLinks, tableChannelCommandsEnabled } from './table-links.ts';

const tables = new Map();
const commands = new Map();
const sent = [];
let middleware;
const ctx = {
  model: { extend(name) { tables.set(name, []); } },
  database: {
    async get(name, query) { return tables.get(name).filter(row => Object.entries(query).every(([k, v]) => row[k] === v)); },
    async create(name, row) { tables.get(name).push({ ...row }); },
    async set(name, query, values) { for (const row of await this.get(name, query)) Object.assign(row, values); },
    async remove(name, query) { tables.set(name, tables.get(name).filter(row => !Object.entries(query).every(([k, v]) => row[k] === v))); },
  },
  middleware(fn) { middleware = fn; },
  $commander: { resolve(name) { return name === 'koidice.roll' ? {} : undefined; } },
};
const register = name => ({ action(fn) { commands.set(name.split(' ')[0], fn); } });
registerTableLinks(register, ctx);
function session(channelId, userId = 'user', admin = false) {
  return { platform: 'test', selfId: 'bot', guildId: channelId, channelId, userId, isDirect: false,
    event: { member: { roles: admin ? [{ id: 'admin' }] : [] }, user: {} },
    bot: { async sendMessage(channel, message) { sent.push(channel + ':' + String(message)); } } };
}
const a = session('a', 'admin', true), b = session('b', 'admin', true), user = session('a');
const command = (s, name, ...args) => commands.get(name)({ session: s }, ...args);
const message = async (s, content, elements = [{ type: 'text' }]) => {
  s.content = content; s.elements = elements;
  await middleware(s, async () => {});
};
await command(a, 'link', 'with', 'gb');
await command(user, 'link', 'optin');
await message(user, 'hello');
assert.equal(sent.length, 0);
await command(b, 'link', 'with', 'ga');
await message(user, 'hello');
assert.equal(sent.length, 1);
await message(session('a', 'other'), 'hello');
await message(user, '.r 1d20');
await message(user, '．rh 私下调查');
await message(user, 'koidice.roll');
await message(user, 'hello', [{ type: 'at' }]);
await message(user, 'password 123');
await message(user, '[链接消息] hello');
await message({ ...user, isDirect: true }, 'hello');
assert.equal(sent.length, 1);
await command(user, 'link', 'optout');
await message(user, 'hello');
assert.equal(sent.length, 1);
await command(user, 'link', 'say', 'hello');
assert.equal(sent.length, 2);
await command(b, 'link', 'close');
await command(user, 'link', 'say', 'hello');
assert.equal(sent.length, 2);
await command(a, 'chan', 'off');
assert.equal(await tableChannelCommandsEnabled(ctx, a), false);
await command(a, 'chan', 'on');
assert.equal(await tableChannelCommandsEnabled(ctx, a), true);
