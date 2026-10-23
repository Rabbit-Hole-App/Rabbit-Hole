// Motion activation, end to end in one process (owner items 1, 2, 3, 5, 6 and 7, 2026-10-21): the real LearnVideos
// Durable Object and its D1 ledger (admitSpend/settleSpend) talk HTTP to the real Motion orchestrator, whose pipeline is a
// stub that makes model calls through the orchestrator's guarded call (a mocked provider with usage) and asks a stub
// renderer for renders. Nothing is paid and no generated code runs. Every reservation, refusal and settlement below is the
// real ledger's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LearnVideos, MOTION_PAUSED, withCanvasRepository, withLessonApp } from '../src/learn-video.js';
import { forwardUsagePayer, periodOf, usageTotals } from '../src/learn-usage.js';
import { motionOrchestrator } from '../../learn-render/motion/orchestrator.mjs';
import { memoryBucket } from './live-storage-spy.js';
import { reviseSettings, signProposal } from '../src/generation-proposal.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);
const TOKEN = 'm'.repeat(48);
const MODEL = 'claude-opus-5-5';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 500; i++) { if (await fn()) return; await sleep(5); } assert.fail(`timed out waiting for ${what}`); };
const LINUX = { ok: true, busy: false, sandbox: 'linux' };

function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of [sql('0016-usage-operations.sql'), sql('0022-usage-accounting.sql')]) sqlite.exec(file);
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        first: async () => sqlite.prepare(text).get(...args) || null,
        all: async () => ({ results: sqlite.prepare(text).all(...args) }),
        run: async () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
        now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(r => ({ ...r }));
// A month already partly used by the learner (settled spend), straight into the accounting tables.
function spent(sqlite, userId, micros) {
  const id = `seed-${crypto.randomUUID()}`;
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, ?, 'user', 'signed_in', 'ask', 'would_charge', ?, 'completed', ?)").run(id, userId, PERIOD, NOW);
  sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES (?, ?, 'generation', ?, ?, 'settled', 'settled', ?)").run(`${id}-a`, id, micros, micros, NOW);
}
function durable(id, data = new Map()) {
  let lock = Promise.resolve();
  return { id, data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}

// The mocked model provider: each call answers with the next scripted usage (output tokens at Opus 5.5's $20/M). A held
// call waits for release(). The stub renderer counts renders; its health is the scenario's.
function world(t, { health = { ok: true, busy: false, sandbox: 'linux' } } = {}) {
  const model = { calls: [], held: null };
  const renders = [];
  const call = async (env, body) => {
    model.calls.push(body.max_tokens);
    if (body.hold) await new Promise(r => { model.held = r; });
    return Response.json({ model: MODEL, usage: { input_tokens: 0, output_tokens: body.out } });
  };
  const reported = new Map();
  const service = { health: async () => (typeof health === 'function' ? health() : health instanceof Error ? Promise.reject(health) : health),
    submit: async () => { renders.push(1); return Response.json({ render_id: `r${renders.length}` }, { status: 202 }); },
    status: async id => ({ render_id: id, status: reported.get(id) || 'ready' }) };
  // The stub pipeline: the stages' calls (each {max_tokens, out}), then renders, then a final.mp4. A refused call (the
  // hold) fails the stage, as the real stages do; Stop ends it as cancelled.
  const pipeline = steps => async ({ call: guarded, service: svc, dir, signal, onStage }) => {
    try {
      for (const step of steps) {
        onStage(step.stage || 'authoring');
        if (signal.aborted) throw Object.assign(new Error('stopped'), { name: 'MotionCancelled' });
        // A render the renderer reports finished (or the status the step names), as render-job polls it.
        if (step.render) { const { render_id } = await (await svc.submit({})).json(); reported.set(render_id, step.renderStatus || 'ready'); await svc.status(render_id); continue; }
        if (step.fail) return { status: 'failed', failure_reason: `${step.stage}: ${step.fail}` };
        const r = await guarded({}, { max_tokens: step.max_tokens, messages: [{ role: 'user', content: step.stage || 'x' }], out: step.out, hold: step.hold }, MODEL);
        if (!r.ok) return { status: 'failed', failure_reason: `${step.stage}: model_error` };
        await r.text();
      }
    } catch (error) { if (error.name === 'MotionCancelled') return { status: 'cancelled', failure_reason: 'stopped during authoring' }; throw error; }
    mkdirSync(join(dir, 'final'), { recursive: true });
    writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
    return { status: 'ready', brief: { title: 'Softmax' }, block: { motion: { duration_seconds: 15, source_refs: [] } }, render: { render_id: 'a'.repeat(32) }, job: { repair_count: 0 } };
  };
  let server = null, script = [];
  const original = globalThis.fetch;
  const orchestrator = { posts: 0, cancels: 0 };
  // (Re)starts the orchestrator process: a restart is a new process with an empty memory and a later boot time.
  orchestrator.start = async ({ later = 0 } = {}) => {
    if (server) { server.close(); orchestrator.o.close(); }
    const outDir = mkdtempSync(join(tmpdir(), 'motion-e2e-'));
    orchestrator.o = motionOrchestrator({ token: TOKEN, service, call, outDir, run: args => pipeline(script)(args), now: () => Date.now() + later });
    server = createServer(orchestrator.o.handle);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    orchestrator.base = `http://127.0.0.1:${server.address().port}`;
  };
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.host !== 'orchestrator.test') return original(url, init);
    if (u.pathname === '/jobs') orchestrator.posts++;
    if (u.pathname.endsWith('/cancel')) orchestrator.cancels++;
    return original(orchestrator.base + u.pathname, init);
  };
  t.after(() => { globalThis.fetch = original; server?.close(); orchestrator.o?.close(); });
  return { model, renders, orchestrator, script: steps => { script = steps; } };
}

const FIRST_PASS = [{ stage: 'directing', max_tokens: 16000, out: 5000 }, { stage: 'storyboarding', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 30000 }, { render: true }, { render: true }];
const motionOp = { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } };
const env0 = (LEARN_DB, allowanceUsd = '50', extra = {}) => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: allowanceUsd, LEARN_MEDIA: memoryBucket(),
  MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_JOB_RESERVATION_USD: '2', ...extra });
const ask = (extra = {}, op = motionOp) => forwardUsagePayer(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST',
  body: JSON.stringify({ operation: op, lessonId: 'canvas', page: 'canvas', confirmed: true, ...extra }) }), { userId: 'u-alice', email: 'alice@example.test' });
const stopping = placementId => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ action: 'cancel', id: placementId }) });
// The learner's month: settled spend used, outstanding holds reserved (the same sums admission reads).
const balance = LEARN_DB => usageTotals(LEARN_DB, 'u-alice', PERIOD);
const motionAttempts = sqlite => rows(sqlite, 'usage_attempts').filter(a => a.attempt_id.startsWith('motion-')).map(a => [a.reserved_micros, a.cost_state, a.cost_micros, a.status]);
const renderRows = sqlite => rows(sqlite, 'usage_actions').filter(a => a.feature === 'render').map(a => [a.user_id, a.charge_class]);
// Every action a Motion job opened, as [feature, status, result, closed]: none may be left running once the job has ended
// (integrator, production job 2026-10-21: its video and render actions read running after settlement).
const actions = sqlite => rows(sqlite, 'usage_actions').filter(a => !a.action_id.startsWith('seed-')).map(a => [a.feature, a.status, a.result, a.ended_at != null]);
async function settle(actor, done) { for (let i = 0; i < 300; i++) { await actor.alarm(); if (await done()) return; await sleep(5); } assert.fail('the job did not reach the expected state'); }
const video = async actor => (await actor.list()).videos[0];

