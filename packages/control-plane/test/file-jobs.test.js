// The durable file-job runner (src/file-jobs.js): submit, the alarm step, converter callbacks, cancel, retry and the
// status read, against node:sqlite with the contract's tables and a scripted fake converter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileJobsRoute, stepJob, FileJobs, LIMITS, callbackToken } from '../src/file-jobs.js';
import { memoryBucket } from './live-storage-spy.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SOURCE_BYTES = new TextEncoder().encode('PK fake pptx bytes');
const SOURCE = 'fs_' + 'a'.repeat(24), T0 = 1_800_000_000_000;

function fixture(t, { concurrency = 2 } = {}) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('./file-jobs-standin.sql', import.meta.url), 'utf8'));
  sqlite.prepare("INSERT INTO learn_boards(id, org, owner_email, app, board, state_json, shared, view_token, updated_at) VALUES('7', 'team', 'owner@test', 'repo-x', 'main', ?, 1, ?, datetime('now'))")
    .run(JSON.stringify({ blocks: [] }), 'v'.repeat(24));
  sqlite.prepare("INSERT INTO file_sources(id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status) VALUES(?, 'team', 'owner@test', 'repo-x', '7', 'presentation', 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ?, ?, ?, 'stored')")
    .run(SOURCE, SOURCE_BYTES.byteLength, sha(SOURCE_BYTES), `file-sources/${SOURCE}/original`);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const bucket = memoryBucket();
  bucket.objects.set(`file-sources/${SOURCE}/original`, { bytes: SOURCE_BYTES, httpMetadata: {}, customMetadata: {} });
  const failNext = new Set();
  const put = bucket.put;
  bucket.put = async (key, value, options) => { for (const p of failNext) if (key.startsWith(p)) { failNext.delete(p); throw new Error('isolate killed mid-write'); } return put(key, value, options); };
  // The fake converter: records every service call; `answer` decides POST /jobs.
  const calls = [], converter = { answer: () => new Response(JSON.stringify({ state: 'accepted' }), { status: 202 }) };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(url); assert.equal(u.origin, 'https://convert.test');
    assert.equal(init.headers.Authorization, 'Bearer ' + 'c'.repeat(40));
    const body = init.body ? JSON.parse(init.body) : null; calls.push({ path: u.pathname, body });
    return u.pathname === '/jobs' ? converter.answer(body) : Response.json({ state: 'cancelled' });
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const objects = new Map(), alarms = new Map();
  const memoFor = id => { if (!objects.has(id)) { const data = new Map(); objects.set(id, { data, get: async k => data.get(k), put: async (k, v) => data.set(k, v), deleteAll: async () => data.clear(), getAlarm: async () => alarms.get(id) ?? null, setAlarm: async at => alarms.set(id, at) }); } return objects.get(id); };
  const env = {
    LEARN_DB: db, LEARN_MEDIA: bucket, CONVERT_URL: 'https://convert.test', CONVERT_TOKEN: 'c'.repeat(40), FILE_JOB_SECRET: 's'.repeat(40),
    FILE_JOB_ORIGIN: 'https://app.test', FILE_JOB_CONCURRENCY: String(concurrency),
    CONTROL_PLANE: { fetch: async req => req.headers.get('x-email') === 'none' ? new Response('', { status: 401 }) : Response.json({ org: 'team', email: req.headers.get('x-email') || 'owner@test', apps: [] }) },
    FILE_JOBS: { idFromName: n => n, get: id => ({ fetch: async (url, init) => new FileJobs({ storage: memoFor(id) }, env).fetch(new Request(url, init)) }) },
  };
  const send = (path, { method = 'GET', body, headers = {}, now = T0 } = {}) => fileJobsRoute(new URL(path, 'https://app.test').pathname, new Request(`https://app.test${path}`, { method, headers,
    ...(body !== undefined ? { body: body instanceof Uint8Array || typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env, now);
  const submit = (extra = {}, opts = {}) => send(`/api/learn/files/${SOURCE}/jobs`, { method: 'POST', body: { converter: 'slides', options: {}, card: 'card-1', app: 'repo-x', idempotency_key: 'import:card-1:slides', ...extra }, ...opts });
  const step = (id, now) => stepJob(env, id, memoFor(id), now);
  const job = id => sqlite.prepare('SELECT * FROM file_jobs WHERE id = ?').get(id);
  const auth = async (id, attempt, now = T0) => ({ Authorization: `Bearer ${(await callbackToken(env, id, attempt, now)).token}` });
  const cb = async (id, attempt, action, body, { now = T0, mintAt = now, tokenAttempt = attempt, headers = {} } = {}) => send(`/api/learn/files/jobs/${id}/attempts/${attempt}/${action}`,
    { method: action.startsWith('outputs/') ? 'PUT' : 'POST', body, now, headers: { ...(await auth(id, tokenAttempt, mintAt)), ...headers } });
  const output = async (id, attempt, name, bytes, opts = {}) => cb(id, attempt, `outputs/${name}`, bytes, { ...opts, headers: { 'Content-Length': String(bytes.byteLength), 'X-Content-SHA256': sha(bytes), ...(opts.headers || {}) } });
  const PDF = new TextEncoder().encode('%PDF-1.7 slides'), PNG = new TextEncoder().encode('\x89PNG slide one');
  const manifest = (id, attempt, extra = {}) => ({ schema: 'file-convert-result/1', job_id: id, attempt, converter: 'slides', converter_version: 'slides/1+libreoffice-25.2.3',
    outputs: [{ name: 'preview.pdf', kind: 'preview', media_type: 'application/pdf', bytes: PDF.byteLength, sha256: sha(PDF), meta: { pages: 1 } },
      { name: 'slide-001.png', kind: 'slide', media_type: 'image/png', bytes: PNG.byteLength, sha256: sha(PNG) }],
    coverage: { text: 'extracted', units: 'slides', count: 1 }, limitations: [], ...extra });
  // Upload both outputs and complete: the converter's happy path for one attempt.
  const finish = async (id, attempt, opts = {}) => { await output(id, attempt, 'preview.pdf', PDF, opts); await output(id, attempt, 'slide-001.png', PNG, opts); return cb(id, attempt, 'complete', manifest(id, attempt, opts.manifest), opts); };
  return { sqlite, env, bucket, failNext, calls, converter, send, submit, step, job, cb, output, finish, manifest, alarms, memoFor, PDF, PNG };
}
const derivatives = f => f.sqlite.prepare('SELECT * FROM file_derivatives ORDER BY name').all();

test('a submit is persisted before dispatch and a duplicate submit is the same job', async t => {
  const f = fixture(t);
  const first = await f.submit();
  assert.equal(first.status, 201);
  const { job } = await first.json();
  assert.match(job.id, /^fj_[a-f0-9]{24}$/); assert.equal(job.state, 'queued'); assert.equal(job.attempt, 1);
  assert.equal(f.calls.length, 0, 'nothing reaches the converter from the submit request');
  assert.ok(f.alarms.get(job.id), 'the job object was woken');
  const again = await f.submit();
  assert.equal(again.status, 200); assert.equal((await again.json()).job.id, job.id);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_jobs').get().n, 1);
  // The same key for different work is refused, not silently merged.
  assert.equal((await f.submit({ card: 'card-2' })).status, 409);
  // Writes need the board's owner and a stored source.
  assert.equal((await f.submit({ idempotency_key: 'import:other:1' }, { headers: { 'x-email': 'stranger@test' } })).status, 404);
  assert.equal((await f.submit({ converter: 'step-glb', idempotency_key: 'import:card-1:glb' })).status, 400, 'a converter that does not take this family');
});

test('one alarm step dispatches the current attempt with a scoped callback; busy keeps the same attempt queued', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  f.converter.answer = () => Response.json({ error: 'busy' }, { status: 429 });
  const wait = await f.step(job.id, T0);
  assert.ok(wait >= 5_000);
  assert.equal(f.job(job.id).state, 'queued'); assert.equal(f.job(job.id).attempt, 1); assert.equal(f.job(job.id).lease_until, null);
  f.converter.answer = () => Response.json({ state: 'accepted' }, { status: 202 });
  assert.equal(await f.step(job.id, T0 + wait), LIMITS.leaseMs + 1_000);
  const sent = f.calls.filter(c => c.path === '/jobs');
  assert.equal(sent.length, 2); assert.deepEqual(sent.map(c => c.body.attempt), [1, 1], 'a busy converter never costs an attempt');
  const body = sent[1].body;
  assert.equal(body.schema, 'file-convert/1'); assert.equal(body.converter, 'slides');
  assert.equal(body.source.url, `https://app.test/api/learn/files/jobs/${job.id}/source`);
  assert.equal(body.source.sha256, sha(SOURCE_BYTES)); assert.equal(body.callback.url, `https://app.test/api/learn/files/jobs/${job.id}/attempts/1`);
  assert.equal(f.job(job.id).state, 'validating');
  // The converter reads the source with the token; another job's token, or none, cannot.
  const source = await f.send(`/api/learn/files/jobs/${job.id}/source`, { headers: { Authorization: `Bearer ${body.callback.token}` } });
  assert.equal(source.status, 200); assert.equal(sha(new Uint8Array(await source.arrayBuffer())), sha(SOURCE_BYTES));
  assert.equal((await f.send(`/api/learn/files/jobs/${job.id}/source`)).status, 401);
  assert.equal((await f.send(`/api/learn/files/jobs/fj_${'0'.repeat(24)}/source`, { headers: { Authorization: `Bearer ${body.callback.token}` } })).status, 401);
});

test('progress extends the lease; outputs stage; complete commits every derivative and the result in one guarded batch', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  const progress = await f.cb(job.id, 1, 'progress', { job_id: job.id, attempt: 1, stage: 'converting' }, { now: T0 + 60_000 });
  assert.equal(progress.status, 200);
  assert.equal(f.job(job.id).stage, 'converting'); assert.equal(f.job(job.id).lease_until, T0 + 60_000 + LIMITS.leaseMs);
  assert.equal(await f.step(job.id, T0 + 70_000) > 0, true); assert.equal(f.job(job.id).attempt, 1, 'a live heartbeat is never recovered');
  // Complete before every output is staged is refused and commits nothing.
  await f.output(job.id, 1, 'preview.pdf', f.PDF);
  assert.equal((await f.cb(job.id, 1, 'complete', f.manifest(job.id, 1))).status, 422);
  assert.equal(derivatives(f).length, 0);
  const done = await f.finish(job.id, 1);
  assert.equal(done.status, 200);
  const row = f.job(job.id), made = derivatives(f);
  assert.equal(row.state, 'ready'); assert.equal(row.lease_until, null);
  assert.deepEqual(made.map(d => [d.name, d.kind, d.status]), [['preview.pdf', 'preview', 'ready'], ['slide-001.png', 'slide', 'ready']]);
  assert.deepEqual(JSON.parse(row.derivative_ids_json), made.map(d => d.id));
  for (const d of made) assert.equal(sha(f.bucket.objects.get(d.r2_key).bytes), d.sha256, 'the derivative object holds exactly the staged bytes');
  // A repeated identical complete is 200 and commits nothing new; the step after a settled job does nothing.
  assert.equal((await f.cb(job.id, 1, 'complete', f.manifest(job.id, 1))).status, 200);
  assert.equal(derivatives(f).length, 2);
  assert.equal(await f.step(job.id, T0 + 80_000), null);
  // Status: the owner sees the stage and derivative ids.
  const status = await (await f.send(`/api/learn/files/jobs/${job.id}`)).json();
  assert.equal(status.job.state, 'ready'); assert.equal(status.job.derivatives.length, 2); assert.equal(status.job.owner_email, undefined);
});

test('limitations settle as ready_with_limitations', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  assert.equal((await f.finish(job.id, 1, { manifest: { limitations: ['Animations and transitions are not rendered'] } })).status, 200);
  assert.equal(f.job(job.id).state, 'ready_with_limitations');
  assert.deepEqual((await (await f.send(`/api/learn/files/jobs/${job.id}`)).json()).job.limitations, ['Animations and transitions are not rendered']);
});

