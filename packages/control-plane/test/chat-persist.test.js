// Saving an exchange the client already shows (owner brief 2026-10-14, chat persistence): POST
// /api/learn/chat/threads/<id>/messages with idempotency, ownership and an interrupted status, and the open thread per canvas
// (PUT/GET /api/learn/chat/active) kept in chat_thread_state, on an in-memory LEARN_DB. No model call, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { canvasesFetch, canvasRoute } from '../src/canvases.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const CANVAS = 'canvas-0a1b2c3d', OTHER_CANVAS = 'canvas-1b2c3d4e', THEIRS = 'canvas-9f9f9f9f', HOLE = 'canvas-77777777';
const id = n => `canvaschat-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), ELSEWHERE = id(3), NOT_MINE = id(4);
function fixture(t, { sideTables = true } = {}) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  if (!sideTables) sqlite.exec('DROP TABLE chat_message_meta; DROP TABLE chat_message_feedback; DROP TABLE chat_thread_state;');
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${CANVAS}','owner@test','Attention'),('team','${OTHER_CANVAS}','owner@test','Other'),('team','${THEIRS}','other@test','Theirs');
    INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('${ELSEWHERE}','team','owner@test','${OTHER_CANVAS}','','Elsewhere'),('${NOT_MINE}','team','other@test','${CANVAS}','','Not mine');`);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', user_id: 'u-1', apps: [] }) } };
  const send = (method, path, body, headers = {}) => {
    const req = new Request(`https://dev.test${path}`, { method, headers, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    assert.ok(canvasRoute(new URL(req.url)), path);
    return canvasesFetch(req, env);
  };
  const post = (thread, body, headers) => f.send('POST', `/api/learn/chat/threads/${thread}/messages`, { app: CANVAS, ...body }, headers);
  const count = (table, where = '1') => sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n;
  const f = { sqlite, send, post, count };
  return f;
}
const counts = f => ['threads', 'messages', 'chat_message_meta', 'chat_thread_state'].map(table => f.count(table));

test('the first POST creates the thread, a retried client_id is a duplicate, and restore shows clientId and the interrupted status', async t => {
  const f = fixture(t);
  let res = await f.post(A, { client_id: 'u-1', role: 'user', content: 'Why scale attention by sqrt d?', mode: 'auto', title: 'Scaling' });
  assert.equal(res.status, 201);
  const first = await res.json();
  assert.deepEqual({ ...first, messageId: typeof first.messageId }, { threadId: A, messageId: 'string', clientId: 'u-1', duplicate: false });
  assert.deepEqual({ ...f.sqlite.prepare('SELECT org,user,scope_ref,title FROM threads WHERE id=?').get(A) }, { org: 'team', user: 'owner@test', scope_ref: CANVAS, title: 'Scaling' });
  const before = counts(f);
  res = await f.post(A, { client_id: 'u-1', role: 'user', content: 'Why scale attention by sqrt d?' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ...first, duplicate: true });
  assert.deepEqual(counts(f), before); // a retry writes nothing
  assert.equal((await f.post(A, { client_id: 'a-1', role: 'assistant', content: 'To keep the logits small.', mode: 'auto' })).status, 201);
  const cut = await f.post(A, { client_id: 'a-2', role: 'assistant', content: '', status: 'interrupted' });
  assert.equal(cut.status, 201);
  assert.equal(f.count('threads', `id='${A}'`), 1);
  assert.ok(f.sqlite.prepare('SELECT last_activity_at FROM chat_thread_state WHERE thread_id=?').get(A).last_activity_at);
  assert.deepEqual(f.sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE thread_id=? ORDER BY message_id').all(A).map(r => JSON.parse(r.meta_json)), [
    { mode: 'auto', command: null, contextRefs: [], clientId: 'u-1' },
    { version: 1, mode: 'auto', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, source: 'tutor', clientId: 'a-1' },
    { status: 'interrupted', mode: 'auto', clientId: 'a-2' },
  ]);
  const thread = await (await f.send('GET', `/api/ask/threads/${A}`)).json();
  assert.deepEqual(thread.messages.map(m => [m.role, m.content, m.status, m.clientId, m.kind]), [
    ['user', 'Why scale attention by sqrt d?', 'done', 'u-1', undefined],
    ['assistant', 'To keep the logits small.', 'done', 'a-1', 'answer'],
    ['assistant', '', 'interrupted', 'a-2', undefined],
  ]);
  assert.equal(thread.messages[0].mode, 'auto');
  assert.equal(thread.messages[1].meta.source, 'tutor');
  assert.equal(thread.messages[2].messageId, (await cut.json()).messageId);
  // Without a title the first message names the thread, first 120 characters.
  assert.equal((await f.post(B, { client_id: 'u-2', role: 'user', content: 'q'.repeat(130) })).status, 201);
  assert.equal(f.sqlite.prepare('SELECT title FROM threads WHERE id=?').get(B).title, 'q'.repeat(120));
});

