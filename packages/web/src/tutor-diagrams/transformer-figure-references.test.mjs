import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { selectDiagramReferences } from '../../../control-plane/src/explanation-references.js';
import { parseTutorDiagram } from './spec.js';
import { transformerFigureReferences } from './reference-library.js';
import { decoderPrefix, heads, inputs, positions, projected, queryIndex, sentence, vocabulary, vocabularyWeights } from './transformer-walkthrough-data.js';

test('each figure reference parses, lints, and reaches the author at every depth', () => {
  assert.equal(transformerFigureReferences.length, 13);
  for (const ref of transformerFigureReferences) {
    for (const [depth, { spec, detailSpec }] of Object.entries({ standard: ref, ...ref.depths })) {
      for (const visual of [spec, detailSpec].filter(Boolean)) {
        assert.doesNotThrow(() => parseTutorDiagram(visual), ref.id + '/' + depth);
        assert.deepEqual(lintDiagramContent(visual), [], ref.id + '/' + depth);
      }
      for (const prompt of [...ref.prompts, ...ref.paraphrases]) {
        assert.equal(selectDiagramReferences({ prompt, depth })[0]?.id, ref.id, prompt);
      }
    }
  }
});

test('batched attention, positions, residual and vocabulary use the existing walkthrough values', () => {
  const find = id => transformerFigureReferences.find(ref => ref.id === id).spec.diagram;
  const distant = find('ml-transformer-attention-across-distance').queries[0];
  assert.equal(distant.weights.indexOf(Math.max(...distant.weights)), 0);
  assert.deepEqual(distant.weights, heads[1].weights[distant.index]);
  const attention = find('ml-transformer-batched-attention');
  assert.equal(attention.rows.length, 6);
  for (const [index, row] of attention.rows.entries()) {
    assert.ok(row.cells.every((value, column) => Math.abs(value - heads[0].weights[index][column]) <= 0.02));
    assert.ok(Math.abs(row.cells.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  }
  assert.deepEqual(find('ml-transformer-position-heatmap').rows.map(row => row.cells), positions);
  const residual = find('ml-transformer-residual-arithmetic');
  const rounded = n => Math.round(n * 1000) / 1000;
  assert.deepEqual(residual.after.items[0].tensor.values, inputs[queryIndex].map((value, index) => rounded(value + projected[queryIndex][index])));
  const normalized = residual.after.items[1].tensor.values;
  assert.ok(Math.abs(normalized.reduce((sum, value) => sum + value, 0)) < 0.004);
  assert.ok(Math.abs(normalized.reduce((sum, value) => sum + value ** 2, 0) / 4 - 1) < 0.003);
  const target = find('ml-transformer-one-hot-target').rows.find(row => row.cells[1] === '1');
  const next = sentence[decoderPrefix.length];
  assert.equal(target.heading, next);
  assert.equal(Number(target.cells[0]), vocabularyWeights[vocabulary.indexOf(next)]);
});
