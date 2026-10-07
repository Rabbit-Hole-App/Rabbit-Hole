// Canvas persistence (docs/features/canvas-persistence.md): every owned board, private ones too, is saved in learn_boards
// with the existing version check, and nobody but its owner can read it. Through the routes the app worker serves, on
// LEARN_DB as node:sqlite built from repository-schema.sql. ana and ann share a workspace; ben is elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { libraryTrashFetch, libraryTrashRoute } from '../src/library-trash.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ann: { email: 'ann@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [{ id: 'q1', question: 'Why exp?', answer: 'Positive.', status: 'done' }], sources: [], blocks: [{ id: 'b1', type: 'explanation', title: 'SECRET-CONTENT' }] };
const later = () => new Promise(resolve => setTimeout(resolve, 5));

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
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'touched production storage'));
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = libraryTrashRoute(path) ? await libraryTrashFetch(req, env) : canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    const text = await response.text();
    return { status: response.status, text, body: (response.headers.get('content-type') || '').includes('json') ? JSON.parse(text) : null };
  };
  const create = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const board = name => `/api/learn/boards/${name}/main`;
  const updatedAt = async name => (await call('GET', `/api/apps/${name}`, { as: 'ana' })).body.updated_at;
  return { sqlite, call, create, board, updatedAt };
}

test('a private board is saved: its first copy is version 1 and moves no updated_at; a write on a stale or unseen version is refused', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Private notes');
  const created = await f.updatedAt(c.name);
  await later();
  // The first open after release: this browser's copy, based on no server copy (version 0), becomes version 1.
  const first = await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  assert.deepEqual([first.status, first.body.version, first.body.sharing.shared], [200, 1, false]);
  assert.equal(await f.updatedAt(c.name), created, 'a sync of what the browser had, not a meaningful change');
  // Another browser that also saw no copy, and one on a stale version: 409 with the current version, nothing written.
  const changed = { ...BOARD, blocks: [...BOARD.blocks, { id: 'b2', type: 'quiz', question: 'Mine?' }] };
  for (const version of [0, 7]) {
    const stale = await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: changed, version } });
    assert.deepEqual([stale.status, stale.body.version], [409, 1], `version ${version}`);
  }
  assert.deepEqual((await f.call('GET', f.board(c.name), { as: 'ana' })).body.state, BOARD, 'never overwritten');
  await later();
  assert.equal((await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: changed, version: 1 } })).body.version, 2);
  assert.ok(await f.updatedAt(c.name) > created, 'a new card is a meaningful change');
  // The over-cap refusal says where the board still is (canvas-persistence.md, Save contract 3).
  const big = await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: { blocks: [{ id: 'x', body: 'x'.repeat(2_000_000) }] }, version: 2 } });
  assert.equal(big.status, 413);
  assert.match(big.body.error, /not saved to your account and stays only in this browser/);
  assert.equal((await f.call('GET', f.board(c.name), { as: 'ana' })).body.version, 2, 'nothing written');
});

test('a canvas row says whether its main board is on the server: not before the first save, after an over-cap refusal or for another board', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'Saved notes'), big = await f.create('ana', 'Huge notes');
  const listed = async () => Object.fromEntries((await f.call('GET', '/api/canvases', { as: 'ana' })).body.canvases.map(row => [row.name, row.board_saved]));
  assert.equal(c.board_saved, false, 'a new canvas');
  assert.deepEqual(await listed(), { [c.name]: false, [big.name]: false });
  await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  assert.equal((await f.call('PUT', f.board(big.name), { as: 'ana', body: { state: { blocks: [{ id: 'x', body: 'x'.repeat(2_000_000) }] }, version: 0 } })).status, 413);
  assert.equal((await f.call('PUT', `/api/learn/boards/${big.name}/review`, { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  assert.deepEqual(await listed(), { [c.name]: true, [big.name]: false }, 'only a saved main board counts');
  assert.equal((await f.call('GET', `/api/apps/${c.name}`, { as: 'ana' })).body.board_saved, true);
});

test('nobody but the owner reads a private board, no link reaches it, and Trash still suspends links', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'SECRET-TITLE');
  await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  // Another account at the same canvas/board path: never the owner's row (same workspace 403, elsewhere 404, signed out 401).
  for (const [who, status] of [['ann', 403], ['ben', 404], [undefined, 401]]) {
    for (const [method, path] of [['GET', f.board(c.name)], ['PUT', f.board(c.name)], ['GET', `${f.board(c.name)}/assets`], ['GET', `${f.board(c.name)}/assets/${encodeURIComponent('pdf:p')}`]]) {
      const read = await f.call(method, path, { as: who, body: method === 'PUT' ? { state: { blocks: [] }, version: 1 } : undefined });
      assert.equal(read.status, status, `${who} ${method} ${path}`);
      assert.ok(!read.text.includes('SECRET-CONTENT'), `${who} ${method} ${path}: no state`);
    }
  }
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { canvas: c.name } } })).status, 404, 'nor a fork of it');
  // No link: a private board has no view token or publication, so no share or /e token opens it.
  assert.deepEqual({ ...f.sqlite.prepare('SELECT shared, view_token FROM learn_boards WHERE app = ?').get(c.name) }, { shared: 0, view_token: null });
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_publications WHERE canvas = ?').get(c.name).n, 0);
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${'a'.repeat(32)}`, { as: 'ben' })).status, 404);
  assert.ok(!(await f.call('GET', '/api/learn/boards/published')).text.includes('SECRET'), 'not in Explore');
  // Shared, then in Trash: the link stops; Restore brings it back; sharing off kills it again.
  const token = (await f.call('POST', `${f.board(c.name)}/share`, { as: 'ana', body: { shared: true, view: true } })).body.sharing.view;
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 200);
  await f.call('POST', `/api/apps/${c.name}/trash`, { as: 'ana', body: {} });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 404, 'Trash suspends the link');
  await f.call('POST', `/api/apps/${c.name}/untrash`, { as: 'ana', body: {} });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 200);
  await f.call('POST', `${f.board(c.name)}/share`, { as: 'ana', body: { shared: false } });
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as: 'ben' })).status, 404);
  assert.deepEqual((await f.call('GET', f.board(c.name), { as: 'ana' })).body.state, BOARD, 'the owner keeps the board');
});
