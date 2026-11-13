// Build-half sprint item 1: the stage timer fields and the benchmark ledger row. The expected values are read off run 15's saved detail=1 response
// (docs/features/interact/evidence/2026-11-12-clone-runs/runs/15-boundary-capture-fix-READY; the copy in fixtures/interact), a real READY run with one repair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginStage, countStage, endStage, newTiming, timingSummary } from '../src/explain-policy.js';
import { LEDGER_COLUMNS, jobFromDetail, ledgerMarkdown, ledgerRow } from '../src/interact-ledger.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/interact/run15-job-detail.json', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../../scripts/interact/ledger.mjs', import.meta.url));
const detail = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('run 15: the row holds the factual columns first, then the stage milliseconds, all read off the record', () => {
  const row = ledgerRow(jobFromDetail(detail()));
  assert.deepEqual(Object.keys(row), [...LEDGER_COLUMNS]);
  assert.deepEqual(Object.fromEntries(Object.entries(row).slice(0, 18)), {
    jobId: 'ej_a7e7bb226e614a02b5a426e30218f615', planHash: '8f564bdfc1479ad31db521eea57fa45642a45fc606ba5a0acfa4e2a0c9225117', depth: 'balanced', result: 'ready', stopReason: 'accepted',
    oracleId: null, oracleChecked: null, oracleFailed: 0, bindingProblems: 0, overlapProblems: 0, repairs: 1, profile: null, fixture: null, authorModel: 'claude-opus-5-5', fallbackFired: false, judgeVerdict: null, judgeMajor: null,
    costUsd: 0.620628 });
  // Stage times: authoring 65.9 s, validating 25 + 20 ms, rendering 18.4 + 11.7 s, reviewing 37.8 + 38.4 s, repairing 49.2 s, generate to ready 221.4 s.
  assert.deepEqual([row.msSteer, row.msAuthor, row.msValidate, row.msRun, row.msCheck, row.msReview, row.msRepair, row.msTotal], [null, 65910, 45, 30098, null, 76187, 49185, 221425]);
});

test('profile and fixture are the grouping columns: the flow profile id and the pinned design fixture, null when absent', () => {
  const job = jobFromDetail(detail());
  assert.deepEqual([ledgerRow(job).profile, ledgerRow(job).fixture], [null, null]);
  const row = ledgerRow({ ...job, flow: { version: 1, profile: { id: 'opus-baseline', hash: 'h' } }, designFixture: 'toss-drop-standard-controls' });
  assert.deepEqual([row.profile, row.fixture], ['opus-baseline', 'toss-drop-standard-controls']);
  assert.deepEqual(Object.keys(row).slice(11, 14), ['profile', 'fixture', 'authorModel']);
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
  assert.deepEqual([row.msRun, row.msCheck], [1200, 30], 'the timed capture and check replace the whole rendering stage');
});

test('a fallback, a judge verdict and its major findings reach the row; a job still running is not a result', () => {
  const job = jobFromDetail(detail());
  job.calls[0] = { ...job.calls[0], fallback: true };
  job.bench = { judge: { model: 'claude-sonnet-5-5', verdict: 'fail', findings: [{ severity: 'major' }, { severity: 'minor' }, { severity: 'major' }], ms: 4000, costMicros: 20000 } };
  const row = ledgerRow(job);
  assert.deepEqual([row.fallbackFired, row.judgeVerdict, row.judgeMajor, row.costUsd], [true, 'fail', 2, 0.640628]);
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
  assert.match(line, /\| 0\.620628 \|  \| 65910 \| 45 \| 30098 \|  \| 76187 \| 49185 \| 221425 \|$/);
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
