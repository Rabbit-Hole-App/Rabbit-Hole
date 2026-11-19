import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendOpening, askIntake, flowMessages, intakeMessage } from './rehearsal-flow.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const doc = {
  repo: 'karpathy/nanoGPT', hardware: 'cpu', summary: 'A small GPT training codebase.',
  routes: [
    { routeId: 'a', practical: true, recommended: true, title: 'Train a tiny model on CPU', effort: 'Quick — just Python', stepsSketch: [] },
    { routeId: 'b', practical: true, title: 'Time the training step', effort: 'Quick — just Python', stepsSketch: [] },
    { routeId: 'c', practical: false, title: 'Train the full model', effort: 'Heavy — needs a GPU', reason: 'Needs a GPU', stepsSketch: [] },
  ],
};
const base = { intakeDone: false, get: { indexing: 'ready', catalogue: { status: 'ready' } }, doc, use: null, goalChosen: false, elsewhere: false, log: [], routeId: null };

// Owner 2026-11-15: every option is a click, drawn with the one ChoiceList template; no dropdown. Intake v2: Run it or Learn from it first; the route list is Run it's second step.
test('the intake is one message with the options as rows (intake-once-spec.md); Run it (flag) leads them and its route list is the second step; no dropdown', () => {
  const learnDoc = { ...doc, learn: { options: [{ id: 'train', label: 'How training runs', what: 'w', anchors: [], kind: 'structure' }] } };
  const start = { ...base, doc: learnDoc, ...askIntake({ ...base, doc: learnDoc }, { run: true }) }, asked = { ...start, ...appendOpening(start, intakeMessage(learnDoc, { run: true })) };
  const out = flowMessages(asked, { repo: 'karpathy/nanoGPT', run: true });
  assert.deepEqual(out.map(m => m.key), ['intake']);
  assert.deepEqual(out[0].choices.map(c => [c.id, c.label, !!c.disabled]), [['mode:run', 'Run it', false], ['learn:train', 'How training runs', false]]);
  assert.equal(out.some(m => m.groups), false);
  const ui = read('TutorRehearsal.jsx');
  assert.doesNotMatch(ui, /Choose what to do|useMenuButton|data-rehearsal-intake/);
  assert.match(ui, /<ChoiceList items=\{m\.choices\}/);
  const run = flowMessages({ ...asked, mode: 'run', use: 'use_codebase' }, { repo: 'karpathy/nanoGPT', run: true });
  assert.deepEqual(run.at(-1).choices.map(c => c.id), ['route:a', 'route:b', 'else'], 'Run it: the route question, as before');
  assert.equal(flowMessages({ ...asked, mode: 'run', use: 'use_codebase' }, { repo: 'karpathy/nanoGPT', run: false }).some(m => m.key === 'route-question'), false, 'Run it off: no route list');
});

test('once an answer is given the question stays in the thread with its rows greyed, never asked a second time', () => {
  const learnDoc = { ...doc, learn: { options: [{ id: 'train', label: 'How training runs', what: 'w', anchors: [], kind: 'structure' }] } };
  const start = { ...base, doc: learnDoc, ...askIntake({ ...base, doc: learnDoc }, { run: true }) }, asked = { ...start, ...appendOpening(start, intakeMessage(learnDoc, { run: true })) };
  for (const state of [{ ...asked, mode: 'run', use: 'use_codebase', routeId: 'a' }, { ...asked, learn: learnDoc.learn.options[0] }, { ...asked, elsewhere: true }]) {
    const out = flowMessages(state, { repo: 'karpathy/nanoGPT', run: true });
    assert.ok(out.find(m => m.key === 'intake').choices.every(c => c.disabled), JSON.stringify(state));
  }
});

test('the template is shared: the catalogue, the route question, the goals and Explore next all draw ChoiceList rows', () => {
  assert.match(read('AnswerSuggestions.jsx'), /<ChoiceList heading="Explore next"/);
  const row = read('ChoiceList.jsx');
  assert.match(row, /export default function ChoiceList/);
  assert.match(row, /item\.star/);
});
