// M7A development orchestrator (orchestrator.mjs): the routes the motion_request provider uses,
// one job at a time, Stop, the per-job call cap. The pipeline is doubled: no model, no render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { motionOrchestrator, validateJobRequest } from './orchestrator.mjs';

const TOKEN = 'o'.repeat(40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function start(t, { run, busy = false, call = async () => new Response('{}'), maxCalls } = {}) {
  const outDir = mkdtempSync(join(tmpdir(), 'motion-orch-'));
  const o = motionOrchestrator({ token: TOKEN, service: { health: async () => ({ busy }) }, call, outDir, run, ...(maxCalls ? { maxCalls } : {}) });
  const server = createServer(o.handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = 'GET', body, token = TOKEN } = {}) => fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { o, req, outDir };
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
