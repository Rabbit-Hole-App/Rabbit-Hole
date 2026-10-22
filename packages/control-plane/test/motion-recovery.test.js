// Motion recovery end to end in one process (owner message 38): the real LearnVideos Durable Object, its D1 ledger and LEARN_MEDIA
// (memory bucket) talk HTTP to the real Motion orchestrator, whose pipeline is a stub that saves checkpoints, makes model calls
// through the guarded call (a mocked provider with usage) and fails by cause. Nothing is paid and no generated code runs.
// Every hold and settlement below is the real ledger's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LearnVideos } from '../src/learn-video.js';
import { forwardUsagePayer } from '../src/learn-usage.js';
import { RECOVERY_POLICY, motionOrchestrator, policyHoldMicros, sealCheckpoint } from '../../learn-render/motion/orchestrator.mjs';
import { memoryBucket } from './live-storage-spy.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
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
const attempts = sqlite => rows(sqlite, 'usage_attempts').filter(a => a.attempt_id.startsWith('motion-')).map(a => [a.reserved_micros, a.cost_state, a.cost_micros, a.status]);
function durable(id, data = new Map()) {
  let lock = Promise.resolve();
  return { id, data, storage: { get: async k => structuredClone(data.get(k)), put: async (k, v) => data.set(k, structuredClone(v)), list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)])), setAlarm: async () => {} },
    blockConcurrencyWhile: fn => { const result = lock.then(fn); lock = result.catch(() => {}); return result; } };
}

const BRIEF = { title: 'Friction' }, STORYBOARD = { id: 'sb-1', beats: [] };
const FINDING = { reviewer: 'pedagogical', round: 1, category: 'required_claim_contradicted', beat_id: 'B3', description: 'Friction is shown acting on the block without slowing it.' };
const cp = state => ({ request: '/motion 10s explain how friction slows a sliding block', renderer: 'remotion', brief: BRIEF, storyboard: STORYBOARD, composition: { output: { status: 'composition', composition_id: 'c', source: 'SRC' }, state }, findings: state === 'blocking' ? [FINDING] : [], frames: [] });

// The orchestrator with a scripted pipeline. script.first / script.recover: steps of {call: out tokens}, {render}, {wait},
// {save: checkpoint}, then {fail: cause} or the end (a ready final.mp4). Each run records what it was given.
function world(t) {
  const model = { calls: 0 }, renders = [], runs = [];
  const gate = { release: null, waiting: false };
  let script = {};
  const call = async (env, body) => { model.calls++; return Response.json({ model: MODEL, usage: { input_tokens: 0, output_tokens: body.out } }); };
  const service = { health: async () => ({ ok: true, busy: false, sandbox: 'linux' }), submit: async () => { renders.push(1); return Response.json({ render_id: `r${renders.length}` }, { status: 202 }); }, status: async id => ({ render_id: id, status: 'ready' }) };
  const run = async ({ call: guarded, service: svc, dir, signal, onStage, recover }) => {
    runs.push(recover ? { mode: recover.mode, checkpoint: recover.checkpoint } : { mode: 'new' });
    const out = { checkpoint: recover?.checkpoint ?? null };
    for (const step of recover ? script.recover : script.first) {
      onStage('authoring', out);
      if (signal.aborted) return { status: 'cancelled', failure_reason: 'stopped during authoring', cause: 'stopped', checkpoint: out.checkpoint };
      if (step.wait) { gate.waiting = true; await new Promise(r => { gate.release = r; signal.addEventListener('abort', r, { once: true }); }); gate.waiting = false; continue; }
      if (step.save) { out.checkpoint = step.save; onStage('review_and_render', out); continue; }
      if (step.render) { await svc.submit({}); continue; }
      if (step.fail) return { status: 'failed', failure_reason: `stub: ${step.fail}`, cause: step.fail, checkpoint: out.checkpoint, job: { findings: out.checkpoint?.findings ?? [] } };
      const r = await guarded({}, { max_tokens: 16000, tools: [{ name: 'motion_review' }], messages: [{ role: 'user', content: 'x' }], out: step.call }, MODEL);
      if (!r.ok) return { status: 'failed', failure_reason: `stub: ${await r.text()}`, cause: 'limit', checkpoint: out.checkpoint };
      await r.text();
    }
    mkdirSync(join(dir, 'final'), { recursive: true });
    writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
    return { status: 'ready', brief: BRIEF, block: { motion: { duration_seconds: 10, source_refs: [] } }, render: { render_id: 'a'.repeat(32) }, job: { repair_count: 0 } };
  };
  let server = null;
  const original = globalThis.fetch;
  const orchestrator = { posts: [], cancels: 0, lose: 0 };
  orchestrator.start = async () => {
    if (server) { server.close(); orchestrator.o.close(); }
    orchestrator.o = motionOrchestrator({ token: TOKEN, service, call, outDir: mkdtempSync(join(tmpdir(), 'motion-rec-')), run });
    server = createServer(orchestrator.o.handle);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    orchestrator.base = `http://127.0.0.1:${server.address().port}`;
  };
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.host !== 'orchestrator.test') return original(url, init);
    if (['/jobs', '/recover'].includes(u.pathname)) orchestrator.posts.push(u.pathname);
    if (u.pathname.endsWith('/cancel')) orchestrator.cancels++;
    const response = await original(orchestrator.base + u.pathname, init);
    // An accepted submission whose answer is lost on the way back (a proxy 502): MOT-07.
    if (u.pathname === '/recover' && orchestrator.lose > 0) { orchestrator.lose--; return new Response('bad gateway', { status: 502 }); }
    return response;
  };
  t.after(() => { globalThis.fetch = original; server?.close(); orchestrator.o?.close(); });
  return { model, renders, runs, gate, orchestrator, script: s => { script = s; } };
}

