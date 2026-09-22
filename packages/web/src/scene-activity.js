import { coerceInputs } from './scene-inputs.js';
import { project } from './scene-behaviors.js';

// The shared practice layer for interactive cards (spec T09): one closed
// predicate vocabulary, one attempt reducer, no per-scene grader code. A
// task is DATA on the block (`block.activity`); everything that runs is
// dispatched by predicate KIND and block STRUCTURE, never by topic.
//
// Four separate meanings, kept separate on purpose (spec §7.4/7.5):
//   - the learner's draft answer   block.activityAnswer (editable while open)
//   - the committed attempts       block.attemptLog     (append-only)
//   - whether the attempt is open  block.activityOpen   (Check closes, New attempt reopens)
//   - what commitment revealed     derived from the log, never a learner input
//
// Check snapshots the answer and closes the attempt; pressing it again
// cannot duplicate or rewrite anything. Replay, scrubbing and every
// experiment control live on other fields entirely, so none of them can
// touch an attempt or a reveal.

// The closed predicate set - exactly what the four review tasks need.
// `context` carries the block-shaped evidence a predicate may read:
// { answer } always; { engineState } for behaviour-backed cards.
export const PREDICATES = {
  // Exact set: canonical (sorted, unique) positions, so click order can
  // never matter and a missing or extra member fails.
  set_equals: (context, task) => {
    const canonical = values => [...new Set((values || []).map(Number))].sort((a, b) => a - b);
    return JSON.stringify(canonical(context.answer)) === JSON.stringify(canonical(task.expected));
  },
  index_equals: (context, task) => Number(context.answer) === Number(task.expected),
  choice_equals: (context, task) => context.answer === task.expected,
  // The learner's live geometry must have a DEFINED projection of length
  // zero. Defined already IS the nonzero-axis requirement - project()
  // refuses a zero axis outright - and an undefined projection is not-ready
  // (guarded in checkStatus below), never a pass. Tolerance follows the
  // approved rounding policy: length is already rounded to 3 decimals.
  projection_zero: context => {
    const state = context.engineState;
    if (!state) return false;
    const result = project(state.a, state.b);
    return result.defined && Math.abs(result.length) <= 0.001;
  },
};

const ANSWER_KINDS = ['set_equals', 'index_equals', 'choice_equals'];

export function validateActivity(activity) {
  if (!activity) return null;
  const where = `Activity "${activity.id ?? '?'}"`;
  if (!PREDICATES[activity.check]) throw new Error(`${where}: unknown check "${activity.check}" - one of ${Object.keys(PREDICATES).join(', ')}`);
  if (typeof activity.prompt !== 'string' || !activity.prompt.trim()) throw new Error(`${where}: a practice task needs a prompt`);
  if (ANSWER_KINDS.includes(activity.check)) {
    if (!activity.answer || !activity.answer.type) throw new Error(`${where}: check "${activity.check}" needs an answer input declaration`);
    if (activity.expected === undefined) throw new Error(`${where}: check "${activity.check}" needs an expected value`);
  }
  if (typeof activity.feedbackPass !== 'string' || typeof activity.feedbackFail !== 'string') {
    throw new Error(`${where}: authored feedbackPass and feedbackFail strings are required - feedback stays on the card`);
  }
  return activity;
}

// Is there anything to grade yet? Distinct from failure: an empty answer
// set, an unpicked option or an undefined projection is "not ready", and
// Check stays disabled rather than minting a failed attempt.
export function checkStatus(block) {
  const activity = block.activity;
  if (!activity) return { state: 'none' };
  const attempts = block.attemptLog || [];
  const open = block.activityOpen ?? true;
  if (!open && attempts.length) {
    const last = attempts[attempts.length - 1];
    return { state: 'submitted', result: last.result, attempts: attempts.length, last };
  }
  if (activity.check === 'projection_zero') {
    const state = block.state;
    if (!state || !project(state.a, state.b).defined) return { state: 'not_ready', reason: 'The projection is undefined - give the axis b a direction first.' };
    return { state: 'ready', attempts: attempts.length };
  }
  const answer = block.activityAnswer;
  const empty = answer == null || (Array.isArray(answer) && answer.length === 0);
  if (empty) return { state: 'not_ready', reason: activity.notReady || 'Make a prediction first.' };
  return { state: 'ready', attempts: attempts.length };
}

