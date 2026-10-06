// Canvas forking (docs/features/canvas-forking.md) through the routes the app worker serves
// (dev-worker.js: canvasRoute -> canvasesFetch, /api/learn/boards/* -> learnBoardsRoute), on LEARN_DB
// as node:sqlite built from repository-schema.sql. Live storage records and throws: a passing test
// also proves forking never touches production D1, R2 or small-cp writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';
import { forkState, learnBoardsRoute } from '../src/learn-boards.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0004-canvas-forks.sql', import.meta.url), 'utf8');
const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' }, cara: { email: 'cara@test', org: 'cara-ws' } };

function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const liveWrites = [];
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.method !== 'GET') { liveWrites.push(`${request.method} ${new URL(request.url).pathname}`); throw new Error('live small-cp write'); }
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...who, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  const objects = new Map();
  const LEARN_MEDIA = {
    put: async (key, bytes, { httpMetadata, customMetadata }) => { objects.set(key, { bytes: new Uint8Array(bytes), httpMetadata, customMetadata }); },
    get: async key => { const object = objects.get(key); return object ? { body: object.bytes, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata } : null; },
    list: async ({ prefix }) => ({ objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, customMetadata: object.customMetadata })), truncated: false }),
  };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls, liveWrites], [[], [], []], 'forking touched production storage'));
  const call = async (method, path, { as, body, raw, headers: extra = {} } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...extra, ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    const type = response.headers.get('content-type') || '';
    return { status: response.status, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
  };
  const canvas = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const save = (as, name, state, version) => call('PUT', `/api/learn/boards/${name}/main`, { as, body: { state, ...(version ? { version } : {}) } });
  const share = async (as, name, on = true) => (await call('POST', `/api/learn/boards/${name}/main/share`, { as, body: { shared: on, view: on } })).body.sharing;
  let n = 0;
  const fork = (as, source, extra = {}) => call('POST', '/api/learn/boards/fork', { as, body: { source, key: `fork-key-${++n}`, ...extra } });
  const library = async as => (await call('GET', '/api/canvases', { as })).body.canvases;
  const app = async (as, name) => (await call('GET', `/api/apps/${name}`, { as })).body;
  const board = async (as, name) => (await call('GET', `/api/learn/boards/${name}/main`, { as })).body;
  return { sqlite, call, canvas, save, share, fork, library, app, board, objects };
}

const BOARD = {
  strokes: [{ id: 'ink' }], shapes: [{ id: 'rect' }], items: [{ id: 'note', text: 'remember' }], links: [], groups: [], areas: [],
  blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax' }],
  exchanges: [{ id: 'q1', question: 'why exp?', answer: 'positive', status: 'done', dx: 0, dy: 0 }],
};

test('the migration is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /\b(DROP|ALTER|DELETE|UPDATE)\b/i);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvas_forks)').all().map(c => c.name),
    ['org', 'canvas', 'owner_email', 'fork_key', 'forked_from_org', 'forked_from_canvas_id', 'root_org', 'root_canvas_id', 'forked_from_owner_id', 'forked_from_title', 'forked_from_share', 'forked_at']);
});

test('forking your own canvas copies this browser\'s board into a new canvas of yours, listed in your Library at once', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  const made = await f.fork('ana', { canvas: a.name }, { state: BOARD });
  assert.equal(made.status, 201);
  assert.match(made.body.name, /^canvas-[a-f0-9]{8}$/);
  assert.equal(made.body.url, `/apps/${made.body.name}?tab=learn`);
  const listed = await f.library('ana');
  assert.deepEqual(listed.map(c => c.name), [made.body.name, a.name].sort((x, y) => (x === made.body.name ? -1 : y === made.body.name ? 1 : 0)));
  const copy = listed.find(c => c.name === made.body.name);
  assert.deepEqual([copy.owner_email, copy.org, copy.project, copy.title, copy.forked_from_title, copy.forked_from_url], ['ana@test', 'ana-ws', null, 'Attention', 'Attention', `/apps/${a.name}`]);
  assert.equal(listed.find(c => c.name === a.name).fork_count, 1);
  assert.deepEqual((await f.board('ana', made.body.name)).state, BOARD, 'the clone is the persisted board');
  // The source never had a server copy; forking does not make one.
  assert.equal((await f.board('ana', a.name)).exists, false);
});

