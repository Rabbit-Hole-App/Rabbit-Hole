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
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer, periodOf, usageTotals } from '../src/learn-usage.js';
import { motionOrchestrator } from '../../learn-render/motion/orchestrator.mjs';
import { memoryBucket } from './live-storage-spy.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const NOW = Math.floor(Date.now() / 1000), PERIOD = periodOf(NOW);
const TOKEN = 'm'.repeat(48);
const MODEL = 'claude-opus-5-5';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  const service = { health: async () => (health instanceof Error ? Promise.reject(health) : health), submit: async () => { renders.push(1); return Response.json({ render_id: 'r' }); } };
  // The stub pipeline: the stages' calls (each {max_tokens, out}), then renders, then a final.mp4. A refused call (the
  // hold) fails the stage, as the real stages do; Stop ends it as cancelled.
  const pipeline = steps => async ({ call: guarded, service: svc, dir, signal, onStage }) => {
    try {
      for (const step of steps) {
        onStage(step.stage || 'authoring');
        if (signal.aborted) throw Object.assign(new Error('stopped'), { name: 'MotionCancelled' });
        if (step.render) { await svc.submit({}); continue; }
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
  const orchestrator = { posts: 0 };
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
async function settle(actor, done) { for (let i = 0; i < 300; i++) { await actor.alarm(); if (await done()) return; await sleep(5); } assert.fail('the job did not reach the expected state'); }
const video = async actor => (await actor.list()).videos[0];

test('the first end-to-end stub run: hold admitted before any call, the job runs, the real cost settles, the rest is released, renders recorded apart', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start(); w.script(FIRST_PASS);
  const actor = new LearnVideos(durable('video-a'), env0(LEARN_DB));
  await actor.fetch(ask());
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'reserved', null, 'running']], 'the $2 hold is reserved before the job starts');
  assert.equal((await balance(LEARN_DB)).reserved, 2_000_000);
  await settle(actor, async () => (await video(actor)).status === 'ready');
  const v = await video(actor);
  assert.deepEqual([v.status, v.provider, v.motion.title], ['ready', 'motion', 'Softmax']);
  assert.deepEqual(motionAttempts(sqlite), [[2_000_000, 'settled', 800_000, 'settled']], 'settled at the real $0.80');
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [800_000, 0], 'the unused $1.20 is released');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.category, o.status, o.cost_usd, o.calls]), [['motion', 'settled', 0.8, 3]]);
  assert.deepEqual([w.model.calls.length, w.renders.length], [3, 2]);
  assert.deepEqual(renderRows(sqlite), [['u-alice', 'free'], ['u-alice', 'free']], 'each render is platform-funded, attributed, never in the allowance');
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

test('an unconfirmed start is resent under the same key: the orchestrator returns the job it started, never a second', async t => {
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
  assert.deepEqual([w.orchestrator.posts, w.orchestrator.o.jobs.size, motionAttempts(sqlite).length, w.model.calls.length], [2, 1, 1, 3]);
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
test('four topics, with and without a selected card: resolved, held, settled, and the card says what it was grounded on', async t => {
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
      await service.submit({});
      mkdirSync(join(dir, 'final'), { recursive: true });
      writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
      return { job: { id: 'job', status: 'ready', repairs: { storyboard: 0, author: 0 }, transport_retries: [], repair_count: 0 }, render: { render_id: 'a'.repeat(32) }, calls: [], passes: [] };
    },
  };
  await w.orchestrator.start();
  w.orchestrator.o.close();
  // The same orchestrator, its run the real pipeline with the stage doubles.
  const outDir = mkdtempSync(join(tmpdir(), 'motion-topics-'));
  const service = { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => { w.renders.push(1); return Response.json({}); } };
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
  assert.deepEqual(motionAttempts(sqlite), Array(8).fill([2_000_000, 'settled', 800_000, 'settled']));
  assert.deepEqual(await balance(LEARN_DB).then(b => [b.used, b.reserved]), [6_400_000, 0]);
  assert.deepEqual([w.model.calls.length, w.renders.length, renderRows(sqlite).length], [24, 8, 8]);
});
