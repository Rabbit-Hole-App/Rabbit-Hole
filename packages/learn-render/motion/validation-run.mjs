// One fixed-fixture render on the Motion render service, with a spend guard and a JSON receipt (plan section 3; RUNBOOK.md).
//   node scripts/motion-render.mjs fixture --run D13 --service <url> --run-id <id> --machine-usd-per-hour <n> [options]
// Single submit, GET polls only, NO automatic retries (render-job.mjs runOnService). The token comes from MOTION_RENDERER_TOKEN
// and is never printed. No model call is possible: the fixture is generated (validation-fixtures.js).
//
// Spend guard: the shared ledger C:/s/spec/budget/budget.mjs (atomic across lanes; no private copy). Before the submit it reserves
// the conservative per-run maximum (machine price x the 420 s service limit x 1.3) under the run id and refuses unless that fits;
// afterwards it settles the actual machine seconds x price. An outcome that is not known (the POST unanswered, polling gave up, any
// exception after the reserve) is marked uncertain and stays counted at the maximum. A run refused before anything ran is released.
// A process that dies leaves its reservation counted: it is reconciled by hand, never forgotten.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stageFor } from './contracts.js';
import { POLLING, runOnService, serviceClient } from './render-job.mjs';
import { fakeService } from './validation-fake-service.mjs';
import { MATRIX, MOTION_RATIOS, SCENES, buildFixture, fixtureErrors } from './validation-fixtures.js';

export const SERVICE_LIMIT_S = 420, SAFETY = 1.3, LANE = 'motion-render';
export const DEFAULT_BUDGET = 'C:/s/spec/budget/budget.mjs';
export const DEFAULT_RECEIPTS = 'C:/s/spec/motion-validation/receipts';
// Refused by the service before anything ran: nothing was spent, the reservation is released.
const NOT_STARTED = new Set(['invalid_job', 'busy', 'degraded', 'unauthorized', 'too_large', 'idempotency_conflict', 'invalid_idempotency_key', 'malformed']);

// Rounded UP to 0.0001 dollar so the same price always reserves the same amount.
export const conservativeMaxUsd = hourlyUsd => {
  if (!(Number.isFinite(hourlyUsd) && hourlyUsd > 0)) throw new Error('--machine-usd-per-hour must be a positive number');
  return Math.ceil((hourlyUsd * SERVICE_LIMIT_S / 3600) * SAFETY * 1e4) / 1e4;
};
export const loadBudget = async (path = DEFAULT_BUDGET) => import(pathToFileURL(path).href);

// Counts the POSTs this process makes to /render (the receipt compares it with what the service says it received).
export function countingFetch(fetchImpl = fetch) {
  let posts = 0;
  return { fetch: (url, init = {}) => { if ((init.method || 'GET') === 'POST' && String(url).includes('/render')) posts++; return fetchImpl(url, init); }, posts: () => posts };
}

const secs = ms => +(ms / 1000).toFixed(2);
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o?.[k] ?? null]));