test('the first end-to-end stub run: hold admitted before any call, the job runs, the real cost settles, the rest is released, renders recorded apart', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'reserved', null, 'running']], 'the $2 hold is reserved before the job starts');
  assert.deepEqual((await actor.list()).videos[0].hold, { usd: 2, state: 'reserved' }, 'the card shows the reservation while it runs');
  assert.equal((await balance(LEARN_DB)).reserved, 2_000_000);
  await settle(actor, async () => (await video(actor)).status === 'ready');
  const v = await video(actor);
  assert.deepEqual([v.status, v.provider, v.motion.title], ['ready', 'motion', 'Softmax']);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']], 'settled at the real $0.80');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [800_000, 0], 'the unused $1.20 is released');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.category, o.status, o.cost_usd, o.calls]), [['motion', 'settled', 0.8, 3]]);
  assert.deepEqual([w.model.calls.length, w.renders.length], [3, 2]);
  assert.deepEqual(renderRows(sqlite), [['u-alice', 'free'], ['u-alice', 'free']], 'each render is platform-funded, attributed, never in the allowance');
  assert.deepEqual(actions(sqlite), [['video', 'completed', 'full', true], ['render', 'completed', 'full', true], ['render', 'completed', 'full', true]], 'the job and its renders are closed exactly once');
  const list = await actor.list();
  assert.equal(list.motionHoldUsd, 2, 'the amount the server reserves, for the confirmation');
  assert.deepEqual(list.videos[0].hold, { usd: 2, state: 'released' });
  // Duplicate completion events: another alarm and a second settlement of the same view close nothing twice.
  const [[, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  await actor.alarm();
  await actor.settleMotion(job, { status: 'ready', spend: { cost_usd: 0.8, bound_usd: 0.8, calls: 3, in_flight: 0 }, renders: 2, render_states: ['ready', 'ready'] });
  assert.deepEqual(actions(sqlite).length, 3, 'no second action');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']], 'settled once');
  await actor.fetch(ask({ page: 'other' }));
  await actor.alarm();
  assert.equal(w.orchestrator.posts, 1, 'a ready video is reused: no second job, admission or render');
  assert.equal(motionAttempts(sqlite).length, 1);
});

test('exhausted allowance: refused before anything starts, zero orchestrator, model and renderer calls, nothing held', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  spent(sqlite, 'u-alice', 49_000_000); // $1 left of $50: less than the $2 hold
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  const v = (await (await actor.fetch(ask())).json()).videos[0];
  assert.deepEqual([v.status, v.retryable], ['failed', true]);
  assert.match(v.error, /needs more than your remaining AI allowance\. It resets on .+\. Nothing was started\./);
  await actor.alarm();
  assert.deepEqual([w.orchestrator.posts, w.model.calls.length, w.renders.length, motionAttempts(sqlite).length], [0, 0, 0, 0]);
  assert.equal((await balance(LEARN_DB)).reserved, 0);
  assert.deepEqual(actions(sqlite).filter(a => a[1] === 'running'), [], 'a refused admission leaves no running action');
});

test('duplicate submits and a worker restart mid-job: one reservation, one orchestrator job, settled once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }, ...FIRST_PASS.slice(1)]);
  const data = new Map();
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a', data), env);
  await Promise.all([actor.fetch(ask()), actor.fetch(ask()), actor.fetch(ask({ page: 'elsewhere' }))]);
  assert.equal(w.orchestrator.posts, 1);
  assert.equal(motionAttempts(sqlite).length, 1, 'one hold for three Generates');
  // The Durable Object restarts: a new instance over the same storage carries on with the same job and hold.
  const restarted = new LearnVideos(durable('video-a', data), env);
  for (let i = 0; i < 50 && !w.model.held; i++) await sleep(5);
  await restarted.alarm();
  w.model.held();
  await settle(restarted, async () => (await video(restarted)).status === 'ready');
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length, w.model.calls.length], [1, 1, 3]);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']]);
});

// Owner review MOT-07 (message 27) replaces the resend of owner item 2: the lost answer is reconciled by closing the key.
test('an unconfirmed start is never resent: closing its key answers the job it started, never a second', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  // The POST reaches the orchestrator, but its answer is lost on the way back.
  const through = globalThis.fetch;
  let dropped = false;
  globalThis.fetch = async (url, init) => { const r = await through(url, init); if (!dropped && new URL(url).pathname === '/jobs') { dropped = true; throw new Error('socket hang up'); } return r; };
  await actor.fetch(ask());
  globalThis.fetch = through;
  assert.equal((await video(actor)).status, 'generating');
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, motionAttempts(sqlite).length, w.model.calls.length], [1, 1, 1, 3]);
});

test('Stop: the call in flight is abandoned, its real cost is settled once it lands, the rest is released, nothing is stored', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 30000, hold: true }, { render: true }]);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  const { placementId } = await (await actor.fetch(ask())).json();
  for (let i = 0; i < 100 && !w.model.held; i++) await sleep(5);
  const v = (await (await actor.fetch(stopping(placementId))).json()).videos[0];
  assert.deepEqual([v.status, v.error, v.retryable], ['failed', 'Stopped.', true]);
  await actor.alarm();
  assert.deepEqual(motionAttempts(sqlite)[0].slice(1, 2), ['reserved'], 'held while the abandoned call is in flight');
  w.model.held();
  await settle(actor, async () => motionAttempts(sqlite)[0][1] !== 'reserved');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 700_000, 'failed']], 'both calls, $0.10 + $0.60, are what the learner pays');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [700_000, 0]);
  assert.equal(w.renders.length, 0);
  assert.deepEqual(actions(sqlite), [['video', 'cancelled', 'none', true]], 'a stopped job is cancelled, closed once its cost is settled');
  assert.equal(env.LEARN_MEDIA.objects.size, 0);
});

test('an orchestrator restart mid-job: the job fails clearly, its hold is kept as unknown cost, and an explicit retry cannot exceed the ceiling', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }]);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  for (let i = 0; i < 100 && !w.model.held; i++) await sleep(5);
  await w.orchestrator.start({ later: 2000 }); // a deploy or crash: the new process knows nothing of the job
  await settle(actor, async () => (await video(actor)).status === 'failed');
  const v = await video(actor);
  assert.match(v.error, /The Motion service restarted while this video was being made/);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'unknown', null, 'failed']], 'a call was in flight: its cost is unknown, so the hold stays');
  assert.deepEqual(actions(sqlite), [['video', 'interrupted', null, true]], 'cost unknown: interrupted, never completed because the hold settled');
  assert.deepEqual(v.hold, { usd: 2, state: 'pending' }, 'the card says reconciliation is pending');
  // Retry: the whole $2 ceiling counts as used by the interrupted attempt, so nothing more can start for this video.
  const retried = (await (await actor.fetch(ask({ retry: true }))).json()).videos[0];
  assert.match(retried.error, /used its \$2\.00 AI spending limit across its attempts/);
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length], [1, 1], 'no second admission or job');
});

