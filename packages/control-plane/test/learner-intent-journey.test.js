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
      for (const mark of ['?', '…', '？', ' 🙂', '...'])
        assert.deepEqual(decision(resolveTurnRules(t + mark, tray)), decision(resolveTurnRules(t, tray)), t + mark);
});

test('punctuation never decides: any mark is a word break', () => {
  for (const t of ['(the second one)', 'option,2', 'the second one :)', 'Option 2 – please'])
    assert.equal(resolveTurnRules(t, intakeTray)?.option_id, 'intuition', t);
  for (const t of ['skip...this', 'never mind…', 'skip…', 'skip this？', 'skip 🙂'])
    assert.deepEqual(resolveTurnRules(t, probeTray), { kind: 'cancel' }, t);
  assert.equal(resolveTurnRules('looks good…', previewTray)?.option_id, 'start');
  assert.equal(journeyIntent('Teach me logistic regression — skip setup').topic, 'logistic regression');
  // A hyphen or dot inside a word is part of it.
  assert.equal(journeyIntent('Teach me node.js').topic, 'node.js');
  assert.equal(journeyIntent('Give me a 10–minute overview of transformers').constraints.minutes, 10);
});

// Trays as trayFor builds them: the goal question takes free text, an explain_back probe takes free text, an MCQ does not.
const goalTray = { mode: 'intent_intake', slot: 'goal', free_text: true, options: [{ id: 'intuition', label: 'Understand the intuition' },
  { id: 'build', label: 'Build it from scratch' }, { id: 'project', label: 'Use it in a project' },
  { id: 'exam', label: 'Prepare for an exam or interview' }, { id: 'other', label: 'Something else' }] };
const ebTray = { mode: 'diagnostic_probe', free_text: true, options: [{ id: 'skip', label: 'Skip the assessment' }] };
const mcqTray = { mode: 'diagnostic_probe', free_text: false, options: [{ id: 'a', label: 'Add more data' }, { id: 'b', label: 'Use a smaller model' },
  { id: 'c', label: 'Train for longer' }, { id: 'skip', label: 'Skip the assessment' }] };

test('rule 4: a bare deictic object is not a path element', () => {
  for (const t of ['add this', 'include it', 'move this', 'put it', 'add that'])
    for (const tray of [intakeTray, null]) assert.equal(resolveTurnRules(t, tray), null, t);
  assert.equal(resolveTurnRules('remove this section', intakeTray)?.kind, 'path_edit');
});

test('rule 4 never reads an answer: free text and probes go to rule 5', () => {
  for (const t of ['Skip connections let gradients flow back', 'More layers means more parameters', 'Less data means more overfitting',
    'Add the bias, then apply a sigmoid', 'Drop out randomly zeroes activations', 'Remove the mean and divide by the std'])
    assert.equal(resolveTurnRules(t, ebTray), null, t);
  for (const t of ['Do well on my exam', 'Put it in production at work', 'Include it in my thesis', 'Move into an ML engineering role', 'More confident in interviews'])
    assert.equal(resolveTurnRules(t, goalTray), null, t);
  assert.equal(resolveTurnRules('more data', mcqTray), null);
  assert.equal(resolveTurnRules('add more data', mcqTray)?.option_id, 'a');
});

test('rule 3: a skip or move-on with a next-step object cancels', () => {
  const phrases = ['skip it for now', 'skip this for now', 'can we skip this for now?', 'skip this part', 'skip this step', 'skip the test',
    'skip ahead', 'skip all of this', 'skip to the next step', 'move on to the next question', 'move on to the next section'];
  for (const t of phrases) {
    for (const tray of [mcqTray, ebTray, goalTray, previewTray]) assert.deepEqual(resolveTurnRules(t, tray), { kind: 'cancel' }, t);
    assert.equal(resolveTurnRules(t, null), null, t);
  }
});

test('rule 4: do edits only as an object then an order', () => {
  for (const t of ['Do those need calculus?', 'Do these sections build on each other?', 'Do people use this in practice?', 'do all sections need code', 'do it first', 'could we do this first'])
    for (const tray of [intakeTray, previewTray, null]) assert.equal(resolveTurnRules(t, tray), null, t);
  for (const t of ['do python before the maths', 'do attention later']) assert.equal(resolveTurnRules(t, previewTray)?.kind, 'path_edit', t);
});

