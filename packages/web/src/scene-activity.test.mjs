import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREDICATES, applyCheck, applyNewAttempt, checkStatus, describeActivity, revealHiddenInputs, setActivityAnswer, validateActivity } from './scene-activity.js';

// T09: the shared practice layer. Everything here is generic - tasks are
// data, predicates are a closed set, attempts are append-only.

const setTask = () => ({
  id: 'i01-practice', check: 'set_equals', version: 1,
  prompt: 'With the query fixed on position 2 and the mask on, which positions may it attend to?',
  answer: { type: 'indices', label: 'Your prediction', of: 'tokens', default: [] },
  expected: [0, 1, 2],
  feedbackPass: 'Right - a causal query sees itself and everything before it.',
  feedbackFail: 'Not quite - remember the query position itself is included.',
});
const sceneStub = { exampleData: { tokens: ['a', 'b', 'c', 'd'] } };
const setBlock = (extra = {}) => ({ id: 'blk', type: 'animation', scene: sceneStub, activity: setTask(), ...extra });

test('activity definitions validate: unknown checks, missing feedback and missing expected are refused', () => {
  assert.equal(validateActivity(null), null);
  validateActivity(setTask());
  assert.throws(() => validateActivity({ ...setTask(), check: 'regex_match' }), /unknown check/);
  assert.throws(() => validateActivity({ ...setTask(), feedbackFail: undefined }), /feedback/);
  assert.throws(() => validateActivity({ ...setTask(), expected: undefined }), /expected/);
  assert.throws(() => validateActivity({ ...setTask(), prompt: ' ' }), /prompt/);
});

test('set_equals is order-free and exact; the query position itself counts', () => {
  assert.equal(PREDICATES.set_equals({ answer: [2, 0, 1] }, { expected: [0, 1, 2] }), true);
  assert.equal(PREDICATES.set_equals({ answer: [0, 1] }, { expected: [0, 1, 2] }), false, 'missing the query itself fails');
  assert.equal(PREDICATES.set_equals({ answer: [0, 1, 2, 3] }, { expected: [0, 1, 2] }), false, 'an extra future position fails');
  assert.equal(PREDICATES.set_equals({ answer: [2, 2, 0, 1] }, { expected: [0, 1, 2] }), true, 'duplicates collapse');
});

test('not attempted, not ready, failed and passed stay distinct', () => {
  const untouched = setBlock();
  assert.equal(checkStatus(untouched).state, 'not_ready', 'no answer yet');
  const empty = setActivityAnswer(untouched, []);
  assert.equal(checkStatus(empty).state, 'not_ready', 'an empty set is nothing to grade');
  const answered = setActivityAnswer(untouched, [1, 0]);
  assert.equal(checkStatus(answered).state, 'ready');
  const failed = applyCheck(answered);
  assert.equal(checkStatus(failed).state, 'submitted');
  assert.equal(checkStatus(failed).result, 'failed');
  const passed = applyCheck(setActivityAnswer(applyNewAttempt(failed), [2, 1, 0]));
  assert.equal(checkStatus(passed).result, 'passed');
  assert.equal(passed.attemptLog.length, 2, 'history is append-only');
});

test('Check is idempotent: a second press changes nothing at all', () => {
  const submitted = applyCheck(setActivityAnswer(setBlock(), [0, 1, 2]));
  assert.equal(applyCheck(submitted), submitted);
  assert.equal(submitted.attemptLog.length, 1);
});

test('a submitted answer is immutable until New attempt explicitly reopens', () => {
  const submitted = applyCheck(setActivityAnswer(setBlock(), [0, 1]));
  assert.equal(setActivityAnswer(submitted, [3]), submitted, 'editing while closed is refused');
  const reopened = applyNewAttempt(submitted);
  assert.equal(reopened.activityAnswer, null, 'a fresh draft');
  assert.deepEqual(reopened.attemptLog[0].answer, [0, 1], 'the old attempt is untouched');
});

test('the draft answer coerces through the same typed contract as any input', () => {
  const drafted = setActivityAnswer(setBlock(), [9, 1, 1, 'x', 2.4]);
  assert.deepEqual(drafted.activityAnswer, [1, 2]);
});

test('reveal is derived from commitment alone - no learner input can mint it', () => {
  const withReveal = setBlock({ activity: { ...setTask(), check: 'choice_equals', answer: { type: 'choice', label: 'Candidate', options: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], default: 'A' }, expected: 'B', revealInput: 'resultsRevealed' } });
  assert.deepEqual(revealHiddenInputs(withReveal), { resultsRevealed: false });
  const submitted = applyCheck(setActivityAnswer(withReveal, 'A'));
  assert.deepEqual(revealHiddenInputs(submitted), { resultsRevealed: true });
  assert.equal(checkStatus(submitted).result, 'failed', 'choosing A records A and fails');
  assert.equal(submitted.attemptLog[0].answer, 'A', 'revealing B never rewrites the committed A');
  // scrubbing/replay analogues: changing time or experiment inputs touches
  // neither the log nor the derived reveal
  const scrubbed = { ...submitted, time: 3.7, inputs: { candidate: 'C' }, inputRevision: 9 };
  assert.deepEqual(revealHiddenInputs(scrubbed), { resultsRevealed: true });
  assert.equal(scrubbed.attemptLog.length, 1);
});

test('projection_zero: defined-and-zero passes, a zero axis is not ready, never graded', () => {
  const task = { id: 'i04-practice', check: 'projection_zero', prompt: 'Make the projection zero with a valid nonzero axis.', feedbackPass: 'Zero - a is perpendicular to b.', feedbackFail: 'Not zero yet.' };
  const engine = state => ({ id: 'blk', type: 'scene', spec: {}, state, activity: task });
  assert.equal(checkStatus(engine({ a: [0, 3], b: [2, 0] })).state, 'ready');
  assert.equal(applyCheck(engine({ a: [0, 3], b: [2, 0] })).attemptLog[0].result, 'passed');
  assert.equal(applyCheck(engine({ a: [3, 2], b: [2, 0] })).attemptLog[0].result, 'failed');
  const zeroAxis = engine({ a: [0, 0], b: [0, 0] });
  assert.equal(checkStatus(zeroAxis).state, 'not_ready');
  assert.equal(applyCheck(zeroAxis), zeroAxis, 'nothing to grade, no attempt minted');
  // the attempt records the exact geometry it graded
  const attempt = applyCheck(engine({ a: [0, 3], b: [2, 0] })).attemptLog[0];
  assert.deepEqual(attempt.a, [0, 3]);
  assert.deepEqual(attempt.b, [2, 0]);
});

test('the tutor summary carries status and the learner answer, never the expected value', () => {
  const submitted = applyCheck(setActivityAnswer(setBlock(), [0, 1]));
  const text = describeActivity(submitted);
  assert.match(text, /submitted and failed/);
  assert.match(text, /\[0,1\]/);
  assert.ok(!text.includes('[0,1,2]'), 'expected set must never ride along');
  assert.ok(!/feedback/i.test(text));
});