test('an explicit retry after a failure spends from the same ceiling: the second hold is what the first attempt left', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 25000 }, { stage: 'storyboarding', fail: 'storyboard_invalid' }]); // $0.50, then a failure
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  await settle(actor, async () => (await video(actor)).status === 'failed');
  assert.match((await video(actor)).error, /storyboarding: storyboard_invalid/);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 500_000, 'failed']], '$0.50 paid, $1.50 released');
  w.script(FIRST_PASS);
  await actor.fetch(ask({ retry: true }));
  const second = [...w.orchestrator.o.jobs.values()].at(-1);
  assert.equal(second.grant_micros, 1_500_000, 'the retry may spend only what the ceiling has left');
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 500_000, 'failed'], [1_500_000, 'settled', 800_000, 'settled']]);
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [1_300_000, 0], 'the job cost $1.30 in all, inside its $2 ceiling');
});

test('renderer unavailable or unsandboxed: refused, never run in process; the hold is released in full', async t => {
  for (const health of [new Error('ECONNREFUSED'), { ok: true, busy: false, sandbox: 'none' }]) {
    const { sqlite, LEARN_DB } = d1(t);
    const w = world(t, { health }); await w.orchestrator.start(); w.script(FIRST_PASS);
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
    const v = (await (await actor.fetch(ask())).json()).videos[0];
    assert.deepEqual([v.status, v.retryable], ['failed', true]);
    assert.match(v.error, /renderer .*nothing was started/i);
    assert.deepEqual([w.model.calls.length, w.renders.length], [0, 0]);
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'cancelled']], 'released in full');
    assert.equal((await balance(LEARN_DB)).reserved, 0);
    assert.deepEqual(actions(sqlite), [['video', 'cancelled', 'none', true]], 'nothing started: the action is cancelled');
  }
});

test('a repair whose worst case exceeds what is left of the hold is refused before it starts; the real cost settles', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  // $0.10 + $0.10 + an Author first pass of $0.93 leaves $0.87; the Author repair's worst case is about $1.28.
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000 }, { stage: 'storyboarding', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 46500 }, { stage: 'author_repair', max_tokens: 64000, out: 1000 }, { render: true }]);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  await settle(actor, async () => (await video(actor)).status === 'failed');
  assert.match((await video(actor)).error, /stopped before spending more: the next step \(author_repair\) could cost up to \$1\.2\d, more than the \$0\.87 left of this job's \$2\.00 hold/);
  assert.deepEqual([w.model.calls, w.renders.length], [[16000, 16000, 64000], 0], 'the repair was never sent');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 1_130_000, 'failed']]);
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [1_130_000, 0], '$0.87 released');
  assert.deepEqual(actions(sqlite), [['video', 'failed', 'none', true]]);
});

test('no hold configured, or no orchestrator: nothing is admitted or started', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  for (const extra of [{ MOTION_JOB_RESERVATION_USD: undefined }, { MOTION_JOB_RESERVATION_USD: '0' }, { MOTION_ORCHESTRATOR_URL: undefined }]) {
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB, '50', extra));
    const v = (await (await actor.fetch(ask())).json()).videos[0];
    assert.deepEqual([v.status, v.retryable], ['failed', true]);
    assert.match(v.error, /not available .*Nothing was started\./);
  }
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length], [0, 0]);
});

// Item 7 (owner message 7, mocked): four unrelated topics, each with and without its card selected, end to end. The
// pipeline is the real runMotionRequest, so the request is resolved and grounded by the real resolver (motion-grounding);
// the paid stages are doubles that make their calls through the orchestrator's hold and ask the stub renderer for one
// render. The stored video says what it was grounded on: the card, or explicitly nothing, never a repository it was not given.
test('four topics, with and without a selected card, and the nanoGPT course canvas: resolved, held, settled, and the card says what it was grounded on', async t => {
  const { runMotionRequest } = await import('../../learn-render/motion/pipeline.mjs');
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t);
  const brief = (grounding, turn) => ({ id: 'motion-brief', title: grounding.resolved_target?.label || turn.raw_user_message, prompt_spec_version: 'test', duration: { seconds: 15 }, teaching_mode: 'intuition_first',
    source_refs: grounding.source_refs, claim_registry: [], ...(grounding.grounding ? { grounding: grounding.grounding } : {}) });
  const stages = {
    director: async ({ grounding, turn, call }) => { const r = await call({}, { max_tokens: 16000, messages: [{ role: 'user', content: 'director' }], out: 5000 }, MODEL); await r.text(); return { status: 'brief', brief: brief(grounding, turn), calls: [] }; },
    storyboarder: async ({ call }) => { const r = await call({}, { max_tokens: 16000, messages: [{ role: 'user', content: 'storyboard' }], out: 5000 }, MODEL); await r.text(); return { status: 'storyboard', storyboard: { beats: [] }, calls: [] }; },
    author: async ({ call }) => { const r = await call({}, { max_tokens: 64000, messages: [{ role: 'user', content: 'author' }], out: 30000 }, MODEL); await r.text(); return { status: 'composition', output: { source: 'generated' }, calls: [] }; },
    job: async ({ service, dir }) => {
      const { render_id } = await (await service.submit({})).json();
      await service.status(render_id);
      mkdirSync(join(dir, 'final'), { recursive: true });
      writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
      return { job: { id: 'job', status: 'ready', repairs: { storyboard: 0, author: 0 }, transport_retries: [], repair_count: 0 }, render: { render_id: 'a'.repeat(32) }, calls: [], passes: [] };
    },
  };
  await w.orchestrator.start();
  w.orchestrator.o.close();
  // The same orchestrator, its run the real pipeline with the stage doubles.
  const outDir = mkdtempSync(join(tmpdir(), 'motion-topics-'));
  const service = { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => { w.renders.push(1); return Response.json({ render_id: `t${w.renders.length}` }, { status: 202 }); }, status: async id => ({ render_id: id, status: 'ready' }) };
  const call = async (env, body) => { w.model.calls.push(body.max_tokens); return Response.json({ model: MODEL, usage: { input_tokens: 0, output_tokens: body.out } }); };
  const o = motionOrchestrator({ token: TOKEN, service, call, outDir, run: args => runMotionRequest({ ...args, stages }) });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); o.close(); });
  w.orchestrator.base = `http://127.0.0.1:${server.address().port}`;
  const card = (cardId, title, text) => ({ selection: { cardId, kind: 'Explanation', title, text } });
  const TOPICS = [
    ['nanoGPT', '/motion 15s explain nanoGPT', card('c-nano', 'What nanoGPT does', 'nanoGPT is a small GPT that predicts the next token from the tokens before it.')],
    ['photosynthesis', '/motion 20s explain photosynthesis', card('c-photo', 'Photosynthesis', 'Plants use light energy to turn carbon dioxide and water into glucose and oxygen.')],
    ['binary search', '/motion explain binary search step by step', card('c-bs', 'Binary search', 'Binary search halves a sorted range each step by comparing the target with the middle element.')],
    ['gradient descent', '/motion 10s explain gradient descent intuitively', card('c-gd', 'Gradient descent', 'Gradient descent takes repeated steps against the gradient of the loss to reduce it.')],
  ];
  const results = [];
  // The nanoGPT course canvas with no card selected: grounded on the pinned repository the worker says the canvas has.
  {
    const actor = new LearnVideos(durable('video-course'), env0(LEARN_DB));
    await actor.fetch(withCanvasRepository(ask({}, { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } }), { repo: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291' }));
    await settle(actor, async () => ['ready', 'failed'].includes((await video(actor)).status));
    const v = await video(actor);
    assert.equal(v.status, 'ready', v.error);
    assert.ok(v.motion.source_refs.length > 0 && v.motion.source_refs.every(r => r.path === 'model.py' && r.commit === '3adf61e154c3fe3fca428ad6bc3818b27a3b8291'), JSON.stringify(v.motion.source_refs));
  }
  for (const [topic, request, selected] of TOPICS) {
    for (const context of [null, selected]) {
      const actor = new LearnVideos(durable(`video-${topic}-${!!context}`), env0(LEARN_DB));
      const op = { op: 'motion_request', request, location: { concept: 'Learning' }, ...(context ? { context } : {}) };
      await actor.fetch(ask({}, op));
      await settle(actor, async () => ['ready', 'failed'].includes((await video(actor)).status));
      const v = await video(actor);
      assert.equal(v.status, 'ready', `${topic} ${context ? 'with' : 'without'} its card: ${v.error}`);
      results.push([topic, !!context, v.motion.source_refs.map(r => r.kind === 'card' ? `card:${r.card_id}` : r.path), v.motion.grounding?.status ?? 'grounded']);
      assert.ok(!/model\.py|nanoGPT@/.test(JSON.stringify(v.motion)), `${topic}: no repository evidence it was not given`);
    }
  }
  assert.deepEqual(results, [
    ['nanoGPT', false, [], 'no_source_supplied'], ['nanoGPT', true, ['card:c-nano'], 'grounded'],
    ['photosynthesis', false, [], 'no_source_supplied'], ['photosynthesis', true, ['card:c-photo'], 'grounded'],
    ['binary search', false, [], 'no_source_supplied'], ['binary search', true, ['card:c-bs'], 'grounded'],
    ['gradient descent', false, [], 'no_source_supplied'], ['gradient descent', true, ['card:c-gd'], 'grounded'],
  ]);
  // Eight jobs: eight holds of $2, each settled at its real $0.80 with $1.20 released; eight platform-funded renders.
  assert.deepEqual(motionAttempts(sqlite), Array(9).fill([2_000_000, 'settled', 800_000, 'settled']));
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [7_200_000, 0]);
  assert.deepEqual([w.model.calls.length, w.renders.length, renderRows(sqlite).length], [27, 9, 9]);
});

