// Ctrl+K JavaScript execution: the INLINE_CODE_* limits fail closed, and the proposed values (docs/features/ctrlk-code-loader-retest.md)
// are valid, internally consistent and exhaust permanently. Fixtures only: no loader is deployed and nothing executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineCodePolicy } from '../src/inline-code-route.js';
import { inlineCodeActorFetch } from '../src/inline-code-actor.js';
import { createInlineCodeCoordinator } from '../src/inline-code-job.js';

// 1 credit = 10,000 micros. The dev-clone window and the first production window; the reasoning is in the doc.
const PROPOSED = {
  dev: { INLINE_CODE_MAX_RUNS: '25', INLINE_CODE_RESERVE_MICROS: '10000', INLINE_CODE_MAX_MICROS: '250000' },
  production: { INLINE_CODE_MAX_RUNS: '200', INLINE_CODE_RESERVE_MICROS: '10000', INLINE_CODE_MAX_MICROS: '2000000' },
};
const GOOD = PROPOSED.dev;
const owner = { org: 'org', email: 'owner' };
const id = n => `cj_${n.toString(16).padStart(32, '0')}`;
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
const storage = () => {
  const records = new Map(); let tail = Promise.resolve();
  const db = { get: async key => structuredClone(records.get(key)), put: async (key, value) => { records.set(key, structuredClone(value)); }, list: async ({ prefix }) => new Map([...records].filter(([key]) => key.startsWith(prefix))), setAlarm: async () => {} };
  return { records, ...db, transaction(fn) { const next = tail.then(() => fn(db)); tail = next.catch(() => {}); return next; } };
};
const request = n => ({ id: id(n), owner, scope: { app: 'canvas-12345678', board: 'main' }, language: 'javascript', code: 'return 2;', input: null, executionConfirmed: true, maxReservedMicros: 10000 });

test('a missing, empty, zero, negative, fractional, exponent, hex, padded, non-string or oversized limit disables execution', () => {
  assert.ok(inlineCodePolicy(GOOD), 'the control case is valid');
  for (const name of Object.keys(GOOD)) {
    for (const bad of [undefined, null, '', '0', '-1', '1.5', '1e2', '0x10', ' 25', '25 ', 'NaN', 'Infinity', 25, '9007199254740993']) {
      assert.equal(inlineCodePolicy({ ...GOOD, [name]: bad }), null, `${name}=${JSON.stringify(bad)}`);
    }
  }
  assert.equal(inlineCodePolicy({ ...GOOD, INLINE_CODE_RESERVE_MICROS: '250001' }), null, 'a reservation above the ceiling can never be admitted');
  assert.equal(inlineCodePolicy({}), null);
});

test('the actor refuses to create (503) with the flag, the loader or any limit missing, and stores nothing', async () => {
  const loader = { load() {} };
  const broken = [{ INLINE_CODE_ENABLED: undefined }, { INLINE_CODE_ENABLED: 'false' }, { INLINE_CODE_ENABLED: 'TRUE' }, { INLINE_CODE_LOADER: undefined }, { INLINE_CODE_LOADER: {} }, { INLINE_CODE_LOADER: { load: 'x' } },
    ...Object.keys(GOOD).map(name => ({ [name]: undefined }))];
  for (const patch of broken) {
    const db = storage(); let executions = 0;
    const env = { INLINE_CODE_ENABLED: 'true', INLINE_CODE_LOADER: loader, ...GOOD, ...patch };
    const response = await inlineCodeActorFetch({ storage: db }, env, new Request('https://internal/inline-code/create', { method: 'POST', body: JSON.stringify(request(1)) }), { execute: async () => { executions++; } });
    assert.equal(response.status, 503, JSON.stringify(patch));
    assert.equal(db.records.size, 0, JSON.stringify(patch) + ': no budget, marker or job was stored');
    assert.equal(executions, 0);
  }
});

test('both proposed windows are valid and exhaust exactly at the run cap and the money cap together', () => {
  for (const [name, values] of Object.entries(PROPOSED)) {
    const policy = inlineCodePolicy(values);
    assert.ok(policy, name);
    assert.equal(policy.maxRuns * policy.reserveMicros, policy.maxMicros, `${name}: neither cap can be reached before the other`);
  }
});

test('the budget is a lifetime ceiling: after the last permitted run, every further admission is refused even though all jobs finished', async () => {
  const policy = inlineCodePolicy(PROPOSED.dev), db = storage(); let executions = 0;
  const coordinator = createInlineCodeCoordinator({ storage: db, policy, execute: async ({ code, input }) => { executions++; return { status: 'ok', result: 2, stdout: [], sourceSha256: await hash(code), inputSha256: await hash(JSON.stringify(input)) }; } });
  for (let n = 1; n <= policy.maxRuns; n++) {
    await coordinator.create(request(n));
    assert.equal((await coordinator.run(id(n), owner)).phase, 'succeeded');
  }
  assert.equal(executions, policy.maxRuns);
  await assert.rejects(coordinator.create(request(policy.maxRuns + 1)), /allowance is exhausted/);
  assert.deepEqual(await db.get('code:budget'), { policy, runs: policy.maxRuns, reservedMicros: policy.maxMicros }, 'finishing a run never gives its reservation back');
  assert.equal(executions, policy.maxRuns, 'a refused admission never executes');
});

test('a money ceiling below runs x reservation binds first: the surplus runs are refused, not admitted unreserved', async () => {
  const policy = { maxRuns: 100, maxMicros: 15000, reserveMicros: 10000 }, db = storage();
  const coordinator = createInlineCodeCoordinator({ storage: db, policy, execute: async () => { throw Error('must not execute'); } });
  await coordinator.create(request(1));
  await assert.rejects(coordinator.create(request(2)), /allowance is exhausted/);
  assert.equal((await db.get('code:budget')).runs, 1);
});
