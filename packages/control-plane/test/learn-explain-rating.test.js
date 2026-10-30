// packages/control-plane/test/learn-explain-rating.test.js
// Explain-back rating out of 10 (plan sections 7H, EB-08.1, EB-08.3): the pure server calculation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATING_CALCULATION, rateAttempt, ratingsComparable } from '../src/learn-explain-rating.js';

const C = (id, extra = {}) => ({ criterionId: id, version: 1, ...extra });
const O = (id, fit, reasoning = 'not_required', extra = {}) => ({ criterionId: id, criterionVersion: 1, fit, reasoning, ...extra });
const FOUR = ['a', 'b', 'c', 'd'].map(id => C(id));
const rate = (observations, criteria = FOUR, rubricVersion = 'rubric-eb-1') => rateAttempt({ criteria, observations, rubricVersion });

test('a fully assessed wrong answer is 0/10, not unrated', () => {
  const r = rate(FOUR.map(c => O(c.criterionId, 'not_met')));
  assert.deepEqual([r.status, r.score, r.outOf, r.calculationVersion, r.rubricVersion], ['rated', 0, 10, RATING_CALCULATION, 'rubric-eb-1']);
});

test('10/10 only when every required criterion is met', () => {
  assert.equal(rate(FOUR.map(c => O(c.criterionId, 'met'))).score, 10);
  // 15 criteria, one partial: round(10 x 14.5 / 15) = 10, capped to 9.
  const many = Array.from({ length: 15 }, (_, i) => C(`k${i}`));
  const r = rate(many.map((c, i) => O(c.criterionId, i ? 'met' : 'partial')), many);
  assert.deepEqual([r.score, r.capped], [9, true]);
});

test('partial credit: met 1, partial 0.5, not met 0, equal weights, rounded', () => {
  assert.equal(rate([O('a', 'met'), O('b', 'partial'), O('c', 'not_met'), O('d', 'met')]).score, 6); // 10 x 2.5/4 = 6.25
  assert.equal(rate([O('a', 'met'), O('b', 'partial'), O('c', 'partial'), O('d', 'partial')]).score, 6); // 6.25
  assert.equal(rate([O('a', 'met'), O('b', 'met'), O('c', 'met'), O('d', 'partial')]).score, 9); // 8.75 -> 9
  assert.equal(rate([O('a', 'partial'), O('b', 'not_met'), O('c', 'not_met'), O('d', 'not_met')]).score, 1); // 1.25
});

test('rubric weights change the result; required reasoning limits credit', () => {
  const weighted = [C('a', { weight: 3 }), C('b', { weight: 1 })];
  assert.equal(rate([O('a', 'met'), O('b', 'not_met')], weighted).score, 8); // 7.5 -> 8 (Math.round)
  assert.equal(rate([O('a', 'not_met'), O('b', 'met')], weighted).score, 3); // 2.5 -> 3
  const reasoned = [C('a', { requiresReasoning: true }), C('b')];
  const r = rate([O('a', 'met', 'missing'), O('b', 'met')], reasoned);
  assert.deepEqual([r.score, r.criteria[0].credit], [5, 0]);
  assert.equal(rate([O('a', 'met', 'partial'), O('b', 'met')], reasoned).score, 8); // 7.5, capped 9 not needed
  assert.equal(rate([O('a', 'met', 'supported'), O('b', 'met')], reasoned).score, 10);
});

test('optional and unscored criteria', () => {
  const crit = [C('a'), C('b'), C('opt', { required: false }), C('extra', { scored: false })];
  // Optional partial does not cap: round(10 x 2.5/3) = 8.
  assert.deepEqual([rate([O('a', 'met'), O('b', 'met'), O('opt', 'partial')], crit).score, rate([O('a', 'met'), O('b', 'met'), O('opt', 'partial')], crit).capped], [8, false]);
  // Unscored is outside the denominator, and its unclear state does not unrate the attempt.
  const r = rate([O('a', 'met'), O('b', 'met'), O('opt', 'met'), O('extra', 'unclear', 'unclear')], crit);
  assert.deepEqual([r.status, r.score, r.criteria.length], ['rated', 10, 3]);
});

