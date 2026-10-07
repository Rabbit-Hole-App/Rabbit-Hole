// Library trash (docs/features/library-trash.md): learn migration 0010 library_trash - Move to Trash and Restore for an
// owned top-level canvas or project - through the routes the app worker serves, on LEARN_DB as node:sqlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute, ownerCanvases } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { libraryTrashFetch, libraryTrashRoute } from '../src/library-trash.js';
import { ownerRepositories } from '../src/repositories.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0010-library-trash.sql', import.meta.url), 'utf8');
const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }] };

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
  const LEARN_MEDIA = { put: async () => {}, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'trash touched production storage'));
  for (const [email, handle] of [['ana@test', 'ana'], ['ben@test', 'ben']]) {
    sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES (?, '')").run(email);
    sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
  }
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = libraryTrashRoute(path) ? await libraryTrashFetch(req, env) : canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const create = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const save = (as, name, state = BOARD) => call('PUT', `/api/learn/boards/${name}/main`, { as, body: { state } });
  const share = async (as, name) => (await call('POST', `/api/learn/boards/${name}/main/share`, { as, body: { shared: true, view: true, state: BOARD } })).body.sharing.view;
  const library = async (as, archived = false) => (await call('GET', `/api/canvases${archived ? '?archived=1' : ''}`, { as })).body.canvases.map(c => c.name);
  const explore = async () => (await call('GET', '/api/learn/boards/published')).body.canvases.map(c => c.title);
  return { sqlite, env, call, create, save, share, library, explore };
}

test('0010 is additive, re-runnable and exactly what repository-schema.sql applies; it backfills nothing', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM library_trash').get().n, 0);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /^\s*(DROP|ALTER|DELETE|UPDATE|INSERT)\b/im);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(library_trash)').all().map(c => c.name), ['org', 'name', 'trashed_at']);
});

test('Move to Trash: gone from the Library (archived too), Home and Explore; the publication is removed; nothing is deleted', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Kitchen chemistry');
  await f.save('ana', c.name);
  assert.equal((await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana', body: {} })).status, 200);
  assert.deepEqual(await f.explore(), ['Kitchen chemistry']);
  const trashed = await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  assert.equal(trashed.status, 200);
  assert.ok(trashed.body.trashed_at);
  assert.equal(trashed.body.published, false);
  assert.deepEqual(await f.library('ana'), []);
  assert.deepEqual(await f.library('ana', true), [], 'not in the archive either: Trash is its own place');
  assert.deepEqual((await ownerCanvases(f.env, { org: 'ana-ws', email: 'ana@test' })).map(a => a.name), [], 'Home reads the same list');
  assert.deepEqual(await f.explore(), []);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${c.name}/main`, { as: 'ana' })).body.state.blocks, BOARD.blocks, 'the content stays');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases WHERE name = ?').get(c.name).n, 1);
});

test('Restore brings back title, description, id, content and holes - never the publication, never a new updated_at', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Optics');
  await f.save('ana', c.name);
  await f.call('PATCH', `/api/apps/${c.name}`, { as: 'ana', body: { description: 'Light bends.' } });
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', 'canvas-0be1e5ab', 'ana@test', 'Prisms')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', 'canvas-0be1e5ab', ?, 'b1', '{}')").run(c.name);
  await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana', body: {} });
  const before = (await f.call('GET', `/api/apps/${c.name}`, { as: 'ana' })).body;
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  const restored = (await f.call('POST', `/api/apps/${c.name}/untrash`, { as: 'ana', body: {} })).body;
  assert.deepEqual([restored.name, restored.title, restored.description, restored.updated_at, restored.trashed_at], [c.name, 'Optics', 'Light bends.', before.updated_at, null]);
  assert.equal(restored.published, false, 'Restore never republishes');
  assert.deepEqual(await f.library('ana'), [c.name]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_dives WHERE parent_app = ?').get(c.name).n, 1, 'its nested hole is still there');
});

test('share links are suspended while in Trash and come back as they were on Restore; forks survive', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Bridges');
  const token = await f.share('ana', c.name);
  const fork = (await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'trash-fork-1' } })).body;
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 404, 'the link stops');
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token }, key: 'trash-fork-2' } })).status, 404, 'no new fork through it');
  assert.equal((await f.call('GET', `/api/apps/${fork.name}`, { as: 'ben' })).status, 200, 'an existing fork is never touched');
  assert.equal((await f.call('GET', `/api/learn/boards/${c.name}/main`, { as: 'ana' })).body.sharing.view, token, 'the share configuration is kept');
  await f.call('POST', `/api/apps/${c.name}/untrash`, { as: 'ana', body: {} });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 200, 'Restore reactivates the same link');
});

test('a canvas in Trash cannot be published; a nested Rabbit Hole is never trashed on its own; owners only', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Waves');
  await f.save('ana', c.name);
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  const publish = await f.call('POST', `/api/apps/${c.name}/publish`, { as: 'ana', body: {} });
  assert.equal(publish.status, 409);
  assert.match(publish.body.error, /Restore this canvas from Trash/);
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', 'canvas-0be1e5ac', 'ana@test', 'Ripples')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', 'canvas-0be1e5ac', ?, 'b1', '{}')").run(c.name);
  const hole = await f.call('POST', '/api/apps/canvas-0be1e5ac/trash', { as: 'ana', body: {} });
  assert.equal(hole.status, 409);
  assert.match(hole.body.error, /goes to Trash with its canvas/);
  assert.equal((await f.call('POST', `/api/apps/${c.name}/untrash`, { as: 'ben', body: {} })).status, 404, 'another workspace never restores it');
});

test('projects: Move to Trash hides one from the Library and suspends its links; Restore brings it back; owners only', async t => {
  const f = setup(t);
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch) VALUES ('ana-ws', 'repo-nanogpt', 'ana@test', 'karpathy/nanoGPT', 'master')").run();
  const user = { org: 'ana-ws', email: 'ana@test' };
  assert.deepEqual((await ownerRepositories(f.env, user)).map(r => r.name), ['repo-nanogpt']);
  assert.equal((await f.call('POST', '/api/apps/repo-nanogpt/trash', { as: 'ben', body: {} })).status, 404);
  assert.deepEqual((await f.call('POST', '/api/apps/repo-nanogpt/trash', { as: 'ana', body: {} })).body, { name: 'repo-nanogpt', trashed: true });
  assert.deepEqual(await ownerRepositories(f.env, user), []);
  await f.call('POST', '/api/apps/repo-nanogpt/untrash', { as: 'ana', body: {} });
  assert.deepEqual((await ownerRepositories(f.env, user)).map(r => r.name), ['repo-nanogpt']);
});

test('the Trash list: your own canvases and projects, newest first; nobody else\'s', async t => {
  const f = setup(t);
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch) VALUES ('ana-ws', 'repo-optics', 'ana@test', 'ana/optics', 'main')").run();
  const c = await f.create('ana', 'Old notes');
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  await new Promise(resolve => setTimeout(resolve, 5));
  await f.call('POST', '/api/apps/repo-optics/trash', { as: 'ana', body: {} });
  const bens = await f.create('ben', 'Ben\'s');
  await f.call('POST', `/api/apps/${bens.name}/trash`, { as: 'ben', body: {} });
  const items = (await f.call('GET', '/api/library/trash', { as: 'ana' })).body.items;
  assert.deepEqual(items.map(i => [i.kind, i.name, i.title]), [['repository', 'repo-optics', 'ana/optics'], ['canvas', c.name, 'Old notes']]);
  assert.equal((await f.call('GET', '/api/library/trash')).status, 401);
});
