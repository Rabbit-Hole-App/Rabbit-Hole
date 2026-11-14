import test from 'node:test';
import assert from 'node:assert/strict';
import { runParaphraseReplay } from '../checks/paraphrase-replay.mjs';

const prompt = {
  id: 1, prompt: 'how does a tree choose a split?', referenceId: 'ml-trees-split',
  paraphrases: ['choose a split', 'find a split', 'tree threshold', 'compare splits', 'divide the rows'],
};

test('uses coverage selection with an explicit planner for exactly five supplied paraphrases at all depths', async () => {
  const calls = [], plannerCalls = [];
  const planner = async (text, depth) => {
    plannerCalls.push({ text, depth });
    return { kind: 'coordinate-plot' };
  };
  const selectAtDepth = async options => {
    calls.push(options);
    const plan = await options.planner(options.prompt, options.depth);
    return {
      references: [{ id: options.prompt === prompt.paraphrases[4] ? 'shape-coordinate-plot' : prompt.referenceId }],
      plannedKinds: [plan.kind], requiredKinds: [], steer: null,
    };
  };
  const result = await runParaphraseReplay({ prompts: [prompt], planner, selectAtDepth, fixture: true, topic: 'decision-trees', context: 'bare prompt test' });
  assert.equal(calls.length, 15);
  assert.equal(plannerCalls.length, 15);
  assert.deepEqual(new Set(calls.map(call => call.depth)), new Set(['brief', 'balanced', 'detailed']));
  for (const call of calls) {
    assert.equal(call.fixture, true);
    assert.equal(call.topic, 'decision-trees');
    assert.equal(call.context, 'bare prompt test');
    assert.equal(call.planner, planner);
    assert.ok(prompt.paraphrases.includes(call.prompt));
  }
  assert.equal(result.passed, true);
  assert.equal(result.firstPickRate, 0.8);
  assert.equal(result.hits, 12);
  assert.equal(result.total, 15);
  assert.ok(result.prompts[0].cases.every(row => row.plannedKinds[0] === 'coordinate-plot'));
  assert.ok(result.byDepth.every(row => row.firstPickRate === 0.8));
});

test('reports a weak depth without replacing the aggregate gate and only counts the first reference', async () => {
  const planner = async () => ({ kind: 'tree' });
  const select = async ({ depth, prompt: text }) => ({
    references: [{ id: depth === 'detailed' && ['choose a split', 'find a split'].includes(text) ? 'another-reference' : prompt.referenceId }, { id: prompt.referenceId }],
    plannedKinds: ['tree'], requiredKinds: ['tree'], steer: null,
  });
  const result = await runParaphraseReplay({ prompts: [prompt], planner, select });
  assert.equal(result.hits, 13);
  assert.equal(result.passed, true);
  assert.equal(result.byDepth.find(row => row.depth === 'detailed').firstPickRate, 0.6);
  const missed = await runParaphraseReplay({
    prompts: [prompt], planner,
    select: async () => ({ references: [{ id: 'another-reference' }, { id: prompt.referenceId }], plannedKinds: ['tree'], requiredKinds: [] }),
  });
  assert.equal(missed.passed, false);
  assert.equal(missed.firstPickRate, 0);
  const variant = await runParaphraseReplay({
    prompts: [prompt], planner,
    select: async () => ({ references: [{ id: `${prompt.referenceId}--part-1`, sourceId: prompt.referenceId }], plannedKinds: ['tree'], requiredKinds: ['tree'] }),
  });
  assert.equal(variant.passed, true);
  assert.equal(variant.prompts[0].cases[0].firstReference, prompt.referenceId);
  assert.equal(variant.prompts[0].cases[0].firstReferenceId, `${prompt.referenceId}--part-1`);
});

test('requires real supplied paraphrases, expected references, planner and coverage metadata', async () => {
  const planner = async () => ({ kind: 'tree' });
  const selectAtDepth = async () => ({ references: [], plannedKinds: ['tree'], requiredKinds: [] });
  for (const invalid of [undefined, [], prompt.paraphrases.slice(1), [...prompt.paraphrases, 'a sixth'], Array(5).fill('same')]) {
    await assert.rejects(runParaphraseReplay({ prompts: [{ ...prompt, paraphrases: invalid }], planner, selectAtDepth }), /five.*paraphrases/i);
  }
  await assert.rejects(runParaphraseReplay({ prompts: [{ ...prompt, referenceId: undefined }], planner, selectAtDepth }), /referenceId/);
  await assert.rejects(runParaphraseReplay({ prompts: [prompt], selectAtDepth }), /planner/);
  await assert.rejects(runParaphraseReplay({ prompts: [prompt], planner, selectAtDepth: async () => ({ references: [] }) }), /plannedKinds.*requiredKinds/);
});
