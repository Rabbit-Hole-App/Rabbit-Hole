// The Tutor and learning metrics (telemetry-learning-metrics.js) on a small synthetic dataset whose answers are worked out by hand.
// SYNTHETIC FIXTURES ONLY: these prove the definitions, denominators and exclusions, not what real learners do, and they are not
// lifecycle evidence from a deployed environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learningMetrics } from '../src/telemetry-learning-metrics.js';
import { makeEvent } from '../src/telemetry-contract.js';
import { writeEvents } from '../src/telemetry-delivery.js';
import { telemetryDb } from './telemetry-fixture.js';

const T0 = Math.floor(Date.parse('2026-10-20T00:00:00Z') / 1000), NOW = (T0 + 6 * 86400) * 1000;
const at = seconds => new Date((T0 + seconds) * 1000).toISOString();
let n = 0;

async function dataset(t) {
  const { sqlite, db } = telemetryDb(t);
  const run = (sql, ...args) => sqlite.prepare(sql).run(...args);
  const criterion = (id, transfer) => run("INSERT INTO learning_criteria (goal_id, scope_version, criterion_id, version, user_ref, requires_reasoning, requires_transfer, rubric_version, created_s, projected_at) VALUES ('g1', 1, ?, 1, 'u1', 0, ?, 'r1', ?, 0)", id, transfer, T0);
  criterion('c1', 0); criterion('c2', 1);
  const assessment = (id, user, seconds, route = 'jev', status = 'completed', supersedes = null) => run("INSERT INTO learning_assessments (id, attempt_id, user_ref, status, route, evaluator_version, supersedes_assessment_id, created_at, updated_at, updated_s, projected_at) VALUES (?, ?, ?, ?, ?, 'ev-1', ?, ?, ?, ?, 0)", id, `att-${id}`, user, status, route, supersedes, at(seconds), at(seconds), T0 + seconds);
  const observation = (id, asm, user, criterionId, seconds, over = {}) => run(`INSERT INTO learning_observations (id, assessment_id, attempt_id, user_ref, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, validity, conflict, application, retention_of, observed_at, observed_s, projected_at)
    VALUES (?, ?, ?, ?, 'g1', ?, 1, ?, 'supported', ?, ?, ?, ?, ?, ?, ?, 0)`, id, asm, `att-${asm}`, user, criterionId, over.fit ?? 'met', over.assistance ?? 'none', over.validity ?? 'valid', over.conflict ?? 0, over.application ?? 'not_assessed', over.retentionOf ?? null, at(seconds), T0 + seconds);
  const attempt = (id, user, seconds, assistance = 'none') => run("INSERT INTO learning_attempts (id, user_ref, goal_id, response_kind, assistance, submitted_at, submitted_s, projected_at) VALUES (?, ?, 'g1', 'text', ?, ?, ?, 0)", id, user, assistance, at(seconds), T0 + seconds);
  // u1: independent on c1 at 100 s (jev); retests it 8 days later (keyed would need no ... jev again), met, retention_of o1; applied and met on c2 (keyed).
  assessment('a1', 'u1', 100); observation('o1', 'a1', 'u1', 'c1', 100); attempt('att-a1', 'u1', 100);
  assessment('a1r', 'u1', 100 + 8 * 86400 - 10); observation('o1r', 'a1r', 'u1', 'c1', 100 + 8 * 86400 - 10, { retentionOf: 'o1' });
  assessment('a1k', 'u1', 200, 'keyed'); observation('o1k', 'a1k', 'u1', 'c2', 200, { application: 'applied' });
  // u2: assisted on c1; a not-applied pass on c2.
  assessment('a2', 'u2', 150); observation('o2', 'a2', 'u2', 'c1', 150, { assistance: 'assisted' }); attempt('att-a2', 'u2', 150, 'assisted');
  assessment('a2b', 'u2', 160); observation('o2b', 'a2b', 'u2', 'c2', 160);
  // u3: not met first, then met independently 1000 s later.
  assessment('a3', 'u3', 300); observation('o3', 'a3', 'u3', 'c1', 300, { fit: 'not_met' }); attempt('att-a3', 'u3', 300);
  assessment('a3b', 'u3', 1300); observation('o3b', 'a3b', 'u3', 'c1', 1300);
  // u4: a conflicted observation, and a pending assessment: neither counts.
  assessment('a4', 'u4', 400); observation('o4', 'a4', 'u4', 'c1', 400, { conflict: 1 });
  assessment('a4p', 'u4', 410, 'jev', 'pending'); observation('o4p', 'a4p', 'u4', 'c1', 410);
  // u5: superseded by a later completed assessment: the earlier one does not count.
  assessment('a5', 'u5', 500); observation('o5', 'a5', 'u5', 'c1', 500, { fit: 'not_met' });
  assessment('a5n', 'u5', 600, 'jev', 'completed', 'a5'); observation('o5n', 'a5n', 'u5', 'c1', 600);
  // Accounting around u1's milestone (100 s) and u3's (300 to 1300 s), in the product's seconds.
  run("INSERT INTO accounting_actions (action_id, user_ref, feature, projected_at) VALUES ('x1', 'u1', 'tutor', 0), ('x3', 'u3', 'next_steps', 0), ('x9', 'u1', 'image', 0)");
  run("INSERT INTO accounting_attempts (attempt_id, action_id, cost_micros, cost_state, started_at, projected_at) VALUES ('t1', 'x1', 5000, 'settled', ?, 0), ('t2', 'x1', 300, 'estimated', ?, 0), ('t3', 'x1', NULL, 'unknown', ?, 0), ('t4', 'x3', 700, 'settled', ?, 0), ('t5', 'x9', 99999, 'settled', ?, 0)",
    T0 + 100, T0 + 100, T0 + 100, T0 + 800, T0 + 100);

  const decision = (user, seconds, payload) => makeEvent('tutor.decision', { event_id: `e${++n}`, user_ref: user, feature: 'tutor', payload: { session_id: 'S1', canvas_ref: 'canvas-1', action_type: 'respond_text', assistance_offered: 'explanation', transitions: 0, ...payload } }, { environment: 'dev', service: 'web', now: (T0 + seconds) * 1000 });
  const computed = (user, seconds, payload) => makeEvent('tutor.hooks_computed', { event_id: `e${++n}`, user_ref: user, feature: 'tutor', payload: { session_id: 'S1', canvas_ref: 'canvas-1', ...payload } }, { environment: 'dev', service: 'web', now: (T0 + seconds) * 1000 });
  const shown = (user, seconds, set, ids) => makeEvent('tutor.hooks_shown', { event_id: `e${++n}`, user_ref: user, feature: 'tutor', payload: { session_id: 'S1', canvas_ref: 'canvas-1', set_id: set, suggestion_ids: ids } }, { environment: 'dev', service: 'web', now: (T0 + seconds) * 1000 });
  const events = [
    // u1: three decisions on the same claims with no evidence change (a stall); the first two are text replies with no attempt between (a loop).
    decision('u1', 1000, { target_claims: ['k1'] }), decision('u1', 1010, { target_claims: ['k1'] }), decision('u1', 1020, { target_claims: ['k1'], action_type: 'ask_question', assistance_offered: 'none', selected_hook: 'a2' }),
    // u1 hook sets: s1 shown and its second hook selected, s2 shown then replaced by s3, s3 last.
    computed('u1', 990, { set_id: 's1', suggestion_ids: ['a1', 'a2', 'a3'], cached: false }), computed('u1', 1090, { set_id: 's2', suggestion_ids: ['b1', 'b2', 'b3'], cached: true }), computed('u1', 1190, { set_id: 's3', suggestion_ids: ['c1', 'c2', 'c3'], cached: false, discarded: true }),
    shown('u1', 991, 's1', ['a1', 'a2', 'a3']), shown('u1', 1091, 's2', ['b1', 'b2', 'b3']), shown('u1', 1191, 's3', ['c1', 'c2', 'c3']),
    // u2: an advance made on a misconception (premature candidate) and one on clean evidence; two single-claim misconception turns; a repair after the first only.
    decision('u2', 2000, { reason_codes: ['advance_goal'], evidence_misconception: 1, target_claims: ['k9'], to_misconception: 1, transitions: 1 }),
    decision('u2', 2010, { reason_codes: ['repair_misconception'], target_claims: ['k9'], to_misconception: 1, transitions: 1 }),
    decision('u2', 2020, { reason_codes: ['advance_goal'], target_claims: ['k2'] }),
    // u3: after the not-met observation (300 s) the next decision repairs.
    decision('u3', 400, { reason_codes: ['fill_prerequisite_gap'], target_claims: ['k3'] }),
  ];
  await writeEvents(db, events, (T0 + 3000) * 1000);
  return { sqlite, db };
}
const find = (list, text) => list.find(m => m.label.includes(text));

