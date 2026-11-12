import assert from 'node:assert/strict';
import test from 'node:test';
import {
  concatenated, crossWeights, decoderPrefix, decoderState, embeddings, heads, inputs,
  logits, positions, predictedToken, projected, queryIndex, sentence, vocabulary, vocabularyWeights,
} from './transformer-walkthrough-data.js';

const total = values => values.reduce((sum, value) => sum + value, 0);
const near = (actual, expected, tolerance = 0.0011) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`,
);

test('walkthrough values agree from token positions through the vocabulary distribution', () => {
  assert.equal(sentence.join(' '), 'the cat sat on the mat');
  assert.deepEqual(embeddings[0], embeddings[4], 'the same word starts from the same embedding');
  assert.notDeepEqual(inputs[0], inputs[4], 'position changes the input');
  for (const [position, input] of inputs.entries()) {
    for (const [column, value] of input.entries()) near(value, embeddings[position][column] + positions[position][column]);
  }

  for (const head of heads) {
    for (const [index, query] of head.queries.entries()) {
      const dots = head.keys.map(key => total(query.map((value, column) => value * key[column])));
      const scores = head.scores[index];
      const exps = scores.map(score => Math.exp(score));
      const weights = head.weights[index];
      near(total(weights), 1, 1e-9);
      dots.forEach((dot, column) => {
        near(head.dotProducts[index][column], dot);
        near(scores[column], dot / Math.sqrt(query.length));
        near(weights[column], exps[column] / total(exps));
      });
      const masked = head.maskedWeights[index];
      assert.ok(masked.slice(index + 1).every(value => value === null));
      assert.ok(head.maskedScores[index].slice(index + 1).every(value => value === null));
      near(total(masked.slice(0, index + 1)), 1, 1e-9);
      for (const [column, value] of head.outputs[index].entries()) {
        near(value, total(weights.map((weight, row) => weight * head.values[row][column])));
      }
    }
  }
  const first = heads[0].weights[queryIndex];
  assert.equal(first.indexOf(Math.max(...first)), 1, 'cat gets the largest first-head weight');
  assert.deepEqual(concatenated[queryIndex], heads.flatMap(head => head.outputs[queryIndex]));
  assert.equal(projected[queryIndex].length, 4);
  assert.deepEqual(decoderPrefix, sentence.slice(0, queryIndex + 1));
  assert.equal(crossWeights.length, decoderPrefix.length);
  crossWeights.forEach(row => { assert.equal(row.length, sentence.length); near(total(row), 1, 1e-9); });
  assert.equal(decoderState.length, 4);
  near(total(vocabularyWeights), 1, 1e-9);
  logits.forEach((logit, column) => near(vocabularyWeights[column], Math.exp(logit) / total(logits.map(Math.exp))));
  assert.equal(predictedToken, vocabulary[logits.indexOf(Math.max(...logits))]);
  assert.equal(predictedToken, sentence[decoderPrefix.length]);
});
