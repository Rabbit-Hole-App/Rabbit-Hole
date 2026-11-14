// Build-half sprint item 1: the stage timer fields and the benchmark ledger row. The expected values are read off run 15's saved detail=1 response
// (docs/features/interact/evidence/2026-11-12-clone-runs/runs/15-boundary-capture-fix-READY; the copy in fixtures/interact), a real READY run with one repair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginStage, countStage, endStage, newTiming, timingSummary } from '../src/explain-policy.js';
import { LEDGER_COLUMNS, jobFromDetail, ledgerMarkdown, ledgerRow, repairCauses } from '../src/interact-ledger.js';
import { TOSS_MVP_META } from '../../web/src/interact-toss-mvp-plans.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/interact/run15-job-detail.json', import.meta.url));
test('a job pinned to a toss-mvp-<depth> fixture carries designModel, designKind and msFill from the data file meta; every other row reads null', () => {
  const base = jobFromDetail(detail());
  const mvp = ledgerRow({ ...base, designFixture: 'toss-mvp-balanced' });
  assert.deepEqual([mvp.fixture, mvp.designModel, mvp.designKind, mvp.msFill], ['toss-mvp-balanced', TOSS_MVP_META.balanced.designModel, 'brief-mvp', TOSS_MVP_META.balanced.msFill ?? null]);
  assert.deepEqual([ledgerRow({ ...base, designFixture: 'toss-mvp-detailed' }).designKind, ledgerRow({ ...base, designFixture: 'toss-mvp-detailed' }).designModel], ['brief-mvp', TOSS_MVP_META.detailed?.designModel ?? null], 'a depth with no meta still says brief-mvp');
  for (const fixture of [null, 'toss', 'toss-overview', 'ledge-toss-moon', 'toss-mvp-unknown']) assert.deepEqual([ledgerRow({ ...base, designFixture: fixture }).designModel, ledgerRow({ ...base, designFixture: fixture }).designKind, ledgerRow({ ...base, designFixture: fixture }).msFill], [null, null, null], String(fixture));
  assert.deepEqual(LEDGER_COLUMNS.slice(-3), ['designModel', 'designKind', 'msFill'], 'the new columns are the last three');
  assert.match(ledgerMarkdown([mvp]).split('\n')[0], /\| designModel \| designKind \| msFill \|$/, 'the markdown header ends with them');
});

const SCRIPT = fileURLToPath(new URL('../../../scripts/interact/ledger.mjs', import.meta.url));
const detail = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('run 15: the row holds the factual columns first, then the stage milliseconds, all read off the record', () => {
  const row = ledgerRow(jobFromDetail(detail()));
  assert.deepEqual(Object.keys(row), [...LEDGER_COLUMNS]);
  assert.deepEqual(Object.fromEntries(Object.entries(row).slice(0, 20)), {
    jobId: 'ej_a7e7bb226e614a02b5a426e30218f615', planHash: '8f564bdfc1479ad31db521eea57fa45642a45fc606ba5a0acfa4e2a0c9225117', depth: 'balanced', result: 'ready', stopReason: 'accepted',
    oracleId: null, oracleChecked: null, oracleFailed: 0, bindingProblems: 0, overlapProblems: 0, repairs: 1, repairCauses: 'review:spec', profile: null, fixture: null, authorModel: 'claude-opus-5-5', fallbackFired: false, judgeVerdict: null, judgeMajor: null, judgeCostUsd: null,
    costUsd: 0.620628 });
  // Stage times: authoring 65.9 s, validating 25 + 20 ms, rendering 18.4 + 11.7 s, reviewing 37.8 + 38.4 s, repairing 49.2 s, generate to ready 221.4 s.
  // msAuthor is the provider round trip (65.86 s), the rest of the authoring stage (50 ms) is msCompose; a record without the timing v2 marker is timing v1.
  assert.deepEqual([row.msSteer, row.msAuthor, row.msValidate, row.msRun, row.msCheck, row.msCompose, row.msReview, row.msRepair, row.msTotal, row.msJudge, row.timing], [null, 65860, 45, 30098, null, 50, 76187, 49185, 221425, null, 'v1']);
});