test('a lease that expires (converter killed mid-job) recovers as the next attempt; the old attempt can never commit', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  await f.cb(job.id, 1, 'progress', { stage: 'converting' });
  await f.output(job.id, 1, 'preview.pdf', f.PDF); // half the outputs, then the machine dies: no heartbeat follows
  const later = T0 + LIMITS.leaseMs + 1;
  const delay = await f.step(job.id, later);
  assert.equal(f.job(job.id).attempt, 2); assert.equal(f.job(job.id).state, 'queued');
  assert.deepEqual(f.calls.at(-1), { path: `/jobs/${job.id}/1/cancel`, body: null }, 'the dead attempt is told to stop, best effort');
  // Back-off: not dispatched before its time, then attempt 2 goes out.
  assert.equal(await f.step(job.id, later + 1) > 0, true); assert.equal(f.calls.filter(c => c.path === '/jobs').length, 1);
  await f.step(job.id, later + delay);
  assert.deepEqual(f.calls.filter(c => c.path === '/jobs').map(c => c.body.attempt), [1, 2]);
  // The restarted converter's attempt-1 callbacks are stale.
  assert.equal((await f.cb(job.id, 1, 'progress', { stage: 'converting' }, { now: later + delay })).status, 409);
  assert.equal((await f.finish(job.id, 1, { now: later + delay })).status, 409);
  assert.equal(derivatives(f).length, 0, 'no derivative from a superseded attempt');
  assert.equal((await f.finish(job.id, 2, { now: later + delay + 5 })).status, 200);
  assert.equal(f.job(job.id).state, 'ready');
  assert.equal(derivatives(f).length, 2, 'exactly one set of derivatives');
});

