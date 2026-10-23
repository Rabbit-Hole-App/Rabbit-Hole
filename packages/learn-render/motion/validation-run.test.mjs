// The fixed-fixture run: spend guard, single submit, receipt. Against the fake service only: no network, no Fly, no model, no money.
// The shared ledger (C:/s/spec/budget/budget.mjs) is stood in for by a fake with its contract; one test drives the real module on a
// temp BUDGET_FILE when it is present on this machine. The real ledger file is never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceClient } from './render-job.mjs';
import { DEFAULT_BUDGET, conservativeMaxUsd, countingFetch, loadBudget, main, runFixture } from './validation-run.mjs';
import { fakeService } from './validation-fake-service.mjs';
import { MATRIX, buildFixture } from './validation-fixtures.js';

// The contract of budget.mjs: reserve (ok / refused / reused), settle, uncertain, release, status.
function fakeBudget({ cap = 20, spent = 0 } = {}) {
  const entries = new Map();
  const counted = e => (e.status === 'settled' ? e.actual : e.status === 'released' ? 0 : e.max);
  const status = () => ({ remaining: +(cap - spent - [...entries.values()].reduce((n, e) => n + counted(e), 0)).toFixed(4) });
  return {
    entries, status,
    reserve: (runId, lane, max) => {
      const e = entries.get(runId);
      if (e) return e.max === max && e.lane === lane ? { ok: true, reused: true } : { ok: false, reason: 'run id reused with different inputs' };
      if (max > status().remaining + 1e-9) return { ok: false, reason: 'over cap', ...status() };
      entries.set(runId, { lane, max, status: 'reserved' });
      return { ok: true, ...status() };
    },
    settle: (runId, actual) => { const e = entries.get(runId); if (e.status === 'settled') return { ok: false, reason: 'already settled' }; Object.assign(e, { status: 'settled', actual }); return { ok: true, ...status() }; },
    uncertain: runId => { entries.get(runId).status = 'uncertain'; return { ok: true, ...status() }; },
    release: runId => { entries.get(runId).status = 'released'; return { ok: true, ...status() }; },
  };
}
const HOURLY = 0.0904;
const instant = { pollMs: 0, sleep: async () => {} };

function harness(behavior, options = {}) {
  const fake = fakeService({ behavior, ...options.fake });
  const counted = countingFetch(fake.fetch);
  const client = serviceClient({ url: 'http://fake.invalid', token: 'x'.repeat(40), fetchImpl: counted.fetch });
  const budget = options.budget ?? fakeBudget();
  const run = (runId, fixtureOptions = { scene: 'medium', ratio: '16:9', seconds: 15 }, extra = {}) =>
    runFixture({ fixture: buildFixture(fixtureOptions), stage: extra.stage ?? 'final', runId, hourlyUsd: HOURLY, budget, client, posts: counted.posts, url: 'http://fake.invalid', harnessRevision: 'rev1', ...instant, ...extra });
  return { fake, budget, run, client, counted };
}
const posts = fake => fake.log.filter(l => l.startsWith('POST'));

test('the per-run maximum is the machine price x the 420 s service limit x 1.3, rounded up to 0.0001 dollar', () => {
  assert.equal(conservativeMaxUsd(0.0904), 0.0138); // 0.0904 x 420 / 3600 x 1.3 = 0.013711
  assert.equal(conservativeMaxUsd(1.25), 0.1896); // 0.18958
  for (const bad of [0, -1, NaN, Infinity, undefined]) assert.throws(() => conservativeMaxUsd(bad), /positive number/);
});

test('guard: nothing is submitted when the reservation is refused (over cap, or a run id already used)', async () => {
  const a = harness('ready', { budget: fakeBudget({ spent: 19.99 }) });
  const over = await a.run('r1');
  assert.match(over.refused, /budget: over cap/);
  assert.deepEqual(a.fake.log, []); // not even a health read
  const b = harness('ready');
  assert.ok((await b.run('r2')).receipt);
  const again = await b.run('r2');
  assert.match(again.refused, /already has a reservation/);
  assert.equal(posts(b.fake).length, 1);
  const bad = await harness('ready').run('r3', undefined, { hourlyUsd: -1 }).catch(e => e);
  assert.match(String(bad.message), /positive number/);
});

