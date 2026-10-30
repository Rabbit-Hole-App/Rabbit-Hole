import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { triangleCost, validateAnimationArtifact } from './contract.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, watchFixture } from './fixtures.js';
import { buildAnimationScene } from './scene.js';

// Real Three.js objects, no WebGL: labels get a plain Texture in place of the browser's canvas texture.
const labels = [];
const labelTexture = text => { labels.push(text); return { texture: new THREE.Texture(), aspect: text.length / 2 }; };
const trianglesOf = root => {
  let total = 0;
  root.traverse(object => {
    if (object.isSprite) total += 2;
    else if (object.isMesh) total += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
  });
  return total;
};

test('every fixture compiles to exactly the triangles and line points the contract charges for', () => {
  for (const { name, artifact } of ANIMATION_FIXTURES) {
    const built = buildAnimationScene(artifact, { labelTexture });
    assert.equal(built.ok, true, name);
    const { scene } = validateAnimationArtifact(artifact).value, geometries = new Map(scene.geometries.map(g => [g.id, g]));
    const charged = scene.nodes.reduce((sum, node) => sum + (node.geometry ? triangleCost(geometries.get(node.geometry)) : 0), 0);
    assert.equal(trianglesOf(built.scene.root), charged, `${name} triangles`);
    assert.equal(built.scene.objects.size, scene.nodes.length);
    built.scene.dispose();
  }
  const orbit = buildAnimationScene(watchFixture.artifact, { labelTexture }).scene;
  let linePoints = 0;
  orbit.root.traverse(object => { if (object.isLine) linePoints += object.geometry.attributes.position.count; });
  assert.equal(linePoints, 97, 'a closed curve of 96 segments');
  orbit.dispose();
});

test('an over-budget or malformed artifact is refused before anything is allocated', () => {
  for (const { name, kind, value, code } of INVALID_ANIMATION_FIXTURES.filter(fixture => fixture.kind === 'artifact')) {
    labels.length = 0;
    const built = buildAnimationScene(value, { labelTexture });
    assert.equal(built.ok, false, name);
    assert.ok(built.issues.some(issue => issue.code === code), `${name} (${kind})`);
    assert.equal(labels.length, 0, `${name}: no label texture was made`);
  }
});

test('frames move nodes through the hierarchy without rebuilding; an invalid frame changes nothing', () => {
  const { scene } = buildAnimationScene(watchFixture.artifact, { labelTexture });
  const moon = scene.objects.get('moon'), mesh = moon.children[0], ownedBefore = scene.owned();
  assert.equal(scene.apply({ nodes: { moon: { position: [0, 0, 3] } }, readouts: { angle: 90 } }).ok, true);
  scene.root.updateMatrixWorld(true);
  assert.deepEqual(scene.objects.get('moonTag').getWorldPosition(new THREE.Vector3()).toArray(), [0, 0.6, 3]);
  assert.equal(moon.children[0], mesh, 'same mesh, moved');
  assert.equal(scene.apply({ nodes: { moon: { position: [9, 9, 9], html: '<b>' } } }).ok, false);
  assert.equal(scene.apply({ nodes: { ghost: { visible: false } } }).ok, false);
  assert.deepEqual(moon.position.toArray(), [0, 0, 3]);
  assert.equal(scene.apply({ nodes: { moonTag: { text: 'Moon, 90 deg' } }, materials: { moonGrey: { color: '#ff0000', opacity: 0.5 } } }).ok, true);
  assert.equal(scene.owned(), ownedBefore, 'the old label texture and material were freed');
  assert.equal(mesh.material.color.getHexString(), 'ff0000');
  assert.equal(mesh.material.transparent, true);
  scene.dispose();
});

test('dispose frees every geometry, material and texture exactly once', () => {
  const { scene } = buildAnimationScene(watchFixture.artifact, { labelTexture });
  const resources = new Set();
  scene.root.traverse(object => {
    if (object.geometry && !object.isSprite) resources.add(object.geometry);
    if (object.material) { resources.add(object.material); if (object.material.map) resources.add(object.material.map); }
  });
  let freed = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { freed += 1; });
  scene.dispose();
  assert.equal(freed, resources.size);
  assert.equal(scene.owned(), 0);
  assert.equal(scene.root.children.length, 0);
});
