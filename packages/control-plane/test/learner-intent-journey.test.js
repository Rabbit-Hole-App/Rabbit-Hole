// The journey/interaction extension of the shared Learner Intent Resolver (src/learner-intent-journey.js, architecture R7,
// 6.1 and 7.2): request intent, and resolver rules 1-4 on a learner turn while a Tutor Prompt Tray is (or is not) open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { journeyIntent, journeyInterpretation, resolveTurnRules, interactionInterpretation } from '../src/learner-intent-journey.js';

test('import-free, and the resolver field names are the same functions', () => {
  const src = readFileSync(new URL('../src/learner-intent-journey.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\b/m.test(src), false);
  assert.equal(journeyInterpretation, journeyIntent);
  assert.equal(interactionInterpretation, resolveTurnRules);
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

test('journeyIntent: topic noise is stripped', () => {
  const cases = [
    ['Teach me how neural networks work', 'focused_skill', 'neural networks'],
    ['Teach me about transformers', 'learning_journey', 'transformers'],
    ['teach me the basics of attention', 'learning_journey', 'attention'],
    ['Show me how to build a transformer', 'focused_skill', 'transformer'],
    ['I want to learn how to code', 'learning_journey', 'code'],
  ];
  for (const [text, kind, topic] of cases) assert.deepEqual([journeyIntent(text).kind, journeyIntent(text).topic], [kind, topic], text);
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
  const plural = journeyIntent('Give me 10 minutes visual overview of logistic regression');
  assert.deepEqual([plural.kind, plural.constraints.minutes, plural.topic], ['quick_overview', 10, 'logistic regression']);
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

test('journeyIntent: a setup clause starts at a word', () => {
  for (const [text, topic] of [['Teach me piano setup', 'piano setup'], ['I want to learn casino setup', 'casino setup']]) {
    const i = journeyIntent(text);
    assert.deepEqual([i.kind, i.topic, i.skip_setup], ['learning_journey', topic, false], text);
  }
});

test('journeyIntent: Home negatives are never journeys', () => {
  assert.equal(journeyIntent('learn attention').kind, 'none');
  assert.ok(['direct_question', 'none'].includes(journeyIntent('how do I learn faster').kind));
});

const intakeTray = { mode: 'intent_intake', options: [{ id: 'build', label: 'Build it from scratch' }, { id: 'intuition', label: 'Understand the intuition' }] };
const previewTray = { mode: 'path_preview', options: [{ id: 'start', label: 'Start' }, { id: 'shorter', label: 'Make it shorter' }] };
const probeTray = { mode: 'diagnostic_probe', options: [{ id: 'skip', label: 'Skip the assessment' }] };

test('rule 1: exact labels and ordinals', () => {
  assert.deepEqual(resolveTurnRules('build it from scratch', intakeTray), { kind: 'tray_answer', option_id: 'build' });
  assert.equal(resolveTurnRules('the second one', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('option 1', intakeTray).option_id, 'build');
  assert.equal(resolveTurnRules('B', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('understand', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('do the first one', intakeTray).option_id, 'build');
  assert.equal(resolveTurnRules('do option 2', intakeTray).option_id, 'intuition');
  assert.equal(resolveTurnRules('option two please', intakeTray).option_id, 'intuition');
});

test('rule 1: out-of-range ordinal, ambiguous prefix and a one-option tray match nothing', () => {
  assert.equal(resolveTurnRules('the third one', intakeTray), null);
  assert.equal(resolveTurnRules('option 4', intakeTray), null);
  const twoUnderstand = { mode: 'intent_intake', options: [{ id: 'parts', label: 'Understand parts of it' }, { id: 'intuition', label: 'Understand the intuition' }] };
  assert.equal(resolveTurnRules('understand', twoUnderstand), null);
  // explain_back offers only skip: "a", "one" and "1" are not choices there.
  for (const t of ['a', 'one', '1']) assert.equal(resolveTurnRules(t, probeTray), null, t);
});

test('rule 2: accept words in path_preview', () => {
  for (const t of ['looks good', "let's go", 'go ahead', 'Start', 'yes please'])
    assert.deepEqual(resolveTurnRules(t, previewTray), { kind: 'tray_answer', option_id: 'start' }, t);
  assert.equal(resolveTurnRules('looks good', intakeTray), null);
});

test('rule 3: bare skip or cancel', () => {
  for (const t of ['Can we skip this?', 'skip', 'skip the assessment', 'never mind', 'not now'])
    for (const tray of [intakeTray, previewTray, probeTray])
      assert.deepEqual(resolveTurnRules(t, tray), { kind: 'cancel' }, t);
});

test('rule 3: probe phrases cancel', () => {
  const phrases = ['skip this question', 'skip these questions', 'skip the quiz', 'skip the diagnostic', 'skip assessment',
    'skip for now', 'skip the rest', 'skip that', 'move on', 'can we move on'];
  for (const t of phrases) assert.deepEqual(resolveTurnRules(t, probeTray), { kind: 'cancel' }, t);
});

test('rule 4: path edits', () => {
  for (const t of ['Could we do Python first?', 'Skip probability.', 'Move implementation earlier', 'Make this 20 minutes', 'Make it shorter', 'More practical', 'Add Python.', 'go deeper'])
    assert.deepEqual(resolveTurnRules(t, intakeTray), { kind: 'path_edit', edit: t }, t);
});

test('rule 4: a politeness prefix does not hide a non-object', () => {
  for (const t of ['can we drop this', 'please remove it', 'could we do it', 'can we remove the assessment'])
    assert.equal(resolveTurnRules(t, intakeTray), null, t);
});

test('rule 4: do in a question or a choice is not an edit', () => {
  for (const t of ['do I need calculus for this', 'do we need calculus', 'Do you have examples'])
    for (const tray of [intakeTray, null]) assert.equal(resolveTurnRules(t, tray), null, t);
  assert.equal(resolveTurnRules('do the first one', null), null);
});

test('no tray open: rule 4 only', () => {
  assert.equal(resolveTurnRules('skip', null), null);
  assert.equal(resolveTurnRules('never mind', null), null);
  assert.equal(resolveTurnRules('move on', null), null);
  assert.equal(resolveTurnRules('the second one', null), null);
  assert.equal(resolveTurnRules('looks good', null), null);
  assert.equal(resolveTurnRules('add python', null).kind, 'path_edit');
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
