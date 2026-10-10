// Learn board saving and sharing (docs/features/canvas-sharing.md) against
// learn_boards on node:sqlite, with a stub control plane that says who a
// cookie belongs to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { liveDb, liveRuns } from './live-storage-spy.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  // smart-home's canvases catalog (their repository-schema.sql), which a fork joins.
  sqlite.exec(`CREATE TABLE IF NOT EXISTS canvases (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, device_id TEXT, UNIQUE(org,name))`);
  const liveWrites = [];
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') { liveWrites.push(`${request.method} ${new URL(request.url).pathname}`); throw new Error('live small-cp write'); }
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/me') return Response.json(who);
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  // R2, in memory: enough of put/get/list for board files. Bound as LEARN_MEDIA, the dev bucket,
  // beside a live DB and RUNS that record and throw (C1, docs/features/learn-cleanup.md).
  const objects = new Map();
  const LEARN_MEDIA = {
    put: async (key, bytes, { httpMetadata, customMetadata }) => { objects.set(key, { bytes: new Uint8Array(bytes), httpMetadata, customMetadata }); },
    get: async key => { const object = objects.get(key); return object ? { body: object.bytes, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata } : null; },
    list: async ({ prefix }) => ({ objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, customMetadata: object.customMetadata })), truncated: false }),
  };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls, liveWrites], [[], [], []], 'a board route touched production storage'));
  const call = async (method, path, { as, body, raw, headers: extra = {} } = {}) => {
    const headers = { 'Content-Type': 'application/json', ...extra, ...(as ? { cookie: `small_session=${as}` } : {}) };
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) }), env);
    const type = response.headers.get('content-type') || '';
    return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  return { call, LEARN_DB, sqlite };
}

const STATE = { blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const OWN = '/api/learn/boards/demo-app/main';

test('the owner saves a board and reads it back; versions count saves', async t => {
  const { call } = setup(t);
  const none = await call('GET', OWN, { as: 'owner' });
  assert.equal(none.status, 200, 'a board never saved is not an error');
  assert.equal(none.body.exists, false);
  assert.deepEqual((await call('PUT', OWN, { as: 'owner', body: { state: STATE } })).body.version, 1);
  const again = await call('PUT', OWN, { as: 'owner', body: { state: { ...STATE, shapes: [{ id: 's' }] }, version: 1 } });
  assert.equal(again.body.version, 2);
  const read = await call('GET', OWN, { as: 'owner' });
  assert.equal(read.body.version, 2);
  assert.deepEqual(read.body.state.shapes, [{ id: 's' }]);
  assert.equal(read.body.sharing.shared, false);
});

test('a repo-* app and a canvas save, share and store board files the same way', async t => {
  const { call, sqlite } = setup(t);
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${'a'.repeat(40)}','ready');
    INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Board')`);
  for (const app of ['repo-example', 'canvas-0a1b2c3d']) {
    const own = `/api/learn/boards/${app}/main`;
    assert.equal((await call('PUT', own, { as: 'owner', body: { state: STATE } })).body.version, 1, app);
    const links = (await call('POST', `${own}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
    assert.equal((await call('PUT', `${own}/assets/${encodeURIComponent('pdf:p')}`, { as: 'owner', raw: new Uint8Array([1]), headers: { 'Content-Type': 'application/pdf' } })).status, 200, app);
    assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}`, { as: 'owner' })).body.role, 'view', app);
  }
});

test('only someone with access to the app can save or share it', async t => {
  const { call } = setup(t);
  assert.equal((await call('PUT', OWN, { body: { state: STATE } })).status, 401);
  assert.equal((await call('PUT', OWN, { as: 'friend', body: { state: STATE } })).status, 404);
  assert.equal((await call('POST', `${OWN}/share`, { as: 'friend', body: { shared: true, view: true } })).status, 404);
});

