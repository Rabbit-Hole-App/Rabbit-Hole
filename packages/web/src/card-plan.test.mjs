import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVE_STEM, boundaryFlags, planProblems, unreviewedFlags } from './card-plan.js';

const plan = (over = {}) => ({
  concept: 'sampling',
  objective: `${OBJECTIVE_STEM}how temperature changes a probability distribution.`,
  prerequisites: ['softmax'],
  causalSteps: ['logits', 'divide by T', 'softmax', 'draw'],
  primaryInteraction: 'the temperature slider; the spread of the bars changes while their order does not',
  check: 'none: the relationship is read off the bars',
  boundary: { decision: 'staged', reason: 'one causal pipeline, revealed step by step' },
  ...over,
});

test('a complete plan has no problems', () => {
  assert.deepEqual(planProblems(plan()), []);
});

test('the objective completes the stem in one sentence', () => {
  assert.ok(planProblems(plan({ objective: 'Temperature.' })).some(p => p.includes('completes')));
  assert.ok(planProblems(plan({ objective: `${OBJECTIVE_STEM}softmax. Then top-k.` })).some(p => p.includes('one sentence')));
});

test('staged needs two steps; a sequence documents its path without next-links', () => {
  assert.ok(planProblems(plan({ causalSteps: ['one'] })).some(p => p.includes('staged')));
  const sequence = plan({ boundary: { decision: 'sequence', reason: 'two mental models', sequence: { name: 'Embeddings', position: 1, of: 2, relationships: [{ type: 'prerequisite', card: 'c09' }] } } });
  assert.deepEqual(planProblems(sequence), []);
  const bad = plan({ boundary: { decision: 'sequence', reason: 'x', sequence: { name: 'E', position: 3, of: 2, relationships: [{ type: 'next', card: 'c09' }] } } });
  assert.equal(planProblems(bad).length, 2);
  assert.ok(planProblems(plan({ boundary: { decision: 'split', reason: 'x' } })).some(p => p.includes('boundary.decision')));
});

test('flags are review triggers read off the scene, and density alone raises none', () => {
  const dense = { title: 'Trace the tensors through GPT.forward', height: 880, inputs: [{ name: 'a' }, { name: 'b' }] };
  assert.deepEqual(boundaryFlags({ scene: dense, plan: plan(), visibleText: ['x', 'y'] }), []);
  const busy = { title: 'Cross-entropy and early stopping', height: 1100, inputs: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
  const flags = boundaryFlags({ scene: busy, plan: plan({ objective: `${OBJECTIVE_STEM}cross-entropy, and early stopping.` }), visibleText: ['Now, separately, the optimizer.'] });
  assert.deepEqual(flags, ['title-and', 'objective-two-clauses', 'many-controls', 'tall-default', 'separately-language']);
  // A depth card's concept label ("Training and loss · Guided: …") is not its own title.
  assert.deepEqual(boundaryFlags({ scene: { title: 'Training and loss · Guided: loss is surprise', height: 600 }, plan: plan() }), []);
  // Hidden inputs are not controls.
  assert.deepEqual(boundaryFlags({ scene: { title: 't', height: 600, inputs: [{ name: 'a' }, { name: 'b' }, { name: 'c', hidden: true }] }, plan: plan() }), []);
});

test('a flag is cleared only by an acknowledged reason', () => {
  const reviewed = plan({ boundary: { decision: 'single', reason: 'r', reviewed: { 'tall-default': 'one causal pipeline; the consequence sits in the first screen' } } });
  assert.deepEqual(unreviewedFlags(['tall-default', 'title-and'], reviewed), ['title-and']);
  assert.deepEqual(unreviewedFlags(['tall-default'], plan({ boundary: { decision: 'single', reason: 'r', reviewed: { 'tall-default': ' ' } } })), ['tall-default']);
});
