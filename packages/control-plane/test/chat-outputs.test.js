// A Chat prompt and the cards it made (UI changes brief sections 1 and 5): a / command line saved as the user's message with its
// command (POST /api/learn/chat/threads/<id>/messages), and PUT /api/learn/chat/messages/<id>/outputs keeping those cards on that
// message's meta (chat_message_meta, learn 0019), validated, bounded, upserted by card and owner-only. In-memory LEARN_DB only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { canvasesFetch } from '../src/canvases.js';
import { chatOutputsFetch, checkOutput, mergeOutputs, OUTPUTS_MAX, SNAPSHOT_MAX_BYTES } from '../src/chat-outputs-route.js';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const CANVAS = 'canvas-0a1b2c3d', A = 'canvaschat-00000000-0000-4000-8000-000000000001';
const owner = { org: 'team', email: 'owner@test' };
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  sqlite.exec(`INSERT INTO canvases(org,name,owner_email,title) VALUES('team','${CANVAS}','owner@test','Attention')`);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', user_id: 'u-1', apps: [] }) } };
  const send = (method, path, body) => canvasesFetch(new Request(`https://dev.test${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env);
  const post = body => send('POST', `/api/learn/chat/threads/${A}/messages`, { app: CANVAS, ...body });
  const put = (id, body, user = owner, method = 'PUT', headers = {}) => chatOutputsFetch(new Request(`https://dev.test/api/learn/chat/messages/${id}/outputs`, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, { identity: async () => user });
  const meta = id => JSON.parse(sqlite.prepare('SELECT meta_json FROM chat_message_meta WHERE message_id=?').get(Number(id)).meta_json);
  return { sqlite, send, post, put, meta };
}
const block = { id: 'card-1', type: 'cad', jobId: 'cadjob-1', status: 'ready', title: 'Plate', manifest: { revisionId: 'r1', artifacts: [{ kind: 'thumbnail', url: '/api/learn/files/src_1/d/thumb' }] } };
const output = (extra = {}) => ({ v: 1, cardId: 'card-1', kind: 'cad', title: 'Plate', jobId: 'cadjob-1', thumb: '/api/learn/files/src_1/d/thumb', startedAt: '2026-10-20T10:00:00.000Z', snapshot: { v: 1, block }, ...extra });

test('a / command line is saved as a user message with its command, once per client id, and restores with it', async t => {
  const f = fixture(t);
  const res = await f.post({ client_id: 'turn-1-u', role: 'user', content: '/cad a 40 mm plate', command: 'cad', title: '/cad a 40 mm plate' });
  assert.equal(res.status, 201);
  const { messageId } = await res.json();
  assert.equal((await f.post({ client_id: 'turn-1-u', role: 'user', content: '/cad a 40 mm plate', command: 'cad' })).status, 200, 'a retry is a duplicate');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM messages').get().n, 1);
  assert.deepEqual(f.meta(messageId), { mode: 'auto', command: 'cad', contextRefs: [], clientId: 'turn-1-u' });
  assert.equal((await f.post({ client_id: 'turn-2-u', role: 'user', content: '/3d a frustum', command: '3d' })).status, 201, 'a command may start with a digit');
  for (const bad of [{ command: 'CAD' }, { command: 'a b' }, { command: 7 }, { command: 'x'.repeat(41) }, { role: 'assistant', command: 'cad' }]) {
    assert.equal((await f.post({ client_id: 'turn-3-u', role: 'user', content: 'x', ...bad })).status, 400, JSON.stringify(bad));
  }
  const thread = await (await f.send('GET', `/api/ask/threads/${A}`)).json();
  assert.deepEqual(thread.messages.map(m => [m.content, m.command]), [['/cad a 40 mm plate', 'cad'], ['/3d a frustum', '3d']]);
});

test('PUT outputs: the owner keeps the cards on the user message, upserted by card; the thread restores them; others get 404', async t => {
  const f = fixture(t);
  const { messageId } = await (await f.post({ client_id: 'turn-1-u', role: 'user', content: '/cad a plate', command: 'cad' })).json();
  let res = await f.put(messageId, { outputs: [output()] });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).outputs, [output()]);
  // A refreshed snapshot of the same card replaces it in place; a second card is appended.
  const later = output({ title: 'Plate v2', snapshot: { v: 1, block: { ...block, title: 'Plate v2' } } });
  const second = { v: 1, cardId: 'card-2', kind: 'explanation', title: 'Why', snapshot: { v: 1, block: { id: 'card-2', type: 'explanation', title: 'Why', body: 'Because.' } } };
  res = await f.put(messageId, { outputs: [later, second] });
  const kept = (await res.json()).outputs;
  assert.deepEqual(kept.map(o => [o.cardId, o.title]), [['card-1', 'Plate v2'], ['card-2', 'Why']]);
  assert.deepEqual(kept[1], { ...second, jobId: null, thumb: null, startedAt: null }, 'defaults are explicit');
  assert.deepEqual(f.meta(messageId), { mode: 'auto', command: 'cad', contextRefs: [], clientId: 'turn-1-u', outputs: kept }, 'the rest of the meta is kept');
  const thread = await (await f.send('GET', `/api/ask/threads/${A}`)).json();
  assert.deepEqual(thread.messages[0].outputs, kept);
  // Permissions: another person, a missing message, an assistant message, the wrong method and another origin.
  assert.equal((await f.put(messageId, { outputs: [output()] }, { org: 'team', email: 'other@test' })).status, 404);
  assert.equal((await f.put(messageId, { outputs: [output()] }, { org: 'elsewhere', email: 'owner@test' })).status, 404);
  assert.equal((await f.put(99999, { outputs: [output()] })).status, 404);
  const answer = await (await f.post({ client_id: 'turn-1-a', role: 'assistant', content: 'Made it.' })).json();
  assert.equal((await f.put(answer.messageId, { outputs: [output()] })).status, 404, 'only a user message keeps outputs');
  assert.equal((await f.put(messageId, { outputs: [output()] }, owner, 'POST')).status, 405);
  assert.equal((await f.put(messageId, { outputs: [output()] }, owner, 'PUT', { origin: 'https://evil.test' })).status, 403);
  assert.deepEqual(f.meta(messageId).outputs, kept, 'no refused write changed anything');
  assert.equal(await chatOutputsFetch(new Request('https://dev.test/api/learn/chat/messages/1/syllabus', { method: 'PUT' }), {}), null);
});

