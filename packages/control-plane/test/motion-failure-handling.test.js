// Failure handling in the Worker (owner brief 2026-10-25, failed production job 61f70171): the code an orchestrator names decides what the learner
// is charged, what the card says and what it offers; a limit WE set never reads as the learner's credits and never charges them; the credits
// charged, credits refunded and the released hold are three different facts. The real LearnVideos Durable Object and the real D1 ledger talk to a
// FAKE orchestrator (a fetch stub that answers the job views below). Nothing is paid and nothing is sent anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer, periodOf, refundAttempt, usageTotals } from '../src/learn-usage.js';
import { FAILURE_CODES, LIMIT_CODES, codeOfCause, failureCodeOf, isDeterministic, isZeroCredit, userSafeError } from '../src/motion-failure.js';
import { memoryBucket } from './live-storage-spy.js';
import { READY } from './motion-ready-env.js';
import { moneyLeaks } from './no-money.js';
import { motionUsageLine } from '../../web/src/learn-video-label.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);
const TOKEN = 'm'.repeat(48);
const JOB = 'b'.repeat(32), BOOT = 'a'.repeat(32);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of [sql('0016-usage-operations.sql'), sql('0022-usage-accounting.sql'), sql('0027-usage-grants.sql')]) sqlite.exec(file);
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      return { bind(...values) { args = values; return this; }, first: async () => sqlite.prepare(text).get(...args) || null, all: async () => ({ results: sqlite.prepare(text).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }), now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }) };
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
  };
  return { sqlite, LEARN_DB };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(r => ({ ...r }));
function durable(id, data = new Map()) {
  let lock = Promise.resolve();
  return { id, data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}
const env0 = (LEARN_DB, reservationUsd = '2', extra = {}) => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_MEDIA: memoryBucket(),
  MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_JOB_RESERVATION_USD: reservationUsd, ...READY, ...extra });
const motionOp = { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } };
const ask = (extra = {}) => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: motionOp, lessonId: 'canvas', page: 'canvas', confirmed: true, ...extra }) }), { userId: 'u-alice', email: 'alice@example.test' });
const balance = LEARN_DB => usageTotals(LEARN_DB, 'u-alice', PERIOD);
const motionAttempts = sqlite => rows(sqlite, 'usage_attempts').filter(a => a.attempt_id.startsWith('motion-')).map(a => [a.reserved_micros, a.cost_state, a.cost_micros, a.status]);
const video = async actor => (await actor.list()).videos[0];
async function settle(actor, done) { for (let i = 0; i < 300; i++) { await actor.alarm(); if (await done()) return; await sleep(5); } assert.fail('the job did not reach the expected state'); }

// The orchestrator, as a fetch stub: /health, POST /jobs, GET /jobs/<id>, GET /jobs/<id>/artifacts.
function orchestrator(t, { refuse = null } = {}) {
  const state = { view: null, artifacts: null, posts: [], refuse };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host !== 'orchestrator.test') return original(url, init);
    const json = (body, status = 200) => Response.json(body, { status });
    if (u.pathname === '/health') return json({ ok: true, boot: BOOT });
    if (u.pathname === '/jobs' && init.method === 'POST') { state.posts.push(JSON.parse(init.body)); return state.refuse ? json(state.refuse.body, state.refuse.status) : json({ job_id: JOB, status: 'running' }, 202); }
    if (u.pathname === `/jobs/${JOB}`) return json(state.view);
    if (u.pathname === `/jobs/${JOB}/artifacts`) return json(state.artifacts);
    if (u.pathname === `/jobs/${JOB}/cancel`) { state.cancels = (state.cancels || 0) + 1; return json({ job_id: JOB, status: 'stopping' }, 202); }
    return json({ error: 'not_found' }, 404);
  };
  t.after(() => { globalThis.fetch = original; });
  return state;
}
// Job 61f70171 as the orchestrator reports it (diagnosis 2026-10-25): ceiling 2.00, three calls, US$1.278157, one render, a refused next call.
const REASON = "stopped before spending more: the next step (review_and_render) could cost up to $0.74, more than the $0.72 left of this job's $2.00 hold";
const failedView = (extra = {}) => ({ job_id: JOB, status: 'failed', stage: 'review_and_render', created_at: new Date(NOW * 1000).toISOString(), finished_at: new Date(NOW * 1000).toISOString(),
  spend: { hold_usd: 2, cost_usd: 1.278157, bound_usd: 1.278157, ceiling_usd: 2, calls: 3, in_flight: 0, refused: REASON, provider_calls: [] }, renders: 1, render_states: ['ready'], artifacts_rev: 1,
  failure_reason: REASON, clarification: null, cause: 'limit', failure_code: 'job_ceiling_insufficient',
  failure: { code: 'job_ceiling_insufficient', stage: 'review_and_render', kind: 'motion_review', reason: REASON.replace('stopped before spending more: ', ''), need_usd: 0.74, left_usd: 0.721843, ahead_usd: 0, ceiling_usd: 2 }, ...extra });
