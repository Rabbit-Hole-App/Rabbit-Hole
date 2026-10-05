import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lj from './learn-journey.js';
// Intent is the shared resolver's extension (R7); its own tests are control-plane/test/learner-intent-journey.test.js.
import { journeyIntent } from '../../control-plane/src/learner-intent-journey.js';

const { JOURNEY_STATES, TRAY_MODES, INTAKE_SLOTS, slotsFromIntent, nextIntakeQuestion, applyIntakeAnswer, trayFor } = lj;
const { validateRegistry, validatePath, journeyStep, nextProbe, pathEntries } = lj;

// Fixtures in the 9.1 registry and 9.2 LearningPath shapes: a logistic-regression journey (the spec's example path).
const LR_REGISTRY = {
  concepts: {
    classification: { label: 'Binary classification', names: ['classification', 'binary classification'], prerequisites: [] },
    probability: { label: 'Probability and odds', names: ['probability', 'odds'], prerequisites: [] },
    'linear-score': { label: 'The linear score', names: ['linear score', 'score', 'logit'], prerequisites: [] },
    sigmoid: { label: 'The sigmoid function', names: ['sigmoid', 'logistic function'], prerequisites: ['linear-score', 'probability'] },
    'decision-boundary': { label: 'Decision boundary', names: ['decision boundary', 'threshold'], prerequisites: ['sigmoid'] },
    'cross-entropy': { label: 'Binary cross-entropy', names: ['binary cross-entropy', 'log loss', 'bce'], prerequisites: ['sigmoid'] },
    'gradient-descent': { label: 'Gradient descent', names: ['gradient descent'], prerequisites: ['cross-entropy'] },
    implementation: { label: 'Building the classifier', names: ['implementation', 'from scratch'], prerequisites: ['gradient-descent'] },
    evaluation: { label: 'Evaluating the classifier', names: ['evaluation', 'accuracy', 'precision', 'recall'], prerequisites: ['decision-boundary'] },
  },
  claims: {
    'classification/predicts-one-of-two-labels': {
      concept: 'classification',
      statement: 'Binary classification predicts which of two labels an example has, so the output must say how likely the positive label is rather than give an unbounded number.',
      ideas: ['the model chooses between two labels', 'the output should be a likelihood of the positive label, not an unbounded number'],
      misconceptions: [{ id: 'regression-output', check: 'says the raw regression output can be used directly as the label' }],
      prerequisites: [],
      drawn: 'a single-feature spam/not-spam example',
    },
    'probability/odds-from-probability': {
      concept: 'probability',
      statement: 'The odds of an event are its probability divided by the probability that it does not happen, so p = 0.5 gives odds of 1.',
      ideas: ['odds are p / (1 - p)', 'p = 0.5 gives odds of 1'],
      misconceptions: [{ id: 'odds-is-probability', check: 'says odds and probability are the same number' }],
      prerequisites: [],
      drawn: 'a coin that lands heads with p = 0.75',
    },
    'linear-score/weighted-sum-plus-bias': {
      concept: 'linear-score',
      statement: 'The score z = w·x + b is a weighted sum of the features plus a bias; it can be any real number.',
      ideas: ['the score is a weighted sum of the features plus a bias', 'the score is unbounded'],
      misconceptions: [{ id: 'score-is-probability', check: 'says a score of 3.2 is already a probability' }],
      prerequisites: [],
      drawn: 'a single-feature spam/not-spam example with w = 2 and b = -1',
      cues: ['score', 'logit', 'w·x + b'],
    },
    'sigmoid/squashes-score-to-probability': {
      concept: 'sigmoid',
      statement: 'The sigmoid maps any score to a number between 0 and 1, rising smoothly as the score grows, so it can be read as the probability of the positive label.',
      ideas: ['the sigmoid maps any score into (0, 1)', 'a larger score gives a larger probability'],
      misconceptions: [{ id: 'sigmoid-linear', check: 'says the sigmoid output grows in proportion to the score' }],
      prerequisites: ['linear-score', 'probability'],
      drawn: 'the sigmoid curve over scores from -6 to 6 for the spam example',
    },
    'sigmoid/zero-score-is-one-half': {
      concept: 'sigmoid',
      statement: 'A score of zero gives probability 0.5, because the sigmoid is symmetric about zero.',
      ideas: ['a score of 0 gives probability 0.5'],
      misconceptions: [],
      prerequisites: ['linear-score'],
      drawn: 'the sigmoid curve crossing 0.5 at score 0',
    },
    'decision-boundary/threshold-is-a-line': {
      concept: 'decision-boundary',
      statement: 'Thresholding the probability at 0.5 is the same as thresholding the score at 0, which is a straight line (w·x + b = 0) in feature space.',
      ideas: ['probability 0.5 corresponds to score 0', 'the boundary w·x + b = 0 is a straight line'],
      misconceptions: [{ id: 'curved-boundary', check: 'says the sigmoid makes the decision boundary curved' }],
      prerequisites: ['sigmoid'],
      drawn: 'a two-feature spam example with threshold 0.5',
    },
    'cross-entropy/punishes-confident-mistakes': {
      concept: 'cross-entropy',
      statement: 'Binary cross-entropy is -log of the probability given to the true label, so a confident wrong prediction costs far more than an unsure one.',
      ideas: ['the loss is -log of the probability of the true label', 'confident mistakes cost the most'],
      misconceptions: [{ id: 'counts-errors', check: 'says the loss only counts how many predictions are wrong' }],
      prerequisites: ['sigmoid'],
      drawn: 'one spam email predicted at 0.9 and at 0.1',
    },
    'gradient-descent/steps-against-the-gradient': {
      concept: 'gradient-descent',
      statement: 'Gradient descent moves each weight a small step against the gradient of the loss, so the loss goes down.',
      ideas: ['each step moves the weights against the gradient', 'the step is scaled by a learning rate'],
      misconceptions: [{ id: 'follows-gradient', check: 'says the weights move in the direction of the gradient' }],
      prerequisites: ['cross-entropy'],
      drawn: 'one weight on a bowl-shaped loss curve',
    },
    'gradient-descent/error-times-input': {
      concept: 'gradient-descent',
      statement: 'For logistic regression with cross-entropy, the gradient for a weight is (prediction - label) times that feature.',
      ideas: ['the gradient is (prediction - label) times the feature'],
      misconceptions: [],
      prerequisites: ['cross-entropy'],
      drawn: 'one spam example with prediction 0.8 and label 1',
    },
    'implementation/vectorized-forward-and-update': {
      concept: 'implementation',
      statement: 'A from-scratch classifier computes all scores as X·w + b, applies the sigmoid, and updates w with the averaged gradient each epoch.',
      ideas: ['scores for all examples are X·w + b', 'each epoch updates w with the averaged gradient'],
      misconceptions: [],
      prerequisites: ['gradient-descent'],
      drawn: 'a 4-example, 2-feature NumPy array',
    },
    'evaluation/accuracy-hides-imbalance': {
      concept: 'evaluation',
      statement: 'On imbalanced data a classifier can score high accuracy while missing most positives, so precision and recall are checked too.',
      ideas: ['accuracy can be high while most positives are missed', 'precision and recall show what accuracy hides'],
      misconceptions: [{ id: 'accuracy-enough', check: 'says high accuracy always means a good classifier' }],
      prerequisites: ['decision-boundary'],
      drawn: '95 not-spam and 5 spam emails, all predicted not-spam',
    },
  },
};