test('bounded attempts: a dead attempt at max_attempts fails with a truthful reason; a deterministic failure does not retry', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  let now = T0;
  for (let attempt = 1; attempt <= LIMITS.maxAttempts; attempt++) {
    while (f.job(job.id).state === 'queued') { now += 300_000; await f.step(job.id, now); }
    assert.equal(f.job(job.id).attempt, attempt);
    now += LIMITS.leaseMs + 1; await f.step(job.id, now);
  }
  assert.equal(f.job(job.id).state, 'failed'); assert.match(f.job(job.id).error, /stopped responding 3 times/);
  assert.equal(f.calls.filter(c => c.path === '/jobs').length, LIMITS.maxAttempts);

  const g = fixture(t);
  const { job: other } = await (await g.submit()).json();
  await g.step(other.id, T0);
  assert.equal((await g.cb(other.id, 1, 'fail', { job_id: other.id, attempt: 1, error: 'too_complex', retryable: false })).status, 200);
  assert.equal(g.job(other.id).state, 'failed'); assert.equal(g.job(other.id).error, 'The file is too complex to convert.');
  // An infrastructure failure retries as the next attempt within the budget.
  const h = fixture(t);
  const { job: third } = await (await h.submit()).json();
  await h.step(third.id, T0);
  await h.cb(third.id, 1, 'fail', { error: 'converter_restarted', retryable: true });
  assert.equal(h.job(third.id).state, 'queued'); assert.equal(h.job(third.id).attempt, 2);
});

