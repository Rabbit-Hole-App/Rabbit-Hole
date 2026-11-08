import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProgram } from './program-card.js';
import { parseGuestResult } from './contract.js';
import { loadEngine, runProgram } from './runtime.js';
import { PROGRAM_STAMPS } from './stamps.js';

const engine = await loadEngine();
const block = { id: 'split-example', type: 'animation', program: { fixtureId: 'fixture-ai-tree-split' } };

async function open() {
  const resolved = await resolveProgram(block, { fixtures: true, stamps: PROGRAM_STAMPS });
  assert.equal(resolved.ok, true, resolved.error?.diagnostic);
  const { source, sdkVersion, manifest } = resolved.artifact;
  return (operation, inputs, state = null, event) => {
    const result = runProgram(engine, {
      source, sdkVersion, operation,
      request: { requestId: 'split-example', inputs, state, seed: 1, time: 0, ...(event ? { event } : {}) },
    });
    assert.equal(result.ok, true, result.detail);
    if (operation !== 'evaluate') return result.value;
    const parsed = parseGuestResult(result.value, manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    return parsed.value.quantities;
  };
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `expected ${expected}, received ${actual}`);
}

test('the cutoff partitions the points and gain weights each group by its size', async () => {
  const call = await open();
  const inputs = { cutoff: 7, criterion: 'gini' };
  const state = call('initialize', inputs);
  const gini = call('evaluate', inputs, state);
  // Cutoff 7 gives counts (1, 2) and (5, 2). The original counts are (6, 4).
  assert.deepEqual([gini.left0, gini.left1, gini.right0, gini.right1], [1, 2, 5, 2]);
  near(gini.parent, 0.48);
  near(gini.weighted, 44 / 105);
  near(gini.gain, 32 / 525);

  const moved = call('evaluate', { cutoff: 19, criterion: 'entropy' }, state);
  // Nine samples with counts (5, 4) on the left, one pure class-0 sample on the right.
  assert.deepEqual([moved.left0, moved.left1, moved.right0, moved.right1], [5, 4, 1, 0]);
  near(moved.parent, 0.9709505944546686);
  near(moved.weighted, 0.8919684538543999);
  near(moved.gain, 0.0789821406002686);
});

test('revealing the best split keeps the chosen cutoff and respects the active criterion', async () => {
  const call = await open();
  const inputs = { cutoff: 7, criterion: 'gini' };
  const initial = call('initialize', inputs);
  assert.equal(call('evaluate', inputs, initial).bestCutoff, undefined);
  const revealed = call('reduce', inputs, initial, { type: 'action', action: 'revealBest' });

  const gini = call('evaluate', inputs, revealed);
  assert.equal(gini.cutoff, 7);
  assert.equal(gini.bestCutoff, 9);
  near(gini.bestGain, 49 / 300);

  const entropyInputs = { ...inputs, criterion: 'entropy' };
  const switched = call('reduce', entropyInputs, revealed, { type: 'input', input: 'criterion', value: 'entropy' });
  const entropy = call('evaluate', entropyInputs, switched);
  assert.equal(entropy.cutoff, 7);
  assert.equal(entropy.bestCutoff, 15);
  near(entropy.bestGain, 0.2812908992306925);
});
