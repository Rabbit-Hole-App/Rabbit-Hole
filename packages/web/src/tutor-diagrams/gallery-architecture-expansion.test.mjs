import assert from 'node:assert/strict';
import { test } from 'node:test';
import { galleryToy } from './gallery-architecture-expansion-data.js';

test('toy residual, adapter, and recurrent arithmetic follows the shown routes', () => {
  const { streams, core, adapter } = galleryToy;
  assert.equal(streams.read, 5);
  assert.deepEqual(streams.identity, [3, 6.5]);
  assert.deepEqual(streams.mixed, [4, 5.5]);
  assert.deepEqual(core.states, [[0, 1], [0.5, 0.5], [0.75, 0.25]]);
  assert.deepEqual(adapter.delta, [0.5, -0.25]);
  assert.deepEqual(adapter.output, [2.5, 0.75]);
});

test('retrieved masks, shared keys, and sink normalization preserve distinct semantics', () => {
  const { masks, share, sink } = galleryToy;
  assert.deepEqual(masks.partial.map(row => row.flatMap((value, i) => value == null ? [] : [i + 1])), [[1, 2, 5], [1, 2, 5, 6]]);
  assert.deepEqual(masks.shortlist.flatMap((value, i) => value == null ? [] : [i + 1]), [1, 3, 6]);
  assert.ok(share.weights[0][0] > share.weights[0][1]);
  assert.deepEqual(share.weights[1], [...share.weights[0]].reverse());
  assert.deepEqual(sink.withScore, [null, 0.25, 0.25, 0.5]);
});

test('causal convolution changes key and value features before offset bias changes the scores', () => {
  const { convolvedKeys, convolvedValues, relativeBias, scores } = galleryToy.relativeConvolution;
  assert.deepEqual(convolvedKeys, [0.5, 3, 2.5]);
  assert.deepEqual(convolvedValues, [1.5, 3.5, 5.5]);
  assert.deepEqual(scores, convolvedKeys.map((value, i) => value + relativeBias[i]));
  assert.equal(convolvedKeys.indexOf(Math.max(...convolvedKeys)), 1);
  assert.equal(scores.indexOf(Math.max(...scores)), 2);
});