export function buildReceipt({ runId, fixture, stage, url, harnessRevision, healthBefore, healthAfter, coldStartS, postsMade, outcome, record, renderId, failure, wallS, budget, at }) {
  const final = stage === 'final', st = stageFor(fixture.ratio), scale = fixture.brief.output_requirements.preview_scale;
  const want = final ? { width: st.width, height: st.height, frame_count: fixture.seconds * st.fps } : { width: Math.round(st.width * scale), height: Math.round(st.height * scale), frame_count: fixture.seconds * st.fps };
  const out = final ? pick(record, ['width', 'height', 'duration_seconds', 'frame_count', 'output_bytes']) : { ...pick(record?.preview, ['width', 'height', 'frame_count']), duration_seconds: null, output_bytes: record?.preview?.bytes ?? null };
  const res = record?.resources ?? null;
  const serviceDelta = healthAfter?.counters && healthBefore?.counters ? healthAfter.counters.posts - healthBefore.counters.posts : null;
  return {
    schema: 'motion-validation-receipt/1', run_id: runId, at,
    fixture: { scene: fixture.scene, ratio: fixture.ratio, seconds: fixture.seconds, stage, layers: fixture.layers, beats: fixture.storyboard.beats.length, composition_id: fixture.composition_id, source_bytes: Buffer.byteLength(fixture.source) },
    // The configuration this run ran under, from the service itself (not from what we hoped to deploy).
    service: {
      url, version: healthAfter?.version ?? healthBefore?.version ?? null, boot_id: healthAfter?.boot_id ?? null, harness_revision: harnessRevision,
      settings: record?.settings ?? healthAfter?.settings ?? healthBefore?.settings ?? null, deadline_seconds: record?.deadline_seconds ?? null,
      applied_limits: res ? pick(res, ['backend', 'memory_bytes', 'swap_bytes', 'pids_max', 'cpu_period_us', 'cpu_quota_us', 'cpu_quota']) : null,
    },
    outcome: outcome === 'ready' ? 'success' : 'failure',
    error_class: outcome === 'ready' ? null : (failure?.[0] ?? record?.error ?? 'unknown'),
    detail: outcome === 'ready' ? null : String(failure?.[1] ?? record?.detail ?? '').slice(0, 300),
    render_id: renderId ?? null,
    expected: want,
    output: { ...out, matches_expected: out.width === want.width && out.height === want.height && out.frame_count === want.frame_count },
    wall_s: wallS, cold_start_s: coldStartS,
    service_timings: record?.timings ?? null,
    resources: res ? pick(res, ['memory_peak', 'swap_peak', 'oom_kills', 'pids_peak', 'cpu_nr_periods', 'cpu_throttled', 'cpu_throttled_time_us', 'cpu_usage_us']) : null,
    cleanup_ok: res?.cleanup?.ok ?? null,
    posts: { made_by_harness: postsMade, received_by_service: serviceDelta, proxy_retry_suspected: serviceDelta !== null && serviceDelta > postsMade },
    budget,
  };
}

// -> { refused: reason } or { receipt }. Never throws after the reserve without marking the run uncertain first.
export async function runFixture({ fixture, stage = 'final', runId, hourlyUsd, budget, client, posts, url, harnessRevision = null, pollMs = POLLING.pollMs, waitMs = POLLING.waitMs, sleep = POLLING.sleep, now = POLLING.now, receiptsDir = null, clock = () => new Date().toISOString() }) {
  const errors = fixtureErrors(fixture);
  if (errors.length) return { refused: `the fixture is invalid: ${errors[0]}` };
  const maxUsd = conservativeMaxUsd(hourlyUsd);
  const reserved = budget.reserve(runId, LANE, maxUsd);
  if (!reserved.ok) return { refused: `budget: ${reserved.reason}`, budget: reserved };
  if (reserved.reused) return { refused: `budget: run id ${runId} already has a reservation; a rerun needs a new run id`, budget: reserved };
  let settled = false;
  const book = (fn, ...args) => { settled = true; return fn(...args); };
  try {
    const t0 = now();
    const healthBefore = await client.health().catch(() => null);
    const coldStartS = secs(now() - t0);
    if (!healthBefore) { book(budget.release, runId); return { refused: 'the service did not answer /health; nothing was submitted', budget: budget.status() }; }
    const request = stage === 'final' ? fixture.request : { ...fixture.request, stage };
    const t1 = now();
    const run = await runOnService(client, request, { pollMs, waitMs, sleep, now, jobId: runId });
    const wallS = secs(now() - t1);
    const healthAfter = await client.health().catch(() => null);
    const record = run.record ?? null;
    const outcome = record?.status ?? 'no_record';
    let verdict;
    if (!run.record && run.failure && NOT_STARTED.has(run.failure[0])) verdict = book(budget.release, runId); // refused before it ran
    else if (!record) verdict = book(budget.uncertain, runId); // unanswered POST or polling gave up: cost unknown, counted at the maximum
    else {
      // Machine seconds as the service saw them, at least what the harness waited for the render itself.
      const ran = record.finished_at && record.created_at ? (Date.parse(record.finished_at) - Date.parse(record.created_at)) / 1000 : wallS;
      verdict = book(budget.settle, runId, +(Math.max(ran, 0) * hourlyUsd / 3600).toFixed(6));
    }
    const receipt = buildReceipt({
      runId, fixture, stage, url, harnessRevision, healthBefore, healthAfter, coldStartS, postsMade: posts(), outcome, record, renderId: run.render_id, failure: run.failure, wallS,
      budget: { reserved_max_usd: maxUsd, ledger: verdict, remaining_usd: budget.status().remaining }, at: clock(),
    });
    if (receiptsDir) { mkdirSync(receiptsDir, { recursive: true }); writeFileSync(join(receiptsDir, `${runId}.json`), `${JSON.stringify(receipt, null, 2)}\n`); }
    return { receipt };
  } catch (error) {
    if (!settled) { try { budget.uncertain(runId); } catch { /* the reservation stays counted at its maximum */ } }
    throw error;
  }
}

