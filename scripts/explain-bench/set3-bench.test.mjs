import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePlannerReplay, validateParaphraseSet } from './set3-bench.mjs';

const original = {
  name: 'correct-svg',
  prompts: [{
    id: 'demo', prompt: 'How do a client and server start a connection?',
    depths: { overview: { kinds: ['sequence'], acceptableKinds: ['flow'] } },
  }],
};
const paraphrases = {
  name: original.name,
  prompts: [
    'What do the client and server send to get connected?',
    'How do those two computers agree to start talking?',
    'Can you walk me through how the connection starts?',
    'What happens before the client can send the server any data?',
    'How does the server know that the client is ready to talk?',
  ].map((prompt, i) => ({ ...original.prompts[0], id: `demo-p${i + 1}`, sourceId: 'demo', prompt })),
};

test('paraphrases preserve the parent labels and five distinct phrasings', () => {
  assert.doesNotThrow(() => validateParaphraseSet(original, paraphrases));
  const changed = structuredClone(paraphrases);
  changed.prompts[0].depths.overview.kinds = ['tree'];
  assert.throws(() => validateParaphraseSet(original, changed), /labels/i);
  const repeated = structuredClone(paraphrases);
  repeated.prompts[1].prompt = paraphrases.prompts[0].prompt.toUpperCase() + '!';
  assert.throws(() => validateParaphraseSet(original, repeated), /distinct/i);
  assert.throws(() => validateParaphraseSet(original, { ...paraphrases, prompts: paraphrases.prompts.slice(0, -1) }), /five/i);
});

const cases = [
  { set: 'correct-svg', id: 'demo', depth: 'overview', prompt: original.prompts[0].prompt, rightKinds: new Set(['sequence']) },
  { set: 'correct-svg', id: 'demo', depth: 'standard', prompt: original.prompts[0].prompt, rightKinds: new Set(['sequence']) },
  { set: 'aiml', id: 'demo', depth: 'standard', prompt: 'How does that classifier work?', rightKinds: new Set(['tree']) },
];
const scoring = {
  planOf: answers => ({ kinds: [answers.kind.choice] }),
  summarize: rows => rows.filter(r => r.answers).map(r => r.rightKinds.has(r.plan.kinds[0])),
};
const saved = [
  { ...cases[0], answers: { kind: { choice: 'sequence' } }, plan: { kinds: ['tree'] }, rightKinds: [] },
  { ...cases[1], error: 'deadline' },
];

test('planner replay scores captured answers against canonical labels and reports missing cases', () => {
  const replay = scorePlannerReplay(cases, saved, scoring);
  assert.deepEqual(replay, { cases: 3, answered: 1, errors: 1, missing: 1, summary: [true] });
});

test('planner replay rejects duplicate and mismatched captured cases', () => {
  assert.throws(() => scorePlannerReplay(cases, [...saved, saved[0]], scoring), /duplicate/i);
  assert.throws(() => scorePlannerReplay(cases, [{ ...saved[0], prompt: 'Something else' }], scoring), /prompt/i);
  assert.throws(() => scorePlannerReplay(cases, [{ ...saved[0], depth: 'deep' }], scoring), /unknown/i);
});

test('the illustrations set carries the seven Codex reference prompts, labelled with the kind each reference teaches', async () => {
  const { loadSet, SET_NAMES } = await import('./score.mjs');
  const { illustrationReferences } = await import('../../packages/web/src/tutor-diagrams/reference-library.js');
  assert.ok(SET_NAMES.includes('illustrations'));
  const set = loadSet('illustrations');
  assert.equal(set.prompts.length, 17); // the seven references, the overfitting and cross-validation prompts, and the eight Codex walkthrough prompts (steps 1, 3, 4, 5, 6, 8, 9, 10; steps 2 and 7 are the qkv and encoder entries)
  for (const id of ['ml-transformer-token-embeddings', 'ml-transformer-weighted-values']) assert.deepEqual(set.prompts.find(x => x.id === id).depths.standard.kinds, ['block-stack'], id);
  assert.deepEqual(set.prompts.find(x => x.id === 'ml-transformer-vocabulary-softmax').depths.standard.kinds, ['bar-chart']);
  for (const ref of illustrationReferences) {
    const p = set.prompts.find(x => x.id === ref.id);
    assert.ok(p, ref.id);
    assert.equal(p.prompt, ref.prompts[0]);
    assert.ok(p.depths.standard.kinds.includes(ref.spec.diagram.kind), `${ref.id}: expected kind ${ref.spec.diagram.kind}`);
    assert.match(p.depths.standard.sketch[0], /^Core: /);
  }
});

test('minSeries (owner 2026-11-08, overfitting card): a one-series coordinate-plot is wrong, a three-series plot is scored on its mix', async () => {
  const { loadSet, scoreCard } = await import('./score.mjs');
  const p = loadSet('illustrations').prompts.find(x => x.id === 'overfitting'), pt = (x, y) => ({ x, y });
  const card = series => ({ delivered: true, set: 'illustrations', run: 1, depth: 'standard', block: { title: 'T', body: 'Before.' + String.fromCharCode(10, 10) + '```rh-diagram' + String.fromCharCode(10) + JSON.stringify({ version: 1, diagram: { kind: 'coordinate-plot', title: 'Fits', x: { label: 'x', min: 0, max: 4 }, y: { label: 'y', min: 0, max: 10 }, series } }) + String.fromCharCode(10) + '```' + String.fromCharCode(10, 10) + 'After.', interactions: {} } });
  const one = [{ label: 'Fit', kind: 'line', points: [pt(0, 1), pt(1, 2), pt(2, 5)] }];
  const three = [{ label: 'Observed', kind: 'scatter', points: [pt(0, 1), pt(1, 2), pt(2, 5)] }, ...one, { label: 'Overfit', kind: 'line', points: [pt(0, 1), pt(1, 4), pt(2, 5)] }];
  assert.equal(scoreCard(p, card(one)).score, 'wrong');
  assert.notEqual(scoreCard(p, card(three)).score, 'wrong');
});

test('illustrations set: cross-validation is labelled one grouped bar-chart (categorical x), a coordinate-plot is wrong, five paraphrases for the offline planner check', async () => {
  const { loadSet } = await import('./score.mjs');
  const p = loadSet('illustrations').prompts.find(x => x.id === 'cross-validation');
  assert.equal(p.prompt, 'how does cross-validation detect overfitting?');
  assert.deepEqual(p.depths.standard.kinds, ['bar-chart']);
  assert.ok(p.badKinds.includes('coordinate-plot') && !p.depths.standard.acceptableKinds.includes('coordinate-plot'));
  assert.match(p.want, /grouped bar-chart/);
  assert.equal(p.paraphrases.length, 5);
});
