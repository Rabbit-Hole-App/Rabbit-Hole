// Chat workspace threads (chat-workspace-CONTRACT.md A1-A3, B2, B7): History summaries, restore with Part B's meta, the
// state PUT and delete, on LEARN_DB both before learn-migrations 0019 is applied (the side tables are missing) and after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { canvasesFetch, canvasRoute, chatThreadState, validContextRefs } from '../src/canvases.js';
import { threadMessages } from '../src/repositories.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
// The contract's B7 tables, as Lane B's 0019 will create them.
const SIDE_TABLES = `
CREATE TABLE chat_message_meta (message_id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, alternative_of INTEGER, meta_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE chat_message_feedback (message_id INTEGER NOT NULL, user TEXT NOT NULL, rating TEXT NOT NULL, reason TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (message_id, user));
CREATE TABLE chat_thread_state (thread_id TEXT PRIMARY KEY, mode TEXT, draft_json TEXT, summary_json TEXT, context_json TEXT, last_activity_at TEXT, updated_at TEXT NOT NULL);`;

function fixture(t, { sideTables }) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  if (sideTables) sqlite.exec(SIDE_TABLES);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','Attention')");
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', user_id: 'u-1', apps: [] }) } };
  const send = (method, path, body, headers = {}) => {
    const req = new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(canvasRoute(new URL(req.url)), path);
    return canvasesFetch(req, env);
  };
  sqlite.exec(`INSERT INTO threads(id,org,user,scope_ref,commit_sha,title,created_at) VALUES
    ('canvaschat-a','team','owner@test','canvas-0a1b2c3d','','Attention heads','2026-10-01 10:00:00'),
    ('canvaschat-b','team','owner@test','canvas-0a1b2c3d','','Softmax 100%','2026-10-02 10:00:00'),
    ('canvaschat-c','team','other@test','canvas-0a1b2c3d','','Not mine','2026-10-03 10:00:00');
    INSERT INTO messages(id,thread_id,role,content) VALUES (1,'canvaschat-a','user','What is a query vector?'),(2,'canvaschat-a','assistant','A   query is\n what a token looks for.'),
    (3,'canvaschat-b','user','Why scale by sqrt d?'),(4,'canvaschat-b','assistant','To keep the logits small.');`);
  return { sqlite, send };
}
const ref = (over = {}) => ({ sourceId: 'doc:12', kind: 'doc', name: 'Attention paper', version: '2026-10-01 10:00:00', range: { page: 3, quote: 'scaled dot-product' }, ...over });