test('profile and fixture are the grouping columns: the flow profile id and the pinned design fixture, null when absent', () => {
  const job = jobFromDetail(detail());
  assert.deepEqual([ledgerRow(job).profile, ledgerRow(job).fixture], [null, null]);
  const row = ledgerRow({ ...job, flow: { version: 1, profile: { id: 'opus-baseline', hash: 'h' } }, designFixture: 'toss-drop-standard-controls' });
  assert.deepEqual([row.profile, row.fixture], ['opus-baseline', 'toss-drop-standard-controls']);
  assert.deepEqual(Object.keys(row).slice(12, 15), ['profile', 'fixture', 'authorModel']);
});

test('the cost is the four settled calls (63 credits on the clone) and an unpriced call makes it unknown, never smaller', () => {
  const job = jobFromDetail(detail());
  assert.equal(ledgerRow(job).costUsd, 0.620628);
  job.calls[1] = { ...job.calls[1], costMicros: null };
  assert.equal(ledgerRow(job).costUsd, null);
  job.calls[1] = { ...job.calls[1], status: 'refused', costMicros: 0 };
  assert.equal(ledgerRow(job).costUsd, (199702 + 181897 + 110649) / 1e6, 'a refused call cost nothing');
});

test('the check columns count the deterministic problems a failed round recorded, by code', () => {
  const job = jobFromDetail(detail());
  job.findings = [...job.findings,
    { round: 0, stage: 'rendering', problems: ['[numeric_mismatch] velocity at cp-top is 1, expected 0 (tolerance 1e-6)', '[quantity_missing] the trace has no "x"', '[overlap] "a" overlaps "b" (label, 4 x 2 px) at "start"', '[control_no_effect] moving "Speed" changed nothing'] },
    { round: 0, stage: 'validating', problems: ['controls.speed: the binding is not an input of the program'] }];
  job.build = { check: { oracle: { checked: 7 } }, ms: { run: 1200, check: 30 } };
  const row = ledgerRow(job);
  assert.deepEqual([row.oracleChecked, row.oracleFailed, row.bindingProblems, row.overlapProblems], [7, 2, 2, 1]);
  assert.deepEqual([row.msRun, row.msCheck], [30068, 30], 'msCheck is timed in the body; msRun is the rendering stages less msCheck');
});

test('a fallback, a judge verdict and its major findings reach the row; a job still running is not a result', () => {
  const job = jobFromDetail(detail());
  job.calls[0] = { ...job.calls[0], fallback: true };
  job.bench = { judge: { model: 'claude-sonnet-5-5', verdict: 'fail', findings: [{ severity: 'major' }, { severity: 'minor' }, { severity: 'major' }], ms: 4000, costMicros: 20000 } };
  const row = ledgerRow(job);
  assert.deepEqual([row.fallbackFired, row.judgeVerdict, row.judgeMajor, row.judgeCostUsd, row.costUsd], [true, 'fail', 2, 0.02, 0.620628], 'the platform-paid judge is its own column, outside the learner-paid total');
  assert.deepEqual(Object.keys(row).slice(Object.keys(row).indexOf('judgeMajor'), Object.keys(row).indexOf('judgeMajor') + 3), ['judgeMajor', 'judgeCostUsd', 'costUsd']);
  // A failed judge call keeps its cost; an unpriced one, an interrupted one and no judge at all are null.
  assert.equal(ledgerRow({ ...job, bench: { error: { code: 'error', costMicros: 15000 } } }).judgeCostUsd, 0.015);
  assert.equal(ledgerRow({ ...job, bench: { error: { code: 'interrupted', costMicros: null } } }).judgeCostUsd, null);
  assert.equal(ledgerRow({ ...job, bench: undefined }).judgeCostUsd, null);
  assert.equal(ledgerRow({ ...job, stage: 'rendering' }).result, 'running');
  assert.equal(ledgerRow({ ...job, stage: 'failed', stopReason: 'rounds' }).result, 'failed');
});

