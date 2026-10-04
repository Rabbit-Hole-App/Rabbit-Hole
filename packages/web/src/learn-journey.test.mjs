import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOURNEY_STATES, TRAY_MODES, INTAKE_SLOTS, journeyIntent, slotsFromIntent, nextIntakeQuestion,
  applyIntakeAnswer, resolveTurnRules, trayFor,
} from './learn-journey.js';

test('exports the locked state and mode lists', () => {
  assert.deepEqual(JOURNEY_STATES, ['intake', 'diagnostic', 'path_review', 'active', 'paused', 'completed']);
  assert.equal(TRAY_MODES.length, 8);
  assert.deepEqual(INTAKE_SLOTS.map((s) => s.slot), ['goal', 'familiarity', 'depth']);
});

test('journeyIntent: broad phrasings are learning journeys', () => {
  const cases = [
    ['I want to learn logistic regression', 'logistic regression'],
    ['Teach me transformers', 'transformers'],
    ['Walk me through computer vision', 'computer vision'],
    ['I want to understand reinforcement learning', 'reinforcement learning'],
    ['I need to learn attention from scratch', 'attention'],
  ];
  for (const [text, topic] of cases) {
    const i = journeyIntent(text);
    assert.equal(i.kind, 'learning_journey', text);
    assert.equal(i.topic, topic, text);
    assert.equal(i.skip_setup, false);
  }
});

test('journeyIntent: focused skill', () => {
  const a = journeyIntent('Show me how to build logistic regression from scratch');
  assert.equal(a.kind, 'focused_skill');
  assert.equal(a.topic, 'logistic regression');
  const b = journeyIntent('Teach me how backprop works');
  assert.equal(b.kind, 'focused_skill');
  assert.equal(b.topic, 'backprop');
});

test('journeyIntent: direct question', () => {
  assert.equal(journeyIntent('What is logistic regression?').kind, 'direct_question');
});

test('journeyIntent: quick overview', () => {
  const i = journeyIntent('Give me a 10-minute visual overview of logistic regression');
  assert.equal(i.kind, 'quick_overview');
  assert.equal(i.constraints.minutes, 10);
  assert.equal(i.constraints.style, 'visual');
  assert.equal(i.topic, 'logistic regression');
  assert.equal(journeyIntent('Just give me a 5-minute visual overview of logistic regression').constraints.minutes, 5);
});

test('journeyIntent: fast start', () => {
  const a = journeyIntent('Skip setup and start');
  assert.equal(a.kind, 'fast_start');
  assert.equal(a.skip_setup, true);
  assert.equal(a.topic, null);
  const b = journeyIntent('Teach me logistic regression, skip setup and just start');
  assert.equal(b.kind, 'fast_start');
  assert.equal(b.topic, 'logistic regression');
  assert.equal(journeyIntent("Don't ask me setup questions, just start").kind, 'fast_start');
});

test('journeyIntent: Home negatives are never journeys', () => {
  assert.equal(journeyIntent('learn attention').kind, 'none');
  assert.ok(['direct_question', 'none'].includes(journeyIntent('how do I learn faster').kind));
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

test('fast start fills every slot with defaults', () => {
  const intent = journeyIntent('Skip setup and start');
  const intake = slotsFromIntent(intent);
  assert.equal(nextIntakeQuestion(intake, intent), null);
  assert.equal(intake.source.goal, 'default');
});

const intakeTray = { mode: 'intent_intake', options: [{ id: 'build', label: 'Build it from scratch' }, { id: 'intuition', label: 'Understand the intuition' }] };
const previewTray = { mode: 'path_preview', options: [{ id: 'start', label: 'Start' }, { id: 'shorter', label: 'Make it shorter' }] };

test('rule 1: exact labels and ordinals', () => {
  assert.deepEqual(resolveTurnRules('build it from scratch', intakeTray), { kind: 'tray_answer', option_id: 'build' });
  assert.equal(resolveTurnRules('the second one', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('option 1', intakeTray).option_id, 'build');
  assert.equal(resolveTurnRules('B', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('understand', intakeTray).option_id, 'intuition');
});

test('rule 2: accept words in path_preview', () => {
  for (const t of ['looks good', "let's go", 'go ahead', 'Start'])
    assert.deepEqual(resolveTurnRules(t, previewTray), { kind: 'tray_answer', option_id: 'start' }, t);
  assert.equal(resolveTurnRules('looks good', intakeTray), null);
});

test('rule 3: bare skip or cancel', () => {
  const probeTray = { mode: 'diagnostic_probe', options: [{ id: 'skip', label: 'Skip the assessment' }] };
  for (const t of ['Can we skip this?', 'skip', 'skip the assessment', 'never mind', 'not now'])
    for (const tray of [intakeTray, previewTray, probeTray])
      assert.deepEqual(resolveTurnRules(t, tray), { kind: 'cancel' }, t);
});

test('rule 4: path edits', () => {
  for (const t of ['Could we do Python first?', 'Skip probability.', 'Move implementation earlier', 'Make this 20 minutes', 'Make it shorter', 'More practical', 'Add Python.', 'go deeper'])
    assert.deepEqual(resolveTurnRules(t, intakeTray), { kind: 'path_edit', edit: t }, t);
});

test('no rule matched goes to rule 5', () => {
  assert.equal(resolveTurnRules('Why is this section here?', previewTray), null);
});

const decision = (r) => r && { kind: r.kind, option_id: r.option_id };
test('punctuation never decides', () => {
  for (const t of ['skip this', 'could we do python first', 'why is this section here', 'build it from scratch', 'looks good', 'add python'])
    for (const tray of [intakeTray, previewTray])
      // path_edit carries the original text, so compare the decision, not the echoed edit.
      assert.deepEqual(decision(resolveTurnRules(t + '?', tray)), decision(resolveTurnRules(t, tray)), t);
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

test('trayFor: active', () => {
  assert.equal(trayFor(journey({ state: 'active' }), null), null);
  const t = trayFor(journey({ state: 'active' }), null, { resumed: true });
  assert.equal(t.mode, 'next_step');
  assert.deepEqual(t.options.map((o) => o.id), ['continue', 'recap', 'revisit']);
});
