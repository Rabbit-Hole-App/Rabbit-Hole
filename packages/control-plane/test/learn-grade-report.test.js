// packages/control-plane/test/learn-grade-report.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportFrom, rate, percentile } from '../src/learn-grade-report.js';

const doneRow = (ideas, baseline, extra = {}) => ({
  mode: 'challenge', status: 'done', old_enough: 1, grader_protocol_version: 'jev-grade-p1',
  jev: JSON.stringify({ ideas, misconception: 0.05, non_attempt: 0.05 }), jev_ms: 120, jev_cost: 0.00001,
  baseline_verdict: baseline, baseline_ms: baseline === undefined ? null : 4000, ...extra,
});
const agreeing = n => Array.from({ length: n }, () => doneRow([0.9, 0.9], 'good'));

// Review focus 5: nothing to report is not a division by zero.
test('no rows: nulls, not NaN, and not decision-grade with reasons', () => {
  const report = reportFrom([]);
  assert.equal(report.overall.total, 0);
  assert.equal(report.overall.eligible, 0);
  assert.deepEqual(report.overall.agreement, { k: 0, n: 0, pct: null });
  assert.deepEqual(report.overall.baseline.parsed, { k: 0, n: 0, pct: null });
  assert.equal(report.overall.jev_ms.p50, null);
  assert.equal(report.overall.jev_cost_per_grade.mean, null);
  assert.equal(report.overall.decision_grade, false);
  assert.equal(report.overall.notice, 'agreement not decision-grade: no eligible rows; agreement N 0 < 50');
});

test('60 agreeing, fully captured rows are decision-grade', () => {
  const report = reportFrom(agreeing(60));
  assert.deepEqual(report.overall.agreement, { k: 60, n: 60, pct: 100 });
  assert.equal(report.overall.decision_grade, true);
  assert.equal(report.overall.notice, null);
  assert.deepEqual(report.by_mode.explain_back.agreement, { k: 0, n: 0, pct: null });
});

test('unsure counts as a disagreement and shows in the table', () => {
  const report = reportFrom([...agreeing(59), doneRow([0.9, 0.5], 'good')]);
  assert.deepEqual(report.overall.agreement, { k: 59, n: 60, pct: 98.3 });
  assert.equal(report.overall.table.unsure.good, 1);
  assert.deepEqual(report.overall.unsure, { k: 1, n: 60, pct: 1.7 });
});

test('each gate names its reason', () => {
  const unparsed = reportFrom([...agreeing(56), ...Array.from({ length: 4 }, () => doneRow([0.9, 0.9], null, { baseline_ms: 3000 }))]);
  assert.match(unparsed.overall.notice, /baseline parsed 56\/60 < 95%/);
  assert.deepEqual(unparsed.overall.baseline.unparsed, { k: 4, n: 60, pct: 6.7 });
  const failures = reportFrom([...agreeing(60), ...Array.from({ length: 4 }, () => ({ ...doneRow([0.9], 'good'), status: 'failed', jev: null }))]);
  assert.match(failures.overall.notice, /Jev failed\+incomplete 4\/64 > 5%/);
  const incompletes = reportFrom([...agreeing(60), ...Array.from({ length: 4 }, () => ({ ...doneRow([0.9], 'good'), status: 'incomplete', jev: null }))]);
  assert.match(incompletes.overall.notice, /Jev failed\+incomplete 4\/64 > 5%/);
  assert.deepEqual(incompletes.overall.jev.incomplete, { k: 4, n: 64, pct: 6.3 });
  assert.deepEqual(incompletes.overall.fallback, { k: 4, n: 64, pct: 6.3 });
  const small = reportFrom(agreeing(49));
  assert.match(small.overall.notice, /agreement N 49 < 50/);
});

test('young rows and old-protocol rows count in the total but not the rates', () => {
  const report = reportFrom([...agreeing(2), doneRow([0.9, 0.9], 'good', { old_enough: 0 }), doneRow([0.9, 0.9], 'good', { grader_protocol_version: 'jev-grade-p0' })]);
  assert.equal(report.overall.total, 4);
  assert.equal(report.overall.eligible, 2);
  assert.deepEqual(report.overall.baseline.captured, { k: 2, n: 2, pct: 100 });
});

test('captured, missing and unparsed are over eligible rows only', () => {
  const report = reportFrom([doneRow([0.9], 'good'), doneRow([0.9], undefined), doneRow([0.9], null, { baseline_ms: 9000 })]);
  assert.deepEqual(report.overall.baseline.captured, { k: 2, n: 3, pct: 66.7 });
  assert.deepEqual(report.overall.baseline.missing, { k: 1, n: 3, pct: 33.3 });
  assert.deepEqual(report.overall.baseline.unparsed, { k: 1, n: 3, pct: 33.3 });
  assert.equal(report.overall.baseline_ms.n, 2);
});

test('verdicts are recomputed with the thresholds given', () => {
  const report = reportFrom(agreeing(1), { thresholds: { yes: 0.95, no: 0.3 } });
  assert.equal(report.overall.table.unsure.good, 1);
});

test('rate and percentile helpers', () => {
  assert.deepEqual(rate(1, 3), { k: 1, n: 3, pct: 33.3 });
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 0.95), 5);
  assert.equal(percentile([], 0.5), null);
});
