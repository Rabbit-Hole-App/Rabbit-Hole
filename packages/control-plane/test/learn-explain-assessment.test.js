// packages/control-plane/test/learn-explain-assessment.test.js
// Explain-back assessment and revision comparison (plan 2026-10-30-explain-back.md EB-07, EB-08) through the real attempt
// route, store, claim/commit and spend admission on node:sqlite. The evaluator is a stub (deps.callModel) that records the
// actual request; no provider is reached. Stubs prove wiring and validation, never assessment quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAttempt } from '../src/learn-attempt-store.js';
import { assessAttempt } from '../src/learn-assessment.js';
import { EXPLAIN_SYSTEM, compareWithBaseline, explainBackOf } from '../src/learn-explain-assessment.js';
import { ANA, BEN, call, journeyActivity, never, submit, world } from './learn-attempt-fixture.js';
import { coachingActivity, dataOf, replying } from './learn-rich-fixtures.js';

const RV = 'rubric-circular-1';
const CIRCULAR = [
  { criterionId: 'force', label: 'Net force direction', requirement: 'Explains that the net force points toward the centre and why it is needed to change the direction of motion.', requiresReasoning: true, rubricVersion: RV },
  { criterionId: 'velocity', label: 'Velocity direction', requirement: 'States that the velocity is tangent to the circle at each point.', requiresReasoning: false, rubricVersion: RV },
];
const PROMPT = 'A ball on a string moves in a horizontal circle at constant speed. Explain which way the net force and the velocity point, and why.';
const A1 = 'The ball moves along the circle, so the velocity is tangent to the circle. The force pushes the ball outward, which is why the string is tight.';
const A2 = 'The velocity is tangent to the circle. The net force points toward the centre: without it the ball would keep going straight, so the inward pull keeps changing its direction.';
const A2_INWARD = 'The net force points toward the centre: without it the ball would keep going straight, so the inward pull keeps changing its direction. The velocity also points inward toward the centre.';

const j = (criterionId, fit, evidence = [], extra = {}) => ({ criterionId, version: 1, fit, reasoning: extra.reasoning ?? (fit === 'met' ? (criterionId === 'force' ? 'supported' : 'not_required') : criterionId === 'force' ? 'missing' : 'not_required'), evidence, alternative: false, uncertain: false, explanation: extra.explanation ?? `${criterionId} ${fit}` });
const reply1 = {
  criteria: [j('force', 'not_met', [], { explanation: 'Says the force pushes outward: the outward-force misconception.' }), j('velocity', 'met', ['the velocity is tangent to the circle'])],
  feedback: {
    explainedWell: [
      { criterionId: 'velocity', version: 1, text: 'You correctly say the velocity is tangent.', evidence: ['the velocity is tangent to the circle'] },
      { criterionId: 'force', version: 1, text: 'Invented strength.', evidence: ['words the learner never wrote'] },
    ],
    revisit: { criterionId: 'force', version: 1, text: 'Which way must the force point to keep turning the ball?', evidence: ['The force pushes the ball outward'] },
    tryNext: 'Imagine the string breaks: which way does the ball go?',
  },
  priorCorrections: [], notes: [],
};
const reply2 = {
  criteria: [j('force', 'met', ['The net force points toward the centre: without it the ball would keep going straight']), j('velocity', 'met', ['The velocity is tangent to the circle'])],
  feedback: {
    explainedWell: [{ criterionId: 'force', version: 1, text: 'You now explain why the force points inward.', evidence: ['without it the ball would keep going straight'] }],
    revisit: { criterionId: 'force', version: 1, text: 'Repeated resolved nudge.', evidence: [] },
    tryNext: 'Predict what happens to the force if the speed doubles.',
  },
  priorCorrections: [], notes: [],
};

const ON = { TUTOR_EXPLAIN_BACK_ENABLED: 'true' };
async function ebWorld(t, env = ON, opts = {}) {
  const w = world(t, env);
  const { activity, goalId } = await coachingActivity(w.env, { label: 'Circular motion', criteria: CIRCULAR, prompt: PROMPT, ...opts });
  return { ...w, activity, goalId };
}
let n = 0;
const send = (w, content, deps, key = `eb-${++n}-${Math.random().toString(36).slice(2, 10)}`) =>
  submit(w.env, ANA, w.activity, { submissionKey: key, submittedContent: { kind: 'explain_back', ...content } }, { ...never, ...deps });