test('wrong attempt: a token for one attempt cannot act as another, and an older attempt is stale', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  assert.equal((await f.cb(job.id, 2, 'progress', { stage: 'converting' }, { tokenAttempt: 1 })).status, 401);
  assert.equal((await f.cb(job.id, 2, 'progress', { stage: 'converting' })).status, 409, 'a future attempt is not current either');
  // Expired tokens are refused.
  assert.equal((await f.cb(job.id, 1, 'progress', { stage: 'converting' }, { mintAt: T0, now: T0 + LIMITS.tokenMs + 1 })).status, 401);
  // A manifest that names another attempt or job is refused.
  await f.output(job.id, 1, 'preview.pdf', f.PDF); await f.output(job.id, 1, 'slide-001.png', f.PNG);
  assert.equal((await f.cb(job.id, 1, 'complete', f.manifest(job.id, 2))).status, 400);
  assert.equal(derivatives(f).length, 0);
});

test('cancel: queued stops at once; active is told to stop; a late result after cancel never commits', async t => {
  const f = fixture(t);
  const { job: queued } = await (await f.submit()).json();
  const cancelled = await (await f.send(`/api/learn/files/jobs/${queued.id}/cancel`, { method: 'POST' })).json();
  assert.equal(cancelled.job.state, 'cancelled');
  assert.equal(await f.step(queued.id, T0 + 1), null); assert.equal(f.calls.length, 0, 'a cancelled queued job is never dispatched');

  const { job } = await (await f.submit({ idempotency_key: 'import:card-1:slides:b', card: 'card-1b' })).json();
  await f.step(job.id, T0);
  await f.cb(job.id, 1, 'progress', { stage: 'converting' });
  await f.output(job.id, 1, 'preview.pdf', f.PDF);
  const r = await (await f.send(`/api/learn/files/jobs/${job.id}/cancel`, { method: 'POST' })).json();
  assert.equal(r.job.cancelRequested, true); assert.equal(r.job.state, 'converting', 'active work settles through the runner');
  assert.equal((await f.cb(job.id, 1, 'progress', { stage: 'preparing_preview' })).status, 409, 'heartbeats stop being accepted');
  await f.step(job.id, T0 + 1);
  assert.deepEqual(f.calls.at(-1), { path: `/jobs/${job.id}/1/cancel`, body: null });
  assert.equal(f.job(job.id).state, 'cancelled');
  // The converter finishes anyway: its late result is a no-op and no derivative appears.
  assert.equal((await f.finish(job.id, 1)).status, 409);
  assert.equal(derivatives(f).length, 0);
  assert.equal((await f.cb(job.id, 1, 'fail', { error: 'cancelled', retryable: false })).status, 409);
  assert.equal(f.job(job.id).state, 'cancelled');
});

