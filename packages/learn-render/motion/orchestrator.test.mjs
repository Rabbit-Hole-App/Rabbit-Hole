// The Motion orchestrator (orchestrator.mjs): the routes the motion_request provider uses, one job at a time, Stop,
// the signed per-job hold with a worst-case check before every call, the sandboxed-renderer requirement, idempotent
// submission, restart, cleanup and the runtime bound. The pipeline is doubled: no model, no render, nothing paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestSpendBound } from '../../control-plane/src/learn-spend.js';
import { GRANT_MAX_AGE_S, motionOrchestrator, responseCost, signGrant, validateJobRequest } from './orchestrator.mjs';

const TOKEN = 'o'.repeat(40);
const MODEL = 'claude-opus-5-5';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 500; i++) { if (await fn()) return; await sleep(10); } assert.fail(`timed out waiting for ${what}`); };
const LINUX = { ok: true, busy: false, sandbox: 'linux' };
let keys = 0;
// A job request as the worker sends it: its own idempotency key and a grant for $2 signed with the shared token.
const job = ({ micros = 2_000_000, key = `op-motion-${++keys}-key`, at = Math.floor(Date.now() / 1000), token = TOKEN, ...rest } = {}) =>
  ({ request: '/motion 15s explain me softmax func', location: { concept: 'Attention' }, idempotency_key: key, grant: { micros, issued_at: at, sig: signGrant(token, key, micros, at) }, ...rest });

async function start(t, { run, health = async () => LINUX, call = async () => new Response('{}'), outDir = mkdtempSync(join(tmpdir(), 'motion-orch-')), logs = [], ...options } = {}) {
  const o = motionOrchestrator({ token: TOKEN, service: { health, submit: async () => new Response('{}') }, call, outDir, run, log: line => logs.push(line), ...options });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); o.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body, token = TOKEN } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const view = async id => (await req(`/jobs/${id}`)).json();
  return { o, req, view, outDir, logs };
}
// A model reply with usage: output tokens at Opus 5.5's $20/M.
const reply = outputTokens => new Response(JSON.stringify({ model: MODEL, usage: { input_tokens: 0, output_tokens: outputTokens } }));

test('job requests: a /motion line, an optional concept and card context, the key and grant; never composition source', () => {
  assert.deepEqual(validateJobRequest(job()), []);
  assert.deepEqual(validateJobRequest(job({ context: { selection: { cardId: 'c1', kind: 'note', title: 'Photosynthesis', text: 'Light reactions' } } })), []);
  for (const bad of [
    { ...job(), request: 'explain softmax' }, { ...job(), request: '/motion' }, { ...job(), request: `/motion ${'x'.repeat(500)}` },
    { ...job(), model: 'x' }, { ...job(), location: { concept: 'a', path: '/etc' } }, { ...job(), location: { concept: 'x'.repeat(101) } },
    { ...job(), source: 'export const C = () => null;' }, { ...job(), composition: { source: 'x' } }, // learner-supplied Remotion code (spec §34)
    { ...job(), context: { selection: { text: 'x'.repeat(12001) } } }, { ...job(), idempotency_key: 'x' }, { ...job(), grant: undefined },
    { ...job(), grant: { micros: 1.5, issued_at: 1, sig: 'x' } }, [],
  ]) assert.notDeepEqual(validateJobRequest(bad), [], JSON.stringify(bad).slice(0, 80));
});

