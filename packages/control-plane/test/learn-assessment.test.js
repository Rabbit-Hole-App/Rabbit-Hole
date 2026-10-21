// packages/control-plane/test/learn-assessment.test.js
// Tutor Task 06 (C:/s/spec/tutor-workflow/draft.md; owner decision 7a): assessment routing for saved attempts on node:sqlite.
// The routes are keyed code, one JEV batch, and at most one admitted escalation. Rich-rubric and visual answers are
// unavailable. Provenance is recorded. JEV and the larger evaluator are stubs; no provider is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCriterionSummary, deriveGoalCounts } from '../../web/src/learn-coaching-contract.js';
import { acceptAttempt, goalEvidence, readAttempt } from '../src/learn-attempt-store.js';
import { observationsFrom } from '../src/learn-assessment.js';
import { advanceActivity, readCoachingState } from '../src/learn-coaching-store.js';
import { loadJourneyById } from '../src/learn-journey-store.js';
import { JevError } from '../src/learn-grade-jev.js';
import { ANA, CHECK, CRITERION, MECH, REG, act, call, jev, journeyActivity, larger, never, submit, world } from './learn-attempt-fixture.js';

const STATED = { c0_idea0: 0.95 };
const CONTESTED = { c0_idea0: 0.95, c0_contra0: 0.95 }; // MECH's idea confidently stated and confidently contradicted
const summaryOf = (view, criterion = { ...CRITERION, version: 1, rubricVersion: 'r1' }) => deriveCriterionSummary({ criterion, observations: view.assessments.flatMap(a => a.observations) });
const choice = env => journeyActivity(env, ANA, { responseKind: 'choice', prompt: CHECK.prompt, sourceRefs: [{ kind: 'journey_probe', id: 'c1', version: 1, locator: { sectionId: 's1' } }] });

test('keyed_answer_uses_no_provider: a keyed choice is graded in code; a correct choice alone establishes no reasoning', async t => {
  const w = world(t);
  const { activity } = await choice(w.env);
  const right = await submit(w.env, ANA, activity, { submissionKey: 'sub-key-right', submittedContent: { optionId: 'y' } }, never);
  assert.equal(right.status, 200, JSON.stringify(right.body));
  const a = right.body.assessment;
  assert.deepEqual([a.status, a.route, a.provenance.calls, a.provenance.checker], ['completed', 'keyed', [], 'journey_probe_key']);
  assert.deepEqual(a.observations.map(o => [o.criterionId, o.fit, o.reasoning, o.assistance, o.reason]), [['mech', 'met', 'missing', 'none', 'correct_option']]);
  assert.equal(summaryOf(right.body).status, 'practising', 'reasoning is required, so a right option is not demonstrated');
  const wrong = await submit(w.env, ANA, activity, { submissionKey: 'sub-key-wrong', submittedContent: { optionId: 'x' } }, never);
  assert.deepEqual(wrong.body.assessment.observations.map(o => [o.fit, o.reason]), [['not_met', 'misconception:mechanism-confusion']]);
  const unknown = await submit(w.env, ANA, activity, { submissionKey: 'sub-key-other', submittedContent: { optionId: 'zz' } }, never);
  assert.deepEqual([unknown.body.assessment.status, unknown.body.assessment.reason, unknown.body.assessment.observations], ['unavailable', 'unknown_option', []]);
});

test('short_explanation_uses_one_jev_batch: one JEV request on the registered claim, no larger call, provenance with unknown usage kept unknown', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const stub = jev(STATED);
  const r = await submit(w.env, ANA, activity, {}, { ask: stub.ask, callModel: never.callModel });
  const a = r.body.assessment;
  assert.equal(stub.asked.length, 1);
  assert.deepEqual(stub.asked[0].state.card_claims, [REG.claims[MECH].statement], 'the claim comes from the journey registry');
  assert.equal(stub.asked[0].state.tutor_question, activity.prompt, 'the prompt the learner answered');
  assert.deepEqual([a.status, a.route, a.reason], ['completed', 'jev', null]);
  assert.deepEqual(a.observations.map(o => [o.fit, o.reasoning, o.conflict, o.application]), [['met', 'supported', false, 'not_assessed']]);
  assert.deepEqual(a.provenance.calls, [{ role: 'jev', requestedModel: 'jev-1.13.0', servedModel: 'jev-1.13.0', reason: 'claim_check', latencyMs: a.provenance.calls[0].latencyMs, outcome: 'settled', usage: { inputTokens: null, outputTokens: null }, costUsd: null }]);
  assert.equal(typeof a.provenance.calls[0].latencyMs, 'number');
  assert.deepEqual(a.provenance.escalation, { requested: false, reason: 'settled', uncertain: [], outcome: 'not_needed' });
  assert.equal(summaryOf(r.body).status, 'demonstrated_independently');
});