// A render the renderer never reported finished (still rendering when the job ended) is interrupted, never completed; a failed one
// is failed. Only a render the renderer reported ready is written completed (owner message 25).
test('render actions follow what the renderer reported: ready completed, failed failed, unreported interrupted', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000 }, { render: true }, { render: true, renderStatus: 'failed' }, { render: true, renderStatus: 'rendering' }, { stage: 'storyboarding', fail: 'storyboard_invalid' }]);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  await settle(actor, async () => (await video(actor)).status === 'failed');
  assert.deepEqual(actions(sqlite), [['video', 'failed', 'none', true], ['render', 'completed', 'full', true], ['render', 'failed', 'none', true], ['render', 'interrupted', null, true]]);
});

// The owner's lifecycle review (message 27) and its acceptance list (message 28): MOT-06..09, against the real orchestrator.
test('MOT-06 a worker timeout while renderer health is awaited, then a worker restart: the alarm finds the same job by its key; one job, one reservation, one settlement', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  let healthy, asked = 0;
  const ready = new Promise(r => { healthy = r; });
  const w = world(t, { health: () => { asked++; return ready.then(() => LINUX); } });
  await w.orchestrator.start(); w.script(FIRST_PASS);
  const data = new Map(), env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a', data), env);
  // The worker gives up on its POST (its 20 s timeout) while the orchestrator is still asking the renderer for its health.
  const through = globalThis.fetch;
  let gaveUp = false;
  globalThis.fetch = async (url, init) => {
    if (gaveUp || new URL(url).pathname !== '/jobs') return through(url, init);
    gaveUp = true; through(url, init).catch(() => {});
    await until(() => asked === 1, 'the orchestrator admitting');
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  await actor.fetch(ask());
  globalThis.fetch = through;
  assert.equal((await video(actor)).status, 'generating', 'unconfirmed: never released');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'reserved', null, 'running']]);
  // The Durable Object restarts; its alarm reaches the orchestrator while that admission still waits.
  const restarted = new LearnVideos(durable('video-a', data), env);
  const polling = restarted.alarm();
  await Promise.race([polling, until(() => asked >= 2, 'a second admission')]);
  healthy(); await polling;
  await settle(restarted, async () => (await video(restarted)).status === 'ready');
  assert.deepEqual([w.orchestrator.o.jobs.size, w.model.calls.length, w.renders.length], [1, 3, 2], 'one job ran');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']], 'one reservation, settled once at its real cost');
  assert.equal(w.orchestrator.posts, 1, 'the submission was never resent');
  await restarted.alarm();
  assert.deepEqual(actions(sqlite), [['video', 'completed', 'full', true], ['render', 'completed', 'full', true], ['render', 'completed', 'full', true]], 'closed once');
});

test('MOT-06 two learners at once share the one orchestrator slot: one job starts, the other is a confirmed no-start and its hold is released', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  let healthy, asked = 0;
  const ready = new Promise(r => { healthy = r; });
  const w = world(t, { health: () => { asked++; return ready.then(() => LINUX); } });
  await w.orchestrator.start(); w.script(FIRST_PASS);
  const env = env0(LEARN_DB);
  const alice = new LearnVideos(durable('video-a'), env), bob = new LearnVideos(durable('video-b'), env);
  const first = alice.fetch(ask());
  await until(() => asked === 1, 'the first admission');
  const second = bob.fetch(ask());
  await Promise.race([second, until(() => asked === 2, 'a second admission')]);
  healthy();
  await Promise.all([first, second]);
  const b = await video(bob);
  assert.deepEqual([b.status, b.retryable], ['failed', true]);
  assert.match(b.error, /one Motion job at a time/);
  assert.equal(w.orchestrator.o.jobs.size, 1, 'the global capacity holds while health is awaited');
  await settle(alice, async () => (await video(alice)).status === 'ready');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled'], [2_000_000, 'settled', 0, 'cancelled']], 'the started job settles at its cost; the refused one is released in full');
});