test('auth, one job at a time, the render service must be idle, and only final.mp4 outlives the job until its TTL', async t => {
  let release;
  const run = async ({ dir, onStage }) => {
    onStage('directing');
    mkdirSync(join(dir, 'final'), { recursive: true });
    writeFileSync(join(dir, 'composition.jsx'), 'generated source');
    await new Promise(r => { release = r; });
    writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from('MP4BYTES'));
    return { status: 'ready', brief: { title: 'Softmax' }, block: { motion: { duration_seconds: 15 } }, render: { render_id: 'a'.repeat(32) }, job: { repair_count: 1 }, timings: { total: 600 } };
  };
  let clock = Date.now();
  const { req, view, outDir, o } = await start(t, { run, now: () => clock, resultTtlMs: 1000 });
  assert.equal((await req('/jobs', { method: 'POST', body: job(), token: 'x'.repeat(40) })).status, 401);
  assert.equal((await req('/jobs', { method: 'POST', body: { request: 'softmax' } })).status, 400);
  assert.deepEqual(await (await req('/health', { token: '' })).json(), { ok: true, active: false });
  const created = await req('/jobs', { method: 'POST', body: job() });
  assert.equal(created.status, 202);
  const { job_id } = await created.json();
  assert.match(job_id, /^[0-9a-f]{32}$/);
  assert.equal((await req('/jobs', { method: 'POST', body: job() })).status, 429, 'one job at a time');
  assert.deepEqual(await view(job_id).then(v => [v.status, v.stage]), ['running', 'directing']);
  assert.equal((await req(`/jobs/${job_id}/final.mp4`)).status, 409);
  release();
  await until(async () => (await view(job_id)).status === 'ready', 'ready');
  const done = await view(job_id);
  assert.deepEqual([done.title, done.render_id, done.repair_count, done.motion.duration_seconds, done.spend.cost_usd], ['Softmax', 'a'.repeat(32), 1, 15, 0]);
  assert.deepEqual(readdirSync(outDir), [`${job_id}.mp4`], 'the job directory and its generated source are gone; only the result waits');
  const mp4 = await req(`/jobs/${job_id}/final.mp4`);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await mp4.arrayBuffer()).toString(), 'MP4BYTES');
  for (const path of ['/jobs/../etc', `/jobs/${job_id.toUpperCase()}`, `/jobs/${job_id}/job.json`, `/jobs/${'b'.repeat(32)}`]) assert.equal((await req(path)).status, 404, path);
  clock += 2000; o.sweep();
  assert.deepEqual(readdirSync(outDir), [], 'an unfetched result is deleted after its TTL');
  const busy = await start(t, { run, health: async () => ({ ...LINUX, busy: true }) });
  assert.equal((await busy.req('/jobs', { method: 'POST', body: job() })).status, 429, 'a render still finishing blocks a new job');
});

test('the sandboxed renderer is required: unreachable, unsandboxed or degraded refuses the job and runs nothing (F3)', async t => {
  let runs = 0;
  const run = async () => { runs++; return { status: 'ready' }; };
  for (const [health, want] of [[async () => { throw new Error('ECONNREFUSED'); }, /unavailable/], [async () => ({ ok: true, busy: false, sandbox: 'none' }), /sandbox none/], [async () => ({ ok: false, busy: false, sandbox: 'linux' }), /degraded/]]) {
    const { req } = await start(t, { run, health });
    const r = await req('/jobs', { method: 'POST', body: job() });
    const body = await r.json();
    assert.deepEqual([r.status, body.error], [503, 'renderer_unavailable']);
    assert.match(body.detail, want);
    assert.match(body.detail, /nothing was started/);
  }
  assert.equal(runs, 0);
  assert.throws(() => motionOrchestrator({ token: TOKEN, outDir: mkdtempSync(join(tmpdir(), 'motion-orch-')) }), /no in-process renderer/);
});

test('the grant: a bad signature, an expired grant and one issued before a restart start nothing; a duplicate key is the same job', async t => {
  let runs = 0, release;
  const run = async () => { runs++; await new Promise(r => { release = r; }); return { status: 'ready' }; };
  const { req } = await start(t, { run });
  const forged = job({ token: 'f'.repeat(40) });
  assert.deepEqual(await req('/jobs', { method: 'POST', body: forged }).then(async r => [r.status, (await r.json()).error]), [403, 'grant_refused']);
  const tampered = job(); tampered.grant.micros = 25_000_000;
  assert.equal((await req('/jobs', { method: 'POST', body: tampered })).status, 403, 'the amount is signed');
  assert.equal((await req('/jobs', { method: 'POST', body: job({ at: Math.floor(Date.now() / 1000) - GRANT_MAX_AGE_S - 5 }) })).status, 403);
  assert.equal((await req('/jobs', { method: 'POST', body: job({ micros: 25_000_001 }) })).status, 403, 'above the largest hold');
  const first = job();
  const a = await (await req('/jobs', { method: 'POST', body: first })).json();
  const again = await req('/jobs', { method: 'POST', body: first });
  assert.equal(again.status, 202);
  assert.deepEqual(await again.json(), { job_id: a.job_id, status: 'running', duplicate: true });
  assert.equal(runs, 1, 'a resent submission never starts a second job');
  release();
  // A restart: the new process has lost the job, and the same submission resent to it is refused, so one hold never pays twice.
  const restarted = await start(t, { run, now: () => Date.now() + 5000 });
  const resent = await restarted.req('/jobs', { method: 'POST', body: first });
  assert.equal(resent.status, 403);
  assert.match((await resent.json()).detail, /issued before the Motion service restarted; nothing was started/);
  assert.equal((await restarted.req(`/jobs/${a.job_id}`)).status, 404, 'the lost job answers 404; the worker keeps its hold as unknown cost');
  assert.equal(runs, 1);
});