test('confident_conflict_cannot_return_clean_pass: a confident contradiction escalates once; resolved, the larger result stands; repeated, it is unresolved', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const resolve = larger(['c0_idea0']);
  const r = await submit(w.env, ANA, activity, {}, { ask: jev(CONTESTED).ask, callModel: resolve.callModel });
  const a = r.body.assessment;
  assert.equal(resolve.calls.length, 1, 'one escalation');
  assert.equal(resolve.calls[0].model, 'claude-opus-5-5', 'the configured larger evaluator, never a fallback');
  assert.deepEqual([a.route, a.provenance.escalation.reason, a.provenance.escalation.outcome], ['larger', 'contradiction', 'completed']);
  assert.deepEqual(a.provenance.calls.map(c => [c.role, c.requestedModel, c.servedModel, c.reason, c.outcome]), [['jev', 'jev-1.13.0', 'jev-1.13.0', 'claim_check', 'uncertain'], ['tutor_evaluator', 'claude-opus-5-5', 'claude-opus-5-5', 'contradiction', 'settled']]);
  assert.deepEqual(a.provenance.calls[1].usage, { inputTokens: 700, outputTokens: 40 });
  assert.equal(typeof a.provenance.calls[1].costUsd, 'number', 'known usage at a priced served model has a cost');
  assert.deepEqual(a.observations.map(o => [o.fit, o.conflict]), [['met', false]]);

  // The larger evaluator confirms both: still contested, never settled, so the criterion needs review.
  const w2 = world(t);
  const { activity: second } = await journeyActivity(w2.env);
  const repeat = larger(['c0_idea0', 'c0_contra0']);
  const r2 = await submit(w2.env, ANA, second, {}, { ask: jev(CONTESTED).ask, callModel: repeat.callModel });
  assert.deepEqual(r2.body.assessment.observations.map(o => [o.fit, o.conflict, o.reason]), [['unclear', true, 'contradiction_unresolved']]);
  assert.deepEqual((({ status, reason }) => [status, reason])(summaryOf(r2.body)), ['needs_review', 'unresolved_conflict']);
});

test('refused_escalation_keeps_unresolved_evidence: the spend guard refuses the escalation; the contradiction is saved as Needs review, never as a pass or a fail', async t => {
  const w = world(t, { SMALL_ENV: 'dev' }); // spend enforced, no platform cap: spendTransport refuses before transport
  const { activity } = await journeyActivity(w.env);
  const blocked = larger();
  const r = await submit(w.env, ANA, activity, {}, { ask: jev(CONTESTED).ask, callModel: blocked.callModel });
  const a = r.body.assessment;
  assert.equal(blocked.calls.length, 0, 'refused before transport');
  assert.deepEqual([a.status, a.route, a.reason, a.provenance.escalation.outcome], ['completed', 'jev', 'escalation_refused', 'refused']);
  assert.deepEqual(a.provenance.calls.at(-1).outcome, 'refused');
  assert.deepEqual(a.observations.map(o => [o.fit, o.conflict]), [['unclear', true]]);
  assert.equal(summaryOf(r.body).status, 'needs_review');
  // A missing JEV key never falls back to the larger evaluator.
  const unkeyed = world(t, { TYPESAFE_API_KEY: undefined });
  const { activity: other } = await journeyActivity(unkeyed.env);
  const none = await submit(unkeyed.env, ANA, other, {}, { ask: never.ask, callModel: blocked.callModel });
  assert.deepEqual([none.body.assessment.status, none.body.assessment.reason, blocked.calls.length], ['unavailable', 'evaluator_unconfigured', 0]);
  // A JEV refused by the spend guard is unavailable, with nothing observed.
  const capped = world(t);
  const { activity: third } = await journeyActivity(capped.env);
  const refusedJev = await submit(capped.env, ANA, third, {}, { ask: async () => { throw Object.assign(new JevError('daily_cap_reached', 'Jev refused by the daily spend guard.'), { called: false }); }, callModel: never.callModel });
  assert.deepEqual([refusedJev.body.assessment.status, refusedJev.body.assessment.reason, refusedJev.body.assessment.provenance.calls[0].outcome], ['unavailable', 'allowance_refused', 'refused']);
});

