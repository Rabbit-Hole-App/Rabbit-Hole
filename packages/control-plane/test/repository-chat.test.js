// A Chat turn on a repository's Main canvas (repo-graph Release 1, lead ruling on brief section 11): repositoryAsk records
// the turn's mode, command and refs, asks with the answer_meta trailer and its repository follow-up guidance, strips the
// trailer from what streams and is stored, and keeps the validated meta on the answer. The model is a scripted fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { repositoriesFetch } from '../src/repositories.js';
import { ANSWER_META_REPOSITORY } from '../src/chat-answer-meta.js';

const sha = 'a'.repeat(40);
const snapshot = { repo: 'example/project', commit: sha, version: 'graphifyy-0.9.63-small-1', files: { 'model.py': 'class Model:\n    def forward(self, x):\n        return x + 1', 'README.md': 'A model' }, skipped: [], graph: { nodes: [{ id: 'model', label: 'Model', path: 'model.py', line: 1 }, { id: 'forward', label: 'forward()', path: 'model.py', line: 2 }], edges: [{ source: 'model', target: 'forward', relation: 'contains', confidence: 'EXTRACTED' }] } };
function fixture(t, replies) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(`INSERT INTO repository_apps(id,org,name,owner_email,repo,branch,commit_sha,status) VALUES(1,'team','repo-example','owner@test','example/project','main','${sha}','ready'); INSERT INTO repository_versions VALUES(1,'${sha}','snapshot',datetime('now'));`);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const env = { SMALL_ENV: 'test', LEARN_DB: db, ANTHROPIC_API_KEY: 'test', CONTROL_PLANE: { fetch: async () => Response.json({ org: 'team', email: 'owner@test', apps: [] }) }, REPOSITORY_SNAPSHOTS: { get: async k => (k === 'snapshot' ? { json: async () => snapshot } : null) }, RUNS: { get() { throw Error('live bucket touched'); }, put() { throw Error('live bucket touched'); } } };
  const sent = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_, options) => { sent.push(JSON.parse(options.body)); return Response.json({ content: [{ type: 'text', text: replies.shift() }], stop_reason: 'end_turn' }); };
  const ask = async body => {
    const response = await repositoriesFetch(new Request('https://dev.test/api/repositories/repo-example/ask', { method: 'POST', body: JSON.stringify(body) }), env, {});
    const events = (await response.text()).split('\n\n').filter(Boolean).map(frame => ({ type: frame.match(/^event: (.+)$/m)?.[1], data: JSON.parse(frame.match(/^data: (.+)$/m)?.[1] || 'null') }));
    return { status: response.status, events };
  };
  return { sqlite, sent, ask, rows: sql => sqlite.prepare(sql).all() };
}
const TRAILER = '<answer_meta>{"actions":[],"followUps":[{"text":"Which callers pass x into forward?","kind":"next"},{"text":"Where is the result of forward stored?","kind":"next"}]}</answer_meta>';
const codeRef = { sourceId: `code:example/project@${sha}:model.py`, kind: 'code', name: 'model.py', version: sha, range: { path: 'model.py', start: 2, end: 3 } };

test('a Main-canvas Chat turn stores its follow-ups as meta and streams the answer without the trailer', async t => {
  const f = fixture(t, [`forward returns x plus one.\n${TRAILER}`]);
  const { status, events } = await f.ask({ message: 'What does forward do?', mode: 'ask', command: null, context_refs: [codeRef] });
  assert.equal(status, 200);
  const text = events.filter(e => e.type === 'chunk').map(e => e.data.text).join('');
  assert.match(text, /returns x plus one/);
  assert.doesNotMatch(text, /answer_meta/, 'the trailer never streams');
  const meta = events.find(e => e.type === 'answer_meta')?.data, done = events.find(e => e.type === 'done')?.data;
  assert.deepEqual(meta.followUps.map(x => x.text), ['Which callers pass x into forward?', 'Where is the result of forward stored?']);
  assert.equal(done.messageId, meta.messageId);
  assert.ok(done.threadId.startsWith('repochat-'));
  // The model was asked with the trailer rules and the repository follow-up guidance, and the attached code ref read once from
  // the snapshot (selectedEntities), never listed again as a named attachment (one visible chip, one copy in the model input).
  const system = typeof f.sent[0].system === 'string' ? f.sent[0].system : f.sent[0].system.map(block => block.text).join('\n');
  assert.ok(system.includes(ANSWER_META_REPOSITORY));
  const sent = JSON.stringify(f.sent[0].messages);
  assert.match(sent, /selectedEntities/);
  assert.equal(sent.split('return x + 1').length - 1, 1, 'the selected code appears once');
  assert.doesNotMatch(sent, /Attached by the learner for this question/);
  // Stored: the answer without its trailer, the user turn's mode and refs, the answer's meta with its follow-ups.
  const answer = f.rows("SELECT id, content FROM messages WHERE role='assistant'")[0];
  assert.equal(String(answer.id), meta.messageId);
  assert.doesNotMatch(answer.content, /answer_meta/);
  const stored = Object.fromEntries(f.rows('SELECT role, meta_json FROM chat_message_meta').map(r => [r.role, JSON.parse(r.meta_json)]));
  assert.deepEqual([stored.user.mode, stored.user.contextRefs[0].sourceId], ['ask', codeRef.sourceId]);
  assert.deepEqual([stored.assistant.kind, stored.assistant.followUps.length], ['answer', 2]);
});

test('an ask without the Chat fields keeps the old path: no trailer rules, no meta rows', async t => {
  const f = fixture(t, ['forward returns x plus one.']);
  const { status, events } = await f.ask({ message: 'What does forward do?' });
  assert.equal(status, 200);
  assert.equal(events.some(e => e.type === 'answer_meta'), false);
  const system = typeof f.sent[0].system === 'string' ? f.sent[0].system : f.sent[0].system.map(block => block.text).join('\n');
  assert.equal(system.includes(ANSWER_META_REPOSITORY), false);
  assert.equal(f.rows('SELECT * FROM chat_message_meta').length, 0);
  assert.equal(f.rows("SELECT * FROM messages WHERE role='assistant'").length, 1);
});

test('a regeneration keeps the stored turn: no second user message, the new answer is an alternative of the first', async t => {
  const f = fixture(t, [`First answer.\n${TRAILER}`, `Second answer.\n${TRAILER}`]);
  const first = await f.ask({ message: 'What does forward do?', mode: 'ask', command: null, context_refs: [] });
  const done = first.events.find(e => e.type === 'done').data;
  const again = await f.ask({ message: 'What does forward do?', mode: 'ask', command: null, context_refs: [], thread_id: done.threadId, regenerate: { messageId: done.messageId } });
  assert.equal(again.status, 200);
  assert.equal(f.rows("SELECT * FROM messages WHERE role='user'").length, 1);
  assert.deepEqual(again.events.find(e => e.type === 'answer_meta').data.alternatives, [done.messageId, again.events.find(e => e.type === 'done').data.messageId]);
  assert.equal((await f.ask({ message: 'x', mode: 'ask', thread_id: done.threadId, regenerate: { messageId: '999' } })).status, 404);
});
