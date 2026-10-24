// Regression evidence for the ImageJobs candidate (task 64fb7852-5698-4abd-9f38-dfd4addc86a6): gaps the existing tests leave in the
// flows UI-15.1 changed (saved-proposal compatibility, the Motion reference gate at Generate, the Motion duration contract with the
// orchestrator, Explain's saved v2 brief). Local SQLite and fakes only: no model, provider, network or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { approvedProposal, consumeProposal, proposalRecord, proposalState, reviseProposal, signProposal, verifyProposal } from '../src/generation-proposal.js';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer } from '../src/learn-usage.js';
import { validateJobRequest } from '../../learn-render/motion/orchestrator.mjs';
import { proposalView, settingsOf } from '../../web/src/generation-confirmation-schema.js';
import { MOTION_NOT_READY, MOTION_READY_SECONDS, motionInputs, motionReadiness } from '../src/motion-readiness.js';

const ALICE = 'alice@example.test';
const env = { ANTHROPIC_API_KEY: 'a'.repeat(40), MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48), MOTION_ESTIMATE_USD: '1.00', MOTION_JOB_RESERVATION_USD: '8.96' };
const DEST = { org: 'w', app: 'canvas-1' };
const CARD = { id: 'r1', label: 'CAD · Roller assembly', kind: 'card', sourceId: 'card:cad-1', revision: 'rev-1', range: null };
const DESCRIPTION = 'Sunlight warms a body of water. Moist air rises and cools. Droplets fall as rain.';
const base = (over = {}) => ({ command: 'motion', title: 'Water cycle', description: DESCRIPTION, settings: { duration_seconds: 10, audio: false }, source_refs: [], input: { request: '/motion water cycle', concept: 'Weather', ...DEST }, ...over });

function stack(t, signed) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8').replace(/\r/g, ''));
  sqlite.exec("INSERT INTO threads (id, org, user, scope_ref, commit_sha) VALUES ('7', 'w', 'alice@example.test', 'canvas-1', 'canvas')");
  sqlite.exec("INSERT INTO messages (id, thread_id, role, content) VALUES (40, '7', 'assistant', 'Here is a proposal.')");
  sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (40, '7', 'assistant', ?)").run(JSON.stringify({ version: 1, kind: 'answer', proposal: signed, proposalState: proposalState(signed) }));
  const LEARN_DB = { prepare: sql => { const s = sqlite.prepare(sql); return { bind: (...a) => ({ first: async () => s.get(...a) || null, all: async () => ({ results: s.all(...a) }), run: async () => ({ meta: s.run(...a) }) }) }; } };
  const call = (method, body) => chatProposalFetch(new Request('https://dev.test/api/learn/chat/messages/40/proposal', { method, ...(body ? { body: JSON.stringify(body) } : {}) }), { ...env, LEARN_DB }, { identity: async () => ({ org: 'w', email: ALICE }) });
  return { LEARN_DB, put: body => call('PUT', body), get: () => call('GET') };
}

// A Motion proposal saved before this release could carry any whole second from 5 to 30 (the old validator); the schema now offers
// multiples of five. Opening, editing and generating one of those must not start refusing the learner's saved card.
for (const [label, sign] of [['v2', () => signProposal(env, base({ settings: { duration_seconds: 12, audio: false } }), ALICE)],
  ['v1', () => signProposal({ MOTION_ORCHESTRATOR_TOKEN: env.MOTION_ORCHESTRATOR_TOKEN }, base({ settings: { duration_seconds: 12, audio: false } }), ALICE)]]) {
  test(`a saved ${label} Motion proposal of 12 seconds still opens, verifies and generates exactly once`, async t => {
    const old = await sign();
    assert.match(old.sig, label === 'v2' ? /^v2./ : /^[0-9a-f]{64}$/);
    assert.equal(await verifyProposal(env, old, ALICE), null);
    const s = stack(t, old);
    const got = await s.get();
    assert.equal(got.status, 200);
    assert.equal((await got.json()).proposal.settings.duration_seconds, 12);
    assert.deepEqual(approvedProposal(old), { title: 'Water cycle', duration_seconds: 12, description: DESCRIPTION });
    assert.equal(await consumeProposal(s.LEARN_DB, old, ALICE, DEST, 'press-1'), null);
    assert.equal((await consumeProposal(s.LEARN_DB, old, ALICE, DEST, 'press-2')).code, 'proposal_used');
  });
  // The edit route does not judge the proposal's UNCHANGED settings again under the 5-second-step schema (reviseProposal keep), but a
  // changed duration is judged by the current rule.
  test(`a title edit on a saved ${label} Motion proposal of 12 seconds keeps its 12 seconds; changing the duration follows the new rule`, async t => {
    const s = stack(t, await sign());
    const title = await s.put({ expected_version: 1, title: 'Water cycle, retitled' });
    const out = await title.json();
    assert.equal(title.status, 200, JSON.stringify(out));
    assert.deepEqual([out.proposal.version, out.proposal.title, out.proposal.settings.duration_seconds], [2, 'Water cycle, retitled', 12]);
    assert.equal(await verifyProposal(env, out.proposal, ALICE), null);
  });
}

