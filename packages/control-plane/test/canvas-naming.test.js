// Canvas naming (docs/features/canvas-naming.md): titles are labels, never identities. A typed title is kept exactly;
// only a copy the system makes for its owner - Duplicate, a fork - steps to the next free " (n)" in that owner's own
// top-level Library. Through the routes the app worker serves, on LEARN_DB as node:sqlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute, freeTitle } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';

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
  // The board-files bucket, in memory: a copy lists its source's files here (none on these boards).
  const LEARN_MEDIA = { put: async () => {}, get: async () => null, list: async () => ({ objects: [], truncated: false }) };
  const DB = liveDb(), RUNS = liveRuns();
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'naming touched production storage'));
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const create = async (as, title) => (await call('POST', '/api/canvases', { as, body: { title } })).body;
  const duplicate = (as, name) => call('POST', '/api/learn/boards/duplicate', { as, body: { source: { canvas: name }, state: BOARD } });
  let n = 0;
  const fork = (as, source) => call('POST', '/api/learn/boards/fork', { as, body: { source, key: `naming-key-${++n}`, state: BOARD } });
  const share = async (as, name) => (await call('POST', `/api/learn/boards/${name}/main/share`, { as, body: { shared: true, view: true, state: BOARD } })).body.sharing.view;
  const titles = async as => (await call('GET', '/api/canvases', { as })).body.canvases.map(c => c.title).sort();
  return { sqlite, env, call, create, duplicate, fork, share, titles };
}

// The Library sends localBoard(), null when this browser holds no copy (owner bug, 2026-10-08: "state must be a board object").
test('Duplicate with no browser copy (state: null) copies the server copy, which exists from creation', async t => {
  const f = setup(t);
  const src = await f.create('ana', 'Attention Playground');
  // A canvas is saved at creation (canvas-persistence.md, owner 2026-10-08): a never-opened one duplicates as empty.
  const empty = await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: src.name }, state: null } });
  assert.equal(empty.status, 201);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${empty.body.name}/main`, { as: 'ana' })).body.state.blocks, []);
  await f.call('PUT', `/api/learn/boards/${src.name}/main`, { as: 'ana', body: { state: BOARD } });
  const made = await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: src.name }, state: null } });
  assert.equal(made.status, 201);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${made.body.name}/main`, { as: 'ana' })).body.state.blocks, BOARD.blocks);
  assert.equal((await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { canvas: src.name }, state: [] } })).status, 400, 'a non-board is still refused');
});

test('two different people may own canvases with exactly the same title', async t => {
  const f = setup(t);
  const a = await f.create('ana', 'Transformer Playground'), b = await f.create('ben', 'Transformer Playground');
  assert.equal(a.title, 'Transformer Playground');
  assert.equal(b.title, 'Transformer Playground');
  assert.notEqual(a.name, b.name, 'identity is the canonical name, never the title');
});

test('a typed title is kept exactly, even when the owner already has it', async t => {
  const f = setup(t);
  await f.create('ana', 'Binary Search');
  assert.equal((await f.create('ana', 'Binary Search')).title, 'Binary Search');
  assert.deepEqual(await f.titles('ana'), ['Binary Search', 'Binary Search']);
});

test('Duplicate makes "(2)", then "(3)": a private copy of the owner\'s, never a fork', async t => {
  const f = setup(t);
  const src = await f.create('ana', 'Attention Playground');
  const one = await f.duplicate('ana', src.name), two = await f.duplicate('ana', src.name);
  assert.equal(one.status, 201);
  assert.deepEqual([one.body.title, two.body.title], ['Attention Playground (2)', 'Attention Playground (3)']);
  assert.equal(one.body.duplicate, true);
  // Duplicating the copy steps on from the base title too.
  assert.equal((await f.duplicate('ana', one.body.name)).body.title, 'Attention Playground (4)');
  const forks = f.sqlite.prepare('SELECT count(*) AS n FROM canvas_forks').get().n;
  assert.equal(forks, 0, 'no fork row: no provenance, no fork count');
  const listed = (await f.call('GET', '/api/canvases', { as: 'ana' })).body.canvases;
  assert.equal(listed.find(c => c.name === src.name).fork_count, 0);
  assert.equal(listed.find(c => c.name === one.body.name).forked_from_title, null);
  const board = (await f.call('GET', `/api/learn/boards/${one.body.name}/main`, { as: 'ana' })).body;
  assert.deepEqual(board.state.blocks, BOARD.blocks, 'the content is copied');
  assert.equal(board.sharing?.shared ?? false, false, 'the copy is private');
});

