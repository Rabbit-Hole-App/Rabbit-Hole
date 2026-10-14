import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { chatMessageFetch, chatMessageRoute, REASON_MAX } from '../src/chat-message-routes.js';

// The answer footer's routes (chat-workspace-CONTRACT.md B2, B5): thumbs on an assistant answer and one stored
// alternative, on LEARN_DB only, for the thread's own org and user. The live DB throws on any use.
const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0019-chat-message-meta.sql', import.meta.url), 'utf8');

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema); sqlite.exec(migration);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => stmt.run(...args) }; } };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', apps: [] }) } };
  sqlite.exec(`INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES ('canvaschat-a','team','owner@test','canvas-0a1b2c3d','','T');
    INSERT INTO messages(id,thread_id,role,content) VALUES (10,'canvaschat-a','user','Why?'),(11,'canvaschat-a','assistant','First'),(12,'canvaschat-a','assistant','Second'),(13,'canvaschat-a','assistant','Old');
    INSERT INTO chat_message_meta(message_id,thread_id,role,alternative_of,meta_json) VALUES
      (11,'canvaschat-a','assistant',NULL,'{"version":1,"mode":"ask","kind":"answer","actions":[],"followUps":[]}'),
      (12,'canvaschat-a','assistant',11,'{"version":1,"mode":"ask","kind":"answer","actions":[],"followUps":[{"id":"f1","text":"Next?","kind":"next"}]}');`);
  const send = async (method, path, body, headers = {}) => {
    const res = await chatMessageFetch(new Request(`https://dev.test${path}`, { method, headers, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env);
    return { status: res.status, body: await res.json() };
  };
  const rows = () => sqlite.prepare('SELECT message_id, user, rating, reason FROM chat_message_feedback ORDER BY message_id').all().map(r => ({ ...r }));
  return { send, rows };
}

test('the route matches only numeric message ids, with or without /feedback', () => {
  for (const [path, ok] of [['/api/learn/chat/messages/12', true], ['/api/learn/chat/messages/12/feedback', true], ['/api/learn/chat/messages/abc', false], ['/api/learn/chat/messages/12/other', false], ['/api/learn/chat/threads/x/state', false]])
    assert.equal(chatMessageRoute(path), ok, path);
});

test('thumbs are set, changed and cleared on the caller own answer only', async t => {
  const { send, rows } = fixture(t);
  assert.deepEqual(await send('PUT', '/api/learn/chat/messages/12/feedback', { rating: 'up' }), { status: 200, body: { rating: 'up', reason: null } });
  assert.deepEqual(rows(), [{ message_id: 12, user: 'owner@test', rating: 'up', reason: null }]);
  assert.deepEqual((await send('PUT', '/api/learn/chat/messages/12/feedback', { rating: 'down', reason: '  Missed the point ' })).body, { rating: 'down', reason: 'Missed the point' }, 'a change replaces the row');
  assert.deepEqual(rows(), [{ message_id: 12, user: 'owner@test', rating: 'down', reason: 'Missed the point' }]);
  assert.deepEqual((await send('PUT', '/api/learn/chat/messages/12/feedback', { rating: null })).body, { rating: null, reason: null });
  assert.deepEqual(rows(), [], 'null deletes the row');
  // Ownership: another person, a user message and a missing message all 404, and nothing is written.
  assert.equal((await send('PUT', '/api/learn/chat/messages/12/feedback', { rating: 'up' }, { 'x-email': 'other@test' })).status, 404);
  assert.equal((await send('PUT', '/api/learn/chat/messages/10/feedback', { rating: 'up' })).status, 404);
  assert.equal((await send('PUT', '/api/learn/chat/messages/999/feedback', { rating: 'up' })).status, 404);
  assert.equal((await send('GET', '/api/learn/chat/messages/12', undefined, { 'x-email': 'other@test' })).status, 404);
  assert.deepEqual(rows(), []);
});

test('a bad rating, a long reason, a bad body or a foreign origin is refused', async t => {
  const { send, rows } = fixture(t);
  const put = (body, headers) => send('PUT', '/api/learn/chat/messages/12/feedback', body, headers);
  assert.equal((await put({ rating: 'meh' })).status, 400);
  assert.equal((await put({})).status, 400, 'rating is required');
  assert.equal((await put({ rating: 'down', reason: 5 })).status, 400);
  assert.equal((await put('not json')).status, 400);
  assert.equal((await put({ rating: 'down', reason: 'x'.repeat(REASON_MAX + 1) })).status, 400);
  assert.equal((await put({ rating: 'down', reason: 'x'.repeat(REASON_MAX) })).status, 200, 'exactly the limit is fine');
  assert.equal((await put({ rating: 'up' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await send('POST', '/api/learn/chat/messages/12/feedback', { rating: 'up' })).status, 405);
  assert.deepEqual(rows().map(r => r.rating), ['down']);
});

test('GET returns one alternative with its turn alternatives and the caller own feedback; an old message stands alone', async t => {
  const { send } = fixture(t);
  await send('PUT', '/api/learn/chat/messages/11/feedback', { rating: 'up' });
  assert.deepEqual(await send('GET', '/api/learn/chat/messages/11'), { status: 200, body: {
    messageId: '11', role: 'assistant', content: 'First', kind: 'answer',
    meta: { version: 1, mode: 'ask', actions: [], followUps: [], alternativeOf: null, alternatives: ['11', '12'], feedback: { rating: 'up', reason: null } },
  } });
  const second = (await send('GET', '/api/learn/chat/messages/12')).body;
  assert.deepEqual([second.content, second.meta.alternativeOf, second.meta.alternatives, second.meta.feedback, second.meta.followUps.length], ['Second', '11', ['11', '12'], null, 1]);
  assert.deepEqual((await send('GET', '/api/learn/chat/messages/13')).body, { messageId: '13', role: 'assistant', content: 'Old', kind: 'answer', meta: { alternativeOf: null, alternatives: ['13'], feedback: null } });
});

// dev-worker.js imports .html and .py, so node cannot import it (canvases.test.js reads its source the same way).
test('the dev worker dispatches the footer routes beside the canvas routes', () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  assert.match(source, /if \(chatMessageRoute\(path\)\) return chatMessageFetch\(req, env\);/);
});