const artifactsOf = (actions, extra = {}) => ({ job_id: JOB, rev: 1, status: 'failed', cause: 'limit', failure_code: 'job_ceiling_insufficient', failure_reason: REASON, clarification: null, findings: [], blocking: [],
  checkpoint: { request: '/motion 15s explain me softmax func', brief: { id: 'b' }, storyboard: { id: 's' }, composition: { state: 'unreviewed', output: {} }, findings: [], frames: [] }, seal: 's'.repeat(64),
  actions, hold_usd: { fix: 7.9486, render: 0 }, next_need_usd: 1.8468, frames: [], ...extra });
async function run(t, { view, artifacts = artifactsOf([]), reservation = '2', refuse = null, payerSpent = null } = {}) {
  const { sqlite, LEARN_DB } = d1(t);
  if (payerSpent) {
    const id = 'seed-1';
    sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, 'u-alice', 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', ?)").run(id, PERIOD, NOW);
    sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('seed-1-a', ?, 'generation', ?, ?, 'settled', 'settled', ?)").run(id, payerSpent, payerSpent, NOW);
  }
  const fake = orchestrator(t, { refuse }); fake.view = view; fake.artifacts = artifacts;
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB, reservation));
  const first = await actor.fetch(ask());
  if (view) await settle(actor, async () => (await video(actor)).status === 'failed');
  return { sqlite, LEARN_DB, actor, fake, first };
}
const MESSAGE = FAILURE_CODES.job_ceiling_insufficient.message;

test('job 61f70171: our per-job ceiling is explained as such, charges the learner nothing, releases the hold and keeps the provider cost internally', async t => {
  const { sqlite, LEARN_DB, actor, fake } = await run(t, { view: failedView() });
  const v = await video(actor);
  assert.equal(v.error, MESSAGE);
  assert.doesNotMatch(JSON.stringify(await actor.list()), /\$\d|AI spending limit|need_usd|left_usd|stopped before spending more|review_and_render|motion_review/, 'no amount, no old sentence, no internal detail reaches the browser');
  assert.deepEqual(moneyLeaks(await actor.list()), [], 'no dollar key or amount anywhere in the list');
  assert.deepEqual([v.recovery.cause, v.recovery.code, v.recovery.explanation], ['limit', 'job_ceiling_insufficient', MESSAGE]);
  assert.doesNotMatch(v.recovery.explanation, /credits? (limit|left)|spending limit|exhausted/i);
  // Charging: zero credits for a failure caused by our configuration; the hold is released; the provider expense is on the platform ledger.
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'failed']]);
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0]);
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd, o.error]), [['failed', 1.278157, 'motion_job_ceiling_insufficient']]);
  assert.deepEqual(v.hold, { state: 'released' }, 'the reservation state is sent, never its amount');
  assert.deepEqual(v.recovery.accounting, { chargedCredits: 0, refundedCredits: 0, unknown: false });
  // The operator's view lives in the job record, never in the list.
  const [[, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  assert.deepEqual([job.failureCode, job.failure.code, job.failure.stage, job.failure.kind, job.failure.need_usd, job.failure.left_usd], ['job_ceiling_insufficient', 'job_ceiling_insufficient', 'review_and_render', 'motion_review', 0.74, 0.721843]);
  assert.deepEqual(job.providerCost.map(c => [c.micros, c.charged, c.free, c.code]), [[1_278_157, 0, true, 'job_ceiling_insufficient']]);
  // No blind retry: not even with the checkpoint's Continue fixing, whose next stage (about US$1.85 at the policy's caps) does not fit the US$0.72 left.
  assert.deepEqual([v.recovery.regenerate, v.recovery.actions], [false, []]);
  assert.equal(fake.posts.length, 1);
});

