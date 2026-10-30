// packages/control-plane/test/learn-explain-assessment.test.js
// Explain-back assessment and revision comparison (plan 2026-10-30-explain-back.md EB-07, EB-08) through the real attempt
// route, store, claim/commit and spend admission on node:sqlite. Answers and reviews are the EB-01 contract. The evaluator
// is a stub (deps.callModel) that records the actual request; no provider is reached. Stubs prove wiring and validation,
// never assessment quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateExplainBackReview } from '../../web/src/explain-back-contract.js';
import { EB_RUBRIC, bindExplainBackCard, readAttempt } from '../src/learn-attempt-store.js';
import { assessAttempt } from '../src/learn-assessment.js';
import { EXPLAIN_SYSTEM, compareWithBaseline, explainBackOf, loadBaseline } from '../src/learn-explain-assessment.js';
import { ANA, BEN, call, never, submit, world } from './learn-attempt-fixture.js';
import { dataOf, replying } from './learn-rich-fixtures.js';
import { DERIVATIVE, explainEvidenceFixture } from './learn-explain-evidence-fixture.js';
import { putAttemptAsset } from '../src/learn-attempt-assets.js';
import { locLabel } from '../src/file-context.js';

// The card's key ideas; D's binding (bindExplainBackCard) makes each one a criterion k_<sha256(idea)>, version 1, rubric eb-v1.
const RV = EB_RUBRIC;
const IDEAS = ['Explains that the net force points toward the centre and why it is needed to change the direction of motion.', 'States that the velocity is tangent to the circle at each point.'];
const idOf = idea => `k_${createHash('sha256').update(idea).digest('hex').slice(0, 16)}`;
const [F, V] = IDEAS.map(idOf);
const PROMPT = 'A ball on a string moves in a horizontal circle at constant speed. Explain which way the net force and the velocity point, and why.';
const A1 = 'The ball moves along the circle, so the velocity is tangent to the circle. The force pushes the ball outward, which is why the string is tight.';
const A2 = 'The velocity is tangent to the circle. The net force points toward the centre: without it the ball would keep going straight, so the inward pull keeps changing its direction.';
const A2_INWARD = 'The net force points toward the centre: without it the ball would keep going straight, so the inward pull keeps changing its direction. The velocity also points inward toward the centre.';
// Private answer media stored through D's real asset store (learn-attempt-assets.js putAttemptAsset), on an in-memory bucket.
function media() {
  const objects = new Map();
  return {
    put: async (key, body) => { objects.set(key, new Uint8Array(typeof body === 'string' ? new TextEncoder().encode(body) : body)); },
    get: async key => (objects.has(key) ? { body: objects.get(key).slice(), size: objects.get(key).byteLength } : null),
  };
}
const AUDIO = new Uint8Array([79, 103, 103, 83, 1, 2, 3, 4, 5, 6, 7, 8]); // an Ogg page header and a few bytes
const AUDIO_SHA = createHash('sha256').update(AUDIO).digest('hex');
const noteRef = asset => ({ evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: asset.assetId, revision: 1, hash: asset.sha256, mime: asset.mime, bytes: asset.bytes, durationMs: 31500 });
const storeNote = async w => noteRef(await putAttemptAsset(w.env, ANA, { bytes: AUDIO, mime: 'audio/ogg', durationMs: 31500 }));

const j = (criterionId, fit, evidence = [], extra = {}) => ({ criterionId, version: 1, fit, reasoning: extra.reasoning ?? { met: 'supported', partial: 'partial', not_met: 'missing', unclear: 'unclear' }[fit], evidence, contradicted: extra.contradicted ?? false, alternative: false, uncertain: false, question: null, explanation: extra.explanation ?? `${criterionId} ${fit}` });
const reply1 = {
  criteria: [j(F, 'not_met', ['The force pushes the ball outward'], { contradicted: true, explanation: 'Says the force pushes outward: the outward-force misconception.' }), j(V, 'met', ['the velocity is tangent to the circle'])],
  feedback: {
    strengths: { text: 'You correctly say the velocity is tangent.', evidence: ['the velocity is tangent to the circle', 'words the learner never wrote'] },
    revisit: { criterionId: F, version: 1, text: 'Which way must the force point to keep turning the ball?', evidence: ['The force pushes the ball outward'] },
    next: 'Imagine the string breaks: which way does the ball go?',
  },
  priorCorrections: [], notes: [],
};
const reply2 = {
  criteria: [j(F, 'met', ['The net force points toward the centre: without it the ball would keep going straight']), j(V, 'met', ['The velocity is tangent to the circle'])],
  feedback: {
    strengths: { text: 'You now explain why the force points inward.', evidence: ['without it the ball would keep going straight'] },
    revisit: { criterionId: F, version: 1, text: 'Repeated resolved nudge.', evidence: [] },
    next: 'Predict what happens to the force if the speed doubles.',
  },
  priorCorrections: [], notes: [],
};

const ON = { TUTOR_EXPLAIN_BACK_ENABLED: 'true' };
const bind = async (env, actor, cardId, prompt = PROMPT) => {
  const b = await bindExplainBackCard(env, actor, { cardId, prompt, expects: IDEAS });
  assert.deepEqual(b.criterionRefs, [{ criterionId: F, version: 1 }, { criterionId: V, version: 1 }]);
  return { activityId: b.activityId, revision: b.activityRevision, goalId: b.goalId };
};
async function ebWorld(t, env = ON) {
  const w = world(t, { LEARN_MEDIA: media(), ...env });
  const activity = await bind(w.env, ANA, 'card_circle');
  return { ...w, activity, goalId: activity.goalId };
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
  assert.deepEqual(data.rubric.map(c => [c.criterionId, c.version]), [[F, 1], [V, 1]]);
  const a = r.body.assessment;
  assert.deepEqual([a.status, a.route, a.provenance.route, a.rubricVersion], ['completed', 'larger', 'explain_back', RV]);
  assert.deepEqual(fits(r), { [F]: 'not_met', [V]: 'met' });
  assert.ok(a.observations.every(o => o.assistance === 'none'), 'a first attempt is unaided');
  const review = reviewOf(r);
  valid(r, { text: A1 });
  assert.deepEqual([review.v, review.attemptId, review.assessmentId, review.status], [1, a.attemptId, a.assessmentId, 'completed']);
  assert.deepEqual(review.judgments.map(x => [x.criterionId, x.judgment, x.fit]), [[F, 'contradicted', 'not_met'], [V, 'demonstrated', 'met']]);
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
    [F, 'contradicted', 'Says the force pushes outward: the outward-force misconception.'], [V, 'demonstrated', `${V} met`]]);
  assert.deepEqual(data.previousAttempt.review.feedback, { strengths: 'You correctly say the velocity is tangent.', revisit: reply1.feedback.revisit.text, next: reply1.feedback.next }, 'the exact previous feedback');
  assert.match(EXPLAIN_SYSTEM, /not evidence for the current answer, and the previous review may be wrong/);
  const review = reviewOf(second);
  valid(second, { text: A2, baseline: baselineOf(first) });
  assert.deepEqual([review.comparison.parentAttemptId, review.comparison.parentAssessmentId, review.comparison.comparable], [first.body.attempt.attemptId, first.body.assessment.assessmentId, true]);
  assert.deepEqual(changes(second), { [F]: 'resolved', [V]: 'still_met' });
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
  const first = await send(w, { text: A1 }, { callModel: replying({ ...reply1, criteria: [j(F, 'not_met'), j(V, 'met', ['the velocity is tangent to the circle'])] }).callModel });
  const regressed = await send(w, { text: A2_INWARD, baseline: baselineOf(first) }, { callModel: replying({ ...reply2, criteria: [j(F, 'partial', ['The net force points toward the centre'], { reasoning: 'partial' }), j(V, 'not_met', ['The velocity also points inward toward the centre'], { contradicted: true })] }).callModel });
  assert.deepEqual(changes(regressed), { [F]: 'improved', [V]: 'regressed' }, 'better but not yet met is improved, not resolved');
  assert.ok(reviewOf(regressed).rating.score <= reviewOf(first).rating.score, 'the score may fall; no bonus for a second attempt');
  const misconception = await send(w, { text: A1, baseline: baselineOf(first) }, { callModel: replying(reply1).callModel });
  assert.deepEqual(changes(misconception), { [F]: 'new', [V]: 'still_met' }, 'not established before, contradicted now: a new misconception');
  const same = await send(w, { text: `${A1} `, baseline: baselineOf(first) }, { callModel: replying({ ...reply1, criteria: [j(F, 'not_met'), j(V, 'met', ['the velocity is tangent to the circle'])] }).callModel });
  assert.deepEqual(changes(same), { [F]: 'persisting', [V]: 'still_met' });
  assert.equal(reviewOf(same).rating.score, reviewOf(first).rating.score, 'same evidence, same number');
});

