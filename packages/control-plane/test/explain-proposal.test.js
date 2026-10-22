// EXP-T12 slice 3: the common proposal identity, capability-neutral. A versioned v2 signature that needs no Motion secret, v1
// kept for Motion's existing cards, /explain's settings, usage and used text, and the settings route (chat-proposal-route.js)
// on /explain proposals over the one MOT-22 state, on a local SQLite LEARN_DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SIGNABLE, WIRED, consumeProposal, proposalState, proposalUsage, proposalUsedText, reviseSettings, signProposal, validateSettings, verifyProposal } from '../src/generation-proposal.js';
import { chatProposalFetch } from '../src/chat-proposal-route.js';

const ALICE = 'alice@example.test';
const MOTION_ONLY = { MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) };
const EXPLAIN_ONLY = { ANTHROPIC_API_KEY: 'a'.repeat(40) }; // Motion unconfigured
const BOTH = { ...MOTION_ONLY, ...EXPLAIN_ONLY };
const fields = (command = 'explain', extra = {}) => ({ command, title: 'Pendulum', description: 'One. Two. Three.', settings: command === 'motion' ? { duration_seconds: 10, audio: false } : {}, source_refs: [], input: { org: 'acme', app: 'canvas-a', job: 'ej_1' }, ...extra });
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const hmac = async (secret, text) => hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(text)));

test('/explain is signable without being offered to the chat tool; Motion stays the only wired command', () => {
  assert.deepEqual(WIRED, ['motion']);
  assert.deepEqual(SIGNABLE, ['motion', 'explain']);
});

test('v2: /explain signs and verifies with Motion unconfigured; no secret at all is an explicit refusal', async () => {
  const p = await signProposal(EXPLAIN_ONLY, fields(), ALICE);
  assert.match(p.sig, /^v2\.[0-9a-f]{64}$/);
  assert.equal(await verifyProposal(EXPLAIN_ONLY, p, ALICE), null);
  assert.equal(await verifyProposal({ INLINE_DECISION_KEY: 'k'.repeat(40) }, p, ALICE) !== null, true, 'another environment\'s key');
  await assert.rejects(signProposal({}, fields(), ALICE), /Generation proposals are not available/);
  await assert.rejects(signProposal(MOTION_ONLY, fields(), ALICE), /Generation proposals are not available/, 'the Motion secret never signs /explain');
});

test('Motion keeps working: v1 where only its secret exists, v2 where a model key exists, and its v1 cards still verify', async () => {
  const v1 = await signProposal(MOTION_ONLY, fields('motion'), ALICE);
  assert.match(v1.sig, /^[0-9a-f]{64}$/);
  assert.equal(await verifyProposal(MOTION_ONLY, v1, ALICE), null);
  assert.equal(await verifyProposal(BOTH, v1, ALICE), null, 'a card signed before the transition');
  const v2 = await signProposal(BOTH, fields('motion'), ALICE);
  assert.match(v2.sig, /^v2\./);
  assert.equal(await verifyProposal(BOTH, v2, ALICE), null);
  assert.match(await verifyProposal(MOTION_ONLY, v2, ALICE), /not available/);
});

test('tampered, other-learner, expired, downgraded and old-version /explain envelopes are refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const p = await signProposal(BOTH, fields(), ALICE);
  for (const bad of [{ ...p, title: 'Other' }, { ...p, input: { ...p.input, app: 'canvas-b' } }, { ...p, settings: { presentation: 'steps' } }, { ...p, version: 2 }, { ...p, command: 'motion' }])
    assert.match(await verifyProposal(BOTH, bad, ALICE), /changed|not a generation proposal/);
  assert.match(await verifyProposal(BOTH, p, 'bob@example.test'), /not made for you/);
  assert.match(await verifyProposal(BOTH, p, ALICE, now + 2 * 86400), /expired/);
  // The v2 tag stripped (a downgrade to v1 verification) and a v1-style envelope for /explain made with the Motion secret.
  assert.match(await verifyProposal(BOTH, { ...p, sig: p.sig.slice(3) }, ALICE), /not available/);
  const canonical = JSON.stringify(['proposal_id', 'version', 'command', 'title', 'description', 'settings', 'source_refs', 'input', 'expires_at'].map(k => p[k] ?? null));
  const forged = await hmac(MOTION_ONLY.MOTION_ORCHESTRATOR_TOKEN, `generation-proposal|${ALICE}|${canonical}`);
  assert.match(await verifyProposal(BOTH, { ...p, sig: forged }, ALICE), /not available/);
});