test('sharing makes a view link; turning it off revokes it and on again makes a new one', async t => {
  const { call } = setup(t);
  const on = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: STATE } })).body.sharing;
  assert.ok(on.shared && on.view);
  assert.equal(on.edit, null, 'links are view-only: no edit link, even when asked');
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).body.role, 'view');
  const viewOff = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false } })).body.sharing;
  assert.equal(viewOff.view, null);
  assert.equal((await call('GET', `/api/learn/boards/shared/${on.view}`, { as: 'friend' })).status, 404);
  const viewAgain = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true } })).body.sharing;
  assert.notEqual(viewAgain.view, on.view);
  const off = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false, view: true } })).body.sharing;
  assert.deepEqual(off, { shared: false, view: null, edit: null, public_view: false });
  assert.equal((await call('GET', `/api/learn/boards/shared/${viewAgain.view}`, { as: 'friend' })).status, 404);
});

test('a view link needs sign-in unless it is public', async t => {
  const { call } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, state: STATE } })).body.sharing;
  const anonymous = await call('GET', `/api/learn/boards/shared/${links.view}`);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.signIn, true);
  const open = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true } })).body.sharing;
  assert.equal(open.public_view, true);
  const read = await call('GET', `/api/learn/boards/shared/${open.view}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.state, STATE);
  assert.equal((await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: false, public_view: true } })).body.sharing.public_view, false, 'no view link, nothing public');
});

test('shared links never save: editing means forking', async t => {
  const { call, LEARN_DB } = setup(t);
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, state: STATE } })).body.sharing;
  const refused = await call('PUT', `/api/learn/boards/shared/${links.view}`, { as: 'friend', body: { state: { ...STATE, items: [{ id: 'n' }] }, version: 1 } });
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Fork/);
  assert.equal((await call('PUT', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('drop:x')}`, { as: 'friend', raw: new Uint8Array([9]) })).status, 403);
  // an edit token from before links went view-only opens nothing
  await LEARN_DB.prepare("UPDATE learn_boards SET edit_token = 'old-edit-token-000000000000' WHERE app = 'demo-app'").bind().run();
  assert.equal((await call('GET', '/api/learn/boards/shared/old-edit-token-000000000000', { as: 'friend' })).status, 404);
  const ownerStale = await call('PUT', OWN, { as: 'owner', body: { state: STATE, version: 0 } });
  assert.equal(ownerStale.status, 409, 'a stale owner save is still refused');
});

test('bad input is refused plainly', async t => {
  const { call } = setup(t);
  assert.equal((await call('PUT', '/api/learn/boards/demo-app/..%2Fx', { as: 'owner', body: { state: STATE } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: 'nope' } })).status, 400);
  assert.equal((await call('PUT', OWN, { as: 'owner', body: { state: { blob: 'x'.repeat(2_000_000) } } })).status, 413);
  assert.equal((await call('GET', '/api/learn/boards/shared/short')).status, 404);
});

test('board files: the owner uploads them; whoever can open a link can load them, nobody else', async t => {
  const { call } = setup(t);
  const key = encodeURIComponent('pdf:paper-1');
  assert.equal((await call('PUT', `${OWN}/assets/${key}`, { as: 'owner', raw: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'application/pdf' } })).status, 404, 'no board row yet');
  // A link serves the files the board's cards use (boardAssetKeys), so the board names both.
  const used = { ...STATE, blocks: [...STATE.blocks, { id: 'p', type: 'pdf', assetKey: 'pdf:paper-1' }, { id: 'i', type: 'image', assetKey: 'image:a cat' }] };
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, edit: true, state: used } })).body.sharing;
  assert.equal((await call('PUT', `${OWN}/assets/${key}`, { as: 'owner', raw: new Uint8Array([1, 2, 3]), headers: { 'Content-Type': 'application/pdf' } })).status, 200);
  await call('PUT', `${OWN}/assets/${encodeURIComponent('image:a cat')}`, { as: 'owner', raw: 'data:image/png;base64,AAAA', headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string' } });
  assert.deepEqual((await call('GET', `${OWN}/assets`, { as: 'owner' })).body.keys.sort(), ['image:a cat', 'pdf:paper-1']);
  const viewed = await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend' });
  assert.equal(viewed.status, 200);
  assert.deepEqual([...viewed.body], [1, 2, 3]);
  assert.equal(viewed.headers.get('content-type'), 'application/pdf');
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('image:a cat')}`, { as: 'friend' })).headers.get('x-asset-kind'), 'string');
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`)).status, 401, 'not public: sign in');
  assert.equal((await call('PUT', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend', raw: new Uint8Array([9]) })).status, 403, 'a view link adds no files');
  await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: false } });
  assert.equal((await call('GET', `/api/learn/boards/shared/${links.view}/assets/${key}`, { as: 'friend' })).status, 404, 'sharing off: files go with the link');
});