test('evidence metrics: first valid scored observation per criterion, by basis, with the exclusions applied', async t => {
  const { db } = await dataset(t);
  const m = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  const jev = find(m.independentSuccess, 'jev / ev-1');
  // Counted as first scored: u1 c1 (met, no help), u2 c1 (met, help), u3 c1 (not met), u2 c2 (met, no help), u5 c1 (the superseding o5n: met, no help).
  // Not counted: u4 (conflict; pending), u5's superseded o5, and every later observation (o1r, o3b).
  assert.deepEqual([jev.numerator, jev.denominator, jev.assistedMet], [3, 5, 1]);
  assert.equal(find(m.assistedSuccess, 'jev / ev-1').numerator, 1);
  const keyed = find(m.independentSuccess, 'keyed / ev-1');
  assert.deepEqual([keyed.numerator, keyed.denominator], [1, 1]);
  assert.match(jev.definition, /not verified outcomes/, 'AI evaluators are labelled as assessments');
});

test('retention is bucketed by time since the original, and transfer reads only criteria that require it', async t => {
  const { db } = await dataset(t);
  const m = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  const retention = m.retention.find(r => r.bucket === '7_to_30d');
  assert.deepEqual([retention.numerator, retention.denominator], [1, 1]);
  const transferKeyed = m.transfer.find(r => r.basis === 'keyed / ev-1'), transferJev = m.transfer.find(r => r.basis === 'jev / ev-1');
  assert.deepEqual([transferKeyed.numerator, transferKeyed.denominator, transferKeyed.applied], [1, 1, 1]);
  assert.deepEqual([transferJev.numerator, transferJev.denominator, transferJev.applied], [0, 1, 0]);
  assert.deepEqual(m.assistanceUsed.sort((a, b) => a.assistance.localeCompare(b.assistance)), [{ assistance: 'assisted', attempts: 1 }, { assistance: 'none', attempts: 2 }]);
});