const reviewOf = r => r.body.assessment.provenance.review;
const fits = r => Object.fromEntries(r.body.assessment.observations.map(o => [o.criterionId, o.fit]));
const changes = r => Object.fromEntries(reviewOf(r).comparison.criteria.map(c => [c.criterionId, c.change]));

test('the general rubric switch does not open Explain-back, and its own switch off makes no call', async t => {
  const w = await ebWorld(t, { TUTOR_RUBRIC_ASSESSMENT_ENABLED: 'true' });
  const r = await send(w, { text: A1 }, {});
  assert.deepEqual([r.body.assessment.status, r.body.assessment.reason], ['unavailable', 'explain_back_disabled']);
  // A legacy text answer (no discriminator) keeps the existing route.
  assert.equal(explainBackOf({ submittedContent: { text: A1 } }), null);
});

test('attempt 1: one call with the exact answer and rubric; validated feedback, citations, coverage and rating', async t => {
  const w = await ebWorld(t);
  const stub = replying(reply1);
  const r = await send(w, { text: A1 }, { callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].model, 'claude-opus-5-5');
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(Object.keys(data).sort(), ['current', 'rubric', 'task']);
  assert.equal(data.task, PROMPT);
  assert.deepEqual(data.current.evidence, [{ id: 'text', kind: 'typed_text', text: A1 }]);
  assert.deepEqual(data.current.notInspected, []);
  assert.deepEqual(data.rubric.map(c => [c.criterionId, c.version]), [['force', 1], ['velocity', 1]]);
  const a = r.body.assessment;
  assert.deepEqual([a.status, a.route, a.provenance.route, a.rubricVersion], ['completed', 'larger', 'explain_back', RV]);
  assert.deepEqual(fits(r), { force: 'not_met', velocity: 'met' });
  const review = reviewOf(r);
  // A strength citing words not in the answer is dropped: no invented strength, no unfound citation.
  assert.deepEqual(review.feedback.explainedWell.map(e => e.criterionId), ['velocity']);
  const span = review.feedback.explainedWell[0].spans[0];
  assert.equal(A1.slice(span.start, span.end), 'the velocity is tangent to the circle');
  assert.equal(review.feedback.revisit.criterionId, 'force');
  assert.equal(review.feedback.tryNext, reply1.feedback.tryNext);
  assert.deepEqual(a.provenance.coverage, [{ id: 'text', kind: 'typed_text', state: 'read' }]);
  // force: not met (0, weight 1, required); velocity met (1): round(10 x 1/2) = 5, capped at 9 anyway.
  assert.deepEqual([review.rating.status, review.rating.score, review.rating.outOf, review.rating.rubricVersion], ['rated', 5, 10, RV]);
  assert.equal(review.comparison, undefined, 'a first attempt has no comparison');
  assert.equal(a.provenance.baseline, undefined);
});

test('attempt 2: the request carries the exact parent answer and pinned review; a corrected misconception is resolved; attempt 1 is unchanged', async t => {
  const w = await ebWorld(t);
  const first = await send(w, { text: A1 }, { callModel: replying(reply1).callModel });
  const before = await readAttempt(w.env, ANA, first.body.attempt.attemptId);
  const stub = replying(reply2);
  const second = await send(w, { text: A2, baseline: { attemptId: first.body.attempt.attemptId } }, { callModel: stub.callModel });
  assert.equal(stub.calls.length, 1, 'one call covers judging and comparing');
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(Object.keys(data), ['task', 'rubric', 'current', 'previousAttempt'], 'current evidence comes before the previous attempt');
  assert.equal(data.current.evidence[0].text, A2);
  assert.equal(data.previousAttempt.answer.text, A1, 'the exact parent answer');
  assert.deepEqual(data.previousAttempt.review.criteria.map(c => [c.criterionId, c.fit, c.explanation]), [
    ['force', 'not_met', 'Says the force pushes outward: the outward-force misconception.'], ['velocity', 'met', 'velocity met']]);
  assert.deepEqual(data.previousAttempt.review.feedback, reviewOf(first).feedback, 'the exact previous feedback');
  assert.match(EXPLAIN_SYSTEM, /not evidence for the current answer, and the previous review may be wrong/);
  const review = reviewOf(second);
  assert.deepEqual(second.body.assessment.provenance.baseline, { parentAttemptId: first.body.attempt.attemptId, assessmentId: first.body.assessment.assessmentId, available: true });
  assert.deepEqual(changes(second), { force: 'resolved', velocity: 'still_met' });
  assert.equal(review.feedback.revisit, null, 'a resolved criticism is not repeated');
  assert.deepEqual([review.rating.score, review.comparison.rating], [10, { comparable: true, reason: null, previous: 5, current: 10 }]);
  // A later reassessment of the parent never changes what attempt 2 compared against, and attempt 1 is unchanged.
  assert.deepEqual(await readAttempt(w.env, ANA, first.body.attempt.attemptId), before);
});