test('an uploaded file is never served as a page on this origin', async t => {
  const { call } = setup(t);
  const used = { ...STATE, blocks: [...STATE.blocks, { id: 'e', type: 'image', assetKey: 'drop:evil' }] };
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true, state: used } })).body.sharing;
  await call('PUT', `${OWN}/assets/${encodeURIComponent('drop:evil')}`, { as: 'owner', raw: '<script>alert(1)</script>', headers: { 'Content-Type': 'text/html' } });
  const served = await call('GET', `/api/learn/boards/shared/${links.view}/assets/${encodeURIComponent('drop:evil')}`);
  assert.equal(served.headers.get('content-type'), 'application/octet-stream');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.match(served.headers.get('content-security-policy'), /sandbox/);
  assert.equal(served.headers.get('content-disposition'), 'attachment');
});

test('a link serves only the files its board uses now: a removed file, an old notebook workspace or any other key is 404; a fork copies only those', async t => {
  const { call, sqlite } = setup(t);
  const CANVAS = 'canvas-0a1b2c3d', own = `/api/learn/boards/${CANVAS}/main`, PUBLISHED = 'published-token-0000000001';
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${CANVAS}','owner@test','Board')`);
  const blocks = [{ id: 'a', type: 'image', assetKey: 'drop:a' }, { id: 'b', type: 'image', assetKey: 'drop:b' }, { id: 'nb', type: 'notebook', notebook_id: 'nb-1' }];
  const links = (await call('POST', `${own}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true, state: { ...STATE, blocks } } })).body.sharing;
  const uploaded = ['drop:a', 'drop:b', 'notebook:nb-1', 'notebook:nb-old', 'drop:never-on-it'];
  for (const key of uploaded) await call('PUT', `${own}/assets/${encodeURIComponent(key)}`, { as: 'owner', raw: new Uint8Array([7]), headers: { 'Content-Type': 'application/pdf' } });
  // The owner removes B from the board; its file stays in R2, unreachable past its owner.
  assert.equal((await call('PUT', own, { as: 'owner', body: { state: { ...STATE, blocks: blocks.filter(block => block.id !== 'b') }, version: 1 } })).status, 200);
  sqlite.prepare('INSERT INTO canvas_publications (org, canvas, token) VALUES (?, ?, ?)').run('team', CANVAS, PUBLISHED);
  for (const token of [links.view, PUBLISHED]) {
    const file = async key => (await call('GET', `/api/learn/boards/shared/${token}/assets/${encodeURIComponent(key)}`)).status;
    for (const key of ['drop:a', 'notebook:nb-1']) assert.equal(await file(key), 200, `${token}: ${key} is on the board`);
    for (const key of ['drop:b', 'notebook:nb-old', 'drop:never-on-it']) assert.equal(await file(key), 404, `${token}: ${key} is not`);
  }
  // The owner's own routes are unchanged: every file they uploaded.
  assert.deepEqual((await call('GET', `${own}/assets`, { as: 'owner' })).body.keys.sort(), [...uploaded].sort());
  assert.equal((await call('GET', `${own}/assets/${encodeURIComponent('drop:b')}`, { as: 'owner' })).status, 200);
  // A fork copies only what its board uses: A and the notebook's workspace, under the notebook's new id.
  const forked = await call('POST', `/api/learn/boards/shared/${links.view}/fork`, { as: 'friend' });
  assert.equal(forked.body.files, 2);
  const notebook = (await call('GET', `/api/learn/boards/${forked.body.name}/main`, { as: 'friend' })).body.state.blocks.find(block => block.type === 'notebook');
  assert.deepEqual((await call('GET', `/api/learn/boards/${forked.body.name}/main/assets`, { as: 'friend' })).body.keys.sort(), ['drop:a', `notebook:${notebook.notebook_id}`].sort());
});

test('forking makes the viewer their own Canvas with a copy of the board, its files and notebooks', async t => {
  const { call, sqlite } = setup(t);
  const board = { ...STATE, blocks: [...STATE.blocks, { id: 'p', type: 'pdf', assetKey: 'pdf:p' }, { id: 'nb', type: 'notebook', notebook_id: 'nb-original-id' }] };
  const links = (await call('POST', `${OWN}/share`, { as: 'owner', body: { shared: true, view: true, public_view: true, state: board } })).body.sharing;
  await call('PUT', `${OWN}/assets/${encodeURIComponent('pdf:p')}`, { as: 'owner', raw: new Uint8Array([4, 5]), headers: { 'Content-Type': 'application/pdf' } });
  await call('PUT', `${OWN}/assets/${encodeURIComponent('notebook:nb-original-id')}`, { as: 'owner', raw: '{"helper.py":{"type":"file","format":"text","content":"x = 1"}}', headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string' } });

  assert.equal((await call('POST', `/api/learn/boards/shared/${links.view}/fork`)).status, 401, 'a public viewer signs in to fork');
  const forked = await call('POST', `/api/learn/boards/shared/${links.view}/fork`, { as: 'friend' });
  assert.equal(forked.status, 201);
  assert.match(forked.body.name, /^canvas-[a-f0-9]{8}$/);
  assert.equal(forked.body.url, `/apps/${forked.body.name}?tab=learn`);
  assert.equal(forked.body.files, 2);
  const canvas = sqlite.prepare('SELECT * FROM canvases WHERE name = ?').get(forked.body.name);
  assert.equal(canvas.owner_email, 'friend@elsewhere');
  assert.equal(canvas.org, 'elsewhere');
  assert.equal(canvas.project, null, 'standalone: the forker may not have the source project');

  const mine = await call('GET', `/api/learn/boards/${forked.body.name}/main`, { as: 'friend' });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.forked_from.resource_id, 'demo-app');
  // The source's owner is never stored on the fork, least of all their email: the fork's canvas row reads their @handle
  // by reference (docs/features/user-handles.md).
  assert.equal(mine.body.forked_from.creator, null);
  assert.ok(!JSON.stringify(mine.body).includes('owner@test'), 'no source owner email on the fork');
  assert.equal(mine.body.forked_from.share_url, `/b/${links.view}`);
  const notebook = mine.body.state.blocks.find(block => block.type === 'notebook');
  assert.notEqual(notebook.notebook_id, 'nb-original-id', 'a forked notebook gets its own id');
  const keys = (await call('GET', `/api/learn/boards/${forked.body.name}/main/assets`, { as: 'friend' })).body.keys.sort();
  assert.deepEqual(keys, [`notebook:${notebook.notebook_id}`, 'pdf:p'].sort());
  assert.deepEqual([...(await call('GET', `/api/learn/boards/${forked.body.name}/main/assets/${encodeURIComponent('pdf:p')}`, { as: 'friend' })).body], [4, 5]);

  // the fork is the forker's: editable by them, private from the source's owner
  assert.equal((await call('PUT', `/api/learn/boards/${forked.body.name}/main`, { as: 'friend', body: { state: STATE, version: 1 } })).body.version, 2);
  assert.equal((await call('GET', `/api/learn/boards/${forked.body.name}/main`, { as: 'owner' })).status, 404, 'the source owner cannot open it (not in their workspace)');
  // and the source is untouched
  assert.equal((await call('GET', OWN, { as: 'owner' })).body.state.blocks.find(block => block.type === 'notebook').notebook_id, 'nb-original-id');
});
