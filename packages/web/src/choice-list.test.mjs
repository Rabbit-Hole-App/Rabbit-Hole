import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flowMessages } from './rehearsal-flow.js';

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
test('the intake is two rows, Run it and Learn from it; the route list is not drawn until Run it, and no "Choose what to do" dropdown', () => {
  const out = flowMessages(base, { repo: 'karpathy/nanoGPT' });
  assert.deepEqual(out.map(m => m.key), ['catalogue', 'catalogue-rest', 'intake']);
  assert.deepEqual(out[2].choices.map(c => [c.id, c.label, c.disabled]), [['mode:run', 'Run it', false], ['mode:learn', 'Learn from it', false]]);
  assert.equal(out.some(m => m.groups), false);
  const ui = read('TutorRehearsal.jsx');
  assert.doesNotMatch(ui, /Choose what to do|useMenuButton|data-rehearsal-intake/);
  assert.match(ui, /<ChoiceList items=\{m\.choices\}/);
  const run = flowMessages({ ...base, mode: 'run', use: 'use_codebase' }, { repo: 'karpathy/nanoGPT' });
  assert.deepEqual(run.at(-1).choices.map(c => c.id), ['route:a', 'route:b', 'else'], 'Run it: the route question, as before');
});

test('once an answer is given (or the canvas answered before) the two rows stay but are greyed, so the question is never asked twice', () => {
  for (const state of [{ ...base, mode: 'run', use: 'use_codebase', routeId: 'a' }, { ...base, mode: 'learn' }, { ...base, intakeDone: true }, { ...base, elsewhere: true }]) {
    const out = flowMessages(state, { repo: 'karpathy/nanoGPT' });
    assert.ok(out.find(m => m.key === 'intake').choices.every(c => c.disabled), JSON.stringify(state));
  }
});

test('the template is shared: the catalogue, the route question, the goals and Explore next all draw ChoiceList rows', () => {
  assert.match(read('AnswerSuggestions.jsx'), /<ChoiceList heading="Explore next"/);
  const row = read('ChoiceList.jsx');
  assert.match(row, /export default function ChoiceList/);
  assert.match(row, /item\.star/);
});
