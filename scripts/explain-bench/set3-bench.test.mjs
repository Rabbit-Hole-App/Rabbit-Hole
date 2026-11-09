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
