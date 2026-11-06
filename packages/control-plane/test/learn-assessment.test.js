// packages/control-plane/test/learn-assessment.test.js
// Tutor Task 06 (C:/s/spec/tutor-workflow/draft.md; owner decision 7a): assessment routing for saved attempts on node:sqlite. The
// keyed and JEV routes left with the journeys (Tutor cleanup P1): a journey-probe choice and a text answer with no rubric are
// unavailable, with no provider call, and a rubric answer keeps the dispatch and Progress rules shown here. The rubric model is a
// stub; no provider is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveGoalCounts } from '../../web/src/learn-coaching-contract.js';
import { goalEvidence, readAttempt } from '../src/learn-attempt-store.js';
import { advanceActivity, readCoachingState } from '../src/learn-coaching-store.js';
import { ANA, CHECK, CRITERION, act, call, journeyActivity, never, submit, world } from './learn-attempt-fixture.js';
import { WRITING, WRITING_CASES, coachingActivity, replying } from './learn-rich-fixtures.js';

const ON = { TUTOR_RUBRIC_ASSESSMENT_ENABLED: 'true' };
const TEXT = WRITING_CASES.proposalA.text, REPLY = WRITING_CASES.proposalA.reply;
const choice = env => journeyActivity(env, ANA, { responseKind: 'choice', prompt: CHECK.prompt, sourceRefs: [{ kind: 'journey_probe', id: 'c1', version: 1, locator: { sectionId: 's1' } }] });
const stepOf = async (env, activityId) => (await readCoachingState(env, ANA)).activities.find(a => a.activityId === activityId);

// Risk 2 (docs cleanup-v0.3): a goal made from a journey keeps criteria whose probe key is gone. Its choice answer degrades to
// not assessable - saved, nothing observed, no provider - and never throws.
test('journey_probe_choice_is_not_assessable: a choice that answered a journey probe is unavailable (no_answer_key), with no provider call', async t => {
  const w = world(t);
  const { activity } = await choice(w.env);
  for (const [key, optionId] of [['sub-key-right', 'y'], ['sub-key-wrong', 'x'], ['sub-key-other', 'zz']]) {
    const r = await submit(w.env, ANA, activity, { submissionKey: key, submittedContent: { optionId } }, never);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations], ['unavailable', 'no_answer_key', []], optionId);
  }
});

test('journey_text_is_not_assessable: a text answer to a journey activity with no rubric is unavailable (no_registered_claims), with no provider call', async t => {
  const w = world(t);
  const { activity } = await journeyActivity(w.env);
  const r = await submit(w.env, ANA, activity, {}, never);
  assert.deepEqual([r.status, r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations], [200, 'unavailable', 'no_registered_claims', []]);
  assert.deepEqual(r.body.assessment.provenance.unassessed, [{ criterionId: 'mech', version: 1, reason: 'no_registered_claim' }]);
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
  const essayOnly = await make('text', [{ criterionId: 'essay', version: 1 }]);
  const none = await submit(w.env, ANA, essayOnly, { submissionKey: 'sub-essay-0001' }, never);
  assert.deepEqual([none.body.assessment.status, none.body.assessment.reason], ['unavailable', 'no_registered_claims']);
});


test('Slice A loop on the server: goal, activity, submit, assess, Progress input, and the same result after a reload on another client', async t => {
  const w = world(t, ON);
  const { activity, goalId } = await coachingActivity(w.env, { criteria: WRITING });
  const r = await submit(w.env, ANA, activity, { submittedContent: { text: TEXT } }, { ...never, callModel: replying(REPLY).callModel });
  assert.equal(r.body.assessment.status, 'completed');
  // Another device: a fresh env object over the same database, no in-memory state.
  const other = { ...w.env };
  const view = await call(other, ANA, 'GET', `/api/learn/tutor/attempts/${r.body.attempt.attemptId}`);
  assert.deepEqual(view.body.assessment, r.body.assessment);
  const { observations, pendingAssessments } = await goalEvidence(other, ANA, goalId);
  const counts = deriveGoalCounts({ criteria: WRITING.map(c => ({ ...c, version: 1 })), observations });
  assert.deepEqual([counts.total, counts.counts.demonstrated_independently, pendingAssessments], [4, 4, []]);
  // Another learner's evidence for the same goal id is empty.
  assert.deepEqual((await goalEvidence(other, { ...ANA, userId: 'u-ben-7f2a' }, goalId)).observations, []);
});

// ---- Slice A gaps (lane T5) ----

test('gap a: a submit moves its activity to awaiting_feedback, then feedback_ready with the result on its checkpoint, through the coaching revision; a replay moves nothing', async t => {
  const w = world(t);
  const { activity } = await choice(w.env);
  const before = (await readCoachingState(w.env, ANA)).revision;
  const r = await submit(w.env, ANA, activity, { submissionKey: 'sub-step-0001', submittedContent: { optionId: 'y' } }, never);
  const step = await stepOf(w.env, activity.activityId);
  assert.equal(step.status, 'feedback_ready');
  assert.deepEqual(step.checkpoint.assessment, { attemptId: r.body.attempt.attemptId, status: 'unavailable', reason: 'no_answer_key' });
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
  const w = world(t, ON);
  const { activity } = await coachingActivity(w.env, { criteria: WRITING });
  // A rubric call that never answers: the operation stays claimed (pending) while the request waits, so no feedback is claimed.
  void submit(w.env, ANA, activity, { submissionKey: 'sub-hang-0001', submittedContent: { text: TEXT } }, { ...never, callModel: () => new Promise(() => {}) });
  for (let i = 0; i < 50 && (await stepOf(w.env, activity.activityId)).status !== 'awaiting_feedback'; i += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await stepOf(w.env, activity.activityId)).status, 'awaiting_feedback');
  w.sqlite.prepare("UPDATE learn_activities SET status = 'completed' WHERE id = ?").run(activity.activityId);
  assert.equal(await advanceActivity(w.env, ANA, activity.activityId, 'awaiting_feedback'), null);
  assert.equal(await advanceActivity(w.env, ANA, activity.activityId, 'feedback_ready'), null);
  assert.equal((await stepOf(w.env, activity.activityId)).status, 'completed');
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
