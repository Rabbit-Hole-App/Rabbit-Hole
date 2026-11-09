// Library folders (docs/features/library-folders.md): learn migration 0015 library_folders + library_folder_items, through
// the routes the app worker serves, on LEARN_DB as node:sqlite. ana and ben each have their own workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute, ownerCanvases } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { libraryTrashFetch, libraryTrashRoute } from '../src/library-trash.js';
import { libraryFoldersFetch, libraryFoldersRoute, FOLDER_COLORS } from '../src/library-folders.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0015-library-folders.sql', import.meta.url), 'utf8');
const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const BLUE = '#2383e2', GREEN = '#1a7f37';

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') throw new Error('live small-cp write');
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA: { put: async () => {}, get: async () => null }, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'folders touched production storage'));
  const call = async (method, path, { as, body, raw } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
    const response = libraryFoldersRoute(path) ? await libraryFoldersFetch(req, env)
      : libraryTrashRoute(path) ? await libraryTrashFetch(req, env) : canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const canvas = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body.name;
  const folder = async (as, name, extra = {}) => (await call('POST', '/api/library/folders', { as, body: { name, ...extra } })).body;
  const list = async as => (await call('GET', '/api/library/folders', { as })).body;
  return { sqlite, env, call, canvas, folder, list };
}

test('0015 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing', t => {
  const once = new DatabaseSync(':memory:'), full = new DatabaseSync(':memory:');
  t.after(() => { once.close(); full.close(); });
  once.exec(migration); once.exec(migration);
  full.exec(schema);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  // Every table and index the file makes, with the same SQL in the full schema (the release preflight's object set).
  const objects = db => db.prepare("SELECT type, name, replace(sql, char(13), '') AS sql FROM sqlite_master WHERE name LIKE 'library_folder%' ORDER BY name").all().map(r => ({ ...r }));
  assert.deepEqual(objects(once).map(o => `${o.type} ${o.name}`), ['table library_folder_items', 'index library_folder_items_folder', 'table library_folders', 'index library_folders_owner']);
  assert.deepEqual(objects(full), objects(once));
  assert.equal(once.prepare('SELECT count(*) AS n FROM library_folders').get().n + once.prepare('SELECT count(*) AS n FROM library_folder_items').get().n, 0);
  assert.throws(() => once.prepare("INSERT INTO library_folders VALUES ('x', 'o', 'e', '', '#2383e2', 't', 't')").run(), /CHECK/, 'the name is checked in the table too');
});

