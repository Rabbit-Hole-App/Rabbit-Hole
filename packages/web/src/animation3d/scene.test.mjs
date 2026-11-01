import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { triangleCost, validateAnimationArtifact } from './contract.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, watchFixture } from './fixtures.js';
import { buildAnimationScene, declutterLabels, LABEL_PIXELS, labelPixels } from './scene.js';

// Real Three.js objects, no WebGL: labels get a plain Texture in place of the browser's canvas texture.
const labels = [];
const labelTexture = (text, options) => { labels.push({ text, ...options }); return { texture: new THREE.Texture(), aspect: text.length / 2 }; };
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
  orbit.root.traverse(object => { if (object.isLine && !object.userData.leader) linePoints += object.geometry.attributes.position.count; }); // leaders are label chrome, not charged
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

// A camera on the default view's direction at `distance` from the origin, and a label sprite's plate in CSS pixels on a 960-wide
// viewport: its top-left corner and size.
const camera = (distance, height = 540, fov = 50) => {
  const view = new THREE.PerspectiveCamera(fov, 960 / height, 0.05, 2000);
  view.position.set(0, 6, 8).setLength(distance);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  return view;
};
const plateOf = (sprite, view, height = 540) => {
  const f = 1 / Math.tan(view.fov * Math.PI / 360), world = sprite.getWorldScale(new THREE.Vector3()), h = world.y * f / 2 * height, w = h * world.x / world.y;
  const p = sprite.getWorldPosition(new THREE.Vector3()).project(view), sx = (p.x + 1) / 2 * 960, sy = (1 - p.y) / 2 * height;
  return { x: sx - sprite.center.x * w, y: sy - (1 - sprite.center.y) * h, w, h };
};
// Plates sit on whole device pixels, so a center is its placement to within half a device pixel.
const near = (sprite, [cx, cy], view, height = 540) => {
  const { w, h } = plateOf(sprite, view, height);
  return Math.abs(sprite.center.x - cx) * w <= 0.5 + 1e-9 && Math.abs(sprite.center.y - cy) * h <= 0.5 + 1e-9;
};

test('labels face the camera over the scene, sit beside their point and follow the scene: smaller farther away, clamped, hidden when there is no room', () => {
  const big = structuredClone(watchFixture.artifact);
  big.scene.nodes.find(node => node.id === 'system').scale = [4, 4, 4]; // a scaled-up scene
  big.scene.geometries.find(g => g.id === 'moonText').placement = 'right';
  for (const artifact of [watchFixture.artifact, big]) {
    const { scene } = buildAnimationScene(artifact, { labelTexture });
    const sprite = scene.objects.get('moonTag').children[0];
    assert.equal(sprite.material.sizeAttenuation, false);
    assert.equal(sprite.material.depthTest, false);
    for (const [height, fov] of [[540, 50], [300, 30]]) {
      const view = camera(10, height, fov);
      scene.layoutLabels({ width: 960, height, camera: view });
      const world = sprite.getWorldScale(new THREE.Vector3()), plate = plateOf(sprite, view, height);
      assert.ok(Math.abs(plate.h - LABEL_PIXELS.max) < 1e-9, `close up: the largest plate (${plate.h})`);
      assert.ok(Math.abs(world.x / world.y - 2) < 1e-9, 'the text aspect is kept');
      assert.ok(near(sprite, artifact === big ? [-0.06, 0.5] : [0.5, -0.2], view, height), `placement ${sprite.center.toArray()}`);
      assert.equal(sprite.visible, artifact !== big, 'shown on screen; the scaled-up moon is off screen');
    }
    scene.dispose();
  }
  // Dollying out: the plate never grows, reaches the legible minimum, then the label is hidden rather than shrunk further.
  const { scene } = buildAnimationScene(watchFixture.artifact, { labelTexture });
  const sprite = scene.objects.get('moonTag').children[0], seen = [];
  for (const distance of [6, 10, 14, 18, 24, 40, 80, 160, 400]) {
    const view = camera(distance);
    scene.layoutLabels({ width: 960, height: 540, camera: view });
    seen.push(sprite.visible ? plateOf(sprite, view).h : 0);
  }
  const is = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(seen.every((h, i) => i === 0 || h <= seen[i - 1] + 1e-9), `never grows: ${seen}`);
  assert.ok(is(seen[0], LABEL_PIXELS.max) && seen.some(h => is(h, LABEL_PIXELS.min)), `max close, min farther: ${seen}`);
  assert.ok(seen.every(h => h === 0 || (h >= LABEL_PIXELS.min - 1e-9 && h <= LABEL_PIXELS.max + 1e-9)), 'never below the legible minimum');
  assert.equal(seen.at(-1), 0, 'far away: hidden');
  scene.dispose();
  assert.deepEqual([labelPixels(0.3, Infinity), labelPixels(0.3, 0), labelPixels(50, 300), labelPixels(0.01, 400)], [LABEL_PIXELS.max, LABEL_PIXELS.min, LABEL_PIXELS.max, LABEL_PIXELS.min]);
});

