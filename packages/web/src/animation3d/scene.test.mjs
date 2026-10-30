import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { triangleCost, validateAnimationArtifact } from './contract.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, watchFixture } from './fixtures.js';
import { buildAnimationScene, declutterLabels, LABEL_PIXELS, labelPixels } from './scene.js';

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

test('labels keep a constant, bounded screen size, face the camera over the scene and sit beside their point', () => {
  const big = structuredClone(watchFixture.artifact);
  big.scene.nodes.find(node => node.id === 'system').scale = [4, 4, 4]; // a scaled-up scene
  big.scene.geometries.find(g => g.id === 'moonText').placement = 'right';
  for (const artifact of [watchFixture.artifact, big]) {
    const { scene } = buildAnimationScene(artifact, { labelTexture });
    const sprite = scene.objects.get('moonTag').children[0];
    assert.equal(sprite.material.sizeAttenuation, false);
    assert.equal(sprite.material.depthTest, false);
    for (const [height, fov] of [[540, 50], [300, 30]]) {
      const camera = new THREE.PerspectiveCamera(fov, 960 / height, 0.05, 2000);
      camera.position.set(0, 6, 8);
      camera.lookAt(0, 0, 0);
      scene.layoutLabels({ width: 960, height, camera });
      const world = sprite.getWorldScale(new THREE.Vector3()), f = 1 / Math.tan(fov * Math.PI / 360);
      assert.ok(Math.abs(world.y * f / 2 * height - labelPixels(0.3)) < 1e-9, 'plate height in CSS pixels');
      assert.ok(Math.abs(world.x / world.y - 2) < 1e-9, 'the text aspect is kept');
    }
    assert.deepEqual(sprite.center.toArray(), artifact === big ? [-0.06, 0.5] : [0.5, -0.2]);
    scene.dispose();
  }
  assert.deepEqual([labelPixels(0.3), labelPixels(0.01), labelPixels(50)], [LABEL_PIXELS.base, LABEL_PIXELS.min, LABEL_PIXELS.max]);
});

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const moved = (plates, offsets) => plates.map((plate, i) => ({ ...plate, x: plate.x + offsets[i].dx, y: plate.y + offsets[i].dy }));

test('declutter pushes a later overlapping plate by the overlap along its placement, then its sides, then the opposite way', () => {
  const plate = (x, y, placement = 'above') => ({ x, y, w: 100, h: 28, placement });
  assert.deepEqual(declutterLabels([plate(0, 0), plate(300, 0)]), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], 'apart: untouched');
  assert.deepEqual(declutterLabels([plate(0, 100), plate(10, 110)]), [{ dx: 0, dy: 0 }, { dx: 0, dy: -(110 + 28 + 4 - 100) }], 'up until clear of the first, plus the gap');
  assert.deepEqual(declutterLabels([plate(0, 100), plate(10, 110, 'right')])[1], { dx: 100 - 10 + 4, dy: 0 });
  // Two pushes up clear both plates above; with a single push allowed, up is blocked and the side (left first for "above") wins.
  assert.deepEqual(declutterLabels([plate(0, 100), plate(0, 60), plate(0, 100)])[2], { dx: 0, dy: -72 });
  assert.deepEqual(declutterLabels([plate(0, 100), plate(0, 60), plate(0, 100)], { steps: 1 })[2], { dx: -104, dy: 0 });
  // Many labels on one point: bounded, finite, the same every time, and whatever was placed does not overlap.
  const crowd = Array.from({ length: 24 }, () => plate(400, 300));
  const once = declutterLabels(crowd), again = declutterLabels(crowd);
  assert.deepEqual(once, again);
  assert.ok(once.every(({ dx, dy }) => Number.isFinite(dx) && Number.isFinite(dy)));
  const placed = moved(crowd, once).slice(0, 5);
  assert.ok(placed.every((a, i) => placed.every((b, j) => i === j || !intersects(a, b))), 'the first labels all find room');
});

test('the scene declutters labels on screen; hidden, off-screen and behind-camera labels keep their placement', () => {
  const crowded = structuredClone(watchFixture.artifact);
  crowded.scene.geometries.push({ id: 'otherText', kind: 'label', text: 'Moon orbit' });
  crowded.scene.nodes.push({ id: 'orbitTag', parent: 'moon', geometry: 'otherText', position: [0, 0.6, 0] }); // the same point as moonTag
  const { scene } = buildAnimationScene(crowded, { labelTexture });
  const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.05, 2000);
  camera.position.set(0, 6, 8);
  camera.lookAt(0, 0, 0);
  const rect = id => {
    const sprite = scene.objects.get(id).children[0], { aspect, pixels } = sprite.userData.label, p = sprite.getWorldPosition(new THREE.Vector3()).project(camera);
    const w = pixels * aspect, sx = (p.x + 1) / 2 * 960, sy = (1 - p.y) / 2 * 540;
    return { x: sx - sprite.center.x * w, y: sy - (1 - sprite.center.y) * pixels, w, h: pixels };
  };
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.ok(!intersects(rect('moonTag'), rect('orbitTag')), 'the second label moved clear of the first');
  assert.deepEqual(scene.objects.get('moonTag').children[0].center.toArray(), [0.5, -0.2], 'the first keeps its placement');
  scene.apply({ nodes: { moonTag: { visible: false } } });
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.deepEqual(scene.objects.get('orbitTag').children[0].center.toArray(), [0.5, -0.2], 'nothing to avoid once the first is hidden');
  camera.position.set(0, 0.6, -20);
  camera.lookAt(0, 0.6, -40); // looking away: both behind the camera
  scene.apply({ nodes: { moonTag: { visible: true } } });
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.deepEqual(scene.objects.get('orbitTag').children[0].center.toArray(), [0.5, -0.2]);
  scene.dispose();
});
