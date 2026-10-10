import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';

// /dive (docs/features/dive-v1.md). LEARN_DB is real SQLite from repository-schema.sql; the live DB
// throws on any use, so a passing test also proves dives never touch live D1.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0001-canvas-dives.sql', import.meta.url), 'utf8');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  sqlite.exec("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('team','repo-example','owner@test','example/project','main')");
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-00000000','owner@test','Attention')");
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); }, batch() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', user_id: 'u-owner-1a2b', apps: [] }) } };
  const send = async (method, path, body, headers = {}) => {
    const res = await canvasesFetch(new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: res.status, body: await res.json() };
  };
  let n = 0;
  const dive = (parent, origin, title = 'Hole', extra = {}) => send('POST', '/api/canvases/dives', { name: `canvas-${(++n).toString(16).padStart(8, '0')}`, title, parent, origin_block_id: origin, dive: { concept: title, created_by: 'learner_slash', return_point: { block_id: origin, viewport: { x: 1, y: 2, zoom: 1 } } }, ...extra });
  const where = (app, board = 'main', headers) => send('GET', `/api/canvases/dives?app=${app}&board=${board}`, null, headers);
  return { sqlite, env, send, dive, where };
}
const ROOT = { app: 'canvas-00000000', board: 'nanogpt-deep-dive' };

test('the migration is additive, re-runnable and exactly what repository-schema.sql applies', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(migration); sqlite.exec(migration);
  assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trim()));
  assert.doesNotMatch(migration, /\b(DROP|ALTER|DELETE|UPDATE)\b/i);
});

test('dive routes are canvas traffic, and only these shapes', () => {
  for (const [url, expected] of [['/api/canvases/dives', true], ['/api/canvases/dives?app=canvas-00000000', true], ['/api/canvases/dives/canvas-0a1b2c3d', true], ['/api/canvases/dives/x', false], ['/api/canvases/other', false]])
    assert.equal(canvasRoute(new URL(url, 'https://dev.test')), expected, url);
});

test('a hole is persisted with its canvas and link together; one child per originating card', async t => {
  const f = fixture(t);
  const made = await f.dive(ROOT, 'nanogpt-c11-causal-mask', 'Softmax');
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.kind, made.body.title, made.body.owner_email], ['canvas', 'Softmax', 'owner@test']);
  const again = await f.dive(ROOT, 'nanogpt-c11-causal-mask', 'Something else');
  assert.equal(again.status, 409); assert.equal(again.body.existing, made.body.name);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n, 2);
  // A pending hole is the client's: nothing exists for a name the client never posted.
  assert.equal((await f.where('canvas-0000ffff')).status, 404);
  // Bad input stops before any write.
  for (const body of [{ name: 'canvas-xyz' }, { title: '' }, { origin_block_id: '' }, { parent: { app: 'canvas-deadbeef' } }, { parent: { app: 'counter' } }, { parent: { ...ROOT, board: '../x' } }]) {
    const res = await f.send('POST', '/api/canvases/dives', { name: 'canvas-0000abcd', title: 'X', parent: ROOT, origin_block_id: 'b', dive: {}, ...body });
    assert.ok(res.status === 400 || res.status === 404, JSON.stringify(body));
  }
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_dives').get().n, 1);
});

test('path runs root to current with no depth cap; children are the immediate ones only', async t => {
  const f = fixture(t);
  let parent = ROOT; const names = [];
  for (let depth = 1; depth <= 7; depth++) {
    const { body } = await f.dive(parent, `card-${depth}`, `Level ${depth}`);
    names.push(body.name); parent = { app: body.name, board: 'main' };
  }
  const deepest = await f.where(names.at(-1));
  assert.deepEqual(deepest.body.path.map(level => level.title), ['Attention', ...Array.from({ length: 7 }, (_, i) => `Level ${i + 1}`)]);
  assert.equal(deepest.body.path[0].board, 'nanogpt-deep-dive');
  assert.equal(deepest.body.dive.return_point.block_id, 'card-7');
  // Branching: two cards on level 1 give it two children; the root still has one.
  await f.dive({ app: names[0], board: 'main' }, 'another-card', 'Branch');
  assert.deepEqual((await f.where(names[0])).body.children.map(child => child.title), ['Level 2', 'Branch']);
  const root = await f.where(ROOT.app, ROOT.board);
  assert.deepEqual(root.body.children.map(child => [child.title, child.origin_block_id]), [['Level 1', 'card-1']]);
  assert.equal(root.body.dive, null);
  // Another board of the same canvas is another level.
  assert.deepEqual((await f.where(ROOT.app, 'main')).body.children, []);
  // Repository project boards can be roots too.
  assert.equal((await f.dive({ app: 'repo-example', board: 'main' }, 'card-r', 'Repo hole')).status, 201);
  assert.equal((await f.where('repo-example')).body.path[0].title, 'example/project');
});

test('rename is the canvas PATCH; the tree is private to its owner', async t => {
  const f = fixture(t);
  const { body } = await f.dive(ROOT, 'card-1', 'Softmax');
  assert.equal((await f.send('PATCH', `/api/apps/${body.name}`, { title: 'Softmax, the long way' })).status, 200);
  assert.equal((await f.where(ROOT.app, ROOT.board)).body.children[0].title, 'Softmax, the long way');
  assert.equal((await f.where(body.name, 'main', { 'x-email': 'colleague@test' })).status, 404);
  assert.equal((await f.send('DELETE', `/api/canvases/dives/${body.name}`, null, { 'x-email': 'colleague@test' })).status, 404);
  assert.equal((await f.dive({ app: body.name }, 'card-x', 'Theirs', {})).status, 201);
});