test('a restart deletes what the previous process left: job directories and unfetched results, nothing else', async t => {
  const outDir = mkdtempSync(join(tmpdir(), 'motion-orch-'));
  mkdirSync(join(outDir, 'c'.repeat(32), 'final'), { recursive: true });
  writeFileSync(join(outDir, `${'d'.repeat(32)}.mp4`), 'x');
  writeFileSync(join(outDir, 'keep.txt'), 'operator file');
  await start(t, { outDir });
  assert.deepEqual(readdirSync(outDir), ['keep.txt']);
});

test('Stop aborts the job: the call in flight is abandoned, nothing new starts, the slot frees, and its real cost is counted once it lands', async t => {
  let calls = 0, land;
  const run = async ({ call, signal }) => {
    try { await call({}, { max_tokens: 16000, messages: [] }, MODEL); calls++; await call({}, { max_tokens: 16000, messages: [] }, MODEL); calls++; return { status: 'ready' }; }
    catch (error) { return { status: error.name === 'MotionCancelled' && signal.aborted ? 'cancelled' : 'failed', failure_reason: 'stopped during directing' }; }
  };
  const slow = () => new Promise(r => { land = () => r(reply(10000)); }); // a model call that would run for minutes
  const { req, view } = await start(t, { run, call: slow });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  const stop = await req(`/jobs/${job_id}/cancel`, { method: 'POST' });
  assert.deepEqual([stop.status, (await stop.json()).status], [202, 'stopping']);
  await until(async () => (await view(job_id)).status === 'cancelled', 'cancelled');
  let v = await view(job_id);
  assert.deepEqual([v.failure_reason, calls, v.spend.in_flight, v.spend.cost_usd], ['stopped during directing', 0, 1, null], 'its cost is unknown while it is in flight');
  assert.equal(v.spend.bound_usd, +requestSpendBound({ max_tokens: 16000, messages: [] }, MODEL).toFixed(6), 'it is held at its worst case');
  const landFirst = land;
  assert.equal((await req('/jobs', { method: 'POST', body: job() })).status, 202, 'the slot is free again');
  landFirst();
  await until(async () => (await view(job_id)).spend.in_flight === 0, 'the abandoned call to land');
  v = await view(job_id);
  assert.deepEqual([v.spend.cost_usd, v.spend.bound_usd], [0.2, 0.2], 'the landed call is priced: the worker settles $0.20 and releases the rest');
});

test('every job has a hard cap on paid calls, re-asks included', async t => {
  const seen = [];
  const run = async ({ call }) => { for (let i = 0; i < 4; i++) seen.push((await call({}, { max_tokens: 100, messages: [] }, MODEL)).status); return { status: 'failed', failure_reason: 'cap' }; };
  const { req, view } = await start(t, { run, maxCalls: 2, call: async () => reply(10) });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  assert.deepEqual(seen, [200, 200, 429, 429]);
  assert.match((await view(job_id)).failure_reason, /stopped before spending more: the 2-call limit for this job is spent/);
});

// F4 and the owner's 10:35 rule: each call's WORST case must fit what is left of the hold before it is sent; a repair that
// could pass the hold is refused and never sent, and the job ends with that reason and its real cost.
test('the hold: a repair whose worst case does not fit what is left is refused before sending; the real cost is reported', async t => {
  const sentBodies = [];
  const authorBody = { max_tokens: 64000, messages: [{ role: 'user', content: 'author' }] };
  const small = { max_tokens: 16000, messages: [{ role: 'user', content: 'director' }] };
  const costs = [5000, 5000, 46500]; // $0.10, $0.10, then an Author first pass of $0.93
  const run = async ({ call, onStage }) => {
    for (const [stage, body] of [['directing', small], ['storyboarding', small], ['authoring', authorBody], ['review_and_render', authorBody]]) {
      onStage(stage);
      const r = await call({}, body, MODEL);
      if (!r.ok) return { status: 'failed', failure_reason: `${stage}: model_error` };
      await r.text();
    }
    return { status: 'ready' };
  };
  const { req, view } = await start(t, { run, call: async (_, body) => { sentBodies.push(body); return reply(costs[sentBodies.length - 1]); } });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  const v = await view(job_id);
  const bound = requestSpendBound(authorBody, MODEL);
  assert.ok(bound > 2 - 1.13 && bound < 2, `the Author's worst case ($${bound}) fits an empty $2 hold but not what is left`);
  assert.equal(sentBodies.length, 3, 'the repair was never sent');
  assert.equal(v.failure_reason, `stopped before spending more: the next step (review_and_render) could cost up to $${bound.toFixed(2)}, more than the $0.87 left of this job's $2.00 hold`);
  assert.deepEqual([v.spend.cost_usd, v.spend.calls, v.spend.in_flight, v.spend.hold_usd], [1.13, 3, 0, 2], 'the worker settles $1.13 and releases $0.87');
});

