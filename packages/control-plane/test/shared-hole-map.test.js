// The read-only Rabbit Holes Map on a shared or published canvas (dive-v1.md "Shared map", owner 2026-10-08), through
// the routes the app worker serves, on LEARN_DB as node:sqlite. A link covers one board: a hole is on the map only when
// the viewer could open that hole's own link right now, and nothing of any other hole - title, count, origin - leaves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './shared-canvas-fixture.js';

const STATE = { blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }, { id: 'b2', type: 'explanation', title: 'Masking' }, { id: 'b3', type: 'explanation', title: 'Heads' }, { id: 'b4', type: 'explanation', title: 'Scale' }] };

async function tree(t) {
  const f = setup(t);
  const { call, sqlite } = f;
  const root = (await call('POST', '/api/canvases', { as: 'ana', body: { title: 'Attention' } })).body;
  const share = async (app, publicView = true) => (await call('POST', `/api/learn/boards/${app}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: publicView, state: STATE } })).body.sharing.view;
  // ana's holes: canvas rows and /dive links, as dives.js writes them.
  const hole = (name, title, parent, origin) => {
    sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', ?, 'ana@test', ?)").run(name, title);
    sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, parent_board, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', ?, ?, 'main', ?, '{}')").run(name, parent, origin);
    return name;
  };
  const open = hole('canvas-0000000a', 'Softmax hole', root.name, 'b1');
  const secret = hole('canvas-0000000b', 'SECRET-HOLE', root.name, 'b2');
  const members = hole('canvas-0000000c', 'Members only', root.name, 'b3');
  const trashed = hole('canvas-0000000d', 'Trashed hole', root.name, 'b4');
  const deeper = hole('canvas-0000000e', 'Deeper', open, 'b1');
  const underSecret = hole('canvas-0000000f', 'Under the secret', secret, 'b1');
  const tokens = { root: await share(root.name), open: await share(open), members: await share(members, false), trashed: await share(trashed), deeper: await share(deeper), underSecret: await share(underSecret) };
  await call('PUT', `/api/learn/boards/${secret}/main`, { as: 'ana', body: { state: { blocks: [{ id: 's', type: 'explanation', title: 'SECRET-CONTENT' }] } } });
  sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', ?, '2026-10-08')").run(trashed);
  const map = async (token, as) => {
    const r = await call('GET', `/api/learn/boards/shared/${token}/holes`, { as });
    if (r.status === 200) for (const leak of ['SECRET', 'Trashed', 'ana@test', 'canvas-']) assert.equal(r.text.includes(leak), false, `the map leaked ${leak}`);
    return r;
  };
  return { ...f, root, share, tokens, map, holes: { open, secret, members, deeper } };
}

test('a shared canvas shows only the holes the viewer could open by their own link: public ones signed out, any live link signed in; never a private or trashed one', async t => {
  const { tokens, map } = await tree(t);
  const out = await map(tokens.root);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, { path: [{ title: 'Attention', href: `/b/${tokens.root}` }], children: [{ title: 'Softmax hole', href: `/b/${tokens.open}`, origin_block_id: 'b1' }],
    holes: [{ title: 'Softmax hole', href: `/b/${tokens.open}`, parent: `/b/${tokens.root}` }, { title: 'Deeper', href: `/b/${tokens.deeper}`, parent: `/b/${tokens.open}` }] });
  const ben = await map(tokens.root, 'ben');
  assert.deepEqual(ben.body.children.map(c => [c.title, c.href, c.origin_block_id]), [['Softmax hole', `/b/${tokens.open}`, 'b1'], ['Members only', `/b/${tokens.members}`, 'b3']]);
});

test('from a hole\'s own link the map climbs through ancestors the viewer may open, and stops at the first one they may not', async t => {
  const { tokens, map } = await tree(t);
  const deep = await map(tokens.deeper);
  assert.deepEqual(deep.body.path, [{ title: 'Attention', href: `/b/${tokens.root}` }, { title: 'Softmax hole', href: `/b/${tokens.open}` }, { title: 'Deeper', href: `/b/${tokens.deeper}` }]);
  assert.deepEqual(deep.body.children, []);
  assert.deepEqual((await map(tokens.open)).body.children.map(c => c.title), ['Deeper']);
  // Its parent has no link: no level above, and its title never appears (checked in map).
  assert.deepEqual((await map(tokens.underSecret)).body.path, [{ title: 'Under the secret', href: `/b/${tokens.underSecret}` }]);
});

test('a link turned off, or a link the viewer cannot open, takes the hole off every map; the route follows the link\'s own access', async t => {
  const { call, root, tokens, map, holes } = await tree(t);
  await call('POST', `/api/learn/boards/${holes.open}/main/share`, { as: 'ana', body: { shared: false, view: false, public_view: false } });
  assert.deepEqual((await map(tokens.root, 'ben')).body.children.map(c => c.title), ['Members only']);
  // A members-only link itself: signed out it is refused, as opening it is.
  assert.equal((await map(tokens.members)).status, 401);
  assert.equal((await map('Z'.repeat(32))).status, 404);
  assert.equal((await call('POST', `/api/learn/boards/shared/${tokens.root}/holes`, {})).status, 405);
  // Unsharing the root ends its map.
  await call('POST', `/api/learn/boards/${root.name}/main/share`, { as: 'ana', body: { shared: false, view: false, public_view: false } });
  assert.equal((await map(tokens.root)).status, 404);
});

test('a published canvas shows the same holes under the same rule, its own level at /e/', async t => {
  const { call, sqlite, root, tokens, map } = await tree(t);
  sqlite.exec("INSERT INTO user_profiles (email, name) VALUES ('ana@test', 'Ana'); INSERT INTO user_handles (email, handle) VALUES ('ana@test', 'ana')");
  assert.equal((await call('POST', `/api/apps/${root.name}/publish`, { as: 'ana', body: {} })).status, 200);
  const token = sqlite.prepare('SELECT token FROM canvas_publications WHERE canvas = ?').get(root.name).token;
  const out = await map(token);
  assert.deepEqual(out.body.path, [{ title: 'Attention', href: `/e/${token}` }]);
  assert.deepEqual(out.body.children.map(c => c.href), [`/b/${tokens.open}`]);
  assert.deepEqual((await map(token, 'ben')).body.children.map(c => c.title), ['Softmax hole', 'Members only']);
});

// The canvas title's menu (owner r35): every hole at any depth under the top level, by the same rule level by level, so a
// hole left out takes everything under it out too (Under the secret has its own public link, and is still left out).
test('the title menu lists every hole the viewer may open at any depth, from the top level down, each with its parent link', async t => {
  const { tokens, map } = await tree(t);
  const ben = (await map(tokens.root, 'ben')).body.holes;
  assert.deepEqual(ben.map(h => [h.title, h.parent]), [['Softmax hole', `/b/${tokens.root}`], ['Members only', `/b/${tokens.root}`], ['Deeper', `/b/${tokens.open}`]]);
  // From the deepest link the tree is the same one, walked from the top level the viewer may open.
  assert.deepEqual((await map(tokens.deeper)).body.holes.map(h => h.title), ['Softmax hole', 'Deeper']);
  // Its parent has no open link: the top is the hole itself, with nothing under it.
  assert.deepEqual((await map(tokens.underSecret)).body.holes, []);
});