test('delete: a leaf goes; a hole with holes inside answers 409 with them listed until subtree=1', async t => {
  const f = fixture(t);
  const a = (await f.dive(ROOT, 'card-a', 'A')).body.name;
  const b = (await f.dive({ app: a }, 'card-b', 'B')).body.name;
  const c = (await f.dive({ app: b }, 'card-c', 'C')).body.name;
  const leaf = await f.send('DELETE', `/api/canvases/dives/${c}`);
  assert.deepEqual([leaf.status, leaf.body.deleted], [200, [c]]);
  const c2 = (await f.dive({ app: b }, 'card-c', 'C again')).body.name; // the portal is free again
  const guarded = await f.send('DELETE', `/api/canvases/dives/${a}`);
  assert.equal(guarded.status, 409);
  assert.deepEqual(guarded.body.descendants.map(hole => hole.name), [b, c2]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_dives').get().n, 3);
  const all = await f.send('DELETE', `/api/canvases/dives/${a}?subtree=1`);
  assert.deepEqual(all.body.deleted, [a, b, c2]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_dives').get().n, 0);
  assert.deepEqual(f.sqlite.prepare('SELECT name FROM canvases').all().map(row => row.name), ['canvas-00000000']);
  assert.deepEqual((await f.where(ROOT.app, ROOT.board)).body.children, []);
  // A root canvas is not a hole: the dive DELETE never removes it.
  assert.equal((await f.send('DELETE', '/api/canvases/dives/canvas-00000000')).status, 404);
});

// Chat inside an empty pending hole (stabilization 2026-09-30): the ask and its history work before
// the hole's canvas row exists, and nothing about it persists the hole.
test('a pending hole answers chat as a virtual canvas of its owner, writes no canvas row, and lists its own history', async t => {
  const { canvasAccess } = await import('../src/canvases.js');
  const f = fixture(t);
  const ask = (headers, pending) => canvasAccess(new Request('https://dev.test/api/learn/ask', { headers }), f.env, 'canvas-0000beef', pending);
  const pending = { parent: ROOT, title: 'Softmax' };
  const app = await ask({}, pending);
  assert.deepEqual([app.kind, app.name, app.title, app.pending, app.owner_email, app.user_id], ['canvas', 'canvas-0000beef', 'Softmax', true, 'owner@test', 'u-owner-1a2b']);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM canvases WHERE name='canvas-0000beef'").get().n, 0, 'chat alone never persists the hole');
  assert.equal((await ask({})).status, 404, 'without the pending identity it is still not found');
  assert.equal((await ask({}, { parent: { app: 'canvas-deadbeef' }, title: 'X' })).status, 404, 'only under a parent you own');
  assert.equal((await ask({ 'x-email': 'colleague@test' }, pending)).status, 404, "never under someone else's board");
  assert.equal((await ask({}, { parent: ROOT, title: '' })).status, 404);
  // History for the hole's name reads only this user's threads.
  f.sqlite.exec("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('canvaschat-p1','team','owner@test','canvas-0000beef','','Why?')");
  const list = await f.send('GET', '/api/ask/threads?scope=learn&ref=canvas-0000beef');
  assert.equal(list.status, 200);
  // Once persisted, the real row wins and the thread is already there.
  assert.equal((await f.dive(ROOT, 'card-p', 'Softmax', { name: 'canvas-0000beef' })).status, 201);
  assert.equal((await ask({}, pending)).pending, undefined);
});

test('nested holes stay out of the top-level canvas lists (Home, Library, Search) but still open by URL', async t => {
  const f = fixture(t);
  const child = (await f.dive(ROOT, 'card-1', 'Softmax')).body.name;
  const listed = (await f.send('GET', '/api/canvases')).body.canvases.map(canvas => canvas.name);
  assert.deepEqual(listed, ['canvas-00000000'], 'only the root');
  assert.equal((await f.send('GET', `/api/apps/${child}`)).status, 200, 'the hole itself still opens');
  await f.send('DELETE', `/api/canvases/dives/${child}`);
  assert.deepEqual((await f.send('GET', '/api/canvases')).body.canvases.map(canvas => canvas.name), ['canvas-00000000']);
});

// The canvas title's menu (owner r35): every kept hole under the root at any depth, parents before children, each with its
// parent; from any level of the tree, the same list. Another board of the root is another tree; another owner sees none.
test('the tree carries every kept hole under the root at any depth, each with its parent', async t => {
  const f = fixture(t);
  const a = (await f.dive(ROOT, 'card-a', 'A')).body.name;
  const b = (await f.dive(ROOT, 'card-b', 'B')).body.name;
  const a1 = (await f.dive({ app: a, board: 'main' }, 'card-a1', 'A1')).body.name;
  const a1x = (await f.dive({ app: a1, board: 'main' }, 'card-a1x', 'A1x')).body.name;
  await f.dive({ app: ROOT.app, board: 'main' }, 'card-other', 'On another board');
  const want = [['A', ROOT.app], ['B', ROOT.app], ['A1', a], ['A1x', a1]];
  for (const app of [[ROOT.app, ROOT.board], [a1x], [b]]) assert.deepEqual((await f.where(...app)).body.holes.map(h => [h.title, h.parent]), want, app.join(' '));
  assert.deepEqual((await f.where(a1x)).body.holes.map(h => h.name), [a, b, a1, a1x]);
  assert.deepEqual((await f.where(ROOT.app, 'main')).body.holes.map(h => h.title), ['On another board']);
  assert.equal((await f.where(ROOT.app, ROOT.board, { 'x-email': 'other@test' })).status, 404);
});