test('countStage keeps the model, cost, fallback and repair round of a stage, an unknown cost as null, and a stage with no model call carries none', () => {
  const timing = newTiming('simple', 0);
  beginStage(timing, 'authoring', 10);
  countStage(timing, { calls: 1, model: { requested: 'gemini-3.5-flash-lite', served: 'gemini-3.5-flash-lite-20261101' }, costMicros: 120, fallback: true, repairRound: 0 });
  endStage(timing, 'done', 20);
  beginStage(timing, 'repairing', 20);
  countStage(timing, { calls: 1, model: { requested: 'claude-opus-5-5', served: null }, costMicros: 50, fallback: false, repairRound: 1 });
  countStage(timing, { calls: 1, model: { requested: 'claude-opus-5-5', served: null }, costMicros: null, fallback: false, repairRound: 1 });
  endStage(timing, 'done', 40);
  beginStage(timing, 'rendering', 40); countStage(timing, { captures: 3 }); endStage(timing, 'done', 50);
  const [a, r, c] = timingSummary(timing).stages;
  assert.deepEqual([a.model, a.costMicros, a.fallback, a.repairRound], [{ requested: 'gemini-3.5-flash-lite', served: 'gemini-3.5-flash-lite-20261101' }, 120, true, 0]);
  assert.deepEqual([r.costMicros, r.fallback, r.repairRound], [null, false, 1]);
  assert.equal('model' in c, false);
});

test('ledger.md renders the run-15 row under the same columns', () => {
  const md = ledgerMarkdown([ledgerRow(jobFromDetail(detail()))]);
  const [head, rule, line] = md.trim().split('\n');
  assert.equal(head, `| ${LEDGER_COLUMNS.join(' | ')} |`);
  assert.equal(rule.split('|').length, head.split('|').length);
  assert.match(line, /^\| ej_a7e7bb226e614a02b5a426e30218f615 \| 8f564bdf\w+ \| balanced \| ready \| accepted \|/);
  assert.match(line, /\| 0\.620628 \|  \| 65860 \| 45 \| 30098 \|  \| 50 \| 76187 \| 49185 \| 221425 \|  \| v1 \| model \|  \|  \|  \|  \|  \|$/); // buildKind, msHopWait, judgeFindingsPath, designModel, designKind and msFill are the last six columns (a model build: buildKind model, no hop wait, no judge findings file, no pinned design)
});