const op = { op: 'motion_request', request: '/motion 10s explain how friction slows a sliding block', location: { concept: null } };
const env0 = (LEARN_DB, extra = {}) => ({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', LEARN_MEDIA: memoryBucket(),
  MOTION_ORCHESTRATOR_URL: 'https://orchestrator.test/', MOTION_ORCHESTRATOR_TOKEN: TOKEN, MOTION_JOB_RESERVATION_USD: '25', ...extra });
const who = req => forwardUsagePayer(req, { userId: 'u-alice', email: 'alice@example.test' });
const generate = () => who(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ operation: op, lessonId: 'canvas', page: 'canvas', confirmed: true }) }));
const recover = (id, mode, extra = {}) => who(new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ action: 'recover', id, mode, ...extra }) }));
const stopping = id => new Request('https://dev.test/api/learn/video?app=demo', { method: 'POST', body: JSON.stringify({ action: 'cancel', id }) });
async function settle(actor, done) { for (let i = 0; i < 300; i++) { await actor.alarm(); if (await done()) return; await sleep(5); } assert.fail('the job did not reach the expected state'); }
const video = async actor => (await actor.list()).videos[0];
const FIX_HOLD = policyHoldMicros(RECOVERY_POLICY.fix);

test('content findings: saved to LEARN_MEDIA with a pointer; Continue fixing sends the sealed checkpoint and exact findings under its own recalculated hold, settles once, and plays', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script({ first: [{ call: 5000 }, { save: cp('unreviewed') }, { call: 3000 }, { save: cp('blocking') }, { fail: 'content' }], recover: [{ call: 4000 }, { render: true }] });
  const env = env0(LEARN_DB), actor = new LearnVideos(durable('rec-a'), env);
  await actor.fetch(generate());
  await settle(actor, async () => (await video(actor)).status === 'failed' && (await video(actor)).hold?.state === 'released');
  const failed = await video(actor);
  assert.deepEqual([failed.recovery.cause, failed.recovery.actions], ['content', ['fix', 'edit']]);
  assert.equal(failed.recovery.explanation, `Review found a problem: ${FINDING.description}`);
  assert.deepEqual(failed.usage, { usedMicros: 160000, unknown: false }, '8000 output tokens at $20/M: 16 credits');
  const job = [...actor.state.data.values()].find(v => v.provider === 'motion_request');
  const saved = await (await env.LEARN_MEDIA.get(job.recovery.key)).json();
  assert.deepEqual(saved.checkpoint, cp('blocking'), 'the brief, storyboard, composition and verbatim findings survive in LEARN_MEDIA');
  assert.equal(saved.seal, sealCheckpoint(TOKEN, cp('blocking')));
  assert.deepEqual(saved.findings, [FINDING]);
  // A restart of the orchestrator after the job ended: recovery reads LEARN_MEDIA, not the orchestrator's memory.
  await w.orchestrator.start();
  assert.equal((await actor.fetch(recover(failed.id, 'fix'))).status, 428, 'paid: Continue fixing needs the confirmation');
  assert.equal((await actor.fetch(recover(failed.id, 'render', { confirmed: true }))).status, 409, 'only an offered action runs');
  assert.equal((await actor.fetch(recover(failed.id, 'fix', { confirmed: true }))).status, 202);
  assert.equal((await actor.fetch(recover(failed.id, 'fix', { confirmed: true }))).status, 409, 'a duplicate press starts nothing');
  assert.deepEqual(w.orchestrator.posts, ['/jobs', '/recover']);
  assert.deepEqual(w.runs[1], { mode: 'fix', checkpoint: cp('blocking') }, 'the repair gets the saved checkpoint and its exact findings');
  assert.deepEqual(attempts(sqlite)[1], [FIX_HOLD, 'reserved', null, 'running'], 'its own hold: the fix policy worst case, under what is left');
  await settle(actor, async () => (await video(actor)).status === 'ready' && (await video(actor)).hold?.state === 'released');
  assert.deepEqual(attempts(sqlite), [[25_000_000, 'settled', 160000, 'failed'], [FIX_HOLD, 'settled', 80000, 'settled']], 'one settlement per attempt, at its actual cost');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(r => [r.category, r.calls]), [['motion', 2], ['motion', 1]]);
  assert.equal(w.model.calls, 3, 'no duplicate paid work: 2 calls, then 1 for the repair');
  assert.deepEqual((await video(actor)).usage, { usedMicros: 240000, unknown: false });
  assert.ok(env.LEARN_MEDIA.objects.has(job.storageKey ?? [...actor.state.data.values()].find(v => v.provider === 'motion_request').storageKey), 'the video is stored');
});