test('a successful run: ONE POST, GET polls only, the reservation settled at machine seconds x price, a full receipt', async () => {
  const h = harness('ready', { fake: { polls: 3 } });
  const { receipt: r } = await h.run('mv-D01');
  assert.equal(posts(h.fake).length, 1);
  assert.ok(h.fake.log.filter(l => l.startsWith('GET /render/')).length >= 3);
  assert.equal(h.fake.log.some(l => l.startsWith('DELETE')), false);
  assert.deepEqual([r.schema, r.run_id, r.outcome, r.error_class], ['motion-validation-receipt/1', 'mv-D01', 'success', null]);
  assert.deepEqual(r.output, { width: 1920, height: 1080, duration_seconds: 15, frame_count: 450, output_bytes: 450 * 4000, matches_expected: true });
  assert.deepEqual(r.service_timings, { bundle: 12.5, preview: 30, final: 40, total: 110 });
  assert.deepEqual(r.resources.memory_peak, 1.2 * 1024 ** 3);
  assert.equal(r.resources.cpu_throttled_time_us, 2000000);
  assert.equal(r.cleanup_ok, true);
  assert.deepEqual([r.service.settings.git_revision, r.service.settings.cpus, r.service.settings.memory_gib, r.service.applied_limits.cpu_quota], ['fake-revision', 1.5, 3, 1.5]);
  assert.equal(r.service.harness_revision, 'rev1');
  assert.deepEqual(r.posts, { made_by_harness: 1, received_by_service: 1, proxy_retry_suspected: false });
  assert.equal(typeof r.cold_start_s, 'number');
  assert.equal(r.fixture.layers, 40);
  const entry = h.budget.entries.get('mv-D01');
  assert.equal(entry.status, 'settled');
  assert.equal(entry.max, 0.0138);
  assert.equal(entry.actual, +(120 * HOURLY / 3600).toFixed(6)); // the fake render ran 120 s
  assert.equal(r.budget.reserved_max_usd, 0.0138);
  assert.equal(JSON.stringify(r).includes('xxxxxxxx'), false); // the token is never in a receipt
});

test('every ratio and both stages: the receipt compares output size and frame count with what the ratio and stage must produce', async () => {
  const h = harness('ready');
  for (const run of MATRIX.filter(m => m.seconds === 15 && m.scene === 'medium')) {
    const { receipt } = await h.run(`mv-${run.id}`, run);
    assert.equal(receipt.output.matches_expected, true, run.id);
    assert.deepEqual([receipt.output.width, receipt.output.height], [receipt.expected.width, receipt.expected.height]);
  }
  const preview = (await h.run('mv-D21', MATRIX.find(m => m.id === 'D21'), { stage: 'preview' })).receipt;
  assert.deepEqual(preview.expected, { width: 864, height: 486, frame_count: 1800 });
  assert.equal(preview.output.matches_expected, true);
});

test('a render that failed on the service is a known outcome: settled, with the error class', async () => {
  const h = harness('failed');
  const { receipt: r } = await h.run('mv-fail');
  assert.deepEqual([r.outcome, r.error_class, r.output.matches_expected], ['failure', 'timeout', false]);
  assert.equal(h.budget.entries.get('mv-fail').status, 'settled');
  assert.equal(posts(h.fake).length, 1);
});

test('refused before it ran (busy, invalid): released, nothing spent, still one POST and no retry', async () => {
  for (const [behavior, cls] of [['busy', 'busy'], ['invalid', 'invalid_job']]) {
    const h = harness(behavior);
    const { receipt: r } = await h.run(`mv-${behavior}`);
    assert.equal(r.error_class, cls);
    assert.equal(h.budget.entries.get(`mv-${behavior}`).status, 'released');
    assert.equal(posts(h.fake).length, 1);
  }
});

test('an unanswered POST is UNCERTAIN (counted at the maximum), and is not retried', async () => {
  const h = harness('throw');
  const { receipt: r } = await h.run('mv-lost');
  assert.deepEqual([r.outcome, r.error_class], ['failure', 'unreachable']);
  assert.equal(h.budget.entries.get('mv-lost').status, 'uncertain');
  assert.equal(posts(h.fake).length, 1);
});