test('milestones use the product\'s own derivation; time, attempts and Tutor-feature cost are reported with measured and estimated apart', async t => {
  const { db } = await dataset(t);
  const { milestone } = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  // u1 c1 at 100 s, u1 c2 (applied, met, no help) at 200 s, u3 c1 at 1300 s, u5 c1 (o5n) at 600 s. u2 is assisted only; u4 has nothing valid.
  assert.equal(milestone.milestones, 4);
  assert.equal(milestone.medianElapsedSeconds, 50, 'elapsed 0, 0, 100 (u5, from its first observation) and 1000 seconds: the median is 50');
  // Cost: u1's span for c1 is 100 to 100 s (tutor feature: settled 5000, estimated 300, one unknown; the image action is not a Tutor feature);
  // u3's span 300 to 1300 s holds one next_steps attempt (settled 700). u1's c2 span 200 to 200 holds nothing.
  assert.deepEqual([milestone.cost.measuredMicros, milestone.cost.estimatedMicros, milestone.cost.unknownAttempts], [5700, 300, 1]);
  assert.match(milestone.cost.definition, /unrelated Tutor use/);
});

test('sequences: stalls, explanation loops, repeated misconceptions, premature candidates and adaptation, each with numerator and denominator', async t => {
  const { db } = await dataset(t);
  const m = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  assert.deepEqual([m.decisions, m.stalls.numerator], [7, 1]);
  assert.equal(m.explanationLoops.numerator, 2, 'u1: two text replies on k1; u2: two text replies on k9 (the third u1 decision asks a question)');
  assert.deepEqual([m.repeatedMisconceptions.numerator, m.repeatedMisconceptions.denominator], [1, 1]);
  assert.deepEqual([m.prematureProgression.numerator, m.prematureProgression.denominator], [1, 2]);
  assert.deepEqual([m.adaptationAfterMisconception.numerator, m.adaptationAfterMisconception.denominator], [1, 2], 'u2: the first misconception turn is followed by a repair, the second by an advance');
  assert.deepEqual([m.adaptationAfterFailure.numerator, m.adaptationAfterFailure.denominator], [1, 1], 'u3 repaired after the not-met answer; u5 has no later decision');
  assert.deepEqual(m.assistanceOffered, { explanation: 6, none: 1 });
});

test('hooks: a selected set, a set replaced by a later one, and the last set whose outcome is unknown; cached sets are counted', async t => {
  const { db } = await dataset(t);
  const { hookFunnel } = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  assert.deepEqual([hookFunnel.generated, hookFunnel.cached, hookFunnel.discarded], [3, 1, 1]);
  assert.deepEqual([hookFunnel.shown, hookFunnel.selected, hookFunnel.superseded, hookFunnel.unknown], [3, 1, 1, 1]);
  assert.deepEqual(hookFunnel.selectedByPosition, [0, 1, 0]);
  assert.deepEqual(hookFunnel.shownByPosition, [3, 3, 3]);
  assert.match(hookFunnel.definition, /not read as rejection/);
});

test('unmeasured things are declared unavailable, not estimated: difficulty, human-reviewed grading, hook completion, displayed help', async t => {
  const { db } = await dataset(t);
  const m = await learningMetrics(db, { environment: 'dev', days: 30, now: NOW });
  assert.deepEqual(m.unavailable.map(u => u.id), ['difficulty', 'human_reviewed_grading_quality', 'hook_completion', 'displayed_assistance']);
  assert.match(m.unavailable[1].reason, /never collected for review/);
});

test('the window and the environment bound what is read', async t => {
  const { db } = await dataset(t);
  const later = await learningMetrics(db, { environment: 'dev', days: 1, now: NOW });
  assert.equal(later.decisions, 0, 'nothing in the last day');
  assert.equal(later.independentSuccess.length, 0);
  const other = await learningMetrics(db, { environment: 'production', days: 30, now: NOW });
  assert.equal(other.decisions, 0, 'another environment\'s events are not read');
});
