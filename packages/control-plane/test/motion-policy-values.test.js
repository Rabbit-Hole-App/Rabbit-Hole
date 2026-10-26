// The HELD Motion policy VALUES (docs/features/motion-admission-policy.md): this file is part of the single values commit and pins exactly what the owner
// approves: platform stop US$5.00 per job, learner maximum 500 credits, reservation unchanged at 896 credits, the route budget check on, and NOTHING of the
// public flip. Pure and offline: nothing is called or paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer, periodOf, usageTotals } from '../src/learn-usage.js';
import { MOTION_QUOTE_STALE, motionGenerationCheck, motionMaxCredits } from '../src/motion-settings.js';
import { signProposal, validateProposalInput } from '../src/generation-proposal.js';
import { PRODUCTION_POLICY } from '../../learn-render/motion/orchestrator.mjs';
import { modelsFor, routeBudget } from '../../learn-render/motion/spend-bound.mjs';
import { memoryBucket } from './live-storage-spy.js';
import { READY } from './motion-ready-env.js';
import { moneyLeaks } from './no-money.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const noComments = (text, mark) => text.split(/\r?\n/).filter(l => !l.trim().startsWith(mark)).join('\n');
const WORKER = noComments(read('../../web/wrangler.rabbit-hole-prod.jsonc'), '//'), ORCH = noComments(read('../../learn-render/motion/service/fly.orchestrator.toml'), '#');
const PROD = JSON.parse(WORKER).vars;
const micros = usd => Math.round(Number(usd) * 1e6);
const orchestrator = name => ORCH.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];

test('the approved numbers, and only these: stop 5.00, maximum 500 credits, reservation 896 credits, route budget check on, route budget below the stop', () => {
  assert.deepEqual([orchestrator('MOTION_JOB_CEILING_USD'), orchestrator('MOTION_ROUTE_BUDGET_CHECK'), PROD.MOTION_MAX_CHARGE_USD, PROD.MOTION_JOB_RESERVATION_USD, PROD.MOTION_ESTIMATE_USD], ['5.00', '1', '5.00', '8.96', '1.00']);
  const budget = routeBudget(PRODUCTION_POLICY, modelsFor({})).micros;
  assert.ok(budget <= micros(orchestrator('MOTION_JOB_CEILING_USD')) && micros(orchestrator('MOTION_JOB_CEILING_USD')) <= micros(PROD.MOTION_MAX_CHARGE_USD) && micros(PROD.MOTION_MAX_CHARGE_USD) <= micros(PROD.MOTION_JOB_RESERVATION_USD), 'budget <= stop <= maximum <= reservation');
  assert.equal(motionMaxCredits(PROD), 500);
  // The orchestrator's other limits are as deployed.
  assert.deepEqual([orchestrator('MOTION_MAX_CALLS'), orchestrator('MOTION_JOB_TIMEOUT_S')], ['9', '3300']);
});

test('R2a (owner-only activation) is NOT the public flip: public Motion stays paused; the measured renderer configuration is active in BOTH files with the same id', () => {
  assert.equal(PROD.MOTION_GENERATION_PAUSED, '1', 'R2b (the public flip, a later HELD commit) is the only thing that sets "0"');
  assert.equal(PROD.MOTION_RENDERER_CONFIG, '03f2a1efc08e-1.5cpu-3gib-420s', 'the Worker activates the measured policy (R2a)');
  assert.equal(orchestrator('MOTION_RENDERER_CONFIG'), PROD.MOTION_RENDERER_CONFIG, 'the orchestrator carries the same id');
  assert.match(PROD.MOTION_ACCEPTANCE_EMAILS, /^user@dda2350771a4066e3080c605ba092e0a\.rabbithole\.invalid/, 'the owner-only list is unchanged');
});

test('a card confirmed at the old maximum (350 credits) is a STALE quote under the policy (500), answered with the updated quote before any hold; a card made at 500 is accepted', async () => {
  const base = { ...READY, ...PROD, MOTION_RENDERER_CONFIG: READY.MOTION_RENDERER_CONFIG, MOTION_GENERATION_PAUSED: '0', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) }; // R2-shaped, only to exercise the check
  const input = { request: '/motion explain the water cycle', concept: 'Weather' };
  const water = { command: 'motion', title: 'Water cycle: evaporation to rain', description: 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.', settings: { duration_seconds: 10, audio: false } };
  const sign = env => signProposal(env, { ...validateProposalInput(water), input }, 'alice@example.test');
  const old = await sign({ ...base, MOTION_MAX_CHARGE_USD: '3.50' }), now = await sign(base);
  assert.deepEqual([old.input.binding.max_credits, now.input.binding.max_credits], [350, 500]);
  const stale = motionGenerationCheck(base, { request: input.request, proposal: old });
  assert.deepEqual([stale.code, stale.quote.max_credits, stale.quote.estimate_credits], [MOTION_QUOTE_STALE, 500, 100]);
  assert.match(stale.error, /can cost up to 500 credits\. Review it and press Generate again to confirm\./);
  assert.deepEqual(moneyLeaks({ code: stale.code, error: stale.error, quote: stale.quote }), []);
  assert.equal(motionGenerationCheck(base, { request: input.request, proposal: now }), null, 'the new card is not stale');
});