test('CRUD: create (blue by default), list by name, rename, recolour, delete', async t => {
  const f = setup(t);
  const made = await f.call('POST', '/api/library/folders', { as: 'ana', body: { name: '  Reading   list ' } });
  assert.equal(made.status, 201);
  assert.match(made.body.folder.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual([made.body.folder.name, made.body.folder.color], ['Reading list', BLUE], 'trimmed, one space, blue');
  await f.folder('ana', 'attention', { color: GREEN });
  assert.deepEqual((await f.list('ana')).folders.map(x => [x.name, x.color]), [['attention', GREEN], ['Reading list', BLUE]], 'by name, case-insensitive');
  const id = made.body.folder.id;
  const renamed = await f.call('PATCH', `/api/library/folders/${id}`, { as: 'ana', body: { name: 'Papers' } });
  assert.deepEqual([renamed.status, renamed.body.folder.name, renamed.body.folder.color], [200, 'Papers', BLUE]);
  const recoloured = await f.call('PATCH', `/api/library/folders/${id}`, { as: 'ana', body: { color: FOLDER_COLORS[5] } });
  assert.deepEqual([recoloured.body.folder.name, recoloured.body.folder.color], ['Papers', '#7c3aed'], 'a colour alone keeps the name');
  assert.ok(recoloured.body.folder.updated_at >= made.body.folder.updated_at);
  assert.deepEqual((await f.call('DELETE', `/api/library/folders/${id}`, { as: 'ana' })).body, { deleted: id, released: 0 });
  assert.deepEqual((await f.list('ana')).folders.map(x => x.name), ['attention']);
  assert.equal((await f.call('DELETE', `/api/library/folders/${id}`, { as: 'ana' })).status, 404, 'gone');
});

test('validation: a name of 1 to 60 characters, a palette colour, a JSON object', async t => {
  const f = setup(t);
  for (const name of ['', '   ', 'x'.repeat(61), 42, null]) assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', body: { name } })).status, 400, `name ${JSON.stringify(name)}`);
  assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', body: { name: 'x'.repeat(60) } })).status, 201, '60 is fine');
  for (const color of ['#ff0000', 'blue', '', null]) assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', body: { name: 'A', color } })).status, 400, `colour ${color}`);
  assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', raw: 'not json' })).status, 400);
  assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', raw: '[1]' })).status, 400);
  const { folder } = await f.folder('ana', 'A');
  assert.equal((await f.call('PATCH', `/api/library/folders/${folder.id}`, { as: 'ana', body: { name: ' ' } })).status, 400);
  assert.equal((await f.call('PATCH', `/api/library/folders/${folder.id}`, { as: 'ana', body: { color: '#000' } })).status, 400);
  assert.equal((await f.call('PUT', '/api/library/folders', { as: 'ana' })).status, 405);
  assert.equal((await f.call('GET', '/api/library/folders/not-an-id', { as: 'ana' })).status, 404);
  assert.equal((await f.call('PUT', `/api/library/folders/${folder.id}/items/app-live`, { as: 'ana' })).status, 404, 'a live app is never filed');
  assert.equal((await f.call('GET', '/api/library/folders')).status, 401, 'signed out');
});

test('owner isolation: another account sees none of it and gets 404 on every folder route', async t => {
  const f = setup(t);
  const mine = await f.canvas('ana', 'Softmax');
  const theirs = await f.canvas('ben', 'Ben canvas');
  const { folder } = await f.folder('ana', 'Private stuff', { item: mine });
  assert.deepEqual(await f.list('ben'), { folders: [], items: {} });
  const base = `/api/library/folders/${folder.id}`;
  for (const [method, path, body] of [['PATCH', base, { name: 'Mine now' }], ['DELETE', base], ['PUT', `${base}/items/${theirs}`], ['DELETE', `${base}/items/${mine}`]]) {
    assert.equal((await f.call(method, path, { as: 'ben', body })).status, 404, `${method} ${path}`);
  }
  // ana cannot file ben's canvas, in a new folder or an existing one.
  assert.equal((await f.call('PUT', `${base}/items/${theirs}`, { as: 'ana' })).status, 404);
  assert.equal((await f.call('POST', '/api/library/folders', { as: 'ana', body: { name: 'Grab', item: theirs } })).status, 404);
  assert.deepEqual((await f.list('ana')).folders.map(x => x.name), ['Private stuff'], 'a refused create makes no folder');
  assert.deepEqual((await f.list('ana')).items, { [mine]: folder.id });
});

test('one folder per item: a move replaces; New folder… files in one step; remove only from its own folder', async t => {
  const f = setup(t);
  const c = await f.canvas('ana', 'Attention');
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch) VALUES ('ana-ws', 'repo-1a2b3c4d-nanogpt', 'ana@test', 'karpathy/nanoGPT', 'master')").run();
  const a = (await f.folder('ana', 'A')).folder, b = (await f.folder('ana', 'B')).folder;
  assert.deepEqual((await f.call('PUT', `/api/library/folders/${a.id}/items/${c}`, { as: 'ana' })).body, { name: c, folder: a.id });
  await f.call('PUT', `/api/library/folders/${b.id}/items/${c}`, { as: 'ana' });
  assert.deepEqual((await f.list('ana')).items, { [c]: b.id });
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM library_folder_items').get().n, 1);
  assert.equal((await f.call('PUT', `/api/library/folders/${a.id}/items/repo-1a2b3c4d-nanogpt`, { as: 'ana' })).status, 200, 'a project files too');
  const made = await f.call('POST', '/api/library/folders', { as: 'ana', body: { name: 'C', item: c } });
  assert.deepEqual([made.status, made.body.item], [201, c]);
  assert.deepEqual((await f.list('ana')).items, { [c]: made.body.folder.id, 'repo-1a2b3c4d-nanogpt': a.id });
  assert.equal((await f.call('DELETE', `/api/library/folders/${b.id}/items/${c}`, { as: 'ana' })).status, 404, 'not in B any more');
  assert.deepEqual((await f.call('DELETE', `/api/library/folders/${made.body.folder.id}/items/${c}`, { as: 'ana' })).body, { name: c, folder: null });
  assert.deepEqual((await f.list('ana')).items, { 'repo-1a2b3c4d-nanogpt': a.id });
});

test('deleting a folder releases its items into the Library; nothing is deleted', async t => {
  const f = setup(t);
  const one = await f.canvas('ana', 'One'), two = await f.canvas('ana', 'Two');
  const { folder } = await f.folder('ana', 'Batch', { item: one });
  await f.call('PUT', `/api/library/folders/${folder.id}/items/${two}`, { as: 'ana' });
  const other = (await f.folder('ana', 'Other')).folder;
  assert.deepEqual((await f.call('DELETE', `/api/library/folders/${folder.id}`, { as: 'ana' })).body, { deleted: folder.id, released: 2 });
  assert.deepEqual(await f.list('ana'), { folders: [{ ...other }], items: {} });
  assert.deepEqual((await ownerCanvases(f.env, PEOPLE.ana)).map(x => x.title).sort(), ['One', 'Two'], 'both canvases are still in the Library');
});

test('Trash keeps the membership: a trashed item leaves the Library and comes back into its folder on Restore', async t => {
  const f = setup(t);
  const c = await f.canvas('ana', 'Kept');
  const { folder } = await f.folder('ana', 'Shelf', { item: c });
  await f.call('POST', `/api/apps/${c}/trash`, { as: 'ana', body: {} });
  assert.deepEqual((await ownerCanvases(f.env, PEOPLE.ana)).map(x => x.name), [], 'gone from the Library, so the folder shows nothing');
  await f.call('POST', `/api/apps/${c}/untrash`, { as: 'ana', body: {} });
  assert.deepEqual((await ownerCanvases(f.env, PEOPLE.ana)).map(x => x.name), [c]);
  assert.deepEqual((await f.list('ana')).items, { [c]: folder.id }, 'back in its folder');
});