test('/explain settings, usage in credits and used text are its own, never Motion\'s', async () => {
  assert.deepEqual(validateSettings('explain', undefined), { value: {} });
  assert.deepEqual(validateSettings('explain', { presentation: 'steps' }), { value: { presentation: 'steps' } });
  for (const bad of [{ duration_seconds: 10 }, { audio: false }, { presentation: 'video' }, []]) assert.ok(validateSettings('explain', bad).error, JSON.stringify(bad));
  const motionEnv = { ...BOTH, MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '8.96' };
  assert.deepEqual(proposalUsage(motionEnv, 'explain'), { estimate_credits: null, reserve_credits: 332 });
  assert.deepEqual(proposalUsage({ ...motionEnv, EXPLAIN_ESTIMATE_USD: '0.42' }, 'explain'), { estimate_credits: 42, reserve_credits: 332 });
  assert.deepEqual(proposalUsage(motionEnv, 'motion'), { estimate_credits: 100, reserve_credits: 896 });
  assert.match(proposalUsedText('explain'), /made an explanation/);
  assert.match(proposalUsedText('motion'), /made a video/);
  const p = await signProposal(EXPLAIN_ONLY, fields(), ALICE);
  const revised = await reviseSettings(EXPLAIN_ONLY, p, { presentation: 'experiment' }, ALICE, { org: 'acme', app: 'canvas-a' });
  assert.deepEqual([revised.proposal.version, revised.proposal.settings], [2, { presentation: 'experiment' }]);
  assert.match((await reviseSettings(EXPLAIN_ONLY, p, { duration_seconds: 10 }, ALICE)).error, /not an explanation setting/);
});

function chatDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, org TEXT NOT NULL, user TEXT NOT NULL, scope_ref TEXT NOT NULL); CREATE TABLE chat_message_meta (message_id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, meta_json TEXT NOT NULL)");
  sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref) VALUES ('th', 'acme', ?, 'canvas-a')").run(ALICE);
  const db = { prepare: text => { let args = []; const stmt = sqlite.prepare(text); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }), now: () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, db };
}

test('the settings route on an /explain proposal: expected revision required, out-of-order saves refused, used says explanation', async t => {
  const { db } = chatDb(t);
  const env = { ...EXPLAIN_ONLY, LEARN_DB: db };
  const p = await signProposal(env, fields(), ALICE);
  await db.prepare("INSERT INTO chat_message_meta VALUES (1, 'th', 'assistant', ?)").bind(JSON.stringify({ proposal: p, proposalState: proposalState(p) })).run();
  const put = body => chatProposalFetch(new Request('https://dev.test/api/learn/chat/messages/1/proposal', { method: 'PUT', headers: { origin: 'https://dev.test' }, body: JSON.stringify(body) }), env, { identity: async () => ({ org: 'acme', email: ALICE }) });
  const read = async body => { const r = await put(body); return { status: r.status, body: await r.json() }; };
  assert.equal((await read({ settings: { presentation: 'steps' } })).status, 400, 'no expected revision: a delayed request cannot apply');
  const saved = await read({ settings: { presentation: 'steps' }, expected_version: 1 });
  assert.deepEqual([saved.status, saved.body.proposal.version, saved.body.proposal.settings], [200, 2, { presentation: 'steps' }]);
  const late = await read({ settings: { presentation: 'time' }, expected_version: 1 });
  assert.deepEqual([late.status, late.body.code, late.body.current.settings], [409, 'proposal_stale', { presentation: 'steps' }]);
  assert.equal(await consumeProposal(db, saved.body.proposal, ALICE, { org: 'acme', app: 'canvas-a' }, 'ej_1'), null);
  const used = await read({ settings: { presentation: 'time' }, expected_version: 2 });
  assert.deepEqual([used.status, used.body.code], [409, 'proposal_used']);
  assert.match(used.body.error, /made an explanation/);
  // Replay to another canvas or workspace is refused by the same consume.
  for (const dest of [{ org: 'acme', app: 'canvas-b' }, { org: 'other', app: 'canvas-a' }]) assert.equal((await consumeProposal(db, saved.body.proposal, ALICE, dest, 'ej_2')).code, 'proposal_canvas');
});