test('crash mid-upload of a derivative: nothing partial is ever committed, and the retried upload commits once', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  // A body cut short (the converter died while sending) is refused and stages nothing.
  const cut = await f.cb(job.id, 1, 'outputs/preview.pdf', f.PDF.slice(0, 5), { headers: { 'Content-Length': String(f.PDF.byteLength), 'X-Content-SHA256': sha(f.PDF) } });
  assert.ok(cut.status >= 400);
  assert.equal([...f.bucket.objects.keys()].some(k => k.startsWith('file-jobs/')), false);
  // Bytes that do not match their declared hash are refused.
  assert.equal((await f.output(job.id, 1, 'preview.pdf', f.PNG, { headers: { 'X-Content-SHA256': sha(f.PDF) } })).status, 422);
  // The write itself dies: the converter's retry stages it; an identical replay is a no-op, different bytes 409.
  f.failNext.add(`file-jobs/${job.id}/1/preview.pdf`);
  await assert.rejects(() => f.output(job.id, 1, 'preview.pdf', f.PDF));
  assert.equal((await f.output(job.id, 1, 'preview.pdf', f.PDF)).status, 201);
  assert.equal((await f.output(job.id, 1, 'preview.pdf', f.PDF)).status, 200);
  assert.equal((await f.output(job.id, 1, 'preview.pdf', f.PNG)).status, 409);
  await f.output(job.id, 1, 'slide-001.png', f.PNG);
  // The copy into the source's derivative keys dies during complete: no row exists, so nothing reads a half state.
  f.failNext.add(`file-sources/${SOURCE}/d/`);
  await assert.rejects(() => f.cb(job.id, 1, 'complete', f.manifest(job.id, 1)));
  assert.equal(derivatives(f).length, 0); assert.equal(f.job(job.id).state, 'validating');
  assert.equal((await f.cb(job.id, 1, 'complete', f.manifest(job.id, 1))).status, 200);
  const made = derivatives(f);
  assert.equal(made.length, 2);
  for (const d of made) assert.equal(sha(f.bucket.objects.get(d.r2_key).bytes), d.sha256);
});

test('bounded concurrency: a third job waits for a free slot without spending an attempt', async t => {
  const f = fixture(t, { concurrency: 2 });
  const ids = [];
  for (const n of [1, 2, 3]) ids.push((await (await f.submit({ card: `c${n}`, idempotency_key: `import:c${n}:slides` })).json()).job.id);
  for (const id of ids) await f.step(id, T0);
  assert.deepEqual(ids.map(id => f.job(id).state), ['validating', 'validating', 'queued']);
  await f.finish(ids[0], 1);
  await f.step(ids[2], T0 + 10_000);
  assert.equal(f.job(ids[2]).state, 'validating'); assert.equal(f.job(ids[2]).attempt, 1);
});