test('persisting and regressed gaps, and no improvement for the same answer', async t => {
  const w = await ebWorld(t);
  const first = await send(w, { text: A1 }, { callModel: replying(reply1).callModel });
  const parent = { attemptId: first.body.attempt.attemptId };
  const regressed = await send(w, { text: A2_INWARD, baseline: parent }, { callModel: replying({ ...reply2, criteria: [j('force', 'partial', ['The net force points toward the centre'], { reasoning: 'partial' }), j('velocity', 'not_met')] }).callModel });
  assert.deepEqual(changes(regressed), { force: 'improved', velocity: 'regressed' });
  assert.ok(reviewOf(regressed).rating.score < reviewOf(first).rating.score + 1, 'the score may fall; no bonus for a second attempt');
  const same = await send(w, { text: A1, baseline: parent }, { callModel: replying(reply1).callModel });
  assert.deepEqual(changes(same), { force: 'persisting', velocity: 'still_met' });
  assert.equal(reviewOf(same).rating.score, reviewOf(first).rating.score, 'same evidence, same number');
});

test('an intentionally wrong prior review: the current answer is judged on its own and the correction is not learner improvement', async t => {
  const w = await ebWorld(t);
  // The first review wrongly calls a correct force explanation the outward-force misconception.
  const wrong = { ...reply1, criteria: [j('force', 'not_met', [], { explanation: 'Outward-force misconception.' }), j('velocity', 'met', ['The velocity is tangent to the circle'])], feedback: { explainedWell: [], revisit: null, tryNext: null } };
  const first = await send(w, { text: A2 }, { callModel: replying(wrong).callModel });
  const stub = replying({ ...reply2, priorCorrections: [{ criterionId: 'force', version: 1, explanation: 'The earlier answer already said the net force points toward the centre.' }, { criterionId: 'made-up', version: 1, explanation: 'x' }] });
  const second = await send(w, { text: `${A2} `, baseline: { attemptId: first.body.attempt.attemptId } }, { callModel: stub.callModel });
  assert.equal(dataOf(stub.calls[0].body).previousAttempt.review.criteria[0].fit, 'not_met', 'the evaluator sees the prior judgement as data');
  assert.deepEqual(fits(second), { force: 'met', velocity: 'met' }, 'current judgement is not anchored to the wrong prior');
  assert.deepEqual(changes(second), { force: 'prior_corrected', velocity: 'still_met' });
  assert.deepEqual(reviewOf(second).priorCorrections.map(k => k.criterionId), ['force'], 'an unknown criterion is dropped');
  assert.equal(reviewOf(second).rating.score, 10);
  // The historical record keeps the wrong review as it was.
  assert.equal(fits(first).force, 'not_met');
});

test('missing or foreign baselines: the current answer is still assessed, comparison unavailable, nothing foreign is read', async t => {
  const w = await ebWorld(t);
  const failed = await send(w, { text: A1 }, { callModel: replying(reply1, { status: 500 }).callModel });
  assert.equal(failed.body.assessment.status, 'failed');
  const stub = replying(reply2);
  const r = await send(w, { text: A2, baseline: { attemptId: failed.body.attempt.attemptId } }, { callModel: stub.callModel });
  assert.equal(dataOf(stub.calls[0].body).previousAttempt, undefined);
  assert.deepEqual(reviewOf(r).comparison, { available: false, reason: 'no_baseline_review', parentAttemptId: failed.body.attempt.attemptId });
  assert.equal(reviewOf(r).rating.score, 10);
  // Another learner's attempt, and a made-up id, are both unavailable; another activity's attempt is a mismatch.
  const { activity: benActivity } = await journeyActivity(w.env, BEN);
  const ben = await submit(w.env, BEN, benActivity, { submissionKey: 'eb-ben-00001', submittedContent: { kind: 'explain_back', text: A1 } }, { ...never, callModel: replying(reply1).callModel });
  const other = await coachingActivity(w.env, { label: 'Other', criteria: CIRCULAR.map(c => ({ ...c })), prompt: 'Another task' });
  const foreign = await submit(w.env, ANA, other.activity, { submissionKey: 'eb-foreign-0001', submittedContent: { kind: 'explain_back', text: A1 } }, { ...never, callModel: replying(reply1).callModel });
  for (const [attemptId, reason] of [['at_does-not-exist', 'parent_unavailable'], [ben.body.attempt.attemptId, 'parent_unavailable'], [foreign.body.attempt.attemptId, 'parent_mismatch']]) {
    const s = replying(reply2);
    const x = await send(w, { text: `${A2} ${reason}`, baseline: { attemptId } }, { callModel: s.callModel });
    assert.equal(dataOf(s.calls[0].body).previousAttempt, undefined, reason);
    assert.equal(reviewOf(x).comparison.reason, reason);
  }
});