const LR_PATH = {
  journey_id: 'lj_lr', version: 1, goal: 'Build and reason about a binary logistic regression classifier.', target_topic: 'logistic regression',
  grounding: { kind: 'topic' }, intake_ref: { journey_revision: 4 }, diagnostic_evidence_refs: [1, 2],
  sections: [
    { id: 'classification-vs-regression', title: 'Classification vs regression', purpose: 'Why predicting one of two labels needs a likelihood, not a raw number.', kind: 'core',
      target_concepts: ['classification'], prerequisites: [], expected_evidence: [{ claim: 'classification/predicts-one-of-two-labels', kind: 'explain' }],
      estimated_minutes: 3, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'score-to-probability', title: 'From score to probability', purpose: 'Why a linear score cannot be read as a probability as it is.', kind: 'core',
      target_concepts: ['linear-score'], prerequisites: ['classification'], expected_evidence: [{ claim: 'linear-score/weighted-sum-plus-bias', kind: 'predict' }],
      estimated_minutes: 4, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'sigmoid', title: 'The sigmoid function', purpose: 'How the sigmoid squashes any score into a probability.', kind: 'core',
      target_concepts: ['sigmoid'], prerequisites: ['linear-score'],
      expected_evidence: [{ claim: 'sigmoid/squashes-score-to-probability', kind: 'predict' }, { claim: 'sigmoid/zero-score-is-one-half', kind: 'explain' }],
      estimated_minutes: 4, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'decision-boundary', title: 'Decision boundary', purpose: 'Where the classifier switches label, and why that is a straight line.', kind: 'core',
      target_concepts: ['decision-boundary'], prerequisites: ['sigmoid'], expected_evidence: [{ claim: 'decision-boundary/threshold-is-a-line', kind: 'apply' }],
      estimated_minutes: 4, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'binary-cross-entropy', title: 'Binary cross-entropy', purpose: 'How the loss scores a prediction, and why confident mistakes cost most.', kind: 'core',
      target_concepts: ['cross-entropy'], prerequisites: ['sigmoid'], expected_evidence: [{ claim: 'cross-entropy/punishes-confident-mistakes', kind: 'explain' }],
      estimated_minutes: 4, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'gradient-descent', title: 'Gradient descent', purpose: 'How the weights move to lower the loss.', kind: 'core',
      target_concepts: ['gradient-descent'], prerequisites: ['cross-entropy'],
      expected_evidence: [{ claim: 'gradient-descent/steps-against-the-gradient', kind: 'apply' }, { claim: 'gradient-descent/error-times-input', kind: 'explain' }],
      estimated_minutes: 4, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'build-classifier', title: 'Build a classifier', purpose: 'Put the score, sigmoid, loss and update together in code.', kind: 'core',
      target_concepts: ['implementation'], prerequisites: ['gradient-descent'], expected_evidence: [{ claim: 'implementation/vectorized-forward-and-update', kind: 'apply' }],
      estimated_minutes: 5, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
    { id: 'evaluate', title: 'Evaluate it', purpose: 'Judge the classifier beyond accuracy.', kind: 'core',
      target_concepts: ['evaluation'], prerequisites: ['decision-boundary'], expected_evidence: [{ claim: 'evaluation/accuracy-hides-imbalance', kind: 'transfer' }],
      estimated_minutes: 2, depth: 'guided', status: 'upcoming', generation_state: 'not_generated' },
  ],
  current_section_id: null,
  change: { source: 'draft', reason: 'First draft from the intake and the diagnostic.', evidence_refs: [1, 2], sections_changed: [] },
  created_at: '2026-10-04T00:00:00.000Z',
};

test('exports the locked state and mode lists', () => {
  assert.equal('journeyIntent' in lj || 'resolveTurnRules' in lj, false);
  assert.deepEqual(JOURNEY_STATES, ['intake', 'diagnostic', 'path_review', 'active', 'paused', 'completed']);
  assert.equal(TRAY_MODES.length, 8);
  assert.deepEqual(INTAKE_SLOTS.map((s) => s.slot), ['goal', 'familiarity', 'depth']);
});

// Answers every question with its first option; returns the slots asked, in order.
const askAll = (intent) => {
  let intake = slotsFromIntent(intent);
  const asked = [];
  for (let q; (q = nextIntakeQuestion(intake, intent)); ) {
    asked.push(q.slot);
    intake = applyIntakeAnswer(intake, q.slot, { option_id: q.options[0].id });
    assert.ok(asked.length <= 3);
  }
  return asked;
};

test('intake asks exactly three questions for a bare journey', () => {
  assert.deepEqual(askAll(journeyIntent('I want to learn logistic regression')), ['goal', 'familiarity', 'depth']);
});

test('stated constraints remove slots', () => {
  const intent = journeyIntent('Give me a 10-minute visual overview of logistic regression');
  const intake = slotsFromIntent(intent);
  assert.equal(intake.slots.depth, 'overview');
  assert.equal(intake.source.depth, 'stated');
  assert.equal(intake.slots.minutes, 10);
  assert.deepEqual(askAll(intent), ['goal']);
});

test('no slot is asked twice', () => {
  const intent = journeyIntent('I want to learn logistic regression');
  let intake = slotsFromIntent(intent);
  const q = nextIntakeQuestion(intake, intent);
  assert.equal(q.slot, 'goal');
  assert.match(q.prompt, /logistic regression/);
  intake = applyIntakeAnswer(intake, 'goal', { option_id: q.options[1].id });
  assert.notEqual(nextIntakeQuestion(intake, intent).slot, 'goal');
});

test('free text answers the goal as other', () => {
  const intake = applyIntakeAnswer(slotsFromIntent(journeyIntent('teach me x')), 'goal', { text: 'pass my exam' });
  assert.equal(intake.slots.goal, 'other');
  assert.equal(intake.goal_text, 'pass my exam');
  assert.equal(intake.source.goal, 'answered');
});

test('applyIntakeAnswer: unknown slot, null intake and blank text change nothing; text is trimmed and capped', () => {
  const intake = slotsFromIntent(journeyIntent('I want to learn logistic regression'));
  assert.equal(applyIntakeAnswer(intake, 'colour', { option_id: 'red' }), intake);
  assert.equal(applyIntakeAnswer(null, 'colour', { option_id: 'red' }), null);
  assert.equal(applyIntakeAnswer(intake, 'goal', { text: '   ' }), intake);
  assert.equal(applyIntakeAnswer(null, 'goal', { option_id: 'build' }).slots.goal, 'build');
  assert.equal(applyIntakeAnswer(intake, 'goal', { text: '  pass my exam  ' }).goal_text, 'pass my exam');
  assert.equal(applyIntakeAnswer(intake, 'goal', { text: 'x'.repeat(500) }).goal_text.length, 300);
});

test('fast start fills every slot with defaults', () => {
  const intent = journeyIntent('Skip setup and start');
  const intake = slotsFromIntent(intent);
  assert.equal(nextIntakeQuestion(intake, intent), null);
  assert.equal(intake.source.goal, 'default');
});

const journey = (over = {}) => ({
  id: 'lj_1', state: 'intake', pending: null, error: null,
  request: { topic: 'logistic regression', intent: journeyIntent('I want to learn logistic regression') },
  intake: { slots: {}, source: {} }, diagnostic: { probes: [], asked: [] }, ...over,
});

test('trayFor: intake question', () => {
  const t = trayFor(journey(), null);
  assert.equal(t.mode, 'intent_intake');
  assert.equal(t.slot, 'goal');
  assert.equal(t.free_text, true);
  assert.deepEqual(t.options.map((o) => o.id), INTAKE_SLOTS[0].options.map((o) => o.id));
  // An intent object with a topic still names it when request.topic is missing.
  const noTopic = trayFor(journey({ request: { intent: journeyIntent('I want to learn logistic regression') } }), null);
  assert.match(noTopic.prompt, /logistic regression/);
  const f = trayFor(journey({ intake: { slots: { goal: 'build' }, source: { goal: 'answered' } } }), null);
  assert.equal(f.slot, 'familiarity');
  assert.equal(f.free_text, false);
});

test('trayFor: busy and error', () => {
  const b = trayFor(journey({ pending: 'path' }), null);
  assert.ok(b.busy && typeof b.busy === 'string');
  assert.deepEqual(b.options, []);
  const e = trayFor(journey({ error: { op: 'path', message: 'Bad plan', retryable: true } }), null);
  assert.deepEqual(e.error, { message: 'Bad plan' });
  assert.deepEqual(e.options, [{ id: 'retry', label: 'Try again' }]);
});

test('trayFor: path_review', () => {
  const t = trayFor(journey({ state: 'path_review' }), { version: 1 });
  assert.equal(t.mode, 'path_preview');
  assert.deepEqual(t.options.map((o) => o.id), ['start', 'shorter', 'deeper', 'practical', 'mathematical']);
});

test('trayFor: diagnostic probe never leaks server keys', () => {
  const probe = { id: 'p1', kind: 'mcq', prompt: 'Which?', options: [{ id: 'a', label: 'A', correct: true, misconception_id: 'm1' }, { id: 'b', label: 'B' }] };
  const t = trayFor(journey({ state: 'diagnostic' }), null, { probe });
  assert.equal(t.mode, 'diagnostic_probe');
  assert.equal(t.probe_id, 'p1');
  assert.deepEqual(t.options.at(-1), { id: 'skip', label: 'Skip the assessment' });
  assert.equal(JSON.stringify(t).includes('correct'), false);
  assert.equal(JSON.stringify(t).includes('misconception'), false);
  assert.equal(trayFor(journey({ state: 'diagnostic' }), null), null);
});

test('trayFor: explain_back probe takes free text with skip as its only option', () => {
  const t = trayFor(journey({ state: 'diagnostic' }), null, { probe: { id: 'p2', kind: 'explain_back', prompt: 'Explain it back.' } });
  assert.equal(t.free_text, true);
  assert.deepEqual(t.options, [{ id: 'skip', label: 'Skip the assessment' }]);
});

test('trayFor: active', () => {
  assert.equal(trayFor(journey({ state: 'active' }), null), null);
  const t = trayFor(journey({ state: 'active' }), null, { resumed: true });
  assert.equal(t.mode, 'next_step');
  assert.deepEqual(t.options.map((o) => o.id), ['continue', 'recap', 'revisit']);
});

// ---- Part B: registry and path validators, journeyStep, the diagnostic walker, rail entries ----
const clone = (x) => structuredClone(x);
const fails = (r, re) => r.ok === false && r.errors.some((e) => re.test(e));

test('validateRegistry: concept cap, idea count and claim id format', () => {
  const many = clone(LR_REGISTRY);
  for (let i = 0; i < 8; i++) many.concepts[`extra-${i}`] = { label: `Extra ${i}`, names: [], prerequisites: [] };
  assert.equal(Object.keys(many.concepts).length, 17);
  assert.ok(fails(validateRegistry(many), /16 concepts/));
  const ideas = clone(LR_REGISTRY);
  ideas.claims['sigmoid/zero-score-is-one-half'].ideas = ['a', 'b', 'c', 'd', 'e'];
  assert.ok(fails(validateRegistry(ideas), /sigmoid\/zero-score-is-one-half.*ideas/));
  const bad = clone(LR_REGISTRY);
  bad.claims['Foo Bar'] = clone(bad.claims['sigmoid/zero-score-is-one-half']);
  assert.ok(fails(validateRegistry(bad), /claim Foo Bar: the id must be <concept-slug>\/<claim-slug>/));
  const prereq = clone(LR_REGISTRY);
  prereq.claims['sigmoid/zero-score-is-one-half'].prerequisites = ['calculus'];
  assert.ok(fails(validateRegistry(prereq), /prerequisites/));
});

test('validateRegistry: a claim with evidence cannot change or go; an unused claim may change', () => {
  const used = 'sigmoid/zero-score-is-one-half';
  const events = [{ seq: 1, concept: 'sigmoid', claim: used, result: 'pass', kind: 'attempted', settled: true, evaluator: 'deterministic', source: 'journey_probe', ref: 'p1' }];
  const edited = clone(LR_REGISTRY);
  edited.claims[used].statement = 'A score of zero sits in the middle.';
  assert.ok(fails(validateRegistry(edited, { prev: LR_REGISTRY, events }), /sigmoid\/zero-score-is-one-half/));
  const removed = clone(LR_REGISTRY);
  delete removed.claims[used];
  assert.ok(fails(validateRegistry(removed, { prev: LR_REGISTRY, events }), /sigmoid\/zero-score-is-one-half/));
  const unused = clone(LR_REGISTRY);
  unused.claims['sigmoid/squashes-score-to-probability'].drawn = 'the sigmoid curve for one spam score of 2';
  assert.deepEqual(validateRegistry(unused, { prev: LR_REGISTRY, events }), { ok: true });
  // The same claim with its keys in another order is unchanged.
  const reordered = clone(LR_REGISTRY);
  reordered.claims[used] = Object.fromEntries(Object.entries(reordered.claims[used]).reverse());
  assert.deepEqual(validateRegistry(reordered, { prev: LR_REGISTRY, events }), { ok: true });
});

// v2 of LR_PATH: sections 1-2 completed, section 3 current. next() is a valid following version, broken one invariant at a time.
const v2 = () => {
  const p = clone(LR_PATH);
  Object.assign(p, { version: 2, current_section_id: 'sigmoid', change: { source: 'learner_edit', reason: 'accepted', evidence_refs: [], sections_changed: [] } });
  p.sections.forEach((s, i) => {
    if (i < 2) Object.assign(s, { status: 'completed', generation_state: 'generated', heading_block_id: `h${i + 1}` });
    if (i === 2) Object.assign(s, { status: 'current', generation_state: 'planning' });
  });
  return p;
};
const next = (prev) => ({ ...clone(prev), version: prev.version + 1, change: { source: 'evidence', reason: 'test', evidence_refs: [3], sections_changed: [] } });

test('validatePath invariant 1: a completed section keeps its content and its order', () => {
  const prev = v2();
  assert.deepEqual(validatePath(next(prev), prev, LR_REGISTRY), { ok: true });
  const retitled = next(prev);
  retitled.sections[0].title = 'Classification first';
  assert.ok(fails(validatePath(retitled, prev, LR_REGISTRY), /invariant 1.*classification-vs-regression/));
  const swapped = next(prev);
  [swapped.sections[0], swapped.sections[1]] = [swapped.sections[1], swapped.sections[0]];
  assert.ok(fails(validatePath(swapped, prev, LR_REGISTRY), /invariant 1/));
});

test('validatePath invariant 2: at most one current section, and none before acceptance', () => {
  const prev = v2();
  const two = next(prev);
  two.sections[3].status = 'current';
  assert.ok(fails(validatePath(two, prev, LR_REGISTRY), /invariant 2/));
  const early = clone(LR_PATH);
  early.sections[0].status = 'current';
  assert.equal(early.current_section_id, null);
  assert.ok(fails(validatePath(early, null, LR_REGISTRY), /invariant 2/));
});

test('validatePath invariant 3: only the current or a completed section is generated', () => {
  const prev = v2();
  const ahead = next(prev);
  ahead.sections[4].generation_state = 'generated';
  assert.ok(fails(validatePath(ahead, prev, LR_REGISTRY), /invariant 3.*binary-cross-entropy/));
});

test('validatePath invariant 4: a section has no content fields', () => {
  for (const key of ['blocks', 'cards', 'steps']) {
    const p = clone(LR_PATH);
    p.sections[1][key] = [];
    assert.ok(fails(validatePath(p, null, LR_REGISTRY), new RegExp(`invariant 4.*\\b${key}\\b`)), key);
  }
});

test('validatePath invariant 5: every referenced concept and claim is in the registry', () => {
  const concept = clone(LR_PATH);
  concept.sections[2].target_concepts.push('neural-networks');
  assert.ok(fails(validatePath(concept, null, LR_REGISTRY), /invariant 5.*neural-networks/));
  const claim = clone(LR_PATH);
  claim.sections[2].expected_evidence[0].claim = 'sigmoid/is-a-step-function';
  assert.ok(fails(validatePath(claim, null, LR_REGISTRY), /invariant 5.*sigmoid\/is-a-step-function/));
});

test('validatePath invariant 6: the version goes up by exactly one and carries a change', () => {
  const prev = v2();
  const jump = next(prev);
  jump.version = 4;
  assert.ok(fails(validatePath(jump, prev, LR_REGISTRY), /invariant 6/));
  const bare = next(prev);
  delete bare.change;
  assert.ok(fails(validatePath(bare, prev, LR_REGISTRY), /invariant 6/));
  assert.ok(fails(validatePath({ ...clone(LR_PATH), version: 2 }, null, LR_REGISTRY), /invariant 6/));
});

test('validators return errors for malformed planner output instead of throwing', () => {
  for (const [key, value] of [['target_concepts', {}], ['target_concepts', 5], ['prerequisites', 7], ['expected_evidence', {}], ['expected_evidence', 5]]) {
    const p = clone(LR_PATH);
    p.sections[1][key] = value;
    assert.equal(validatePath(p, null, LR_REGISTRY).ok, false, `${key}: ${JSON.stringify(value)}`);
  }
  for (const r of [null, 'registry', 5, [], { concepts: [], claims: {} }]) assert.equal(validateRegistry(r).ok, false, JSON.stringify(r));
  const lists = clone(LR_REGISTRY);
  lists.claims['sigmoid/zero-score-is-one-half'].ideas = 'a score of 0 gives 0.5';
  lists.claims['sigmoid/squashes-score-to-probability'].misconceptions = { id: 'x', check: 'y' };
  assert.equal(validateRegistry(lists).ok, false);
  assert.deepEqual(validateRegistry(LR_REGISTRY, { prev: LR_REGISTRY, events: null }), { ok: true });
});

test('validatePath invariant 1: a completed section cannot be reopened or skipped', () => {
  const prev = v2();
  for (const status of ['upcoming', 'skipped']) {
    const reopened = next(prev);
    Object.assign(reopened.sections[0], { status, generation_state: 'not_generated' });
    assert.ok(fails(validatePath(reopened, prev, LR_REGISTRY), /invariant 1: completed section classification-vs-regression must stay completed/), status);
  }
});

test('validatePath invariant 2: current_section_id names a section of the path', () => {
  const prev = v2();
  const ghost = next(prev);
  ghost.current_section_id = 'no-such-section';
  Object.assign(ghost.sections[2], { status: 'upcoming', generation_state: 'not_generated' });
  assert.ok(fails(validatePath(ghost, prev, LR_REGISTRY), /invariant 2.*no-such-section/));
});

test('journeyStep refuses a stale path on accept and on a fast-start draft', () => {
  assert.ok(journeyStep(journey({ state: 'path_review', path_version: 2 }), { type: 'accept', path: LR_PATH }).error);
  const fast = journey({ state: 'path_review', pending: 'path', request: { topic: 'logistic regression', intent: 'fast_start' } });
  assert.ok(journeyStep(fast, { type: 'path_drafted', version: 1, path: { ...LR_PATH, version: 2 } }).error);
  assert.equal(journeyStep(fast, { type: 'path_drafted', version: 1, path: LR_PATH }).journey.state, 'active');
});

test('the valid 8-section fixture passes both validators', () => {
  assert.deepEqual(validateRegistry(LR_REGISTRY), { ok: true });
  assert.equal(LR_PATH.sections.length, 8);
  assert.deepEqual(validatePath(LR_PATH, null, LR_REGISTRY), { ok: true });
  assert.deepEqual(validatePath(v2(), LR_PATH, LR_REGISTRY), { ok: true });
});

test('journeyStep refuses illegal transitions', () => {
  assert.ok(journeyStep(journey(), { type: 'accept', path: LR_PATH }).error);
  assert.ok(journeyStep(journey(), { type: 'intake_answer', slot: 'depth', answer: { option_id: 'deep' } }).error, 'only the open question');
  assert.ok(journeyStep(journey({ state: 'path_review', path_version: 1 }), { type: 'section_planned' }).error, 'no section before acceptance');
  const active = journey({ state: 'active', path_version: 2, active_section_id: 'classification-vs-regression' });
  assert.ok(journeyStep(active, { type: 'section_materialized', section_id: 'sigmoid', heading_block_id: 'h3' }).error);
  const done = journeyStep(active, { type: 'section_materialized', section_id: 'classification-vs-regression', heading_block_id: 'h1' });
  assert.equal(done.error, undefined);
  assert.equal(done.journey.section_plan.heading_block_id, 'h1');
});

test('journeyStep: three answers move intake to diagnostic; a quick overview skips the diagnostic', () => {
  const start = journey();
  const before = JSON.stringify(start);
  let j = start, step;
  for (const [slot, option_id] of [['goal', 'build'], ['familiarity', 'seen'], ['depth', 'guided']]) {
    step = journeyStep(j, { type: 'intake_answer', slot, answer: { option_id } });
    if (slot !== 'depth') assert.deepEqual(step.effects, []);
    j = step.journey;
  }
  assert.equal(JSON.stringify(start), before, 'the input journey is never mutated');
  assert.equal(j.state, 'diagnostic');
  assert.equal(j.pending, 'diagnostic');
  assert.deepEqual(step.effects, ['plan_diagnostic']);
  assert.deepEqual(j.intake.slots, { goal: 'build', familiarity: 'seen', depth: 'guided', minutes: 30 });
  const quick = journeyIntent('Give me a 10-minute visual overview of logistic regression');
  const q = journeyStep(journey({ request: { topic: quick.topic, intent: quick }, intake: slotsFromIntent(quick) }),
    { type: 'intake_answer', slot: 'goal', answer: { option_id: 'intuition' } });
  assert.equal(q.journey.state, 'path_review');
  assert.equal(q.journey.pending, 'path');
  assert.deepEqual(q.effects, ['plan_path']);
});

test('journeyStep: probe results walk the diagnostic to the path; an edit before a path is kept', () => {
  const probes = ['p0', 'p1', 'p2'].map((id) => ({ id, kind: 'mcq', prompt: id, claims: [], purpose: 'diagnose', transfer: true }));
  const j = journeyStep(journey({ state: 'diagnostic', pending: 'diagnostic', diagnostic: { probes, asked: [] } }), { type: 'diagnostic_ready' }).journey;
  assert.equal(j.pending, null);
  assert.ok(journeyStep(j, { type: 'probe_result', probe_id: 'p0', result: 'pass' }).error, 'only the open probe');
  assert.ok(journeyStep(j, { type: 'probe_result', probe_id: 'p1', result: 'great' }).error, 'only a known result');
  const edit = journeyStep(j, { type: 'path_edit', text: '  Could we do Python first?  ' });
  assert.deepEqual(edit.journey.pending_edits, ['Could we do Python first?']);
  assert.deepEqual(edit.effects, []);
  const first = journeyStep(edit.journey, { type: 'probe_result', probe_id: 'p1', result: 'fail' });
  assert.deepEqual(first.effects, []);
  const last = journeyStep(first.journey, { type: 'probe_result', probe_id: 'p0', result: 'gap' });
  assert.equal(last.journey.state, 'path_review');
  assert.equal(last.journey.pending, 'path');
  assert.deepEqual(last.journey.diagnostic.asked, [{ probe_id: 'p1', result: 'fail' }, { probe_id: 'p0', result: 'gap' }]);
  assert.deepEqual(last.effects, ['plan_path']);
  const drafted = journeyStep(last.journey, { type: 'path_drafted', version: 1, path: LR_PATH });
  assert.equal(drafted.journey.state, 'path_review');
  assert.equal(drafted.journey.pending, null);
  assert.equal(drafted.journey.path_version, 1);
  assert.deepEqual(drafted.journey.pending_edits, []);
  const revise = journeyStep(drafted.journey, { type: 'path_edit', text: 'Make it shorter' });
  assert.equal(revise.journey.pending, 'revise');
  assert.deepEqual(revise.effects, ['revise_path']);
  assert.ok(journeyStep(revise.journey, { type: 'path_drafted', version: 3 }).error, 'the version goes up by one');
});

test('journeyStep: accept makes the first non-optional section current', () => {
  const path = clone(LR_PATH);
  path.sections[0].status = 'optional';
  const r = journeyStep(journey({ state: 'path_review', path_version: 1 }), { type: 'accept', path });
  assert.equal(r.journey.state, 'active');
  assert.equal(r.journey.active_section_id, 'score-to-probability');
  assert.equal(r.journey.pending, 'section');
  assert.deepEqual(r.effects, ['plan_section']);
  assert.equal(journeyStep(r.journey, { type: 'section_planned' }).journey.pending, null);
});

test('journeyStep: a planner failure keeps the answers, and retry re-issues the effect', () => {
  const intake = { slots: { goal: 'build', familiarity: 'seen', depth: 'guided', minutes: 30 }, source: { goal: 'answered', familiarity: 'answered', depth: 'answered', minutes: 'default' } };
  const j = journey({ state: 'diagnostic', pending: 'diagnostic', intake });
  const failed = journeyStep(j, { type: 'planner_failed', op: 'diagnostic', message: 'The planner returned invalid JSON.' });
  assert.equal(failed.journey.state, 'diagnostic');
  assert.deepEqual(failed.journey.intake, intake);
  assert.equal(failed.journey.error.retryable, true);
  assert.equal(failed.journey.pending, null);
  assert.deepEqual(failed.effects, []);
  assert.ok(journeyStep(failed.journey, { type: 'diagnostic_skip' }).error, 'only retry while the error stands');
  const retried = journeyStep(failed.journey, { type: 'retry' });
  assert.equal(retried.journey.error, null);
  assert.equal(retried.journey.pending, 'diagnostic');
  assert.deepEqual(retried.journey.intake, intake);
  assert.deepEqual(retried.effects, ['plan_diagnostic']);
});

test('journeyStep: fast_start fills the default slots, plans the path and auto-accepts it', () => {
  const j = journey({ request: { topic: 'logistic regression', intent: 'fast_start' }, intake: { slots: {}, source: {} } });
  const skipped = journeyStep(j, { type: 'intake_skip' });
  assert.deepEqual(skipped.effects, ['plan_path']);
  assert.equal(skipped.journey.pending, 'path');
  for (const slot of ['goal', 'familiarity', 'depth']) assert.equal(skipped.journey.intake.source[slot], 'default', slot);
  const drafted = journeyStep(skipped.journey, { type: 'path_drafted', version: 1, path: LR_PATH });
  assert.equal(drafted.journey.state, 'active');
  assert.equal(drafted.journey.active_section_id, 'classification-vs-regression');
  assert.deepEqual(drafted.effects, ['plan_section']);
  // The intent object the resolver returns works the same way.
  const it = journeyIntent('Teach me logistic regression, skip setup and just start');
  assert.deepEqual(journeyStep(journey({ request: { topic: it.topic, intent: it }, intake: slotsFromIntent(it) }), { type: 'intake_skip' }).effects, ['plan_path']);
});

test('nextProbe walks the ladder from the middle', () => {
  const probes = ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, kind: 'mcq', prompt: id, claims: [], purpose: 'diagnose', transfer: true }));
  const at = (...asked) => ({ probes, asked: asked.map(([probe_id, result]) => ({ probe_id, result })) });
  assert.equal(nextProbe(at()).id, 'p1');
  assert.equal(nextProbe(at(['p1', 'settled_transfer'])).id, 'p2');
  assert.equal(nextProbe(at(['p1', 'settled_transfer'], ['p2', 'settled_transfer'])), null, 'two up: done');
  assert.equal(nextProbe({ ...at(), skipped: true }), null);
  assert.equal(nextProbe(at(['p1', 'fail'])).id, 'p0');
  assert.equal(nextProbe(at(['p1', 'error'])).id, 'p0', 'an error moves to the nearest unasked probe');
  assert.equal(nextProbe(at(['p1', 'fail'], ['p0', 'pass'])).id, 'p2', 'up skips a probe already asked');
  assert.equal(nextProbe(at(['p1', 'fail'], ['p0', 'pass'], ['p2', 'pass'])), null, 'three asked');
  assert.equal(nextProbe(at(['p1', 'fail'], ['p0', 'fail'])), null, 'two down: done');
});

