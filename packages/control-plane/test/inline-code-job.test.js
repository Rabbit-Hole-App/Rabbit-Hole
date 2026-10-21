import test from 'node:test';
import assert from 'node:assert/strict';
import { createInlineCodeCoordinator } from '../src/inline-code-job.js';

const owner = { org: 'workspace', email: 'owner@example.test' };
const id = n => `cj_${n.toString(16).padStart(32, '0')}`;
const request = (n = 1) => ({ id: id(n), owner, scope: { app: 'canvas-12345678', board: 'main' }, language: 'javascript', code: 'return input.value + 1;', input: { value: 3 }, executionConfirmed: true, maxReservedMicros: 5000 });
function storage() {
  const values = new Map();
  let tail = Promise.resolve();
  const db = { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)); } };
  return { ...db, transaction(fn) { const next = tail.then(() => fn(db)); tail = next.catch(() => {}); return next; } };
}
const policy = { maxRuns: 2, maxMicros: 10000, reserveMicros: 5000 };
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
async function success({ code, input }) {
  return { status: 'ok', stdout: [], result: 4, error: null, sourceSha256: await hash(code), inputSha256: await hash(JSON.stringify(input)), elapsedMs: 2, executionStarted: true, terminationConfirmed: true };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('global reservations serialize concurrent users and idempotent submits do not charge twice', async () => {
  const db = storage(), coordinator = createInlineCodeCoordinator({ storage: db, execute: success, policy });
  const sent = [request(), request(), { ...request(2), owner: { ...owner, email: 'other@example.test' } }, request(3)];
  const results = await Promise.allSettled(sent.map(entry => coordinator.create(entry)));
  // Admission follows the order each request's hashes finish (verify 39530425603 failed twice when request 3 overtook
  // request 2 on Linux), so which distinct job misses the two-run allowance varies; the invariants do not.
  const admitted = new Set(results.filter(r => r.status === 'fulfilled').map(r => r.value.id));
  assert.equal(admitted.size, 2, 'two distinct runs fit the allowance');
  assert.ok(results.some(r => r.status === 'rejected') && results.filter(r => r.status === 'rejected').every(r => /allowance/.test(r.reason.message)));
  assert.equal(results[0].status, results[1].status, 'an idempotent resubmit is admitted or refused with its first submit, never charged again');
  assert.deepEqual(await db.get('code:budget'), { policy, runs: 2, reservedMicros: 10000 });
  await assert.rejects(coordinator.create({ ...sent.find(entry => admitted.has(entry.id)), code: 'return 9;' }), /conflicts/);
});

test('consent, source limits and ownership fail before execution', async () => {
  const db = storage(); let calls = 0;
  const coordinator = createInlineCodeCoordinator({ storage: db, execute: async () => { calls++; }, policy });
  for (const patch of [{ executionConfirmed: false }, { maxReservedMicros: 4999 }, { language: 'python' }, { code: 'x'.repeat(32769) }, { input: 'x'.repeat(16385) }]) {
    await assert.rejects(coordinator.create({ ...request(), ...patch }));
  }
  assert.equal(await db.get('code:budget'), undefined);
  await coordinator.create(request());
  const foreign = { ...owner, email: 'foreign@example.test' };
  for (const method of ['status', 'run', 'cancel']) await assert.rejects(coordinator[method](id(1), foreign), /unavailable/);
  assert.equal(calls, 0);
});

test('duplicate running requests execute once and expose no source or owner', async () => {
  const db = storage(), gate = deferred(); let calls = 0;
  const coordinator = createInlineCodeCoordinator({ storage: db, execute: async args => { calls++; await gate.promise; return success(args); }, policy });
  await coordinator.create(request());
  const first = coordinator.run(id(1), owner), second = coordinator.run(id(1), owner);
  assert.equal(first, second); gate.resolve();
  const result = await first;
  assert.equal(result.phase, 'succeeded'); assert.equal(calls, 1);
  assert.equal(result.actualCostUsd, null);
  for (const field of ['owner', 'code', 'input']) assert.equal(Object.hasOwn(result, field), false);
  assert.equal((await coordinator.run(id(1), owner)).phase, 'succeeded'); assert.equal(calls, 1);
});

test('recovery holds reservation and never repeats a started execution', async () => {
  const db = storage(); let calls = 0;
  const coordinator = createInlineCodeCoordinator({ storage: db, execute: async () => { calls++; }, policy });
  await coordinator.create(request());
  const job = await db.get(`code:job:${id(1)}`); await db.put(`code:job:${id(1)}`, { ...job, phase: 'started' });
  assert.equal((await coordinator.run(id(1), owner)).phase, 'unknown');
  assert.equal((await coordinator.run(id(1), owner)).phase, 'unknown');
  assert.equal(calls, 0); assert.equal((await db.get('code:budget')).reservedMicros, 5000);
});

test('queued cancellation avoids execution; running cancellation wins late success', async () => {
  const db = storage(), started = deferred(), finish = deferred(); let calls = 0, signal;
  const coordinator = createInlineCodeCoordinator({ storage: db, execute: async args => { calls++; signal = args.signal; started.resolve(); await finish.promise; return success(args); }, policy });
  await coordinator.create(request()); await coordinator.cancel(id(1), owner);
  assert.equal((await coordinator.run(id(1), owner)).phase, 'cancelled'); assert.equal(calls, 0);
  await coordinator.create(request(2)); const running = coordinator.run(id(2), owner); await started.promise;
  await coordinator.cancel(id(2), owner); assert.equal(signal.aborted, true); finish.resolve();
  assert.equal((await running).phase, 'cancelled'); assert.equal(calls, 1);
  assert.equal((await db.get('code:budget')).reservedMicros, 10000);
});

test('unknown, timeout and mismatched execution results remain held without retry', async () => {
  for (const execute of [async () => { throw Error('lost response'); }, async args => ({ ...await success(args), status: 'timeout', terminationConfirmed: false }), async args => ({ ...await success(args), sourceSha256: 'wrong' })]) {
    const db = storage(); let calls = 0;
    const coordinator = createInlineCodeCoordinator({ storage: db, execute: async args => { calls++; return execute(args); }, policy });
    await coordinator.create(request()); assert.equal((await coordinator.run(id(1), owner)).phase, 'unknown');
    await coordinator.run(id(1), owner); assert.equal(calls, 1); assert.equal((await db.get('code:budget')).reservedMicros, 5000);
  }
});

test('changing budget policy cannot silently expand durable allowance', async () => {
  const db = storage(); await createInlineCodeCoordinator({ storage: db, execute: success, policy }).create(request());
  const changed = createInlineCodeCoordinator({ storage: db, execute: success, policy: { ...policy, maxRuns: 20 } });
  await assert.rejects(changed.create(request(2)), /policy changed/);
  assert.equal((await db.get('code:budget')).runs, 1);
});

test('job identity freezes canvas scope and rejects invalid scope before reserving', async () => {
  const db = storage(), coordinator = createInlineCodeCoordinator({ storage: db, execute: success, policy });
  for (const scope of [null, {}, { app: 'canvas-12345678', board: '' }, { app: 'canvas-12345678', board: 'main', extra: true }]) {
    await assert.rejects(coordinator.create({ ...request(), scope }), /scope/i);
  }
  assert.equal(await db.get('code:budget'), undefined);
  const result = await coordinator.create(request()); assert.deepEqual(result.scope, request().scope);
  await assert.rejects(coordinator.create({ ...request(), scope: { app: 'canvas-87654321', board: 'main' } }), /conflicts/);
  assert.equal((await db.get('code:budget')).runs, 1);
  const dotted = await coordinator.create({ ...request(2), scope: { app: 'canvas-12345678', board: 'chapter.1' } });
  assert.equal(dotted.scope.board, 'chapter.1');
});