test('malformed_evaluation_does_not_update_counts: malformed output or a provider error is failed and observes nothing; the confirmed summary stays', async t => {
  const w = world(t);
  const { activity, goalId } = await journeyActivity(w.env);
  const first = await submit(w.env, ANA, activity, {}, { ask: jev(STATED).ask, callModel: never.callModel });
  const confirmed = summaryOf(first.body);
  assert.equal(confirmed.status, 'demonstrated_independently');
  const malformed = async () => ({ body: { answers: { c0_idea0: { type: 'noul', noul: 'yes' } } } });
  const review = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${first.body.attempt.attemptId}/reassess`, { requestKey: 'review-bad-01' }, { ask: malformed, callModel: never.callModel });
  assert.deepEqual([review.body.assessment.status, review.body.assessment.reason, review.body.assessment.observations], ['failed', 'malformed_evaluation', []]);
  assert.deepEqual(summaryOf(review.body), confirmed, 'the failed review changes nothing');
  const http = async () => { throw new JevError('http', 'Jev 500: request failed', 500); };
  const broken = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${first.body.attempt.attemptId}/reassess`, { requestKey: 'review-bad-02' }, { ask: http, callModel: never.callModel });
  assert.deepEqual([broken.body.assessment.status, broken.body.assessment.reason], ['failed', 'evaluator_error']);
  const { observations } = await goalEvidence(w.env, ANA, goalId);
  assert.deepEqual(deriveGoalCounts({ criteria: [{ ...CRITERION, version: 1, rubricVersion: 'r1' }], observations }).counts.demonstrated_independently, 1);
});

