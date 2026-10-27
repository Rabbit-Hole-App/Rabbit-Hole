// CHARACTERISATION of how the Worker settles a Motion job the orchestrator refused on its own per-job ceiling, using the numbers of the
// second owner-only production acceptance job (orchestrator job 3c46c4d2c7414f141a3c33fd34cebb00, 2026-10-26): five calls for US$1.540278 and one
// preview render, then call 6 (a storyboard REVISION) refused job_ceiling_insufficient at ceiling 3.50 with a grant of 8.96. It states what the code
// does today and changes no policy. The real LearnVideos Durable Object and the real D1 ledger talk to a FAKE orchestrator (a fetch stub that answers
// the job view below); nothing is paid and nothing is sent anywhere. The view is the shape packages/learn-render/motion/orchestrator.mjs jobView
// produces (its own test, admission-characterisation.test.mjs, asserts the same spend and failure fields from the real orchestrator).
//
// What it pins: (1) the provider cost lands once in the platform's totals (usage_operations.cost_usd, the daily guard reads it) while the learner is
// charged zero credits for a limit of ours (usage_attempts.cost_micros 0); (2) a replay or a concurrent poll of the same refused job settles nothing
// twice; (3) a refused job whose cost is unknown keeps its WHOLE reservation in the platform totals and still charges the learner nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer, periodOf, usageTotals } from '../src/learn-usage.js';
import { platformSpendStatus } from '../src/learn-spend-ledger.js';
import { memoryBucket } from './live-storage-spy.js';
import { READY } from './motion-ready-env.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);
const TOKEN = 'm'.repeat(48), JOB = '3c46c4d2c7414f141a3c33fd34cebb00', BOOT = 'a'.repeat(32);
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
const rows = (sqlite, sqlText) => sqlite.prepare(sqlText).all().map(r => ({ ...r }));
function durable(id, data = new Map()) {
  let lock = Promise.resolve();
  return { id, data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}
// The grant the observed job carried: MOTION_JOB_RESERVATION_USD 8.96 (the orchestrator's own ceiling, 3.50, is in the view).
const env0 = LEARN_DB => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_MEDIA: memoryBucket(),
  MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_JOB_RESERVATION_USD: '8.96', ...READY });
const ask = () => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: { op: 'motion_request', request: '/motion 15s explain photosynthesis', location: { concept: 'Photosynthesis' } }, lessonId: 'canvas', page: 'canvas', confirmed: true }) }), { userId: 'u-alice', email: 'alice@example.test' });
const video = async actor => (await actor.list()).videos[0];
async function settle(actor, done) { for (let i = 0; i < 300; i++) { await actor.alarm(); if (await done()) return; await sleep(5); } assert.fail('the job did not reach the expected state'); }
function orchestrator(t, view) {
  const state = { view, posts: [] }, original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host !== 'orchestrator.test') return original(url, init);
    const json = (body, status = 200) => Response.json(body, { status });
    if (u.pathname === '/health') return json({ ok: true, boot: BOOT });
    if (u.pathname === '/jobs' && init.method === 'POST') { state.posts.push(JSON.parse(init.body)); return json({ job_id: JOB, status: 'running' }, 202); }
    if (u.pathname === `/jobs/${JOB}`) return json(state.view);
    if (u.pathname === `/jobs/${JOB}/artifacts`) return json({ job_id: JOB, rev: 1, status: 'failed', cause: 'limit', failure_code: 'job_ceiling_insufficient', findings: [], blocking: [], checkpoint: null, seal: null, actions: [], hold_usd: { fix: 7.9486, render: 0 }, next_need_usd: null, frames: [] });
    return json({ error: 'not_found' }, 404);
  };
  t.after(() => { globalThis.fetch = original; });
  return state;
}
// The job as the orchestrator reported it. The per-call split of the 1.540278 was not logged: the five costs below are INVENTED to sum to it.
const REASON = "this motion_storyboard call (up to $0.45) and the least the required steps after it can cost ($1.92) are more than the $1.96 left of this job's $3.50 ceiling";
const CALLS = [['motion_brief', 65_000], ['motion_storyboard', 184_000], ['motion_composition', 1_152_778], ['motion_review', 62_000], ['motion_review', 76_500]];
const observedView = (extra = {}, spend = {}) => ({ job_id: JOB, status: 'failed', stage: 'job:reviewing', created_at: new Date(NOW * 1000).toISOString(), finished_at: new Date(NOW * 1000).toISOString(),
  spend: { hold_usd: 8.96, cost_usd: 1.540278, bound_usd: 1.540278, ceiling_usd: 3.5, calls: 5, in_flight: 0, refused: REASON,
    provider_calls: CALLS.map(([kind, micros]) => ({ stage: 'x', kind, model: 'claude-opus-5-5', state: 'done', bound_usd: 1, cost_usd: micros / 1e6, usage: { input_tokens: 100, output_tokens: 10 } })), ...spend },
  renders: 1, render_states: ['ready'], artifacts_rev: 1, failure_reason: `stopped before spending more: ${REASON}`, clarification: null, cause: 'limit', failure_code: 'job_ceiling_insufficient',
  failure: { code: 'job_ceiling_insufficient', stage: 'job:reviewing', kind: 'motion_storyboard', reason: REASON, need_usd: 0.44986, left_usd: 1.959722, ahead_usd: 1.92, ceiling_usd: 3.5 }, ...extra });