test('ownership: another person thread is 404, an own thread on another canvas is 409, another person canvas is refused, a pending hole saves', async t => {
  const f = fixture(t);
  const before = counts(f);
  let res = await f.post(NOT_MINE, { client_id: 'u-1', role: 'user', content: 'hi' });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Chat not found' });
  res = await f.post(ELSEWHERE, { client_id: 'u-1', role: 'assistant', content: 'late answer' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'thread_canvas_mismatch');
  assert.equal((await f.post(A, { app: THEIRS, client_id: 'u-1', role: 'user', content: 'hi' })).status, 403);
  assert.deepEqual(counts(f), before);
  // A pending Rabbit Hole has no canvas row yet; its thread is still the caller's.
  assert.equal((await f.post(A, { app: HOLE, client_id: 'u-1', role: 'user', content: 'hi' })).status, 201);
  assert.deepEqual(counts(f).slice(0, 3), [before[0] + 1, before[1] + 1, before[2] + 1]);
  // Another person posting into the owner's thread id finds nothing.
  assert.equal((await f.post(A, { app: HOLE, client_id: 'u-2', role: 'user', content: 'hi' }, { 'x-email': 'other@test' })).status, 404);
  assert.equal(f.sqlite.prepare('SELECT scope_ref FROM threads WHERE id=?').get(A).scope_ref, HOLE);
});

test('malformed message bodies are 400, the wrong method is 405, and nothing is written', async t => {
  const f = fixture(t);
  const before = counts(f);
  const ok = { client_id: 'u-1', role: 'user', content: 'hi' };
  for (const bad of [{ ...ok, app: 'counter' }, { ...ok, client_id: '' }, { ...ok, client_id: 'x'.repeat(81) }, { ...ok, client_id: 'a b' }, { ...ok, role: 'system' },
    { ...ok, status: 'done' }, { ...ok, role: 'assistant', status: 'stopped' }, { ...ok, mode: 'course' }, { ...ok, content: '' }, { ...ok, role: 'assistant', content: ' ' },
    { ...ok, content: 'x'.repeat(100001) }, { ...ok, content: 7 }, { ...ok, title: 5 }]) {
    const res = await f.post(A, bad);
    assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
    assert.ok((await res.json()).error);
  }
  assert.equal((await f.post('canvaschat-a', ok)).status, 400); // not a client-minted UUID id
  assert.equal((await f.send('POST', `/api/learn/chat/threads/${A}/messages`, 'not json')).status, 400);
  assert.equal((await f.send('POST', `/api/learn/chat/threads/${A}/messages`, [])).status, 400);
  assert.equal((await f.send('GET', `/api/learn/chat/threads/${A}/messages`)).status, 405);
  assert.deepEqual(counts(f), before);
});

test('before 0019: a message save and an active PUT are 503 and create nothing; the active GET is null', async t => {
  const f = fixture(t, { sideTables: false });
  const res = await f.post(A, { client_id: 'u-1', role: 'user', content: 'hi' });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'Saving chat is not available here yet' });
  assert.equal(f.count('threads', `id='${A}'`), 0);
  assert.equal(f.count('messages'), 0);
  assert.equal((await f.send('PUT', '/api/learn/chat/active', { app: OTHER_CANVAS, thread_id: ELSEWHERE })).status, 503);
  assert.deepEqual(await (await f.send('GET', `/api/learn/chat/active?app=${CANVAS}`)).json(), { threadId: null });
});

