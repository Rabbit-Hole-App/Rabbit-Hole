// EB-01: the Explain-back shared contract accepts every supported empty-text case, rejects malformed and cross-scope
// references, keeps legacy records valid, and checks a stored review against the answer it reviews. Pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSE_KINDS, validateCoachingRecord } from './learn-coaching-contract.js';
import {
  ANSWER_LIMITS, ERROR_CODES, JUDGMENT_FIT, answerReadiness, attemptState, fromLegacyAnswer, submitEnvelope,
  validateExplainBackAnswer, validateExplainBackReview,
} from './explain-back-contract.js';
import { BOARD, CARD, INVALID, LEGACY, READINESS, REVIEWED_ANSWER, VALID, review } from './explain-back-contract.fixtures.mjs';

const ctx = { board: BOARD, cardId: CARD };

test('every valid fixture passes, in scope, and is ready to submit', () => {
  for (const [name, a] of Object.entries(VALID)) {
    assert.deepEqual(validateExplainBackAnswer(a, ctx), { ok: true, errors: [] }, name);
    assert.deepEqual(answerReadiness(a), { ready: true, reason: null }, name);
  }
  // empty typed text with one other ready medium is a complete answer
  for (const name of ['emptyTextVoice', 'sketchOnly']) assert.equal(VALID[name].text, '', name);
});

test('malformed and cross-scope answers are refused with a specific error', () => {
  for (const [name, [a, expected]] of Object.entries(INVALID)) {
    const r = validateExplainBackAnswer(a, ctx);
    assert.equal(r.ok, false, name);
    assert.ok(r.errors.some(e => e.includes(expected)), `${name}: ${r.errors.join('; ')}`);
  }
  // cross-scope checks need the server's scope; without it shape alone passes (the server always passes ctx)
  assert.equal(validateExplainBackAnswer(INVALID.otherBoardResource[0]).ok, true);
});

test('readiness: recording or uploading blocks submit; unavailable evidence must be repaired or removed', () => {
  for (const [name, [a, capture, reason]] of Object.entries(READINESS)) assert.deepEqual(answerReadiness(a, capture), { ready: false, reason }, name);
  for (const { reason } of Object.values(READINESS).map(([a, c]) => answerReadiness(a, c))) assert.equal(ERROR_CODES[reason], 'local');
  // an unsupported Group member is reported in coverage, not a blocker
  assert.equal(answerReadiness(VALID.resourceGroup).ready, true);
  assert.equal(answerReadiness({ ...VALID.textOnly, text: 'x'.repeat(ANSWER_LIMITS.textChars + 1) }).reason, 'text_too_long');
});

test('legacy records stay valid and read as text answers without invented evidence', () => {
  assert.ok(RESPONSE_KINDS.includes('explain_back'));
  for (const kind of ['text', 'choice', 'numeric', 'drawing', 'code']) assert.ok(RESPONSE_KINDS.includes(kind));
  const legacy = fromLegacyAnswer(LEGACY.textSketch);
  assert.equal(legacy.text, 'See drawing');
  assert.equal(legacy.sketch, undefined, 'the old sketch record names no stored image');
  assert.equal(legacy.legacy, true);
  assert.equal(validateExplainBackAnswer(fromLegacyAnswer(LEGACY.text)).ok, true);
  assert.equal(fromLegacyAnswer(VALID.combined), VALID.combined);
  assert.equal(attemptState({ status: 'completed', provenance: {} }), 'not_rated', 'a legacy review has no number');
});

test('the envelope is a valid SubmitAttempt whose assistance ids come from the answer', () => {
  const env = submitEnvelope({ activityId: 'act_1', activityRevision: 2, submissionKey: 'sub_12345678', answer: VALID.combined });
  assert.equal(validateCoachingRecord('SubmitAttempt', env).ok, true);
  assert.deepEqual(env.assistanceRefs, ['chat:chat_7', 'saw_prior_feedback:as_prev'], 'a revision of a reviewed parent records the feedback it saw');
  assert.deepEqual(submitEnvelope({ activityId: 'a', activityRevision: 1, submissionKey: 'sub_12345678', answer: VALID.revisionNoParentReview }).assistanceRefs, []);
  assert.deepEqual(env.sourceRefs, [], 'learner evidence rides the answer; sourceRefs stay the activity task sources');
});