test('outputs are validated; an oversized or unstable snapshot is dropped but the card still navigates; the count is bounded', async t => {
  const f = fixture(t);
  const { messageId } = await (await f.post({ client_id: 'turn-1-u', role: 'user', content: '/explain it', command: 'explain' })).json();
  for (const bad of [output({ v: 2 }), output({ cardId: '' }), output({ cardId: 'a b' }), output({ kind: '1x' }), output({ title: 5 }), output({ jobId: 'a b' }),
    output({ thumb: 'https://evil.test/x.png' }), output({ thumb: '/api/learn/files/../../api/apps' }), output({ thumb: '/api/other/x' }), output({ startedAt: 'yesterday' }),
    output({ snapshot: { v: 2, block } }), output({ snapshot: { v: 1, block: { ...block, id: 'other' } } }), output({ snapshot: { v: 1, block: [] } }), 'nope']) {
    assert.ok(checkOutput(bad).error, JSON.stringify(bad).slice(0, 120));
  }
  assert.equal((await f.put(messageId, 'not json')).status, 400);
  assert.equal((await f.put(messageId, { outputs: [] })).status, 400);
  assert.equal((await f.put(messageId, { outputs: [output({ thumb: 'https://evil.test/x.png' })] })).status, 400);
  const huge = output({ snapshot: { v: 1, block: { ...block, body: 'x'.repeat(SNAPSHOT_MAX_BYTES) } } });
  const blob = output({ cardId: 'card-3', snapshot: { v: 1, block: { ...block, id: 'card-3', src: 'blob:https://dev.test/1' } } });
  const data = output({ cardId: 'card-4', snapshot: { v: 1, block: { ...block, id: 'card-4', nested: { src: 'data:image/png;base64,AAAA' } } } });
  const kept = (await (await f.put(messageId, { outputs: [huge, blob, data] })).json()).outputs;
  assert.deepEqual(kept.map(o => [o.cardId, o.snapshot, o.unavailable]), [['card-1', null, 'too_large'], ['card-3', null, 'unstable'], ['card-4', null, 'unstable']]);
  assert.equal(kept[0].thumb, output().thumb, 'navigation fields stay');
  const many = Array.from({ length: OUTPUTS_MAX }, (_, i) => output({ cardId: `many-${i}`, snapshot: null }));
  assert.equal((await f.put(messageId, { outputs: [...many, output()] })).status, 400, 'more than the cap in one request');
  assert.equal((await f.put(messageId, { outputs: many })).status, 400, 'more than the cap kept on the message');
  assert.equal(f.meta(messageId).outputs.length, 3);
});

test('mergeOutputs replaces by card in place and appends new cards', () => {
  assert.deepEqual(mergeOutputs([{ cardId: 'a', n: 1 }, { cardId: 'b', n: 1 }, null], [{ cardId: 'b', n: 2 }, { cardId: 'c', n: 1 }]), [{ cardId: 'a', n: 1 }, { cardId: 'b', n: 2 }, { cardId: 'c', n: 1 }]);
  assert.deepEqual(mergeOutputs(undefined, [{ cardId: 'a' }]), [{ cardId: 'a' }]);
});