test('MOT-07 acceptance followed by a 502, a 500 or a malformed success keeps the reservation and reconciles the original job; settled once at its real cost', async t => {
  const answers = [() => new Response('<html>502 Bad Gateway</html>', { status: 502 }), () => Response.json({ error: 'orchestrator_failure', detail: 'x' }, { status: 500 }),
    () => Response.json({ status: 'running' }, { status: 202 }), () => new Response('{"job_id": "', { status: 202 })];
  for (const answer of answers) {
    const { sqlite, LEARN_DB } = d1(t);
    const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
    const through = globalThis.fetch;
    globalThis.fetch = async (url, init) => { const r = await through(url, init); return new URL(url).pathname === '/jobs' ? answer() : r; };
    await actor.fetch(ask());
    globalThis.fetch = through;
    const v = await video(actor);
    assert.deepEqual([v.status, v.hold?.state], ['generating', 'reserved'], 'accepted remotely: never released as a no-start');
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'reserved', null, 'running']]);
    await settle(actor, async () => (await video(actor)).status === 'ready');
    assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, w.model.calls.length], [1, 1, 3], 'the original job, never a second');
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']]);
  }
});

test('MOT-07 a lost submission: a key the live orchestrator run never saw is a confirmed no-start and released; after a restart the hold stays and nothing starts again', async t => {
  {
    const { sqlite, LEARN_DB } = d1(t);
    const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
    const through = globalThis.fetch;
    globalThis.fetch = async (url, init) => { if (new URL(url).pathname === '/jobs') throw new TypeError('fetch failed'); return through(url, init); };
    await actor.fetch(ask());
    globalThis.fetch = through;
    assert.equal((await video(actor)).status, 'generating', 'not yet known: held');
    await settle(actor, async () => (await video(actor)).status === 'failed');
    const v = await video(actor);
    assert.deepEqual([v.retryable, v.hold?.state], [true, 'released']);
    assert.match(v.error, /did not start this video\. Nothing was spent/);
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'cancelled']]);
    assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, w.model.calls.length], [0, 0, 0], 'never resent');
  }
  {
    const { sqlite, LEARN_DB } = d1(t);
    const w = world(t); await w.orchestrator.start();
    w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }, ...FIRST_PASS.slice(1)]);
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
    const through = globalThis.fetch;
    globalThis.fetch = async (url, init) => { const r = await through(url, init); if (new URL(url).pathname === '/jobs') throw new Error('socket hang up'); return r; };
    await actor.fetch(ask());
    globalThis.fetch = through;
    await until(() => w.model.held, 'the first call in flight');
    await w.orchestrator.start({ later: 2000 }); // a deploy or crash before the worker learned the job id
    await settle(actor, async () => (await video(actor)).status === 'failed');
    const v = await video(actor);
    assert.match(v.error, /lost this video before it confirmed the start\. Its spending stays held/);
    assert.deepEqual([v.retryable, v.hold?.state], [false, 'pending']);
    assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'unknown', null, 'failed']], 'its cost is unknown: the reservation stays');
    assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, w.model.calls.length], [1, 0, 1], 'nothing was resent or started again');
  }
});

test('MOT-08 cold start: the first Generate after the orchestrator booted from idle starts exactly once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t);
  await w.orchestrator.start({ later: 5000 }); // the run booted for this request: its boot second is after the worker's clock
  w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  assert.equal((await video(actor)).status, 'generating', 'started, not refused as a replay');
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size], [1, 1]);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']]);
});

test('MOT-09 Stop before the start was confirmed, then a worker restart: never resubmitted; the job recovered by its key is cancelled, no later paid stage runs, the in-flight cost settles once', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }, { stage: 'storyboarding', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 30000 }, { render: true }]);
  const data = new Map(), env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a', data), env);
  const through = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const r = await through(url, init); if (new URL(url).pathname === '/jobs') throw new Error('socket hang up'); return r; };
  const { placementId } = await (await actor.fetch(ask())).json();
  globalThis.fetch = through;
  await until(() => w.model.held, 'the first call in flight');
  const v = (await (await actor.fetch(stopping(placementId))).json()).videos[0];
  assert.deepEqual([v.status, v.error, v.retryable], ['failed', 'Stopped.', true]);
  const restarted = new LearnVideos(durable('video-a', data), env);
  await restarted.alarm();
  const recovered = [...w.orchestrator.o.jobs.values()][0];
  assert.ok(recovered.controller.signal.aborted, 'the job recovered by its key was told to stop');
  w.model.held(); // the call in flight lands and is priced
  await settle(restarted, async () => motionAttempts(sqlite)[0][1] !== 'reserved');
  assert.deepEqual([w.orchestrator.posts, w.model.calls.length, w.renders.length], [1, 1, 0], 'never resubmitted; no later paid stage or render');
  assert.equal(recovered.status, 'cancelled');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 100_000, 'failed']], 'only the $0.10 call in flight is paid');
  await restarted.alarm();
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 100_000, 'failed']], 'settled once');
  assert.deepEqual(actions(sqlite), [['video', 'cancelled', 'none', true]]);
  assert.equal(env.LEARN_MEDIA.objects.size, 0);
});

// Owner message 28: new Motion generation paused on the server (MOTION_GENERATION_PAUSED "1") until MOT-06/07 are fixed.
test('paused: Generate, Retry and every other start are refused before admission: no hold, no orchestrator call', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, fail: 'storyboard_invalid' }]);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  await actor.fetch(ask());
  await settle(actor, async () => (await video(actor)).status === 'failed');
  const before = [w.orchestrator.posts, motionAttempts(sqlite).length, w.model.calls.length];
  env.MOTION_GENERATION_PAUSED = '1';
  // A new Generate (composer, inline Motion and Ctrl+K post the same start) and the failed card's Retry.
  for (const request of [ask({}, { ...motionOp, request: '/motion 10s explain layer norm' }), ask({ retry: true })]) {
    const response = await actor.fetch(request);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Motion generation is temporarily unavailable while we fix a reliability issue.', code: 'motion_paused' });
  }
  assert.equal(MOTION_PAUSED, 'Motion generation is temporarily unavailable while we fix a reliability issue.');
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length, w.model.calls.length], before, 'no admission, hold or orchestrator call');
  const list = await actor.list();
  assert.equal(list.motionPaused, true, 'the confirmation can say so');
  assert.equal(list.motionHoldUsd, undefined, 'no reservation is offered while paused');
  // Unpaused ("0" or unset) behaves as before.
  env.MOTION_GENERATION_PAUSED = '0';
  assert.equal((await actor.fetch(ask({}, { ...motionOp, request: '/motion 10s explain layer norm' }))).status, 202);
});

// MOT-07 (owner message 27) replaces the resend this test asserted: a lost submission is never resent, paused or not. Reconciling its
// key starts nothing, so it runs while paused (message 28 keeps reconciliation), and a confirmed no-start releases its hold.
test('paused: an unconfirmed start is never resent; reconciling its key starts nothing, and a confirmed no-start releases its hold', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }, { render: true }]);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  // The first submission never reaches the orchestrator (no answer).
  const through = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (new URL(url).pathname === '/jobs') throw new Error('socket hang up'); return through(url, init); };
  await actor.fetch(ask());
  globalThis.fetch = through;
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'reserved', null, 'running']], 'held until reconciled');
  env.MOTION_GENERATION_PAUSED = '1';
  for (let i = 0; i < 5; i++) await actor.alarm();
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, w.model.calls.length], [0, 0, 0], 'nothing resent or started while paused');
  const v = await video(actor);
  assert.deepEqual([v.status, v.retryable, v.hold.state], ['failed', true, 'released']);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 0, 'cancelled']], 'closed by the run its grant was for: a confirmed no-start, released');
  delete env.MOTION_GENERATION_PAUSED;
  await actor.alarm();
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size], [0, 0], 'never resent once generation resumes');
});

