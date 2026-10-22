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
let keys = 0, lastBoot;
// A job request as the worker sends it: its own idempotency key and a grant for $2 signed with the shared token, bound to the
// orchestrator run it read from /health (by default the one the test started last).
const job = ({ micros = 2_000_000, key = `op-motion-${++keys}-key`, at = Math.floor(Date.now() / 1000), token = TOKEN, boot = lastBoot, ...rest } = {}) =>
  ({ request: '/motion 15s explain me softmax func', location: { concept: 'Attention' }, idempotency_key: key, grant: { micros, issued_at: at, ...(boot ? { boot } : {}), sig: signGrant(token, key, micros, at, boot) }, ...rest });

async function start(t, { run, health = async () => LINUX, call = async () => new Response('{}'), outDir = mkdtempSync(join(tmpdir(), 'motion-orch-')), logs = [], wrap = handle => handle, ...options } = {}) {
  const o = motionOrchestrator({ token: TOKEN, service: { health, submit: async () => new Response('{}') }, call, outDir, run, log: line => logs.push(line), ...options });
  lastBoot = o.boot;
  const server = createServer(wrap(o.handle));
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
  lastBoot = 'b'.repeat(32);
  assert.deepEqual(validateJobRequest(job()), []);
  assert.deepEqual(validateJobRequest(job({ context: { selection: { cardId: 'c1', kind: 'note', title: 'Photosynthesis', text: 'Light reactions' } } })), []);
  for (const bad of [
    { ...job(), request: 'explain softmax' }, { ...job(), request: '/motion' }, { ...job(), request: `/motion ${'x'.repeat(500)}` },
    { ...job(), model: 'x' }, { ...job(), location: { concept: 'a', path: '/etc' } }, { ...job(), location: { concept: 'x'.repeat(101) } },
    { ...job(), source: 'export const C = () => null;' }, { ...job(), composition: { source: 'x' } }, // learner-supplied Remotion code (spec §34)
    { ...job(), context: { selection: { text: 'x'.repeat(12001) } } }, { ...job(), idempotency_key: 'x' }, { ...job(), grant: undefined },
    { ...job(), grant: { micros: 1.5, issued_at: 1, sig: 'x' } }, job({ boot: null }), job({ boot: 'B'.repeat(32) }), [], // a grant names the run it is for (MOT-08)
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
  assert.deepEqual(await (await req('/health', { token: '' })).json(), { ok: true, active: false, boot: o.boot });
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

// Owner message 16 (2026-10-21): an explicit production execution policy whose enforced worst case IS the per-job hold. The real
// stage builders fit its caps; the caps' bound is the shared spend bound; the whole policy path, every call at its bound (costs
// unreadable), fits that hold exactly; one micro-dollar less refuses the last call before sending; anything outside the policy
// (a re-ask, a resend, an extra or oversized call, an unknown tool) is refused before sending.
test('the production policy: real requests fit its caps, and its worst case is exactly the hold', async t => {
  const { PRODUCTION_POLICY, policyHoldMicros, requestSize, pricedRequest } = await import('./orchestrator.mjs');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { directorRequest } = await import('./director.js');
  const { storyboardRequest } = await import('./storyboard.js');
  const { authorRequest } = await import('./author.js');
  const { reviewRequest } = await import('./review.js');
  const { SOURCE_MAX_BYTES } = await import('./static-check.js');
  const F = new URL('./fixtures/', import.meta.url);
  const { brief, storyboard } = JSON.parse(readFileSync(new URL('m7b/plan-softmax.json', F), 'utf8'));
  const frames = JSON.parse(readFileSync(new URL('m6/softmax.review-job.json', F), 'utf8')).passes[0].preview.frames.map(f => ({ ...f, file: 'm6/softmax.review-job.json' }));
  const findings = Array.from({ length: 12 }, (_, i) => ({ reviewer: 'visual', category: 'blank_frame', severity: 'blocking', beat_id: storyboard.beats[0].id, description: `finding ${i} `.padEnd(300, '.') }));
  const real = {
    // the largest Director context a learner can send: a 500-character line and a 4000-character card in a 3-byte script
    motion_brief: [directorRequest({ request: `/motion ${'光'.repeat(490)}`, selection: { title: 'x'.repeat(300), text: '光'.repeat(4000) } })],
    motion_storyboard: [storyboardRequest(brief), storyboardRequest(brief, { revision: { storyboard, findings } })],
    motion_composition: [authorRequest(brief, storyboard), authorRequest(brief, storyboard, { repair: { source: 'x'.repeat(SOURCE_MAX_BYTES), findings } })],
    motion_review: ['visual', 'pedagogical'].map(r => reviewRequest(r, brief, frames, fileURLToPath(F))),
  };
  for (const [kind, bodies] of Object.entries(real)) for (const body of bodies) {
    const { bytes, images } = requestSize(pricedRequest(body)), rule = PRODUCTION_POLICY[kind];
    assert.equal(body.tools[0].name, kind);
    assert.ok(body.max_tokens <= rule.max_tokens && bytes <= rule.bytes && images <= rule.images, `${kind}: ${body.max_tokens} tokens, ${bytes} bytes, ${images} images within ${JSON.stringify(rule)}`);
  }
  // A body exactly at a kind's caps: the shared bound prices it at that kind's share of the hold.
  const atCaps = (kind, marker = '') => {
    const rule = PRODUCTION_POLICY[kind];
    const body = { max_tokens: rule.max_tokens, tools: [{ name: kind }], system: [{ type: 'text', text: '', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [...Array.from({ length: rule.images }, () => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })), { type: 'text', text: marker }] }] };
    body.messages[0].content.at(-1).text = marker.padEnd(marker.length + rule.bytes - requestSize(body).bytes, '.');
    assert.equal(requestSize(body).bytes, rule.bytes);
    return body;
  };
  const kinds = Object.keys(PRODUCTION_POLICY);
  assert.equal(kinds.reduce((s, kind) => s + PRODUCTION_POLICY[kind].calls * Math.round(requestSpendBound(atCaps(kind), MODEL) * 1e6), 0), policyHoldMicros());
  assert.equal(policyHoldMicros(), 8_958_600, 'the production hold: $8.9586, configured as $8.96');

  // The whole policy path through the orchestrator, every response unreadable (each call stays at its bound).
  const path = kinds.flatMap(kind => Array.from({ length: PRODUCTION_POLICY[kind].calls }, (_, i) => atCaps(kind, `${kind} ${i}`)));
  const runPath = async (micros, extra = []) => {
    const statuses = [];
    const { req, view } = await start(t, { policy: PRODUCTION_POLICY, call: async () => new Response('not json'), run: async ({ call }) => {
      for (const body of [...path, ...extra]) { const r = await call({}, body, MODEL); statuses.push(r.status); await r.text(); }
      return { status: 'failed', failure_reason: 'end of path' };
    } });
    const { job_id } = await (await req('/jobs', { method: 'POST', body: job({ micros }) })).json();
    await until(async () => (await view(job_id)).status === 'failed', 'the path to finish');
    return { statuses, v: await view(job_id) };
  };
  const full = await runPath(policyHoldMicros(), [atCaps('motion_brief', 'another brief')]);
  assert.deepEqual(full.statuses, [...Array(9).fill(200), 429], 'all 9 policy calls fit the hold; a 10th is outside the policy');
  assert.match(full.v.failure_reason, /the production policy allows 1 motion_brief call per job/);
  assert.equal(full.v.spend.bound_usd, policyHoldMicros() / 1e6, 'the path at its worst case is exactly the hold');
  const short = await runPath(policyHoldMicros() - 1);
  assert.deepEqual(short.statuses, [...Array(8).fill(200), 429], 'one micro-dollar less: the last review is refused before sending');
  assert.match(short.v.failure_reason, /could cost up to .* more than the .* left of this job's \$8\.96 hold/);
});

test('outside the production policy, refused before sending: a re-ask, a resend, an oversized call, an unknown tool', async t => {
  const { PRODUCTION_POLICY } = await import('./orchestrator.mjs');
  const brief = { max_tokens: 16000, tools: [{ name: 'motion_brief' }], messages: [{ role: 'user', content: 'brief' }] };
  for (const [name, bodies, want] of [
    ['re-ask', [{ ...brief, messages: [...brief.messages, { role: 'assistant', content: 'x' }, { role: 'user', content: 'again' }] }], /schema re-ask \(motion_brief\)/],
    ['resend', [{ ...brief, tools: [{ name: 'motion_storyboard' }] }, { ...brief, tools: [{ name: 'motion_storyboard' }] }], /resending the same motion_storyboard call/],
    ['oversized', [{ ...brief, max_tokens: 64000 }], /larger than the production policy allows/],
    ['unknown tool', [{ ...brief, tools: [{ name: 'web_search' }] }], /a web_search call is outside the production policy/],
  ]) {
    let sentCount = 0;
    const { req, view } = await start(t, { policy: PRODUCTION_POLICY, call: async () => { sentCount++; return reply(10); }, run: async ({ call }) => {
      for (const body of bodies) { const r = await call({}, body, MODEL); await r.text(); if (!r.ok) break; }
      return { status: 'failed', failure_reason: 'x' };
    } });
    const { job_id } = await (await req('/jobs', { method: 'POST', body: job() })).json();
    await until(async () => (await view(job_id)).status === 'failed', name);
    assert.equal(sentCount, bodies.length - 1, `${name}: the refused call was never sent`);
    assert.match((await view(job_id)).failure_reason, want, name);
  }
});

test('the canvas repository: the pinned nanoGPT is grounded on its source; one this process cannot read is refused before any call, unless a card is selected', async t => {
  const NANO = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
  const seen = [];
  const run = async args => { seen.push(args.source ? `${args.source.repository}@${args.source.commit.slice(0, 7)}` : 'no source'); return { status: 'needs_clarification', clarification: { question: 'x' } }; };
  const { req, view } = await start(t, { run, call: async () => assert.fail('no model call') });
  const go = async extra => { const { job_id } = await (await req('/jobs', { method: 'POST', body: job(extra) })).json(); await until(async () => (await view(job_id)).status !== 'running', 'done'); return view(job_id); };
  await go({ repository: { repo: 'karpathy/nanoGPT', commit: NANO } });
  const refused = await go({ repository: { repo: 'karpathy/minGPT', commit: 'b'.repeat(40) } });
  assert.equal(refused.status, 'failed');
  assert.match(refused.failure_reason, /^Motion cannot read this canvas's repository \(karpathy\/minGPT at bbbbbbb\) yet, so it would not be grounded in its code\. Nothing was spent/);
  assert.deepEqual([refused.spend.calls, refused.spend.cost_usd], [0, 0]);
  await go({ repository: { repo: 'karpathy/minGPT', commit: 'b'.repeat(40) }, context: { selection: { cardId: 'c1', kind: 'Explanation', title: 'Attention', text: 'Attention weighs tokens.' } } });
  assert.deepEqual(seen, ['karpathy/nanoGPT@3adf61e', 'no source'], 'the refused job never ran; with a card selected it runs on the card');
  for (const repository of [{ repo: 'nope', commit: NANO }, { repo: 'karpathy/nanoGPT', commit: 'main' }, { repo: 'karpathy/nanoGPT', commit: NANO, path: '/etc' }]) assert.notDeepEqual(validateJobRequest(job({ repository })), [], JSON.stringify(repository));
});

// Version skew (found by mact paid run 1: the dev renderer ran 9083840e contracts and rejected an ungrounded brief after the
// job had paid for its Author and repair): a renderer whose /health version is not this checkout's renderer code, in either
// line-ending form an image may carry, starts no job and spends nothing.
test('a renderer running other contract code starts no job; the hash is the render service own serviceVersion', async t => {
  const { RENDERER_FILES, rendererCodeHashes } = await import('./orchestrator.mjs');
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(new URL('./service/server.mjs', import.meta.url), 'utf8');
  const listed = server.match(/const files = \[\s*\.\.\.\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
  assert.deepEqual(RENDERER_FILES, listed, 'the same files serviceVersion() hashes');
  const [lf, crlf] = rendererCodeHashes();
  assert.match(lf, /^[0-9a-f]{12}$/); assert.notEqual(lf, crlf);
  let runs = 0;
  const run = async () => { runs++; return { status: 'needs_clarification', clarification: { question: 'x' } }; };
  for (const [version, status] of [[`motion-renderer-1-${lf}/remotion@4.0.521`, 202], [`motion-renderer-1-${crlf}/remotion@4.0.521+818cc4da4b7e`, 202], ['motion-renderer-1-ce71b04b9d0f/remotion@4.0.521+9083840ebacb', 503], [undefined, 503]]) {
    const { req } = await start(t, { run, rendererHashes: [lf, crlf], health: async () => ({ ...LINUX, version }) });
    const r = await req('/jobs', { method: 'POST', body: job() });
    assert.equal(r.status, status, String(version));
    if (status === 503) assert.match((await r.json()).detail, /runs other contract code .*nothing was started/);
  }
  await until(async () => runs === 2, 'the two matching jobs');
});

// Owner message 19: the renderer preflight. A missing or mismatched /health version is refused before any paid call (above);
// a matching version admits a no-source job, which the real resolver hands to the Director labelled no_source_supplied.
test('preflight: a matching renderer version admits a no-source job; the real resolver labels it ungrounded', async t => {
  const { rendererCodeHashes } = await import('./orchestrator.mjs');
  const { runMotionRequest } = await import('./pipeline.mjs');
  const [lf] = rendererCodeHashes();
  const handed = [];
  const director = async ({ grounding }) => { handed.push(grounding.grounding); return { status: 'needs_clarification', clarification: { question: 'stop here' }, calls: [] }; };
  const { req, view } = await start(t, { rendererHashes: rendererCodeHashes(), health: async () => ({ ...LINUX, version: `motion-renderer-1-${lf}/remotion@4.0.521` }), run: args => runMotionRequest({ ...args, stages: { director } }) });
  const r = await req('/jobs', { method: 'POST', body: job({ request: '/motion 15s explain photosynthesis', location: {} }) });
  assert.equal(r.status, 202);
  const { job_id } = await r.json();
  await until(async () => (await view(job_id)).status !== 'running', 'the job');
  assert.deepEqual(handed, [{ status: 'no_source_supplied' }]);
});

// Production before its model secret exists (owner message 22: the dedicated Anthropic workspace comes separately): the service
// runs, says it is not ready, and refuses every job before anything starts.
test('without its model credentials the orchestrator is not ready: /health says so and every job is refused, nothing started', async t => {
  let runs = 0;
  const { req } = await start(t, { missing: ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID'], run: async () => { runs++; return { status: 'ready' }; } });
  assert.deepEqual(await (await req('/health', { token: '' })).json(), { ok: true, active: false, boot: lastBoot, ready: false, missing: ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID'] });
  const r = await req('/jobs', { method: 'POST', body: job() });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'not_configured', detail: 'the Motion service is not configured yet (ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID); nothing was started' });
  assert.equal(runs, 0);
});

test('MOT-06 atomic admission: a resend of one key while renderer health is awaited answers the same job; another key is refused busy; one job runs', async t => {
  let runs = 0, healthy, release, arrived = 0;
  const gate = new Promise(r => { healthy = r; });
  const run = async () => { runs++; await new Promise(r => { release = r; }); return { status: 'ready' }; };
  const { req, o } = await start(t, { run, health: async () => { await gate; return LINUX; }, wrap: handle => (q, s) => { q.on('end', () => arrived++); handle(q, s); } });
  const one = job(), other = job();
  const posts = [req('/jobs', { method: 'POST', body: one })];
  await until(() => arrived === 1, 'the first submission read');
  posts.push(req('/jobs', { method: 'POST', body: one }), req('/jobs', { method: 'POST', body: other }));
  await until(() => arrived === 3, 'the resend and the other key read while health is awaited');
  healthy();
  const [a, b, c] = await Promise.all(posts.map(p => p.then(async r => [r.status, await r.json()])));
  assert.deepEqual([a[0], b[0], b[1].job_id], [202, 202, a[1].job_id], 'the overlapping resend answers the job its key started');
  assert.deepEqual([c[0], c[1].error], [429, 'busy'], 'a distinct key waits for the one global slot');
  assert.deepEqual([runs, o.jobs.size], [1, 1], 'one job, so one hold and one ceiling');
  release();
});

test('MOT-07 reconciliation by key: closing a key answers the job it started and starts nothing; a closed key can never start later', async t => {
  let runs = 0, release;
  const run = async () => { runs++; await new Promise(r => { release = r; }); return { status: 'ready' }; };
  const { req, o } = await start(t, { run });
  const close = key => req(`/keys/${key}/close`, { method: 'POST' }).then(async r => [r.status, await r.json()]);
  const started = job();
  const { job_id } = await (await req('/jobs', { method: 'POST', body: started })).json();
  assert.deepEqual(await close(started.idempotency_key), [200, { job_id, status: 'running', boot: o.boot }], 'the original job, with the run that holds it');
  const lost = job();
  assert.deepEqual(await close(lost.idempotency_key), [200, { job_id: null, closed: true, boot: o.boot }], 'never seen by this run: closed');
  release();
  await until(() => !o.active, 'the first job ends');
  const late = await req('/jobs', { method: 'POST', body: lost });
  assert.deepEqual([late.status, (await late.json()).error], [403, 'grant_refused'], 'the original submission arriving late starts nothing');
  assert.equal(runs, 1);
  assert.equal((await req('/keys/x/close', { method: 'POST' })).status, 404);
  assert.equal((await req(`/keys/${lost.idempotency_key}/close`, { method: 'POST', token: 'x'.repeat(40) })).status, 401);
});

test('MOT-08 cold start: a grant bound to the run that just booted starts exactly once; a replay to a later run after a genuine restart is refused', async t => {
  let runs = 0;
  const run = async () => { runs++; return { status: 'ready' }; };
  // An idle service boots for the worker's /health read, so its boot second is after the second the worker signs with.
  const cold = await start(t, { run, now: () => Date.now() + 5000 });
  const { boot } = await (await cold.req('/health', { token: '' })).json();
  assert.match(boot, /^[0-9a-f]{32}$/);
  const first = job({ boot });
  const a = await cold.req('/jobs', { method: 'POST', body: first });
  assert.equal(a.status, 202, 'the first legitimate request after an idle boot starts');
  const { job_id } = await a.json();
  assert.deepEqual(await (await cold.req('/jobs', { method: 'POST', body: first })).json(), { job_id, status: 'ready', duplicate: true }, 'and only once');
  assert.equal((await cold.req('/jobs', { method: 'POST', body: job({ boot }) })).status, 202, 'a warm start is unchanged');
  assert.equal(runs, 2);
  // A deploy or crash: a new run with a new boot. The interrupted job's grant, replayed to it, starts nothing.
  const restarted = await start(t, { run, now: () => Date.now() + 10000 });
  const replay = await restarted.req('/jobs', { method: 'POST', body: first });
  assert.equal(replay.status, 403);
  assert.match((await replay.json()).detail, /issued before the Motion service restarted; nothing was started/);
  assert.equal(runs, 2);
});
