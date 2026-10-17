// Who may read an imported file (file-access.js, file-refs.js; canvas-file-imports.md section 4.1, owner decision D) against
// the 0023 tables on node:sqlite (repository-schema.sql mirrors the migration), with the stub control plane
// learn-boards.test.js uses. A reference authorizes only when it is a file_source_refs row the board write produced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { authorizeFileSource, fileRefSources } from '../src/file-access.js';

const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };
const OWN = '/api/learn/boards/demo-app/main';
const FRIEND_CANVAS = 'canvas-0f0f0f0f';

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS canvases (id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT, device_id TEXT, UNIQUE(org,name))`);
  sqlite.prepare("INSERT INTO canvases(org,name,owner_email,title) VALUES('elsewhere',?,'friend@elsewhere','Mine')").run(FRIEND_CANVAS);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/me') return Response.json(who);
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA: { put: async () => {}, get: async () => null, list: async () => ({ objects: [] }), delete: async () => {} } };
  const request = as => new Request('https://dev.test/x', { headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) } });
  const call = async (method, path, as, body) => {
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: `small_session=${as}` }, body: JSON.stringify(body) }), env);
    return { status: response.status, body: await response.json() };
  };
  const source = (id, owner = PEOPLE.owner, status = 'stored') => sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, ?, ?, 'demo-app', 'video', 'clip.mp4', 'video/mp4', 10, 'abc', ?, ?, 1)`).run(id, owner.org, owner.email, `file-sources/${id}/original`, status);
  const refs = () => sqlite.prepare('SELECT source_id, board_id FROM file_source_refs ORDER BY source_id, board_id').all().map(r => `${r.source_id}@${r.board_id}`);
  const rowOf = (org, email, app) => sqlite.prepare("SELECT * FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = 'main'").get(org, email, app);
  return { env, request, call, source, refs, rowOf, sqlite };
}
const card = id => ({ id: `c-${id}`, type: 'file', kind: 'clip', fileRef: { v: 1, source: { id, rev: 'abc' } } });
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const withCards = (...ids) => ({ ...STATE, blocks: ids.map(card) });

test('fileRefSources lists each referenced source once', () => {
  assert.deepEqual(fileRefSources({ blocks: [card('fs_a'), card('fs_a'), card('fs_b'), { id: 'x', type: 'file', assetKey: 'drop:1' }, { fileRef: { source: { id: 7 } } }] }), ['fs_a', 'fs_b']);
  assert.deepEqual(fileRefSources(null), []);
});

test('the owner reads their source; an id alone gives nobody else anything', async t => {
  const { env, request, source } = setup(t);
  source('fs_mine');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_mine')).via, 'owner');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_mine')).status, 404, 'another account, by id');
  assert.equal((await authorizeFileSource(request(null), env, 'fs_mine')).status, 401, 'signed out: sign in');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_none')).status, 404);
  source('fs_gone', PEOPLE.owner, 'deleted');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_gone')).status, 404, 'a deleted source is not served');
});

test('a save indexes the sources its cards name that the saver owns; removing the card removes the reference', async t => {
  const { call, source, refs, rowOf } = setup(t);
  source('fs_a'); source('fs_b'); source('fs_theirs', PEOPLE.friend);
  assert.equal((await call('PUT', OWN, 'owner', { state: withCards('fs_a', 'fs_b', 'fs_theirs', 'fs_missing') })).status, 200);
  const id = rowOf('team', 'owner@test', 'demo-app').id;
  assert.deepEqual(refs(), [`fs_a@${id}`, `fs_b@${id}`], 'another account\'s source and an unknown id index nothing');
  await call('PUT', OWN, 'owner', { state: withCards('fs_b'), version: 1 });
  assert.deepEqual(refs(), [`fs_b@${id}`], 'one card removed: one reference removed, the other kept');
  const stale = await call('PUT', OWN, 'owner', { state: withCards('fs_a'), version: 1 });
  assert.equal(stale.status, 409);
  assert.deepEqual(refs(), [`fs_b@${id}`], 'a stale save changes no reference');
  await call('PUT', OWN, 'owner', { state: STATE, version: 2 });
  assert.deepEqual(refs(), [], 'the last card gone');
});