test('the script appends one line per job to ledger.jsonl and regenerates ledger.md; a rerun replaces the line (dry run on the saved response, no network)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  try {
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [SCRIPT, '--from', FIXTURE, '--dir', dir]);
    const lines = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0], ledgerRow(jobFromDetail(detail())));
    assert.match(readFileSync(join(dir, 'ledger.md'), 'utf8'), /ej_a7e7bb226e614a02b5a426e30218f615/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the script writes the full judge findings to judge/<jobId>.json and puts the path in the row; a job with no judge writes no file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-judge-'));
  try {
    const findings = [{ capture: 'start', category: 'spec', severity: 'major', object: 'vec.v', message: 'a quoted finding' }, { capture: 'cp-top', category: 'spec', severity: 'minor', message: 'another' }];
    const judged = detail(); judged.diagnostics.bench = { ...(judged.diagnostics.bench ?? {}), judge: { model: 'claude-sonnet-5-5', verdict: 'fail', findings, costMicros: 24460, ms: 6871 } };
    const file = join(dir, 'judged-detail.json'); writeFileSync(file, JSON.stringify(judged));
    execFileSync(process.execPath, [SCRIPT, '--from', file, '--dir', dir]);
    const [row] = readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(row.judgeFindingsPath, `judge/${row.jobId}.json`);
    assert.deepEqual([row.judgeVerdict, row.judgeMajor], ['fail', 1], 'the counts stay in the row');
    const saved = JSON.parse(readFileSync(join(dir, row.judgeFindingsPath), 'utf8'));
    assert.deepEqual([saved.jobId, saved.verdict, saved.judgeModel], [row.jobId, 'fail', 'claude-sonnet-5-5']);
    assert.deepEqual(saved.findings, findings, 'every finding, in full');
    // no judge in the detail: no file, the path stays null
    const bare = mkdtempSync(join(tmpdir(), 'ledger-nojudge-'));
    try {
      execFileSync(process.execPath, [SCRIPT, '--from', FIXTURE, '--dir', bare]);
      assert.equal(JSON.parse(readFileSync(join(bare, 'ledger.jsonl'), 'utf8').trim()).judgeFindingsPath, null);
      assert.equal(existsSync(join(bare, 'judge')), false);
    } finally { rmSync(bare, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('repairCauses names what triggered each failed round, from the night\'s real problem texts, in order', () => {
  const failed = (round, stage, ...problems) => ({ round, stage, problems });
  const findings = [
    failed(0, 'authoring', 'main: manifest.readouts.1.labels: state labels must be unique'),
    failed(1, 'rendering', '[program_error] the program failed at "initial state" (runtime_error): RangeError: sdk.panel: the lane is too narrow for its title and state', '[program_error] the program failed at "At the top" (runtime_error): RangeError: sdk.panel: the lane is too narrow for its title and state'),
    failed(2, 'rendering', '[program_error] the program failed at "initial state" (runtime_error): Error: readout needs more room for its label'),
    failed(3, 'rendering', '[program_error] the program failed at "initial state" (invalid_output): frame.objects.10.series.0.points: Too big: expected array to have <=24 items'),
    failed(4, 'rendering', '[overlap] "accArrowL" overlaps "frame" (text-frame, 0 x 28.4 px) at "endpoint" - keep it inside', '[overlap] "a" overlaps "b" (text-box, 9 x 18 px) at "x"', '[numeric_mismatch] velocity at cp-top is 1, expected 0'),
    failed(5, 'authoring', 'mode.timeline.label: timeline label "undefined" is not the approved "Time since launch"'),
    { round: 6, stage: 'reviewing', accepted: false, findings: [{ category: 'spec', severity: 'major', message: 'x' }] },
    { round: 7, stage: 'reviewing', accepted: true, findings: [] },
  ];
  assert.equal(repairCauses(findings), 'schema:manifest.readouts.*.labels; program_error:sdk.panel; program_error:readout needs more room for its label; program_error:frame.objects.*.series.*.points; overlap:text-frame; overlap:text-box; numeric_mismatch; schema:mode.timeline.label; review:spec');
  assert.equal(repairCauses([{ round: 0, stage: 'reviewing', accepted: true, findings: [] }]), '', 'an accepted round triggered nothing');
});

test('timing v2: msTotal is Generate to ready, the stage columns are contiguous slices of it, and msJudge is the shadow judge outside it', () => {
  const timing = newTiming('simple', 0);
  timing.marks.generate = 1000;
  beginStage(timing, 'authoring', 1000); endStage(timing, 'done', 1700);          // 700: a 500 ms provider call, 200 ms to seal and compose
  beginStage(timing, 'validating', 1700); endStage(timing, 'done', 2000);          // 300
  beginStage(timing, 'rendering', 2000); endStage(timing, 'done', 2600);           // 600 = capture 520, check 20, accept 60
  timing.marks.result = 2600;
  const job = { id: 'j', stage: 'ready', stopReason: 'accepted', timing, calls: [{ role: 'build_author', status: 'settled', startedAt: 1000, endedAt: 1500, costMicros: 1 }], findings: [],
    build: { ms: { run: 0, check: 20, compose: 60 } }, bench: { judge: { verdict: 'pass', findings: [], ms: 4321, costMicros: 10 } } };
  const row = ledgerRow(job);
  assert.deepEqual([row.timing, row.msTotal, row.msAuthor, row.msCompose, row.msValidate, row.msRun, row.msCheck, row.msJudge, row.msRepair, row.msReview], ['v2', 1600, 500, 260, 300, 520, 20, 4321, null, null]);
  assert.equal(row.msAuthor + row.msCompose + row.msValidate + row.msRun + row.msCheck, row.msTotal, 'the slices add up to msTotal');
});