test('renderer failure: Retry rendering holds and calls nothing; an orchestrator restart mid-recovery and a reload keep it recoverable; the second try plays', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script({ first: [{ call: 5000 }, { save: cp('accepted') }, { render: true }, { fail: 'renderer' }], recover: [{ wait: true }, { render: true }] });
  const data = new Map(), env = env0(LEARN_DB);
  let actor = new LearnVideos(durable('rec-b', data), env);
  await actor.fetch(generate());
  await settle(actor, async () => (await video(actor)).status === 'failed' && (await video(actor)).hold?.state === 'released');
  const failed = await video(actor);
  assert.deepEqual([failed.recovery.cause, failed.recovery.actions], ['renderer', ['render']]);
  assert.match(failed.recovery.explanation, /rendering it again uses no credits/);
  assert.equal((await actor.fetch(recover(failed.id, 'render'))).status, 202, 'free: no paid confirmation');
  for (let i = 0; i < 100 && !w.gate.waiting; i++) await sleep(5);
  assert.equal(attempts(sqlite).length, 1, 'no hold for a free render');
  await w.orchestrator.start(); // the orchestrator restarts mid-recovery: the attempt is lost
  actor = new LearnVideos(durable('rec-b', data), env); // and the page reloads onto a fresh object over the same storage
  await settle(actor, async () => (await video(actor)).status === 'failed');
  const lost = await video(actor);
  assert.deepEqual([lost.recovery.cause, lost.recovery.actions], ['lost', ['render']], 'the saved accepted composition is still there');
  w.script({ recover: [{ render: true }] });
  assert.equal((await actor.fetch(recover(lost.id, 'render'))).status, 202);
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.equal(w.model.calls, 1, 'only the first attempt called a model');
  assert.deepEqual(attempts(sqlite), [[25_000_000, 'settled', 100000, 'failed']], 'one hold, settled once; the recoveries held nothing');
  assert.deepEqual(w.runs.map(r => r.mode), ['new', 'render', 'render']);
});

test('Stop during recovery: the attempt is cancelled and settles once; the saved work stays recoverable', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script({ first: [{ call: 5000 }, { save: cp('blocking') }, { fail: 'content' }], recover: [{ call: 2000 }, { wait: true }, { call: 2000 }] });
  const actor = new LearnVideos(durable('rec-c'), env0(LEARN_DB));
  await actor.fetch(generate());
  await settle(actor, async () => (await video(actor)).hold?.state === 'released');
  const { id } = await video(actor);
  await actor.fetch(recover(id, 'fix', { confirmed: true }));
  for (let i = 0; i < 100 && !w.gate.waiting; i++) await sleep(5);
  await actor.fetch(stopping(id));
  await settle(actor, async () => (await video(actor)).hold?.state === 'released');
  assert.equal(w.orchestrator.cancels, 1);
  assert.equal(w.model.calls, 2, 'nothing after the Stop');
  assert.deepEqual(attempts(sqlite).map(a => a[1]), ['settled', 'settled']);
  assert.equal(attempts(sqlite)[1][2], 40000, 'the stopped attempt settles at what it spent');
  const after = await video(actor);
  assert.deepEqual([after.status, after.recovery.cause, after.recovery.actions], ['failed', 'stopped', ['fix']]);
});

test('an unconfirmed recovery submission is reconciled by its key, never resent: one attempt, one settlement', async t => {
  const { sqlite, LEARN_DB } = d1(t);
  const w = world(t); await w.orchestrator.start();
  w.script({ first: [{ call: 5000 }, { save: cp('blocking') }, { fail: 'content' }], recover: [{ call: 3000 }, { render: true }] });
  const actor = new LearnVideos(durable('rec-d'), env0(LEARN_DB));
  await actor.fetch(generate());
  await settle(actor, async () => (await video(actor)).hold?.state === 'released');
  const { id } = await video(actor);
  w.orchestrator.lose = 1;
  assert.equal((await actor.fetch(recover(id, 'fix', { confirmed: true }))).status, 202);
  assert.equal((await video(actor)).status, 'generating', 'unconfirmed: still generating, its hold reserved');
  assert.equal(attempts(sqlite)[1][3], 'running');
  await settle(actor, async () => (await video(actor)).status === 'ready');
  assert.deepEqual(w.orchestrator.posts, ['/jobs', '/recover'], 'never resent');
  assert.equal(w.runs.length, 2);
  assert.deepEqual(attempts(sqlite).map(a => [a[1], a[3]]), [['settled', 'failed'], ['settled', 'settled']]);
});