test('a limit from an orchestrator that names no code is still ours: no credits charged, no "AI spending limit", no blind retry', async t => {
  const view = failedView(); delete view.failure_code; delete view.failure;
  const { sqlite, LEARN_DB, actor } = await run(t, { view, artifacts: artifactsOf([], { failure_code: undefined }) });
  const v = await video(actor);
  assert.equal(v.error, FAILURE_CODES.limit_unspecified.message);
  assert.deepEqual([v.recovery.code, v.recovery.regenerate, v.recovery.actions], ['limit_unspecified', false, []]);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'failed']]);
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0]);
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => o.error), ['motion_limit_unspecified']);
  // A job recorded before codes existed, whose stored error carries the old sentence with amounts, is never shown with them.
  assert.equal(userSafeError(REASON, null), FAILURE_CODES.limit_unspecified.message);
  assert.equal(userSafeError('Stopped.', null), 'Stopped.');
});

test('recovery is offered by the next stage, not by budget left: Continue fixing needs what its review needs; Generate again is withheld after a ceiling refusal', async t => {
  // Reservation US$3: 1.72 is left after the failed attempt, which is "some budget" but less than the next stage's worst case (1.8468).
  const thin = await run(t, { view: failedView(), artifacts: artifactsOf(['fix']), reservation: '3' });
  const a = await video(thin.actor);
  assert.deepEqual([a.recovery.actions, a.recovery.regenerate], [[], false], 'US$1.72 left < US$1.8468 needed');
  // Reservation US$8.96: 7.68 is left; the review fits, so Continue fixing is offered (paid: it keeps its confirmation), still no blind regeneration.
  const roomy = await run(t, { view: failedView(), artifacts: artifactsOf(['fix']), reservation: '8.96' });
  const b = await video(roomy.actor);
  assert.deepEqual([b.recovery.actions, b.recovery.regenerate], [['fix'], false]);
  // Rendering alone repeats no model generation and needs no budget.
  const accepted = await run(t, { view: failedView({ failure_code: 'job_timeout', failure: undefined }), artifacts: artifactsOf(['render'], { failure_code: 'job_timeout', checkpoint: { ...artifactsOf([]).checkpoint, composition: { state: 'accepted', output: {} } } }), reservation: '2' });
  assert.deepEqual((await video(accepted.actor)).recovery.actions, ['render']);
});

test('the overall timeout, a call limit and a policy refusal each have their own sentence and charge nothing; a timeout may be generated again, a policy refusal may not', async t => {
  for (const [code, regenerate] of [['job_timeout', true], ['call_limit', true], ['policy_rejected', false], ['unknown_cost_bound', false]]) {
    const { sqlite, LEARN_DB, actor } = await run(t, { view: failedView({ failure_code: code, failure: { code, stage: 'authoring', reason: 'internal' } }), artifacts: artifactsOf([], { failure_code: code }) });
    const v = await video(actor);
    assert.equal(v.error, FAILURE_CODES[code].message, code);
    assert.equal(v.recovery.regenerate, regenerate, code);
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'failed']], `${code}: charged zero`);
    assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0], code);
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => o.error), [`motion_${code}`], code);
    assert.doesNotMatch(v.error, /\$|AI credits (are|were|have)|exhausted|spending limit/, code);
  }
});