const gitHead = () => { const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const USAGE = `usage: node scripts/motion-render.mjs fixture (--run D01..D21 | --scene ${Object.keys(SCENES).join('|')} --ratio <ratio> --seconds <5..60> [--stage final|preview])
       --service <url> --run-id <id> --machine-usd-per-hour <n> [--layers n] [--receipts <dir>] [--budget <path to budget.mjs>] [--dry-run]
       ratios: ${MOTION_RATIOS.join(' ')}`;

// -> exit code: 0 success, 1 the render failed, 2 usage, 3 refused before anything ran (nothing was submitted).
export async function main(argv, env, deps = {}) {
  const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const dry = argv.includes('--dry-run');
  const print = deps.print ?? console.log;
  try {
    const entry = opt('--run') ? MATRIX.find(r => r.id === opt('--run')) : null;
    if (opt('--run') && !entry) throw new Error(`--run is one of ${MATRIX.map(r => r.id).join(' ')}`);
    const scene = entry?.scene ?? opt('--scene'), ratio = entry?.ratio ?? opt('--ratio'), seconds = entry?.seconds ?? Number(opt('--seconds')), stage = entry?.stage ?? opt('--stage') ?? 'final';
    if (!['final', 'preview'].includes(stage)) throw new Error('--stage is final or preview');
    const runId = opt('--run-id') ?? (dry ? `dry-${Date.now()}` : null);
    if (!runId) throw new Error('--run-id is required (one id per render; a rerun needs a new id)');
    const url = opt('--service');
    if (!dry && (!url || !env.MOTION_RENDERER_TOKEN)) throw new Error('--service <url> and MOTION_RENDERER_TOKEN (in the environment) are required');
    const fixture = buildFixture({ scene, ratio, seconds, layers: opt('--layers') === undefined ? undefined : Number(opt('--layers')) });
    const counted = countingFetch(deps.fetch ?? (dry ? fakeService().fetch : fetch));
    const client = serviceClient({ url: (url ?? 'http://fake.invalid').replace(/\/$/, ''), token: env.MOTION_RENDERER_TOKEN ?? 'dry-run', fetchImpl: counted.fetch });
    // A dry run never touches the shared ledger: without BUDGET_FILE it books against a throwaway file.
    if (dry && !deps.budget && !env.BUDGET_FILE) process.env.BUDGET_FILE = join(tmpdir(), `motion-dry-run-budget-${process.pid}.json`);
    const budget = deps.budget ?? await loadBudget(opt('--budget'));
    const receiptsDir = opt('--receipts') ?? (dry ? null : DEFAULT_RECEIPTS);
    const r = await runFixture({ fixture, stage, runId, hourlyUsd: Number(opt('--machine-usd-per-hour')), budget, client, posts: counted.posts, url: url ?? 'dry-run', harnessRevision: deps.revision ?? gitHead(), receiptsDir, ...(deps.timing ?? {}) });
    if (r.refused) { print(JSON.stringify({ refused: r.refused, submitted: false })); return 3; }
    print(JSON.stringify(r.receipt, null, 2));
    return r.receipt.outcome === 'success' ? 0 : 1;
  } catch (error) {
    print(`✗ ${error.message}\n${USAGE}`);
    return 2;
  }
}
