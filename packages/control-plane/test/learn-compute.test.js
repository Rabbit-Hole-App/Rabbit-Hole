// Compute usage (usage-limits-spec.md): the rates, the entry, the gate, the month's summary. An in-memory sqlite stands in for D1, as the AI usage tests do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { COMPUTE_DEFAULTS, admitCompute, beginCompute, computeMicros, computeSummary, computeUsage, endCompute, ratePerSec, unitsOf } from '../src/learn-compute.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(sql('0045-compute-usage.sql'));
  const LEARN_DB = { prepare: text => { let args = []; const statement = sqlite.prepare(text); return { bind(...values) { args = values; return this; },
    first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }), run: async () => ({ meta: { changes: statement.run(...args).changes } }) }; } };
  return { sqlite, LEARN_DB };
}
const T0 = Date.UTC(2026, 10, 15, 12) / 1000; // 2026-11-15 12:00 UTC
const base = { userId: 'u-1', kind: 'session', appId: 'repo-1', repo: 'owner/name', commit: 'a'.repeat(40), cpu: 2, memoryGiB: 4 };
const RATE = 2 * 39.42 + 4 * 6.67; // 105.52 micro-USD a second for the 2-core, 4 GiB machine

test('the machine rate is cores and GiB times the two configured rates (Modal sandbox pricing, 2026-11-15); a bad value falls back, never to free', () => {
  assert.equal(COMPUTE_DEFAULTS.cpuCoreSecMicros, 39.42);
  assert.equal(COMPUTE_DEFAULTS.memGibSecMicros, 6.67);
  assert.equal(ratePerSec({}, { cpu: 2, memoryGiB: 4 }), RATE);
  assert.equal(computeMicros({}, { cpu: 2, memoryGiB: 4, seconds: 60 }), Math.ceil(60 * RATE));
  assert.equal(ratePerSec({ COMPUTE_RATE_CPU_CORE_SEC_MICROS: 'abc', COMPUTE_RATE_MEM_GIB_SEC_MICROS: '-3' }, { cpu: 1, memoryGiB: 1 }), 39.42 + 6.67);
  assert.equal(unitsOf(10_000), 1);
});

test('an entry is written once, settles once at its end, and counts against the month it started in', async t => {
  const { sqlite, LEARN_DB } = database(t);
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0, deadlineAt: T0 + 3600 });
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0 + 5, deadlineAt: T0 + 3600 }); // a repeated start is the same machine
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM compute_entries').get().n, 1);
  assert.equal(await endCompute(LEARN_DB, {}, 's1', { endedAt: T0 + 120 }), true);
  assert.equal(await endCompute(LEARN_DB, {}, 's1', { endedAt: T0 + 999 }), false, 'a second end changes nothing');
  const row = sqlite.prepare('SELECT * FROM compute_entries').get();
  assert.deepEqual([row.period, row.status, row.seconds, row.micros], ['2026-11', 'settled', 120, Math.ceil(120 * RATE)]);
});

test('a running machine accrues and reserves its remaining hard time; at Stop the reservation is gone and the time is used', async t => {
  const { LEARN_DB } = database(t);
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0, deadlineAt: T0 + 3600 });
  const live = await computeUsage(LEARN_DB, {}, 'u-1', { now: T0 + 600 });
  assert.equal(live.usedMicros, Math.ceil(600 * RATE));
  assert.equal(live.reservedMicros, Math.ceil(3000 * RATE));
  await endCompute(LEARN_DB, {}, 's1', { endedAt: T0 + 660 });
  const done = await computeUsage(LEARN_DB, {}, 'u-1', { now: T0 + 700 });
  assert.deepEqual([done.reservedMicros, done.usedMicros], [0, Math.ceil(660 * RATE)]);
  assert.equal(done.byMachine[0].minutes, 11);
});

test('a machine still running past its hard deadline is settled at the deadline, never billed unbounded', async t => {
  const { LEARN_DB } = database(t);
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0, deadlineAt: T0 + 3600 });
  const usage = await computeUsage(LEARN_DB, {}, 'u-1', { now: T0 + 7200 });
  assert.equal(usage.usedMicros, Math.ceil(3600 * RATE));
  assert.equal(usage.reservedMicros, 0);
});

test('the gate refuses when the allowance cannot cover the estimate, names the renewal, and admits otherwise', async t => {
  const { LEARN_DB } = database(t);
  const refused = await admitCompute(LEARN_DB, { COMPUTE_MONTHLY_ALLOWANCE_USD: '0.01' }, 'u-1', { kind: 'session', now: T0 }); // US$0.01 is one unit: not even ten minutes
  assert.deepEqual([refused.ok, refused.reason, refused.resetsAt, refused.allowanceUnits], [false, 'compute_exhausted', '2026-12-01T00:00:00.000Z', 1]);
  const admitted = await admitCompute(LEARN_DB, {}, 'u-1', { kind: 'session', now: T0 });
  assert.equal(admitted.ok, true);
  assert.ok(admitted.minutesLeft > 1000, 'US$10 buys about 26 hours of a 2-core machine');
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0, deadlineAt: T0 + 3600 });
  const low = await admitCompute(LEARN_DB, { COMPUTE_MONTHLY_ALLOWANCE_USD: '0.1' }, 'u-1', { kind: 'session', now: T0 + 10 });
  assert.equal(low.ok, false, 'a running machine reserves its hard time');
});

test('an accounting failure is its own reason, never an admit', async () => {
  const broken = { prepare() { throw new Error('no table'); } };
  assert.equal((await admitCompute(broken, {}, 'u-1', {})).reason, 'compute_unavailable');
});

test('the summary is units only, with the machine rows named from the record', async t => {
  const { LEARN_DB } = database(t);
  await beginCompute(LEARN_DB, {}, { ...base, entryId: 's1', startedAt: T0, deadlineAt: T0 + 3600, routeTitle: 'Serve it' });
  await endCompute(LEARN_DB, {}, 's1', { endedAt: T0 + 600 });
  const summary = await computeSummary(LEARN_DB, {}, 'u-1', { now: T0 + 700 }), used = Math.round(Math.ceil(600 * RATE) / 10_000);
  assert.deepEqual([summary.allowanceUnits, summary.usedUnits, summary.reservedUnits, summary.remainingUnits], [1000, used, 0, 1000 - used]);
  assert.deepEqual([summary.byMachine[0].repo, summary.byMachine[0].routeTitle, summary.byMachine[0].kind, summary.byMachine[0].commit], ['owner/name', 'Serve it', 'session', 'aaaaaaa']);
  assert.deepEqual(Object.keys(summary).filter(key => /micro|usd|dollar/i.test(key)), []);
});