test('retry reuses the same job and stored source; a second job for the same source revision reuses its derivatives', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  await f.step(job.id, T0);
  await f.cb(job.id, 1, 'fail', { error: 'timeout', retryable: false });
  const retried = await (await f.send(`/api/learn/files/jobs/${job.id}/retry`, { method: 'POST' })).json();
  assert.equal(retried.job.id, job.id); assert.equal(retried.job.state, 'queued'); assert.equal(retried.job.attempt, 2);
  assert.equal((await f.send(`/api/learn/files/jobs/${job.id}/retry`, { method: 'POST' })).status, 409, 'only a settled failure retries');
  await f.step(job.id, T0 + 1);
  assert.equal((await f.finish(job.id, 2)).status, 200);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM file_jobs').get().n, 1);
  // Another card importing the same file with the same converter and options gets the existing derivatives, not copies.
  const { job: second } = await (await f.submit({ card: 'card-2', idempotency_key: 'import:card-2:slides' })).json();
  await f.step(second.id, T0 + 2);
  assert.equal((await f.finish(second.id, 1)).status, 200);
  assert.equal(derivatives(f).length, 2);
  assert.deepEqual(JSON.parse(f.job(second.id).derivative_ids_json), JSON.parse(f.job(job.id).derivative_ids_json));
});

test('status is read through the board: owner, or a share viewer whose board still holds the card; never by id alone', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  const path = `/api/learn/files/jobs/${job.id}`, share = `${path}?share=${'v'.repeat(24)}`;
  assert.equal((await f.send(path)).status, 200);
  assert.equal((await f.send(path, { headers: { 'x-email': 'stranger@test' } })).status, 404);
  assert.equal((await f.send(share, { headers: { 'x-email': 'stranger@test' } })).status, 404, 'the board has no card on this job');
  const card = { id: 'card-1', type: 'pdf', fileRef: { v: 1, source: { id: SOURCE, rev: sha(SOURCE_BYTES) }, family: 'presentation', job: job.id } };
  f.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = 7').run(JSON.stringify({ blocks: [card] }));
  const seen = await f.send(share, { headers: { 'x-email': 'stranger@test' } });
  assert.equal(seen.status, 200); assert.equal((await seen.json()).job.id, job.id);
  // Removing the card, or revoking the link, removes the access.
  f.sqlite.prepare("UPDATE learn_boards SET state_json = '{\"blocks\":[]}' WHERE id = '7'").run();
  assert.equal((await f.send(share, { headers: { 'x-email': 'stranger@test' } })).status, 404);
  f.sqlite.prepare('UPDATE learn_boards SET state_json = ?, shared = 0 WHERE id = 7').run(JSON.stringify({ blocks: [card] }));
  assert.equal((await f.send(share, { headers: { 'x-email': 'stranger@test' } })).status, 404);
  // Cancel and retry are the owner's.
  assert.equal((await f.send(`${path}/cancel`, { method: 'POST', headers: { 'x-email': 'stranger@test' } })).status, 404);
});

test('the Durable Object stores its job and re-arms until the job settles', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  const memo = f.memoFor(job.id);
  assert.equal(await memo.get('id'), job.id);
  await new FileJobs({ storage: memo }, f.env).alarm();
  assert.equal(f.job(job.id).state, 'validating');
  assert.ok(f.alarms.get(job.id) > Date.now(), 're-armed while active');
  f.sqlite.prepare("UPDATE file_jobs SET state = 'ready' WHERE id = ?").run(job.id);
  await new FileJobs({ storage: memo }, f.env).alarm();
  assert.equal(await memo.get('id'), undefined, 'a settled job clears its object');
});

test('without converter configuration the job fails truthfully instead of looping', async t => {
  const f = fixture(t);
  const { job } = await (await f.submit()).json();
  delete f.env.CONVERT_URL;
  assert.equal(await f.step(job.id, T0), null);
  assert.equal(f.job(job.id).state, 'failed'); assert.equal(f.job(job.id).error, 'File conversion is not configured on this server.');
});