test('every Motion stage asks for a server-side fallback; under a hold the call is sent without it, so it can be bounded', async t => {
  const { directorRequest } = await import('./director.js');
  const asked = directorRequest({ request: 'x' });
  assert.equal(asked.fallbacks, 'default');
  assert.equal(requestSpendBound(asked, MODEL), null, 'the shared bound refuses a fallback');
  const sentBodies = [];
  const run = async ({ call }) => { const r = await call({}, asked, MODEL); await r.text(); return { status: 'failed', failure_reason: 'x' }; };
  const { req, view } = await start(t, { run, call: async (_, body) => { sentBodies.push(body); return reply(100); } });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  assert.equal(sentBodies.length, 1);
  assert.equal(sentBodies[0].fallbacks, undefined);
  assert.deepEqual(sentBodies[0].betas, []);
  assert.ok(requestSpendBound(sentBodies[0], MODEL) > 0.32);
  assert.equal((await view(job_id)).spend.cost_usd, 0.002);
});

test('a call whose maximum cannot be bounded is refused before sending', async t => {
  let sentCalls = 0;
  const run = async ({ call }) => { const r = await call({}, { max_tokens: 100, messages: [] }, 'unpriced-model'); return { status: r.ok ? 'ready' : 'failed', failure_reason: 'x' }; };
  const { req, view } = await start(t, { run, call: async () => { sentCalls++; return reply(1); } });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  assert.equal(sentCalls, 0);
  assert.match((await view(job_id)).failure_reason, /cannot be bounded \(unpriced-model\)/);
});

test('a job past its runtime bound is stopped; an unreadable response keeps its bound and the cost stays unknown', async t => {
  const run = async ({ call, signal }) => {
    const r = await call({}, { max_tokens: 100, messages: [] }, MODEL); await r.text();
    await new Promise((_, fail) => signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true }));
  };
  const { req, view } = await start(t, { run, jobTimeoutMs: 50, call: async () => new Response('not json') });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  const v = await view(job_id);
  assert.match(v.failure_reason, /ran past 0 minutes and was stopped/);
  assert.deepEqual([v.spend.cost_usd, v.spend.bound_usd > 0], [null, true]);
});

test('the learner request text is never logged (spec §30)', async t => {
  const { req, view, logs } = await start(t, { run: async () => ({ status: 'failed', failure_reason: 'x' }) });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: job({ request: '/motion explain my private diagnosis notes' }) })).json();
  await until(async () => (await view(job_id)).status === 'failed', 'failed');
  assert.ok(logs.length >= 2);
  assert.ok(logs.every(line => !line.includes('diagnosis')), logs.join('\n'));
});

test('responseCost reads JSON and streamed usage', async () => {
  const usage = { input_tokens: 10000, output_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  assert.equal(await responseCost(new Response(JSON.stringify({ usage })), MODEL), (10000 * 4 + 5000 * 20) / 1e6);
  const sse = ['event: message_start', `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10000, output_tokens: 1 } } })}`, '', 'event: message_delta', `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 30000 } })}`, ''].join('\n');
  assert.equal(await responseCost(new Response(sse), MODEL), (10000 * 4 + 30000 * 20) / 1e6);
  assert.equal(await responseCost(new Response('not json'), MODEL), null);
});

// Owner brief 2026-10-21 message 7 item 4: the selected card (motion-context.js) reaches the pipeline unchanged; a 4000-
// character card in any script fits the body cap, crafted repository evidence is a 400.
test('job requests carry the selected card to the pipeline; crafted context is refused', async t => {
  const selection = { cardId: 'c-photo', kind: 'Explanation', title: 'Photosynthesis', text: '光'.repeat(4000) };
  assert.deepEqual(validateJobRequest(job({ context: { selection } })), []);
  assert.match(validateJobRequest(job({ context: { selection: { ...selection, sourceRefs: [{ commit: 'a'.repeat(40), path: 'model.py', start: 1, end: 2 }] } } })).join(), /only a repository card/);
  assert.match(validateJobRequest(job({ context: { selection, source_refs: [] } })).join(), /unknown field source_refs/);
  const seen = [];
  const { req } = await start(t, { run: async a => { seen.push(a.context); return { status: 'needs_clarification' }; } });
  assert.equal((await req('/jobs', { method: 'POST', body: job({ context: { selection } }) })).status, 202);
  await sleep(20);
  assert.deepEqual(seen, [{ selection }]);
  assert.equal((await req('/jobs', { method: 'POST', body: job({ context: { selection: { ...selection, text: '光'.repeat(4001) } } }) })).status, 400);
  // Past 32 KiB the body is cut off (readJson destroys the socket, so the client may see the 413 or a closed connection).
  assert.ok([413, 'closed'].includes(await req('/jobs', { method: 'POST', body: job({ pad: 'x'.repeat(40000) }) }).then(r => r.status, () => 'closed')));
});
