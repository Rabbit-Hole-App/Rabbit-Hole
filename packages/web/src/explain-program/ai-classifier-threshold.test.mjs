import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProgram } from './program-card.js';
import { parseGuestResult } from './contract.js';
import { loadEngine, runProgram } from './runtime.js';
import { PROGRAM_STAMPS } from './stamps.js';

const engine = await loadEngine();
const block = { id: 'threshold-example', type: 'animation', program: { fixtureId: 'fixture-ai-classifier-threshold' } };

async function open() {
  const resolved = await resolveProgram(block, { fixtures: true, stamps: PROGRAM_STAMPS });
  assert.equal(resolved.ok, true, resolved.error?.diagnostic);
  const { source, sdkVersion, manifest } = resolved.artifact;
  return cutoff => {
    const result = runProgram(engine, {
      source, sdkVersion, operation: 'evaluate',
      request: { requestId: 'threshold-example', inputs: { cutoff }, time: 0, seed: 1, state: null },
    });
    assert.equal(result.ok, true, result.detail);
    const parsed = parseGuestResult(result.value, manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    return parsed.value;
  };
}

test('lowering the cutoff catches the second positive and adds two false alarms', async () => {
  const evaluate = await open();
  assert.deepEqual(evaluate(.70).quantities, {
    tp: 1, fp: 0, fn: 1, tn: 8, precision: 1, recall: .5, accuracy: .9,
  });
  const result = evaluate(.50);
  assert.deepEqual(result.quantities, {
    tp: 2, fp: 2, fn: 0, tn: 6, precision: .5, recall: 1, accuracy: .8,
  });
  const cells = ['matrix.r0c0', 'matrix.r0c1', 'matrix.r1c0', 'matrix.r1c1'];
  assert.deepEqual(cells.map(id => result.frame.objects.find(object => object.id === id)?.text), ['2', '0', '2', '6']);
});

test('scores equal to the cutoff count as positive and an empty prediction set has undefined precision', async () => {
  const evaluate = await open();
  assert.deepEqual(evaluate(.64).quantities, {
    tp: 2, fp: 0, fn: 0, tn: 8, precision: 1, recall: 1, accuracy: 1,
  });
  const empty = evaluate(1);
  assert.deepEqual(empty.quantities, { tp: 0, fp: 0, fn: 2, tn: 8, recall: 0, accuracy: .8 });
  assert.equal(empty.frame.objects.find(object => object.id === 'precision')?.text, 'Precision: —');
});
