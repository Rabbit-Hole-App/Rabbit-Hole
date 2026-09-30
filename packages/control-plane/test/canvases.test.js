import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import * as canvases from '../src/canvases.js';
const { canvasesFetch, canvasRoute, refuseCanvasAsk } = canvases;
import { authorizedBoardApp } from '../src/learn-board.js';

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

// ---- Learn resolves canvas-* (Task 6.2) ----
test('canvas chat history lists, reads, renames and deletes only the owner canvas threads in LEARN_DB', async t => {
  const f = fixture(t);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Chat' })).json();
  f.sqlite.exec(`INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('canvaschat-a','team','owner@test','${name}','','First'),('canvaschat-b','team','owner@test','repo-example','','Repo'); INSERT INTO messages(thread_id,role,content) VALUES('canvaschat-a','user','Hi'),('canvaschat-a','assistant','Hello');`);
  assert.deepEqual((await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${name}`)).json()).threads.map(x => x.id), ['canvaschat-a']);
  assert.deepEqual((await (await f.send('GET', '/api/ask/threads/canvaschat-a')).json()).messages.map(m => m.content), ['Hi', 'Hello']);
  assert.equal((await f.send('GET', `/api/ask/threads?scope=learn&ref=${name}`, null, colleague)).status, 403);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-a', null, colleague)).status, 404);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-b')).status, 404);
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/rename', { title: 'Renamed' })).status, 200);
  assert.equal(f.sqlite.prepare("SELECT title FROM threads WHERE id='canvaschat-a'").get().title, 'Renamed');
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/delete')).status, 200);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM messages WHERE thread_id='canvaschat-a'").get().n, 0);
});

test('canvas traffic routes to LEARN_DB, canvas attachments are refused, and Learn endpoints resolve canvases', async t => {
  const f = fixture(t);
  for (const [url, expected] of [['/api/canvases', true], ['/api/canvases?archived=1', true], ['/api/apps/canvas-0a1b2c3d', true], ['/api/apps/canvas-0a1b2c3d/archive', true], ['/api/ask/threads/canvaschat-1', true], ['/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d', true], ['/api/ask/threads?scope=learn&ref=counter', false], ['/api/ask/threads/42', false], ['/api/apps/counter', false], ['/api/apps', false], ['/api/apps/repo-x', false]])
    assert.equal(canvasRoute(new URL(url, 'https://dev.test')), expected, url);
  const form = app => { const body = new FormData(); body.set('body', JSON.stringify({ scope: { app }, message: 'Hi' })); body.set('file', new Blob(['x']), 'x.txt'); return new Request('https://dev.test/api/learn/ask', { method: 'POST', body }); };
  const refused = await refuseCanvasAsk(form('canvas-0a1b2c3d'));
  assert.equal(refused.status, 400); assert.match((await refused.json()).error, /Attachments are not available on canvases yet/);
  assert.equal(await refuseCanvasAsk(form('counter')), null);
  assert.equal(await refuseCanvasAsk(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })), null);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Board' })).json();
  const board = (headers = {}) => authorizedBoardApp(new Request('https://dev.test/api/learn/board', { headers }), f.env, name);
  const app = await board();
  assert.deepEqual([app.kind, app.org, app.name, app.email], ['canvas', 'team', name, 'owner@test']);
  assert.equal((await board(colleague)).status, 403);
  assert.ok(f.seen.every(call => call === 'GET /api/apps'), f.seen.join());
});

// ---- dev worker wiring (Task 6.4) ----
// dev-worker.js imports .html and .py, so node cannot import it; like learn-research.test.js:48-53, read its source.
test('the dev worker routes canvas traffic early, merges owner canvases, refuses canvas attachments and passes the Learn seam', () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const at = text => { const i = source.indexOf(text); assert.ok(i >= 0, `dev-worker.js is missing: ${text}`); return i; };
  assert.ok(at('if (canvasRoute(new URL(req.url))) return canvasesFetch(req, env);') < at('const repositoryRoute ='));
  assert.match(source.slice(at("if (path === '/api/apps' && req.method === 'GET')"), at('const repositoryRoute =')), /\.\.\.\(await ownerCanvases\(env, catalog\)\)/);
  assert.ok(at('const refused = await refuseCanvasAsk(req);') < at("if (['/api/learn/selection', '/api/learn/ask'].includes(path)"));
  at("'learn', access.kind === 'canvas' ? canvasAskSeam(env, access) : undefined);");
});

// C1 decision 1 (docs/features/learn-cleanup.md): the dev worker answers Learn asks only on dev
// storage - a canvas through the LEARN_DB seam, a repo-* app through repositoriesFetch. A job or
// server app's ask would reach apiAsk and write threads and messages to the live D1, so it is
// refused with a JSON 403; a body that is neither JSON nor multipart ends on the dev worker (415)
// instead of falling through to live small-cp.
test('the dev worker refuses Learn asks for live apps and ends every Learn ask on itself', () => {
  const { refuseLiveLearnAsk } = canvases;
  assert.equal(typeof refuseLiveLearnAsk, 'function', 'canvases.js exports refuseLiveLearnAsk');
  for (const kind of ['server', 'job', undefined]) {
    const refused = refuseLiveLearnAsk({ name: 'counter', kind });
    assert.equal(refused.status, 403, String(kind));
    assert.equal(refused.headers.get('content-type'), 'application/json');
  }
  assert.equal(refuseLiveLearnAsk({ name: 'canvas-0a1b2c3d', kind: 'canvas' }), null);
  assert.equal(refuseLiveLearnAsk({ name: 'repo-example', kind: 'repository' }), null);
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("if (['/api/learn/selection', '/api/learn/ask'].includes(path)"), source.indexOf("if (path === '/api/learn/tts'"));
  const at = text => { const i = block.indexOf(text); assert.ok(i >= 0, `the Learn ask block is missing: ${text}`); return i; };
  assert.ok(at('if (access instanceof Response) return access;') < at('const liveRefused = refuseLiveLearnAsk(access);'));
  assert.ok(at('if (liveRefused) return liveRefused;') < at('return apiAsk('));
  assert.ok(at("status: 415") < at('let body;'), 'a Learn ask that is neither JSON nor multipart ends here');
});

// ---- WP2 review fixes (workflow wf_aa7de563-580) ----
test('canvas routes match only real canvas slugs and Learn history; canvas chat never reaches /api/ask; history changes need POST', async t => {
  const f = fixture(t);
  for (const [url, expected] of [['/api/apps/canvas-painter', false], ['/api/apps/canvas-0a1b2c3d9', false], ['/api/ask/threads?scope=app&ref=canvas-0a1b2c3d', false], ['/api/ask/threads?ref=canvas-0a1b2c3d', false], ['/api/ask/threads?scope=learn&ref=canvas-painter', false]])
    assert.equal(canvasRoute(new URL(url, 'https://dev.test')), expected, url);
  const ask = (path, app) => new Request(`https://dev.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: { app }, message: 'Hi', thread_id: 'canvaschat-1' }) });
  const refused = await refuseCanvasAsk(ask('/api/ask', 'canvas-0a1b2c3d'));
  assert.equal(refused.status, 400); assert.match((await refused.json()).error, /Canvas chat runs in Learn/);
  assert.equal(await refuseCanvasAsk(ask('/api/ask', 'counter')), null);
  assert.equal(await refuseCanvasAsk(ask('/api/ask', 'canvas-painter')), null);
  assert.equal(await refuseCanvasAsk(ask('/api/learn/ask', 'canvas-0a1b2c3d')), null); // Learn's router answers it with the LEARN_DB seam
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Chat' })).json();
  f.sqlite.exec(`INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('canvaschat-a','team','owner@test','${name}','','First')`);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-a/delete')).status, 405);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-a/rename')).status, 405);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM threads WHERE id='canvaschat-a'").get().n, 1);
  // A live app whose name merely starts with canvas- keeps its live Learn access.
  await authorizedBoardApp(new Request('https://dev.test/api/learn/board'), f.env, 'canvas-painter').catch(() => {});
  assert.ok(f.seen.includes('GET /api/apps/canvas-painter'), f.seen.join());
});

test('a canvas cannot be created inside another person\'s project', async t => {
  const f = fixture(t);
  const refused = await f.send('POST', '/api/canvases', { title: 'Theirs', project: 'repo-example' }, colleague);
  assert.equal(refused.status, 404);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'Mine', project: 'repo-example' })).status, 201);
});