// Motion reads no reference yet, so a reference on its proposal is named unsupported at Generate (learn-video.js), before the proposal
// is consumed, a hold is taken or the orchestrator is asked. The card blocks Generate too, but the server does not rely on that.
test('Generate on a Motion proposal that carries a reference answers 409 reference_blocked: not consumed, no job, no orchestrator call', async t => {
  const p = await signProposal(env, base({ prompt: 'Show {{ref:r1}} turning.', references: [CARD] }), ALICE, { envelope: 'v3' });
  const s = stack(t, p);
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); throw new Error(`unexpected network call: ${url}`); };
  t.after(() => { globalThis.fetch = original; });
  const stored = new Map();
  const state = { id: 'video-a', storage: { get: async k => structuredClone(stored.get(k)), put: async (k, v) => stored.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...stored].filter(([k]) => k.startsWith(prefix))), setAlarm: async () => {} }, blockConcurrencyWhile: fn => fn() };
  const actor = new LearnVideos(state, { ...env, SMALL_ENV: 'dev', LEARN_DB: s.LEARN_DB });
  const operation = { op: 'motion_request', request: '/motion water cycle', location: { concept: 'Weather' }, proposal: p, request_id: 'press-0001' };
  const res = await actor.fetch(forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=canvas-1', { method: 'POST', body: JSON.stringify({ operation, lessonId: 'canvas', page: 'canvas', confirmed: true }) }), { userId: 'u-alice', email: ALICE }));
  const body = await res.json();
  assert.deepEqual([res.status, body.code, body.references.map(r => [r.id, r.state])], [409, 'reference_blocked', [['r1', 'unsupported']]]);
  assert.deepEqual([...stored.keys()], [], 'no job and no proposal owner were stored');
  assert.deepEqual(calls, [], 'the orchestrator was never asked');
  assert.equal((await proposalRecord(s.LEARN_DB, ALICE, 'canvas-1', p.proposal_id)).state.used, null, 'the proposal was not consumed');
});

// The deployed orchestrator validates approved_proposal as duration_seconds 5 to 30 (learn-render/motion/orchestrator.mjs). The schema keeps
// 5 to 60 visible (owner 2026-10-23); readiness says which may be generated. Nothing is clamped or substituted.
test('every Motion duration stays offered; the ones the orchestrator would 400 are not ready, with a reason, and Generate is blocked before any hold', async () => {
  const offered = settingsOf('motion').find(f => f.key === 'duration_seconds').options.map(o => o.value);
  assert.deepEqual(offered, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60], 'the schema is not shrunk');
  for (const seconds of offered) {
    const p = await signProposal(env, base({ settings: { duration_seconds: seconds, audio: false } }), ALICE, { envelope: 'v3' });
    assert.equal(await verifyProposal(env, p, ALICE), null, `${seconds} s signs and verifies`);
    assert.equal(p.settings.duration_seconds, seconds, 'never clamped');
    const orchestrator = validateJobRequest({ request: '/motion water cycle', location: { concept: 'Weather' }, idempotency_key: 'op-motion-1-key', approved_proposal: approvedProposal(p) }).filter(e => e.startsWith('approved_proposal'));
    const view = proposalView(p);
    if (p.readiness.ready) {
      assert.deepEqual(orchestrator, [], `${seconds} s is ready, so the orchestrator accepts it`);
      assert.ok(view.allowed_actions.includes('generate'), `${seconds} s can be generated`);
    } else {
      assert.ok(seconds > MOTION_READY_SECONDS.max && p.readiness.code === MOTION_NOT_READY && p.readiness.message.includes(`${seconds} second`), `${seconds} s names its reason`);
      assert.ok(view.validation_errors.some(e => e.path === 'readiness') && !view.allowed_actions.includes('generate'), `${seconds} s blocks Generate on the card`);
      assert.ok(view.allowed_actions.includes('save'), 'and stays editable');
    }
    assert.equal(p.readiness.ready, seconds <= 30);
  }
  assert.equal(motionReadiness(env, motionInputs({ duration_seconds: 12 })).ready, true, 'a saved whole-second duration inside the range is ready');
});