// ---- settlement under the policy: a job the guard stops at the 5.00 ceiling is charged ZERO, the provider cost is booked once -------------------------------
const sql = name => read(`../learn-migrations/${name}`);
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW), TOKEN = 'm'.repeat(48), JOB = '3c46c4d2c7414f141a3c33fd34cebb00', BOOT = 'a'.repeat(32);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of [sql('0016-usage-operations.sql'), sql('0022-usage-accounting.sql'), sql('0027-usage-grants.sql')]) sqlite.exec(file);
  const LEARN_DB = { prepare(text) { let args = []; return { bind(...v) { args = v; return this; }, first: async () => sqlite.prepare(text).get(...args) || null, all: async () => ({ results: sqlite.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }), now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }) }; },
  async batch(statements) { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, LEARN_DB };
}
function durable(id) {
  const data = new Map(); let lock = Promise.resolve();
  return { id, data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {}, deleteAlarm: async () => {}, delete: async k => data.delete(k) },
    blockConcurrencyWhile: fn => { const r = lock.then(fn); lock = r.catch(() => {}); return r; } };
}
const CALLS = [['motion_brief', 70_000], ['motion_storyboard', 250_000], ['motion_composition', 1_200_000], ['motion_review', 85_000], ['motion_review', 85_000], ['motion_storyboard', 250_000], ['motion_composition', 1_200_000], ['motion_review', 85_000]];
const TOTAL = CALLS.reduce((s, [, m]) => s + m, 0); // 3.225 USD: the revision route stopped at its second review pair, at the new 5.00 ceiling
const view = () => ({ job_id: JOB, status: 'failed', stage: 'job:reviewing', created_at: new Date(NOW * 1000).toISOString(), finished_at: new Date(NOW * 1000).toISOString(),
  spend: { hold_usd: 8.96, cost_usd: TOTAL / 1e6, bound_usd: TOTAL / 1e6, ceiling_usd: 5, calls: CALLS.length, in_flight: 0, refused: 'the guard',
    provider_calls: CALLS.map(([kind, m]) => ({ stage: 'x', kind, model: 'claude-opus-5-5', state: 'done', bound_usd: 1, cost_usd: m / 1e6, usage: { input_tokens: 100, output_tokens: 10 } })) },
  renders: 2, render_states: ['ready', 'ready'], artifacts_rev: 1, failure_reason: 'stopped before spending more: the guard', clarification: null, cause: 'limit', failure_code: 'job_ceiling_insufficient',
  failure: { code: 'job_ceiling_insufficient', stage: 'job:reviewing', kind: 'motion_review', reason: 'the guard', need_usd: 0.640495, left_usd: 0.396582, ahead_usd: 0, ceiling_usd: 5 } });

test('settlement under the 5.00 policy: a job stopped by our ceiling after 3.225 of model spend books that cost ONCE on the platform and charges the learner ZERO credits; replays change nothing', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const state = { posts: 0 }, original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host !== 'orchestrator.test') return original(url, init);
    if (u.pathname === '/health') return Response.json({ ok: true, boot: BOOT });
    if (u.pathname === '/jobs' && init.method === 'POST') { state.posts++; return Response.json({ job_id: JOB, status: 'running' }, { status: 202 }); }
    if (u.pathname === `/jobs/${JOB}`) return Response.json(view());
    if (u.pathname === `/jobs/${JOB}/artifacts`) return Response.json({ job_id: JOB, rev: 1, status: 'failed', cause: 'limit', failure_code: 'job_ceiling_insufficient', findings: [], blocking: [], checkpoint: null, seal: null, actions: [], hold_usd: { fix: 7.9486, render: 0 }, next_need_usd: null, frames: [] });
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  t.after(() => { globalThis.fetch = original; });
  const env = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_MEDIA: memoryBucket(), MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN,
    MOTION_JOB_RESERVATION_USD: PROD.MOTION_JOB_RESERVATION_USD, MOTION_MAX_CHARGE_USD: PROD.MOTION_MAX_CHARGE_USD, ...READY };
  const actor = new LearnVideos(durable('video-a'), env);
  const ask = forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: { op: 'motion_request', request: '/motion 15s explain photosynthesis', location: { concept: 'Photosynthesis' } }, lessonId: 'canvas', page: 'canvas', confirmed: true }) }), { userId: 'u-alice', email: 'alice@example.test' });
  await actor.fetch(ask);
  for (let i = 0; i < 300; i++) { await actor.alarm(); if ((await actor.list()).videos[0]?.status === 'failed') break; await sleep(5); }
  const snap = () => JSON.stringify({
    ops: sqlite.prepare('SELECT status, calls, cost_usd, error FROM usage_operations').all().map(o => ({ ...o })),
    attempts: sqlite.prepare("SELECT reserved_micros, cost_state, cost_micros, status FROM usage_attempts WHERE attempt_id LIKE 'motion-%'").all().map(a => ({ ...a })) });
  const first = JSON.parse(snap());
  assert.deepEqual(first.ops, [{ status: 'failed', calls: CALLS.length, cost_usd: TOTAL / 1e6, error: 'motion_job_ceiling_insufficient' }]);
  assert.deepEqual(first.attempts, [{ reserved_micros: 8_960_000, cost_state: 'settled', cost_micros: 0, status: 'failed' }], 'the learner pays nothing for our limit, at 500 credits maximum as at 350');
  assert.deepEqual(await usageTotals(LEARN_DB, 'u-alice', PERIOD).then(b => [b.used, b.reserved]), [0, 0]);
  for (let i = 0; i < 5; i++) { await actor.alarm(); await sleep(2); }
  assert.equal(snap(), JSON.stringify(first), 'later polls change nothing');
  assert.equal(state.posts, 1);
});
