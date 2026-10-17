// The converter service on any host, against the proof harness as its control plane: auth,
// validation, (job, attempt) idempotency, 429, cancel, superseded attempts, atomic upload (no
// commit unless every output staged), idle self-stop and start-up cleanup. The child is
// stub-child.mjs; the real converters run in the Linux image (proof/run-proofs.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness } from './proof/harness.mjs';
import { convertService } from './server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TOKEN = 's'.repeat(40), ADMIN = 'a'.repeat(40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

async function start(t, mode, { slots = 2, idleStopMs = 0, onIdle, svcFetch = fetch, jobsDir = mkdtempSync(join(tmpdir(), 'convert-svc-')) } = {}) {
  let convertUrl, hBase;
  const h = harness({ adminToken: ADMIN, convertToken: TOKEN, callbackSecret: 'c'.repeat(40), convertUrl: () => convertUrl, origin: () => hBase });
  hBase = await listen(h);
  const svc = convertService({ token: TOKEN, allowedOrigins: [hBase], sandbox: 'none', jobsDir, slots, idleStopMs, onIdle, childScript: join(HERE, 'stub-child.mjs'), childArgs: [mode], retryDelays: [20, 20], heartbeatMs: 200, fetchImpl: svcFetch });
  convertUrl = await listen(svc.server);
  t.after(() => { svc.close(); h.close(); });
  const admin = (path, body) => fetch(hBase + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());
  const job = async (id, fixtureName = 'sample.doc', converter = 'office-pdf') => { await admin('/admin/jobs', { job_id: id, converter, fixture: fixtureName }); return admin(`/admin/jobs/${id}/dispatch`, {}); };
  const until = async (id, done, ms = 15000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) { const j = await admin(`/admin/jobs/${id}`); if (done(j)) return j; }
    throw new Error(`job ${id} did not settle: ${JSON.stringify(await admin(`/admin/jobs/${id}`))}`);
  };
  return { svc, convertUrl, hBase, admin, job, until, jobsDir };
}
const settled = j => j.committed || j.state === 'failed';

test('health is unauthenticated and versioned; jobs need the bearer token', async t => {
  const { convertUrl } = await start(t, 'ready');
  const res = await fetch(`${convertUrl}/health`);
  const text = await res.text(), body = JSON.parse(text);
  assert.equal(res.status, 200);
  assert.equal(body.service, 'rabbit-hole-convert');
  assert.match(body.version, /^file-convert-1-[0-9a-f]{12}/);
  assert.deepEqual(Object.keys(body.converters).sort(), ['audio-playback', 'office-pdf', 'slides', 'step-glb']);
  assert.equal(body.busy, false);
  assert.ok(!text.includes(TOKEN));
  for (const authorization of [undefined, `Bearer ${'x'.repeat(40)}`, TOKEN]) {
    const r = await fetch(`${convertUrl}/jobs`, { method: 'POST', headers: authorization ? { authorization } : {}, body: '{}' });
    assert.equal(r.status, 401);
  }
  assert.equal((await fetch(`${convertUrl}/jobs/fj_x/1`)).status, 401);
});

test('a dispatch converts, stages every output and commits once; a duplicate dispatch does nothing', async t => {
  const { job, admin, until, jobsDir } = await start(t, 'ready');
  const d = await job('fj_ok');
  assert.equal(d.status, 202);
  const j = await until('fj_ok', settled);
  assert.equal(j.committed.attempt, 1);
  assert.deepEqual(j.committed.outputs.map(o => o.name), ['preview.pdf', 'text.json']);
  assert.deepEqual(j.staged['1'].map(o => o.sha256).sort(), j.committed.outputs.map(o => o.sha256).sort());
  assert.match(j.committed.converter_version, /^office-pdf\/3\+libreoffice-/);
  assert.deepEqual([...new Set(j.events.filter(e => e.type === 'progress').map(e => e.stage))], ['validating', 'converting', 'preparing_preview']);
  const again = await admin('/admin/jobs/fj_ok/dispatch', { attempt: 1 });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal((await admin('/admin/jobs/fj_ok')).events.filter(e => e.type === 'source_read').length, 1);
  assert.deepEqual(readdirSync(jobsDir), [], 'the workspace is removed after the attempt');
});