test('the current charging policy, stated by test: renderer and infrastructure failures and every limit of ours charge zero; content and model failures and a Stop charge the cost', async t => {
  const table = [['renderer', 'renderer_failed', 0], ['infra', 'infrastructure', 0], ['limit', 'limit_unspecified', 0], ['content', 'content_rejected', 800_000], ['model', 'model_failed', 800_000]];
  for (const [cause, code, charged] of table) {
    assert.equal(failureCodeOf({ cause }), code);
    assert.equal(isZeroCredit({ status: 'failed', cause }), charged === 0, cause);
    const { sqlite, LEARN_DB, actor } = await run(t, { view: failedView({ cause, failure_code: undefined, failure: undefined, failure_reason: 'x', spend: { cost_usd: 0.8, bound_usd: 0.8, calls: 3, in_flight: 0 } }), artifacts: artifactsOf([], { cause, failure_code: undefined }) });
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', charged, 'failed']], cause);
    assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [charged, 0], cause);
    assert.deepEqual(rows(sqlite, 'usage_operations').map(o => o.cost_usd), [0.8], `${cause}: the provider cost is recorded either way`);
  }
  assert.equal(isZeroCredit(null), true, 'a job the orchestrator lost');
  // PROPOSED, NOT APPROVED (feat/motion-billing-correction): only the learner's confirmed Stop of this attempt is charged.
  assert.equal(isZeroCredit({ status: 'cancelled', cause: 'stopped' }, { learnerStop: true }), false);
  assert.equal(isZeroCredit({ status: 'cancelled', cause: 'stopped' }), true, 'a stop of unknown or system origin');
  assert.deepEqual(LIMIT_CODES.filter(c => !FAILURE_CODES[c].zeroCredit), [], 'every code the orchestrator names for a limit is zero-credit');
  assert.equal(isDeterministic('job_ceiling_insufficient') && isDeterministic('policy_rejected') && isDeterministic('unknown_cost_bound'), true);
  assert.equal(codeOfCause('stopped'), 'stopped');
});

// PROPOSED, NOT APPROVED (feat/motion-billing-correction, docs/features/rabbit-hole-motion-v1-harness-spec.md "Billing correction"): one test per class.
// Every class keeps the provider's measured cost on the platform ledger (an unknown one stays unknown, never 0), settles once and releases the hold.
const stopRequest = (id, confirmed) => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ action: 'cancel', id, ...(confirmed ? { confirmed: true } : {}) }) });
// Job 2 of 2026-10-27 (operation motion-66699755): cancelled during authoring after one call, US$1.018218.
const cancelledView = (cost = 1.018218) => failedView({ status: 'cancelled', stage: 'authoring', cause: 'stopped', failure_code: 'stopped', failure: null, failure_reason: 'stopped during authoring', renders: 0, render_states: [],
  spend: { hold_usd: 2, cost_usd: cost, bound_usd: cost ?? 1.5, ceiling_usd: 2, calls: 1, in_flight: 0, refused: null, provider_calls: [] } });
// Starts a job, optionally Stops it from the card (confirmed or not), then lets the orchestrator report it cancelled and settles it.
async function stoppedJob(t, { stop = null, cost = 1.018218, before = null } = {}) {
  const r = await run(t, { artifacts: artifactsOf([], { status: 'cancelled', cause: 'stopped', failure_code: 'stopped' }) });
  const { placementId } = await r.first.json();
  if (before) await before(r);
  if (stop) assert.equal((await r.actor.fetch(stopRequest(placementId, stop === 'confirmed'))).status, 200);
  r.fake.view = cancelledView(cost);
  await settle(r.actor, async () => motionAttempts(r.sqlite)[0][1] !== 'reserved');
  await r.actor.alarm(); await r.actor.alarm(); // a repeated alarm settles nothing twice
  const [[, job]] = [...await r.actor.state.storage.list({ prefix: 'job:' })];
  return { ...r, job };
}
const opRows = sqlite => rows(sqlite, 'usage_operations').map(o => [o.status, o.cost_usd]);

test('billing class 3, the learner pressed Stop and confirmed: charged the measured cost of the work done, once; the hold released', async t => {
  const { sqlite, LEARN_DB, job } = await stoppedJob(t, { stop: 'confirmed' });
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 1_018_218, 'failed']]);
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [1_018_218, 0]);
  assert.deepEqual(opRows(sqlite), [['failed', 1.018218]]);
  assert.deepEqual(job.providerCost.map(c => [c.micros, c.charged, c.free]), [[1_018_218, 1_018_218, false]], 'settled once');
  assert.equal(rows(sqlite, 'usage_actions').find(a => a.feature === 'video').status, 'cancelled');
});

