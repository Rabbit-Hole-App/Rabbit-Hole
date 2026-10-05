// M7A development orchestrator (orchestrator.mjs): the routes the motion_request provider uses,
// one job at a time, Stop, the per-job call cap. The pipeline is doubled: no model, no render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callEstimate, motionOrchestrator, responseCost, validateJobRequest } from './orchestrator.mjs';

const TOKEN = 'o'.repeat(40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start(t, { run, busy = false, call = async () => new Response('{}'), maxCalls, budgetUsd } = {}) {
  const outDir = mkdtempSync(join(tmpdir(), 'motion-orch-'));
  const o = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ busy }) }, call, outDir, run, ...(maxCalls ? { maxCalls } : {}), ...(budgetUsd ? { budgetUsd } : {}) });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body, token = TOKEN } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { o, req, outDir, server };
}
const MOTION = { request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } };

test('job requests: a /motion line and an optional concept, nothing else', () => {
  assert.deepEqual(validateJobRequest(MOTION), []);
  assert.deepEqual(validateJobRequest({ request: '/motion softmax' }), []);
  for (const bad of [{ request: 'explain softmax' }, { request: '/motion' }, { request: `/motion ${'x'.repeat(500)}` }, { ...MOTION, model: 'x' }, { ...MOTION, location: { concept: 'a', path: '/etc' } }, { ...MOTION, location: { concept: 'x'.repeat(101) } }, []]) assert.notDeepEqual(validateJobRequest(bad), [], JSON.stringify(bad).slice(0, 60));
});

test('auth, one job at a time, the render service must be idle, and the finished render is served once ready', async t => {
  let release;
  const run = async ({ dir, onStage }) => {
    onStage('directing');
    await new Promise(r => { release = r; });
    mkdirSync(join(dir, 'final'), { recursive: true });
    writeFileSync(join(dir, 'final', 'final.mp4'), Buffer.from('MP4BYTES'));
    return { status: 'ready', brief: { title: 'Softmax' }, block: { motion: { duration_seconds: 15 } }, render: { render_id: 'a'.repeat(32) }, job: { repair_count: 1 }, cost_usd: 1.2, timings: { total: 600 } };
  };
  const { req } = await start(t, { run });
  assert.equal((await req('/jobs', { method: 'POST', body: MOTION, token: 'x'.repeat(40) })).status, 401);
  assert.equal((await req('/jobs', { method: 'POST', body: { request: 'softmax' } })).status, 400);
  const created = await req('/jobs', { method: 'POST', body: MOTION });
  assert.equal(created.status, 202);
  const { job_id } = await created.json();
  assert.match(job_id, /^[0-9a-f]{32}$/);
  assert.equal((await req('/jobs', { method: 'POST', body: MOTION })).status, 429, 'one job at a time');
  assert.deepEqual(await (await req(`/jobs/${job_id}`)).json().then(v => [v.status, v.stage]), ['running', 'directing']);
  assert.equal((await req(`/jobs/${job_id}/final.mp4`)).status, 409);
  release();
  await sleep(20);
  const done = await (await req(`/jobs/${job_id}`)).json();
  assert.deepEqual([done.status, done.title, done.render_id, done.repair_count, done.cost_usd, done.motion.duration_seconds], ['ready', 'Softmax', 'a'.repeat(32), 1, 1.2, 15]);
  const mp4 = await req(`/jobs/${job_id}/final.mp4`);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await mp4.arrayBuffer()).toString(), 'MP4BYTES');
  for (const path of ['/jobs/../etc', `/jobs/${job_id.toUpperCase()}`, `/jobs/${job_id}/job.json`, `/jobs/${'b'.repeat(32)}`]) assert.equal((await req(path)).status, 404, path);
  const busy = await start(t, { run, busy: true });
  assert.equal((await busy.req('/jobs', { method: 'POST', body: MOTION })).status, 429, 'a render still finishing blocks a new job');
});

test('Stop aborts the job: an in-flight model call is abandoned, nothing new starts, the slot frees', async t => {
  let calls = 0;
  const run = async ({ call, signal }) => {
    try { await call({}, {}, 'm'); calls++; await call({}, {}, 'm'); calls++; return { status: 'ready' }; }
    catch (error) { return { status: error.name === 'MotionCancelled' && signal.aborted ? 'cancelled' : 'failed', failure_reason: 'stopped during directing' }; }
  };
  const never = () => new Promise(() => {}); // a model call that would run for minutes
  const { req } = await start(t, { run, call: never });
  const { job_id } = await (await req('/jobs', { method: 'POST', body: MOTION })).json();
  const stop = await req(`/jobs/${job_id}/cancel`, { method: 'POST' });
  assert.deepEqual([stop.status, (await stop.json()).status], [202, 'stopping']);
  await sleep(20);
  const v = await (await req(`/jobs/${job_id}`)).json();
  assert.deepEqual([v.status, v.failure_reason, calls], ['cancelled', 'stopped during directing', 0]);
  assert.equal((await req('/jobs', { method: 'POST', body: MOTION })).status, 202, 'the slot is free again');
});

test('every job has a hard cap on paid calls, re-asks included', async t => {
  let seen = [];
  const run = async ({ call }) => { for (let i = 0; i < 4; i++) seen.push((await call({}, {}, 'm')).status); return { status: 'failed', failure_reason: 'cap' }; };
  const { req } = await start(t, { run, maxCalls: 2, call: async () => new Response('{}', { status: 200 }) });
  await req('/jobs', { method: 'POST', body: MOTION });
  await sleep(20);
  assert.deepEqual(seen, [200, 200, 429, 429]);
});

// M7A owner budget ($2.50 for the last two automatic runs): a ceiling over every job together.
test('the spend ceiling: real cost read from each response (JSON or stream), and a call refused when it could pass the ceiling', async t => {
  const usage = { input_tokens: 10000, output_tokens: 5000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  assert.equal(await responseCost(new Response(JSON.stringify({ usage })), 'claude-opus-5-5'), (10000 * 4 + 5000 * 20) / 1e6);
  const sse = ['event: message_start', `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10000, output_tokens: 1 } } })}`, '', 'event: message_delta', `data: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 30000 } })}`, ''].join('\n');
  assert.equal(await responseCost(new Response(sse), 'claude-opus-5-5'), (10000 * 4 + 30000 * 20) / 1e6);
  assert.equal(await responseCost(new Response('not json'), 'claude-opus-5-5'), null);
  assert.deepEqual([callEstimate({ max_tokens: 64000 }), callEstimate({ max_tokens: 16000 })], [0.7, 0.2]);

  const seen = [];
  const reply = () => new Response(JSON.stringify({ usage: { input_tokens: 0, output_tokens: 25000 } })); // $0.50 each
  const run = async ({ call }) => { for (const max of [16000, 16000, 64000, 16000]) { const r = await call({}, { max_tokens: max }, 'claude-opus-5-5'); seen.push(r.status); await r.text(); await sleep(5); } return { status: 'failed', failure_reason: 'x' }; };
  const { o, req } = await start(t, { run, call: async () => reply(), budgetUsd: 1.6 });
  await req('/jobs', { method: 'POST', body: MOTION });
  await sleep(60);
  // $0.50 + $0.50 spent; the Author call (estimate $0.70) would pass $1.60 and is refused; a $0.20 call still fits.
  assert.deepEqual(seen, [200, 200, 429, 200]);
  assert.equal(+o.budget.spent_usd.toFixed(2), 1.5);
});
