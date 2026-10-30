import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnimationArtifact } from './contract.js';
import { experimentFixture } from './fixtures.js';
import { commitAnimationStep } from './state.js';

const artifact = validateAnimationArtifact(experimentFixture.artifact).value;
const inputs = { leftMass: 4, leftDistance: 1.5, rightMass: 2, rightDistance: 2 };
const candidate = (change = {}) => ({ snapshot: { inputs, state: null, seed: 1, time: 0, tick: 0, paused: true, ...change }, frame: { readouts: { tilt: 10 } } });

test('the first commit needs its artifact and keeps a hydrated stamp', () => {
  assert.equal(commitAnimationStep(null, candidate(), null).reason, 'invalid');
  const first = commitAnimationStep(null, { ...candidate({ stamp: 7 }), artifact }, null);
  assert.equal(first.ok, true);
  assert.equal(first.value.snapshot.stamp, 7);
  assert.equal(first.value.snapshot.revision, artifact.revision);
  assert.equal(commitAnimationStep(null, { ...candidate({ revision: 2 }), artifact }, null).reason, 'stale', 'a saved snapshot of another revision');
});

test('a stale or invalid candidate changes nothing; stamps only grow', () => {
  const first = commitAnimationStep(null, { ...candidate(), artifact }, null).value;
  const second = commitAnimationStep(first, candidate({ inputs: { ...inputs, leftMass: 5 } }), first.snapshot.stamp);
  assert.equal(second.ok, true);
  assert.equal(second.value.snapshot.stamp, first.snapshot.stamp + 1);
  assert.equal(commitAnimationStep(second.value, candidate(), first.snapshot.stamp).reason, 'stale', 'computed from an older record');
  assert.equal(commitAnimationStep(second.value, { ...candidate(), artifact: structuredClone(artifact) }, second.value.snapshot.stamp).reason, 'stale', 'another artifact');
  const badInput = commitAnimationStep(second.value, candidate({ inputs: { ...inputs, leftMass: 99 } }), second.value.snapshot.stamp);
  assert.equal(badInput.reason, 'invalid');
  assert.equal(badInput.issues[0].path, 'inputs.leftMass');
  const badFrame = commitAnimationStep(second.value, { ...candidate(), frame: { nodes: { ghost: {} } } }, second.value.snapshot.stamp);
  assert.equal(badFrame.reason, 'invalid');
  assert.equal(second.value.snapshot.inputs.leftMass, 5, 'the committed record is untouched');
  assert.ok(Object.isFrozen(second.value));
});