test('polling that gives up is UNCERTAIN and the render is stopped on the service', async () => {
  const h = harness('hang');
  let clock = 0;
  const { receipt: r } = await h.run('mv-hang', undefined, { waitMs: 1000, now: () => (clock += 400), sleep: async () => {} });
  assert.equal(r.error_class, 'timeout');
  assert.equal(h.budget.entries.get('mv-hang').status, 'uncertain');
  assert.equal(h.fake.log.filter(l => l.startsWith('DELETE')).length, 1);
  assert.equal(posts(h.fake).length, 1);
});

test('an exception after the reserve marks the run uncertain before it propagates', async () => {
  const h = harness('hang');
  await assert.rejects(h.run('mv-boom', undefined, { sleep: async () => { throw new Error('disk on fire'); } }), /disk on fire/);
  assert.equal(h.budget.entries.get('mv-boom').status, 'uncertain');
});

test('a service that sees a POST twice (a retrying proxy) is flagged in the receipt', async () => {
  const h = harness('proxy-retry');
  const { receipt: r } = await h.run('mv-proxy');
  assert.deepEqual(r.posts, { made_by_harness: 1, received_by_service: 2, proxy_retry_suspected: true });
});

test('the CLI: dry run (fake service, throwaway ledger), usage errors, refusals and exit codes', async () => {
  const out = [];
  const print = line => out.push(line);
  const dir = mkdtempSync(join(tmpdir(), 'motion-receipts-'));
  try {
    const code = await main(['--run', 'D13', '--dry-run', '--machine-usd-per-hour', '0.0904', '--run-id', 'dry-1', '--receipts', dir], {}, { print, budget: fakeBudget(), revision: 'rev1', timing: instant });
    assert.equal(code, 0);
    const receipt = JSON.parse(out.at(-1));
    assert.deepEqual([receipt.fixture.seconds, receipt.fixture.ratio, receipt.output.width, receipt.output.height], [60, '16:9', 1920, 1080]);
    assert.deepEqual(readdirSync(dir), ['dry-1.json']);
    assert.equal(JSON.parse(readFileSync(join(dir, 'dry-1.json'), 'utf8')).run_id, 'dry-1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const usage = async (argv, env = {}) => { out.length = 0; return [await main(argv, env, { print, budget: fakeBudget(), timing: instant }), out.join('\n')]; };
  assert.equal((await usage(['--run', 'D99', '--dry-run', '--machine-usd-per-hour', '1']))[0], 2);
  assert.match((await usage(['--run', 'D01', '--machine-usd-per-hour', '1', '--service', 'https://x.invalid', '--run-id', 'a']))[1], /MOTION_RENDERER_TOKEN/);
  assert.match((await usage(['--run', 'D01', '--service', 'https://x.invalid', '--machine-usd-per-hour', '1'], { MOTION_RENDERER_TOKEN: 't'.repeat(40) }))[1], /--run-id is required/);
  assert.equal((await usage(['--scene', 'medium', '--ratio', '16:9', '--seconds', '15', '--dry-run', '--machine-usd-per-hour', '0']))[0], 2);
  out.length = 0;
  const refused = await main(['--run', 'D01', '--dry-run', '--machine-usd-per-hour', '1', '--run-id', 'big'], {}, { print, budget: fakeBudget({ spent: 19.95 }), timing: instant });
  assert.equal(refused, 3);
  assert.deepEqual(JSON.parse(out.at(-1)), { refused: 'budget: over cap', submitted: false });
});

test('the real shared ledger module (when present) accepts, refuses and books this guard on a temp BUDGET_FILE', { skip: !existsSync(DEFAULT_BUDGET) && 'C:/s/spec/budget/budget.mjs is not on this machine' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-budget-'));
  process.env.BUDGET_FILE = join(dir, 'budget.json');
  try {
    const budget = await loadBudget();
    const h = harness('ready', { budget });
    const { receipt } = await h.run('mv-real-1');
    assert.equal(receipt.outcome, 'success');
    assert.equal(budget.status().spent > 0, true);
    assert.match((await h.run('mv-real-1')).refused, /already has a reservation/);
    const lost = harness('throw', { budget });
    await lost.run('mv-real-2');
    assert.equal(budget.status().reserved, 0.0138); // uncertain stays counted at the maximum
    assert.equal(budget.reserve('mv-real-3', 'motion-render', 99).ok, false);
  } finally { delete process.env.BUDGET_FILE; rmSync(dir, { recursive: true, force: true }); }
});