test('your own canvas without this browser\'s copy forks its server copy, or is refused with nothing made', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  const refused = await f.fork('ana', { canvas: a.name });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /nothing to fork/);
  assert.equal((await f.library('ana')).length, 1, 'no fork row on a refusal');
  await f.save('ana', a.name, BOARD);
  const made = await f.fork('ana', { canvas: a.name });
  assert.equal(made.status, 201);
  assert.deepEqual((await f.board('ana', made.body.name)).state, BOARD);
});

test('a shared canvas forks for any signed-in viewer: the server copy, its files, never the owner\'s private state', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  const extra = { ...BOARD, selection: ['b1'], view: { x: 1, y: 2, z: 3 }, voice: { transcript: 'private words' }, tutor: { evidence: 'x' },
    exchanges: [...BOARD.exchanges, { id: 'q2', question: 'mid answer', answer: 'half', status: 'streaming' }],
    blocks: [...BOARD.blocks, { id: 'nb', type: 'notebook', notebook_id: 'nb-original' }] };
  await f.save('ana', a.name, extra);
  const links = await f.share('ana', a.name);
  await f.call('PUT', `/api/learn/boards/${a.name}/main/assets/${encodeURIComponent('pdf:p')}`, { as: 'ana', raw: new Uint8Array([4, 5]), headers: { 'Content-Type': 'application/pdf' } });
  await f.call('PUT', `/api/learn/boards/${a.name}/main/assets/${encodeURIComponent('notebook:nb-original')}`, { as: 'ana', raw: '{"a.py":{"content":"x"}}', headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string' } });
  // Private things that live beside the canvas: the chat sheet's thread, an agent-only document, a Rabbit Hole.
  f.sqlite.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('canvaschat-x','ana-ws','ana@test',?,'','Private chat')").run(a.name);
  f.sqlite.prepare("INSERT INTO canvas_context_documents(org,owner_email,app,id,name,kind,size) VALUES('ana-ws','ana@test',?,'d1','notes.pdf','pdf',1)").run(a.name);
  f.sqlite.prepare("INSERT INTO canvas_dives(org,owner_email,child,parent_app,origin_block_id,dive_json) VALUES('ana-ws','ana@test','canvas-0000beef',?,'b1','{}')").run(a.name);

  const made = await f.fork('ben', { token: links.view });
  assert.equal(made.status, 201);
  assert.equal(made.body.files, 2);
  const copy = (await f.library('ben')).find(c => c.name === made.body.name);
  assert.deepEqual([copy.owner_email, copy.org, copy.title, copy.forked_from_title, copy.forked_from_url], ['ben@test', 'ben-ws', 'Attention', 'Attention', `/b/${links.view}`]);
  const state = (await f.board('ben', made.body.name)).state;
  assert.deepEqual(Object.keys(state).sort(), ['areas', 'blocks', 'exchanges', 'groups', 'items', 'links', 'shapes', 'strokes'], 'content only: no selection, view, voice or tutor state');
  assert.deepEqual(state.exchanges.map(e => e.status), ['done', 'done'], 'chat cards arrive settled');
  assert.deepEqual(state.shapes, BOARD.shapes);
  const notebook = state.blocks.find(b => b.type === 'notebook');
  assert.notEqual(notebook.notebook_id, 'nb-original', 'a notebook gets its own workspace');
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${made.body.name}/main/assets`, { as: 'ben' })).body.keys.sort(), [`notebook:${notebook.notebook_id}`, 'pdf:p'].sort());
  // Nothing private travelled.
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM threads WHERE scope_ref = ?').get(made.body.name).n, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_context_documents WHERE app = ?').get(made.body.name).n, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_dives WHERE parent_app = ?').get(made.body.name).n, 0);
  const fresh = await f.board('ben', made.body.name);
  assert.deepEqual(fresh.sharing, { shared: false, view: null, edit: null, public_view: false }, 'the fork starts private');
  // And the fork's record names no more of the source than its title and a link the forker already had.
  for (const key of ['forked_from_share', 'forked_from_owner_id', 'root_canvas_id', 'root_org', 'forked_from_org', 'forked_from_canvas_id', 'fork_key']) assert.equal(key in copy, false, key);
});

test('fork and source are independent: edits, renames and deletes on either side never reach the other', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  await f.save('ana', a.name, BOARD);
  const links = await f.share('ana', a.name);
  const b = (await f.fork('ben', { token: links.view })).body;
  // The fork is fully the forker's: edit, rename, share and fork again.
  assert.equal((await f.save('ben', b.name, { ...BOARD, blocks: [] }, 1)).body.version, 2);
  assert.equal((await f.call('PATCH', `/api/apps/${b.name}`, { as: 'ben', body: { title: 'My attention notes' } })).status, 200);
  assert.ok((await f.share('ben', b.name)).view, 'a fork can be shared');
  assert.equal((await f.fork('ben', { canvas: b.name }, { state: BOARD })).status, 201, 'and forked');
  const hole = await f.call('POST', '/api/canvases/dives', { as: 'ben', body: { name: 'canvas-0000d1ee', title: 'Softmax', parent: { app: b.name, board: 'main' }, origin_block_id: 'b1', dive: {} } });
  assert.equal(hole.status, 201, 'and it makes its own Rabbit Holes');
  assert.deepEqual((await f.board('ana', a.name)).state.blocks, BOARD.blocks, 'the source board is untouched');
  assert.equal((await f.app('ana', a.name)).title, 'Attention', 'the source title is untouched');
  await f.save('ana', a.name, { ...BOARD, shapes: [] }, 2);
  assert.deepEqual((await f.board('ben', b.name)).state.shapes, BOARD.shapes, 'no sync from the source');
  // The source owner cannot reach the fork.
  assert.equal((await f.call('GET', `/api/apps/${b.name}`, { as: 'ana' })).status, 404);
  // Deleting the source leaves the fork whole; deleting a fork leaves its source.
  assert.equal((await f.call('DELETE', `/api/apps/${a.name}`, { as: 'ana' })).status, 200);
  assert.equal((await f.app('ben', b.name)).title, 'My attention notes');
  assert.equal((await f.board('ben', b.name)).version, 2);
  const own = (await f.fork('ben', { canvas: b.name }, { state: BOARD })).body;
  assert.equal((await f.call('DELETE', `/api/apps/${own.name}`, { as: 'ben' })).status, 200);
  assert.equal((await f.app('ben', b.name)).name, b.name);
});

test('lineage: A -> B -> C stores B as the parent and A as the root, across owners and workspaces', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  await f.save('ana', a.name, BOARD);
  const b = (await f.fork('ben', { token: (await f.share('ana', a.name)).view })).body;
  const c = (await f.fork('cara', { token: (await f.share('ben', b.name)).view })).body;
  const d = (await f.fork('cara', { canvas: c.name }, { state: BOARD })).body;
  const row = name => f.sqlite.prepare('SELECT * FROM canvas_forks WHERE canvas = ?').get(name);
  assert.deepEqual([row(b.name).forked_from_org, row(b.name).forked_from_canvas_id, row(b.name).root_org, row(b.name).root_canvas_id], ['ana-ws', a.name, 'ana-ws', a.name]);
  assert.deepEqual([row(c.name).forked_from_org, row(c.name).forked_from_canvas_id, row(c.name).root_org, row(c.name).root_canvas_id], ['ben-ws', b.name, 'ana-ws', a.name]);
  assert.deepEqual([row(d.name).forked_from_canvas_id, row(d.name).root_canvas_id], [c.name, a.name]);
  assert.deepEqual([row(c.name).forked_from_owner_id, row(c.name).owner_email, row(c.name).org], ['ben@test', 'cara@test', 'cara-ws']);
  assert.ok(row(c.name).forked_at);
});

test('the title snapshot survives a rename of the source and of the fork', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  const b = (await f.fork('ana', { canvas: a.name }, { state: BOARD })).body;
  await f.call('PATCH', `/api/apps/${a.name}`, { as: 'ana', body: { title: 'Attention, renamed' } });
  await f.call('PATCH', `/api/apps/${b.name}`, { as: 'ana', body: { title: 'My copy' } });
  const fork = await f.app('ana', b.name);
  assert.deepEqual([fork.title, fork.forked_from_title], ['My copy', 'Attention']);
});

test('View original opens while the source is reachable, and reads unavailable - leaking nothing - once it is not', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  await f.save('ana', a.name, BOARD);
  const first = await f.share('ana', a.name);
  const viaLink = (await f.fork('ben', { token: first.view })).body;
  assert.equal((await f.app('ben', viaLink.name)).forked_from_url, `/b/${first.view}`);
  // Ana renames, then turns the link off and shares again: Ben's link is dead and the new one is not his.
  await f.call('PATCH', `/api/apps/${a.name}`, { as: 'ana', body: { title: 'Secret new title' } });
  await f.share('ana', a.name, false);
  const again = await f.share('ana', a.name);
  assert.notEqual(again.view, first.view);
  const lost = await f.app('ben', viaLink.name);
  assert.deepEqual([lost.forked_from_title, lost.forked_from_url], ['Attention', null]);
  assert.doesNotMatch(JSON.stringify(lost), new RegExp(`Secret new title|${again.view}|ana@test`), 'nothing about the source beyond the snapshot');
  // An own source opens by its page until it is deleted.
  const mine = await f.canvas('ben', 'Mine');
  const ownFork = (await f.fork('ben', { canvas: mine.name }, { state: BOARD })).body;
  assert.equal((await f.app('ben', ownFork.name)).forked_from_url, `/apps/${mine.name}`);
  await f.call('DELETE', `/api/apps/${mine.name}`, { as: 'ben' });
  assert.deepEqual([(await f.app('ben', ownFork.name)).forked_from_url, (await f.app('ben', ownFork.name)).forked_from_title], [null, 'Mine']);
  // A deleted canvas whose share row is still live does not count as reachable either.
  const shared = await f.canvas('ana', 'Shared then deleted');
  await f.save('ana', shared.name, BOARD);
  const token = (await f.share('ana', shared.name)).view;
  const orphan = (await f.fork('ben', { token })).body;
  await f.call('DELETE', `/api/apps/${shared.name}`, { as: 'ana' });
  assert.equal((await f.app('ben', orphan.name)).forked_from_url, null);
});

test('fork counts are direct forks only: A with forks B and C, and D forked from B, reads A = 2 and B = 1', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  await f.save('ana', a.name, BOARD);
  const link = (await f.share('ana', a.name)).view;
  const b = (await f.fork('ben', { token: link })).body;
  const c = (await f.fork('ana', { canvas: a.name }, { state: BOARD })).body;
  await f.fork('cara', { token: (await f.share('ben', b.name)).view });
  const count = async (as, name) => (await f.library(as)).find(x => x.name === name).fork_count;
  assert.equal(await count('ana', a.name), 2);
  assert.equal(await count('ben', b.name), 1);
  assert.equal(await count('ana', c.name), 0);
  assert.equal((await f.app('ana', a.name)).fork_count, 2, 'the canvas page reads the same count');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${link}`, { as: 'cara' })).body.fork_count, 2, 'and so does the shared board');
  assert.equal((await f.call('GET', `/api/learn/boards/shared/${link}`, { as: 'cara' })).body.title, 'Attention', 'a shared canvas shows its own title, never its id');
  // A deleted fork stops counting.
  await f.call('DELETE', `/api/apps/${c.name}`, { as: 'ana' });
  assert.equal(await count('ana', a.name), 1);
});