test('before 0019: History lists by creation, restore is plain and done, the state PUT saves nothing, delete still works', async t => {
  const f = fixture(t, { sideTables: false });
  const { threads } = await (await f.send('GET', '/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d')).json();
  assert.deepEqual(threads.map(x => [x.id, x.lastActivityAt, x.createdAt, x.preview]), [
    ['canvaschat-b', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z', 'To keep the logits small.'],
    ['canvaschat-a', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z', 'A query is what a token looks for.'],
  ]);
  assert.equal(threads[0].created_at, '2026-10-02 10:00:00'); // the fields older History readers use stay
  const thread = await (await f.send('GET', '/api/ask/threads/canvaschat-a')).json();
  assert.deepEqual({ ...thread, messages: undefined }, { id: 'canvaschat-a', title: 'Attention heads', mode: 'auto', contextRefs: [], draft: null, messages: undefined, commit: '' });
  assert.deepEqual(thread.messages, [{ messageId: '1', role: 'user', content: 'What is a query vector?', status: 'done' }, { messageId: '2', role: 'assistant', content: 'A   query is\n what a token looks for.', status: 'done' }]);
  const saved = await f.send('PUT', '/api/learn/chat/threads/canvaschat-a/state', { mode: 'ask' });
  assert.equal(saved.status, 503);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='chat_thread_state'").get().n, 0); // never created at runtime
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/delete')).status, 200);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM messages WHERE thread_id='canvaschat-a'").get().n, 0);
});

test('after 0019: History sorts by last activity, searches title and messages, limits, and stays the owner canvas only', async t => {
  const f = fixture(t, { sideTables: true });
  f.sqlite.exec("INSERT INTO chat_thread_state(thread_id,last_activity_at,updated_at) VALUES('canvaschat-a','2026-10-05T08:00:00.000Z','x')");
  const list = async query => (await (await f.send('GET', `/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d${query}`)).json()).threads;
  assert.deepEqual((await list('')).map(x => [x.id, x.lastActivityAt]), [['canvaschat-a', '2026-10-05T08:00:00.000Z'], ['canvaschat-b', '2026-10-02T10:00:00Z']]);
  assert.deepEqual((await list('&q=QUERY')).map(x => x.id), ['canvaschat-a']); // message content, case-insensitive
  assert.deepEqual((await list('&q=softmax')).map(x => x.id), ['canvaschat-b']); // title
  assert.deepEqual((await list('&q=100%25')).map(x => x.id), ['canvaschat-b']); // % is literal, not a wildcard
  assert.deepEqual((await list('&q=0%25')).map(x => x.id), ['canvaschat-b']);
  assert.deepEqual((await list('&q=_')).map(x => x.id), []);
  assert.deepEqual((await list('&limit=1')).map(x => x.id), ['canvaschat-a']);
  assert.equal((await list('&limit=999')).length, 2);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-c')).status, 404);
});

test('after 0019: restore joins meta and this user feedback, collapses regenerated answers, and keeps old messages plain', async t => {
  const f = fixture(t, { sideTables: true });
  const answer = { version: 1, mode: 'ask', kind: 'answer', contextRefs: [ref()], actions: [], followUps: [{ id: 'f1', text: 'Why?', kind: 'clarify' }], syllabus: null };
  f.sqlite.exec(`INSERT INTO messages(id,thread_id,role,content) VALUES (5,'canvaschat-a','user','Explain heads'),(6,'canvaschat-a','assistant','First try'),(7,'canvaschat-a','assistant','Second try'),(8,'canvaschat-a','assistant','Partial');
    INSERT INTO chat_message_meta(message_id,thread_id,role,alternative_of,meta_json) VALUES
      (5,'canvaschat-a','user',NULL,'${JSON.stringify({ mode: 'tutor', command: null, contextRefs: [ref()] })}'),
      (6,'canvaschat-a','assistant',NULL,'${JSON.stringify(answer)}'),
      (7,'canvaschat-a','assistant',6,'${JSON.stringify({ ...answer, kind: 'clarify' })}'),
      (8,'canvaschat-a','assistant',NULL,'{"status":"stopped"}');
    INSERT INTO chat_message_feedback VALUES (7,'owner@test','down','Too short','x'),(7,'other@test','up',NULL,'x'),(2,'owner@test','up',NULL,'x');
    INSERT INTO chat_thread_state(thread_id,mode,context_json,draft_json,updated_at) VALUES('canvaschat-a','tutor','${JSON.stringify([ref()])}','{"text":"half typed","command":null}','x');`);
  const thread = await (await f.send('GET', '/api/ask/threads/canvaschat-a')).json();
  assert.equal(thread.mode, 'tutor');
  assert.deepEqual(thread.contextRefs, [ref()]);
  assert.deepEqual(thread.draft, { text: 'half typed', command: null });
  assert.deepEqual(thread.messages.map(m => [m.messageId, m.status, m.kind]), [['1', 'done', undefined], ['2', 'done', undefined], ['5', 'done', undefined], ['7', 'done', 'clarify'], ['8', 'stopped', undefined]]);
  assert.deepEqual(thread.messages[1].meta, { feedback: { rating: 'up', reason: null } }); // an old answer: only the rating given since
  assert.equal(thread.messages[0].meta, undefined);
  assert.deepEqual([thread.messages[2].mode, thread.messages[2].command, thread.messages[2].contextRefs], ['tutor', null, [ref()]]);
  assert.deepEqual(thread.messages[3].meta, { version: 1, mode: 'ask', contextRefs: [ref()], actions: [], followUps: [{ id: 'f1', text: 'Why?', kind: 'clarify' }], syllabus: null, alternativeOf: '6', alternatives: ['6', '7'], feedback: { rating: 'down', reason: 'Too short' } });
  assert.deepEqual(thread.messages[4].meta, { alternativeOf: null, alternatives: ['8'], feedback: null });
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/delete')).status, 200);
  for (const table of ['chat_message_meta', 'chat_message_feedback', 'chat_thread_state', 'messages']) assert.equal(f.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${table === 'chat_message_feedback' ? 'message_id IN (2,5,6,7,8)' : 'thread_id=\'canvaschat-a\''}`).get().n, 0, table);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM messages WHERE thread_id='canvaschat-b'").get().n, 2);
});

test('threadMessages: a regeneration after a later turn stays in its own turn place', () => {
  const meta = '{"version":1,"kind":"answer","actions":[],"followUps":[]}';
  const rows = [{ id: 1, role: 'user', content: 'q1' }, { id: 2, role: 'assistant', content: 'a1', meta_json: meta }, { id: 3, role: 'user', content: 'q2' },
    { id: 4, role: 'assistant', content: 'a2', meta_json: meta }, { id: 5, role: 'assistant', content: 'a1 again', meta_json: meta, alternative_of: 2 }];
  assert.deepEqual(threadMessages(rows).map(m => [m.content, m.meta?.alternatives]), [['q1', undefined], ['a1 again', ['2', '5']], ['q2', undefined], ['a2', ['4']]]);
  assert.deepEqual(threadMessages([{ id: 9, role: 'assistant', content: 'x', meta_json: 'not json' }]), [{ messageId: '9', role: 'assistant', content: 'x', status: 'done' }]);
});

test('the state PUT upserts mode, refs and draft for the owner only and never moves last activity', async t => {
  const f = fixture(t, { sideTables: true });
  const put = (body, id = 'canvaschat-a', headers) => f.send('PUT', `/api/learn/chat/threads/${id}/state`, body, headers);
  assert.equal((await put({ mode: 'ask' })).status, 200);
  assert.equal((await put({ contextRefs: [ref()], draft: { text: 'next question', command: 'diagram' } })).status, 200);
  let row = f.sqlite.prepare("SELECT * FROM chat_thread_state WHERE thread_id='canvaschat-a'").get();
  assert.deepEqual([row.mode, JSON.parse(row.context_json), JSON.parse(row.draft_json), row.last_activity_at], ['ask', [ref()], { text: 'next question', command: 'diagram' }, null]);
  f.sqlite.exec("UPDATE chat_thread_state SET last_activity_at='2026-10-05T08:00:00.000Z'");
  assert.equal((await put({ draft: null })).status, 200);
  row = f.sqlite.prepare("SELECT * FROM chat_thread_state WHERE thread_id='canvaschat-a'").get();
  assert.deepEqual([row.mode, row.draft_json, row.last_activity_at], ['ask', null, '2026-10-05T08:00:00.000Z']);
  assert.equal((await put({ mode: 'ask' }, 'canvaschat-c')).status, 404); // another learner's thread
  assert.equal((await put({ mode: 'ask' }, 'canvaschat-a', { 'x-email': 'other@test' })).status, 404);
  assert.equal((await f.send('POST', '/api/learn/chat/threads/canvaschat-a/state', { mode: 'ask' })).status, 405);
  for (const bad of [{}, { mode: 'course' }, { draft: { text: 'x'.repeat(8001) } }, { draft: { text: 'x', command: '/../' } }, { contextRefs: [ref({ kind: 'pdf' })] }, { contextRefs: 'doc:1' }])
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad).slice(0, 80));
});

test('validContextRefs and chatThreadState hold the contract A2 limits', () => {
  assert.ok(validContextRefs([]));
  assert.ok(validContextRefs([ref(), ref({ sourceId: 'card:shape:x', kind: 'card', range: null, text: 'card text' }), ref({ sourceId: 'wiki:Attention', kind: 'web', range: { quote: 'q' } }),
    ref({ sourceId: 'code:repo-x@abc:src/a.py', kind: 'code', range: { path: 'src/a.py', start: 10, end: 42 } }), ref({ sourceId: 'group:shape:a', kind: 'group', range: { cardIds: ['shape:a', 'shape:b'] } }),
    ref({ sourceId: 'media:shape:v', kind: 'media', range: { startSec: 12, endSec: 40 } })]));
  for (const bad of [ref({ kind: 'web' }), ref({ sourceId: 'doc:' }), ref({ name: '' }), ref({ name: 'x'.repeat(121) }), ref({ range: { page: 0 } }), ref({ range: { page: 2, startSec: 1 } }),
    ref({ range: { path: 'a', start: 5, end: 4 } }), ref({ range: { cardIds: [] } }), ref({ text: 'docs carry no text' }), ref({ version: 7 }), ref({ sourceId: 'group:a', kind: 'group', range: { cardIds: Array.from({ length: 50 }, (_, i) => `shape:${i}`.padEnd(60, 'x')) } }), ref({ kind: 'constructor' })])
    assert.equal(validContextRefs([bad]), false, JSON.stringify(bad).slice(0, 80));
  assert.equal(validContextRefs(Array.from({ length: 21 }, () => ref())), false);
  assert.equal(validContextRefs(Array.from({ length: 5 }, (_, i) => ref({ sourceId: `card:${i}`, kind: 'card', range: null, text: 'x'.repeat(7000) }))), false); // 35000 chars of text
  assert.deepEqual(chatThreadState({ mode: 'tutor', draft: { text: '' } }), { mode: 'tutor', draft_json: '{"text":"","command":null}' });
  assert.throws(() => chatThreadState(null), /Send a mode/);
});