test('Generate on a Motion proposal of 45 seconds answers 409 motion_not_ready: not consumed, no job, no hold, no orchestrator call; 30 seconds is not refused by readiness', async t => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); throw new Error(`unexpected network call: ${url}`); };
  t.after(() => { globalThis.fetch = original; });
  const run = async seconds => {
    const p = await signProposal(env, base({ settings: { duration_seconds: seconds, audio: false } }), ALICE, { envelope: 'v3' });
    const s = stack(t, p), stored = new Map();
    const state = { id: 'video-a', storage: { get: async k => structuredClone(stored.get(k)), put: async (k, v) => stored.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...stored].filter(([k]) => k.startsWith(prefix))), setAlarm: async () => {} }, blockConcurrencyWhile: fn => fn() };
    const actor = new LearnVideos(state, { ...env, SMALL_ENV: 'dev', LEARN_DB: s.LEARN_DB });
    const operation = { op: 'motion_request', request: '/motion water cycle', location: { concept: 'Weather' }, proposal: p, request_id: 'press-0001' };
    const res = await actor.fetch(forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=canvas-1', { method: 'POST', body: JSON.stringify({ operation, lessonId: 'canvas', page: 'canvas', confirmed: true }) }), { userId: 'u-alice', email: ALICE }));
    return { res, body: await res.json(), stored, used: (await proposalRecord(s.LEARN_DB, ALICE, 'canvas-1', p.proposal_id)).state.used };
  };
  const refused = await run(45);
  assert.deepEqual([refused.res.status, refused.body.code, refused.body.readiness.ready], [409, 'motion_not_ready', false]);
  assert.match(refused.body.error, /45 second video is not ready/);
  assert.deepEqual([[...refused.stored.keys()], calls, refused.used], [[], [], null]);
  // inside the range readiness does not refuse: whatever happens next is the unchanged path (no readiness code)
  const fine = await run(30);
  assert.notEqual(fine.body.code, 'motion_not_ready');
});

// A saved /explain brief proposal (v2, no references) that the learner edits becomes a v3 revision; Generate on it still approves the job
// through the route with nothing to check (no references), consuming the proposal once.
test('a saved v2 Explain proposal edited on its card becomes a v3 revision that verifies and keeps its edits', async () => {
  const input = { request: 'Explain a pendulum.', ...DEST, job: 'ej_1', brief_hash: 'h' };
  const old = await signProposal(env, { command: 'explain', title: 'Pendulum', description: 'One. Two. Three.', settings: { presentation: 'steps' }, source_refs: [], input }, ALICE);
  assert.match(old.sig, /^v2\./);
  const next = await reviseProposal(env, old, { settings: { presentation: 'time' }, assumptions: ['No friction.'] }, ALICE, DEST);
  assert.equal(next.error, undefined, JSON.stringify(next));
  assert.match(next.proposal.sig, /^v3\./);
  assert.deepEqual([next.proposal.version, next.proposal.settings, next.proposal.assumptions, next.proposal.references], [2, { presentation: 'time' }, ['No friction.'], []]);
  assert.equal(await verifyProposal(env, next.proposal, ALICE), null);
});