test('paused: a job already running still polls, settles and plays; another can still be stopped and settle', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  await actor.fetch(ask());
  env.MOTION_GENERATION_PAUSED = '1';
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']], 'settled at its real cost');
  assert.ok(env.LEARN_MEDIA.objects.size > 0, 'the finished video is stored to play');

  const stopEnv = env0(LEARN_DB);
  w.script([{ stage: 'directing', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 30000, hold: true }, { render: true }]);
  const other = new LearnVideos(durable('video-b'), stopEnv);
  const { placementId } = await (await other.fetch(ask())).json();
  for (let i = 0; i < 100 && !w.model.held; i++) await sleep(5);
  stopEnv.MOTION_GENERATION_PAUSED = '1';
  const v = (await (await other.fetch(stopping(placementId))).json()).videos[0];
  assert.deepEqual([v.status, v.error], ['failed', 'Stopped.']);
  w.model.held();
  await settle(other, async () => motionAttempts(sqlite)[1][1] !== 'reserved');
  assert.deepEqual(motionAttempts(sqlite)[1], [2_000_000, 'settled', 700_000, 'failed'], 'the stopped job settles while paused');
});

// MOT review FIX-FIRST item 1 (2026-10-21): the Durable Object accepts a Stop while its alarm awaits a fetch. The alarm's older copy
// of the job must never overwrite that Stop.
const stopScript = [{ stage: 'directing', max_tokens: 16000, out: 5000, hold: true }, { stage: 'storyboarding', max_tokens: 16000, out: 5000 }, { stage: 'authoring', max_tokens: 64000, out: 30000 }, { render: true }];
// Holds the alarm's request to the path `matches` picks until release(), and says when the alarm reached it.
function gateFetch(matches) {
  const through = globalThis.fetch, gate = {};
  const opened = new Promise(r => { gate.release = r; });
  globalThis.fetch = async (url, init) => { if (!gate.reached && matches(new URL(url).pathname, init)) { gate.reached = true; await opened; } return through(url, init); };
  gate.restore = () => { globalThis.fetch = through; };
  return gate;
}

// A Stop accepted while the alarm is mid-await (on close() when the start answer was lost, or on the job poll). Without a restart
// the alarm then resumes with its older copy. With a restart the object is evicted mid-await: that alarm never resumes (its request
// is never answered and its promise is dropped), and a new instance over the same storage reruns the alarm. Owner review of
// 0e399bc8, item 1: exactly one orchestrator POST, no stage after the cancel (no further model call, no render), cancel sent (and
// by whom), settled exactly once at the in-flight cost, the usage action labelled cancelled.
async function stopDuringAlarm(t, { at, restart }) {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(stopScript);
  const data = new Map(), env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a', data), env);
  const through = globalThis.fetch;
  if (at === 'close') globalThis.fetch = async (url, init) => { const r = await through(url, init); if (new URL(url).pathname === '/jobs') throw new Error('socket hang up'); return r; };
  const { placementId } = await (await actor.fetch(ask())).json();
  globalThis.fetch = through;
  await until(() => w.model.held, 'the first call in flight');
  // The alarm's request is answered only after the learner's Stop has been accepted and saved.
  const gate = gateFetch(at === 'close' ? path => path.endsWith('/close') : (path, init) => /^\/jobs\/[0-9a-f]{32}$/.test(path) && (init?.method || 'GET') === 'GET');
  const polling = actor.alarm();
  await until(() => gate.reached, `the alarm awaiting ${at}`);
  const v = (await (await actor.fetch(stopping(placementId))).json()).videos[0];
  assert.deepEqual([v.status, v.error], ['failed', 'Stopped.']);
  const callsAtStop = w.model.calls.length, cancelsAtStop = w.orchestrator.cancels;
  // The Stop handler cancels only a job whose ticket it holds: the poll case has one, the close case does not yet.
  assert.equal(cancelsAtStop, at === 'poll' ? 1 : 0, 'cancels sent by the Stop handler itself');
  let now = actor;
  if (restart) {
    gate.restore(); // the evicted alarm's request stays unanswered; nothing of it runs again
    now = new LearnVideos(durable('video-a', data), env);
    await now.alarm();
  } else { gate.release(); await polling; gate.restore(); }
  const recovered = [...w.orchestrator.o.jobs.values()][0];
  assert.ok(recovered.controller.signal.aborted, 'the job is told to stop');
  if (at === 'close') assert.equal(w.orchestrator.cancels, 1, restart ? 'exactly one cancel, sent by the rerun alarm after the restart' : 'exactly one cancel, sent by the resumed alarm once it found the job');
  else assert.ok(w.orchestrator.cancels - cancelsAtStop <= 1, `the Stop handler sent the cancel; the ${restart ? 'rerun' : 'resumed'} alarm sent at most one more, idempotent (${w.orchestrator.cancels} in all)`);
  const after = await video(now);
  assert.deepEqual([after.status, after.error], ['failed', 'Stopped.'], 'the Stop is not overwritten');
  w.model.held(); // the call in flight lands and is priced
  await settle(now, async () => motionAttempts(sqlite)[0][1] !== 'reserved');
  await now.alarm();
  assert.equal(w.orchestrator.posts, 1, 'exactly one orchestrator POST: no extra start');
  assert.deepEqual([w.model.calls.length - callsAtStop, w.renders.length], [0, 0], 'no stage after the cancel: no model call, no render');
  assert.equal(recovered.status, 'cancelled');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 100_000, 'failed']], 'settled once at the in-flight $0.10');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.category, o.cost_usd, o.calls]), [['motion', 0.1, 1]], 'one settlement');
  assert.deepEqual(actions(sqlite), [['video', 'cancelled', 'none', true]], 'labelled cancelled, not failed');
}
test('MOT-09 review: a Stop accepted while the alarm awaits close() is never overwritten; the job its key started is cancelled and settles once as cancelled', t => stopDuringAlarm(t, { at: 'close' }));
test('MOT-09 review: a Stop accepted while the alarm awaits the job poll is never overwritten, and the job settles once as cancelled', t => stopDuringAlarm(t, { at: 'poll' }));
test('MOT-09 review: a Stop accepted while the alarm awaits close(), then the object is evicted mid-await: the rerun alarm sends the one cancel, one POST, settled once as cancelled', t => stopDuringAlarm(t, { at: 'close', restart: true }));
test('MOT-09 review: a Stop accepted while the alarm awaits the job poll, then the object is evicted mid-await: the Stop cancels, the rerun alarm adds at most one, settled once as cancelled', t => stopDuringAlarm(t, { at: 'poll', restart: true }));