test('the child gets no service environment and no token', async t => {
  const { job, until, convertUrl } = await start(t, 'ready');
  await job('fj_env');
  await until('fj_env', settled);
  const st = await fetch(`${convertUrl}/jobs/fj_env/1`, { headers: { authorization: `Bearer ${TOKEN}` } }).then(r => r.json());
  assert.equal(st.state, 'committed');
  assert.deepEqual(st.sandbox.env_keys.filter(k => /TOKEN|SECRET|ALLOWED|FLY|CALLBACK/i.test(k)), []);
  if (process.platform !== 'win32') assert.deepEqual(st.sandbox.env_keys.sort(), ['CONVERT_SANDBOX', 'HOME', 'PATH', 'TEMP', 'TMP', 'TMPDIR']);
});

test('429 when every slot is in use; cancel stops the attempt, reports it and commits nothing', async t => {
  const { job, until, admin, jobsDir } = await start(t, 'sleep', { slots: 1 });
  assert.equal((await job('fj_a')).status, 202);
  await until('fj_a', j => j.stage === 'converting');
  const busy = await job('fj_b');
  assert.equal(busy.status, 429);
  assert.deepEqual(busy.body, { error: 'busy', slots: 1, active: 1 });
  const c = await admin('/admin/jobs/fj_a/cancel', {});
  assert.equal(c.status, 200);
  const a = await until('fj_a', settled);
  assert.equal(a.committed, null);
  assert.equal(a.error.code, 'cancelled');
  assert.equal(a.error.retryable, false);
  await sleep(100);
  assert.deepEqual(readdirSync(jobsDir), []);
  assert.equal((await admin('/admin/jobs/fj_b/dispatch', { attempt: 1 })).status, 202, 'the freed slot takes the next attempt');
});

test('a newer attempt stops the older one here; only the newer attempt commits', async t => {
  const { job, until, admin } = await start(t, 'slow');
  await job('fj_s');
  await until('fj_s', j => j.stage === 'converting');
  const a2 = await admin('/admin/jobs/fj_s/dispatch', { attempt: 2 });
  assert.equal(a2.status, 202);
  const j = await until('fj_s', settled);
  assert.equal(j.committed.attempt, 2);
  assert.equal(j.events.filter(e => e.type === 'fail').length, 0, 'the stopped attempt reports nothing');
  const late = await admin('/admin/jobs/fj_s/dispatch', { attempt: 1 });
  assert.equal(late.status, 200, 'attempt 1 is known here: duplicate, never re-run');
  assert.equal(late.body.state, 'superseded');
});

test('no commit unless every output is staged: a failing PUT fails the attempt as retryable and commits nothing', async t => {
  const svcFetch = (url, init) => (init?.method === 'PUT' && String(url).endsWith('/outputs/text.json') ? Promise.resolve(new Response('down', { status: 503 })) : fetch(url, init));
  const { job, until } = await start(t, 'ready', { svcFetch });
  await job('fj_u');
  const j = await until('fj_u', settled);
  assert.equal(j.committed, null);
  assert.equal(j.error.code, 'upload_failed');
  assert.equal(j.error.retryable, true);
  assert.deepEqual(j.staged['1'].map(o => o.name), ['preview.pdf'], 'staged bytes exist but are not a derivative');
  // The retry (attempt 2) with the store back commits everything.
});

test('an undeclared output name fails the attempt; nothing is uploaded', async t => {
  const { job, until } = await start(t, 'undeclared');
  await job('fj_x');
  const j = await until('fj_x', settled);
  assert.equal(j.committed, null);
  assert.equal(j.error.code, 'converter_failure');
  assert.deepEqual(j.staged, {});
});

test('a child failure and a crash are reported, never committed', async t => {
  for (const [mode, code] of [['failed', 'invalid_source'], ['crash', 'converter_crashed']]) {
    const { job, until } = await start(t, mode);
    await job(`fj_${mode}`);
    const j = await until(`fj_${mode}`, settled);
    assert.equal(j.committed, null);
    assert.equal(j.error.code, code);
  }
});