test('an intentionally wrong prior review: the current answer is judged on its own and the correction is not learner improvement', async t => {
  const w = await ebWorld(t);
  // The first review wrongly calls a correct force explanation the outward-force misconception.
  const wrong = { ...reply1, criteria: [j(F, 'not_met', [], { explanation: 'Outward-force misconception.' }), j(V, 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: '', evidence: [] }, revisit: null, next: null } };
  const first = await send(w, { text: A2 }, { callModel: replying(wrong).callModel });
  const stub = replying({ ...reply2, priorCorrections: [{ criterionId: F, version: 1, explanation: 'The earlier answer already said the net force points toward the centre.' }, { criterionId: 'made-up', version: 1, explanation: 'x' }] });
  const second = await send(w, { text: `${A2} `, baseline: baselineOf(first) }, { callModel: stub.callModel });
  assert.equal(dataOf(stub.calls[0].body).previousAttempt.review.criteria[0].fit, 'not_met', 'the evaluator sees the prior judgement as data');
  assert.deepEqual(fits(second), { [F]: 'met', [V]: 'met' }, 'current judgement is not anchored to the wrong prior');
  assert.deepEqual(changes(second), { [F]: 'prior_feedback_corrected', [V]: 'still_met' });
  assert.deepEqual(reviewOf(second).provenance.priorCorrections.map(k => k.criterionId), [F], 'an unknown criterion is dropped');
  assert.equal(reviewOf(second).rating.score, 10);
  assert.equal(fits(first)[F], 'not_met', 'the historical record keeps the wrong review as it was');
});

test('missing or foreign baselines: refused at submission; the assessment still checks them itself and assesses the current answer', async t => {
  const w = await ebWorld(t);
  const failed = await send(w, { text: A1 }, { callModel: replying(reply1, { status: 500 }).callModel });
  assert.equal(failed.body.assessment.status, 'failed');
  // A parent with no completed review: assessed, comparison unavailable, nothing previous sent.
  const s0 = replying(reply2), none = { parentAttemptId: failed.body.attempt.attemptId, parentAssessmentId: null };
  const x = await send(w, { text: A2, baseline: none }, { callModel: s0.callModel });
  assert.equal(dataOf(s0.calls[0].body).previousAttempt, undefined);
  assert.deepEqual(reviewOf(x).comparison, { ...none, comparable: false, reason: 'no_baseline_review', items: [] });
  assert.equal(reviewOf(x).rating.score, 10, 'the current answer is still assessed and rated');
  assert.ok(x.body.assessment.observations.every(o => o.assistance === 'none'), 'no reviewed parent, so no feedback was seen');
  valid(x, { text: A2, baseline: none });
  // D's acceptAttempt refuses another learner's, another card's or a failed review as a baseline.
  const benCard = await bind(w.env, BEN, 'card_ben');
  const ben = await submit(w.env, BEN, benCard, { submissionKey: 'eb-ben-00001', submittedContent: answerOf({ text: A1 }) }, { ...never, callModel: replying(reply1).callModel });
  const otherCard = await bind(w.env, ANA, 'card_other', 'Another task');
  const other = await submit(w.env, ANA, otherCard, { submissionKey: 'eb-other-0001', submittedContent: answerOf({ text: A1 }) }, { ...never, callModel: replying(reply1).callModel });
  for (const [baseline, code] of [[baselineOf(failed), 'stale_baseline'], [baselineOf(ben), 'baseline_not_found'], [baselineOf(other), 'baseline_not_found']]) {
    const r = await send(w, { text: A2, baseline }, {});
    assert.equal(r.body.error, code);
  }
  // Defence in depth: the assessment never reads such a parent even if a record names one.
  const self = (await readAttempt(w.env, ANA, x.body.attempt.attemptId)).attempt;
  assert.equal((await loadBaseline(w.env, ANA, self, baselineOf(ben))).reason, 'parent_unavailable');
  assert.equal((await loadBaseline(w.env, ANA, self, baselineOf(other))).reason, 'parent_mismatch');
  assert.equal((await loadBaseline(w.env, ANA, self, { parentAttemptId: 'at_does-not-exist', parentAssessmentId: 'as_x' })).reason, 'parent_unavailable');
});

test('changed question or rubric versions are not comparable', () => {
  const judgments = [{ criterionId: F, criterionVersion: 2, judgment: 'demonstrated', fit: 'met', citations: [] }, { criterionId: V, criterionVersion: 1, judgment: 'demonstrated', fit: 'met', citations: [] }, { criterionId: 'new', criterionVersion: 1, judgment: 'demonstrated', fit: 'met', citations: [] }];
  const baseline = { available: true, parentAttemptId: 'at_1', parentAssessmentId: 'as_1', questionChanged: false, judgments: [{ criterionId: F, criterionVersion: 1, fit: 'not_met' }, { criterionId: V, criterionVersion: 1, fit: 'unclear' }] };
  assert.deepEqual(compareWithBaseline({ judgments, baseline }).items.map(c => [c.change, c.note]), [['not_comparable', 'criterion_changed'], ['not_comparable', 'previous_unassessed'], ['not_comparable', 'not_in_baseline']]);
  assert.deepEqual(compareWithBaseline({ judgments, baseline: { ...baseline, questionChanged: true } }), { parentAttemptId: 'at_1', parentAssessmentId: 'as_1', comparable: false, reason: 'question_changed', items: [] });
  assert.equal(compareWithBaseline({ judgments, baseline: null }), null);
});

test('inputs that were not read are reported, never judged wrong; an answer with nothing readable makes no call', async t => {
  const w = await ebWorld(t);
  const note = await storeNote(w), off = { transcriber: null }; // a stored note in an environment without transcription
  const stub = replying(reply1);
  const r = await send(w, { text: A1, voice: [note] }, { ...off, callModel: stub.callModel });
  assert.deepEqual(dataOf(stub.calls[0].body).current.notInspected, [{ id: 'ev_voice_1', status: 'unavailable', note: 'transcript_not_configured' }]);
  assert.deepEqual(reviewOf(r).coverage.map(c => [c.evidenceId, c.status]), [['text', 'read'], ['ev_voice_1', 'unavailable']]);
  const force = r.body.assessment.observations.find(o => o.criterionId === F);
  assert.deepEqual([force.fit, force.reason], ['unclear', 'evidence_unread'], 'not met on partial evidence is not a misconception');
  assert.equal(reviewOf(r).judgments[0].judgment, 'unassessed');
  assert.deepEqual([reviewOf(r).rating.status, reviewOf(r).rating.reason, reviewOf(r).rating.score], ['unrated', 'evidence_incomplete', undefined]);
  valid(r, { text: A1, voice: [note] });
  const empty = await send(w, { voice: [note] }, off);
  assert.deepEqual([empty.body.assessment.status, empty.body.assessment.reason], ['unavailable', 'no_readable_evidence']);
});

test('bound key ideas require reasoning: a met idea with partial or missing reasoning earns partial or no credit', async t => {
  const w = await ebWorld(t);
  const crit = w.sqlite.prepare('SELECT criterion_id, requires_reasoning FROM learn_goal_criteria WHERE goal_id = ? ORDER BY position').all(w.goalId);
  assert.deepEqual(crit.map(c => [c.criterion_id, c.requires_reasoning]), [[F, 1], [V, 1]], 'D binds every key idea with reasoning required');
  const r = await send(w, { text: A2 }, { callModel: replying({ criteria: [j(F, 'met', ['The net force points toward the centre'], { reasoning: 'partial' }), j(V, 'met', ['The velocity is tangent to the circle'], { reasoning: 'missing' })] }).callModel });
  const rating = reviewOf(r).rating;
  // force: min(met 1, reasoning 0.5) = 0.5; velocity: min(1, missing 0) = 0 -> round(10 x 0.5 / 2) = 3 (rounded 2.5 up).
  assert.deepEqual(rating.criteria.map(c => [c.criterionId, c.credit, c.required, c.weight]), [[F, 0.5, true, 1], [V, 0, true, 1]]);
  assert.deepEqual([rating.status, rating.score], ['rated', 3]);
});