// Owner review of 0e399bc8, item 2 (MOT-08): Motion admission (the hold, /health, the grant write and the POST) shares one 25 s
// deadline inside Generate's 30 s blockConcurrencyWhile. Mocked clock (t.mock.timers: setTimeout and Date), no real waits. The clock
// moves only while the orchestrator double answers slowly, so these tests prove that /health and the POST wait only for what is
// left of the 25 s, and what happens when too little is left; they do not measure real CPU or storage time inside the block. The orchestrator
// is a double with injectable delays: it starts a job when a POST with a grant for its current boot arrives, whatever the client
// then does; it can restart (a new boot) right after answering /health.
function slowOrchestrator(t, o) {
  Object.assign(o, { boot: 'a'.repeat(32), posts: 0, starts: 0, keys: new Map(), waiting: 0 });
  // A slow answer: the only place the mocked clock moves (onClock), so real work elsewhere never spends the budget.
  const wait = (ms, signal) => { o.waiting++; return new Promise((done, fail) => {
    const id = setTimeout(done, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); fail(signal.reason); }, { once: true });
  }).finally(() => { o.waiting--; }); };
  const original = globalThis.fetch;
  const mine = async (url, init = {}) => {
    const { host, pathname: path } = new URL(url);
    if (host !== 'orchestrator.test') return original(url, init); // only the worker's orchestrator: transparent to every other call
    if (path === '/health') {
      await wait(o.healthMs, init.signal);
      const boot = o.boot;
      if (o.restartAfterHealth) { o.boot = 'b'.repeat(32); o.restartAfterHealth = false; }
      return Response.json({ ok: true, active: false, boot });
    }
    if (path === '/jobs') {
      o.posts++;
      const body = JSON.parse(init.body);
      if (body.grant.boot !== o.boot) return Response.json({ error: 'grant_refused', detail: 'the grant was issued before the Motion service restarted; nothing was started' }, { status: 403 });
      if (!o.keys.has(body.idempotency_key)) { o.starts++; o.keys.set(body.idempotency_key, crypto.randomUUID().replace(/-/g, '')); }
      const id = o.keys.get(body.idempotency_key);
      await wait(o.postMs, init.signal);
      return Response.json({ job_id: id, status: 'running' }, { status: 202 });
    }
    const close = path.match(/^\/keys\/([^/]+)\/close$/);
    if (close) { const id = o.keys.get(close[1]); return Response.json(id ? { job_id: id, status: 'running', boot: o.boot } : { job_id: null, closed: true, boot: o.boot }); }
    if (/^\/jobs\/[0-9a-f]{32}$/.test(path)) return Response.json({ status: 'running', spend: { cost_usd: null, bound_usd: 0, calls: 0, in_flight: 0 }, renders: 0 });
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  globalThis.fetch = mine;
  o.restore = () => { if (globalThis.fetch === mine) globalThis.fetch = original; };
  t.after(o.restore);
  return o;
}
// Runs a promise to its end on the mocked clock: 10 ms per step, and only while the orchestrator double is answering slowly.
async function onClock(t, promise, o) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  while (!done) { await new Promise(r => setImmediate(r)); if (o.waiting) t.mock.timers.tick(10); }
  return promise;
}
// The mocked time spent inside each blockConcurrencyWhile call: the network waits only (see above).
function blockSpans(actor) {
  const inner = actor.state.blockConcurrencyWhile, spans = [];
  actor.state.blockConcurrencyWhile = fn => inner(async () => { const start = Date.now(); try { return await fn(); } finally { spans.push(Date.now() - start); } });
  return spans;
}
// The admission deadline: 25 s, 5 s under the 30 s limit (50 ms for the 10 ms clock steps).
const UNDER_BLOCK = took => assert.ok(took <= 25050, `the network waits took ${took} ms of mocked time: inside the 25 s admission deadline`);

test('MOT-08 review: /health 15.5 s then a POST of 15.5 s: the POST waits only for what is left of the 25 s admission deadline; the hold is kept and the alarm reconciles the one job', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const { sqlite, LEARN_DB } = d1(t);
  const o = slowOrchestrator(t, { healthMs: 15500, postMs: 15500 });
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB)), spans = blockSpans(actor);
  await onClock(t, actor.fetch(ask()), o);
  UNDER_BLOCK(spans.at(-1));
  const v = await video(actor);
  assert.deepEqual([v.status, v.hold?.state], ['generating', 'reserved'], 'the POST may have started the job: held, never released');
  assert.deepEqual([o.posts, o.starts, motionAttempts(sqlite)], [1, 1, [[2_000_000, 'reserved', null, 'running']]], 'one hold, one start');
  await onClock(t, actor.alarm(), o);
  const [[, job]] = [...await actor.state.storage.list({ prefix: 'job:' })];
  assert.equal(job.ticket?.id, [...o.keys.values()][0], 'reconciled by its key to the one job the POST started');
  assert.deepEqual([o.posts, o.starts, motionAttempts(sqlite).length], [1, 1, 1], 'never resent');
});

test('MOT-08 review: too little of the 25 s admission deadline left for the POST, or /health past it: refused before any POST, the hold released, nothing started', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  for (const [healthMs, why] of [[23500, /too slow to answer\. Nothing was started/], [26000, /did not answer\. Nothing was started/]]) {
    const { sqlite, LEARN_DB } = d1(t);
    const o = slowOrchestrator(t, { healthMs, postMs: 100 });
    const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB)), spans = blockSpans(actor);
    await onClock(t, actor.fetch(ask()), o);
    UNDER_BLOCK(spans.at(-1));
    const v = await video(actor);
    assert.deepEqual([v.status, v.retryable, v.hold?.state], ['failed', true, 'released'], `health ${healthMs} ms`);
    assert.match(v.error, why);
    assert.deepEqual([o.posts, o.starts, motionAttempts(sqlite)], [0, 0, [[2_000_000, 'settled', 0, 'cancelled']]], 'one hold, released; no start');
    o.restore();
  }
});

test('MOT-08 review: a slow cold /health, then the POST lands on a restarted process: its old-boot grant is refused, released, nothing started; a clean retry starts once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() }); t.after(() => t.mock.timers.reset());
  const { sqlite, LEARN_DB } = d1(t);
  const o = slowOrchestrator(t, { healthMs: 15500, postMs: 100, restartAfterHealth: true });
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB)), spans = blockSpans(actor);
  await onClock(t, actor.fetch(ask()), o);
  UNDER_BLOCK(spans.at(-1));
  const v = await video(actor);
  assert.deepEqual([v.status, v.retryable, v.hold?.state], ['failed', true, 'released']);
  assert.match(v.error, /issued before the Motion service restarted; nothing was started/);
  assert.deepEqual([o.posts, o.starts, motionAttempts(sqlite)], [1, 0, [[2_000_000, 'settled', 0, 'cancelled']]], 'refused: nothing started, released in full');
  o.healthMs = 300;
  await onClock(t, actor.fetch(ask({ retry: true })), o);
  UNDER_BLOCK(spans.at(-1));
  assert.equal((await video(actor)).status, 'generating');
  assert.deepEqual([o.posts, o.starts, motionAttempts(sqlite)], [2, 1, [[2_000_000, 'settled', 0, 'cancelled'], [2_000_000, 'reserved', null, 'running']]], 'the retry: one hold, one start');
});

