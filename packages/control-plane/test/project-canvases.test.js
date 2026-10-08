// Project canvases (docs/features/project-canvases.md): a project's extra canvases are canvas rows with `project` set, each
// with its own board; the project row counts them for the Library card. Through the routes the app worker serves, on
// LEARN_DB as node:sqlite built from repository-schema.sql. ana and ann share a workspace; ben is elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { liveDb, liveRuns } from './live-storage-spy.js';
import { canvasesFetch, canvasRoute, EMPTY_BOARD } from '../src/canvases.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { ownerRepositories } from '../src/repositories.js';

const PEOPLE = { ana: { email: 'ana@test', org: 'ana-ws' }, ann: { email: 'ann@test', org: 'ana-ws' }, ben: { email: 'ben@test', org: 'ben-ws' } };
const REPO = 'repo-0a0a0a0a-nanogpt';
const BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [], blocks: [{ id: 'b1', type: 'explanation', title: 'Attention' }] };

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
  const env = { LEARN_DB, CONTROL_PLANE, DB, RUNS };
  t.after(() => assert.deepEqual([DB.calls, RUNS.calls], [[], []], 'touched production storage'));
  sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch, status) VALUES ('ana-ws', ?, 'ana@test', 'karpathy/nanoGPT', 'master', 'ready')").run(REPO);
  const call = async (method, path, { as, body } = {}) => {
    const req = new Request(`https://app.test${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(path, req, env);
    return { status: response.status, body: await response.json() };
  };
  const create = (as, title, project = REPO) => call('POST', '/api/canvases', { as, body: { title, project } });
  const count = async () => (await ownerRepositories(env, PEOPLE.ana)).find(row => row.name === REPO).canvas_count;
  return { sqlite, call, create, count };
}

test('New canvas in a project: a canvas row naming the project, made with its own empty main board; only the project\'s owner may add one', async t => {
  const f = setup(t);
  const made = await f.create('ana', 'Attention deep dive');
  assert.equal(made.status, 201);
  assert.match(made.body.name, /^canvas-[a-f0-9]{8}$/, 'never main or a review-board name');
  assert.deepEqual([made.body.kind, made.body.project, made.body.title, made.body.board_saved], ['canvas', REPO, 'Attention deep dive', true]);
  const board = await f.call('GET', `/api/learn/boards/${made.body.name}/main`, { as: 'ana' });
  assert.deepEqual([board.status, board.body.version, board.body.state], [200, 0, JSON.parse(EMPTY_BOARD)]);
  // Same workspace, not the owner; another workspace; signed out; a project that is not there.
  for (const [as, status] of [['ann', 404], ['ben', 404], [undefined, 401]]) assert.equal((await f.create(as, 'Mine now?')).status, status, as);
  assert.equal((await f.create('ana', 'Nowhere', 'repo-ffffffff-missing')).status, 404);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases WHERE project = ?').get(REPO).n, 1, 'no refused create wrote a row');
});

test('each canvas keeps its own content: a save on one never reaches the project\'s Main canvas or another canvas', async t => {
  const f = setup(t);
  const a = (await f.create('ana', 'A')).body, b = (await f.create('ana', 'B')).body;
  assert.equal((await f.call('PUT', `/api/learn/boards/${a.name}/main`, { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${a.name}/main`, { as: 'ana' })).body.state.blocks, BOARD.blocks);
  assert.deepEqual((await f.call('GET', `/api/learn/boards/${b.name}/main`, { as: 'ana' })).body.state.blocks, []);
  assert.equal((await f.call('GET', `/api/learn/boards/${REPO}/main`, { as: 'ana' })).body.exists, false, 'the Main canvas is untouched');
  // Renamed like any canvas (the Learn title field and the Library's Rename).
  assert.equal((await f.call('PATCH', `/api/apps/${a.name}`, { as: 'ana', body: { title: 'Attention, renamed' } })).body.title, 'Attention, renamed');
  assert.equal((await f.call('PATCH', `/api/apps/${a.name}`, { as: 'ann', body: { title: 'Taken' } })).status, 403);
});

test('the project row counts its Main canvas and the owner\'s live canvases in it - never archived, trashed, someone else\'s, review boards or holes', async t => {
  const f = setup(t);
  assert.equal(await f.count(), 1, 'a project alone is its Main canvas');
  const a = (await f.create('ana', 'A')).body, b = (await f.create('ana', 'B')).body, c = (await f.create('ana', 'C')).body;
  await f.create('ana', 'Standalone', null);
  assert.equal(await f.count(), 4);
  await f.call('POST', `/api/apps/${a.name}/archive`, { as: 'ana', body: {} });
  await f.call('POST', `/api/apps/${b.name}/trash`, { as: 'ana', body: {} });
  assert.equal(await f.count(), 2, 'archived and trashed canvases leave the switcher and the count');
  await f.call('POST', `/api/apps/${a.name}/restore`, { as: 'ana', body: {} });
  assert.equal(await f.count(), 3);
  // A review board under the project, a Rabbit Hole from it (project NULL, dives.js), and a row of ann's naming it.
  assert.equal((await f.call('PUT', `/api/learn/boards/${REPO}/review`, { as: 'ana', body: { state: BOARD, version: 0 } })).status, 200);
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', 'canvas-0be1e5ac', 'ana@test', 'Hole')").run();
  f.sqlite.prepare("INSERT INTO canvas_dives (org, owner_email, child, parent_app, origin_block_id, dive_json) VALUES ('ana-ws', 'ana@test', 'canvas-0be1e5ac', ?, 'b1', '{}')").run(c.name);
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title, project) VALUES ('ana-ws', 'canvas-0ccc0ccc', 'ann@test', 'Not ana''s', ?)").run(REPO);
  assert.equal(await f.count(), 3);
});