test('uncertain or malformed replies never become a number or an observation', async t => {
  const w = await ebWorld(t);
  const r = await send(w, { text: A1 }, { callModel: replying({ criteria: [j(F, 'unclear'), j(V, 'met', ['the velocity is tangent to the circle'])] }).callModel });
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

// Static Sketch (slice 3a), stored and read through D's real asset store with R's capture structure (marks, text).
const PNG = new Uint8Array([...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')]);
const PNG_SHA = createHash('sha256').update(PNG).digest('hex');
const LABELS = 'arrow label: "F"\ntext: "centre"';
const storeSketch = async w => {
  const a = await putAttemptAsset(w.env, ANA, { bytes: PNG, mime: 'image/png', marks: 3, text: LABELS });
  return { evidenceId: 'ev_sketch_1', role: 'sketch', media: 'image', state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256, mime: a.mime, bytes: a.bytes };
};
// A stand-in reader for what the real store cannot produce (other bytes, another type, nothing at all).
const reader = over => ({ readAttemptAsset: async () => (over === null ? null : { bytes: PNG, mime: 'image/png', marks: 3, text: LABELS, ...over }) });
const look = (criterionId, perception, fit, extra = {}) => ({ ...j(criterionId, fit, extra.evidence ?? [], extra), perception, sketchEvidence: extra.sketchEvidence ?? [], question: extra.question ?? null });

test('sketch only: the exact stored image and its marks go to one visual call; perception gates judgement', async t => {
  const w = await ebWorld(t);
  const sketch = await storeSketch(w);
  const stub = replying({ sketchReadable: true, criteria: [
    look(F, 'clear', 'met', { reasoning: 'supported', sketchEvidence: ['arrow labelled F pointing to the centre'], evidence: ['centre'] }),
    look(V, 'ambiguous', 'not_met', { question: 'Which arrow shows the velocity?' }),
  ], feedback: { strengths: { text: 'Your force arrow points to the centre.', evidence: ['arrow label: "F"'] }, revisit: { criterionId: V, version: 1, text: 'Add the velocity arrow.', evidence: [] }, next: 'Draw where the ball goes if the string breaks.' } });
  const r = await send(w, { sketch }, { callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stub.calls.length, 1);
  const body = stub.calls[0].body;
  assert.match(body.system, /An unreadable or ambiguous sketch is never evidence of a misconception/);
  const image = body.messages[0].content.find(b => b.type === 'image');
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: Buffer.from(PNG).toString('base64') }, 'the exact submitted bytes');
  assert.deepEqual(dataOf(body).current.evidence, [{ id: 'ev_sketch_1', kind: 'sketch', image: 'attached below', marks: 3, labels: LABELS }]);
  const review = reviewOf(r);
  valid(r, { sketch });
  assert.deepEqual(review.coverage, [{ evidenceId: 'ev_sketch_1', status: 'read', inspected: { image: true, sha256: PNG_SHA, bytes: PNG.length } }]);
  assert.deepEqual(review.judgments.map(x => [x.criterionId, x.judgment, x.question ?? null]), [[F, 'demonstrated', null], [V, 'unassessed', 'Which arrow shows the velocity?']]);
  assert.deepEqual(review.judgments[0].citations, [{ evidenceId: 'ev_sketch_1', locator: { start: LABELS.indexOf('centre'), end: LABELS.indexOf('centre') + 6 } }, { evidenceId: 'ev_sketch_1', locator: { part: 'arrow labelled F pointing to the centre' } }]);
  assert.equal(r.body.assessment.observations.find(o => o.criterionId === V).reason, 'perception_ambiguous', 'never not met or a misconception');
  assert.deepEqual([review.rating.status, review.rating.reason], ['unrated', 'criteria_unassessed']);
});

test('text and sketch: one call; words can meet a criterion the sketch leaves ambiguous; marks alone earn nothing', async t => {
  const w = await ebWorld(t);
  const sketch = await storeSketch(w);
  const stub = replying({ criteria: [
    look(F, 'clear', 'met', { reasoning: 'supported', evidence: ['The net force points toward the centre: without it the ball would keep going straight'], sketchEvidence: ['arrow labelled F'] }),
    look(V, 'ambiguous', 'met', { evidence: ['The velocity is tangent to the circle'] }),
  ], feedback: reply2.feedback });
  const r = await send(w, { text: A2, sketch }, { callModel: stub.callModel });
  assert.equal(stub.calls.length, 1);
  assert.deepEqual(dataOf(stub.calls[0].body).current.evidence.map(p => p.id), ['text', 'ev_sketch_1']);
  assert.deepEqual(fits(r), { [F]: 'met', [V]: 'met' });
  assert.deepEqual(reviewOf(r).judgments[1].citations.map(c => c.evidenceId), ['text'], 'an unclear sketch part is not cited');
  assert.equal(reviewOf(r).rating.score, 10);
  valid(r, { text: A2, sketch });
  // A met judgement that names no evidence at all is rejected: marks alone earn nothing.
  const bare = await send(w, { sketch }, { callModel: replying({ criteria: [look(F, 'clear', 'met', { reasoning: 'supported' }), look(V, 'clear', 'met')] }).callModel });
  assert.deepEqual(bare.body.assessment.provenance.rejected.map(x => x.reason), ['unsupported_evidence', 'unsupported_evidence']);
});

test('a missing, altered or unreadable sketch is explicit unassessed coverage, never a judgement', async t => {
  const w = await ebWorld(t);
  const sketch = await storeSketch(w);
  for (const [deps, status, note] of [[reader(null), 'unavailable', 'asset_unavailable'], [reader({ bytes: new Uint8Array([1, 2, 3]) }), 'unavailable', 'hash_mismatch'], [reader({ mime: 'image/svg+xml' }), 'unsupported', 'image_not_supported']]) {
    const only = await send(w, { sketch }, deps);
    assert.deepEqual([only.body.assessment.status, only.body.assessment.reason], ['unavailable', 'no_readable_evidence'], note);
    assert.equal(only.body.assessment.provenance.coverage[0].note, note);
    const stub = replying(reply1);
    const withText = await send(w, { text: A1, sketch }, { ...deps, callModel: stub.callModel });
    assert.equal(typeof stub.calls[0].body.messages[0].content, 'string', 'text-only request, no image');
    assert.deepEqual(dataOf(stub.calls[0].body).current.notInspected, [{ id: 'ev_sketch_1', status, note }]);
    assert.equal(reviewOf(withText).rating.reason, 'evidence_incomplete');
    assert.equal(fits(withText)[F], 'unclear', 'the unread sketch might hold it');
  }
  // The evaluator cannot read the image at all: every sketch-only judgement is unassessed, coverage partial.
  const unreadable = await send(w, { sketch }, { callModel: replying({ sketchReadable: false, criteria: [look(F, 'clear', 'not_met', { contradicted: true }), look(V, 'clear', 'met', { sketchEvidence: ['an arrow'] })] }).callModel });
  assert.deepEqual(Object.values(fits(unreadable)), ['unclear', 'unclear']);
  assert.deepEqual(reviewOf(unreadable).coverage.map(c => [c.status, c.note]), [['partial', 'sketch_unreadable']]);
  assert.equal(reviewOf(unreadable).rating.status, 'unrated');
  valid(unreadable, { sketch });
});

// Voice transcript (slice 3b): D's real asset read and transcript store; M's real ensureTranscript over a transcriber double
// that records each provider call.
const SPOKEN = 'The net force points toward the centre because without it the ball would keep going straight. The velocity is tangent to the circle.';
function voiceDeps({ heard = { text: SPOKEN }, fail = null, configured = true } = {}) {
  const heardCalls = [];
  return {
    heardCalls,
    transcriber: configured ? { provider: 'openai', model: 'gpt-4o-transcribe', transcribe: async ({ bytes, mime }) => { heardCalls.push({ bytes: bytes.length, mime }); if (fail) throw Object.assign(new Error('x'), { code: fail }); return heard; } } : null,
  };
}
// An in-memory transcript store, for transcript shapes D's store does not accept yet (provider segments; see the hand-back).
const mapStore = () => { const m = new Map(); return { get: async id => m.get(id) ?? null, put: async r => { m.set(r.transcriptId, r); return r; } }; };
const spokenReply = { criteria: [j(F, 'met', ['The net force points toward the centre because without it the ball would keep going straight']), j(V, 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: 'You explain the inward force.', evidence: ['without it the ball would keep going straight'] }, revisit: null, next: 'What if the speed doubles?' } };

test('voice only: the transcript, not the audio, is assessed; coverage says transcript only; text stays empty; one transcription per clip', async t => {
  const w = await ebWorld(t);
  const note = await storeNote(w), v = voiceDeps(), stub = replying(spokenReply);
  const r = await send(w, { voice: [note] }, { ...v, callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(v.heardCalls, [{ bytes: AUDIO.length, mime: 'audio/ogg' }], 'the exact stored note, transcribed once');
  assert.equal(stub.calls.length, 1);
  const body = stub.calls[0].body;
  assert.match(body.system, /you were not given the audio/);
  assert.deepEqual(dataOf(body).current.evidence, [{ id: 'ev_voice_1', kind: 'voice_transcript', text: SPOKEN }]);
  assert.equal(r.body.attempt.submittedContent.text, '', 'the typed answer is untouched');
  const [record] = await Promise.all([w.sqlite.prepare('SELECT record_json FROM learn_attempt_transcripts').get()]).then(([row]) => [JSON.parse(row.record_json)]);
  const review = reviewOf(r);
  valid(r, { voice: [note] });
  assert.deepEqual(review.coverage, [{ evidenceId: 'ev_voice_1', status: 'partial', inspected: { transcriptOnly: true, audio: false }, derivative: { derivativeId: record.transcriptId, hash: record.derivativeHash, converterVersion: 'openai:gpt-4o-transcribe:v1' }, note: 'Transcript only: the audio itself was not inspected.' }]);
  assert.equal(review.judgments[0].citations[0].evidenceId, 'ev_voice_1');
  assert.deepEqual(review.judgments[0].citations[0].locator, { start: 0, end: SPOKEN.indexOf(' going straight') + ' going straight'.length }, 'no timing is invented without segments');
  assert.deepEqual([review.rating.status, review.rating.score], ['rated', 10], 'a transcript-only review is a full review, labelled as such');
  // A revision that keeps the same note reuses its stored transcript: no second provider call.
  await send(w, { voice: [note], baseline: baselineOf(r) }, { ...v, callModel: replying(spokenReply).callModel });
  assert.equal(v.heardCalls.length, 1);
});

test('segments give citation times; uncertain words reach the evaluator', async t => {
  const w = await ebWorld(t);
  const [first, second] = ['The net force points toward the centre because without it the ball would keep going straight.', 'The velocity is tangent to the circle.'];
  const v = voiceDeps({ heard: { text: `${first} ${second}`, segments: [{ start: 0, end: 4.2, text: first }, { start: 4.2, end: 6.5, text: second }], logprobs: [{ token: 'tangent', logprob: Math.log(0.3) }, { token: 'velocity', logprob: Math.log(0.99) }] } });
  const stub = replying(spokenReply), note = await storeNote(w);
  const r = await send(w, { voice: [note] }, { ...v, transcriptStore: mapStore(), callModel: stub.callModel });
  const part = dataOf(stub.calls[0].body).current.evidence[0];
  assert.deepEqual([part.uncertainWords, part.segments.length], [['tangent'], 2]);
  const [force, velocity] = reviewOf(r).judgments.map(x => x.citations[0].locator);
  assert.deepEqual([force.startMs, force.endMs, velocity.startMs, velocity.endMs], [0, 4200, 4200, 6500]);
  valid(r, { voice: [note] });
});

test('a failed or unconfigured transcription is unassessed, never an empty or wrong answer', async t => {
  const w = await ebWorld(t);
  const note = await storeNote(w);
  for (const [deps, note2] of [[voiceDeps({ fail: 'provider_failed' }), 'transcript_provider_failed'], [voiceDeps({ configured: false }), 'transcript_not_configured'], [voiceDeps({ heard: { text: '   ' } }), 'transcript_no_speech']]) {
    // Each case starts from a fresh transcript store, so a stored failure of one case is not read by the next.
    const fresh = { ...deps, transcriptStore: mapStore() };
    const only = await send(w, { voice: [note] }, fresh);
    assert.deepEqual([only.body.assessment.status, only.body.assessment.reason], ['unavailable', 'no_readable_evidence'], note2);
    assert.deepEqual(only.body.assessment.provenance.coverage, [{ evidenceId: 'ev_voice_1', status: 'unavailable', note: note2 }]);
    assert.equal(only.body.assessment.observations.length, 0, 'no observation, so Progress keeps its last state');
    const stub = replying(reply1);
    const withText = await send(w, { text: A1, voice: [note] }, { ...fresh, callModel: stub.callModel });
    assert.equal(fits(withText)[F], 'unclear', `${note2}: the unread note might hold it`);
    assert.equal(reviewOf(withText).rating.reason, 'evidence_incomplete');
  }
  // With D's real store, a failed transcript is kept and not retried by a later assessment: no provider call repeats.
  const v = voiceDeps({ fail: 'provider_failed' });
  await send(w, { voice: [note] }, v);
  await send(w, { voice: [note] }, v);
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
  assert.deepEqual(prev.earlierAttempts.at(-1).criteria, [{ criterionId: F, version: 1, judgment: 'contradicted' }, { criterionId: V, version: 1, judgment: 'demonstrated' }]);
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

// Files, Notebook and Group (slice 3d) through R's frozen resolver, with R's fixture loaders (learn-explain-evidence-fixture.js).
const OWN_WORDS = 'The period only depends on length and gravity.';
async function resourceWorld(t) {
  const w = await ebWorld(t);
  const fx = await explainEvidenceFixture();
  return { ...w, fx, content: { text: OWN_WORDS, resources: fx.answer.resources } };
}

test('resources: frozen excerpts reach the one call with locators, Group and direct links deduped, a reference alone is not established', async t => {
  const w = await resourceWorld(t);
  const finds = [];
  const evidenceDeps = { ...w.fx.deps, findDerivative: async (...args) => { finds.push(args[3] ?? null); return w.fx.deps.findDerivative(...args); } };
  const stub = replying({ criteria: [
    j(F, 'met', ['The period only depends on length and gravity.']),
    // Supported only by the imported PDF: the learner explained nothing of it.
    { ...j(V, 'met', ['independent of amplitude']), referenceOnly: true, question: 'In your own words, why does amplitude not change the period?' },
  ], feedback: { strengths: { text: 'You name what the period depends on.', evidence: ['only depends on length and gravity'] }, revisit: { criterionId: V, version: 1, text: 'Explain the amplitude part yourself.', evidence: [] }, next: 'Predict T for L = 4 m.' } });
  const r = await send(w, w.content, { callModel: stub.callModel, evidenceDeps });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(stub.calls.length, 1);
  const body = stub.calls[0].body, data = dataOf(body);
  assert.match(body.system, /A reference by itself does not show that the learner understands it/);
  assert.doesNotMatch(body.system, /Sketch:/, 'no sketch rules without a sketch');
  const resourceParts = data.current.evidence.filter(p => p.kind === 'resource');
  assert.ok(resourceParts.length >= 2, JSON.stringify(data.current.evidence));
  assert.ok(resourceParts.some(p => p.text?.includes('independent of amplitude')), 'the PDF page text itself, not just its id');
  assert.ok(resourceParts.some(p => /code was not run/.test(p.note ?? '')), 'notebook cells are read, never run');
  assert.ok(resourceParts.some(p => p.alsoConnectedAs?.length), 'one source connected twice is sent once, with both connections');
  const review = reviewOf(r);
  valid(r, w.content);
  // Every input has coverage, Group members individually; a duplicate says which entry it repeats.
  for (const e of w.content.resources) assert.ok(review.coverage.some(c => c.evidenceId === e.evidenceId), e.evidenceId);
  assert.ok(review.coverage.some(c => String(c.note ?? '').startsWith('same_as:')));
  const v = review.judgments.find(x => x.criterionId === V);
  assert.deepEqual([v.judgment, v.fit, v.question], ['not_established', 'not_met', 'In your own words, why does amplitude not change the period?'], 'not established and asked, never contradicted');
  assert.equal(r.body.assessment.observations.find(o => o.criterionId === V).reason, 'reference_only');
  // A quote from a resource cites that input (and member) at the excerpt's own locator.
  const cite = v.citations[0];
  assert.ok(w.content.resources.some(e => e.evidenceId === cite.evidenceId), JSON.stringify(cite));
  assert.equal(cite.locator.page, 2);
  // A reassessment reads the same pinned extraction the first review read.
  const before = finds.length;
  const again = await call(w.env, ANA, 'POST', `/api/learn/tutor/attempts/${r.body.attempt.attemptId}/reassess`, { requestKey: 'reassess-0001' }, { ...never, callModel: replying({ criteria: [j(F, 'met', ['The period only depends on length and gravity.']), j(V, 'unclear')] }).callModel, evidenceDeps });
  assert.equal(again.body.assessment.status, 'completed');
  const pinned = finds.slice(before).filter(Boolean);
  assert.ok(pinned.length && pinned.every(p => p.derivativeId === DERIVATIVE.derivativeId), 'the derivative the first review read');
});

test('resources: a changed or unreadable source is reported per input and leaves the attempt Not rated, never wrong', async t => {
  const w = await resourceWorld(t);
  // The board's notebook changed after submission: the resolver refuses the newer content.
  const state = structuredClone(w.fx.state);
  state.blocks.find(b => b.id === 'nb_pendulum').ipynb.cells[0].source = 'print("changed later")';
  const stub = replying(reply1);
  const r = await send(w, w.content, { callModel: stub.callModel, evidenceDeps: { ...w.fx.deps, loadBoard: async () => ({ row: { id: 'board_row_1' }, state }) } });
  assert.equal(JSON.stringify(dataOf(stub.calls[0].body).current.evidence).includes('changed later'), false, 'never the newer content');
  assert.ok(reviewOf(r).coverage.some(c => c.status === 'unavailable' && c.note === 'source_changed'), JSON.stringify(reviewOf(r).coverage));
  assert.ok(dataOf(stub.calls[0].body).current.notInspected.length > 0);
  assert.equal(reviewOf(r).rating.reason, 'evidence_incomplete');
  assert.ok(!r.body.assessment.observations.some(o => o.fit === 'not_met'), 'nothing is marked wrong on partial evidence');
  valid(r, w.content);
  // The resolver itself failing: every resource unavailable, the typed words still assessed.
  const broken = await send(w, w.content, { callModel: replying(reply1).callModel, evidenceDeps: { ...w.fx.deps, loadBoard: async () => { throw new Error('down'); } } });
  assert.equal(broken.body.assessment.status, 'completed');
  assert.ok(reviewOf(broken).coverage.filter(c => c.evidenceId !== 'text').every(c => c.status !== 'read'));
});

// Sketch recording (M4). A timeline as M's recorder stores it (sketch-recording.js), stored through D's real asset store
// (kind timeline) with its narration as a voice EvidenceRef on the recording.
const arrow = (label, y = 100) => ({ kind: 'arrow', x1: 200, y1: y, x2: 120, y2: y, label });
const timelineOf = (ops, narration = false) => ({ v: 1, kind: 'sketch-timeline', startedAt: '2026-10-30T00:00:00.000Z', durationMs: 20000, limitMs: 120000, narration, start: { strokes: [], shapes: [], items: [] }, ops, pauses: [] });
// Draws "F outward", then replaces it with "F to the centre": an explicit self-correction.
const CORRECTED = timelineOf([{ t: 1000, k: 'shapes', keep: 0, add: [arrow('F outward')] }, { t: 9000, k: 'shapes', keep: 0, add: [arrow('F to the centre')] }]);
// Draws "F to the centre" straight away: the same final picture, different steps.
const DIRECT = timelineOf([{ t: 1000, k: 'shapes', keep: 0, add: [arrow('F to the centre')] }]);
const bytesOf = timeline => new TextEncoder().encode(JSON.stringify(timeline));
async function storeRecording(w, timeline, narration = null) {
  const a = await putAttemptAsset(w.env, ANA, { bytes: bytesOf(timeline), mime: 'application/json' });
  return { evidenceId: 'ev_rec_1', role: 'recording', media: 'sketch_timeline', state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256, mime: a.mime, bytes: a.bytes, durationMs: timeline.durationMs, ...(narration ? { narration } : {}) };
}
const narrationOf = async w => ({ ...(await storeNote(w)), evidenceId: 'ev_narration_1' });
const stepReply = (t, extra = {}) => ({ criteria: [{ ...j(F, 'met', [], { reasoning: 'supported' }), recordingEvidence: [{ t, what: 'arrow relabelled toward the centre' }, { t: 4321, what: 'a time that was never sent' }], ...extra }, { ...j(V, 'unclear'), question: 'Where is the velocity in your drawing?' }] });

test('recording: the timed steps go to the one call; two recordings with the same final picture differ; steps are cited by time', async t => {
  const w = await ebWorld(t);
  const recording = await storeRecording(w, CORRECTED), stub = replying(stepReply(9000));
  const r = await send(w, { recording }, { callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const body = stub.calls[0].body, part = dataOf(body).current.evidence[0];
  assert.match(body.system, /A clear later self-correction in the recording supersedes the earlier claim/);
  assert.match(body.system, /Relate "this", "here" and "now" in the narration to the step at that time/);
  assert.deepEqual(part.steps.map(s => [s.t, s.text.includes('F outward'), s.text.includes('F to the centre')]), [[0, false, false], [1000, true, false], [9000, false, true]], 'the mistaken step and its later correction, in order');
  const direct = replying(stepReply(1000));
  await send(w, { recording: await storeRecording(w, DIRECT) }, { callModel: direct.callModel });
  assert.notDeepEqual(dataOf(direct.calls[0].body).current.evidence[0].steps, part.steps, 'not reduced to the final screenshot');
  const review = reviewOf(r);
  valid(r, { recording });
  assert.deepEqual(review.judgments[0].citations, [{ evidenceId: 'ev_rec_1', locator: { ms: 9000, what: 'arrow relabelled toward the centre' } }], 'only a step that was sent is cited');
  assert.deepEqual(review.coverage, [{ evidenceId: 'ev_rec_1', status: 'read', inspected: { steps: 3, sentSteps: 3, sampled: false, intervalMs: [0, 20000], geometry: false, narration: 'none', audio: false }, note: 'steps_read' }]);
});

test('narrated recording: narration is transcribed once, counted once, and its timing is on the step clock', async t => {
  const w = await ebWorld(t);
  const said = 'This arrow points outward. No wait, now it points to the centre because the string pulls the ball in.';
  const v = voiceDeps({ heard: { text: said, segments: [{ start: 1, end: 3, text: 'This arrow points outward.' }, { start: 9, end: 14, text: 'No wait, now it points to the centre because the string pulls the ball in.' }] } });
  const timeline = { ...CORRECTED, narration: true };
  // The same clip is also attached as a separate voice note.
  const content = { recording: await storeRecording(w, timeline, await narrationOf(w)), voice: [await storeNote(w)] };
  const stub = replying({ criteria: [{ ...j(F, 'met', ['now it points to the centre because the string pulls the ball in'], { reasoning: 'supported' }), recordingEvidence: [{ t: 9000, what: 'relabelled arrow' }] }, j(V, 'unclear')] });
  // ponytail: an in-memory transcript store while M still stores provider segments in seconds (contract: ms; P ruling).
  const r = await send(w, content, { ...v, transcriptStore: mapStore(), callModel: stub.callModel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(v.heardCalls.length, 1, 'one transcription for the narration');
  const evidence = dataOf(stub.calls[0].body).current.evidence;
  assert.deepEqual(evidence.map(p => p.kind), ['sketch_recording'], 'neither the narration ref nor the identical voice note is sent again');
  assert.deepEqual(evidence[0].narration.segments.map(g => [g.startMs, g.endMs]), [[1000, 3000], [9000, 14000]]);
  const review = reviewOf(r);
  valid(r, content);
  assert.deepEqual(review.coverage.map(c => [c.evidenceId, c.status, c.note]), [
    ['ev_voice_1', 'partial', 'same_as:ev_rec_1'], ['ev_rec_1', 'partial', 'Narration transcript only: the audio itself was not inspected.'], ['ev_narration_1', 'partial', 'same_as:ev_rec_1']]);
  assert.equal(review.coverage[1].inspected.transcriptOnly, true);
  const quote = review.judgments[0].citations.find(c => c.locator.start != null);
  assert.deepEqual([quote.evidenceId, quote.locator.startMs, quote.locator.endMs], ['ev_rec_1', 9000, 14000]);
  assert.equal(review.rating.status, 'unrated', 'velocity unclear');
});

test('recording: sampling and missing narration are disclosed and never become a wrong judgement', async t => {
  const w = await ebWorld(t);
  const many = timelineOf(Array.from({ length: 60 }, (_, i) => ({ t: (i + 1) * 1500, k: 'items', keep: i, add: [{ kind: 'text', x: 10, y: i * 40, text: `step ${i}` }] })));
  const stub = replying({ criteria: [j(F, 'not_met'), j(V, 'not_met')] });
  const r = await send(w, { recording: await storeRecording(w, many) }, { callModel: stub.callModel });
  const part = dataOf(stub.calls[0].body).current.evidence[0], cov = reviewOf(r).coverage[0];
  assert.ok(part.sampled && part.steps.length <= 40 && part.steps[0].t === 0 && part.steps.at(-1).t === 90000, 'first and last kept');
  assert.deepEqual([cov.status, cov.note, cov.inspected.sampled, cov.inspected.stepTimesMs.length], ['partial', 'steps_sampled', true, part.steps.length]);
  assert.ok(r.body.assessment.observations.every(o => o.fit === 'unclear'), 'missing intervals: unassessed, never not met');
  assert.equal(reviewOf(r).rating.reason, 'evidence_incomplete');
  // Narration recorded but not transcribable: the steps are read, the narration is reported missing.
  const narrated = { ...CORRECTED, narration: true };
  const failed = await send(w, { recording: await storeRecording(w, narrated, await narrationOf(w)) }, { ...voiceDeps({ fail: 'provider_failed' }), callModel: replying(stepReply(9000)).callModel });
  assert.deepEqual([reviewOf(failed).coverage[0].status, reviewOf(failed).coverage[0].note], ['partial', 'narration_transcript_provider_failed']);
  // Bytes other than the submitted timeline (a stand-in reader: the real store never returns them): nothing is read.
  const recording = await storeRecording(w, CORRECTED);
  const other = await send(w, { text: A1, recording }, { readAttemptAsset: async () => ({ bytes: bytesOf(DIRECT), mime: 'application/json' }), callModel: replying(reply1).callModel });
  assert.deepEqual([reviewOf(other).coverage[1].status, reviewOf(other).coverage[1].note], ['unavailable', 'hash_mismatch']);
});

test('resource citations: offsets are into one unit; a quote with a unit label or across units is not evidence', async t => {
  const w = await resourceWorld(t);
  const page2 = 'For small angles the period is T = 2*pi*sqrt(L/g), independent of amplitude.';
  const withLabel = `[${locLabel({ page: 2 })}] For small angles`;
  const stub = replying({ criteria: [
    { ...j(F, 'met', ['independent of amplitude']), referenceOnly: false },
    { ...j(V, 'met', [withLabel, 'swings under gravity. For small angles']), referenceOnly: false },
  ] });
  const r = await send(w, w.content, { callModel: stub.callModel, evidenceDeps: w.fx.deps });
  assert.ok(JSON.stringify(dataOf(stub.calls[0].body).current.evidence).includes(withLabel), 'the label is in what the evaluator saw');
  const [cite] = reviewOf(r).judgments.find(x => x.criterionId === F).citations;
  assert.equal(cite.locator.page, 2);
  assert.equal(page2.slice(cite.locator.start, cite.locator.end), 'independent of amplitude', 'offsets into that page');
  assert.deepEqual(r.body.assessment.provenance.rejected.map(x => [x.criterionId, x.reason]), [[V, 'unsupported_evidence']], 'a quote found in no single unit is not evidence');
  valid(r, w.content);
});

test('slow preparation: with under 15 s of the claim left, no evaluator is called and the operation fails as preparation_slow', async t => {
  const w = await ebWorld(t);
  for (const [elapsed, called] of [[46000, false], [44000, true]]) {
    let calls = 0, ticks = 0;
    const now = () => (ticks++ === 0 ? 1_000_000 : 1_000_000 + elapsed); // the first reading starts the clock
    const r = await send(w, { text: `${A2} ${elapsed}` }, { now, callModel: async (...a) => { calls += 1; return replying(reply2).callModel(...a); } });
    assert.equal(calls > 0, called, String(elapsed));
    if (!called) {
      assert.deepEqual([r.body.assessment.status, r.body.assessment.reason, r.body.assessment.observations.length], ['failed', 'preparation_slow', 0]);
      // stored: the route drops provenance diagnostics (calls, models, usage, latency) from the learner's response
      assert.equal((await readAttempt(w.env, ANA, r.body.attempt.attemptId)).assessment.provenance.preparationMs, elapsed);
    } else assert.equal(r.body.assessment.status, 'completed');
  }
});

// eval-live-1 (P, 2026-10-30, tests/evals/explain-back): the live replies of the failing cases, rebuilt from the stored reviews
// (the run kept reviews, not raw text): each quote is the cited span of the submitted text, each note the stored note.
const LIVE_CONTRA_TEXT = 'The velocity is tangent to the circle, and the net force points toward the centre because it keeps turning the ball.';
const liveContraReply = conflict => ({
  sketchReadable: true,
  criteria: [
    { ...look(F, 'ambiguous', 'met', { reasoning: 'supported', evidence: [LIVE_CONTRA_TEXT.slice(43, 115)], question: 'In your sketch, the arrow at the ball points straight away from the centre. Is that arrow meant to be the net force F? If so, which way should it point to match your sentence?', explanation: 'The typed text says the net force points toward the centre. The sketch shows an arrow pointing radially outward from the ball.' }), ...(conflict ? { conflict: true } : {}) },
    look(V, null, 'met', { reasoning: 'missing', evidence: [LIVE_CONTRA_TEXT.slice(0, 37)], explanation: 'States the velocity is tangent; does not explain why.' }),
  ],
  feedback: { strengths: { text: 'Your sentence gets both directions right.', evidence: [LIVE_CONTRA_TEXT.slice(0, 37)] }, revisit: null, next: 'Redraw the sketch so it matches your sentence.' },
});

test('eval-live-1 contradictory modalities: met without required reasoning is partly demonstrated; a flagged conflict is never credited', async t => {
  const w = await ebWorld(t);
  const sketch = await storeSketch(w);
  // The live reply as it came: no conflict flag, so the words carry the force; the velocity's missing reason now shows.
  const live = await send(w, { text: LIVE_CONTRA_TEXT, sketch }, { callModel: replying(liveContraReply(false)).callModel });
  assert.deepEqual(reviewOf(live).judgments.map(j => [j.criterionId, j.judgment, j.fit, j.reasoning]), [[F, 'demonstrated', 'met', 'supported'], [V, 'partly_demonstrated', 'partial', 'missing']], 'the label agrees with the rating credit');
  assert.equal(reviewOf(live).rating.score, 5, 'unchanged: force 1, velocity 0');
  // The prompt now asks for the flag; with it, neither version is credited and the question is kept.
  const stub = replying(liveContraReply(true));
  const flagged = await send(w, { text: `${LIVE_CONTRA_TEXT} `, sketch }, { callModel: stub.callModel });
  assert.match(stub.calls[0].body.system, /set "conflict": true, describe the discrepancy, and ask which they mean/);
  const force = reviewOf(flagged).judgments[0], obs = flagged.body.assessment.observations.find(o => o.criterionId === F);
  assert.deepEqual([force.judgment, force.fit, obs.conflict, obs.reason], ['unassessed', 'unclear', true, 'evidence_conflict']);
  assert.match(force.question, /which way should it point/);
  assert.deepEqual([reviewOf(flagged).rating.status, reviewOf(flagged).rating.reason], ['unrated', 'criteria_unassessed']);
  valid(flagged, { text: `${LIVE_CONTRA_TEXT} `, sketch });
});

test('eval-live-1 wrong prior review: the live reply judges the current answer on its own; partial velocity is the reasoning rule, not anchoring', async t => {
  const w = await ebWorld(t);
  const text = 'The velocity is tangent to the circle. The net force points toward the centre: without it the ball would keep going straight, so the inward pull keeps changing its direction.';
  const wrongPrior = { criteria: [j(F, 'not_met', [], { contradicted: true, explanation: 'Claims an outward force: the outward-force misconception.' }), j(V, 'met', ['The velocity is tangent to the circle'])], feedback: { strengths: { text: '', evidence: [] }, revisit: null, next: null } };
  const first = await send(w, { text }, { callModel: replying(wrongPrior).callModel });
  const current = `${text} I kept my answer because I think it was right.`;
  const liveReply = {
    criteria: [j(F, 'met', [current.slice(39, 77), current.slice(79, 173)], { reasoning: 'supported' }), j(V, 'partial', [current.slice(0, 38)], { reasoning: 'missing' })],
    feedback: { strengths: { text: 'You were right to keep your answer.', evidence: [current.slice(79, 173)] }, revisit: { criterionId: V, version: 1, text: "You state that the velocity is tangent but don't explain why.", evidence: [current.slice(0, 38)] }, next: 'Add one sentence explaining why the velocity is tangent.' },
    priorCorrections: [
      { criterionId: F, version: 1, explanation: 'The previous review said the answer claimed an outward force; it did not.' },
      { criterionId: V, version: 1, explanation: 'The previous review marked the reasoning as supported; the earlier answer gave no reason.' },
    ],
  };
  const r = await send(w, { text: current, baseline: baselineOf(first) }, { callModel: replying(liveReply).callModel });
  assert.deepEqual(reviewOf(r).judgments.map(x => [x.criterionId, x.judgment]), [[F, 'demonstrated'], [V, 'partly_demonstrated']]);
  assert.deepEqual(changes(r), { [F]: 'prior_feedback_corrected', [V]: 'prior_feedback_corrected' });
  assert.equal(reviewOf(r).rating.score, 5, 'force 1, velocity min(partial 0.5, reasoning missing 0) = 0');
  valid(r, { text: current, baseline: baselineOf(first) });
});

test('eval-live-1 unreadable recording reply: prose with braces around the JSON is still read; an unreadable one keeps only its shape', async t => {
  const w = await ebWorld(t);
  const json = JSON.stringify(reply2);
  const wrapped = await send(w, { text: A2 }, { callModel: replying(null, { text: `Looking at the steps {t: 1500} and {t: 9000}:\n${json}\nThat covers it {done}.` }).callModel });
  assert.equal(wrapped.body.assessment.status, 'completed');
  const broken = await send(w, { text: `${A2} ` }, { callModel: replying(null, { text: '```json\n{"criteria":[{"criterionId":"x","evidence":["the "ball" turns"]}]}\n```' }).callModel });
  assert.deepEqual([broken.body.assessment.status, broken.body.assessment.reason], ['failed', 'malformed_evaluation']);
  const shape = broken.body.assessment.provenance.reply;
  assert.deepEqual(Object.keys(shape).sort(), ['chars', 'errorAt', 'fenced', 'objectAt']);
  assert.equal(shape.fenced, true);
  assert.equal(JSON.stringify(broken.body.assessment.provenance).includes('ball'), false, 'never the reply text');
});

test('a plain statement idea may have no reasoning to give (not_applicable, justified); a causal idea may not', async t => {
  const w = await ebWorld(t);
  const na = (extra = {}) => ({ ...j(V, 'met', ['The velocity is tangent to the circle']), reasoning: 'not_applicable', reasoningJustification: 'The idea is a statement of direction; it asks for no reason.', ...extra });
  const stub = replying({ criteria: [j(F, 'met', ['The net force points toward the centre: without it the ball would keep going straight']), na()] });
  const r = await send(w, { text: A2 }, { callModel: stub.callModel });
  assert.match(stub.calls[0].body.system, /Use "not_applicable" only when the requirement itself is a plain factual statement/);
  const v = reviewOf(r).judgments[1];
  assert.deepEqual([v.judgment, v.fit, v.reasoning, v.reasoningBasis], ['demonstrated', 'met', 'not_required', 'not_applicable']);
  assert.match(v.reasoningJustification, /asks for no reason/);
  assert.deepEqual([reviewOf(r).rating.score, reviewOf(r).rating.calculationVersion], [10, 'eb-rating-v2'], 'a fully correct answer reaches 10/10');
  valid(r, { text: A2 });
  // The force idea asks why: not_applicable there is unclear reasoning, so the attempt is Not rated.
  const causal = await send(w, { text: `${A2} ` }, { callModel: replying({ criteria: [{ ...j(F, 'met', ['The net force points toward the centre']), reasoning: 'not_applicable', reasoningJustification: 'no reason needed' }, na()] }).callModel });
  assert.deepEqual([reviewOf(causal).judgments[0].reasoning, reviewOf(causal).judgments[0].reasoningBasis], ['unclear', undefined]);
  assert.deepEqual([reviewOf(causal).rating.status, reviewOf(causal).rating.unknown[0].reason], ['unrated', 'reasoning_unclear']);
  // Without a justification the claim is not accepted either.
  const bare = await send(w, { text: `${A2}  ` }, { callModel: replying({ criteria: [j(F, 'met', ['The net force points toward the centre']), na({ reasoningJustification: null })] }).callModel });
  assert.equal(reviewOf(bare).rating.status, 'unrated');
});

// eval-live-3 (P, 2026-10-30, candidate 3cbbed86c): the two raw replies whose velocity came back unassessed, verbatim.
const LIVE3_COMPLEMENTARY = "{\"criteria\":[{\"criterionId\":\"k_b15fb785b6c53b95\",\"version\":1,\"fit\":\"met\",\"reasoning\":\"supported\",\"reasoningJustification\":null,\"evidence\":[\"The net force points toward the centre\",\"without it the ball would go straight on, so the inward pull keeps changing its direction\"],\"contradicted\":false,\"conflict\":false,\"alternative\":false,\"uncertain\":false,\"question\":null,\"explanation\":\"The typed text says the net force points toward the centre. It also explains why: without the force the ball would move in a straight line, so the inward pull is what keeps changing the ball's direction.\",\"perception\":null,\"sketchEvidence\":[]},{\"criterionId\":\"k_2f2f99245d28ecd1\",\"version\":1,\"fit\":\"partial\",\"reasoning\":\"not_applicable\",\"reasoningJustification\":\"The requirement asks the learner to state a fact (velocity is tangent), not to explain a mechanism.\",\"evidence\":[\"v\"],\"contradicted\":false,\"conflict\":false,\"alternative\":false,\"uncertain\":true,\"question\":\"Is the ball's velocity tangent to the circle at every point of its path, not just at the point you drew?\",\"explanation\":\"The sketch shows an arrow labelled \\\"v\\\" starting on the circle at its rightmost point and pointing straight up. That is tangent to the circle at that point, perpendicular to the radius from the centre dot. The text never mentions velocity, and only one point is shown, so it is not yet established that the velocity is tangent at every point.\",\"perception\":\"clear\",\"sketchEvidence\":[\"arrow labelled v drawn from the rightmost point of the circle, pointing upward, tangent to the circle and perpendicular to the radius from the centre dot\"]}],\"feedback\":{\"strengths\":{\"text\":\"You clearly explain why the force must point inward. You say what would happen without it, and you name it as the cause of the changing direction.\",\"evidence\":[\"without it the ball would go straight on, so the inward pull keeps changing its direction\"]},\"revisit\":{\"criterionId\":\"k_2f2f99245d28ecd1\",\"version\":1,\"text\":\"Your sketch correctly draws v tangent to the circle at one point. Your answer does not yet say that the velocity is tangent at every point around the circle.\",\"evidence\":[\"v\"]},\"next\":\"Add a sentence about the velocity's direction all the way around the circle. You could also draw v at a second point, such as the top, to show it.\"},\"priorCorrections\":[],\"notes\":[\"The sketch shows no force arrow. Criterion 1 is met from the typed text alone.\"],\"sketchReadable\":true}";
const LIVE3_RECORDING = "```json\n{\"criteria\":[{\"criterionId\":\"k_b15fb785b6c53b95\",\"version\":1,\"fit\":\"met\",\"reasoning\":\"supported\",\"reasoningJustification\":null,\"evidence\":[\"the net force points toward the centre, because without it the ball would fly off in a straight line\"],\"contradicted\":false,\"conflict\":false,\"alternative\":false,\"uncertain\":false,\"question\":null,\"explanation\":\"The learner first labelled the force \\\"F outward\\\". At 8.5\u201313 s they clearly corrected this, saying \\\"No wait, that is wrong\\\", and relabelled the arrow \\\"F toward centre\\\" at t=9000. The correction replaces the earlier claim. They also give the reason: without the inward force the ball would move in a straight line, so the force is what keeps changing its direction.\"}],\"feedback\":{\"strengths\":{\"text\":\"You caught and fixed your own mistake. You switched the force from outward to \\\"toward centre\\\" and explained why: without an inward net force the ball \\\"would fly off in a straight line\\\". You also gave the velocity direction correctly as \\\"tangent to it\\\".\",\"evidence\":[\"No wait, that is wrong: the net force points toward the centre\",\"without it the ball would fly off in a straight line\",\"along the circle, tangent to it\"]},\"revisit\":null,\"next\":\"Small extension: if the string suddenly snapped at one point on the circle, which way would the ball go? How does that direction relate to the velocity arrow you drew?\"},\"priorCorrections\":[],\"notes\":[\"The early claim at t=1500 (\\\"F outward\\\", narrated 1\u20134 s) was clearly corrected at t=9000 and in the narration. It was not treated as a remaining misconception.\",\"Criterion k_2f2f99245d28ecd1 is met: the velocity arrow \\\"v\\\" (t=14000) is described as \\\"along the circle, tangent to it\\\" (narration 13.5\u201318 s). Reasoning was marked not_applicable because the requirement only asks the learner to state a fact (\\\"States that ...\\\") and has no mechanism to explain.\"],\"criteria_recordingEvidence\":{\"k_b15fb785b6c53b95\":[{\"t\":9000,\"what\":\"Arrow relabelled from \\\"F outward\\\" to \\\"F toward centre\\\", alongside the narrated self-correction and reason\"}],\"k_2f2f99245d28ecd1\":[{\"t\":14000,\"what\":\"Second arrow labelled \\\"v\\\" added while the narration says \\\"along the circle, tangent to it\\\"\"}]}}\n```";

test('eval-live-3 complementary text + Sketch: "uncertain" with a partial fit stays unassessed; the prompt now separates uncertain from partial', async t => {
  const w = await ebWorld(t);
  const a = await putAttemptAsset(w.env, ANA, { bytes: PNG, mime: 'image/png', marks: 3, text: 'Marks: 1 ellipse, 1 arrow. Written in the sketch: arrow label: "v".' });
  const sketch = { evidenceId: 'ev_sketch_1', role: 'sketch', media: 'image', state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256, mime: a.mime, bytes: a.bytes };
  const text = 'The net force points toward the centre: without it the ball would go straight on, so the inward pull keeps changing its direction.';
  const stub = replying(null, { text: LIVE3_COMPLEMENTARY });
  const r = await send(w, { text, sketch }, { callModel: stub.callModel });
  // Not the conflict rule (conflict false), not the causal check (velocity is a statement), not perception (clear): the model
  // itself set "uncertain": true beside "partial", and an uncertain judgement is never credited.
  const [force, velocity] = reviewOf(r).judgments;
  assert.deepEqual([force.judgment, velocity.judgment, velocity.fit], ['demonstrated', 'unassessed', 'unclear']);
  assert.equal(r.body.assessment.observations.find(o => o.criterionId === V).reason, 'uncertain');
  assert.match(velocity.question, /tangent to the circle at every point/);
  assert.match(stub.calls[0].body.system, /Use "uncertain" only when you cannot tell what the evidence shows; when it clearly shows part of the requirement, that is "partial" with "uncertain": false/);
  valid(r, { text, sketch });
});

test('eval-live-3 recording: a criterion the reply leaves out is unassessed, never credited from its notes; the reply format now keeps every field in its criterion', async t => {
  const w = await ebWorld(t);
  const said = 'This arrow is the force, pointing outward. No wait, that is wrong: the net force points toward the centre, because without it the ball would fly off in a straight line. And this one is the velocity, along the circle, tangent to it.';
  const timeline = { ...timelineOf([{ t: 1500, k: 'shapes', keep: 0, add: [arrow('F outward')] }, { t: 9000, k: 'shapes', keep: 0, add: [arrow('F toward centre')] }, { t: 14000, k: 'shapes', keep: 1, add: [arrow('v', 40)] }]), narration: true };
  const content = { recording: await storeRecording(w, timeline, await narrationOf(w)) };
  const stub = replying(null, { text: LIVE3_RECORDING });
  const r = await send(w, content, { ...voiceDeps({ heard: { text: said } }), transcriptStore: mapStore(), callModel: stub.callModel });
  assert.equal(r.body.assessment.status, 'completed', 'the fenced JSON is read');
  const [force, velocity] = reviewOf(r).judgments;
  assert.deepEqual([force.judgment, velocity.judgment, velocity.note], ['demonstrated', 'unassessed', 'not_assessed']);
  assert.deepEqual(r.body.assessment.provenance.unassessed, [{ criterionId: V, version: 1, reason: 'not_returned' }]);
  assert.equal(force.citations[0].evidenceId, 'ev_rec_1', 'quoted from the narration');
  const system = stub.calls[0].body.system;
  assert.match(system, /"criteria" has exactly one entry for every rubric criterion, in rubric order/);
  assert.match(system, /"explanation":string,"recordingEvidence":\[\{"t":integer,"what":string\}\]\}\]/, 'recordingEvidence is part of each criterion entry');
  assert.doesNotMatch(system, /Add to each criterion/);
  valid(r, content);
});

test('teaching aids (FX-EB-05): existing cards the browser sent go in as data; the review keeps only valid picks beside a gap', async t => {
  const w = await ebWorld(t);
  const cards = [{ id: 'exp-1', title: 'Centripetal force', kind: 'explanation' }, { id: 'quiz-1', title: 'A quiz', kind: 'quiz' }, { id: 'nb-1', title: 'Orbit notebook', kind: 'notebook' }];
  const picks = [{ id: 'exp-1', reason: 'It shows why the net force points to the centre.' }, { id: 'invented', reason: 'Not on the canvas.' }, { id: 'exp-1', reason: 'Twice.' }, { id: 'quiz-1', reason: 'Not a teaching card.' }, { id: 'nb-1' }];
  const stub = replying({ ...reply1, teachingAids: picks });
  const sendWith = (key, text, teachingCards, callModel) => submit(w.env, ANA, w.activity, { submissionKey: key, submittedContent: answerOf({ text }), teachingCards }, { ...never, callModel });
  const r = await sendWith('eb-teach-0001', A1, cards, stub.callModel);
  assert.equal(stub.calls.length, 1, 'one assessment call; naming a card generates nothing');
  assert.deepEqual(dataOf(stub.calls[0].body).teachingCards, [cards[0], cards[2]], 'teaching kinds only');
  assert.match(stub.calls[0].body.system, /"teachingCards" lists cards that already exist on the learner's canvas/);
  assert.match(stub.calls[0].body.system, /"teachingAids":\[\{"id":string,"reason":string\}\]/);
  assert.deepEqual(reviewOf(r).teachingAids, [{ cardId: 'exp-1', title: 'Centripetal force', kind: 'explanation', reason: picks[0].reason }], 'unknown, duplicate, non-teaching and unexplained picks are dropped');
  valid(r, { text: A1 });
  const saved = await readAttempt(w.env, ANA, r.body.attempt.attemptId);
  assert.equal(saved.attempt.submittedContent.teachingCards, undefined, 'the candidates are assessment input, never the saved answer');
  // Nothing to revisit: no aid, whatever the reply names. A malformed field never fails the assessment.
  const met = await sendWith('eb-teach-0002', A2, cards, replying({ ...reply2, teachingAids: picks }).callModel);
  assert.equal(reviewOf(met).feedback.revisit.text, '');
  assert.equal(reviewOf(met).teachingAids, undefined);
  const junk = await sendWith('eb-teach-0003', A1, 'junk', replying({ ...reply1, teachingAids: 'exp-1' }).callModel);
  assert.equal(junk.body.assessment.status, 'completed');
  assert.equal(reviewOf(junk).teachingAids, undefined);
});

test('FX-EB-09 dropped criterion: the request prefills one entry per criterion; a judgement left only in notes is never read as one', async t => {
  const w = await ebWorld(t);
  const note = await storeNote(w), v = voiceDeps();
  // The live reply's shape (dev preview, attempt at_fa3ff4ec): one criterion entry, the other judgement written into notes.
  const dropped = { ...spokenReply, criteria: [spokenReply.criteria[0]], notes: [`Rubric correction: the criteria array has only one entry. It should also include the entry for ${V} (velocity tangent), judged met, with reasoning not_applicable and evidence "The velocity is tangent to the circle."`] };
  const stub = replying(dropped);
  const r = await send(w, { voice: [note] }, { ...v, callModel: stub.callModel });
  const system = stub.calls[0].body.system;
  assert.match(system, /This rubric has 2, so "criteria" has exactly 2 entries, with the criterionId and version written below/);
  assert.match(system, /A judgement written anywhere else, such as in "notes", is ignored/);
  assert.ok(system.includes(`{"criteria":[{"criterionId":"${F}","version":1,"fit":`) && system.includes(`},{"criterionId":"${V}","version":1,"fit":`), 'each criterion has its own prefilled entry, in rubric order');
  // Parsing stays strict: the notes judgement is not credited, so the attempt is honestly Not rated and the gap is recorded.
  assert.equal(r.body.assessment.status, 'completed');
  assert.deepEqual(r.body.assessment.provenance.unassessed, [{ criterionId: V, version: 1, reason: 'not_returned' }]);
  assert.deepEqual(reviewOf(r).judgments.map(x => [x.criterionId, x.judgment]), [[F, 'demonstrated'], [V, 'unassessed']]);
  assert.deepEqual([reviewOf(r).rating.status, reviewOf(r).rating.reason], ['unrated', 'criteria_unassessed']);
  // The same answer with a reply that fills both prefilled entries is rated.
  const full = await send(w, { voice: [note] }, { ...v, callModel: replying(spokenReply).callModel });
  assert.deepEqual([reviewOf(full).rating.status, reviewOf(full).rating.score], ['rated', 10]);
});
