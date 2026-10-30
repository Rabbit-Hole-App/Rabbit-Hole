// packages/control-plane/test/learn-explain-assessment.test.js
// Explain-back assessment and revision comparison (plan 2026-10-30-explain-back.md EB-07, EB-08) through the real attempt
// route, store, claim/commit and spend admission on node:sqlite. Answers and reviews are the EB-01 contract. The evaluator
// is a stub (deps.callModel) that records the actual request; no provider is reached. Stubs prove wiring and validation,
// never assessment quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateExplainBackReview } from '../../web/src/explain-back-contract.js';
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
const VOICE = { evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voice00000001', revision: 1, hash: 'a'.repeat(64), mime: 'audio/webm', durationMs: 31500 };

const j = (criterionId, fit, evidence = [], extra = {}) => ({ criterionId, version: 1, fit, reasoning: extra.reasoning ?? (fit === 'met' ? (criterionId === 'force' ? 'supported' : 'not_required') : criterionId === 'force' ? 'missing' : 'not_required'), evidence, contradicted: extra.contradicted ?? false, alternative: false, uncertain: false, question: null, explanation: extra.explanation ?? `${criterionId} ${fit}` });
const reply1 = {
  criteria: [j('force', 'not_met', ['The force pushes the ball outward'], { contradicted: true, explanation: 'Says the force pushes outward: the outward-force misconception.' }), j('velocity', 'met', ['the velocity is tangent to the circle'])],
  feedback: {
    strengths: { text: 'You correctly say the velocity is tangent.', evidence: ['the velocity is tangent to the circle', 'words the learner never wrote'] },
    revisit: { criterionId: 'force', version: 1, text: 'Which way must the force point to keep turning the ball?', evidence: ['The force pushes the ball outward'] },
    next: 'Imagine the string breaks: which way does the ball go?',
  },
  priorCorrections: [], notes: [],
};
const reply2 = {
  criteria: [j('force', 'met', ['The net force points toward the centre: without it the ball would keep going straight']), j('velocity', 'met', ['The velocity is tangent to the circle'])],
  feedback: {
    strengths: { text: 'You now explain why the force points inward.', evidence: ['without it the ball would keep going straight'] },
    revisit: { criterionId: 'force', version: 1, text: 'Repeated resolved nudge.', evidence: [] },
    next: 'Predict what happens to the force if the speed doubles.',
  },
  priorCorrections: [], notes: [],
};

const ON = { TUTOR_EXPLAIN_BACK_ENABLED: 'true' };
async function ebWorld(t, env = ON) {
  const w = world(t, env);
  const { activity, goalId } = await coachingActivity(w.env, { label: 'Circular motion', criteria: CIRCULAR, prompt: PROMPT, responseKind: 'explain_back' });
  return { ...w, activity, goalId };
}
const answerOf = (content = {}) => ({ v: 1, kind: 'explain_back', text: '', voice: [], resources: [], assistance: [], ...content });
let n = 0;
const send = (w, content, deps, key = `eb-${++n}-${Math.random().toString(36).slice(2, 10)}`) =>
  submit(w.env, ANA, w.activity, { submissionKey: key, submittedContent: answerOf(content) }, { ...never, ...deps });
const baselineOf = r => ({ parentAttemptId: r.body.attempt.attemptId, parentAssessmentId: r.body.assessment.assessmentId });
const reviewOf = r => r.body.assessment.provenance.review;
const fits = r => Object.fromEntries(r.body.assessment.observations.map(o => [o.criterionId, o.fit]));
const changes = r => Object.fromEntries(reviewOf(r).comparison.items.map(c => [c.criterionId, c.change]));
const valid = (r, content) => assert.deepEqual(validateExplainBackReview(reviewOf(r), answerOf(content)), { ok: true, errors: [] });

test('the general rubric switch does not open Explain-back, and its own switch off makes no call', async t => {
  const w = await ebWorld(t, { TUTOR_RUBRIC_ASSESSMENT_ENABLED: 'true' });
  const r = await send(w, { text: A1 }, {});
  assert.deepEqual([r.body.assessment.status, r.body.assessment.reason], ['unavailable', 'explain_back_disabled']);
  // A legacy text answer (no discriminator) keeps the existing route.
  assert.equal(explainBackOf({ submittedContent: { text: A1 } }), null);
});

test('attempt 1: one call with the exact answer and rubric; a contract review with validated citations, coverage and rating', async t => {
  const w = await ebWorld(t);
  const stub = replying(reply1);
  const r = await send(w, { text: A1 }, { callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].model, 'claude-opus-5-5');
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(Object.keys(data).sort(), ['current', 'rubric', 'task']);
  assert.equal(data.task, PROMPT);
  assert.deepEqual(data.current, { evidence: [{ id: 'text', kind: 'typed_text', text: A1 }], notInspected: [] });
  assert.deepEqual(data.rubric.map(c => [c.criterionId, c.version]), [['force', 1], ['velocity', 1]]);
  const a = r.body.assessment;
  assert.deepEqual([a.status, a.route, a.provenance.route, a.rubricVersion], ['completed', 'larger', 'explain_back', RV]);
  assert.deepEqual(fits(r), { force: 'not_met', velocity: 'met' });
  assert.ok(a.observations.every(o => o.assistance === 'none'), 'a first attempt is unaided');
  const review = reviewOf(r);
  valid(r, { text: A1 });
  assert.deepEqual([review.v, review.attemptId, review.assessmentId, review.status], [1, a.attemptId, a.assessmentId, 'completed']);
  assert.deepEqual(review.judgments.map(x => [x.criterionId, x.judgment, x.fit]), [['force', 'contradicted', 'not_met'], ['velocity', 'demonstrated', 'met']]);
  // Only citations found in the answer survive; each is a span of the typed text.
  const [cite] = review.feedback.strengths.citations;
  assert.equal(review.feedback.strengths.citations.length, 1);
  assert.equal(A1.slice(cite.locator.start, cite.locator.end), 'the velocity is tangent to the circle');
  assert.equal(review.feedback.revisit.text, reply1.feedback.revisit.text);
  assert.equal(review.feedback.next.text, reply1.feedback.next);
  assert.deepEqual(review.coverage, [{ evidenceId: 'text', status: 'read' }]);
  // force not met (0), velocity met (1): round(10 x 1/2) = 5.
  assert.deepEqual([review.rating.status, review.rating.score, review.rating.outOf, review.rating.rubricVersion], ['rated', 5, 10, RV]);
  assert.equal(review.comparison, undefined, 'a first attempt has no comparison');
});

test('attempt 2: the request carries the exact parent answer and pinned review; a corrected misconception is resolved; attempt 1 is unchanged', async t => {
  const w = await ebWorld(t);
  const first = await send(w, { text: A1 }, { callModel: replying(reply1).callModel });
  const before = await readAttempt(w.env, ANA, first.body.attempt.attemptId);
  const stub = replying(reply2);
  const second = await send(w, { text: A2, baseline: baselineOf(first) }, { callModel: stub.callModel });
  assert.equal(stub.calls.length, 1, 'one call covers judging and comparing');
  const data = dataOf(stub.calls[0].body);
  assert.deepEqual(Object.keys(data), ['task', 'rubric', 'current', 'previousAttempt'], 'current evidence comes before the previous attempt');
  assert.equal(data.current.evidence[0].text, A2);
  assert.equal(data.previousAttempt.answer.text, A1, 'the exact parent answer');
  assert.deepEqual(data.previousAttempt.review.criteria.map(c => [c.criterionId, c.judgment, c.note]), [
    ['force', 'contradicted', 'Says the force pushes outward: the outward-force misconception.'], ['velocity', 'demonstrated', 'velocity met']]);
  assert.deepEqual(data.previousAttempt.review.feedback, { strengths: 'You correctly say the velocity is tangent.', revisit: reply1.feedback.revisit.text, next: reply1.feedback.next }, 'the exact previous feedback');
  assert.match(EXPLAIN_SYSTEM, /not evidence for the current answer, and the previous review may be wrong/);
  const review = reviewOf(second);
  valid(second, { text: A2, baseline: baselineOf(first) });
  assert.deepEqual([review.comparison.parentAttemptId, review.comparison.parentAssessmentId, review.comparison.comparable], [first.body.attempt.attemptId, first.body.assessment.assessmentId, true]);
  assert.deepEqual(changes(second), { force: 'resolved' }, 'velocity was met and still is: nothing to report');
  assert.equal(review.comparison.items[0].baselineCitations[0].evidenceId, 'text');
  assert.equal(review.feedback.revisit.text, '', 'a resolved criticism is not repeated');
  assert.deepEqual([review.rating.score, review.comparison.rating], [10, { comparable: true, reason: null, previous: 5, current: 10 }]);
  // Made after seeing the parent's review: assisted, and the review says why.
  assert.ok(second.body.assessment.observations.every(o => o.assistance === 'assisted'));
  assert.deepEqual(review.provenance.assistance, [{ kind: 'saw_prior_feedback', id: first.body.assessment.assessmentId }]);
  assert.deepEqual(await readAttempt(w.env, ANA, first.body.attempt.attemptId), before, 'attempt 1 is unchanged');
});

test('persisting, improved, regressed and new gaps, and no improvement for the same answer', async t => {
  const w = await ebWorld(t);
  const first = await send(w, { text: A1 }, { callModel: replying({ ...reply1, criteria: [j('force', 'not_met'), j('velocity', 'met', ['the velocity is tangent to the circle'])] }).callModel });
  const regressed = await send(w, { text: A2_INWARD, baseline: baselineOf(first) }, { callModel: replying({ ...reply2, criteria: [j('force', 'partial', ['The net force points toward the centre'], { reasoning: 'partial' }), j('velocity', 'not_met', ['The velocity also points inward toward the centre'], { contradicted: true })] }).callModel });
  assert.deepEqual(changes(regressed), { force: 'persisting', velocity: 'regressed' });
  assert.equal(reviewOf(regressed).comparison.items[0].note, 'improved_to_partial');
  assert.ok(reviewOf(regressed).rating.score <= reviewOf(first).rating.score, 'the score may fall; no bonus for a second attempt');
  const misconception = await send(w, { text: A1, baseline: baselineOf(first) }, { callModel: replying(reply1).callModel });
  assert.deepEqual(changes(misconception), { force: 'new' }, 'not established before, contradicted now: a new misconception');
  const same = await send(w, { text: `${A1} `, baseline: baselineOf(first) }, { callModel: replying({ ...reply1, criteria: [j('force', 'not_met'), j('velocity', 'met', ['the velocity is tangent to the circle'])] }).callModel });
  assert.deepEqual(changes(same), { force: 'persisting' });
  assert.equal(reviewOf(same).rating.score, reviewOf(first).rating.score, 'same evidence, same number');
});

test('an intentionally wrong prior review: the current answer is judged on its own and the correction is not learner improvement', async t => {
  const w = await ebWorld(t);
  // The first review wrongly calls a correct force explanation the outward-force misconception.
  const wrong = { ...reply1, criteria: [j('force', 'not_met', [], { explanation: 'Outward-force misconception.' }), j('velocity', 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: '', evidence: [] }, revisit: null, next: null } };
  const first = await send(w, { text: A2 }, { callModel: replying(wrong).callModel });
  const stub = replying({ ...reply2, priorCorrections: [{ criterionId: 'force', version: 1, explanation: 'The earlier answer already said the net force points toward the centre.' }, { criterionId: 'made-up', version: 1, explanation: 'x' }] });
  const second = await send(w, { text: `${A2} `, baseline: baselineOf(first) }, { callModel: stub.callModel });
  assert.equal(dataOf(stub.calls[0].body).previousAttempt.review.criteria[0].fit, 'not_met', 'the evaluator sees the prior judgement as data');
  assert.deepEqual(fits(second), { force: 'met', velocity: 'met' }, 'current judgement is not anchored to the wrong prior');
  assert.deepEqual(changes(second), { force: 'prior_feedback_corrected' });
  assert.deepEqual(reviewOf(second).provenance.priorCorrections.map(k => k.criterionId), ['force'], 'an unknown criterion is dropped');
  assert.equal(reviewOf(second).rating.score, 10);
  assert.equal(fits(first).force, 'not_met', 'the historical record keeps the wrong review as it was');
});

test('missing or foreign baselines: the current answer is still assessed, comparison unavailable, nothing foreign is read', async t => {
  const w = await ebWorld(t);
  const failed = await send(w, { text: A1 }, { callModel: replying(reply1, { status: 500 }).callModel });
  assert.equal(failed.body.assessment.status, 'failed');
  const { activity: benActivity } = await journeyActivity(w.env, BEN);
  const ben = await submit(w.env, BEN, benActivity, { submissionKey: 'eb-ben-00001', submittedContent: { text: A1 } }, { ...never, ask: async () => ({ body: { answers: {} } }) });
  const other = await coachingActivity(w.env, { label: 'Other', criteria: CIRCULAR, prompt: 'Another task', responseKind: 'explain_back' });
  const foreign = await submit(w.env, ANA, other.activity, { submissionKey: 'eb-foreign-0001', submittedContent: answerOf({ text: A1 }) }, { ...never, callModel: replying(reply1).callModel });
  for (const [baseline, reason] of [
    [baselineOf(failed), 'no_baseline_review'],
    [{ parentAttemptId: failed.body.attempt.attemptId, parentAssessmentId: null }, 'no_baseline_review'],
    [{ parentAttemptId: 'at_does-not-exist', parentAssessmentId: 'as_x' }, 'parent_unavailable'],
    [baselineOf(ben), 'parent_unavailable'],
    [baselineOf(foreign), 'parent_mismatch'],
  ]) {
    const s = replying(reply2);
    const x = await send(w, { text: `${A2} ${reason}`, baseline }, { callModel: s.callModel });
    assert.equal(dataOf(s.calls[0].body).previousAttempt, undefined, reason);
    assert.deepEqual(reviewOf(x).comparison, { ...baseline, comparable: false, reason, items: [] }, reason);
    assert.equal(reviewOf(x).rating.score, 10, 'the current answer is still assessed and rated');
    assert.ok(x.body.assessment.observations.every(o => o.assistance === 'none'), 'no reviewed parent, so no feedback was seen');
    valid(x, { text: `${A2} ${reason}`, baseline });
  }
});

test('changed question or rubric versions are not comparable', () => {
  const judgments = [{ criterionId: 'force', criterionVersion: 2, judgment: 'demonstrated', fit: 'met', citations: [] }, { criterionId: 'velocity', criterionVersion: 1, judgment: 'demonstrated', fit: 'met', citations: [] }, { criterionId: 'new', criterionVersion: 1, judgment: 'demonstrated', fit: 'met', citations: [] }];
  const baseline = { available: true, parentAttemptId: 'at_1', parentAssessmentId: 'as_1', questionChanged: false, judgments: [{ criterionId: 'force', criterionVersion: 1, fit: 'not_met' }, { criterionId: 'velocity', criterionVersion: 1, fit: 'unclear' }] };
  assert.deepEqual(compareWithBaseline({ judgments, baseline }).items.map(c => [c.change, c.note]), [['not_comparable', 'criterion_changed'], ['not_comparable', 'previous_unassessed'], ['not_comparable', 'not_in_baseline']]);
  assert.deepEqual(compareWithBaseline({ judgments, baseline: { ...baseline, questionChanged: true } }), { parentAttemptId: 'at_1', parentAssessmentId: 'as_1', comparable: false, reason: 'question_changed', items: [] });
  assert.equal(compareWithBaseline({ judgments, baseline: null }), null);
});

test('inputs that were not read are reported, never judged wrong; an answer with nothing readable makes no call', async t => {
  const w = await ebWorld(t);
  const stub = replying(reply1);
  const r = await send(w, { text: A1, voice: [VOICE] }, { callModel: stub.callModel });
  assert.deepEqual(dataOf(stub.calls[0].body).current.notInspected, [{ id: 'ev_voice_1', status: 'unavailable', note: 'transcript_unavailable' }]);
  assert.deepEqual(reviewOf(r).coverage.map(c => [c.evidenceId, c.status]), [['text', 'read'], ['ev_voice_1', 'unavailable']]);
  const force = r.body.assessment.observations.find(o => o.criterionId === 'force');
  assert.deepEqual([force.fit, force.reason], ['unclear', 'evidence_unread'], 'not met on partial evidence is not a misconception');
  assert.equal(reviewOf(r).judgments[0].judgment, 'unassessed');
  assert.deepEqual([reviewOf(r).rating.status, reviewOf(r).rating.reason, reviewOf(r).rating.score], ['unrated', 'evidence_incomplete', undefined]);
  valid(r, { text: A1, voice: [VOICE] });
  const empty = await send(w, { voice: [VOICE] }, {});
  assert.deepEqual([empty.body.assessment.status, empty.body.assessment.reason], ['unavailable', 'no_readable_evidence']);
});

test('uncertain or malformed replies never become a number or an observation', async t => {
  const w = await ebWorld(t);
  const r = await send(w, { text: A1 }, { callModel: replying({ criteria: [j('force', 'unclear'), j('velocity', 'met', ['the velocity is tangent to the circle'])] }).callModel });
  assert.equal(r.body.assessment.status, 'completed');
  assert.deepEqual([reviewOf(r).rating.status, reviewOf(r).rating.reason], ['unrated', 'criteria_unassessed']);
  assert.deepEqual(reviewOf(r).feedback, { strengths: { text: '', citations: [] }, revisit: { text: '', citations: [] }, next: { text: '', citations: [] } }, 'no feedback is invented');
  const junk = await send(w, { text: A2 }, { callModel: replying(null, { text: 'not json' }).callModel });
  assert.deepEqual([junk.body.assessment.status, junk.body.assessment.reason, junk.body.assessment.observations.length], ['failed', 'malformed_evaluation', 0]);
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

// Static Sketch (slice 3a). The asset reader stands in for D's private attempt-asset read; it returns R's capture structure.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_SHA = createHash('sha256').update(PNG).digest('hex');
const SKETCH = { evidenceId: 'ev_sketch_1', role: 'sketch', media: 'image', state: 'ready', assetId: 'aa_sketch0000001', revision: 1, hash: PNG_SHA, mime: 'image/png', bytes: PNG.length };
const LABELS = 'arrow label: "F"\ntext: "centre"';
const reader = (over = {}) => {
  const reads = [];
  return { reads, readAttemptAsset: async (_env, actor, attempt, e) => { reads.push({ actor, attemptId: attempt.attemptId, assetId: e.assetId }); return e.assetId === SKETCH.assetId ? { bytes: PNG, mime: 'image/png', marks: 3, text: LABELS, ...over } : null; } };
};
const look = (criterionId, perception, fit, extra = {}) => ({ ...j(criterionId, fit, extra.evidence ?? [], extra), perception, sketchEvidence: extra.sketchEvidence ?? [], question: extra.question ?? null });

test('sketch only: the exact hash-checked image and its marks go to one visual call; perception gates judgement', async t => {
  const w = await ebWorld(t);
  const r0 = reader();
  const stub = replying({ sketchReadable: true, criteria: [
    look('force', 'clear', 'met', { reasoning: 'supported', sketchEvidence: ['arrow labelled F pointing to the centre'], evidence: ['centre'] }),
    look('velocity', 'ambiguous', 'not_met', { question: 'Which arrow shows the velocity?' }),
  ], feedback: { strengths: { text: 'Your force arrow points to the centre.', evidence: ['arrow label: "F"'] }, revisit: { criterionId: 'velocity', version: 1, text: 'Add the velocity arrow.', evidence: [] }, next: 'Draw where the ball goes if the string breaks.' } });
  const r = await send(w, { sketch: SKETCH }, { callModel: stub.callModel, readAttemptAsset: r0.readAttemptAsset });
  assert.equal(stub.calls.length, 1);
  assert.deepEqual(r0.reads.map(x => x.assetId), [SKETCH.assetId], 'read once');
  const body = stub.calls[0].body;
  assert.match(body.system, /An unreadable or ambiguous sketch is never evidence of a misconception/);
  const image = body.messages[0].content.find(b => b.type === 'image');
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') }, 'the exact submitted bytes');
  assert.deepEqual(dataOf(body).current.evidence, [{ id: 'ev_sketch_1', kind: 'sketch', image: 'attached below', marks: 3, labels: LABELS }]);
  const review = reviewOf(r);
  valid(r, { sketch: SKETCH });
  assert.deepEqual(review.coverage, [{ evidenceId: 'ev_sketch_1', status: 'read', inspected: { image: true, sha256: PNG_SHA, bytes: PNG.length } }]);
  assert.deepEqual(review.judgments.map(x => [x.criterionId, x.judgment, x.question ?? null]), [['force', 'demonstrated', null], ['velocity', 'unassessed', 'Which arrow shows the velocity?']]);
  assert.deepEqual(review.judgments[0].citations, [{ evidenceId: 'ev_sketch_1', locator: { start: LABELS.indexOf('centre'), end: LABELS.indexOf('centre') + 6 } }, { evidenceId: 'ev_sketch_1', locator: { part: 'arrow labelled F pointing to the centre' } }]);
  assert.equal(r.body.assessment.observations.find(o => o.criterionId === 'velocity').reason, 'perception_ambiguous', 'never not met or a misconception');
  assert.deepEqual([review.rating.status, review.rating.reason], ['unrated', 'criteria_unassessed']);
});

test('text and sketch: one call; words can meet a criterion the sketch leaves ambiguous; marks alone earn nothing', async t => {
  const w = await ebWorld(t);
  const r0 = reader(), stub = replying({ criteria: [
    look('force', 'clear', 'met', { reasoning: 'supported', evidence: ['The net force points toward the centre: without it the ball would keep going straight'], sketchEvidence: ['arrow labelled F'] }),
    look('velocity', 'ambiguous', 'met', { evidence: ['The velocity is tangent to the circle'] }),
  ], feedback: reply2.feedback });
  const r = await send(w, { text: A2, sketch: SKETCH }, { callModel: stub.callModel, readAttemptAsset: r0.readAttemptAsset });
  assert.equal(stub.calls.length, 1);
  assert.deepEqual(dataOf(stub.calls[0].body).current.evidence.map(p => p.id), ['text', 'ev_sketch_1']);
  assert.deepEqual(fits(r), { force: 'met', velocity: 'met' });
  assert.deepEqual(reviewOf(r).judgments[1].citations.map(c => c.evidenceId), ['text'], 'an unclear sketch part is not cited');
  assert.equal(reviewOf(r).rating.score, 10);
  valid(r, { text: A2, sketch: SKETCH });
  // A met judgement that names no evidence at all is rejected: marks alone earn nothing.
  const bare = await send(w, { sketch: SKETCH }, { callModel: replying({ criteria: [look('force', 'clear', 'met', { reasoning: 'supported' }), look('velocity', 'clear', 'met')] }).callModel, readAttemptAsset: r0.readAttemptAsset });
  assert.deepEqual(bare.body.assessment.provenance.rejected.map(x => x.reason), ['unsupported_evidence', 'unsupported_evidence']);
});

test('a missing, altered or unreadable sketch is explicit unassessed coverage, never a judgement', async t => {
  const w = await ebWorld(t);
  // No reader (D's asset read not wired), other bytes than submitted, an unsupported type: the image is never sent.
  for (const [deps, status, note] of [[{}, 'unavailable', 'asset_unavailable'], [reader({ bytes: new Uint8Array([1, 2, 3]) }), 'unavailable', 'hash_mismatch'], [reader({ mime: 'image/svg+xml' }), 'unsupported', 'image_not_supported']]) {
    const only = await send(w, { sketch: SKETCH }, { readAttemptAsset: deps.readAttemptAsset });
    assert.deepEqual([only.body.assessment.status, only.body.assessment.reason], ['unavailable', 'no_readable_evidence'], note);
    assert.equal(only.body.assessment.provenance.coverage[0].note, note);
    const stub = replying(reply1);
    const withText = await send(w, { text: A1, sketch: SKETCH }, { callModel: stub.callModel, readAttemptAsset: deps.readAttemptAsset });
    assert.equal(typeof stub.calls[0].body.messages[0].content, 'string', 'text-only request, no image');
    assert.deepEqual(dataOf(stub.calls[0].body).current.notInspected, [{ id: 'ev_sketch_1', status, note }]);
    assert.equal(reviewOf(withText).rating.reason, 'evidence_incomplete');
    assert.equal(fits(withText).force, 'unclear', 'the unread sketch might hold it');
  }
  // The evaluator cannot read the image at all: every sketch-only judgement is unassessed, coverage partial.
  const unreadable = await send(w, { sketch: SKETCH }, { callModel: replying({ sketchReadable: false, criteria: [look('force', 'clear', 'not_met', { contradicted: true }), look('velocity', 'clear', 'met', { sketchEvidence: ['an arrow'] })] }).callModel, readAttemptAsset: reader().readAttemptAsset });
  assert.deepEqual(Object.values(fits(unreadable)), ['unclear', 'unclear']);
  assert.deepEqual(reviewOf(unreadable).coverage.map(c => [c.status, c.note]), [['partial', 'sketch_unreadable']]);
  assert.equal(reviewOf(unreadable).rating.status, 'unrated');
  valid(unreadable, { sketch: SKETCH });
});

// Voice transcript (slice 3b). D's asset read and derivative store are injected; M's ensureTranscript is the real one, over a
// transcriber double that records each provider call.
const AUDIO = new Uint8Array([79, 103, 103, 83, 1, 2, 3, 4, 5, 6, 7, 8]);
const AUDIO_SHA = createHash('sha256').update(AUDIO).digest('hex');
const NOTE = { ...VOICE, hash: AUDIO_SHA, mime: 'audio/ogg' };
const SPOKEN = 'The net force points toward the centre because without it the ball would keep going straight. The velocity is tangent to the circle.';
function voiceDeps({ heard = { text: SPOKEN }, fail = null, configured = true } = {}) {
  const store = new Map(), heardCalls = [];
  return {
    heardCalls, store,
    readAttemptAsset: async (_env, _actor, _attempt, e) => (e.assetId === NOTE.assetId ? { bytes: AUDIO, mime: 'audio/ogg' } : null),
    transcriptStore: { get: async id => store.get(id) ?? null, put: async record => { store.set(record.transcriptId, record); } },
    transcriber: configured ? { provider: 'openai', model: 'gpt-4o-transcribe', transcribe: async ({ bytes, mime }) => { heardCalls.push({ bytes: bytes.length, mime }); if (fail) throw Object.assign(new Error('x'), { code: fail }); return heard; } } : null,
  };
}
const spokenReply = { criteria: [j('force', 'met', ['The net force points toward the centre because without it the ball would keep going straight']), j('velocity', 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: 'You explain the inward force.', evidence: ['without it the ball would keep going straight'] }, revisit: null, next: 'What if the speed doubles?' } };

test('voice only: the transcript, not the audio, is assessed; coverage says transcript only; text stays empty; one transcription per clip', async t => {
  const w = await ebWorld(t);
  const v = voiceDeps(), stub = replying(spokenReply);
  const r = await send(w, { voice: [NOTE] }, { ...v, callModel: stub.callModel });
  assert.deepEqual(v.heardCalls, [{ bytes: AUDIO.length, mime: 'audio/ogg' }], 'the exact stored note, transcribed once');
  assert.equal(stub.calls.length, 1);
  const body = stub.calls[0].body;
  assert.match(body.system, /you were not given the audio/);
  assert.deepEqual(dataOf(body).current.evidence, [{ id: 'ev_voice_1', kind: 'voice_transcript', text: SPOKEN }]);
  assert.equal(r.body.attempt.submittedContent.text, '', 'the typed answer is untouched');
  const review = reviewOf(r), [record] = [...v.store.values()];
  valid(r, { voice: [NOTE] });
  assert.deepEqual(review.coverage, [{ evidenceId: 'ev_voice_1', status: 'partial', inspected: { transcriptOnly: true, audio: false }, derivative: { derivativeId: record.transcriptId, hash: record.derivativeHash, converterVersion: 'openai:gpt-4o-transcribe:v1' }, note: 'Transcript only: the audio itself was not inspected.' }]);
  assert.equal(review.judgments[0].citations[0].evidenceId, 'ev_voice_1');
  assert.deepEqual(review.judgments[0].citations[0].locator, { start: 0, end: SPOKEN.indexOf(' going straight') + ' going straight'.length }, 'no timing is invented without segments');
  assert.deepEqual([review.rating.status, review.rating.score], ['rated', 10], 'a transcript-only review is a full review, labelled as such');
  // A revision that keeps the same note reuses its transcript: no second provider call.
  await send(w, { voice: [NOTE], baseline: baselineOf(r) }, { ...v, callModel: replying(spokenReply).callModel });
  assert.equal(v.heardCalls.length, 1);
});

test('segments give citation times; uncertain words reach the evaluator', async t => {
  const w = await ebWorld(t);
  const [first, second] = ['The net force points toward the centre because without it the ball would keep going straight.', 'The velocity is tangent to the circle.'];
  const v = voiceDeps({ heard: { text: `${first} ${second}`, segments: [{ start: 0, end: 4.2, text: first }, { start: 4.2, end: 6.5, text: second }], logprobs: [{ token: 'tangent', logprob: Math.log(0.3) }, { token: 'velocity', logprob: Math.log(0.99) }] } });
  const stub = replying(spokenReply);
  const r = await send(w, { voice: [NOTE] }, { ...v, callModel: stub.callModel });
  const part = dataOf(stub.calls[0].body).current.evidence[0];
  assert.deepEqual([part.uncertainWords, part.segments.length], [['tangent'], 2]);
  const [force, velocity] = reviewOf(r).judgments.map(x => x.citations[0].locator);
  assert.deepEqual([force.startMs, force.endMs, velocity.startMs, velocity.endMs], [0, 4200, 4200, 6500]);
  valid(r, { voice: [NOTE] });
});

test('a failed or unconfigured transcription is unassessed, never an empty or wrong answer', async t => {
  const w = await ebWorld(t);
  for (const [deps, note] of [[voiceDeps({ fail: 'provider_failed' }), 'transcript_provider_failed'], [voiceDeps({ fail: 'spend_refused' }), 'transcript_spend_refused'], [voiceDeps({ configured: false }), 'transcript_not_configured'], [{}, 'transcript_unavailable'], [voiceDeps({ heard: { text: '   ' } }), 'transcript_no_speech']]) {
    const only = await send(w, { voice: [NOTE] }, deps);
    assert.deepEqual([only.body.assessment.status, only.body.assessment.reason], ['unavailable', 'no_readable_evidence'], note);
    assert.deepEqual(only.body.assessment.provenance.coverage, [{ evidenceId: 'ev_voice_1', status: 'unavailable', note }]);
    assert.equal(only.body.assessment.observations.length, 0, 'no observation, so Progress keeps its last state');
    const stub = replying(reply1);
    const withText = await send(w, { text: A1, voice: [NOTE] }, { ...deps, callModel: stub.callModel });
    assert.equal(fits(withText).force, 'unclear', `${note}: the unread note might hold it`);
    assert.equal(reviewOf(withText).rating.reason, 'evidence_incomplete');
  }
  // A failed transcript is kept and not retried by a later assessment: no provider call repeats on its own.
  const v = voiceDeps({ fail: 'provider_failed' });
  await send(w, { voice: [NOTE] }, v);
  await send(w, { voice: [NOTE] }, v);
  assert.equal(v.heardCalls.length, 1);
});

test('longer histories: the direct parent stays full; earlier attempts are a bounded, pinned criterion summary', async t => {
  const w = await ebWorld(t);
  const chain = [await send(w, { text: A1 }, { callModel: replying(reply1).callModel })];
  for (let i = 1; i < 6; i++) chain.push(await send(w, { text: `${i === 1 ? A1 : A2} (${i})`, baseline: baselineOf(chain.at(-1)) }, { callModel: replying(i === 1 ? reply1 : reply2).callModel }));
  const stub = replying(reply2);
  const last = await send(w, { text: A2, baseline: baselineOf(chain.at(-1)) }, { callModel: stub.callModel });
  const prev = dataOf(stub.calls[0].body).previousAttempt;
  assert.equal(prev.answer.text, `${A2} (5)`, 'the direct parent in full');
  // Newest first, at most HISTORY_LIMIT (4) of the five earlier attempts, each with the review its own child pinned.
  assert.deepEqual(prev.earlierAttempts.map(e => [e.attemptId, e.assessmentId]), [4, 3, 2, 1].map(i => [chain[i].body.attempt.attemptId, chain[i].body.assessment.assessmentId]));
  assert.deepEqual(prev.earlierAttempts.at(-1).criteria, [{ criterionId: 'force', version: 1, judgment: 'contradicted' }, { criterionId: 'velocity', version: 1, judgment: 'demonstrated' }]);
  assert.equal(prev.earlierAttempts.at(-1).rating, 5);
  assert.equal(JSON.stringify(prev.earlierAttempts).includes(A1), false, 'earlier answers are summarized, not resent');
  assert.deepEqual(reviewOf(last).provenance.history, prev.earlierAttempts.map(e => ({ attemptId: e.attemptId, assessmentId: e.assessmentId })));
  assert.match(EXPLAIN_SYSTEM, /"earlierAttempts", when present, summarizes the attempts before that one/);
  // Attempt 2 has only its parent: no summary at all.
  const second = replying(reply2);
  await send(w, { text: `${A2} again`, baseline: baselineOf(chain[0]) }, { callModel: second.callModel });
  assert.equal(dataOf(second.calls[0].body).previousAttempt.earlierAttempts, undefined);
  valid(last, { text: A2, baseline: baselineOf(chain.at(-1)) });
});