test('the open thread per canvas: round trip, null clears, a late answer never moves it, a deleted thread reads null, History never lists the key', async t => {
  const f = fixture(t);
  const active = async (app = CANVAS, headers) => (await (await f.send('GET', `/api/learn/chat/active?app=${app}`, undefined, headers)).json()).threadId;
  const put = (thread_id, app = CANVAS) => f.send('PUT', '/api/learn/chat/active', { app, thread_id });
  assert.equal(await active(), null);
  for (const [thread, client] of [[A, 'u-a'], [B, 'u-b']]) assert.equal((await f.post(thread, { client_id: client, role: 'user', content: `question ${client}` })).status, 201);
  let res = await put(A);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { threadId: A });
  assert.equal(await active(), A);
  assert.equal((await put(B)).status, 200);
  // The late answer of thread A finishes after the person opened B: B stays open.
  assert.equal((await f.post(A, { client_id: 'a-a', role: 'assistant', content: 'late answer' })).status, 201);
  assert.equal(await active(), B);
  assert.equal(await active(OTHER_CANVAS), null); // per canvas
  // History lists the real threads only, and the key never moved either one's activity.
  const { threads } = await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${CANVAS}`)).json();
  assert.deepEqual(threads.map(x => x.id).sort(), [A, B]);
  assert.equal(f.count('chat_thread_state', "thread_id LIKE 'active:%'"), 1);
  assert.deepEqual(await (await put(null)).json(), { threadId: null });
  assert.equal(await active(), null);
  assert.equal((await put(A)).status, 200);
  assert.equal((await f.send('POST', `/api/ask/threads/${A}/delete`)).status, 200);
  assert.equal(await active(), null); // the saved thread is gone
  assert.equal(f.count('chat_thread_state', "thread_id LIKE 'active:%'"), 1); // the delete left the key alone
  assert.equal(f.count('chat_thread_state', `thread_id='${B}'`), 1);
  // The same checks as a message save; another person never reads this person's choice.
  assert.equal((await put(NOT_MINE)).status, 404);
  assert.equal((await put(id(99))).status, 404);
  res = await put(ELSEWHERE);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'thread_canvas_mismatch');
  assert.equal((await put(B)).status, 200);
  assert.equal(await active(HOLE, { 'x-email': 'other@test' }), null);
  assert.equal((await f.send('GET', `/api/learn/chat/active?app=${THEIRS}`)).status, 403);
  for (const bad of [{ app: CANVAS }, { app: CANVAS, thread_id: 'canvaschat-a' }, { app: 'x', thread_id: null }, null])
    assert.equal((await f.send('PUT', '/api/learn/chat/active', bad)).status, 400, JSON.stringify(bad));
  assert.equal((await f.send('GET', '/api/learn/chat/active')).status, 400);
  assert.equal((await f.send('POST', '/api/learn/chat/active', { app: CANVAS, thread_id: null })).status, 405);
  assert.equal(await active(), B);
});

test('the Table of contents keeps its own open thread (slot toc), apart from Chat\'s; History lists both threads', async t => {
  const f = fixture(t);
  const active = async slot => (await (await f.send('GET', `/api/learn/chat/active?app=${CANVAS}${slot ? `&slot=${slot}` : ''}`)).json()).threadId;
  const put = (thread_id, slot) => f.send('PUT', '/api/learn/chat/active', { app: CANVAS, thread_id, ...(slot ? { slot } : {}) });
  for (const [thread, client] of [[A, 'u-a'], [B, 'u-b']]) assert.equal((await f.post(thread, { client_id: client, role: 'user', content: `question ${client}` })).status, 201);
  assert.equal((await put(A)).status, 200);
  assert.equal(await active('toc'), null, 'Chat\'s choice is not the TOC\'s');
  assert.deepEqual(await (await put(B, 'toc')).json(), { threadId: B });
  assert.equal(await active(), A);
  assert.equal(await active('toc'), B);
  assert.equal(f.count('chat_thread_state', "thread_id LIKE 'active:%'"), 2);
  assert.equal((await put(ELSEWHERE, 'toc')).status, 409, 'the same thread checks as Chat\'s pointer');
  assert.equal((await put(A, 'chat')).status, 400);
  assert.equal((await f.send('GET', `/api/learn/chat/active?app=${CANVAS}&slot=other`)).status, 400);
  const { threads } = await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${CANVAS}`)).json();
  assert.deepEqual(threads.map(x => x.id).sort(), [A, B]);
});

test('canvasRoute sends the new chat paths to canvasesFetch and nothing near them', () => {
  for (const path of [`/api/learn/chat/threads/${A}/messages`, '/api/learn/chat/threads/canvaschat-a/messages', '/api/learn/chat/active', `/api/learn/chat/active?app=${CANVAS}`])
    assert.ok(canvasRoute(new URL(`https://dev.test${path}`)), path);
  for (const path of ['/api/learn/chat/activex', `/api/learn/chat/threads/${A}/messages/1`, '/api/learn/chat/messages/12', '/api/learn/chat/threads//messages'])
    assert.equal(canvasRoute(new URL(`https://dev.test${path}`)), false, path);
});

