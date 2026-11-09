import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  continuation, embeddingAt, embeddingTable, logits, modelSizes, musicEvents, musicTokenIds, notes, positions,
  prefix, probability, qkv, qkvWeights, sampleAt, sampled, scoringState, vocab,
} from './gpt2-figure-data.js';

const round = value => Number(value.toFixed(3));

test('learned lookups and packed projections use the same current token vector', () => {
  const token = prefix[2];
  const input = embeddingAt(token, 2);
  assert.deepEqual(input, embeddingTable[vocab.indexOf(token)].map((value, i) => round(value + positions[2][i])));
  assert.deepEqual(input, [1.8, -0.1, 0.3, 0.4]);
  const packed = qkvWeights.flat().map(column => round(column.reduce((sum, value, i) => sum + value * input[i], 0)));
  assert.equal(packed.length, 12);
  assert.deepEqual(qkv.flat(), packed);
  assert.deepEqual(qkv, [[1.7, 0.3, 0.4, 1.5], [1.8, 0.2, -0.1, -0.1], [-0.1, -1.4, 0.7, 1.8]]);
});

test('tied output scores and sampling use the same vocabulary order', () => {
  const scores = embeddingTable.map(row => row.reduce((sum, value, i) => sum + value * scoringState[i], 0));
  assert.deepEqual(logits, scores);
  const normalization = scores.reduce((sum, score) => sum + Math.exp(score), 0);
  assert.deepEqual(probability, scores.map(score => round(Math.exp(score) / normalization)));
  assert.equal(vocab[logits.indexOf(Math.max(...logits))], continuation);
  assert.equal(continuation, 'flickers');
  const sampledIndex = vocab.indexOf(sampled);
  const before = probability.slice(0, sampledIndex).reduce((sum, value) => sum + value, 0);
  assert.ok(before <= sampleAt && sampleAt < before + probability[sampledIndex]);
  assert.equal(sampled, 'glows');
});

test('toy totals count both lookup tables, every block and the final normalization', () => {
  for (const { layers, width: d, total } of modelSizes) {
    const expansion = d * 4;
    const qkv = 3 * d * (d + 1);
    const attentionOut = d * (d + 1);
    const mlp = (d + 1) * expansion + (expansion + 1) * d;
    const norms = 4 * d;
    const lookup = (vocab.length + positions.length) * d;
    assert.equal(total, layers * (qkv + attentionOut + mlp + norms) + lookup + 2 * d);
  }
  assert.deepEqual(modelSizes.map(model => model.total), [552, 1626, 3616, 6810]);
});

test('musical wait tokens advance time and overlapping notes keep their own release times', () => {
  assert.equal(musicEvents.filter(([type, amount]) => type === 'Wait' && amount === 250).length, 3);
  assert.equal(musicTokenIds.filter(label => label === 'Wait 250').length, 1);
  assert.deepEqual(notes, [
    { pitch: 60, name: 'C4', start: 0, end: 500 },
    { pitch: 64, name: 'E4', start: 250, end: 750 },
    { pitch: 67, name: 'G4', start: 500, end: 750 },
  ]);
});
