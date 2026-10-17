// The job runner against a stub converter over real HTTP (test/file-jobs-stack.mjs + test/fake-converter.mjs): the two
// owner demos at local scale. (1) Submit and walk away: the job finishes with no browser attached. (2) Kill the converter
// mid-job and restart it: the lease expires, the next attempt runs, exactly one set of derivatives, every byte intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { LIMITS } from '../src/file-jobs.js';
import { startJobStack } from './file-jobs-stack.mjs';
import { startFakeConverter } from './fake-converter.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const until = async (check, ms = 20_000) => { const end = Date.now() + ms; for (;;) { const v = await check(); if (v) return v; if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } };
const saved = { ...LIMITS };
test.beforeEach(() => Object.assign(LIMITS, { leaseMs: 1_200, backoffMs: 200 }));
test.afterEach(() => Object.assign(LIMITS, saved));

async function setup(t, convertMs) {
  const token = randomBytes(24).toString('hex');
  let converter = await startFakeConverter({ token, convertMs, heartbeatMs: 150 });
  const stack = await startJobStack({ convertUrl: converter.url, convertToken: token });
  t.after(async () => { await converter.kill(); await stack.close(); });
  const source = stack.addSource(new Uint8Array(randomBytes(4096)));
  const submit = () => stack.request(`/api/learn/files/${source}/jobs`, { method: 'POST', body: { converter: 'slides', options: {}, card: 'card-1', app: 'canvas-demo', idempotency_key: 'card:card-1:slides:demo' } });
  const restart = async () => { converter = await startFakeConverter({ token, convertMs, heartbeatMs: 150, port: converter.port }); return converter; };
  return { stack, source, submit, converter: () => converter, restart };
}
const checkDerivatives = (stack, source) => {
  const rows = stack.derivatives(source);
  assert.deepEqual(rows.map(d => d.name), ['preview.pdf', 'slide-001.png', 'text.json'], 'exactly one set');
  for (const d of rows) { const o = stack.media.objects.get(d.r2_key); assert.ok(o, d.name); assert.equal(sha(o.bytes), d.sha256); assert.equal(o.bytes.byteLength, d.bytes); }
  return rows;
};

test('demo 1: submit, walk away, and the finished result is there on return', async t => {
  const { stack, source, submit } = await setup(t, 600);
  const first = await (await submit()).json();
  assert.equal(first.created, true);
  // The browser is gone: nothing polls. The Durable Object's alarms drive the job to the end.
  await until(() => ['ready', 'ready_with_limitations', 'failed'].includes(stack.job(first.job.id).state));
  assert.equal(stack.job(first.job.id).state, 'ready');
  // The browser returns: it reads status, and a resubmit from a reopened canvas is the same job, not a second import.
  const status = await (await stack.request(`/api/learn/files/jobs/${first.job.id}`)).json();
  assert.equal(status.job.state, 'ready'); assert.equal(status.job.derivatives.length, 3);
  const again = await (await submit()).json();
  assert.equal(again.job.id, first.job.id); assert.equal(again.created, false);
  assert.equal(stack.sqlite.prepare('SELECT COUNT(*) AS n FROM file_jobs').get().n, 1);
  checkDerivatives(stack, source);
  assert.deepEqual(stack.alarmErrors, []);
});

test('demo 2: kill the converter mid-job, restart it, and the job recovers with no duplicates and no corrupt output', async t => {
  const { stack, source, submit, converter, restart } = await setup(t, 1_500);
  const { job } = await (await submit()).json();
  await until(() => stack.job(job.id).stage === 'converting');
  await converter().kill(); // mid-conversion: heartbeats stop, nothing more is sent
  await until(() => stack.job(job.id).attempt === 2, 10_000); // the lease expired; attempt 2 waits for a converter
  await restart();
  await until(() => ['ready', 'ready_with_limitations', 'failed'].includes(stack.job(job.id).state), 20_000);
  const row = stack.job(job.id);
  assert.equal(row.state, 'ready'); assert.equal(row.attempt, 2);
  const rows = checkDerivatives(stack, source);
  assert.deepEqual(JSON.parse(row.derivative_ids_json).sort(), rows.map(d => d.id).sort());
  await until(() => converter().log.some(e => e.attempt === 2 && e.complete === 200)); // the restarted converter's own record of the commit
  assert.deepEqual(stack.alarmErrors, []);
});

test('cancel during conversion stops the converter and a late result never commits', async t => {
  const { stack, source, submit, converter } = await setup(t, 3_000);
  const { job } = await (await submit()).json();
  await until(() => stack.job(job.id).stage === 'converting');
  const r = await (await stack.request(`/api/learn/files/jobs/${job.id}/cancel`, { method: 'POST' })).json();
  assert.equal(r.job.cancelRequested, true);
  await until(() => stack.job(job.id).state === 'cancelled');
  await until(() => converter().log.some(e => e.fail));
  assert.equal(stack.derivatives(source).length, 0);
  assert.equal(converter().runs.get(`${job.id}:1`).cancelled, true, 'the converter was told to stop');
});