test('changed question or rubric versions are not comparable', () => {
  const criteria = [{ criterionId: 'force', version: 2 }, { criterionId: 'velocity', version: 1 }, { criterionId: 'new', version: 1 }];
  const observations = criteria.map(c => ({ criterionId: c.criterionId, criterionVersion: c.version, fit: 'met' }));
  const baseline = { available: true, parentAttemptId: 'at_1', assessmentId: 'as_1', rubricVersion: RV, questionChanged: false, previous: [{ criterionId: 'force', version: 1, fit: 'not_met' }, { criterionId: 'velocity', version: 1, fit: 'unclear' }] };
  assert.deepEqual(compareWithBaseline({ criteria, observations, baseline }).criteria.map(c => [c.change, c.reason]), [['not_comparable', 'criterion_changed'], ['not_comparable', 'previous_unclear'], ['not_comparable', 'not_in_baseline']]);
  assert.ok(compareWithBaseline({ criteria, observations, baseline: { ...baseline, questionChanged: true } }).criteria.every(c => c.reason === 'question_changed'));
  assert.equal(compareWithBaseline({ criteria, observations, baseline: null }), null);
});

test('inputs without an adapter are reported, never read or judged as wrong; an answer with nothing readable makes no call', async t => {
  const w = await ebWorld(t, ON, { responseKind: 'drawing' }); // ponytail: an object-content kind until D's combined kind lands
  const stub = replying(reply1);
  const r = await send(w, { text: A1, voice: { assetId: 'vn_1' } }, { callModel: stub.callModel });
  assert.deepEqual(dataOf(stub.calls[0].body).current.notInspected, [{ id: 'voice', kind: 'voice', reason: 'adapter_pending' }]);
  assert.deepEqual(r.body.assessment.provenance.coverage.map(c => [c.id, c.state]), [['text', 'read'], ['voice', 'unsupported']]);
  const force = r.body.assessment.observations.find(o => o.criterionId === 'force');
  assert.deepEqual([force.fit, force.reason], ['unclear', 'evidence_unread'], 'not met on partial evidence is not a misconception');
  assert.deepEqual([reviewOf(r).rating.status, reviewOf(r).rating.reason, reviewOf(r).rating.score], ['unrated', 'evidence_incomplete', undefined]);
  const empty = await send(w, { text: '', voice: { assetId: 'vn_2' } }, {});
  assert.deepEqual([empty.body.assessment.status, empty.body.assessment.reason], ['unavailable', 'no_readable_evidence']);
});

test('no duplicate calls: a replayed submission and a re-read never call again; a timeout is unknown and never retried', async t => {
  const w = await ebWorld(t);
  const stub = replying(reply1);
  const a = await send(w, { text: A1 }, { callModel: stub.callModel }, 'eb-replay-0001');
  const b = await send(w, { text: A1 }, { callModel: stub.callModel }, 'eb-replay-0001');
  assert.equal(b.body.replayed, true);
  await assessAttempt(w.env, ANA, a.body.attempt.attemptId, { ...never });
  assert.equal(stub.calls.length, 1);
  let calls = 0;
  const hang = async () => { calls += 1; return new Promise(() => {}); };
  const slow = await send(w, { text: A2 }, { callModel: hang, timeoutMs: 20 });
  assert.deepEqual([slow.body.assessment.status, slow.body.assessment.reason], ['unknown', 'completion_unknown']);
  const reread = await call(w.env, ANA, 'GET', `/api/learn/tutor/attempts/${slow.body.attempt.attemptId}`);
  assert.equal(reread.body.assessment.status, 'unknown');
  await assessAttempt(w.env, ANA, slow.body.attempt.attemptId, { callModel: hang });
  assert.equal(calls, 1);
});