test('retry_does_not_duplicate_assessment: a retried review is one operation and one call; the review supersedes the earlier result', async t => {
  const w = world(t);
  const { activity, goalId } = await journeyActivity(w.env);
  const first = await submit(w.env, ANA, activity, {}, { ask: jev(STATED).ask, callModel: never.callModel });
  const stub = jev({ c0_idea0: 0.02, c0_contra0: 0.95 }); // the review reads the answer as contradicting the idea
  const path = `/api/learn/tutor/attempts/${first.body.attempt.attemptId}/reassess`;
  const one = await call(w.env, ANA, 'POST', path, { requestKey: 'review-0001' }, { ask: stub.ask, callModel: never.callModel });
  const two = await call(w.env, ANA, 'POST', path, { requestKey: 'review-0001' }, { ask: stub.ask, callModel: never.callModel });
  assert.deepEqual([one.status, two.status, two.body.replayed, stub.asked.length], [200, 200, true, 1]);
  assert.equal(one.body.assessments.length, 2);
  const [original, reviewed] = two.body.assessments;
  assert.deepEqual([reviewed.supersedesAssessmentId, reviewed.observations[0].supersedesAssessmentId], [original.assessmentId, original.assessmentId]);
  assert.equal(original.observations.length, 1, 'the original result is kept');
  assert.deepEqual(summaryOf(two.body).status, 'practising', 'only the review counts');
  const { observations } = await goalEvidence(w.env, ANA, goalId);
  assert.equal(observations.length, 2);
  // A replayed submission never makes another operation.
  await submit(w.env, ANA, activity, {}, { ask: stub.ask, callModel: never.callModel });
  assert.deepEqual([(await readAttempt(w.env, ANA, first.body.attempt.attemptId)).assessments.length, stub.asked.length], [2, 1]);
  // A review while an assessment is still pending is refused, and calls nothing.
  const waiting = await acceptAttempt(w.env, ANA, { activityId: activity.activityId, activityRevision: 1, submissionKey: 'sub-wait-0001', submittedContent: { text: 'abc' }, sourceRefs: [], assistanceRefs: [] });
  const busy = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${waiting.attemptId}/reassess`, { requestKey: 'review-0002' }, never);
  assert.deepEqual([busy.status, busy.body.error], [409, 'assessment_in_progress']);
});

test('rich-rubric and visual input stays unavailable, and text with no registered claim is unassessed, with no provider call', async t => {
  const w = world(t);
  const { goalId } = await journeyActivity(w.env);
  const make = async (responseKind, criterionRefs = [{ criterionId: 'mech', version: 1 }]) => ({ activityId: (await act(w.env, ANA, 'activate_activity', { activity: { goalId, objective: 'o', prompt: 'p', responseKind, criterionRefs } })).state.activeActivityId, revision: 1 });
  const cases = [['drawing', { ref: { kind: 'card', id: 'd1' } }, 'visual_not_supported'], ['code', { text: 'def f(): pass' }, 'rubric_not_supported'], ['numeric', { value: 0.5 }, 'rubric_not_supported']];
  for (const [kind, content, reason] of cases) {
    const r = await submit(w.env, ANA, await make(kind), { submissionKey: `sub-${kind}-0001`, submittedContent: content }, never);
    assert.deepEqual([r.status, r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations], [200, 'unavailable', reason, []], kind);
  }
  await act(w.env, ANA, 'change_scope', { goalId, criteria: [CRITERION, { criterionId: 'essay', label: 'Argue a position', requirement: 'Write an argument', requiresReasoning: true }] });
  const mixed = await make('text', [{ criterionId: 'mech', version: 1 }, { criterionId: 'essay', version: 1 }]);
  const r = await submit(w.env, ANA, mixed, { submissionKey: 'sub-mixed-0001' }, { ask: jev(STATED).ask, callModel: never.callModel });
  assert.deepEqual(r.body.assessment.observations.map(o => o.criterionId), ['mech']);
  assert.deepEqual(r.body.assessment.provenance.unassessed, [{ criterionId: 'essay', version: 1, reason: 'no_registered_claim' }]);
  const essayOnly = await make('text', [{ criterionId: 'essay', version: 1 }]);
  const none = await submit(w.env, ANA, essayOnly, { submissionKey: 'sub-essay-0001' }, never);
  assert.deepEqual([none.body.assessment.status, none.body.assessment.reason], ['unavailable', 'no_registered_claims']);
});

test('observationsFrom: partial ideas, misconceptions beside passes, gaps, transfer and non-attempts map to honest fits', () => {
  const claims = { k: { ideas: ['a', 'b'] } };
  const c = [{ criterionId: 'c', version: 1, requiresReasoning: true, skillKey: 'k' }];
  const ev = (result, extra = {}) => ({ claim: 'k', result, settled: true, kind: result === 'pass' ? 'demonstrated_here' : null, ...extra });
  const fit = events => observationsFrom({ events, criteria: c, claims, assistance: 'none', keyed: false }).map(o => [o.fit, o.reasoning, o.reason, o.application])[0];
  assert.deepEqual(fit([ev('pass', { idea: 0 })]), ['partial', 'partial', 'some_ideas_stated', 'not_assessed']);
  assert.deepEqual(fit([ev('pass', { idea: 0, kind: 'demonstrated_in_transfer' }), ev('pass', { idea: 1, kind: 'demonstrated_in_transfer' })]), ['met', 'supported', 'all_ideas_stated', 'applied']);
  assert.deepEqual(fit([ev('pass', { idea: 0 }), ev('pass', { idea: 1 }), ev('misconception', { misconception_id: 'm' })]), ['partial', 'partial', 'misconception:m', 'not_assessed']);
  assert.deepEqual(fit([ev('gap', { prerequisite: 'p' })]), ['not_met', 'missing', 'prerequisite_gap:p', 'not_assessed']);
  assert.deepEqual(fit([ev('pass', { idea: 0, settled: false })]), ['unclear', 'unclear', 'uncertain', 'not_assessed']);
  assert.deepEqual(fit([ev('non_attempt')]), ['unclear', 'unclear', 'non_attempt', 'not_assessed']);
  assert.deepEqual(fit([]), ['unclear', 'unclear', 'not_addressed', 'not_assessed']);
});

test('Slice A loop on the server: goal, activity, submit, assess, Progress input, and the same result after a reload on another client', async t => {
  const w = world(t);
  const { activity, goalId } = await journeyActivity(w.env);
  const r = await submit(w.env, ANA, activity, {}, { ask: jev(STATED).ask, callModel: never.callModel });
  // Another device: a fresh env object over the same database, no in-memory state.
  const other = { ...w.env };
  const view = await call(other, ANA, 'GET', `/api/learn/tutor/attempts/${r.body.attempt.attemptId}`);
  assert.deepEqual(view.body.assessment, r.body.assessment);
  const { observations, pendingAssessments } = await goalEvidence(other, ANA, goalId);
  const counts = deriveGoalCounts({ criteria: [{ ...CRITERION, version: 1, rubricVersion: 'r1' }], observations });
  assert.deepEqual([counts.total, counts.counts.demonstrated_independently, pendingAssessments], [1, 1, []]);
  // Another learner's evidence for the same goal id is empty.
  assert.deepEqual((await goalEvidence(other, { ...ANA, userId: 'u-ben-7f2a' }, goalId)).observations, []);
});

// ---- Slice A gaps (lane T5) ----
const stepOf = async (env, activityId) => (await readCoachingState(env, ANA)).activities.find(a => a.activityId === activityId);
const journeyEvents = async (env, journey) => (await loadJourneyById(env, journey.id, { org: ANA.org, owner_user_id: ANA.userId })).evidence.events;

test('gap a: a submit moves its activity to awaiting_feedback, then feedback_ready with the result on its checkpoint, through the coaching revision; a replay moves nothing', async t => {
  const w = world(t);
  const { activity } = await choice(w.env);
  const before = (await readCoachingState(w.env, ANA)).revision;
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-step-0001', submittedContent: { optionId: 'y' } }, never);
  const step = await stepOf(w.env, activity.activityId);
  assert.equal(step.status, 'feedback_ready');
  assert.deepEqual(step.checkpoint.assessment, { attemptId: r.body.attempt.attemptId, status: 'completed', reason: null });
  const revision = (await readCoachingState(w.env, ANA)).revision;
  assert.equal(revision, before + 2, 'two coaching writes, so a tab on the old revision gets 409 and the newer state');
  await submit(w.env, ANA, activity, { submissionKey: 'sub-step-0001', submittedContent: { optionId: 'y' } }, never);
  assert.equal((await readCoachingState(w.env, ANA)).revision, revision, 'a replay moves nothing');
  // A second answer to the same activity goes back to awaiting, then on to its own result.
  const again = await submit(w.env, ANA, activity, { submissionKey: 'sub-step-0002', submittedContent: { optionId: 'x' } }, never);
  const next = await stepOf(w.env, activity.activityId);
  assert.deepEqual([next.status, next.checkpoint.assessment.attemptId], ['feedback_ready', again.body.attempt.attemptId]);
});

test('gap a: an assessment still pending leaves the activity awaiting_feedback; a completed activity never moves', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  // A JEV call that never answers: the operation stays claimed (pending) while the request waits, so no feedback is claimed.
  void submit(w.env, ANA, activity, { submissionKey: 'sub-hang-0001' }, { ask: () => new Promise(() => {}), callModel: never.callModel });
  for (let i = 0; i < 50 && (await stepOf(w.env, activity.activityId)).status !== 'awaiting_feedback'; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await stepOf(w.env, activity.activityId)).status, 'awaiting_feedback');
  w.sqlite.prepare("UPDATE learn_activities SET status = 'completed' WHERE id = ?").run(activity.activityId);
  assert.equal(await advanceActivity(w.env, ANA, activity.activityId, 'awaiting_feedback'), null);
  assert.equal(await advanceActivity(w.env, ANA, activity.activityId, 'feedback_ready'), null);
  assert.equal((await stepOf(w.env, activity.activityId)).status, 'completed');
});

test('gap b: a validated assessment of a journey activity feeds that journey once, tagged by attempt, observations and probe; a review, a second answer or the old route add nothing', async t => {
  const w = world(t);
  const { activity, journey } = await choice(w.env);
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-feed-0001', submittedContent: { optionId: 'y' } }, never);
  const ids = r.body.assessment.observations.map(o => o.observationId);
  let events = await journeyEvents(w.env, journey);
  assert.deepEqual(events.map(e => [e.claim, e.result, e.settled, e.ref.probe_id, e.ref.section_id, e.ref.attempt_id]), [[MECH, 'pass', true, 'c1', 's1', r.body.attempt.attemptId]]);
  assert.deepEqual(events[0].ref.observation_ids, ids);
  assert.ok(!JSON.stringify(events).includes('optionId'), 'ids only on the ref, never the answer');
  // The deliberate review supersedes the result in Progress; the journey keeps one answer for the probe.
  await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${r.body.attempt.attemptId}/reassess`, { requestKey: 'review-feed-1' }, never);
  // A second answer to the same probe: the walker has read this probe already, so it is not counted again.
  await submit(w.env, ANA, activity, { submissionKey: 'sub-feed-0002', submittedContent: { optionId: 'x' } }, never);
  events = await journeyEvents(w.env, journey);
  assert.equal(events.length, 1);
  // The tag the journey's own evaluate route reads (journeyEvaluate answered()), so that route stores nothing either.
  assert.ok(events.some(e => e.ref?.probe_id === 'c1' && (e.ref.section_id ?? null) === 's1'));
});

