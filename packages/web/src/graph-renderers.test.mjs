import test from 'node:test';
import assert from 'node:assert/strict';
import { describeGraphError } from './graph-renderers.js';

test('Desmos configuration errors explain the working alternatives without retry', () => {
  assert.deepEqual(describeGraphError(new Error('Desmos is not configured')), {
    kind: 'unavailable',
    message: 'Interactive math graphs are unavailable on this deployment. Use a Plotly data plot or an equation block instead.',
  });
});

test('transient graph errors remain retryable', () => {
  assert.deepEqual(describeGraphError(new Error('Could not load Desmos')), {
    kind: 'retryable',
    message: 'Could not load Desmos',
  });
});