test('billing class 4, a stop the learner did not confirm for this attempt: system-originated, unconfirmed or stale, charged zero; the provider cost is kept', async t => {
  for (const [name, options] of [
    ['the orchestrator ended it cancelled with no Stop from the card (system or unknown origin)', {}],
    ['a cancel request without the confirmation', { stop: 'unconfirmed' }],
    ['a Stop recorded for an earlier attempt of the same video', { before: async r => {
      const [[key, job]] = [...await r.actor.state.storage.list({ prefix: 'job:' })];
      await r.actor.state.storage.put(key, { ...job, stopped: true, stoppedOp: 'motion-an-earlier-attempt' });
    } }],
  ]) {
    const { sqlite, LEARN_DB, job } = await stoppedJob(t, options);
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'failed']], name);
    assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0], name);
    assert.deepEqual(opRows(sqlite), [['failed', 1.018218]], `${name}: the measured provider cost is never zeroed`);
    assert.deepEqual(job.providerCost.map(c => [c.micros, c.charged, c.free]), [[1_018_218, 0, true]], `${name}: settled once, cost kept`);
  }
  // An unknown provider cost on such a stop stays unknown (the operation keeps its admitted bound, the job record null), never 0.
  const { sqlite, job } = await stoppedJob(t, { cost: null });
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'failed']]);
  const [[status, costUsd]] = opRows(sqlite);
  assert.ok(status === 'failed' && costUsd > 0, `unknown cost not recorded as 0 (${costUsd})`);
  assert.deepEqual(job.providerCost.map(c => [c.micros, c.charged]), [[null, 0]]);
});

test('billing classes 1 and 2 are NOT changed yet: invalid model output and a refused request both arrive as model_failed or content_rejected, with no stable sub-code', async t => {
  // The orchestrator says why only in free text (failure_reason), so the Worker cannot tell "our checks rejected the model's output" (class 1)
  // from "the provider refused the request" (class 2). Both stay charged until a sub-code exists; an internal crash (infrastructure) is zero.
  for (const [cause, reason, charged] of [['model', 'brief: invalid_output: 3 errors', 800_000], ['model', 'brief: refused: cyber', 800_000],
    ['content', 'composition limits: the composition is complex, which is not covered for these settings (covered: simple)', 800_000], ['content', 'storyboard (after its repair): storyboard_invalid: B2 too long', 800_000],
    ['infra', 'the pipeline crashed: TypeError', 0]]) {
    const { sqlite, LEARN_DB } = await run(t, { view: failedView({ cause, failure_code: undefined, failure: undefined, failure_reason: reason, spend: { cost_usd: 0.8, bound_usd: 0.8, calls: 3, in_flight: 0 } }), artifacts: artifactsOf([], { cause, failure_code: undefined, failure_reason: reason }) });
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', charged, 'failed']], reason);
    assert.deepEqual(await balance(LEARN_DB).then(b => b.reserved), 0, reason);
    assert.deepEqual(opRows(sqlite), [['failed', 0.8]], `${reason}: the provider cost is recorded either way`);
  }
});

test('a job refused at start by the orchestrator preflight:nothing started, nothing charged, the hold released, the sentence is the code\'s and no retry is offered', async t => {
  const refuse = { status: 503, body: { error: 'not_configured', code: 'job_ceiling_insufficient', detail: 'Motion cannot run this video within its configured limits (job_ceiling_insufficient); nothing was started' } };
  const { sqlite, LEARN_DB, actor, first } = await run(t, { refuse });
  const v = (await first.json()).videos[0];
  assert.deepEqual([v.status, v.error], ['failed', MESSAGE]);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'cancelled']], 'released without a charge');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0]);
  const listed = await video(actor);
  assert.deepEqual([listed.recovery.code, listed.recovery.regenerate, listed.recovery.explanation], ['job_ceiling_insufficient', false, MESSAGE]);
  assert.equal(listed.error, MESSAGE);
});

