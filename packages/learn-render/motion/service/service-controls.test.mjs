// The render service's job controls: idempotent submits keyed by a stable render-job id (same id never starts a second render, in any
// state, across a restart over the same store), explicit cancel, the per-job deadline (off by default) and the configuration each
// record states. The child is stub-child.mjs (the same job-directory protocol, no rendering); nothing here renders or spends.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LIMITS, canonical, deadlineFromEnv, deadlineSeconds, jobStoreStatus, motionRenderService } from './server.mjs';
import { resolveLimits } from './resource-control.mjs';
import { POLLING, runOnService } from '../render-job.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TOKEN = 't'.repeat(40);
const fixture = f => readFileSync(join(HERE, '..', 'fixtures', 'demo-a', f), 'utf8');
const job = () => ({ schema: 'motion-render/1', renderer: 'remotion', brief: JSON.parse(fixture('brief.json')), storyboard: JSON.parse(fixture('storyboard.json')), composition: { composition_id: 'demo-a1', source: fixture('composition.jsx') } });
const otherJob = () => { const j = job(); j.composition.composition_id = 'demo-a2'; return j; };
const auth = { authorization: `Bearer ${TOKEN}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const tmp = (t, prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

async function start(t, mode, options = {}) {
  const jobsDir = tmp(t, 'motion-ctl-jobs-');
  const svc = motionRenderService({ token: TOKEN, sandbox: 'none', jobsDir, childScript: join(HERE, 'stub-child.mjs'), childArgs: [mode], ...options });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const call = (path, { headers = auth, ...init } = {}) => fetch(base + path, { headers, ...init });
  const post = (body, key, headers = auth) => call('/render', { method: 'POST', headers: { ...headers, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const until = async (id, done = r => r.status !== 'rendering', ms = 20000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) { const r = await (await call(`/render/${id}`)).json(); if (done(r)) return r; }
    throw new Error(`render ${id} did not finish`);
  };
  const health = async () => (await call('/health', { headers: {} })).json();
  return { svc, jobsDir, call, post, until, health };
}
const pidsOf = async (jobsDir, id) => { for (let i = 0; i < 100; i++, await sleep(50)) { const f = join(jobsDir, id, 'out', 'pids.json'); if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')); } throw new Error('the child did not start'); };

// ---- configuration the receipts record ----

test('health and every record state the configuration they ran under: revision, CPU, memory, timeout, deadline setting', async t => {
  const { post, until, health } = await start(t, 'ready', { revision: 'abc123def4567' });
  const h = await health();
  assert.deepEqual(h.settings, { git_revision: 'abc123def4567', sandbox: 'none', cpus: 1.5, memory_gib: 3, cpu_period_us: 100000, pids_max: 1024, timeout_seconds: 420, deadline_formula: { enabled: false } });
  assert.match(h.boot_id, /^[0-9a-f]{16}$/);
  assert.deepEqual(h.counters, { posts: 0, started: 0, replayed: 0 });
  const { render_id } = await (await post(job())).json();
  const r = await until(render_id);
  assert.deepEqual(r.settings, h.settings);
  assert.equal(r.deadline_seconds, 420);
  assert.equal(r.boot_id, h.boot_id);
  assert.deepEqual((await health()).counters, { posts: 1, started: 1, replayed: 0 });
});

test('overridden limits are stated, and written to the job directory for the launcher only when overridden', async t => {
  const big = resolveLimits({ cpus: 3.5, memoryGiB: 12 });
  const { post, health, jobsDir } = await start(t, 'sleep', { limits: big });
  assert.deepEqual({ cpus: (await health()).settings.cpus, memory_gib: (await health()).settings.memory_gib }, { cpus: 3.5, memory_gib: 12 });
  const { render_id } = await (await post(job())).json();
  assert.deepEqual(JSON.parse(readFileSync(join(jobsDir, render_id, 'limits.json'), 'utf8')), { cpus: 3.5, memory_gib: 12 });
  const plain = await start(t, 'sleep');
  const again = await (await plain.post(job())).json();
  assert.equal(existsSync(join(plain.jobsDir, again.render_id, 'limits.json')), false);
  assert.equal(existsSync(join(plain.jobsDir, again.render_id, 'deadline_s')), false);
});

// ---- per-job deadline: provisional, off by default ----

test('deadline formula: ceil(margin x (fixed + per_second x duration)), floor 420, cap max_s; off unless MOTION_DEADLINE_FORMULA=1', () => {
  const d = { fixed_s: 40, per_second_s: 8, margin: 1.3, max_s: 900 };
  assert.equal(deadlineSeconds(5, d), 420); // 1.3 x 80 = 104, never below the flat 420
  assert.equal(deadlineSeconds(30, d), 420); // 1.3 x 280 = 364
  assert.equal(deadlineSeconds(45, d), 520); // 1.3 x 400
  assert.equal(deadlineSeconds(60, d), 676); // 1.3 x 520
  assert.equal(deadlineSeconds(60, { ...d, max_s: 600 }), 600);
  assert.equal(deadlineFromEnv({}), null);
  assert.equal(deadlineFromEnv({ MOTION_DEADLINE_FIXED_S: '40', MOTION_DEADLINE_PER_SECOND_S: '8' }), null);
  assert.deepEqual(deadlineFromEnv({ MOTION_DEADLINE_FORMULA: '1', MOTION_DEADLINE_FIXED_S: '40', MOTION_DEADLINE_PER_SECOND_S: '8' }), { fixed_s: 40, per_second_s: 8, margin: 1.3, max_s: 600 });
  assert.throws(() => deadlineFromEnv({ MOTION_DEADLINE_FORMULA: '1' }), /needs MOTION_DEADLINE_FIXED_S/);
  assert.throws(() => deadlineFromEnv({ MOTION_DEADLINE_FORMULA: '1', MOTION_DEADLINE_FIXED_S: 'x', MOTION_DEADLINE_PER_SECOND_S: '8' }), /MOTION_DEADLINE_FIXED_S/);
  for (const bad of [{ MOTION_DEADLINE_MAX_S: '1000' }, { MOTION_DEADLINE_MAX_S: '300' }, { MOTION_DEADLINE_MARGIN: '0.9' }]) assert.throws(() => deadlineFromEnv({ MOTION_DEADLINE_FORMULA: '1', MOTION_DEADLINE_FIXED_S: '40', MOTION_DEADLINE_PER_SECOND_S: '8', ...bad }), /MOTION_DEADLINE_(MAX_S|MARGIN)/);
});

test('the default deployment is the flat 420 s for every duration; the formula, when on, sets the record, the launcher file and the timeout', async t => {
  const flat = await start(t, 'sleep');
  assert.equal((await (await flat.call(`/render/${(await (await flat.post(job())).json()).render_id}`)).json()).deadline_seconds, 420);
  const formula = await start(t, 'sleep', { deadline: { fixed_s: 40, per_second_s: 8, margin: 1.3, max_s: 600 } });
  const accepted = await (await formula.post(job())).json(); // demo-a is 15 s: 1.3 x 160 = 208, floored to 420
  assert.equal(accepted.deadline_seconds, 420);
  assert.equal(existsSync(join(formula.jobsDir, accepted.render_id, 'deadline_s')), false);
  assert.equal((await formula.health()).settings.deadline_formula.enabled, true);
  // A long job: the launcher is told the limit (the backstop is limit + 5 s) and the record states it.
  const long = await start(t, 'sleep', { deadline: { fixed_s: 40, per_second_s: 30, margin: 1.3, max_s: 600 } });
  const second = await (await long.post(job())).json(); // 1.3 x (40 + 450) = 637, capped to 600
  assert.equal(second.deadline_seconds, 600);
  assert.equal(readFileSync(join(long.jobsDir, second.render_id, 'deadline_s'), 'utf8'), '600');
  // MOTION_TIMEOUT_MS still only shortens.
  const short = await start(t, 'sleep', { deadline: { fixed_s: 40, per_second_s: 30, margin: 1.3, max_s: 600 }, shortenMs: 90000 });
  assert.equal((await (await short.post(job())).json()).deadline_seconds, 90);
});

test('a deadline stops the job: the whole tree is killed, the status says timeout with the limit used, the slot is free', async t => {
  const { post, until, jobsDir } = await start(t, 'tree', { timeoutMs: 1200 });
  const { render_id } = await (await post(job())).json();
  const pids = await pidsOf(jobsDir, render_id);
  const r = await until(render_id);
  assert.deepEqual([r.status, r.error], ['failed', 'timeout']);
  assert.match(r.detail, /exceeded 1\.2s/);
  await sleep(300);
  for (const pid of pids) assert.equal(alive(pid), false, `pid ${pid} survived the deadline`);
  assert.equal((await post(job())).status, 202); // the single render slot is free again
});

test('deadline orderings hold: service limit < launcher backstop < the caller\'s poll give-up, and a longer deployed deadline stretches the give-up', async () => {
  const launcher = readFileSync(join(HERE, 'motion-sandbox'), 'utf8');
  const backstop = Number(launcher.match(/^LIMIT=(\d+)$/m)[1]) + Number(launcher.match(/\(\(LIMIT \+ (\d+)\)\)s/)[1]);
  assert.ok(LIMITS.timeout_seconds < backstop && backstop < POLLING.waitMs / 1000, `${LIMITS.timeout_seconds} < ${backstop} < ${POLLING.waitMs / 1000}`);
  // The caller polls a render whose deployment says 600 s for at least 660 s, then stops it on the service.
  let clock = 0, cancelled = 0, polls = 0;
  const service = {
    submit: async () => new Response(JSON.stringify({ render_id: 'r1', deadline_seconds: 600 }), { status: 202 }),
    status: async () => { polls++; return { status: 'rendering' }; },
    cancel: async () => { cancelled++; return new Response('{}'); },
  };
  const run = await runOnService(service, { stage: 'final' }, { pollMs: 10000, waitMs: POLLING.waitMs, sleep: async ms => { clock += ms; }, now: () => clock, jobId: 'job-1' });
  assert.equal(run.failure[0], 'timeout');
  assert.ok(clock > 660000 && clock <= 680000, String(clock));
  assert.equal(cancelled, 1);
  clock = 0;
  const flat = await runOnService({ ...service, submit: async () => new Response(JSON.stringify({ render_id: 'r2' }), { status: 202 }) }, { stage: 'final' }, { pollMs: 10000, waitMs: POLLING.waitMs, sleep: async ms => { clock += ms; }, now: () => clock });
  assert.equal(flat.failure[0], 'timeout');
  assert.ok(clock > 480000 && clock <= 490000, String(clock));
});

// ---- cancel ----

test('cancel: DELETE kills the render\'s whole process tree and frees the single slot; a finished render is left alone', async t => {
  const { post, call, until, jobsDir } = await start(t, 'tree');
  const { render_id } = await (await post(job())).json();
  const pids = await pidsOf(jobsDir, render_id);
  assert.equal(pids.length, 2);
  assert.equal((await post(otherJob())).status, 429); // the slot is held
  assert.equal((await call(`/render/${render_id}`, { method: 'DELETE', headers: {} })).status, 401);
  const stopped = await call(`/render/${render_id}`, { method: 'DELETE' });
  assert.equal(stopped.status, 202);
  assert.equal((await stopped.json()).status, 'cancelling');
  const r = await until(render_id);
  assert.deepEqual([r.status, r.error], ['failed', 'cancelled']);
  await sleep(300);
  for (const pid of pids) assert.equal(alive(pid), false, `pid ${pid} survived the cancel`);
  assert.deepEqual(readdirSync(jobsDir).filter(d => d === render_id), []); // its directory is gone
  const next = await post(otherJob());
  assert.equal(next.status, 202); // slot free, no restart needed
  const again = await call(`/render/${render_id}`, { method: 'DELETE' });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).error, 'cancelled');
  assert.equal((await call(`/render/${'0'.repeat(32)}`, { method: 'DELETE' })).status, 404);
  assert.equal((await call(`/render/${render_id}/artifacts/final.mp4`, { method: 'DELETE' })).status, 404);
});

// ---- idempotent submit ----

test('same job id twice while it runs: the same render, no second child, no 429, GET polling starts nothing', async t => {
  const { post, call, health, jobsDir } = await start(t, 'sleep');
  const first = await post(job(), 'job-A');
  assert.equal(first.status, 202);
  const { render_id } = await first.json();
  const again = await post(job(), 'job-A');
  assert.equal(again.status, 202); // not 429: it is the same job
  const body = await again.json();
  assert.deepEqual([body.render_id, body.status, body.replayed], [render_id, 'rendering', true]);
  for (let i = 0; i < 20; i++) await call(`/render/${render_id}`); // polling and reconnecting
  assert.equal(readdirSync(jobsDir).length, 1);
  assert.deepEqual((await health()).counters, { posts: 2, started: 1, replayed: 1 });
});

test('same job id after it is done: the same render, its status, still no second render; formatting of the JSON does not matter', async t => {
  const { post, call, until, health } = await start(t, 'ready');
  const { render_id } = await (await post(job(), 'job-B')).json();
  assert.equal((await until(render_id)).status, 'ready');
  const body = await (await post(job(), 'job-B')).json();
  assert.deepEqual([body.render_id, body.status, body.replayed], [render_id, 'ready', true]);
  const reformatted = JSON.stringify(job(), null, 4); // pretty-printed, same job
  assert.equal((await (await post(reformatted, 'job-B')).json()).render_id, render_id);
  assert.equal((await call(`/render/${render_id}/artifacts/final.mp4`)).status, 200);
  assert.deepEqual((await health()).counters, { posts: 3, started: 1, replayed: 2 });
});

test('the 429 busy path: another job while one runs is refused and NOT remembered; its id starts normally once the slot is free', async t => {
  const { post, call, until, health } = await start(t, 'tree');
  const a = await (await post(job(), 'job-1')).json();
  const busy = await post(otherJob(), 'job-2');
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).render_id, a.render_id);
  assert.equal((await health()).counters.started, 1);
  assert.equal((await call(`/render/by-key/job-2`)).status, 404); // never accepted
  await call(`/render/${a.render_id}`, { method: 'DELETE' });
  await until(a.render_id);
  const b = await post(otherJob(), 'job-2');
  assert.equal(b.status, 202);
  assert.equal((await b.json()).replayed, undefined); // a fresh start, not a replay
});

test('the same job id with DIFFERENT inputs is refused with a stable code and starts or returns nothing', async t => {
  const { post, health, jobsDir } = await start(t, 'sleep');
  const { render_id } = await (await post(job(), 'job-C')).json();
  const res = await post(otherJob(), 'job-C');
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, 'idempotency_conflict');
  assert.equal(JSON.stringify(body).includes('replayed'), false);
  assert.equal((await health()).counters.started, 1);
  assert.equal(readdirSync(jobsDir).length, 1);
  assert.equal(render_id, body.render_id); // names the job it conflicts with, returns none of its data
  for (const key of ['', 'a b', 'x'.repeat(129), 'new/line']) assert.equal((await post(job(), key || 'bad key!')).status, 400);
});

// ---- durable acceptance and restart ----

const hashOf = body => createHash('sha256').update(canonical(body)).digest('hex');

test('restart: a job accepted before the crash is UNKNOWN afterwards, reported as such and never started again', async t => {
  const store = tmp(t, 'motion-store-');
  const one = await start(t, 'sleep', { storeDir: store });
  const { render_id } = await (await one.post(job(), 'job-R')).json();
  await pidsOf(one.jobsDir, render_id); // computing now
  const file = readdirSync(store).filter(f => f.endsWith('.json'));
  assert.equal(file.length, 1);
  assert.equal(JSON.parse(readFileSync(join(store, file[0]), 'utf8')).state, 'accepted');
  const crashed = tmp(t, 'motion-store-crash-');
  cpSync(store, crashed, { recursive: true }); // what is on disk at the moment of the crash, mid-compute
  one.svc.stop();
  const two = await start(t, 'sleep', { storeDir: crashed });
  const again = await two.post(job(), 'job-R');
  assert.equal(again.status, 410);
  const body = await again.json();
  assert.deepEqual([body.error, body.state, body.render_id], ['unknown_outcome', 'unknown', render_id]);
  assert.deepEqual([two.svc.renders.size, two.svc.state.active, readdirSync(two.jobsDir).length], [0, null, 0]); // no render started
  assert.deepEqual((await two.health()).counters, { posts: 1, started: 0, replayed: 0 });
  const found = await (await two.call('/render/by-key/job-R')).json();
  assert.deepEqual([found.status, found.live, found.durable, found.input_sha256], ['unknown', false, true, hashOf(job())]);
  assert.equal(JSON.parse(readFileSync(join(crashed, file[0]), 'utf8')).state, 'unknown'); // the verdict is persisted too
  assert.equal((await two.post(job(), 'job-R')).status, 410); // still, on every repeat
  assert.equal((await two.post(job(), 'job-R-new')).status, 202); // an explicit new job id is how a new render starts
});

test('restart: a job accepted but killed before any compute started is also unknown, not a second render', async t => {
  const store = tmp(t, 'motion-store-pre-');
  writeFileSync(join(store, 'accepted.json'), JSON.stringify({ key: 'job-P', render_id: 'a'.repeat(32), hash: hashOf(job()), state: 'accepted', error: null }));
  const svc = await start(t, 'sleep', { storeDir: store });
  const res = await svc.post(job(), 'job-P');
  assert.equal(res.status, 410);
  assert.equal((await res.json()).error, 'unknown_outcome');
  assert.equal(svc.svc.renders.size, 0);
  assert.equal(readdirSync(svc.jobsDir).length, 0);
});

test('restart: acceptance is on disk BEFORE the child starts computing', async t => {
  const store = tmp(t, 'motion-store-order-');
  const probe = join(tmp(t, 'motion-child-'), 'saw.txt');
  const child = join(tmp(t, 'motion-child-script-'), 'child.mjs');
  writeFileSync(child, `import { readdirSync, readFileSync, writeFileSync } from 'node:fs';\nconst files = readdirSync(${JSON.stringify(store)}).filter(f => f.endsWith('.json'));\nwriteFileSync(${JSON.stringify(probe)}, files.map(f => JSON.parse(readFileSync(${JSON.stringify(store)} + '/' + f, 'utf8')).state).join(','));\nsetInterval(() => {}, 1000);\n`);
  const svc = await start(t, 'x', { storeDir: store, childScript: child, childArgs: [] });
  const { render_id } = await (await svc.post(job(), 'job-O')).json();
  for (let i = 0; i < 100 && !existsSync(probe); i++) await sleep(50);
  assert.equal(readFileSync(probe, 'utf8'), 'accepted'); // the child found its own acceptance already durable
  await svc.call(`/render/${render_id}`, { method: 'DELETE' });
});

test('restart: the same id with different inputs is a conflict (409), not unknown and not a new render; a finished job reports its state', async t => {
  const store = tmp(t, 'motion-store-done-');
  const one = await start(t, 'ready', { storeDir: store });
  const { render_id } = await (await one.post(job(), 'job-D')).json();
  assert.equal((await one.until(render_id)).status, 'ready');
  assert.equal(JSON.parse(readFileSync(join(store, readdirSync(store)[0]), 'utf8')).state, 'ready');
  one.svc.stop();
  const two = await start(t, 'ready', { storeDir: store });
  const conflict = await two.post(otherJob(), 'job-D');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'idempotency_conflict');
  const gone = await two.post(job(), 'job-D');
  assert.equal(gone.status, 410);
  const body = await gone.json();
  assert.deepEqual([body.error, body.state], ['expired', 'ready']); // finished, but its artifacts did not survive: nothing re-rendered
  assert.equal((await two.health()).counters.started, 0);
});

test('WITHOUT a durable store (this Fly app has no volume) nothing survives a restart: the service reports the job unknown and a repeat starts anew', async t => {
  const one = await start(t, 'sleep');
  await one.post(job(), 'job-V');
  one.svc.stop();
  const two = await start(t, 'sleep'); // a restarted machine: memory only, nothing on disk
  const lookup = await two.call('/render/by-key/job-V');
  assert.equal(lookup.status, 404);
  assert.equal((await lookup.json()).error, 'unknown_job');
  assert.equal((await two.post(job(), 'job-V')).status, 202); // this is the gap: the caller must hold the id -> input hash record and look up first
  assert.equal((await two.health()).counters.started, 1);
});

test('acceptance that cannot be made durable refuses the job: nothing runs unrecorded', async t => {
  const store = tmp(t, 'motion-store-bad-');
  const svc = await start(t, 'sleep', { storeDir: store });
  rmSync(store, { recursive: true, force: true });
  writeFileSync(store, 'now a file'); // the store directory can no longer be written
  const res = await svc.post(job(), 'job-X');
  assert.equal(res.status, 500);
  assert.equal(svc.svc.state.active, null);
  assert.equal(svc.svc.renders.size, 0);
  assert.equal(readdirSync(svc.jobsDir).length, 0);
  assert.equal((await svc.health()).counters.started, 0);
});

// ---- the dev job store must be a real, writable mount (MOTION_JOB_STORE_REQUIRE_MOUNT) ----

// A file system whose store directory is on device 2 (a volume) and everything else, root included, on device 1; `broken` fails the probe write.
const volumeFs = (dir, { broken = false } = {}) => ({ ...realFs, statSync: (p, ...a) => (p === dir ? { ...realFs.statSync(p, ...a), dev: 2 } : p === '/' ? { dev: 1 } : realFs.statSync(p, ...a)),
  ...(broken ? { openSync: p => { if (String(p).includes('.probe-')) throw Object.assign(new Error('EROFS'), { code: 'EROFS' }); return realFs.openSync(p); } } : {}) });

test('jobStoreStatus: mounted only on another device than root; writable only when the probe writes; records counted; a missing directory is neither', t => {
  const dir = tmp(t, 'motion-store-status-');
  writeFileSync(join(dir, 'a.json'), '{}');
  assert.deepEqual(jobStoreStatus(dir, { fs: volumeFs(dir) }), { dir, mounted: true, writable: true, records: 1 });
  assert.deepEqual(jobStoreStatus(dir, { fs: { ...realFs, statSync: () => ({ dev: 1 }) } }), { dir, mounted: false, writable: true, records: 1 }); // the image's own disk
  assert.deepEqual(jobStoreStatus(dir, { fs: volumeFs(dir, { broken: true }) }), { dir, mounted: true, writable: false, records: 1 });
  const none = join(dir, 'missing');
  assert.deepEqual(jobStoreStatus(none), { dir: none, mounted: false, writable: false, records: 0 });
  assert.deepEqual(readdirSync(dir), ['a.json'], 'the probe file is removed');
});

test('a required job store that is not a separate mount refuses every new job (503 job_store_not_mounted) and says so in /health; nothing starts', async t => {
  const store = tmp(t, 'motion-store-unmounted-');
  const svc = await start(t, 'sleep', { storeDir: store, requireMount: true, storeFs: { ...realFs, statSync: () => ({ dev: 1 }) } });
  const h = (await svc.health()).job_store;
  assert.deepEqual([h.dir, h.mounted, h.writable, h.required, h.accepting, h.refusing], [store, false, true, true, false, 'job_store_not_mounted']);
  for (const key of ['job-M', undefined]) {
    const res = await svc.post(job(), key);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'job_store_not_mounted');
  }
  assert.deepEqual([svc.svc.renders.size, svc.svc.state.active, readdirSync(svc.jobsDir).length, readdirSync(store).length], [0, null, 0, 0]);
  assert.equal((await svc.health()).counters.started, 0);
  // No store configured at all while one is required: the same refusal.
  const bare = await start(t, 'sleep', { requireMount: true });
  assert.equal((await bare.post(job(), 'job-N')).status, 503);
  assert.equal((await bare.health()).job_store.dir, null);
});

test('a required job store that is mounted but unwritable refuses with job_store_unwritable', async t => {
  const store = tmp(t, 'motion-store-ro-');
  const svc = await start(t, 'sleep', { storeDir: store, requireMount: true, storeFs: volumeFs(store, { broken: true }) });
  const res = await svc.post(job(), 'job-W');
  assert.deepEqual([res.status, (await res.json()).error], [503, 'job_store_unwritable']);
  assert.equal(svc.svc.renders.size, 0);
});

test('a required job store that is a writable mount accepts; /health and the record carry job_store; a redeploy (new boot_id) keeps records, answers 410 for the unfinished and 409 for other input', async t => {
  const store = tmp(t, 'motion-store-mounted-');
  const storeFs = volumeFs(store);
  const one = await start(t, 'ready', { storeDir: store, requireMount: true, storeFs });
  const { render_id } = await (await one.post(job(), 'job-F')).json();
  const done = await one.until(render_id);
  assert.deepEqual([done.status, done.job_store.mounted, done.job_store.boot_id], ['ready', true, done.boot_id]);
  const h1 = (await one.health()).job_store;
  assert.deepEqual([h1.mounted, h1.writable, h1.records, h1.accepting, h1.boot_id], [true, true, 1, true, done.boot_id]);
  // An accepted job whose outcome was never written (the machine died mid-compute), beside the finished one.
  writeFileSync(join(store, `${createHash('sha256').update('job-U').digest('hex').slice(0, 32)}.json`), JSON.stringify({ key: 'job-U', render_id: 'b'.repeat(32), hash: hashOf(otherJob()), state: 'accepted', error: null }));
  one.svc.stop();
  const two = await start(t, 'ready', { storeDir: store, requireMount: true, storeFs });
  const h2 = (await two.health()).job_store;
  assert.notEqual(h2.boot_id, h1.boot_id);
  assert.deepEqual([h2.mounted, h2.records, h2.accepting], [true, 2, true]);
  const found = await (await two.call('/render/by-key/job-F')).json();
  assert.deepEqual([found.status, found.render_id, found.durable, found.input_sha256, found.job_store.boot_id], ['ready', render_id, true, hashOf(job()), h2.boot_id]);
  assert.equal((await two.post(otherJob(), 'job-F')).status, 409);
  const unknown = await two.post(otherJob(), 'job-U');
  assert.deepEqual([unknown.status, (await unknown.json()).error], [410, 'unknown_outcome']);
  assert.deepEqual([(await two.health()).counters.started, two.svc.state.active], [0, null]); // nothing restarted
});
