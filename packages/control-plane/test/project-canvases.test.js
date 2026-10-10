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
    const response = canvasRoute(new URL(req.url)) ? await canvasesFetch(req, env) : await learnBoardsRoute(new URL(req.url).pathname, req, env);
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

// Explore (owner, 2026-10-08): one card per published canvas, each with its own fork count, naming its parent project by
// a repository confirmed public - never a private or unknown one - and a project filter over published canvases only.
test('Explore names each published canvas\'s project by its public repository, one card and one fork count per canvas; the project filter returns only published canvases of public projects', async t => {
  const f = setup(t);
  for (const [email, handle] of [['ana@test', 'ana'], ['ben@test', 'ben']]) {
    f.sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES (?, '')").run(email);
    f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
  }
  const SECRET = 'repo-0c0c0c0c-secret', DEV = 'repo-0d0d0d0d-nanogpt';
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch, status) VALUES ('ana-ws', ?, 'ana@test', 'acme/secret', 'main', 'ready')").run(SECRET);
  const markPublic = name => f.sqlite.prepare("INSERT INTO repository_visibility (app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = ?").run(name);
  markPublic(REPO); // acme/secret has no row: unknown, so private
  const made = async (title, project = REPO, as = 'ana') => (await f.create(as, title, project)).body.name;
  const publish = async (name, as = 'ana') => assert.equal((await f.call('POST', `/api/apps/${name}/publish`, { as, body: {} })).status, 200);
  const a1 = await made('Attention'), a2 = await made('Softmax'), unlisted = await made('Unlisted notes'), secret = await made('Secret lab', SECRET), plain = await made('Standalone', null);
  await made('Private notes');
  for (const name of [a1, a2, secret, plain]) await publish(name);
  for (const app of [unlisted, REPO]) assert.equal((await f.call('POST', `/api/learn/boards/${app}/main/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).status, 200);
  // ben forked Attention once; Softmax has none.
  f.sqlite.prepare("INSERT INTO canvases (org, name, owner_email, title) VALUES ('ben-ws', 'canvas-0f0f0f0f', 'ben@test', 'Attention')").run();
  f.sqlite.prepare("INSERT INTO canvas_forks (org, canvas, owner_email, fork_key, forked_from_org, forked_from_canvas_id, forked_from_owner_id, forked_from_title) VALUES ('ben-ws', 'canvas-0f0f0f0f', 'ben@test', 'k1', 'ana-ws', ?, 'ana@test', 'Attention')").run(a1);
  const explore = async query => {
    const r = await f.call('GET', `/api/learn/boards/published${query}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return Object.fromEntries(r.body.canvases.map(c => [c.title, [c.project, c.fork_count]]));
  };
  const project = { Attention: ['karpathy/nanoGPT', 1], Softmax: ['karpathy/nanoGPT', 0] };
  assert.deepEqual(await explore(''), { ...project, 'Secret lab': [null, 0], Standalone: [null, 0] }, 'unlisted, private and the shared Main board stay out; a private repository is never named');
  assert.deepEqual(await explore('?project=karpathy/nanoGPT'), project);
  assert.deepEqual(await explore('?project=KARPATHY/nanogpt'), project, 'GitHub names compare without case');
  assert.deepEqual(await explore('?project=acme/secret'), {}, 'a private repository matches nothing');
  assert.deepEqual(await explore('?project=karpathy/nanoGPT&q=soft'), { Softmax: project.Softmax }, 'with search');
  // ben's project of the same repository on another branch: labels name the branch, and the filter can take one.
  f.sqlite.prepare("INSERT INTO repository_apps (org, name, owner_email, repo, branch, status) VALUES ('ben-ws', ?, 'ben@test', 'karpathy/nanoGPT', 'dev', 'ready')").run(DEV);
  markPublic(DEV);
  await publish(await made('Dev tour', DEV, 'ben'), 'ben');
  assert.deepEqual(await explore('?project=karpathy/nanoGPT@master'), { Attention: ['karpathy/nanoGPT@master', 1], Softmax: ['karpathy/nanoGPT@master', 0] });
  assert.deepEqual(Object.keys(await explore('?project=karpathy/nanoGPT')).sort(), ['Attention', 'Dev tour', 'Softmax'], 'every creator, every branch');
  // ana's project in Trash, then its repository found private: its canvases stay published, unlabelled and unmatched.
  f.sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', ?, '2026-10-08')").run(REPO);
  assert.deepEqual((await explore('')).Attention, [null, 1]);
  f.sqlite.prepare('DELETE FROM library_trash').run();
  f.sqlite.prepare('DELETE FROM repository_visibility WHERE app_id = (SELECT id FROM repository_apps WHERE name = ?)').run(REPO);
  assert.deepEqual(Object.keys(await explore('?project=karpathy/nanoGPT')), ['Dev tour']);
  assert.equal((await f.call('GET', '/api/learn/boards/published?project=not%20a%20repo')).status, 400);
});

// Explore's type filter (owner 2026-10-09: "Explore should have a filter for Projects or Canvas", the Library's ?type=):
// projects is one row per project label its published canvases name; canvases is the published canvases naming none.
test('Explore ?type=projects lists one row per public project with published boards, counted, searched by repository and sorted; ?type=canvases lists the boards naming no project', async t => {
  const f = setup(t);
  for (const [email, handle] of [['ana@test', 'ana'], ['ben@test', 'ben']]) {
    f.sqlite.prepare("INSERT INTO user_profiles (email, name) VALUES (?, '')").run(email);
    f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, handle);
  }
  const SECRET = 'repo-0c0c0c0c-secret', QUIET = 'repo-0e0e0e0e-quiet', BEN = 'repo-0b0b0b0b-ik';
  f.sqlite.exec(`INSERT INTO repository_apps (org, name, owner_email, repo, branch, status) VALUES ('ana-ws', '${SECRET}', 'ana@test', 'acme/secret', 'main', 'ready'),
    ('ana-ws', '${QUIET}', 'ana@test', 'acme/quiet', 'main', 'ready'), ('ben-ws', '${BEN}', 'ben@test', 'ben/robot-ik', 'main', 'ready')`);
  const markPublic = name => f.sqlite.prepare("INSERT INTO repository_visibility (app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = ?").run(name);
  for (const name of [REPO, QUIET, BEN]) markPublic(name); // acme/secret: no row, private
  const made = async (title, project = REPO, as = 'ana') => (await f.create(as, title, project)).body.name;
  const publish = async (name, as = 'ana') => assert.equal((await f.call('POST', `/api/apps/${name}/publish`, { as, body: {} })).status, 200);
  for (const name of [await made('Attention'), await made('Softmax'), await made('Secret lab', SECRET), await made('Standalone', null)]) await publish(name);
  await publish(await made('IK basics', BEN, 'ben'), 'ben');
  await made('Quiet draft', QUIET); // a public project with nothing published is no project here
  const unlisted = await made('Unlisted notes');
  assert.equal((await f.call('POST', `/api/learn/boards/${unlisted}/main/share`, { as: 'ana', body: { shared: true, view: true, state: BOARD } })).status, 200);
  const get = async query => {
    const r = await f.call('GET', `/api/learn/boards/published${query}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const projects = async query => (await get(`?type=projects${query}`)).projects.map(p => [p.label, p.repo, p.boards, p.url]);
  const NANO = ['karpathy/nanoGPT', 'karpathy/nanoGPT', 2, '/explore?project=karpathy%2FnanoGPT'], IK = ['ben/robot-ik', 'ben/robot-ik', 1, '/explore?project=ben%2Frobot-ik'];
  assert.deepEqual(await projects(''), [IK, NANO], 'newest publication first; never a private repository, a project with nothing published, or an unlisted board counted');
  assert.deepEqual(await projects('&q=NANO'), [NANO], 'by the repository, any case');
  assert.deepEqual(await projects('&q=karpathy'), [NANO], 'by its owner/repo');
  for (const q of ['secret', 'quiet', 'Attention', '%']) assert.deepEqual(await projects(`&q=${encodeURIComponent(q)}`), [], `never: ${q}`);
  assert.deepEqual((await get('?type=projects&sort=updated')).projects.map(p => p.label).sort(), ['ben/robot-ik', 'karpathy/nanoGPT']);
  assert.ok(!('canvases' in await get('?type=projects')), 'projects only');
  const canvases = async query => (await get(`?type=canvases${query}`)).canvases.map(c => [c.title, c.project]);
  assert.deepEqual(await canvases(''), [['Standalone', null], ['Secret lab', null]], 'only boards that name no project - a private repository is never named, so its board is one');
  assert.deepEqual(await canvases('&q=stand'), [['Standalone', null]]);
  assert.deepEqual(await canvases('&q=attention'), [], 'a board in a public project is under Projects');
  assert.deepEqual((await get('')).canvases.map(c => c.title).sort(), ['Attention', 'IK basics', 'Secret lab', 'Softmax', 'Standalone'], 'all: today\'s list');
  assert.equal((await f.call('GET', '/api/learn/boards/published?type=apps')).status, 400, 'Explore lists projects and canvases only');
  assert.ok(!JSON.stringify(await get('?type=projects')).includes('ana@test'));
});