// Owner message 32: the confirmation's estimate is the server's, in credits (1 credit = $0.01), only where Motion can start and is not
// paused. The $2 TEST hold (8.96 in production) stays internal.
test('the list returns the Motion estimate in credits: 100 for MOTION_ESTIMATE_USD 1.00; none without it, while paused or with no orchestrator', async t => {
  const { LEARN_DB } = d1(t);
  const list = extra => new LearnVideos(durable('video-a'), env0(LEARN_DB, '50', extra)).list();
  const shown = await list({ MOTION_ESTIMATE_USD: '1.00' });
  assert.deepEqual([shown.motionEstimateCredits, shown.motionHoldUsd], [100, 2]);
  assert.equal((await list({ MOTION_ESTIMATE_USD: '1.10' })).motionEstimateCredits, 110, 'rounded up, without a float error');
  for (const extra of [{}, { MOTION_ESTIMATE_USD: '' }, { MOTION_ESTIMATE_USD: 'about 1' }, { MOTION_ESTIMATE_USD: '0' },
    { MOTION_ESTIMATE_USD: '1.00', MOTION_GENERATION_PAUSED: '1' }, { MOTION_ESTIMATE_USD: '1.00', MOTION_ORCHESTRATOR_URL: undefined }]) {
    assert.equal('motionEstimateCredits' in await list(extra), false, JSON.stringify(extra));
  }
});

// Owner message 37: an identical /motion prompt generates a new video. Each Generate press carries its own request id.
test('two separate Generate presses with an identical prompt: two jobs, two holds, two settlements, two cards', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  const press = id => ask({}, { ...motionOp, request_id: id });
  const a = await (await actor.fetch(press('press-0001-aaaa'))).json();
  await settle(actor, async () => (await actor.list()).videos.every(v => v.status === 'ready'));
  const b = await (await actor.fetch(press('press-0002-bbbb'))).json();
  await settle(actor, async () => (await actor.list()).videos.length === 2 && (await actor.list()).videos.every(v => v.status === 'ready'));
  assert.notEqual(a.placementId, b.placementId, 'two cards');
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, w.model.calls.length], [2, 2, 6], 'two jobs');
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled'], [2_000_000, 'settled', 800_000, 'settled']], 'two holds, each settled once');
});

test('one Generate press resent concurrently stays one job (MOT-06 with a request id)', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  const press = () => ask({}, { ...motionOp, request_id: 'press-0003-cccc' });
  const [x, y] = await Promise.all([actor.fetch(press()), actor.fetch(press())]).then(rs => Promise.all(rs.map(r => r.json())));
  assert.equal(x.placementId, y.placementId);
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, motionAttempts(sqlite)], [1, 1, [[2_000_000, 'settled', 800_000, 'settled']]]);
});

// ---------- UI-15 / MOT-20: Generate with the approved proposal (generation-proposal.js) ----------

const WATER = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const approved = async (env, over = {}, user = 'alice@example.test', at = {}) => signProposal(env, { command: 'motion', title: 'Water cycle: evaporation to rain', description: WATER, settings: { duration_seconds: 10, audio: false }, source_refs: [], input: { request: motionOp.request, concept: 'Attention', org: 'team', app: 'demo' }, ...over }, user, at);
// The authorized canvas the worker forwards (learn-video.js privateLessonAssetFetch), as it would for app=demo.
const withProposal = (p, request_id = 'press-0100-aaaa') => withLessonApp(ask({}, { ...motionOp, request_id, proposal: p }), { org: 'team', name: 'demo' });
// MOT-22: the proposal as the learner's chat on that canvas holds it (its current revision lives there).
function chatted(sqlite, p) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, org TEXT NOT NULL, user TEXT NOT NULL, scope_ref TEXT NOT NULL, commit_sha TEXT NOT NULL, title TEXT); INSERT OR IGNORE INTO threads (id, org, user, scope_ref, commit_sha) VALUES ('t1', 'team', 'alice@example.test', 'demo', 'canvas');");
  sqlite.exec(sql('0019-chat-message-meta.sql'));
  sqlite.prepare("INSERT INTO chat_message_meta (message_id, thread_id, role, meta_json) VALUES (?, 't1', 'assistant', ?)").run(Math.floor(Math.random() * 1e9), JSON.stringify({ version: 1, kind: 'answer', proposal: p }));
  return p;
}
// The /jobs bodies the worker sent, read beside world()'s orchestrator double (restored only while it is still this wrapper).
function jobBodies(t) {
  const bodies = [], inner = globalThis.fetch;
  const mine = async (url, init) => { if (/orchestrator\.test\/jobs$/.test(String(url)) && init?.method === 'POST') bodies.push(JSON.parse(init.body)); return inner(url, init); };
  globalThis.fetch = mine;
  t.after(() => { if (globalThis.fetch === mine) globalThis.fetch = inner; });
  return bodies;
}

test('MOT-20 Generate with the approved proposal: one job, and the orchestrator gets its title, duration and description as binding input', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const bodies = jobBodies(t);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  const p = chatted(sqlite, await approved(env));
  const [x, y] = await Promise.all([actor.fetch(withProposal(p)), actor.fetch(withProposal(p))]).then(rs => Promise.all(rs.map(r => r.json())));
  assert.equal(x.placementId, y.placementId, 'a double click is one press: one card');
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, motionAttempts(sqlite).length], [1, 1, 1], 'one job, one hold');
  assert.deepEqual(bodies[0].approved_proposal, { title: 'Water cycle: evaporation to rain', duration_seconds: 10, aspect_ratio: '16:9', description: WATER });
  assert.equal(bodies[0].request, motionOp.request);
});

test('MOT-20 refused before any hold or POST: a forged, edited, other-learner or expired proposal; one video per proposal', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const env = env0(LEARN_DB);
  const actor = new LearnVideos(durable('video-a'), env);
  const p = chatted(sqlite, await approved(env));
  const refusedWith = async (proposal, why, id) => {
    const response = await actor.fetch(withProposal(proposal, id));
    assert.equal(response.status, 409, why);
    assert.match((await response.json()).error, why);
  };
  await refusedWith({ ...p, sig: 'f'.repeat(64) }, /not made for you, or it was changed/);
  await refusedWith({ ...p, title: 'Something else' }, /changed/);
  await refusedWith(await approved(env, {}, 'bob@example.test'), /not made for you/);
  await refusedWith(await approved(env, {}, 'alice@example.test', { now: Math.floor(Date.now() / 1000) - 2 * 24 * 3600 }), /expired/);
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length, (await actor.list()).videos.length], [0, 0, 0], 'nothing held, started or added');
  // The proposal makes its video once; its next version (a stale approval, or a second press) is refused, nothing more starts.
  await actor.fetch(withProposal(p));
  await settle(actor, async () => (await video(actor)).status === 'ready');
  const { proposal: v2 } = await reviseSettings(env, p, { duration_seconds: 20, audio: false }, 'alice@example.test');
  const again = await actor.fetch(withProposal(v2, 'press-0101-bbbb'));
  assert.deepEqual([again.status, (await again.json()).code], [409, 'proposal_used']);
  assert.deepEqual([w.orchestrator.posts, motionAttempts(sqlite).length], [1, 1]);
});
