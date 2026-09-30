import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rate, wilson, percentile, prf, bestThreshold, calibration, brier, goldVerdict, verdictAccuracy, confusion } from './metrics.mjs';

const close = (actual, expected, digits = 4) => assert.equal(actual.toFixed(digits), expected.toFixed(digits));

test('wilson 95% interval', () => {
  const nineOfTen = wilson(9, 10);
  close(nineOfTen.low, 0.59584);
  close(nineOfTen.high, 0.98212);
  assert.equal(wilson(0, 0), null);
  const allThirty = wilson(30, 30);
  close(allThirty.low, 0.88649);
  assert.ok(allThirty.high <= 1 && allThirty.high > 0.9999);
});

test('rate and percentile', () => {
  assert.deepEqual(rate(27, 30), { k: 27, n: 30, pct: 90 });
  assert.deepEqual(rate(0, 0), { k: 0, n: 0, pct: null });
  assert.equal(percentile([100, 300, 200, 400], 0.95), 400);
  assert.equal(percentile([], 0.5), null);
});

test('precision, recall and F1 at a threshold, and the best threshold on a 0.05 grid', () => {
  const items = [{ p: 0.9, gold: true }, { p: 0.8, gold: true }, { p: 0.6, gold: false }, { p: 0.4, gold: true }, { p: 0.1, gold: false }];
  const atHalf = prf(items, 0.5);
  assert.deepEqual({ tp: atHalf.tp, fp: atHalf.fp, fn: atHalf.fn }, { tp: 2, fp: 1, fn: 1 });
  close(atHalf.f1, 2 / 3);
  const best = bestThreshold(items);
  assert.ok(best.f1 >= atHalf.f1);
  assert.ok(best.threshold >= 0.05 && best.threshold <= 0.95);
  assert.equal(prf([], 0.5).f1, null);
});

test('calibration buckets and Brier score', () => {
  const buckets = calibration([{ p: 0.95, gold: true }, { p: 1, gold: true }, { p: 0.05, gold: false }]);
  assert.equal(buckets.length, 10);
  assert.equal(buckets[9].n, 2);
  assert.equal(buckets[9].observed, 1);
  assert.equal(buckets[0].n, 1);
  close(brier([{ p: 1, gold: true }, { p: 0, gold: true }]), 0.5);
  assert.equal(brier([]), null);
});

test('gold verdicts are derived, and unsure or error counts as wrong', () => {
  assert.equal(goldVerdict({ ideas: [true, true], misconception: false, non_attempt: false }), 'good');
  assert.equal(goldVerdict({ ideas: [true, false], misconception: false, non_attempt: false }), 'partial');
  assert.equal(goldVerdict({ ideas: [true, true], misconception: true, non_attempt: false }), 'partial');
  const cases = [
    { gold: { ideas: [true], misconception: false, non_attempt: false }, got: 'good' },
    { gold: { ideas: [true], misconception: false, non_attempt: false }, got: 'unsure' },
    { gold: { ideas: [false], misconception: false, non_attempt: true }, got: 'error' },
    { gold: { ideas: [false], misconception: false, non_attempt: true }, got: 'partial' },
  ];
  const accuracy = verdictAccuracy(cases, c => c.got);
  assert.deepEqual({ k: accuracy.k, n: accuracy.n, pct: accuracy.pct }, { k: 2, n: 4, pct: 50 });
  assert.ok(accuracy.wilson.low < 0.5 && accuracy.wilson.high > 0.5);
  assert.deepEqual(confusion(cases, c => c.got), { good: { good: 1, unsure: 1 }, partial: { error: 1, partial: 1 } });
});
