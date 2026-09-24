import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { canvasesFetch } from '../src/canvases.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');

// small-learn-dev already holds the older tables and the whole file is applied to it
// again (T12 prep), so the file must stay additive and re-runnable.
test('repository-schema.sql adds the canvases table (T02 section 8.1) and re-applies cleanly', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(schema); sqlite.exec(schema);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvases)').all().map(c => c.name), ['id', 'org', 'name', 'owner_email', 'title', 'project', 'created_at', 'archived_at', 'device_id']);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','A')");
  assert.throws(() => sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','other@test','B')"), /UNIQUE/);
  assert.ok(sqlite.prepare('SELECT created_at FROM canvases').get().created_at);
});

// ---- canvas record API (Task 6.1) ----
// LEARN_DB is real SQLite from repository-schema.sql. The live DB throws on any use,
// so a passing test proves canvas routes never touch live D1.
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  sqlite.exec("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('team','repo-example','owner@test','example/project','main')");
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const seen = [];
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); }, batch() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => { seen.push(`${req.method} ${new URL(req.url).pathname}`); return req.headers.get('cookie') === 'denied' ? new Response('', { status: 401 }) : Response.json({ org: req.headers.get('x-small-workspace') || 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', apps: [] }); } } };
  const send = (method, path, body, headers = {}) => canvasesFetch(new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  return { sqlite, env, seen, send };
}
const colleague = { 'x-email': 'colleague@test' };

test('canvas records live in LEARN_DB, open for their owner only, and never touch live D1', async t => {
  const f = fixture(t);
  const created = await f.send('POST', '/api/canvases', { title: '  Attention  ', device_id: '3f0c9a2e-7b1d-4c55-9e0a-2d4f6b8c1e3a' });
  assert.equal(created.status, 201);
  const canvas = await created.json();
  assert.match(canvas.name, /^canvas-[a-f0-9]{8}$/);
  assert.deepEqual([canvas.title, canvas.kind, canvas.url, canvas.project, canvas.owner_email, canvas.archived_at], ['Attention', 'canvas', `/apps/${canvas.name}`, null, 'owner@test', null]);
  assert.equal(canvas.device_id, '3f0c9a2e-7b1d-4c55-9e0a-2d4f6b8c1e3a');
  assert.equal((await (await f.send('POST', '/api/canvases', {})).json()).title, 'Untitled canvas');
  assert.equal((await (await f.send('POST', '/api/canvases', { title: 'Graphs', project: 'repo-example' })).json()).project, 'repo-example');
  assert.equal((await f.send('POST', '/api/canvases', { title: 'x'.repeat(121) })).status, 400);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'A', project: 'repo-missing' })).status, 404);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'A', device_id: '../../x' })).status, 400);
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`)).status, 200);
  const other = await f.send('GET', `/api/apps/${canvas.name}`, null, colleague);
  assert.equal(other.status, 403); assert.equal((await other.json()).error, 'This canvas is private to its owner');
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`, null, { 'x-small-workspace': 'other' })).status, 404);
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`, null, { cookie: 'denied' })).status, 401);
  assert.ok(f.seen.every(call => call === 'GET /api/apps'), f.seen.join());
});

test('rename keeps the slug, archive hides, the archived list is owner-only, restore returns, and DELETE removes only an untouched canvas', async t => {
  const f = fixture(t);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Draft' })).json();
  const list = async (archived, headers) => (await (await f.send('GET', `/api/canvases${archived ? '?archived=1' : ''}`, null, headers)).json()).canvases.map(c => c.name);
  const renamed = await (await f.send('PATCH', `/api/apps/${name}`, { title: 'Transformers' })).json();
  assert.deepEqual([renamed.title, renamed.name], ['Transformers', name]);
  assert.equal((await f.send('PATCH', `/api/apps/${name}`, { title: '  ' })).status, 400);
  assert.equal((await f.send('PATCH', `/api/apps/${name}`, { title: 'Mine now' }, colleague)).status, 403);
  assert.deepEqual(await list(false), [name]);
  assert.ok((await (await f.send('POST', `/api/apps/${name}/archive`)).json()).archived_at);
  assert.deepEqual(await list(false), []); assert.deepEqual(await list(true), [name]);
  assert.deepEqual(await list(true, colleague), []);
  assert.equal((await f.send('POST', `/api/apps/${name}/restore`, null, colleague)).status, 403);
  assert.equal((await (await f.send('POST', `/api/apps/${name}/restore`)).json()).archived_at, null);
  assert.deepEqual(await list(false), [name]);
  f.sqlite.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha) VALUES('canvaschat-1','team','owner@test',?,'')").run(name);
  const used = await f.send('DELETE', `/api/apps/${name}`);
  assert.equal(used.status, 405); assert.equal((await used.json()).error, 'This canvas has been used. Archive it instead.');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n, 1);
  const untouched = (await (await f.send('POST', '/api/canvases', { title: 'Undo me' })).json()).name;
  assert.equal((await f.send('DELETE', `/api/apps/${untouched}`, null, colleague)).status, 403);
  assert.equal((await f.send('DELETE', `/api/apps/${untouched}`)).status, 200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases WHERE name=?').get(untouched).n, 0);
  assert.deepEqual(await (await f.send('GET', `/api/apps/${name}/learn-course`)).json(), { course: null, revision: 0, canAuthor: false });
  assert.equal((await f.send('POST', `/api/apps/${name}/learn-course`, { action: 'draft' })).status, 405);
});