test('with too little room, lower-priority labels are hidden first: larger size hint, then scene order', () => {
  const crowded = structuredClone(watchFixture.artifact);
  crowded.scene.geometries.push({ id: 'otherText', kind: 'label', text: 'Moon orbit', size: 0.45 });
  crowded.scene.nodes.push({ id: 'orbitTag', parent: 'moon', geometry: 'otherText', position: [0, 0.6, 0] }); // after moonTag, but larger
  const { scene } = buildAnimationScene(crowded, { labelTexture });
  const shown = id => scene.objects.get(id).children[0].visible, states = new Set();
  for (let distance = 8; distance <= 400; distance += 4) {
    scene.layoutLabels({ width: 960, height: 540, camera: camera(distance) });
    states.add(`${shown('orbitTag')}/${shown('moonTag')}`);
  }
  assert.ok(!states.has('false/true'), 'the lower-priority label is never shown while the higher one is hidden');
  assert.deepEqual([...states].sort(), ['false/false', 'true/false', 'true/true']);
  scene.dispose();
});

test('label textures are painted at device pixels and repainted only when the size bucket, pixel ratio or text changes', () => {
  const { scene } = buildAnimationScene(watchFixture.artifact, { labelTexture });
  const sprite = scene.objects.get('moonTag').children[0];
  labels.length = 0;
  const view = camera(10);
  scene.layoutLabels({ width: 960, height: 540, camera: view });
  const owned = scene.owned();
  scene.layoutLabels({ width: 960, height: 540, camera: view });
  assert.deepEqual(labels, [{ text: 'Moon', pixels: LABEL_PIXELS.max, ratio: 1 }], 'painted once');
  const first = sprite.material.map;
  scene.layoutLabels({ width: 960, height: 540, camera: view, ratio: 2.25 });
  assert.deepEqual(labels.at(-1), { text: 'Moon', pixels: LABEL_PIXELS.max, ratio: 2.25 });
  assert.notEqual(sprite.material.map, first);
  assert.equal(scene.owned(), owned, 'the previous texture was freed');
  const plate = plateOf(sprite, view), whole = value => Math.abs(value * 2.25 - Math.round(value * 2.25)) < 1e-6;
  assert.ok(Math.abs(plate.h * 2.25 - Math.round(LABEL_PIXELS.max * 2.25)) < 1e-6, `whole device pixels tall (${plate.h * 2.25})`);
  assert.ok(whole(plate.x) && whole(plate.y), `on the device pixel grid (${plate.x}, ${plate.y})`);
  scene.apply({ nodes: { moonTag: { text: 'Moon, 90 deg' } } });
  scene.layoutLabels({ width: 960, height: 540, camera: view, ratio: 2.25 });
  assert.equal(labels.at(-1).text, 'Moon, 90 deg');
  assert.equal(labels.length, 3);
  scene.dispose();
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
  assert.ok(once.every(offset => offset === null || (Number.isFinite(offset.dx) && Number.isFinite(offset.dy))));
  assert.ok(once.slice(0, 5).every(Boolean), 'the first labels all find room');
  assert.ok(once.some(offset => offset === null), 'the rest get no room (hidden), never an overlap');
  const placed = moved(crowd.filter((_, i) => once[i]), once.filter(Boolean));
  assert.ok(placed.every((a, i) => placed.every((b, j) => i === j || !intersects(a, b))), 'no two placed plates overlap');
});

