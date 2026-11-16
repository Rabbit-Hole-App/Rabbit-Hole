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

// Owner 2026-11-15: every option is a click, drawn with the one ChoiceList template; no dropdown and no separate question.
test('the ways are clickable rows under the heading, then what is out of reach; no "Choose what to do" dropdown, no intake question', () => {
  const out = flowMessages(base, { repo: 'karpathy/nanoGPT' });
  assert.deepEqual(out.map(m => m.key), ['catalogue', 'catalogue-rest']);
  assert.deepEqual(out[0].choices.map(c => [c.id, c.disabled]), [['route:a', false], ['route:b', false], ['else', false]]);
  assert.equal(out.some(m => m.groups), false);
  const ui = read('TutorRehearsal.jsx');
  assert.doesNotMatch(ui, /Choose what to do|useMenuButton|data-rehearsal-intake/);
  assert.match(ui, /<ChoiceList items=\{m\.choices\}/);
});

test('once a way is chosen (or the canvas answered before) the rows stay but are greyed, so the list is never asked twice', () => {
  for (const state of [{ ...base, use: 'use_codebase', routeId: 'a' }, { ...base, intakeDone: true }, { ...base, elsewhere: true }]) {
    const out = flowMessages(state, { repo: 'karpathy/nanoGPT' });
    assert.ok(out[0].choices.every(c => c.disabled), JSON.stringify(state));
  }
});

test('the template is shared: the catalogue, the route question, the goals and Explore next all draw ChoiceList rows', () => {
  assert.match(read('AnswerSuggestions.jsx'), /<ChoiceList heading="Explore next"/);
  const row = read('ChoiceList.jsx');
  assert.match(row, /export default function ChoiceList/);
  assert.match(row, /item\.star/);
});