// The shared header's Fork button (owner, 2026-10-06): the canonical direct-fork count, the very number the owner's Library
// card reads, moved only by a successful fork. Two unrelated canvases of two owners, one implementation.
test('the shared header count: 0, 1 and many; only a successful fork moves it; header and Library card agree', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Kitchen chemistry');
  await f.save('ana', a.name, BOARD);
  const z = await f.canvas('ben', 'Bridge loads');
  await f.save('ben', z.name, { ...BOARD, blocks: [{ id: 'k1', type: 'quiz', question: 'Why do trusses use triangles?' }] });
  const linkA = (await f.share('ana', a.name)).view, linkZ = (await f.share('ben', z.name)).view;
  const header = async link => (await f.call('GET', `/api/learn/boards/shared/${link}`, { as: 'cara' })).body.fork_count;
  const card = async (as, name) => (await f.library(as)).find(c => c.name === name).fork_count;
  const agree = async (n, m) => assert.deepEqual([await header(linkA), await card('ana', a.name), await header(linkZ), await card('ben', z.name)], [n, n, m, m]);
  await agree(0, 0);
  // No fork, no count: signed out (the sign-in redirect), a bad key, a link that never was, an oversized copy - and Start
  // Rabbit Hole, which makes the viewer a private hole, never a fork.
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { body: { source: { token: linkA }, key: 'fork-key-anon' } })).status, 401);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token: linkA }, key: 'bad key!' } })).status, 400);
  assert.equal((await f.fork('cara', { token: 'x'.repeat(32) })).status, 404);
  assert.equal((await f.fork('ana', { canvas: a.name }, { state: { blob: 'x'.repeat(2_000_000) } })).status, 413);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${linkA}/rabbit-hole`, { as: 'cara', body: { origin: null } })).status, 201);
  await agree(0, 0);
  // One fork: its reply carries the new canonical count. The same action again is the same fork and the same count.
  const body = { source: { token: linkA }, key: 'fork-count-0001' };
  const first = await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body });
  assert.deepEqual([first.status, first.body.source_fork_count], [201, 1]);
  const again = await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body });
  assert.deepEqual([again.status, again.body.replayed, again.body.name, again.body.source_fork_count], [200, true, first.body.name, 1]);
  await agree(1, 0);
  // Many: another person, the same person with a new action, the owner through her own link; the other canvas apart.
  for (const [as, key] of [['ben', 'fork-count-0002'], ['cara', 'fork-count-0003'], ['ana', 'fork-count-0004']]) {
    assert.equal((await f.call('POST', '/api/learn/boards/fork', { as, body: { source: { token: linkA }, key } })).status, 201);
  }
  assert.equal((await f.fork('cara', { token: linkZ })).body.source_fork_count, 1);
  await agree(4, 1);
  // A reload reads the same number, and nothing on the shared board names who forked.
  const seen = JSON.stringify((await f.call('GET', `/api/learn/boards/shared/${linkA}`, { as: 'ana' })).body);
  assert.match(seen, /"fork_count":4/);
  for (const who of ['ben@test', 'cara@test', 'ben-ws', 'cara-ws', 'fork-count-000']) assert.ok(!seen.includes(who), who);
  // A link to a board that is not a canvas has no canvas to count: null, never a stale 0.
  f.sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at, shared, view_token) VALUES ('rb1', 'ana-ws', 'ana@test', 'repo-0000aaaa', 'main', '{}', '2026-10-06', 1, ?)").run('r'.repeat(32));
  assert.equal(await header('r'.repeat(32)), null);
});

test('permissions follow the existing sharing rules: no fork of a private canvas, a dead link or a pending hole', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Private');
  await f.save('ana', a.name, BOARD);
  assert.equal((await f.fork('ben', { canvas: a.name }, { state: BOARD })).status, 404, 'another workspace: not found');
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', headers: { 'x-small-workspace': 'ana-ws' }, body: { source: { canvas: a.name }, key: 'fork-key-x1' } })).status, 403, 'not a member of her workspace');
  f.sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('ana-ws','canvas-0000cafe','colleague@test','Theirs')`);
  assert.equal((await f.fork('ana', { canvas: 'canvas-0000cafe' }, { state: BOARD })).status, 403, 'same workspace, someone else\'s canvas: private');
  assert.equal((await f.fork('ana', { canvas: 'canvas-0000f00d' }, { state: BOARD })).status, 404, 'a pending hole has no row to fork');
  assert.equal((await f.fork('ben', { token: 'x'.repeat(32) })).status, 404, 'a link that never was');
  const links = await f.share('ana', a.name);
  await f.share('ana', a.name, false);
  assert.equal((await f.fork('ben', { token: links.view })).status, 404, 'a revoked link');
  const open = (await f.call('POST', `/api/learn/boards/${a.name}/main/share`, { as: 'ana', body: { shared: true, view: true, public_view: true } })).body.sharing;
  const anonymous = await f.call('POST', '/api/learn/boards/fork', { body: { source: { token: open.view }, key: 'fork-key-anon' } });
  assert.deepEqual([anonymous.status, anonymous.body.signIn], [401, true], 'a public viewer signs in to fork');
  assert.equal((await f.fork('ana', { token: open.view })).status, 201, 'the owner may fork through her own link');
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: {}, key: 'fork-key-none' } })).status, 400);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { source: { token: open.view }, key: 'bad key!' } })).status, 400);
  assert.equal((await f.fork('ana', { canvas: a.name }, { state: { blob: 'x'.repeat(2_000_000) } })).status, 413, 'an oversized copy is refused, not truncated');
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvases WHERE owner_email = 'ben@test'").get().n, 0, 'no refusal made a canvas');
});