test('journeyIntent: start a rabbit hole is a learning journey', () => {
  for (const [text, topic] of [['Start a Rabbit Hole about attention', 'attention'], ['start a rabbit hole on softmax', 'softmax']])
    assert.deepEqual([journeyIntent(text).kind, journeyIntent(text).topic], ['learning_journey', topic], text);
});

test('journeyIntent: a setup clause on either side keeps the topic', () => {
  const cases = [
    ['Skip the setup, teach me transformers', 'transformers'],
    ['Skip setup and teach me logistic regression', 'logistic regression'],
    ["Don't ask me any questions, teach me transformers", 'transformers'],
    ['Teach me logistic regression with no setup questions', 'logistic regression'],
    ['Teach me transformers and skip the questions', 'transformers'],
    ['Teach me transformers, just start', 'transformers'],
    ['Teach me transformers, no questions, just start', 'transformers'],
    ['Just start, skip setup', null],
  ];
  for (const [text, topic] of cases) {
    const i = journeyIntent(text);
    assert.deepEqual([i.kind, i.topic, i.skip_setup], ['fast_start', topic, true], text);
  }
  const inside = journeyIntent('I want to learn the no setup method');
  assert.deepEqual([inside.kind, inside.topic, inside.skip_setup], ['learning_journey', 'no setup method', false]);
  // "Just start" alone names no topic and no setup: never a topicless journey.
  assert.equal(journeyIntent('Just start').kind, 'none');
});

test('journeyIntent: a setup clause inside a question is not a fast start', () => {
  for (const t of ['What happens if I skip setup?', 'Why does Docker need no setup?', 'How do I run it with no setup'])
    assert.equal(journeyIntent(t).kind, 'direct_question', t);
  assert.equal(journeyIntent('learn attention, skip setup').kind, 'none');
  const s = journeyIntent('Can we skip setup and just start?');
  assert.deepEqual([s.kind, s.topic, s.skip_setup], ['fast_start', null, true]);
});

test('journeyIntent: filler, greetings and politeness are not the topic', () => {
  const cases = [
    ['Teach me logistic regression please', 'logistic regression'],
    ['Teach me transformers, thanks!', 'transformers'],
    ['I want to learn, um, logistic regression', 'logistic regression'],
    ['teach me uh transformers', 'transformers'],
    ['teach me transformers you know', 'transformers'],
    ['I want to learn more about transformers', 'transformers'],
    ['Teach me all about transformers', 'transformers'],
    ['I want to learn like logistic regression', 'logistic regression'],
    ['Teach me logistic regression from scratch please', 'logistic regression'],
    ['um I want to learn logistic regression', 'logistic regression'],
    ['So, um, teach me transformers', 'transformers'],
    ['Okay so I want to learn logistic regression', 'logistic regression'],
    ['Hey, teach me transformers', 'transformers'],
    ['Hi! I want to learn logistic regression', 'logistic regression'],
  ];
  for (const [text, topic] of cases) assert.deepEqual([journeyIntent(text).kind, journeyIntent(text).topic], ['learning_journey', topic], text);
  const timed = journeyIntent('Teach me transformers in 10 minutes');
  assert.deepEqual([timed.kind, timed.topic, timed.constraints], ['learning_journey', 'transformers', { minutes: 10 }]);
});

test('journeyIntent: a deictic topic is no journey', () => {
  for (const t of ['Teach me this', 'I want to understand this', 'I want to understand this better', 'I need to learn this stuff'])
    assert.equal(journeyIntent(t).kind, 'none', t);
});

const JOURNEY_KINDS = ['learning_journey', 'focused_skill', 'quick_overview', 'fast_start'];
const kts = (t) => { const i = journeyIntent(t); return [i.kind, i.topic, i.skip_setup]; };

test('journeyIntent: a request with a skip clause beside it is a fast start, whatever follows', () => {
  const cases = [
    ['Teach me transformers, skip the setup questions', 'transformers'],
    ['Teach me transformers, skip the setup for now', 'transformers'],
    ['I want to learn X but skip the setup questions', 'x'],
    ['Skip the setup questions and teach me transformers', 'transformers'],
    ['Skip setup, just teach me transformers', 'transformers'],
    ['Skip setup and start teaching me transformers', 'transformers'],
    ['Teach me transformers and skip the setup questions', 'transformers'],
    ['Teach me transformers, skip setup, I already know the basics', 'transformers'],
    ['I want to learn React, skip setup, I know JavaScript', 'react'],
    ['Teach me transformers, don’t ask me questions, I know the basics', 'transformers'],
    ['Teach me transformers—skip setup', 'transformers'],
    ['Skip setup—teach me transformers', 'transformers'],
  ];
  for (const [text, topic] of cases) assert.deepEqual(kts(text), ['fast_start', topic, true], text);
  assert.deepEqual(kts('Skip the setup questions'), ['fast_start', null, true]);
  // The protected cases stay as they were.
  assert.deepEqual(kts('I want to learn how to skip setup steps in Docker'), ['learning_journey', 'skip setup steps in docker', false]);
  assert.equal(journeyIntent('I want to learn the').topic, null);
});