test('a link viewer reads a source its board references, not any other; revoking the link revokes it', async t => {
  const { env, request, call, source } = setup(t);
  source('fs_shown'); source('fs_private');
  await call('PUT', OWN, 'owner', { state: withCards('fs_shown') });
  const links = (await call('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_shown', { token: links.view })).via, 'link', 'the complete original, through the board that shows it');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_private', { token: links.view })).status, 404, 'another file of the same owner');
  assert.equal((await authorizeFileSource(request(null), env, 'fs_shown', { token: links.view })).status, 401, 'not public: sign in');
  await call('POST', `${OWN}/share`, 'owner', { shared: false });
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_shown', { token: links.view })).status, 404, 'sharing off');
});

test('a fork inherits the references of the board it was read from; a board that only names an id reads nothing', async t => {
  const { env, request, call, source, refs, rowOf } = setup(t);
  source('fs_shared'); source('fs_other');
  await call('PUT', OWN, 'owner', { state: withCards('fs_shared') });
  const links = (await call('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  const forked = await call('POST', '/api/learn/boards/fork', 'friend', { source: { token: links.view } });
  assert.equal(forked.status, 201, JSON.stringify(forked.body));
  const fork = rowOf('elsewhere', 'friend@elsewhere', forked.body.name);
  assert.ok(refs().includes(`fs_shared@${fork.id}`), 'the copy holds its own reference');
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_shared', { row: fork })).via, 'board', 'the fork reads the same immutable bytes');
  await call('POST', `${OWN}/share`, 'owner', { shared: false });
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_shared', { row: fork })).via, 'board', 'an existing fork keeps its reference after the link is revoked');
  // The friend's own canvas naming the owner's other source id: saved, indexed nothing, reads nothing.
  await call('PUT', `/api/learn/boards/${FRIEND_CANVAS}/main`, 'friend', { state: withCards('fs_other') });
  const crafted = rowOf('elsewhere', 'friend@elsewhere', FRIEND_CANVAS);
  assert.ok(!refs().some(ref => ref.startsWith('fs_other@')));
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_other', { row: crafted })).status, 404);
  // The fork removing the card drops only the fork's reference; the source board's stays.
  await call('PUT', `/api/learn/boards/${forked.body.name}/main`, 'friend', { state: STATE, version: 1 });
  assert.ok(!refs().includes(`fs_shared@${fork.id}`) && refs().includes(`fs_shared@${rowOf('team', 'owner@test', 'demo-app').id}`));
});

test('a model card bundle (fileRef.bundle): its own dependency sources are indexed and readable through a link; a foreign bundle id is not', async t => {
  const { env, request, call, source, refs, rowOf } = setup(t);
  source('fs_model'); source('fs_bin'); source('fs_texture'); source('fs_foreign', PEOPLE.friend);
  const model = { id: 'm', type: 'model', fileRef: { v: 1, source: { id: 'fs_model', rev: 'abc' }, view: { entry: 'scene.gltf' },
    bundle: [{ path: 'scene.bin', source: { id: 'fs_bin', rev: 'abc' } }, { path: 'tex/wood.png', source: { id: 'fs_texture', rev: 'abc' } }, { path: 'stolen.png', source: { id: 'fs_foreign', rev: 'abc' } }] } };
  assert.deepEqual(fileRefSources({ blocks: [model] }), ['fs_model', 'fs_bin', 'fs_texture', 'fs_foreign']);
  await call('PUT', OWN, 'owner', { state: { ...STATE, blocks: [model] } });
  const id = rowOf('team', 'owner@test', 'demo-app').id;
  assert.deepEqual(refs(), [`fs_bin@${id}`, `fs_model@${id}`, `fs_texture@${id}`], 'the saver’s own bundle sources; the foreign one indexes nothing');
  const links = (await call('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  assert.equal((await authorizeFileSource(request('friend'), env, 'fs_texture', { token: links.view })).via, 'link', 'a shared viewer loads a dependency');
  assert.equal((await authorizeFileSource(request('owner'), env, 'fs_foreign', { token: links.view })).status, 404, 'a foreign bundle id reads nothing, even for the board owner');
});
