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
import { ownerRepositories } from '../src/repositories.js';

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
  return { sqlite, env, call, create, board, updatedAt };
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

test('a canvas row says whether its main board is on the server: a new canvas from creation; a canvas made before that not before its first save, after an over-cap refusal or for another board', async t => {
  const f = setup(t);
  const fresh = await f.create('ana', 'Fresh notes');
  assert.equal(fresh.board_saved, true, 'a new canvas is made with its board (owner, 2026-10-08)');
  const c = await f.create('ana', 'Saved notes'), big = await f.create('ana', 'Huge notes');
  // Made before boards came with their rows: no board.
  for (const name of [c.name, big.name]) f.sqlite.prepare("DELETE FROM learn_boards WHERE app = ?").run(name);
  const listed = async () => Object.fromEntries((await f.call('GET', '/api/canvases', { as: 'ana' })).body.canvases.filter(row => row.name !== fresh.name).map(row => [row.name, row.board_saved]));
  assert.deepEqual(await listed(), { [c.name]: false, [big.name]: false });
  await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  assert.equal((await f.call('PUT', f.board(big.name), { as: 'ana', body: { state: { blocks: [{ id: 'x', body: 'x'.repeat(2_000_000) }] }, version: 0 } })).status, 413);
  assert.equal((await f.call('PUT', `/api/learn/boards/${big.name}/review`, { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  assert.deepEqual(await listed(), { [c.name]: true, [big.name]: false }, 'only a saved main board counts');
  assert.equal((await f.call('GET', `/api/apps/${c.name}`, { as: 'ana' })).body.board_saved, true);
});

test('a project row says whether its Learn main board (LearnPage /api/learn/boards/<repo>/main) is on the server', async t => {
  const f = setup(t);
  for (const name of ['repo-0a0a0a0a', 'repo-0b0b0b0b']) f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch, status) VALUES ('ana-ws', ?, 'ana@test', 'karpathy/nanoGPT', 'master', 'ready')").run(name);
  const listed = async () => Object.fromEntries((await ownerRepositories(f.env, PEOPLE.ana)).map(row => [row.name, row.board_saved]));
  assert.deepEqual(await listed(), { 'repo-0a0a0a0a': false, 'repo-0b0b0b0b': false });
  assert.equal((await f.call('PUT', f.board('repo-0a0a0a0a'), { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  assert.equal((await f.call('PUT', '/api/learn/boards/repo-0b0b0b0b/review', { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  assert.deepEqual(await listed(), { 'repo-0a0a0a0a': true, 'repo-0b0b0b0b': false }, 'only the main board counts');
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

// Saved at creation (owner, 2026-10-08): a canvas made from the Library had no board until it was opened once, so
// Visibility, Duplicate and Fork refused it ("nothing to publish yet", "state must be a board object", "nothing to copy").
const EMPTY = { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], exchanges: [], sources: [] };
const handle = f => f.sqlite.exec("INSERT INTO user_profiles (email) VALUES ('ana@test'); INSERT INTO user_handles (email, handle) VALUES ('ana@test', 'ana')");
const isEmpty = state => Object.values(state).flat().length === 0;

test('a canvas is made with its empty main board in one batch: version 0, the shape an untouched canvas saves, never one without the other', async t => {
  const f = setup(t);
  const c = await f.create('ana', 'New notes');
  const created = await f.updatedAt(c.name);
  const board = (await f.call('GET', f.board(c.name), { as: 'ana' })).body;
  assert.deepEqual([board.version, board.state], [0, EMPTY]);
  // The canvas page's first save is still version 1 and a sync, as before: based on 0, no updated_at bump.
  await later();
  const first = await f.call('PUT', f.board(c.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  assert.deepEqual([first.status, first.body.version], [200, 1]);
  assert.equal(await f.updatedAt(c.name), created);
  // When the board cannot be written, the canvas is not made either.
  f.sqlite.exec("CREATE TRIGGER no_board BEFORE INSERT ON learn_boards BEGIN SELECT RAISE(ABORT, 'board write failed'); END");
  const before = f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n;
  assert.equal((await f.call('POST', '/api/canvases', { as: 'ana', body: { title: 'Half made' } })).status, 400);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n, before, 'no canvas without its board');
  f.sqlite.exec('DROP TRIGGER no_board');
  // Undo of an untouched canvas (create_canvas) takes its board with it.
  const undone = await f.create('ana', 'Undo me');
  assert.equal((await f.call('DELETE', `/api/apps/${undone.name}`, { as: 'ana' })).status, 200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learn_boards WHERE app = ?').get(undone.name).n, 0);
});

test('a canvas never opened publishes, goes unlisted and duplicates as empty; a malformed state gets a useful message', async t => {
  const f = setup(t);
  handle(f);
  const pub = await f.create('ana', 'Publish me'), link = await f.create('ana', 'Link me'), copy = await f.create('ana', 'Copy me');
  const published = await f.call('POST', `/api/apps/${pub.name}/publish`, { as: 'ana' });
  assert.deepEqual([published.status, published.body.published], [200, true], published.text);
  assert.ok(isEmpty((await f.call('GET', `/api/learn/boards/shared/${published.body.publication_token}`)).body.state), 'Explore opens it empty');
  // The Library's Unlisted for a canvas this browser holds none of: no state, or an older page's null.
  for (const body of [{ shared: true, view: true }, { shared: true, view: true, state: null }]) {
    const shared = await f.call('POST', `${f.board(link.name)}/share`, { as: 'ana', body });
    assert.equal(shared.status, 200, shared.text);
    assert.match(shared.body.sharing.view, /^[A-Za-z0-9_-]{20,64}$/);
  }
  for (const body of [{ source: { canvas: copy.name } }, { source: { canvas: copy.name }, state: null }]) {
    const made = await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body });
    assert.equal(made.status, 201, made.text);
    assert.ok(isEmpty((await f.call('GET', f.board(made.body.name), { as: 'ana' })).body.state));
  }
  // This browser's copy, when it has one, is what a share of a board with nothing saved on it yet shares.
  const withCopy = await f.create('ana', 'Shared with content');
  assert.equal((await f.call('POST', `${f.board(withCopy.name)}/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).status, 200);
  assert.deepEqual((await f.call('GET', f.board(withCopy.name), { as: 'ana' })).body.state, BOARD);
  // Only a malformed request still meets stateText, and never with its old raw words.
  const bad = await f.call('PUT', f.board(copy.name), { as: 'ana', body: { state: 'not a board' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /could not be read, so nothing was saved\. Reload the page/);
});

test('a canvas made before boards came with their rows gets its empty board on demand: publish, unlisted share and duplicate never refuse', async t => {
  const f = setup(t);
  handle(f);
  const pub = await f.create('ana', 'Old A'), link = await f.create('ana', 'Old B'), copy = await f.create('ana', 'Old C');
  f.sqlite.prepare('DELETE FROM learn_boards').run();
  assert.equal((await f.call('GET', f.board(pub.name), { as: 'ana' })).body.exists, false, 'opening one still reads none: a GET writes nothing');
  assert.equal((await f.call('POST', `/api/apps/${pub.name}/publish`, { as: 'ana' })).body.published, true);
  assert.equal((await f.call('POST', `${f.board(link.name)}/share`, { as: 'ana', body: { shared: true, view: true } })).status, 200);
  assert.equal((await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: copy.name }, state: null } })).status, 201);
  for (const c of [pub, link, copy]) {
    const board = (await f.call('GET', f.board(c.name), { as: 'ana' })).body;
    assert.deepEqual([board.version, isEmpty(board.state)], [0, true], c.title);
  }
  // Content still only in the browser that made it goes up on that browser's next open as version 1, never a 409.
  const pushed = await f.call('PUT', f.board(copy.name), { as: 'ana', body: { state: BOARD, version: 0 } });
  assert.deepEqual([pushed.status, pushed.body.version], [200, 1]);
});
