import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classLogits, classProbabilities, contexts, featureMethods, focusWord, layerWeights,
  maskCandidates, maskedProbabilities, maskLogits, maskLoss, staticVector,
} from './bert-figure-data.js';

const round = value => Number(value.toFixed(3));

test('ELMo changes the backward states and the mixed vector when only the right context changes', () => {
  const [animal, gasket] = contexts;
  assert.deepEqual(animal.tokens.slice(0, 2), gasket.tokens.slice(0, 2));
  assert.notEqual(animal.tokens[2], gasket.tokens[2]);
  assert.deepEqual(animal.layers.map(layer => layer.forward), gasket.layers.map(layer => layer.forward));
  assert.equal(layerWeights.reduce((sum, weight) => sum + weight, 0), 1);
  for (const example of contexts) {
    const layers = [staticVector, ...example.layers.map(layer => [...layer.forward, ...layer.backward])];
    const mixed = staticVector.map((_, i) => round(layers.reduce((sum, layer, depth) => sum + layerWeights[depth] * layer[i], 0)));
    assert.deepEqual(example.contextual, mixed);
  }
  assert.deepEqual(animal.contextual, [0.43, 0.24, 0.62, -0.16]);
  assert.deepEqual(gasket.contextual, [0.43, 0.24, -0.29, 0.7]);
});

test('toy BERT class and mask probabilities are softmax shares and mask loss uses the observed word', () => {
  for (const [logits, probabilities] of [[classLogits, classProbabilities], [maskLogits, maskedProbabilities]]) {
    const denominator = logits.reduce((sum, logit) => sum + Math.exp(logit), 0);
    assert.deepEqual(probabilities, logits.map(logit => round(Math.exp(logit) / denominator)));
    assert.ok(Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  }
  const target = maskCandidates.indexOf(focusWord);
  assert.equal(maskedProbabilities[target], 0.57);
  assert.equal(maskLoss, round(-Math.log(maskedProbabilities[target])));
});

test('frozen feature variants have consistent widths and F1 values on the same positive support', () => {
  assert.deepEqual(featureMethods.map(method => method.width), [4, 4, 8]);
  for (const { tp, fp, fn, f1 } of featureMethods) {
    assert.equal(tp + fn, 10);
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    assert.equal(f1, round(2 * precision * recall / (precision + recall)));
  }
});