async function run(t, view) {
  const { sqlite, LEARN_DB } = d1(t);
  const fake = orchestrator(t, view);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  await settle(actor, async () => (await video(actor)).status === 'failed');
  const [[, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  return { sqlite, LEARN_DB, actor, fake, job };
}
const ledger = ({ sqlite, LEARN_DB }) => ({
  operations: rows(sqlite, 'SELECT status, calls, cost_usd, error FROM usage_operations ORDER BY rowid').map(o => [o.status, o.calls, o.cost_usd, o.error]),
  attempts: rows(sqlite, "SELECT reserved_micros, cost_state, cost_micros, status FROM usage_attempts WHERE attempt_id LIKE 'motion-%' ORDER BY rowid").map(a => [a.reserved_micros, a.cost_state, a.cost_micros, a.status]),
  renderActions: rows(sqlite, "SELECT status FROM usage_actions WHERE feature = 'render'").length,
  platformUsd: rows(sqlite, "SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM usage_operations WHERE status <> 'cancelled'")[0].usd,
  learnerCostMicros: rows(sqlite, 'SELECT COALESCE(SUM(cost_micros), 0) AS micros FROM usage_attempts')[0].micros,
  balance: usageTotals(LEARN_DB, 'u-alice', PERIOD),
});

test('job 3c46c4d2: the provider cost lands ONCE in the platform totals (1.540278) while the learner is charged ZERO credits for our limit; the hold is released', async t => {
  const ctx = await run(t, observedView());
  const v = await video(ctx.actor), l = ledger(ctx);
  assert.equal(ctx.fake.posts.length, 1);
  assert.deepEqual(l.operations, [['failed', 5, 1.540278, 'motion_job_ceiling_insufficient']], 'platform side: the actual provider cost, once, with the code of the limit');
  assert.deepEqual(l.attempts, [[8_960_000, 'settled', 0, 'failed']], 'learner side: a US$8.96 hold, settled at zero credits');
  assert.deepEqual([l.platformUsd, l.learnerCostMicros], [1.540278, 0]);
  assert.deepEqual(await l.balance.then(b => [b.used, b.reserved]), [0, 0], 'nothing used, nothing still held');
  assert.equal(l.renderActions, 1, 'the one preview render is recorded apart as platform compute');
  assert.deepEqual([ctx.job.consumedMicros, ctx.job.usedMicros, ctx.job.providerCost.map(c => [c.micros, c.charged, c.free, c.code])], [1_540_278, 0, [[1_540_278, 0, true, 'job_ceiling_insufficient']]]);
  assert.equal(ctx.job.usageUnknown, undefined);
  assert.deepEqual([ctx.job.failure.need_usd, ctx.job.failure.left_usd, ctx.job.failure.ahead_usd, ctx.job.failure.kind], [0.44986, 1.959722, 1.92, 'motion_storyboard'], 'the operator detail stays in the job record');
  assert.deepEqual([v.recovery.accounting, v.hold], [{ chargedCredits: 0, refundedCredits: 0, unknown: false }, { state: 'released' }]);
  assert.deepEqual([v.recovery.code, v.recovery.regenerate], ['job_ceiling_insufficient', false], 'a deterministic limit: no blind retry');
  // The platform's daily guard sees exactly the provider cost: a cap at it is reached, a cap a micro-USD above is not.
  assert.deepEqual(await platformSpendStatus(ctx.LEARN_DB, { USAGE_PLATFORM_DAY_USD: '1.540278' }), { refused: true, reason: 'daily_cap_reached' });
  assert.deepEqual(await platformSpendStatus(ctx.LEARN_DB, { USAGE_PLATFORM_DAY_USD: '1.540279' }), { refused: false });
});

test('exactly-once: concurrent and replayed settlements of the refused job, and later polls, change neither ledger, the totals, the renders nor the consumed counter', async t => {
  const ctx = await run(t, observedView());
  const before = await ledger(ctx).balance.then(b => b), snapshot = () => JSON.stringify({ ...ledger(ctx), balance: undefined });
  const first = snapshot();
  await Promise.all([ctx.actor.settleMotion(ctx.job, observedView()), ctx.actor.settleMotion(ctx.job, observedView({ failure_code: 'job_timeout' })), ctx.actor.alarm(), ctx.actor.alarm()]);
  await ctx.actor.settleMotion(ctx.job, observedView({ spend: { cost_usd: 9, bound_usd: 9, calls: 9 } }));
  for (let i = 0; i < 5; i++) { await ctx.actor.alarm(); await sleep(2); }
  assert.equal(snapshot(), first, 'the first settlement wins; a replay (even with different numbers) changes nothing');
  assert.deepEqual(await ledger(ctx).balance.then(b => [b.used, b.reserved]), [before.used, before.reserved]);
  const [[, stored]] = [...await ctx.actor.state.storage.list({ prefix: 'job:' })];
  assert.deepEqual([stored.consumedMicros, stored.providerCost.length], [1_540_278, 1], 'the video ceiling counts the cost once');
});

test('unknown provider cost on a refused job: the platform keeps the WHOLE reservation (never zero) while the learner is still charged nothing', async t => {
  // One call's usage was unreadable: the orchestrator reports cost null and the bound it holds (all that is known).
  const ctx = await run(t, observedView({}, { cost_usd: null, bound_usd: 1.540278 }));
  const l = ledger(ctx);
  assert.deepEqual(l.operations, [['failed', 5, 8.96, 'motion_job_ceiling_insufficient']], 'cost_usd stays at the admitted reservation (COALESCE keeps it): conservative, not 0');
  assert.deepEqual(l.attempts, [[8_960_000, 'settled', 0, 'failed']], 'a limit of ours charges zero credits even when its provider cost is unknown (the attempt row is the LEARNER charge, true)');
  assert.deepEqual(await l.balance.then(b => [b.used, b.reserved]), [0, 0]);
  assert.equal(l.platformUsd, 8.96, 'the platform total holds the reservation until someone reconciles the real cost');
  assert.deepEqual([ctx.job.providerCost[0].micros, ctx.job.consumedMicros], [null, 1_540_278], 'the video ceiling counts the bound it knows');
  assert.deepEqual(await platformSpendStatus(ctx.LEARN_DB, { USAGE_PLATFORM_DAY_USD: '8.96' }), { refused: true, reason: 'daily_cap_reached' });
});