test('gap b: a JEV-assessed text answer feeds its events once; its review adds nothing; a malformed result feeds nothing', async t => {
  const w = world(t);
  const { activity, journey } = await journeyActivity(w.env);
  const r = await submit(w.env, ANA, activity, {}, { ask: jev(STATED).ask, callModel: never.callModel });
  let events = await journeyEvents(w.env, journey);
  assert.ok(events.length > 0 && events.every(e => e.ref.attempt_id === r.body.attempt.attemptId && !('probe_id' in e.ref)));
  const count = events.length;
  await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${r.body.attempt.attemptId}/reassess`, { requestKey: 'review-text-1' }, { ask: jev(STATED).ask, callModel: never.callModel });
  events = await journeyEvents(w.env, journey);
  assert.equal(events.length, count, 'the same attempt is never counted twice');
  const malformed = { ask: async () => ({ body: { model: 'jev-1.13.0', answers: 'nonsense' } }), callModel: never.callModel };
  const bad = await submit(w.env, ANA, activity, { submissionKey: 'sub-bad-00001' }, malformed);
  assert.equal(bad.body.assessment.status, 'failed');
  assert.equal((await journeyEvents(w.env, journey)).length, count);
});

test('gap d: a coaching goal with no journey keeps text answers unavailable (no_registered_claims), says so on its activity, counts nothing and calls nothing', async t => {
  const w = world(t);
  const goalId = (await act(w.env, ANA, 'create_goal', { label: 'Argue a position', criteria: [{ criterionId: 'essay', label: 'Argue a position', requirement: 'Write an argument with a claim and support', requiresReasoning: true }] })).state.activeGoalId;
  const state = (await act(w.env, ANA, 'activate_activity', { activity: { goalId, objective: 'Argue a position', prompt: 'Should the library open later?', responseKind: 'text', criterionRefs: [{ criterionId: 'essay', version: 1 }] } })).state;
  const activity = state.activities.find(a => a.activityId === state.activeActivityId);
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-essay-0009' }, never);
  assert.deepEqual([r.status, r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations], [200, 'unavailable', 'no_registered_claims', []]);
  const step = await stepOf(w.env, activity.activityId);
  assert.deepEqual([step.status, step.checkpoint.assessment.status, step.checkpoint.assessment.reason], ['feedback_ready', 'unavailable', 'no_registered_claims']);
  const criteria = [{ criterionId: 'essay', version: 1, label: 'a', requirement: 'b', requiresReasoning: true, rubricVersion: 'r1' }];
  assert.equal(deriveGoalCounts({ criteria, observations: (await goalEvidence(w.env, ANA, goalId)).observations }).counts.not_checked, 1, 'an unassessed answer never counts');
});

test('Task 07: an unanswered diagnostic probe reused as a practice check after the diagnostic is graded by its server key and fed once', async t => {
  const w = world(t);
  const vocab = REG.claims ? Object.keys(REG.claims).find(id => id.endsWith('foundations/vocabulary')) : null;
  const criterion = { criterionId: 'vocab', label: 'Vocabulary', requirement: 'Use the vocabulary on a new case', requiresReasoning: true, skillKey: vocab };
  const { activity, journey } = await journeyActivity(w.env, ANA, { responseKind: 'choice', criteria: [criterion], prompt: 'On a new case, which holds?', sourceRefs: [{ kind: 'journey_probe', id: 'p1', version: 1, locator: { diagnostic: true } }] });
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-diag-0001', submittedContent: { optionId: 'a' } }, never);
  assert.deepEqual([r.body.assessment.status, r.body.assessment.route, r.body.assessment.observations.map(o => [o.fit, o.application])], ['completed', 'keyed', [['met', 'applied']]]);
  const events = await journeyEvents(w.env, journey);
  assert.deepEqual(events.map(e => [e.ref.probe_id, e.ref.section_id, e.kind]), [['p1', undefined, 'demonstrated_in_transfer']]);
});