test('the suffix takes the next free number, skipping one already in use', async t => {
  const f = setup(t);
  const src = await f.create('ana', 'Example');
  await f.create('ana', 'Example (2)'); // typed by hand, so it is a real occupant
  assert.equal((await f.duplicate('ana', src.name)).body.title, 'Example (3)');
  assert.equal(await freeTitle(f.env.LEARN_DB, 'ana-ws', 'ana@test', 'Example'), 'Example (4)');
  assert.equal(await freeTitle(f.env.LEARN_DB, 'ana-ws', 'ana@test', 'Untaken'), 'Untaken');
});

test('a fork keeps the source title when the forker has none like it, and steps on when they do', async t => {
  const f = setup(t);
  const src = await f.create('ana', 'Transformer Playground');
  const token = await f.share('ana', src.name);
  const first = await f.fork('ben', { token });
  assert.equal(first.body.title, 'Transformer Playground');
  const second = await f.fork('ben', { token });
  assert.equal(second.body.title, 'Transformer Playground (2)');
  const provenance = f.sqlite.prepare('SELECT forked_from_title FROM canvas_forks WHERE canvas = ?').get(second.body.name);
  assert.equal(provenance.forked_from_title, 'Transformer Playground', 'provenance keeps the source\'s own title');
});

test('an explicit rename to a title the owner already uses is allowed and never rewritten', async t => {
  const f = setup(t);
  await f.create('ana', 'Gradients');
  const other = await f.create('ana', 'Something else');
  const renamed = await f.call('PATCH', `/api/apps/${other.name}`, { as: 'ana', body: { title: 'Gradients' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.title, 'Gradients');
  assert.equal(renamed.body.name, other.name, 'a rename never changes the canonical id');
});

test('duplicate titles never touch routing or identity: each opens by its own name', async t => {
  const f = setup(t);
  const a = await f.create('ana', 'Same'), b = await f.create('ana', 'Same');
  const [openA, openB] = [await f.call('GET', `/api/apps/${a.name}`, { as: 'ana' }), await f.call('GET', `/api/apps/${b.name}`, { as: 'ana' })];
  assert.deepEqual([openA.body.name, openB.body.name], [a.name, b.name]);
});

test('a project and a canvas may share a title; nested Rabbit Holes and other owners never count', async t => {
  const f = setup(t);
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch) VALUES ('ana-ws', 'repo-optics', 'ana@test', 'ana/Optics', 'main')").run();
  const root = await f.create('ana', 'Physics');
  // A nested hole of Ana's titled "Optics" (dives.js keeps holes out of the Library) and Ben's own "Optics".
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', 'canvas-0be1e5ab', 'ana@test', 'Optics')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', 'canvas-0be1e5ab', ?, 'b1', '{}')").run(root.name);
  const bens = await f.create('ben', 'Optics');
  const forked = await f.fork('ana', { token: await f.share('ben', bens.name) });
  assert.equal(forked.body.title, 'Optics', 'neither the project, the hole nor Ben\'s canvas makes it "Optics (2)"');
});

test('Duplicate is for your own canvas only', async t => {
  const f = setup(t);
  const bens = await f.create('ben', 'Mine');
  assert.equal((await f.duplicate('ana', bens.name)).status, 404, 'another workspace\'s canvas is not found');
  const token = await f.share('ben', bens.name);
  assert.equal((await f.call('POST', '/api/learn/boards/duplicate', { as: 'ana', body: { source: { token } } })).status, 400, 'a share link forks; it never duplicates');
  assert.equal((await f.call('POST', '/api/learn/boards/duplicate', { body: { source: { canvas: bens.name } } })).status, 401);
});