test('journeyIntent: only a clause that names setup stands alone', () => {
  for (const t of ['No questions', 'No questions, thanks', 'Thanks, no questions', 'Okay, no questions', 'no questions please',
    'Skip the questions', "Don't ask questions", 'dont ask any questions', 'Just start then', 'Okay just start then', 'Lets just start then'])
    assert.equal(journeyIntent(t).kind, 'none', t);
  assert.equal(journeyIntent('Can you skip the questions?').kind, 'direct_question');
  for (const t of ['Skip setup and start', 'Just start, skip setup', 'Can we skip setup and just start?', "Don't ask me setup questions, just start",
    'Teach me transformers, no questions, just start'])
    assert.equal(journeyIntent(t).kind, 'fast_start', t);
});

test('journeyIntent: symbols inside a topic are part of it', () => {
  const cases = [
    ['Teach me C++', 'c++'], ['Teach me C#', 'c#'], ['I want to learn C#', 'c#'], ['Teach me F#', 'f#'],
    ['teach me c++ templates', 'c++ templates'], ['Teach me A/B testing', 'a/b testing'], ['Teach me the A* algorithm', 'a* algorithm'],
    ['I want to learn C/C++', 'c/c++'], ['Teach me what a transformer looks like', 'what a transformer looks like'],
  ];
  for (const [text, topic] of cases) assert.deepEqual([journeyIntent(text).kind, journeyIntent(text).topic], ['learning_journey', topic], text);
  assert.equal(journeyIntent('Teach me how C++ works').topic, 'c++');
  assert.equal(journeyIntent('Teach me transformers + attention').topic, 'transformers attention');
  // A mark that does not follow a word is still a break.
  for (const t of ['#2', 'option #2']) assert.equal(resolveTurnRules(t, intakeTray)?.option_id, 'intuition', t);
  assert.deepEqual(resolveTurnRules('skip ***', probeTray), { kind: 'cancel' });
  // A star stays only after a one-letter word (A*): markdown emphasis is still a break.
  assert.deepEqual(resolveTurnRules('*skip*', probeTray), { kind: 'cancel' });
});

test('journeyIntent: a deictic or contentless topic is no journey', () => {
  for (const t of ['I want to understand how this works', 'I want to understand what this means', 'I want to understand this concept',
    'I want to understand this diagram', 'I want to understand why this happens', 'Walk me through how this works', 'I want to understand it all',
    'I want to learn more', 'I need to learn more', 'Teach me something new', 'Walk me through this diagram', 'Teach me this concept',
    'I want to understand this equation', 'walk me through this code', 'I want to understand why this works', 'I want to understand this chart better',
    'Teach me how it works', 'I want to understand how it works', 'Teach me that'])
    assert.equal(journeyIntent(t).kind, 'none', t);
  for (const [text, topic] of [['Teach me models that generate images', 'models that generate images'], ['Teach me models that scale', 'models that scale'],
    ['Teach me IT security', 'it security'], ['I want to learn algorithms that sort lists', 'algorithms that sort lists']])
    assert.deepEqual([journeyIntent(text).kind, journeyIntent(text).topic], ['learning_journey', topic], text);
  assert.ok(JOURNEY_KINDS.includes(journeyIntent('Teach me more about transformers').kind));
});

test('rule 3 vs 4: skip the next X names a path element, skip to the next X moves on', () => {
  for (const t of ['skip the next section', 'Skip the next section please', 'skip the next step', 'skip the next one']) {
    for (const tray of [previewTray, null]) assert.deepEqual(resolveTurnRules(t, tray), { kind: 'path_edit', edit: t }, t);
    assert.equal(resolveTurnRules(t, probeTray), null, t);
  }
  for (const t of ['skip to the next step', 'move on to the next question', 'move on to the next section'])
    assert.deepEqual(resolveTurnRules(t, previewTray), { kind: 'cancel' }, t);
});
