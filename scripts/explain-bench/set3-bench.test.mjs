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

test('review-batch-01 set (owner 2026-11-09): ten prompts plus three paraphrases each for positional encoding, k-means and the call stack, labelled with the REVIEW.md kinds; and the planner kind text carries the three data-shaped sentences in production and bench alike', async () => {
  const { cases, QUESTIONS: bench } = await import('./planner.mjs');
  const { QUESTIONS: prod } = await import('../../packages/control-plane/src/explanation-planner.js');
  const rows = cases().filter(c => c.set === 'review-batch-01');
  assert.equal(rows.length, 19);
  const want = { 'positional-encoding': 'coordinate-plot', 'k-means': 'coordinate-plot', 'call-stack': 'layers' };
  for (const [id, kind] of Object.entries(want)) {
    const group = rows.filter(r => r.id === id || r.id.startsWith(id + '-p'));
    assert.equal(group.length, 4, id);
    assert.ok(group.every(r => r.rightKinds.has(kind)), id);
  }
  assert.deepEqual(bench.kind.criteria, prod.kind.criteria, 'bench and production kind text are one text');
  assert.match(prod.kind.criteria.layers, /pushed and popped/);
  assert.match(prod.kind.criteria['coordinate-plot'], /periodic quantity over a position or time/);
  assert.match(prod.kind.criteria.transformation, /Never for a function, wave or encoding/);
});
