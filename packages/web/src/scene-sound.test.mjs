import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coalesce, crossed } from './scene-sound.js';

test('only events crossed going forward are sounded', () => {
  const line = [{ at: 1, sound: 'soft_pop' }, { at: 2, sound: 'connect' }, { at: 3, sound: 'reveal' }];
  assert.deepEqual(crossed(line, 0.5, 2.5).map(e => e.sound), ['soft_pop', 'connect']);
  assert.deepEqual(crossed(line, 2.5, 0.5), [], 'a backward seek is silent');
  assert.deepEqual(crossed(line, 1, 1), [], 'standing still is silent');
});

test('an event at zero sounds on a replay, and is not swallowed by the boundary', () => {
  const line = [{ at: 0, sound: 'soft_pop' }, { at: 1, sound: 'connect' }];
  // A naive `at > from` never fires an event at 0, because playback starts there.
  assert.deepEqual(crossed(line, 0, 0.5, { start: true }).map(e => e.sound), ['soft_pop'], 'starting playback includes the boundary');
  assert.deepEqual(crossed(line, 0, 0.5).map(e => e.sound), [], 'advancing past it again does not repeat it');
});

test('coalescing collapses what lands together and keeps what does not', () => {
  const together = [{ at: 1.0, sound: 'soft_pop' }, { at: 1.03, sound: 'connect' }];
  assert.deepEqual(coalesce(together).map(e => e.sound), ['connect'], 'one bucket, higher tier wins');

  const apart = [{ at: 1.0, sound: 'soft_pop' }, { at: 1.5, sound: 'reveal' }, { at: 2.1, sound: 'tick' }];
  assert.deepEqual(coalesce(apart).map(e => e.sound), ['soft_pop', 'reveal', 'tick'], 'three buckets, three sounds - a dropped frame must not swallow two of them');

  const sameTier = [{ at: 1.0, sound: 'connect' }, { at: 1.02, sound: 'split' }];
  assert.deepEqual(coalesce(sameTier).map(e => e.sound), ['connect'], 'same tier, earliest wins');

  assert.deepEqual(coalesce([]), []);
});

// The obvious implementation - Math.floor(at / window) - passes every case
// above and is still wrong: it lays a fixed grid over the timeline, so two
// events 10ms apart land in different buckets whenever a grid line falls
// between them. Cluster greedily from the first event instead.
test('two events either side of a grid line are still one bucket', () => {
  const straddling = [{ at: 1.03, sound: 'soft_pop' }, { at: 1.05, sound: 'connect' }];
  assert.deepEqual(coalesce(straddling).map(e => e.sound), ['connect'], '20ms apart is one moment, wherever it falls');
});
