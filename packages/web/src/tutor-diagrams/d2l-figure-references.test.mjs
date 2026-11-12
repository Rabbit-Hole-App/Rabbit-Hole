import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { selectDiagramReferences } from '../../../control-plane/src/explanation-references.js';
import { d2lFigureReferences } from './d2l-figure-references.js';
import { adamCoordinates, classLogits, classProbabilities, descentPaths, minibatchRuns, stochasticPaths } from './d2l-figure-data.js';
import { parseTutorDiagram } from './spec.js';

test('the D2L chapter refs are readable by the diagram parser and selected at each depth', () => {
  for (const ref of d2lFigureReferences) {
    for (const [depth, { spec }] of Object.entries({ standard: ref, ...ref.depths })) {
      assert.doesNotThrow(() => parseTutorDiagram(spec), ref.id + '/' + depth);
      assert.deepEqual(lintDiagramContent(spec), [], ref.id + '/' + depth);
      if (depth === 'overview') assert.ok(!JSON.stringify(spec).includes('$'), ref.id + ' Brief should use words');
      for (const prompt of [...ref.prompts, ...ref.paraphrases]) {
        assert.equal(selectDiagramReferences({ prompt, depth })[0]?.id, ref.id, prompt);
      }
    }
  }
});

test('subtracting the maximum gives finite exponentials and preserves the class odds', () => {
  assert.equal(Math.exp(classLogits[0]), Infinity);
  assert.ok(Math.abs(classProbabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(Math.abs(classProbabilities[1] / classProbabilities[0] - Math.exp(classLogits[1] - classLogits[0])) < 0.002);
});

test('the shared optimizer examples show the intended trade-offs', () => {
  assert.ok(Math.abs(descentPaths[0].at(-1)) > Math.abs(descentPaths[1].at(-1)));
  assert.equal(descentPaths[2][1], 0);
  assert.ok(Math.abs(descentPaths[3].at(-1)) > Math.abs(descentPaths[3][0]));
  assert.ok(Math.abs(stochasticPaths[1].at(-1)) > Math.abs(stochasticPaths[2].at(-1)));
  const elapsedToTarget = minibatchRuns.map(({ epochMs, losses }) => epochMs * losses.findIndex(loss => loss <= 0.06));
  assert.equal(elapsedToTarget.indexOf(Math.min(...elapsedToTarget)), 1);
  assert.equal(adamCoordinates[0].gradient, adamCoordinates[1].gradient);
  assert.ok(adamCoordinates[0].v < adamCoordinates[1].v);
  assert.ok(adamCoordinates[0].move > adamCoordinates[1].move);
});