// State truth for a task that declares its premise: when the task grades a
// specific experiment state (activity.fixedInputs), the visualization must
// SHOW that state at every moment the practice engages - the learner may
// never be looking at "today, mask off" while answering about "south, mask
// on". Applied when an attempt begins (first answer touch), at Check, and on
// New attempt. Exploration in between stays free; grading moments snap back.
function withPracticeState(block) {
  const fixed = block.activity?.fixedInputs;
  if (!fixed) return block;
  const current = block.inputs || {};
  if (Object.entries(fixed).every(([name, value]) => JSON.stringify(current[name]) === JSON.stringify(value))) return block;
  return { ...block, inputs: { ...current, ...fixed }, inputRevision: (block.inputRevision || 0) + 1 };
}

// The learner edits a draft answer only while the attempt is open; a
// submitted attempt is immutable until New attempt explicitly reopens.
// The FIRST touch of the answer is when the attempt begins - the declared
// practice state is applied to the visualization right then.
export function setActivityAnswer(block, value) {
  if (!(block.activityOpen ?? true)) return block;
  const declaration = block.activity?.answer;
  const coerced = declaration
    ? coerceInputs([{ ...declaration, name: 'answer' }], { answer: value }, block.activity.answerData || block.scene?.exampleData).answer
    : value;
  const beginning = block.activityAnswer == null;
  return { ...(beginning ? withPracticeState(block) : block), activityAnswer: coerced };
}

// Check: grade the exact current snapshot ONCE. Closes the attempt; calling
// it again while closed is a no-op (idempotent by construction, not by the
// button being disabled).
export function applyCheck(block) {
  const activity = block.activity;
  if (!activity) return block;
  const status = checkStatus(block);
  if (status.state !== 'ready') return block;
  // The grading moment shows the graded state: snap to the declared practice
  // inputs (a no-op when the learner never explored away).
  const snapped = withPracticeState(block);
  const context = { answer: snapped.activityAnswer, engineState: snapped.state };
  const passed = !!PREDICATES[activity.check](context, activity);
  const attempt = {
    taskVersion: activity.version ?? 1,
    answer: snapped.activityAnswer ?? null,
    ...(activity.fixedInputs ? { practiceInputs: { ...activity.fixedInputs } } : {}),
    ...(activity.check === 'projection_zero' && snapped.state ? { a: [...snapped.state.a], b: [...snapped.state.b] } : {}),
    inputRevision: snapped.inputRevision || 0,
    result: passed ? 'passed' : 'failed',
  };
  return { ...snapped, attemptLog: [...(snapped.attemptLog || []), attempt], activityOpen: false };
}

// New attempt: reopens with a fresh draft, restoring the declared practice
// state. The log is history and stays.
export function applyNewAttempt(block) {
  if (block.activityOpen ?? true) return block;
  return { ...withPracticeState(block), activityOpen: true, activityAnswer: null };
}

// What commitment has revealed, as the hidden-input map the scene evaluates
// with. Derived from the append-only log - a learner input, a scrub, or a
// replay has no way to produce it.
export function revealHiddenInputs(block) {
  const name = block.activity?.revealInput;
  if (!name) return {};
  return { [name]: (block.attemptLog || []).length > 0 };
}

// The bounded practice summary the tutor may see: status and the learner's
// own submitted answer - never the expected value.
export function describeActivity(block) {
  const activity = block.activity;
  if (!activity) return '';
  const status = checkStatus(block);
  const attempts = (block.attemptLog || []).length;
  if (status.state === 'submitted') {
    return `Practice task: ${activity.prompt} Status: submitted and ${status.result} (attempt ${attempts}). Learner's committed answer: ${JSON.stringify(status.last.answer ?? status.last)}`;
  }
  return `Practice task: ${activity.prompt} Status: ${status.state === 'not_ready' ? 'no answer yet' : 'in progress'} (${attempts} committed attempt${attempts === 1 ? '' : 's'}).`;
}