test('the scene declutters labels on screen with a leader to a moved plate; hidden, off-screen and behind-camera labels keep their placement', () => {
  const crowded = structuredClone(watchFixture.artifact);
  crowded.scene.geometries.push({ id: 'otherText', kind: 'label', text: 'Moon orbit' });
  crowded.scene.nodes.push({ id: 'orbitTag', parent: 'moon', geometry: 'otherText', position: [0, 0.6, 0] }); // the same point as moonTag
  const { scene } = buildAnimationScene(crowded, { labelTexture });
  const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.05, 2000);
  camera.position.set(0, 6, 8);
  camera.lookAt(0, 0, 0);
  const sprite = id => scene.objects.get(id).children[0], rect = id => plateOf(sprite(id), camera);
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.ok(!intersects(rect('moonTag'), rect('orbitTag')), 'the second label moved clear of the first');
  assert.ok(near(sprite('moonTag'), [0.5, -0.2], camera), 'the first keeps its placement');
  const { leader } = sprite('orbitTag').userData.label, plate = rect('orbitTag');
  assert.equal(sprite('moonTag').userData.label.leader.visible, false, 'no leader where nothing moved');
  assert.equal(leader.visible, true, 'a leader to the moved plate');
  const end = leader.localToWorld(new THREE.Vector3().fromBufferAttribute(leader.geometry.attributes.position, 1)).project(camera);
  const ex = (end.x + 1) / 2 * 960, ey = (1 - end.y) / 2 * 540;
  assert.ok(ex >= plate.x - 1e-6 && ex <= plate.x + plate.w + 1e-6 && Math.abs(ey - (plate.y + plate.h)) < 1e-6, `the leader ends on the plate's near edge (${ex}, ${ey})`);
  scene.apply({ nodes: { moonTag: { visible: false } } });
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.ok(near(sprite('orbitTag'), [0.5, -0.2], camera), 'nothing to avoid once the first is hidden');
  assert.equal(leader.visible, false);
  camera.position.set(0, 0.6, -20);
  camera.lookAt(0, 0.6, -40); // looking away: both behind the camera
  scene.apply({ nodes: { moonTag: { visible: true } } });
  scene.layoutLabels({ width: 960, height: 540, camera });
  assert.deepEqual(sprite('orbitTag').center.toArray(), [0.5, -0.2]);
  scene.dispose();
});

test('the Labels toggle hides object names with their leaders; captions and live values stay; the choice survives frames, camera moves and repaints', () => {
  const captioned = structuredClone(watchFixture.artifact);
  captioned.scene.geometries.push({ id: 'captionText', kind: 'label', text: 'Watch the moon', placement: 'center' }, { id: 'planetText', kind: 'label', text: 'Planet' });
  captioned.scene.nodes.push({ id: 'caption', geometry: 'captionText', position: [0, 2, 0] }, { id: 'planetTag', parent: 'planet', geometry: 'planetText', position: [0, 1, 0] });
  const { scene } = buildAnimationScene(captioned, { labelTexture });
  const shown = id => scene.objects.get(id).children[0].visible;
  const layout = (distance = 10, ratio = 1) => scene.layoutLabels({ width: 960, height: 540, camera: camera(distance), ratio });
  layout();
  assert.deepEqual(['caption', 'moonTag', 'planetTag'].map(shown), [true, true, true], 'on by default');
  assert.equal(scene.hasOptionalLabels(), true);
  scene.setOptionalLabels(false);
  for (const step of [() => layout(), () => scene.apply({ nodes: { moon: { position: [0, 0, 3] } } }), () => layout(14), () => layout(14, 2)]) {
    step();
    layout(14, 2);
    assert.deepEqual(['caption', 'moonTag', 'planetTag'].map(shown), [true, false, false], 'off: only the caption');
    assert.ok(['moonTag', 'planetTag'].every(id => !scene.objects.get(id).children[0].userData.label.leader.visible), 'leaders go with them');
  }
  scene.apply({ nodes: { moonTag: { text: 'Moon, 90 deg' } } }); // a live value: essential from now on
  layout();
  assert.deepEqual(['caption', 'moonTag', 'planetTag'].map(shown), [true, true, false]);
  scene.apply({ nodes: { moonTag: { text: 'Moon' } } });
  layout();
  assert.equal(shown('moonTag'), true);
  assert.equal(scene.hasOptionalLabels(), true, 'the planet name is still optional');
  scene.setOptionalLabels(true);
  layout();
  assert.deepEqual(['caption', 'moonTag', 'planetTag'].map(shown), [true, true, true]);
  scene.dispose();
  const bare = buildAnimationScene({ ...structuredClone(watchFixture.artifact), scene: { ...watchFixture.artifact.scene, nodes: watchFixture.artifact.scene.nodes.filter(node => node.id !== 'moonTag') } }, { labelTexture }).scene;
  assert.equal(bare.hasOptionalLabels(), false, 'nothing optional without object labels');
  bare.dispose();
});