test('validation: wrong origin, bad options and oversize bodies are refused before any work', async t => {
  const { convertUrl, hBase } = await start(t, 'ready');
  const post = body => fetch(`${convertUrl}/jobs`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const ok = { schema: 'file-convert/1', job_id: 'fj_v', attempt: 1, converter: 'slides', options: { from: 2, to: 3 },
    source: { url: `${hBase}/cp/jobs/fj_v/source`, bytes: 10, sha256: 'a'.repeat(64) }, callback: { url: `${hBase}/cp/jobs/fj_v/attempts/1`, token: 'k'.repeat(40) } };
  for (const bad of [
    { ...ok, source: { ...ok.source, url: 'https://evil.example/x' } },
    { ...ok, callback: { ...ok.callback, url: 'http://169.254.169.254/latest' } },
    { ...ok, options: { from: 3, to: 2 } },
    { ...ok, options: { macro: true } },
    { ...ok, converter: 'shell' },
    { ...ok, attempt: 0 },
    { ...ok, source: { ...ok.source, bytes: 65 * 1024 * 1024 } },
  ]) assert.equal((await post(bad)).status, 400, JSON.stringify(bad).slice(0, 120));
  assert.equal((await post('x'.repeat(20000))).status, 413);
});

test('the source must match the declared sha256; a refused source read fails as source_unavailable', async t => {
  const { convertUrl, hBase, admin, job, until } = await start(t, 'ready');
  const mint = (j, a) => createHmac('sha256', 'c'.repeat(40)).update(`${j}:${a}`).digest('base64url');
  const status = async (id, n) => { for (let i = 0; i < 100; i++) { const s = await fetch(`${convertUrl}/jobs/${id}/${n}`, { headers: { authorization: `Bearer ${TOKEN}` } }).then(r => r.json()); if (s.state !== 'running') return s; await sleep(50); } };
  await job('fj_m');
  const j = await until('fj_m', settled);
  const raw = (attempt, sha256, token) => admin('/admin/converter/raw', { method: 'POST', path: '/jobs', token: 'service', body: {
    schema: 'file-convert/1', job_id: 'fj_m', attempt, converter: 'office-pdf', options: {},
    source: { url: `${hBase}/cp/jobs/fj_m/source`, bytes: j.source.bytes, sha256 }, callback: { url: `${hBase}/cp/jobs/fj_m/attempts/${attempt}`, token } } });
  // Attempt 2 reads the source with a token the harness accepts, but declares another sha256.
  assert.equal((await raw(2, 'b'.repeat(64), mint('fj_m', 1))).status, 202);
  assert.equal((await status('fj_m', 2)).error, 'source_mismatch');
  // Attempt 3 holds a token the control plane never minted: the source read is refused.
  assert.equal((await raw(3, j.source.sha256, 'x'.repeat(40))).status, 202);
  assert.equal((await status('fj_m', 3)).error, 'source_unavailable');
  assert.equal((await admin('/admin/jobs/fj_m')).committed.attempt, 1, 'the committed result is untouched');
});

test('idle self-stop only with no active attempt; start-up removes leftover workspaces', async t => {
  const jobsDir = mkdtempSync(join(tmpdir(), 'convert-left-'));
  mkdirSync(join(jobsDir, 'f'.repeat(32), 'out'), { recursive: true });
  writeFileSync(join(jobsDir, 'f'.repeat(32), 'out', 'preview.pdf'), 'partial');
  let idled = 0;
  const { job, until } = await start(t, 'slow', { idleStopMs: 400, onIdle: () => { idled++; }, jobsDir });
  assert.deepEqual(readdirSync(jobsDir), [], 'a leftover partial workspace is removed at start-up');
  await job('fj_i');
  await sleep(450);
  // The job (600 ms child) was active through the idle window: no stop yet... it may have finished; then the window restarts.
  await until('fj_i', settled);
  assert.equal(idled, 0, 'never stops while an attempt runs or right after one finished');
  await sleep(700);
  assert.equal(idled, 1, 'stops once idle for the full window');
});
