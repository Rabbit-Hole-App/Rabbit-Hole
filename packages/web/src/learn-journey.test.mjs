import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lj from './learn-journey.js';
// Intent is the shared resolver's extension (R7); its own tests are control-plane/test/learner-intent-journey.test.js.
import { journeyIntent } from '../../control-plane/src/learner-intent-journey.js';

const { JOURNEY_STATES, TRAY_MODES, INTAKE_SLOTS, slotsFromIntent, nextIntakeQuestion, applyIntakeAnswer, trayFor } = lj;

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
