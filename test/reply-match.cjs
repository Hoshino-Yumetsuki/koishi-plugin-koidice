const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, cp, rm, appendFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { App } = require('koishi');
const memory = require('@koishijs/plugin-database-memory').default;
const mock = require('@koishijs/plugin-mock').default;
const plugin = require('../lib/index.cjs');

for (const diceStyleCommands of [false, true]) {
  test(`safe reply matching (${diceStyleCommands ? 'Dice' : 'Koishi'})`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'koidice-reply-'));
    const app = new App({ prefix: ['/'], delay: { message: 0 } });
    app.baseDir = dir;
    t.after(async () => {
      try { await app.stop(); } finally { await rm(dir, { recursive: true, force: true }); }
    });
    const plugins = join(dir, 'data', 'koidice', 'plugins');
    await mkdir(plugins, { recursive: true });
    await cp(join(__dirname, '../src/services/extension/fixtures/parity'), join(plugins, 'parity'), { recursive: true });
    await appendFile(join(plugins, 'parity', 'reply', 'commands.toml'), `\n[reply.safe_regex]\ntype = "Reply"\nkeyword.regex = 'local[0-9]+'\necho = 'local regex'\n\n[reply.invalid_regex]\ntype = "Reply"\nkeyword.regex = '(?=unsafe)'\necho = 'must not match'\n`);
    app.plugin(memory);
    app.plugin(mock);
    app.plugin(plugin, { diceStyleCommands });
    await app.start();
    await app.mock.initChannel('room');
    await app.mock.initUser('101', 4);
    await app.mock.initUser('102', 1);
    const gm = app.mock.client('101', 'room');
    const player = app.mock.client('102', 'room');
    gm.event.member = { roles: [{ id: 'admin' }] };
    const prefix = diceStyleCommands ? '.' : '/koid.';
    const send = async (message, client = gm) => (await client.receive(prefix + message)).join('\n');

    assert.match(await send('reply re cat[0-9]+ regex'), /已设置/);
    assert.deepEqual(await gm.receive('CAT42'), ['regex']);
    assert.deepEqual(await gm.receive('xcat42'), []);
    assert.match(await send('reply cat42 exact'), /已设置/);
    assert.deepEqual(await gm.receive('cat42'), ['exact']);
    assert.match(await send('reply del cat42'), /已删除/);
    assert.deepEqual(await gm.receive('cat42'), ['regex']);
    assert.match(await send('reply del cat[0-9]+'), /已删除/);
    assert.deepEqual(await gm.receive('cat42'), []);

    assert.match(await send('reply set Title=animal\tRegex=dog|fox\tText=animal'), /已设置/);
    assert.deepEqual(await gm.receive('FOX'), ['animal']);
    assert.match(await send('reply re bird([0-9]+) captured:$1'), /已设置/);
    assert.deepEqual(await gm.receive('bird12'), ['captured:12']);
    assert.match(await send('reply del bird([0-9]+)'), /已删除/);
    assert.match(await send('reply del animal'), /已删除/);
    assert.deepEqual(await gm.receive('fox'), []);
    assert.match(await send('reply re (?=bad) nope'), /不支持|无效/);
    assert.match(await send('reply set Regex=(a)\\1\tText=nope'), /不支持|无效/);
    assert.match(await send('reply re denied nope', player), /权限/);
    assert.deepEqual(await gm.receive('LOCAL42'), ['local regex']);
    assert.deepEqual(await gm.receive('invalid_regex'), []);
    await send('reply off');
    assert.deepEqual(await gm.receive('local42'), []);
  });
}