test('judgments map to the existing fit field; criteria carry optional rating weight, required and scored', () => {
  assert.deepEqual(JUDGMENT_FIT, { demonstrated: 'met', partly_demonstrated: 'partial', contradicted: 'not_met', not_established: 'not_met', unassessed: 'unclear' });
  const c = { criterionId: 'c1', version: 1, label: 'L', requirement: 'R', requiresReasoning: true, rubricVersion: 'r1' };
  assert.equal(validateCoachingRecord('Criterion', c).ok, true, 'a legacy criterion without them');
  assert.equal(validateCoachingRecord('Criterion', { ...c, weight: 2, required: false, scored: true }).ok, true);
  for (const weight of [0, -1, Infinity, '2']) assert.equal(validateCoachingRecord('Criterion', { ...c, weight }).ok, false, String(weight));
});

test('a review validates against its answer: citations, coverage, comparison and rating', () => {
  assert.deepEqual(validateExplainBackReview(review(), REVIEWED_ANSWER), { ok: true, errors: [] });
  const fails = (r, a, expected) => {
    const out = validateExplainBackReview(r, a);
    assert.equal(out.ok, false, expected);
    assert.ok(out.errors.some(e => e.includes(expected)), `${expected}: ${out.errors.join('; ')}`);
  };
  const base = review();
  fails(review({ coverage: [base.coverage[0]] }), REVIEWED_ANSWER, 'coverage: missing ev_sketch_1');
  fails(review({ judgments: [{ ...base.judgments[0], citations: [{ evidenceId: 'ev_invented', locator: {} }] }, base.judgments[1]] }), REVIEWED_ANSWER, 'not in the answer');
  fails(review({ judgments: [{ ...base.judgments[0], citations: [{ evidenceId: 'text', locator: { start: 0, end: 5 } }] }, base.judgments[1]] }), REVIEWED_ANSWER, 'not in the answer');
  fails(review({ judgments: [{ ...base.judgments[0], fit: 'partial' }, base.judgments[1]] }), REVIEWED_ANSWER, 'stores fit met');
  fails(review({ rating: { ...base.rating, score: 11 } }), REVIEWED_ANSWER, 'ratingScore');
  fails(review({ rating: { ...base.rating, score: undefined } }), REVIEWED_ANSWER, 'rated has a score');
  fails(review({ rating: { ...base.rating, reason: 'criteria_unassessed' } }), REVIEWED_ANSWER, 'rated has a score');
  fails(review({ rating: { ...base.rating, rubricVersion: 'r2' } }), REVIEWED_ANSWER, 'another rubric version');
  fails(review({ rating: { ...base.rating, criteria: [...base.rating.criteria, { criterionId: 'c_other', version: 1, weight: 1, required: true, credit: 1 }] } }), REVIEWED_ANSWER, 'not a judged criterion');
  fails(review({ status: 'unavailable' }), REVIEWED_ANSWER, 'only a completed review is rated');
  const unassessed = { ...base.judgments[1], judgment: 'unassessed', fit: 'unclear' };
  fails(review({ judgments: [base.judgments[0], unassessed] }), REVIEWED_ANSWER, 'unassessed, so Not rated');
  // the honest version: Not rated with its reason, exactly as rateAttempt returns it
  const notRated = { status: 'unrated', reason: 'criteria_unassessed', outOf: 10, calculationVersion: 'eb-rating-v1', rubricVersion: 'r1',
    criteria: [base.rating.criteria[0], { ...base.rating.criteria[1], credit: null, reason: 'fit_unclear' }], unknown: [{ criterionId: 'c_velocity', version: 1, reason: 'fit_unclear' }] };
  assert.deepEqual(validateExplainBackReview(review({ judgments: [base.judgments[0], unassessed], rating: notRated }), REVIEWED_ANSWER), { ok: true, errors: [] });
  assert.equal(attemptState({ status: 'completed', provenance: { review: review({ rating: notRated }) } }), 'not_rated');
  // a comparison must name the baseline the answer carried
  const comparison = { parentAttemptId: 'at_parent', parentAssessmentId: 'as_prev', comparable: true, items: [{ criterionId: 'c_force', change: 'resolved', baselineCitations: [], currentCitations: [] }] };
  fails(review({ comparison }), REVIEWED_ANSWER, 'not the answer baseline');
  assert.equal(validateExplainBackReview(review({ comparison }), { ...REVIEWED_ANSWER, baseline: { parentAttemptId: 'at_parent', parentAssessmentId: 'as_prev' } }).ok, true);
});

test('attempt state follows the latest operation and its stored rating', () => {
  assert.equal(attemptState(null), 'draft');
  assert.equal(attemptState({ status: 'pending' }), 'assessing');
  assert.equal(attemptState({ status: 'unknown' }), 'unknown');
  assert.equal(attemptState({ status: 'failed' }), 'failed');
  assert.equal(attemptState({ status: 'completed', provenance: { review: review() } }), 'reviewed');
});