// A repository's Main canvas is its workspace (repo-canvas-graph.md): its Chat keeps an active thread, History, open, rename
// and delete through the same routes, owner-only. Its threads are repochat- (repositoryAsk) or canvaschat- (an Auto save).
test('a repository Main canvas: active GET/PUT, History, open, rename and delete for its owner; refused for another person and across apps', async t => {
  const f = fixture(t);
  const REPO = 'repo-1a2b3c4d-nanogpt', THEIR_REPO = 'repo-9f9f9f9f-theirs', R = 'repochat-00000000-0000-4000-8000-000000000101';
  f.sqlite.exec(`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('team','${REPO}','owner@test','karpathy/nanoGPT','master','abc','ready'),('team','${THEIR_REPO}','other@test','x/y','main','def','ready');
    INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('${R}','team','owner@test','${REPO}','abc','How does attention work?');
    INSERT INTO messages(thread_id,role,content) VALUES('${R}','user','How does attention work?'),('${R}','assistant','By weighting earlier tokens.');`);
  // Before any PUT the active thread is none (not a 400), and History lists the repository's own thread only.
  assert.deepEqual(await (await f.send('GET', `/api/learn/chat/active?app=${REPO}`)).json(), { threadId: null });
  assert.deepEqual((await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${REPO}`)).json()).threads.map(row => row.id), [R]);
  assert.deepEqual((await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${CANVAS}`)).json()).threads.map(row => row.id).includes(R), false);
  // Remember, read back, open.
  assert.equal((await f.send('PUT', '/api/learn/chat/active', { app: REPO, thread_id: R })).status, 200);
  assert.deepEqual(await (await f.send('GET', `/api/learn/chat/active?app=${REPO}`)).json(), { threadId: R });
  const opened = await (await f.send('GET', `/api/ask/threads/${R}`)).json();
  assert.deepEqual([opened.id, opened.messages.length], [R, 2]);
  // A canvas's thread is not this repository's, and the reverse.
  assert.equal((await f.send('PUT', '/api/learn/chat/active', { app: REPO, thread_id: ELSEWHERE })).status, 409);
  assert.equal((await f.send('PUT', '/api/learn/chat/active', { app: CANVAS, thread_id: R })).status, 409);
  // Another person's repository, and an unknown one, are refused.
  assert.equal((await f.send('GET', `/api/learn/chat/active?app=${THEIR_REPO}`)).status, 403);
  assert.equal((await f.send('PUT', '/api/learn/chat/active', { app: THEIR_REPO, thread_id: null })).status, 403);
  assert.equal((await f.send('GET', `/api/ask/threads?scope=learn&ref=${THEIR_REPO}`)).status, 403);
  assert.equal((await f.send('GET', '/api/learn/chat/active?app=repo-00000000-gone')).status, 404);
  // Rename, then delete.
  assert.equal((await f.send('POST', `/api/ask/threads/${R}/rename`, { title: 'Attention' })).status, 200);
  assert.equal(f.sqlite.prepare('SELECT title FROM threads WHERE id=?').get(R).title, 'Attention');
  assert.equal((await f.send('POST', `/api/ask/threads/${R}/delete`)).status, 200);
  assert.equal(f.count('threads', `id='${R}'`), 0);
  assert.deepEqual(await (await f.send('GET', `/api/learn/chat/active?app=${REPO}`)).json(), { threadId: null });
  // An Auto save on the repository canvas makes its thread there.
  assert.equal((await f.post(A, { app: REPO, client_id: 'u-9', role: 'user', content: 'Where is the loss?' })).status, 201);
  assert.equal(f.sqlite.prepare('SELECT scope_ref FROM threads WHERE id=?').get(A).scope_ref, REPO);
});

test('canvasRoute sends repository chat paths to canvasesFetch, and leaves other apps alone', () => {
  for (const path of ['/api/ask/threads?scope=learn&ref=repo-1a2b3c4d-nanogpt', '/api/ask/threads/repochat-00000000-0000-4000-8000-000000000101', '/api/ask/threads/repochat-00000000-0000-4000-8000-000000000101/rename', '/api/learn/chat/threads/repochat-00000000-0000-4000-8000-000000000101/state'])
    assert.ok(canvasRoute(new URL(`https://dev.test${path}`)), path);
  for (const path of ['/api/ask/threads?scope=learn&ref=counter', '/api/ask/threads?scope=org', '/api/ask/threads/t-123'])
    assert.equal(canvasRoute(new URL(`https://dev.test${path}`)), false, path);
});
