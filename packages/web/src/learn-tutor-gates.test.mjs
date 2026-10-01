// Decision 6 (owner, 2026-10-01): the benchmark's winner-selection gates (e2e/tutor-bench-gates.mjs).
// Quality and reliability first; latency only among eligible arms, on both p50 and p95.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GATES, judge, measure } from '../e2e/tutor-bench-gates.mjs';

// n turns of one arm: every turn passes unless overridden; latency ms from `ms(i)`.
const arm = (n, ms, extra = () => ({})) => measure(Array.from({ length: n }, (_, i) => ({
  trace: `T${i % 5}`, golden: i % 5 === 0, pass: true, group: ['routine', 'evidence', 'structural'][i % 3],
  checks: { actions: true, evidence: true, route: true }, audit: { consent: 0, policy: 0, resource: 0 }, evidence_corruption: 0,
  planner_calls: 1, planner_invalid: 0, cost_usd: 0.03, to_first_safe_sentence: ms(i), planner_ms: ms(i) + 500, ...extra(i),
})));

test('D6: no arm wins on speed alone - every hard gate disqualifies', () => {
  const ref = arm(100, () => 8000);
  const bad = {
    golden: arm(100, () => 900, i => (i === 0 ? { pass: false } : {})),
    consent: arm(100, () => 900, i => (i === 1 ? { audit: { consent: 1, policy: 0, resource: 0 } } : {})),
    policy: arm(100, () => 900, i => (i === 1 ? { audit: { consent: 0, policy: 1, resource: 0 } } : {})),
    resource: arm(100, () => 900, i => (i === 1 ? { audit: { consent: 0, policy: 0, resource: 1 } } : {})),
    spoken: arm(100, () => 900, i => (i === 1 ? { spoken: { consistent: false } } : {})),
    corrupt: arm(100, () => 900, i => (i === 1 ? { evidence_corruption: 1 } : {})),
  };
  const { verdicts, winner } = judge({ A: ref, ...bad });
  for (const name of Object.keys(bad)) assert.equal(verdicts[name].eligible, false, name);
  assert.equal(winner.arm, 'A', 'the slow but clean reference wins');
});

test('D6: quality within 2 pp of Opus, invalid plans under 2%, routine escalation under 20%, cost no higher than baseline', () => {
  const ref = arm(100, () => 8000);
  const results = {
    A: ref,
    actions3: arm(100, () => 900, i => (i < 3 ? { checks: { actions: false, evidence: true, route: true } } : {})),
    actions2: arm(100, () => 950, i => (i < 2 ? { checks: { actions: false, evidence: true, route: true } } : {})),
    invalid: arm(100, () => 900, i => (i < 2 ? { planner_invalid: 1 } : {})),
    escalating: arm(100, () => 900, i => ({ planner_tier: i < 50 ? 'fast' : 'opus', planner_escalated: i < 10 ? 'no words' : null })),
    pricey: arm(100, () => 900, () => ({ cost_usd: 0.031 })),
  };
  const { verdicts, winner } = judge(results);
  assert.match(verdicts.actions3.failed[0], /^actions 97\/100 is 3\.0 pp below A \(100\/100\)/);
  assert.equal(verdicts.actions2.eligible, true, 'exactly 2 pp is allowed');
  assert.match(verdicts.invalid.failed[0], /invalid plans 2\/100/);
  assert.match(verdicts.escalating.failed[0], /routine escalation 10\/50/, 'only the fast-tier turns count');
  assert.match(verdicts.pricey.failed[0], /cost\/turn/);
  assert.equal(winner.arm, 'actions2');
  assert.equal(GATES.quality_pp, 2);
});

test('D6: a great p50 with a pathological p95 is not picked silently; groups stay separate', () => {
  const results = { A: arm(100, () => 8000), D: arm(100, i => (i < 90 ? 600 : 15000)), E: arm(100, () => 1500) };
  const { winner } = judge(results);
  assert.equal(winner.arm, null);
  assert.match(winner.note, /D has the best p50, E the best p95/);
  assert.deepEqual(Object.keys(results.E.latency), ['all', 'routine', 'evidence', 'structural']);
  assert.equal(judge({ A: arm(10, () => 8000, () => ({ pass: false })) }).winner.arm, null, 'nothing eligible: no fast tier ships');
});

test('owner answers A and C: an arm stopped on a refusal is unavailable; late evidence and per-category N are reported', () => {
  const refusedArm = arm(10, () => 500, () => ({ run_aborted: 'planner refused: model HTTP 400' }));
  const late = arm(10, () => 8000, i => ({ category: i < 5 ? 'question_request' : 'misconception', critical_path: i < 4 ? { blocking: false, miss: i === 0 ? { planned: 'not_yet_observed', after: 'uncertain' } : null } : { blocking: true }, late_evidence_events: i < 2 ? 1 : 0, evidence_dropped: i === 0 ? 1 : 0 }));
  const { verdicts } = judge({ A: late, C: refusedArm });
  assert.match(verdicts.C.failed[0], /^unavailable: planner refused/);
  assert.deepEqual(late.late_evidence, { off_path_turns: 4, with_evidence: 2, route_changed: 1, dependent_actions_dropped: 1 });
  assert.deepEqual(Object.keys(late.latency_by_category), ['misconception', 'question_request']);
  assert.deepEqual(Object.keys(late.latency_by_category.question_request.first_validated_sentence_ms), ['n', 'p50', 'p95', 'mean', 'max']);
  assert.equal(late.latency_by_category.question_request.first_validated_sentence_ms.n, 5);
});