test('one action, one fork: a double click and a retry with the same key return the first fork', async t => {
  const f = setup(t);
  const a = await f.canvas('ana', 'Attention');
  await f.save('ana', a.name, BOARD);
  const link = (await f.share('ana', a.name)).view;
  const body = { source: { token: link }, key: 'click-0001-abcd' };
  const [one, two] = await Promise.all([f.call('POST', '/api/learn/boards/fork', { as: 'ben', body }), f.call('POST', '/api/learn/boards/fork', { as: 'ben', body })]);
  assert.deepEqual([one.status, two.status].sort(), [200, 201]);
  assert.equal(one.body.name, two.body.name);
  const retry = await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body });
  assert.deepEqual([retry.status, retry.body.name, retry.body.replayed], [200, one.body.name, true]);
  assert.equal((await f.library('ben')).length, 1);
  // A new press is a new key and a new fork; another person's same key is theirs alone.
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'ben', body: { ...body, key: 'click-0002-abcd' } })).status, 201);
  assert.equal((await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body })).status, 201);
  assert.deepEqual([(await f.library('ben')).length, (await f.library('cara')).length], [2, 1]);
  // The shared board's own path (pages loaded before the one call) forks the same way.
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${link}/fork`, { as: 'cara', body: { key: 'click-0001-abcd' } })).body.name, (await f.library('cara'))[0].name);
});

test('forkState keeps the board content and settles chat cards', () => {
  assert.deepEqual(forkState({ blocks: [{ id: 'b' }], exchanges: [{ id: 'e', status: 'thinking' }], selection: ['b'], viewport: {}, shapes: 'not a list' }),
    { blocks: [{ id: 'b' }], exchanges: [{ id: 'e', status: 'done' }] });
  assert.deepEqual(forkState(null), {});
});