test('unknown or unassessable scored criteria make the attempt Not rated, never 0', () => {
  for (const [obs, reason] of [
    [[O('a', 'not_met'), O('b', 'not_met'), O('c', 'not_met'), O('d', 'unclear', 'unclear')], 'fit_unclear'],
    [[O('a', 'not_met'), O('b', 'not_met'), O('c', 'not_met')], 'not_assessed'],
    [[O('a', 'met'), O('b', 'met'), O('c', 'met'), O('d', 'met', 'supported', { conflict: true })], 'conflict'],
  ]) {
    const r = rate(obs);
    assert.equal(r.status, 'unrated');
    assert.equal(r.reason, 'criteria_unassessed');
    assert.equal(r.score, undefined, 'no number at all');
    assert.deepEqual(r.unknown, [{ criterionId: 'd', version: 1, reason }]);
  }
  const reasoned = [C('a', { requiresReasoning: true })];
  assert.equal(rate([O('a', 'met', 'unclear')], reasoned).unknown[0].reason, 'reasoning_unclear');
  assert.equal(rate([O('a', 'met', 'not_required')], reasoned).unknown[0].reason, 'reasoning_unclear', 'a reasoning value that contradicts the criterion');
  // An observation for another criterion version does not count.
  assert.equal(rate([O('a', 'met', 'not_required', { criterionVersion: 2 })], [C('a')]).status, 'unrated');
});

test('invalid rubric input is unrated with a reason', () => {
  for (const weight of [0, -1, NaN, Infinity, '2', null]) {
    const r = rate([O('a', 'met')], [C('a', { weight })]);
    assert.deepEqual([r.status, r.reason], ['unrated', 'invalid_weight'], String(weight));
  }
  assert.equal(rate([], []).reason, 'no_scored_criteria');
  assert.equal(rate([], [C('x', { scored: false })]).reason, 'no_scored_criteria');
  assert.equal(rateAttempt({ criteria: null }).reason, 'no_scored_criteria');
  assert.equal(rate([O('a', 'met'), O('a', 'not_met')], [C('a')]).reason, 'duplicate_judgement');
});

test('the score is always a whole number from 0 to 10', () => {
  const fits = ['met', 'partial', 'not_met'];
  for (let n = 1; n <= 7; n++) {
    const crit = Array.from({ length: n }, (_, i) => C(`c${i}`, { weight: (i % 3) + 1 }));
    for (let seed = 0; seed < 40; seed++) {
      const r = rate(crit.map((c, i) => O(c.criterionId, fits[(seed + i * 7) % 3])), crit);
      assert.ok(Number.isSafeInteger(r.score) && r.score >= 0 && r.score <= 10, JSON.stringify(r));
      if (r.criteria.some(c => c.credit < 1)) assert.ok(r.score <= 9);
    }
  }
});

test('same evidence gives the same number; comparability needs the same calculation, rubric and criteria', () => {
  const obs = [O('a', 'met'), O('b', 'partial'), O('c', 'met'), O('d', 'not_met')];
  const one = rate(obs), two = rate(obs);
  assert.deepEqual(one, two);
  assert.deepEqual(ratingsComparable(one, two), { comparable: true, reason: null });
  assert.equal(ratingsComparable(one, rate(obs, FOUR, 'rubric-eb-2')).reason, 'rubric_changed');
  assert.equal(ratingsComparable(one, rate(obs, [...FOUR.slice(0, 3), C('d', { weight: 2 })])).reason, 'criteria_changed');
  assert.equal(ratingsComparable(one, rate(obs, [...FOUR.slice(0, 3), C('d', { version: 2 })])).reason, 'not_rated');
  assert.equal(ratingsComparable(one, { ...two, calculationVersion: 'eb-rating-v0' }).reason, 'calculation_changed');
  assert.equal(ratingsComparable(one, rate(obs.slice(0, 3))).reason, 'not_rated');
});

test('eb-rating-v2: not_applicable reasoning earns full credit on a reasoning-required criterion; v1 ratings are not comparable', () => {
  const crit = [C('fact', { requiresReasoning: true }), C('cause', { requiresReasoning: true })];
  const r = rate([O('fact', 'met', 'not_applicable'), O('cause', 'met', 'supported')], crit);
  assert.deepEqual([r.status, r.score, r.calculationVersion, r.criteria[0].credit], ['rated', 10, 'eb-rating-v2', 1]);
  assert.equal(rate([O('fact', 'met', 'not_required'), O('cause', 'met', 'supported')], crit).unknown[0].reason, 'reasoning_unclear', 'not_required is still not a reason');
  assert.equal(ratingsComparable({ ...r, calculationVersion: 'eb-rating-v1' }, r).reason, 'calculation_changed');
});