test('only the learner\'s own allowance says AI credits: an exhausted allowance is its own code and starts nothing', async t => {
  const { sqlite, LEARN_DB, actor, fake } = await run(t, { payerSpent: 49_500_000 });
  const v = await video(actor);
  assert.match(v.error, /needs more AI credits than you have left\. Renews on .+\. Nothing was started\./);
  assert.deepEqual([v.recovery.code, fake.posts.length, motionAttempts(sqlite).length], ['allowance_exhausted', 0, 0]);
  assert.equal((await balance(LEARN_DB)).reserved, 0);
  // None of the limits of ours says it.
  for (const code of Object.keys(FAILURE_CODES).filter(c => c !== 'allowance_exhausted')) assert.doesNotMatch(FAILURE_CODES[code].message ?? '', /Not enough AI credits|used its|credits left|exhausted|spending limit/, code);
});

test('the signed quote must fit the reservation: a price above what the video may hold is refused before any hold', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB, '2')); // US$2 = 200 credits
  const job = { key: 'k', input: { proposal: { input: { binding: { estimate_credits: 250 } } } }, consumedMicros: 0 };
  const refusal = await actor.admitMotion(ask(), job, null);
  assert.equal(refusal, `${MESSAGE} Nothing was started.`);
  assert.equal(job.failureCode, 'job_ceiling_insufficient');
  assert.deepEqual([rows(sqlite, 'usage_attempts').length, rows(sqlite, 'usage_operations').length], [0, 0], 'no hold was taken');
  const fits = { key: 'k2', input: { proposal: { input: { binding: { estimate_credits: 100 } } } }, consumedMicros: 0 };
  assert.equal(await actor.admitMotion(ask(), fits, null), null);
  assert.equal(rows(sqlite, 'usage_attempts').length, 1);
});

test('released hold, charged credits and refunded credits are three facts: a refund is idempotent, auditable and shows apart from the hold', async t => {
  // A content failure is charged (current policy), then given back through the existing refund path.
  const { sqlite, LEARN_DB, actor } = await run(t, { view: failedView({ cause: 'content', failure_code: undefined, failure: undefined, failure_reason: 'still blocking', spend: { cost_usd: 0.8, bound_usd: 0.8, calls: 3, in_flight: 0 } }), artifacts: artifactsOf([], { cause: 'content', failure_code: undefined }) });
  let v = await video(actor);
  assert.deepEqual([v.recovery.accounting.chargedCredits, v.recovery.accounting.refundedCredits, v.hold.state], [80, 0, 'released']);
  assert.equal(motionUsageLine(v.usage, v.hold, v.recovery.accounting), 'Charged 80 credits · reservation released');
  const attempt = rows(sqlite, 'usage_attempts').find(a => a.attempt_id.startsWith('motion-')).attempt_id;
  assert.equal(await refundAttempt(LEARN_DB, attempt, { reason: 'test: our failure' }), 800_000);
  assert.equal(await refundAttempt(LEARN_DB, attempt, { reason: 'again' }), 0, 'a second refund changes nothing');
  assert.deepEqual(rows(sqlite, 'usage_adjustments').map(a => [a.micros, a.reason]), [[-800_000, 'test: our failure']], 'one audit row');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0]);
  v = await video(actor);
  assert.deepEqual([v.recovery.accounting.chargedCredits, v.recovery.accounting.refundedCredits, v.hold.state], [80, 80, 'released']);
  assert.equal(motionUsageLine(v.usage, v.hold, v.recovery.accounting), 'Charged 80 credits · 80 credits refunded · reservation released');
  assert.equal(motionUsageLine(null, { state: 'released' }, { chargedCredits: 0, refundedCredits: 0 }), 'No credits charged · reservation released');
  assert.equal(motionUsageLine(null, { state: 'pending' }, { chargedCredits: 0, refundedCredits: 0, unknown: true }), 'Charge not confirmed yet · reservation pending');
});

test('duplicate callbacks: settling the same failed job concurrently and again changes the ledger once', async t => {
  const { sqlite, LEARN_DB, actor } = await run(t, { view: failedView() });
  const [[, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  await Promise.all([actor.settleMotion(job, failedView()), actor.settleMotion(job, failedView({ failure_code: 'job_timeout' })), actor.alarm(), actor.alarm()]);
  await actor.settleMotion(job, failedView());
  assert.equal(motionAttempts(sqlite).length, 1);
  assert.equal(rows(sqlite, 'usage_operations').length, 1);
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => o.error), ['motion_job_ceiling_insufficient'], 'the first settlement wins');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [0, 0]);
});
