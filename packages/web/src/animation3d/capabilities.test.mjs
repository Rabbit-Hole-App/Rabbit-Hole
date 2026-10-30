import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_CAPABILITIES, CAPABILITY_REGISTRIES } from './capabilities.js';
import { BEHAVIORS, CONTROL_PROFILES, EXPERIENCES, FEATURES, GEOMETRY_KINDS, validateAnimationArtifact, validateAnimationPlan } from './contract.js';
import { watchFixture } from './fixtures.js';

test('the MVP phase enables exactly the MVP subset of the contract', () => {
  const caps = ANIMATION_CAPABILITIES;
  assert.equal(caps.phase, 'mvp');
  assert.deepEqual(caps.experiences, ['inspect', 'watch', 'experiment', 'game']);
  assert.deepEqual(caps.behaviors, ['prescribed', 'analytical', 'rules']);
  assert.deepEqual(caps.controlProfiles, ['inspect', 'manipulate']);
  assert.equal(caps.limits.sourceRefs, 0);
  for (const [enabled, known] of [[caps.experiences, EXPERIENCES], [caps.behaviors, BEHAVIORS], [caps.controlProfiles, CONTROL_PROFILES], [caps.geometry, GEOMETRY_KINDS], [caps.features, FEATURES]]) {
    assert.ok(enabled.every(value => known.includes(value)), `${enabled} is a subset of the contract`);
  }
  for (const reserved of ['physics', 'assembly', 'walkthrough', 'attached_models', 'image_reference']) assert.ok(!caps.features.includes(reserved));
  assert.deepEqual({ nodes: caps.limits.nodes, triangles: caps.limits.triangles, parameters: caps.limits.parameters, actions: caps.limits.actions, labels: caps.limits.labels },
    { nodes: 256, triangles: 100000, parameters: 8, actions: 8, labels: 24 });
});

test('nothing outside the server registry can enable more', () => {
  assert.throws(() => { ANIMATION_CAPABILITIES.behaviors.push('physics'); }, TypeError);
  assert.throws(() => { ANIMATION_CAPABILITIES.limits.nodes = 1e6; }, TypeError);
  assert.ok(Object.isFrozen(CAPABILITY_REGISTRIES));
  const widened = structuredClone(ANIMATION_CAPABILITIES);
  widened.behaviors.push('physics');
  assert.throws(() => validateAnimationPlan({ ...watchFixture.plan, behavior: 'physics' }, widened), TypeError);
  assert.throws(() => validateAnimationArtifact(watchFixture.artifact, widened), TypeError);
  assert.equal(validateAnimationPlan(watchFixture.plan, ANIMATION_CAPABILITIES).ok, true);
});