test('pathEntries: an inserted refresher is added, shifted sections are unchanged, completed stays completed', () => {
  const v1 = v2();
  const v = next(v1);
  v.sections.splice(3, 0, {
    id: 'probability-refresher', title: 'Probability and odds refresher', purpose: 'Read a probability and its odds before the boundary.', kind: 'refresher',
    target_concepts: ['probability'], prerequisites: [], expected_evidence: [{ claim: 'probability/odds-from-probability', kind: 'explain' }],
    depth: 'overview', status: 'upcoming', generation_state: 'not_generated', adaptation_reason: 'Probability interpretation looked uncertain.' });
  assert.deepEqual(validatePath(v, v1, LR_REGISTRY), { ok: true });
  const e = pathEntries(v, v1);
  assert.deepEqual(e.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(e[3], { id: 'probability-refresher', n: 4, title: 'Probability and odds refresher', purpose: 'Read a probability and its odds before the boundary.', status: 'upcoming', changed: 'added', heading_block_id: null });
  assert.deepEqual(e.filter((_, i) => i !== 3).map((x) => x.changed), Array(8).fill(null));
  assert.equal(e[0].status, 'completed');
  assert.equal(e[0].heading_block_id, 'h1');
  assert.ok(pathEntries(v).every((x) => x.changed === null), 'no previous version, nothing marked');
  const w = next(v);
  w.sections[5].title = 'Cross-entropy loss';
  w.sections.splice(4, 0, w.sections.pop());
  const f = pathEntries(w, v);
  assert.equal(f.find((x) => x.id === 'evaluate').changed, 'moved');
  assert.equal(f.find((x) => x.id === 'binary-cross-entropy').changed, 'changed');
  assert.equal(f.find((x) => x.id === 'sigmoid').changed, null);
});
