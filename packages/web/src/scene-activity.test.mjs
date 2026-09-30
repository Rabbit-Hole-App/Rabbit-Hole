import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREDICATES, applyCheck, applyNewAttempt, checkStatus, describeActivity, enterPractice, leavePractice, lockedInputNames, revealHiddenInputs, setActivityAnswer, validateActivity } from './scene-activity.js';

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
// practiceActive: most tests exercise the practice flow itself; the mode
// gate has its own tests below.
const setBlock = (extra = {}) => ({ id: 'blk', type: 'animation', scene: sceneStub, activity: setTask(), practiceActive: true, ...extra });

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
  const engine = state => ({ id: 'blk', type: 'scene', spec: {}, state, activity: task, practiceActive: true });
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

test('state truth: beginning an attempt, Check and New attempt all snap the visualization to the declared practice state', () => {
  const task = { ...setTask(), fixedInputs: { queryIndex: 2, maskEnabled: true } };
  // the learner explored away first
  const exploring = setBlock({ activity: task, inputs: { queryIndex: 3, maskEnabled: false }, inputRevision: 5 });
  const begun = setActivityAnswer(exploring, [0]);
  assert.deepEqual(begun.inputs, { queryIndex: 2, maskEnabled: true }, 'first answer touch snaps the experiment');
  assert.equal(begun.inputRevision, 6, 'the snap is an accepted revision');
  // exploring away mid-answer, then Check: the grading moment snaps back
  const wandered = { ...begun, inputs: { queryIndex: 0, maskEnabled: false }, inputRevision: 7 };
  const checked = applyCheck(wandered);
  assert.deepEqual(checked.inputs, { queryIndex: 2, maskEnabled: true });
  assert.deepEqual(checked.attemptLog[0].practiceInputs, { queryIndex: 2, maskEnabled: true });
  // New attempt restores the declared state too
  const drifted = { ...checked, inputs: { queryIndex: 1, maskEnabled: false } };
  assert.deepEqual(applyNewAttempt(drifted).inputs, { queryIndex: 2, maskEnabled: true });
  // and a task WITHOUT fixedInputs never touches the experiment
  const free = setActivityAnswer(setBlock({ inputs: { queryIndex: 1 } }), [0]);
  assert.deepEqual(free.inputs, { queryIndex: 1 });
});

test('one truth at a time: answers, Check and locks exist only inside practice mode', () => {
  const exploring = setBlock({ practiceActive: false, inputs: { queryIndex: 0 } });
  assert.equal(setActivityAnswer(exploring, [1]), exploring, 'no answer edits while exploring');
  const withAnswer = { ...exploring, activityAnswer: [0, 1, 2] };
  assert.equal(applyCheck(withAnswer), withAnswer, 'Check is inert while exploring');
  assert.deepEqual(lockedInputNames(exploring), [], 'nothing locked while exploring');
  const task = { ...setTask(), fixedInputs: { queryIndex: 2, maskEnabled: true } };
  const entered = enterPractice({ ...exploring, activity: task });
  assert.equal(entered.practiceActive, true);
  assert.deepEqual(entered.inputs, { queryIndex: 2, maskEnabled: true }, 'entering practice applies the declared state');
  assert.deepEqual(lockedInputNames(entered).sort(), ['maskEnabled', 'queryIndex'], 'and locks exactly the declared inputs');
  const left = leavePractice(entered);
  assert.equal(left.practiceActive, false);
  assert.deepEqual(lockedInputNames(left), [], 'leaving unlocks');
});

test('the command path refuses writes to task-locked inputs while practising', async () => {
  const { applyInputToBlock } = await import('./scene-evaluate.js');
  const scene = {
    inputs: [
      { name: 'queryIndex', type: 'index', label: 'Query token', of: 'tokens', default: 0 },
      { name: 'maskEnabled', type: 'bool', label: 'Causal mask', default: true },
    ],
    exampleData: { tokens: ['a', 'b', 'c', 'd'] },
  };
  const task = { ...setTask(), fixedInputs: { queryIndex: 2, maskEnabled: true } };
  const practising = { id: 'blk', type: 'animation', scene, activity: task, practiceActive: true, inputs: { queryIndex: 2, maskEnabled: true } };
  assert.equal(applyInputToBlock(practising, 'queryIndex', 0), practising, 'locked index write refused');
  assert.equal(applyInputToBlock(practising, 'maskEnabled', false), practising, 'locked bool write refused');
  const exploring = { ...practising, practiceActive: false };
  assert.equal(applyInputToBlock(exploring, 'queryIndex', 0).inputs.queryIndex, 0, 'the same write is free while exploring');
});

test('the tutor summary carries status and the learner answer, never the expected value', () => {
  const submitted = applyCheck(setActivityAnswer(setBlock(), [0, 1]));
  const text = describeActivity(submitted);
  assert.match(text, /submitted and failed/);
  assert.match(text, /\[0,1\]/);
  assert.ok(!text.includes('[0,1,2]'), 'expected set must never ride along');
  assert.ok(!/feedback/i.test(text));
});
