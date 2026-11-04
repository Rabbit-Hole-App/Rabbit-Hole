import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { linePoints, triangleCost, validateAnimationArtifact } from './contract.js';
import { ANIMATION_FIXTURES, INVALID_ANIMATION_FIXTURES, primitivesFixture, watchFixture } from './fixtures.js';
import { ARROW_LABELS, DECLUTTER, TRAIL_RADIUS_SHARE, buildAnimationScene, declutterLabels, LABEL_PIXELS, labelPixels } from './scene.js';

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
  // The texture is also asked for the widest plate the viewport allows (maxWidth), so a long label wraps instead of running off it.
  const maxWidth = 960 - 2 * LABEL_PIXELS.inset;
  assert.deepEqual(labels, [{ text: 'Moon', pixels: LABEL_PIXELS.max, ratio: 1, maxWidth }], 'painted once');
  const first = sprite.material.map;
  scene.layoutLabels({ width: 960, height: 540, camera: view, ratio: 2.25 });
  assert.deepEqual(labels.at(-1), { text: 'Moon', pixels: LABEL_PIXELS.max, ratio: 2.25, maxWidth });
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
  // The owner's reach (C10, DECLUTTER.reach, FX-AN-104): a side push of 94 would put the plate farther than 48 px from the point it names, so the push down by 22 clears instead.
  assert.deepEqual(declutterLabels([plate(0, 100), plate(10, 110, 'right')])[1], { dx: 0, dy: 22 });
  // Two pushes up (72) clear both plates above but are beyond the reach; the push down by 32 is within it, with one push allowed or many.
  assert.deepEqual(declutterLabels([plate(0, 100), plate(0, 60), plate(0, 100)])[2], { dx: 0, dy: 32 });
  assert.deepEqual(declutterLabels([plate(0, 100), plate(0, 60), plate(0, 100)], { steps: 1 })[2], { dx: 0, dy: 32 });
  // Many labels on one point: bounded, finite, the same every time, and whatever was placed does not overlap.
  const crowd = Array.from({ length: 24 }, () => plate(400, 300));
  const once = declutterLabels(crowd), again = declutterLabels(crowd);
  assert.deepEqual(once, again);
  assert.ok(once.every(offset => offset === null || (Number.isFinite(offset.dx) && Number.isFinite(offset.dy))));
  assert.ok(once.slice(0, 4).every(Boolean) && once.filter(Boolean).length === 4, 'the first four labels find room within the reach of their point (it was five before DECLUTTER.reach, C10)');
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

// aj_086fd46 (2026-11-02): no kind drew a curved surface a learner can see into. Filled discs at the contour heights covered the ball,
// trail and arrows (review 1); the repair's wireframe of curves was 1 px lines (review 2). A curve with a radius is a shaded tube, charged
// exactly as drawn; a curve without one stays a 1 px line, so saved artifacts draw as before.
test('a curve with a radius is a shaded tube the contract charges exactly: the saved SGD wireframe and a non-SGD orbit', () => {
  const saved = JSON.parse(readFileSync(new URL('../../../control-plane/test/fixtures/animation-aj_086fd46.json', import.meta.url), 'utf8')).repairedArtifact;
  const tubed = artifact => ({ ...artifact, scene: { ...artifact.scene, geometries: artifact.scene.geometries.map(g => (g.kind === 'curve' ? { ...g, radius: 0.04 } : g)) } });
  const drawnAs = (built, id) => { let found = null; built.scene.objects.get(id).traverse(o => { if (o.userData.nodeId === id && (o.isMesh || o.isLine)) found = o; }); return found; };
  for (const [name, artifact, curveNodes] of [['saved SGD wireframe', saved, ['c1', 'c2', 'c3', 'c4', 'axisW', 'axisB']], ['orbit', watchFixture.artifact, ['orbit']]]) {
    const plain = buildAnimationScene(artifact, { labelTexture });
    assert.equal(plain.ok, true, name);
    for (const id of curveNodes) assert.equal(drawnAs(plain, id).isLine, true, `${name} ${id}: without a radius, a line`);
    plain.scene.dispose();
    const checked = validateAnimationArtifact(tubed(artifact));
    assert.equal(checked.ok, true, `${name}: ${JSON.stringify(checked.issues?.slice(0, 2))}`);
    const built = buildAnimationScene(tubed(artifact), { labelTexture });
    for (const id of curveNodes) assert.equal(drawnAs(built, id).isMesh, true, `${name} ${id}: with a radius, a shaded tube`);
    const geometries = new Map(checked.value.scene.geometries.map(g => [g.id, g]));
    const charged = checked.value.scene.nodes.reduce((sum, node) => sum + (node.geometry ? triangleCost(geometries.get(node.geometry)) : 0), 0);
    assert.equal(trianglesOf(built.scene.root), charged, `${name} triangles`);
    built.scene.dispose();
  }
});

// ---- AN-19: the five client features drawn (surface_grid, trail_points, arrow_anchor, clamp; text readouts are the card's) ----
const primitives = () => structuredClone(primitivesFixture.artifact);
const built = (artifact = primitives()) => { const out = buildAnimationScene(artifact, { labelTexture }); assert.equal(out.ok, true, JSON.stringify(out.issues)); return out.scene; };
const holderOf = (scene, id) => scene.objects.get(id);
const drawn = (scene, id) => holderOf(scene, id).children.find(child => child.userData.nodeId === id);
const trailPoints = count => Array.from({ length: count }, (_, i) => [2 - i / 10, (2 - i / 10) ** 2 / 4 + 0.02, 0]);

test('the primitives compile to exactly the triangles and line points the contract charges for, and dispose frees them all', () => {
  const scene = built(), { counts } = primitivesFixture;
  assert.equal(trianglesOf(scene.root), counts.triangles, 'surface 40 + trail tube 1,584 + ghost tube 784 + ball 224 + arrow 48 + label 2');
  let lines = 0;
  scene.root.traverse(object => { if (object.isLine && !object.userData.leader) lines += object.geometry.attributes.position.count; });
  assert.ok(lines > 0 && lines <= 108, `the contours (${lines} points) stay within the 3 x 36 charged to them; a trail line has none here (both have radii)`);
  assert.equal(drawn(scene, 'bowl').children.length, 2, 'the surface mesh and its contour lines');
  scene.dispose();
  assert.equal(scene.owned(), 0);
});

test('surface_grid: vertex (r, c) sits at x = (c / (cols - 1) - 1/2) width, y = heights[r][c], z = (r / (rows - 1) - 1/2) depth, facing up; the contours lie on the surface at their levels', () => {
  const scene = built(), mesh = drawn(scene, 'bowl').children[0], position = mesh.geometry.attributes.position, heights = primitivesFixture.artifact.scene.geometries[0].heights;
  for (const [r, c] of [[0, 0], [0, 5], [4, 0], [4, 5], [2, 2]]) {
    const i = r * 6 + c;
    [position.getX(i), position.getY(i), position.getZ(i)].forEach((value, axis) => assert.ok(Math.abs(value - [(c / 5 - 0.5) * 5, heights[r][c], (r / 4 - 0.5) * 4][axis]) < 1e-6, `vertex ${r},${c} axis ${axis}: ${value}`));
  }
  const index = mesh.geometry.index, [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index.getX(k)));
  assert.ok(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y > 0, 'the first triangle faces +Y');
  const lines = drawn(scene, 'bowl').children[1].geometry.attributes.position, flat = heights.flat(), lo = Math.min(...flat), hi = Math.max(...flat);
  const expected = [1, 2, 3].map(k => lo + (k / 4) * (hi - lo) + (hi - lo) * 0.003); // evenly spaced strictly between lowest and highest, lifted by 0.003 of the range
  assert.ok(lines.count > 0 && lines.count % 2 === 0);
  for (let i = 0; i < lines.count; i += 1) assert.ok(expected.some(level => Math.abs(lines.getY(i) - level) < 1e-5), `point ${i} at ${lines.getY(i)}`);
  assert.ok(expected.every(level => Array.from({ length: lines.count }, (_, i) => lines.getY(i)).some(y => Math.abs(y - level) < 1e-5)), 'every level is drawn');
  scene.dispose();
});

test('a surface with no contours has no lines, and a flat one has none to draw', () => {
  const none = primitives(); delete none.scene.geometries[0].contours;
  const scene = built(none);
  assert.equal(drawn(scene, 'bowl').children.length, 1);
  scene.dispose();
  const level = primitives(); level.scene.geometries[0].heights = level.scene.geometries[0].heights.map(row => row.map(() => 1));
  const flatScene = built(level);
  assert.equal(drawn(flatScene, 'bowl').children.length, 1, 'the highest equals the lowest: no level to draw');
  flatScene.dispose();
});

test('contour lines are held to the charge even on a surface that crosses a level in every cell', () => {
  const noisy = primitives();
  noisy.scene.geometries[0].heights = Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => ((r + c) % 2 ? 1 : 0))); // a checkerboard: saddles everywhere
  noisy.scene.geometries[0].contours = 1;
  const scene = built(noisy), lines = drawn(scene, 'bowl').children[1].geometry.attributes.position.count;
  assert.equal(lines, 4 * (12 + 12 - 2), 'one level draws at most 4 (rows + cols - 2) points');
  scene.dispose();
});

test('trail_points: nothing is drawn until a frame carries points; then exactly those, as a tube; fewer points shrink it; none hides it', () => {
  const scene = built(), trail = drawn(scene, 'trail');
  assert.equal(trail.visible, false);
  assert.equal(trail.userData.empty, true);
  assert.deepEqual(scene.apply({ nodes: { trail: { points: trailPoints(21) } } }).clamped, []);
  assert.equal(trail.visible, true);
  assert.equal(trail.geometry.drawRange.count, 20 * 8 * 6, '21 points: 20 segments of 8 quads');
  assert.equal(trail.geometry.index.count, 99 * 8 * 6, 'the buffer is allocated once for max, the contract\'s 2 x 8 x (max - 1) triangles');
  const box = trail.geometry.boundingBox;
  assert.ok(Math.abs(box.max.x - 2.02) < 1e-6 && Math.abs(box.min.x - 0) < 0.021, 'the box covers the points plus the radius, not the unused buffer');
  assert.ok(box.min.x > -0.03, 'the zero-filled tail of the buffer does not reach the box');
  scene.apply({ nodes: { trail: { points: trailPoints(3) } } });
  assert.equal(trail.geometry.drawRange.count, 2 * 8 * 6);
  scene.apply({ nodes: { trail: { points: [] } } });
  assert.deepEqual([trail.visible, trail.userData.empty], [false, true]);
  scene.apply({ nodes: { trail: { points: trailPoints(1) } } });
  assert.equal(trail.visible, false, 'a tube needs two points');
  assert.equal(scene.apply({ nodes: { trail: { points: trailPoints(101) } } }).ok, false, 'more than max is refused and changes nothing');
  assert.equal(trail.visible, false);
  scene.dispose();
});

test('trail_points: a ghost is the same path at 40% opacity and half the radius; a trail with no radius is a line', () => {
  const scene = built();
  scene.apply({ nodes: { trail: { points: trailPoints(10) }, ghost: { points: trailPoints(10) } } });
  const trail = drawn(scene, 'trail'), ghost = drawn(scene, 'ghost');
  assert.deepEqual([trail.material.opacity, ghost.material.opacity, ghost.material.transparent], [1, 0.4, true]);
  const spread = mesh => { const p = mesh.geometry.attributes.position; return new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).distanceTo(new THREE.Vector3(...trailPoints(10)[0])); };
  assert.ok(Math.abs(spread(trail) - 0.02) < 1e-5 && Math.abs(spread(ghost) - 0.005) < 1e-5, `ring radius 0.02, and half of the ghost's declared 0.01: ${spread(trail)}, ${spread(ghost)}`);
  scene.dispose();
  assert.equal(scene.owned(), 0, 'the ghost material is freed too');
  const lined = primitives();
  lined.scene.geometries[1] = { id: 'pathTrail', kind: 'trail', max: 100, style: 'trail' };
  lined.scene.geometries[2] = { id: 'pathGhost', kind: 'trail', max: 50, style: 'ghost' };
  const lines = built(lined);
  assert.equal(drawn(lines, 'trail').isLine, true);
  lines.apply({ nodes: { trail: { points: trailPoints(7) }, ghost: { points: trailPoints(7) } } });
  assert.deepEqual([drawn(lines, 'trail').geometry.drawRange.count, drawn(lines, 'ghost').material.opacity], [7, 0.4]);
  lines.dispose();
});

test('arrow_anchor: an arrow with an offset starts that far up +Y and keeps its length; a tip label sits at the tip and stays there after a frame moves it', () => {
  const scene = built();
  scene.root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(drawn(scene, 'slope')); // the ball (the arrow's parent) is at y 1.1
  assert.ok(Math.abs(box.min.y - 1.2) < 1e-6 && Math.abs(box.max.y - 1.7) < 1e-6, `from the ball's centre + 0.1 to + 0.1 + 0.5: ${box.min.y} to ${box.max.y}`);
  assert.equal(drawn(scene, 'slope').userData.arrowOffset, 0.1);
  const tag = holderOf(scene, 'slopeTag');
  assert.deepEqual(tag.position.toArray().map(v => Math.round(v * 1e9) / 1e9), [0, 0.6, 0]);
  scene.apply({ nodes: { slopeTag: { position: [0.2, 0, 0] } } });
  assert.deepEqual(tag.position.toArray().map(v => Math.round(v * 1e9) / 1e9), [0.2, 0.6, 0], 'the program\'s position is kept and the tip anchor added');
  scene.dispose();
  const origin = primitives(); origin.scene.geometries[5].anchor = 'origin';
  const plain = built(origin);
  assert.deepEqual(holderOf(plain, 'slopeTag').position.toArray(), [0, 0, 0]);
  plain.dispose();
  const none = primitives(); delete none.scene.geometries[4].offset;
  const bare = built(none);
  assert.equal(drawn(bare, 'slope').userData.arrowOffset, 0);
  assert.deepEqual(holderOf(bare, 'slopeTag').position.toArray().map(v => Math.round(v * 1e9) / 1e9), [0, 0.5, 0], 'no offset: the tip is at the length');
  bare.dispose();
});

test('clamp: after the program\'s frame a sphere bound to a surface is held at the surface top or max, the node is marked diverged, and both y values are reported', () => {
  const scene = built(), ball = holderOf(scene, 'ball');
  // The fixture clamps at max 2.
  let result = scene.apply({ nodes: { ball: { position: [0, 5.6, 0] } }, readouts: { loss: 5.6 } });
  assert.deepEqual(result.clamped, [{ node: 'ball', axes: ['y'], trueY: 5.6, y: 2, trueAt: [0, 5.6, 0], drawnAt: [0, 2, 0] }]);
  assert.deepEqual([ball.position.y, ball.userData.diverged], [2, true]);
  assert.equal(result.value.readouts.loss, 5.6, 'readouts keep the true value');
  result = scene.apply({ nodes: {} });
  assert.deepEqual(result.clamped, [{ node: 'ball', axes: ['y'], trueY: 5.6, y: 2, trueAt: [0, 5.6, 0], drawnAt: [0, 2, 0] }], 'a frame that does not move it clamps the position the program last gave');
  result = scene.apply({ nodes: { ball: { position: [1, 1.5, 0] } } });
  assert.deepEqual([result.clamped, ball.position.y, ball.userData.diverged], [[], 1.5, false]);
  scene.dispose();
  const open = primitives(); delete open.scene.nodes[3].clampTo.max;
  const top = built(open);
  assert.deepEqual(top.apply({ nodes: { ball: { position: [0, 5.6, 0] } } }).clamped, [{ node: 'ball', axes: ['y'], trueY: 5.6, y: 0.0625, trueAt: [0, 5.6, 0], drawnAt: [0, 0.0625, 0] }], 'without max, held at the surface under it (0.0625 at x 0, z 0), not at the corner height of its box');
  top.dispose();
});

test('clamp: world y, through a moved and scaled parent, and through a surface that is itself moved', () => {
  const artifact = primitives();
  artifact.scene.nodes.splice(3, 1, { id: 'rig', position: [0, 1, 0], scale: [2, 2, 2] }, { ...artifact.scene.nodes[3], parent: 'rig', position: [0, 0, 0] });
  artifact.scene.nodes[artifact.scene.nodes.findIndex(n => n.id === 'slope')].parent = 'ball';
  const scene = built(artifact);
  // rig at y 1 scaled x2: a ball at local y 3 is at world y 7; held at world 2 means local (2 - 1) / 2 = 0.5.
  const result = scene.apply({ nodes: { ball: { position: [0, 3, 0] } } });
  assert.deepEqual(result.clamped, [{ node: 'ball', axes: ['y'], trueY: 7, y: 2, trueAt: [0, 7, 0], drawnAt: [0, 2, 0] }]);
  assert.ok(Math.abs(holderOf(scene, 'ball').position.y - 0.5) < 1e-9);
  scene.dispose();
});

// FX-AN-072: an arrow's offset is a distance outside the node's scale. A magnitude arrow is a unit arrow whose node scale is [1, length, 1]; its tail still starts `offset`
// from the node's origin and its tip, where a tip label sits, is offset + length x scale. A frame that rescales the arrow moves the tip, never the tail.
test('arrow_anchor: under a scaled arrow node the offset stays a distance and the tip is offset + length x scale, before and after a frame rescales it', () => {
  const artifact = primitives();
  artifact.scene.geometries[4] = { id: 'slopeArrow', kind: 'arrow', length: 1, offset: 0.1 };
  artifact.scene.nodes.find(n => n.id === 'slope').scale = [1, 2, 1];
  const scene = built(artifact);
  const world = () => { scene.root.updateWorldMatrix(true, true); const ball = holderOf(scene, 'ball').getWorldPosition(new THREE.Vector3()); const box = new THREE.Box3().setFromObject(drawn(scene, 'slope')); const tag = holderOf(scene, 'slopeTag').getWorldPosition(new THREE.Vector3()); return { tail: box.min.y - ball.y, tip: box.max.y - ball.y, tag: tag.y - ball.y }; };
  const near = (value, expected, what) => assert.ok(Math.abs(value - expected) < 1e-6, `${what}: ${value} != ${expected}`);
  let at = world();
  near(at.tail, 0.1, 'tail at the offset, not 0.2'); near(at.tip, 0.1 + 2, 'tip at offset + length x scale'); near(at.tag, 0.1 + 2, 'the tip label at the tip');
  scene.apply({ nodes: { slope: { scale: [1, 4, 1] } } });
  at = world();
  near(at.tail, 0.1, 'rescaled: the tail has not moved'); near(at.tip, 0.1 + 4, 'rescaled tip'); near(at.tag, 0.1 + 4, 'the label follows the tip');
  scene.apply({ nodes: { slopeTag: { position: [0.3, 0, 0] } } });
  assert.ok(Math.abs(holderOf(scene, 'slopeTag').position.x - 0.3) < 1e-9 && Math.abs(world().tag - 4.1) < 1e-6, 'a moved label keeps its program position and its tip');
  scene.dispose();
});

// The golden SGD artifact (testdata/sgd-golden.json, built by build-sgd-golden.mjs against the AN-18 contract) through this renderer.
test('the golden SGD artifact compiles to the charged counts, its surface sits where the builder puts it (row along z, column along x, centred), and a diverged ball is clamped', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  const scene = built(golden), geometries = new Map(golden.scene.geometries.map(g => [g.id, g]));
  const charged = golden.scene.nodes.reduce((sum, node) => sum + (node.geometry ? triangleCost(geometries.get(node.geometry)) : 0), 0);
  assert.equal(trianglesOf(scene.root), charged);
  let lines = 0;
  scene.root.traverse(object => { if (object.isLine && !object.userData.leader) lines += object.geometry.attributes.position.count; });
  assert.ok(lines > 0 && lines <= golden.scene.nodes.reduce((sum, node) => sum + (node.geometry ? linePoints(geometries.get(node.geometry)) : 0), 0), `${lines} line points within the charge`);
  const bowl = golden.scene.nodes.find(node => geometries.get(node.geometry)?.kind === 'surface'), surface = geometries.get(bowl.geometry);
  const position = drawn(scene, bowl.id).children[0].geometry.attributes.position, rows = surface.heights.length, cols = surface.heights[0].length;
  for (const [r, c] of [[0, 0], [0, cols - 1], [rows - 1, 0], [rows - 1, cols - 1], [5, 17]]) {
    const i = r * cols + c, expected = [(c / (cols - 1) - 0.5) * surface.width, surface.heights[r][c], (r / (rows - 1) - 0.5) * surface.depth];
    [position.getX(i), position.getY(i), position.getZ(i)].forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-5, `vertex ${r},${c} axis ${axis}: ${value} != ${expected[axis]}`));
  }
  const ball = golden.scene.nodes.find(node => node.clampTo), top = ball.clampTo.max ?? surfaceHeight(surface.heights, surface.width, surface.depth, 0, 0); // no explicit max: the surface under the ball
  const result = scene.apply({ nodes: { [ball.id]: { position: [0, 10, 0] } } });
  assert.deepEqual(result.clamped.map(({ node, trueY }) => [node, trueY]), [[ball.id, 10]]);
  assert.ok(Math.abs(result.clamped[0].y - top) < 1e-5, `held at the surface under it (${top}), not ${result.clamped[0].y}`);
  scene.dispose();
});

// FX-AN-072 on the real golden: its variable-length arrows are unit arrows under scale [1, length, 1] with offset = the ball radius; the tail stays that far from the arrow's origin at any length.
test('the golden SGD arrows keep their tails at the offset whatever length a frame scales them to', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  const geometries = new Map(golden.scene.geometries.map(g => [g.id, g])), scene = built(golden);
  const arrows = golden.scene.nodes.filter(node => geometries.get(node.geometry)?.kind === 'arrow' && geometries.get(node.geometry).offset > 0);
  assert.ok(arrows.length >= 2, 'the golden has its two offset arrows');
  for (const length of [0.05, 0.4, 1, 3]) {
    scene.apply({ nodes: Object.fromEntries(arrows.map(node => [node.id, { scale: [1, length, 1] }])) });
    scene.root.updateWorldMatrix(true, true);
    for (const node of arrows) {
      const tail = drawn(scene, node.id).getWorldPosition(new THREE.Vector3()), origin = holderOf(scene, node.id).getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(tail.distanceTo(origin) - geometries.get(node.geometry).offset) < 1e-6, `${node.id} at length ${length}: the tail is ${tail.distanceTo(origin)} from the origin`);
    }
  }
  scene.dispose();
});

// FX-AN-092: a lit tube needs vertex normals; with none, MeshStandardMaterial draws it pure black. Every vertex of the drawn rings has a unit normal pointing away from the path.
test('a trail tube has a unit normal on every drawn vertex, pointing out from its path; a ghost too', () => {
  const scene = built();
  scene.apply({ nodes: { trail: { points: trailPoints(21) }, ghost: { points: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [1, 1, 1], [0, 1, 1]] } } }); // the ghost turns a corner and repeats a point
  for (const [id, count] of [['trail', 21], ['ghost', 5]]) {
    const geometry = drawn(scene, id).geometry, normal = geometry.attributes.normal, position = geometry.attributes.position;
    assert.ok(normal && normal.itemSize === 3 && normal.count === position.count, `${id} has a normal for every vertex`);
    for (let i = 0; i < count * 8; i += 1) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      assert.ok(Math.abs(n.length() - 1) < 1e-5, `${id} vertex ${i}: normal length ${n.length()}`);
    }
  }
  const geometry = drawn(scene, 'trail').geometry, ring = i => Array.from({ length: 8 }, (_, s) => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i * 8 + s));
  const centre = ring(5).reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(8);
  ring(5).forEach((vertex, s) => assert.ok(new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, 5 * 8 + s).dot(vertex.clone().sub(centre)) > 0, `ring 5 vertex ${s} faces out`));
  scene.dispose();
});

// FX-AN-094 (Gate 2 on C4: the reviewer's most frequent finding was the author's own camera hiding the ball behind the bowl's near wall): a surface is a one-sided sheet.
// Seen from outside, the near wall of a height field is its back face; it is not drawn, so the floor, marker, paths and arrows show from any camera.
test('a surface node is drawn front side only, on its own material; every other node keeps its material', () => {
  const artifact = primitives();
  artifact.scene.geometries.push({ id: 'floorPlane', kind: 'plane', width: 1, height: 1 });
  artifact.scene.nodes.push({ id: 'shared', geometry: 'floorPlane', material: 'bowlBlue' }); // another node on the surface's material
  const scene = built(artifact), mesh = drawn(scene, 'bowl').children[0];
  assert.equal(mesh.material.side, THREE.FrontSide);
  for (const id of ['shared', 'ball', 'trail']) assert.equal(drawn(scene, id).material.side, THREE.DoubleSide, `${id} keeps its material`);
  assert.notEqual(mesh.material, drawn(scene, 'shared').material, 'the surface has its own clone, so the shared one stays double-sided');
  // The clone follows the frame's material updates, as the shared material does.
  scene.apply({ materials: { bowlBlue: { color: '#ff0000', opacity: 0.5 } } });
  for (const material of [mesh.material, drawn(scene, 'shared').material]) assert.deepEqual([material.color.getHexString(), material.opacity, material.transparent], ['ff0000', 0.5, true]);
  scene.apply({ materials: { bowlBlue: { opacity: 1 } } });
  assert.deepEqual([mesh.material.opacity, mesh.material.transparent], [1, false]);
  // Freed once, with the scene.
  let disposed = 0;
  mesh.material.addEventListener('dispose', () => { disposed += 1; });
  scene.dispose();
  assert.deepEqual([disposed, scene.owned()], [1, 0]);
});

test('from a low camera outside the bowl the near wall does not hide the ball: the ray to it meets nothing nearer', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  const scene = built(golden), ball = [0.3, 0.8703864635259788, 1.6]; // the golden's ball at its start (learning rate 0.1): inside the bowl, below the rim
  scene.apply({ nodes: { ball: { position: ball } } });
  scene.root.updateWorldMatrix(true, true);
  const from = new THREE.Vector3(7, 4, 0.5), to = new THREE.Vector3(...ball), ray = new THREE.Raycaster(from, to.clone().sub(from).normalize()), reach = from.distanceTo(to);
  const hits = ray.intersectObject(drawn(scene, 'bowl').children[0]);
  assert.ok(hits.every(hit => hit.distance > reach), `the surface's first hit is ${hits[0]?.distance} but the ball is at ${reach}`);
  scene.dispose();
});

// FX-AN-095 by geometry: a contour line is lifted a hair above the surface, on its front side. With the surface front-side only, no surface is ever between a camera and a contour
// point it can see: the first surface hit on the ray to each point is at the point or beyond it (the near wall, seen from its back, is not there to hide it).
test('no contour point is hidden behind the surface from a low camera outside the bowl', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  const scene = built(golden);
  scene.root.updateWorldMatrix(true, true);
  const surface = drawn(scene, 'bowl'), mesh = surface.children[0], points = surface.children[1].geometry.attributes.position, from = new THREE.Vector3(7, 4, 0.5);
  const at = new THREE.Vector3();
  assert.ok(points.count > 100, 'the golden has contour lines');
  for (let i = 0; i < points.count; i += 1) {
    at.fromBufferAttribute(points, i);
    const reach = from.distanceTo(at), hit = new THREE.Raycaster(from, at.clone().sub(from).normalize()).intersectObject(mesh)[0];
    assert.ok(!hit || hit.distance >= reach - 1e-4, `contour point ${i} is hidden: the surface is hit at ${hit?.distance}, the point at ${reach}`);
  }
  scene.dispose();
});

// C9 (owner): a label that names an arrow is the renderer's to keep in proportion. C7 job 2: a "Next step / rate" plate five times longer than its short arrow, and a step label
// kept on an arrow too short to see (the author's own hide threshold of 0.25 was too low). The plate is wrapped to at most ARROW_LABELS.cap times the arrow's length on screen,
// and the label is hidden when the arrow is shorter than ARROW_LABELS.hide pixels.
const arrowScene = text => {
  const artifact = primitives();
  artifact.scene.nodes = artifact.scene.nodes.filter(n => ['ball', 'slope', 'slopeTag'].includes(n.id));
  delete artifact.scene.nodes.find(n => n.id === 'ball').clampTo;
  artifact.scene.nodes.find(n => n.id === 'ball').position = [0, 0, 0];
  artifact.scene.geometries.find(g => g.id === 'slopeText').text = text;
  artifact.scene.geometries.push({ id: 'floorBox', kind: 'box', size: [6, 0.1, 6] }); // a large part, so the scene's span leaves room for plates
  artifact.scene.nodes.push({ id: 'floor', geometry: 'floorBox', material: 'bowlBlue', position: [0, -1, 0] });
  const wrapTexture = (words, { pixels, maxWidth }) => { const full = words.length * pixels * 0.5, rows = Math.max(1, Math.ceil(full / maxWidth)); return { texture: new THREE.Texture(), aspect: Math.min(full, maxWidth) / (pixels * rows), rows }; };
  const out = buildAnimationScene(artifact, { labelTexture: wrapTexture });
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  return out.scene;
};
const lookAt = distance => { const view = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 1000); view.position.set(0, 0.3, distance); view.lookAt(0, 0.3, 0); view.updateMatrixWorld(); return view; };
// The arrow is 0.5 long; at fov 50 on a 540 px view one unit is 579 / distance pixels: 48 px at distance 6, 14 px at distance 20.
const tagBox = (scene, distance) => scene.layoutLabels({ width: 960, height: 540, camera: lookAt(distance) }).find(box => box.id === 'slopeTag');

test('an arrow label is hidden when its arrow is shorter than ARROW_LABELS.hide on screen, and shown (at most as wide as the cap) when it is not', () => {
  assert.deepEqual(ARROW_LABELS, { hide: 24, cap: 3, minWidth: 72 });
  const scene = arrowScene('Next step / rate of change');
  const rows = scene.objects.get('slopeTag').children[0], far = tagBox(scene, 20), hidden = !rows.visible, near = tagBox(scene, 6);
  assert.deepEqual([far, hidden], [undefined, true], 'a 14 px arrow carries no label: it is not laid out and its plate is hidden');
  assert.equal(tagBox(scene, 6).shown, true, 'a 48 px arrow does');
  assert.ok(near.w <= Math.max(ARROW_LABELS.minWidth, ARROW_LABELS.cap * 48) + 8, `the plate is ${near.w} px wide against an arrow of 48 px`);
  assert.ok(near.h > LABEL_PIXELS.max * 1.5, `a long text wraps onto more lines (${near.h} px tall) instead of running on`);
  assert.equal(rows.visible, true);
  scene.dispose();
});

test('an arrow label that already fits is untouched, and a label on something that is not an arrow keeps the full width', () => {
  const scene = arrowScene('Step');
  const box = tagBox(scene, 6);
  assert.equal(box.shown, true);
  assert.ok(box.h < LABEL_PIXELS.max * 1.5, 'one line');
  scene.dispose();
  const moon = buildAnimationScene(watchFixture.artifact, { labelTexture });
  const view = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 1000);
  view.position.set(0, 2, 10); view.lookAt(0, 0, 0); view.updateMatrixWorld();
  assert.equal(moon.scene.layoutLabels({ width: 960, height: 540, camera: view }).find(b => b.id === 'moonTag').shown, true, 'a label on a sphere is not an arrow label');
  moon.scene.dispose();
});

// C9 (owner): a trail's polyline is an obstacle for label placement (soft, like a marker). C7 jobs 6 and 7: "Minimum" and "Next step" labels sat on the zig-zag.
const trailLabelScene = () => {
  const artifact = primitives();
  artifact.scene.nodes = artifact.scene.nodes.filter(n => ['ball', 'trail'].includes(n.id));
  delete artifact.scene.nodes.find(n => n.id === 'ball').clampTo;
  artifact.scene.nodes.find(n => n.id === 'ball').position = [0, 0, 0];
  artifact.scene.geometries.push({ id: 'rateText', kind: 'label', text: 'Rate', placement: 'above' }, { id: 'floorBox', kind: 'box', size: [6, 0.1, 6] });
  artifact.scene.nodes.push({ id: 'rateTag', parent: 'ball', geometry: 'rateText' }, { id: 'floor', geometry: 'floorBox', material: 'bowlBlue', position: [0, -1, 0] });
  const out = buildAnimationScene(artifact, { labelTexture });
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  return out.scene;
};
const front = () => { const view = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 1000); view.position.set(0, 0.5, 10); view.lookAt(0, 0.5, 0); view.updateMatrixWorld(); return view; };
// A path along y = 0.25 passes through the place just above the ball (58 px per unit at distance 10: 14 px up) where the plate would sit.
const path = [[-1.5, 0.25, 0], [-0.5, 0.2, 0], [0.5, 0.3, 0], [1.5, 0.25, 0]];
const screenY = (scene, point) => { const v = new THREE.Vector3(...point).project(front()); return (1 - v.y) / 2 * 540; };
const crosses = (box, scene) => path.some(point => { const y = screenY(scene, point); return y >= box.y - 2 && y <= box.y + box.h + 2; });

test('a label is moved off a trail\'s path when there is room, and is not dropped when there is none', () => {
  const scene = trailLabelScene();
  const before = scene.layoutLabels({ width: 960, height: 540, camera: front() }).find(b => b.id === 'rateTag');
  assert.equal(before.shown, true);
  assert.equal(crosses(before, scene), true, 'with no path the plate sits just above its ball, where the path will run (the control)');
  // The same plate with the path drawn: a clean place beside the path, not on it.
  scene.apply({ nodes: { trail: { points: path } } });
  const after = scene.layoutLabels({ width: 960, height: 540, camera: front() }).find(b => b.id === 'rateTag');
  assert.equal(after.shown, true, 'still shown');
  assert.equal(crosses(after, scene), false, `the plate (y ${after.y} to ${after.y + after.h}) is off the path`);
  scene.dispose();
});

test('a label with no clear spot beside a dense path keeps its place: the path is a soft obstacle, never a reason to drop a label', () => {
  const scene = trailLabelScene();
  const net = Array.from({ length: 100 }, (_, i) => [-3 + 6 * i / 99, i % 2 ? -2 : 2, 0]); // a zig-zag over the whole view
  scene.apply({ nodes: { trail: { points: net } } });
  const box = scene.layoutLabels({ width: 960, height: 540, camera: front() }).find(b => b.id === 'rateTag');
  assert.equal(box?.shown, true);
  scene.dispose();
});

// C9 (owner): a marker or a path point drawn below the surface it sits on is detected. C7 job 3 (aj_2f17bed198df4482b5e2e7e170dcdd31): the surface was drawn at twice the height the program
// uses, so the balls and trails were buried. The fixture's program puts the ball at y = x^2 / 4 + 0.1 and its path at y = x^2 / 4 + 0.02 over a surface y = (x^2 + z^2) / 4.
const doubled = () => { const a = primitives(); a.scene.geometries[0].heights = a.scene.geometries[0].heights.map(row => row.map(h => 2 * h)); return a; };
const atX = x => ({ nodes: { ball: { position: [x, x * x / 4 + 0.1, 0] }, trail: { points: [[x, x * x / 4 + 0.02, 0], [x - 0.2, (x - 0.2) ** 2 / 4 + 0.02, 0]] } } });

test('buried: a ball and a path under a surface drawn at twice the program\'s height are reported with how far under; the right surface reports nothing', () => {
  const scene = built(doubled());
  scene.apply(atX(1.5));
  const found = scene.buried();
  assert.deepEqual(found.map(b => b.node), ['trail', 'ball'], JSON.stringify(found)); // scene order
  const ball = found.find(b => b.node === 'ball'), trail = found.find(b => b.node === 'trail');
  // The surface at x = 1.5, z = 0 is 2 x 0.5625 = 1.125; the ball is at 0.6625 and the first path point at 0.5825.
  assert.deepEqual([ball.y, ball.surfaceY], [0.6625, 1.125]);
  assert.deepEqual([trail.y, trail.surfaceY], [0.5825, 1.125], 'the path\'s worst point');
  scene.dispose();
  const right = built();
  right.apply(atX(1.5));
  assert.deepEqual(right.buried(), [], 'on the surface the program draws for');
  for (const x of [-2, 0, 0.4, 2]) { right.apply(atX(x)); assert.deepEqual(right.buried(), [], `x ${x}`); }
  right.dispose();
});

test('buried: nothing is reported for a ball off the surface, in the air, or clamped; a surface with no clamped marker and a trail reports nothing for them', () => {
  const scene = built(doubled());
  scene.apply({ nodes: { ball: { position: [3.5, -5, 0] } } }); // beyond the footprint (x in -2.5 to 2.5): not on this surface
  assert.deepEqual(scene.buried(), []);
  scene.apply({ nodes: { ball: { position: [1.5, 5.6, 0] } } }); // above, and held at the clamp
  assert.deepEqual(scene.buried(), []);
  scene.apply({ nodes: { ball: { position: [1.5, 1.2, 0] } } }); // 0.075 above the doubled surface (1.125): resting on it, not under it
  assert.deepEqual(scene.buried(), []);
  scene.apply({ nodes: { ball: { position: [1.5, 1.0, 0] } } }); // 0.125 below the doubled surface: more than half a ball radius (0.05) and more than 2% of its height range (0.1)
  assert.equal(scene.buried().length, 1);
  scene.dispose();
  const none = primitives(); delete none.scene.nodes.find(n => n.id === 'ball').clampTo;
  const loose = built(none);
  loose.apply({ nodes: { ball: { position: [1.5, -3, 0] } } });
  assert.deepEqual(loose.buried().map(b => b.node), [], 'a ball with no clampTo has no surface it sits on');
  loose.dispose();
});

// Owner decision 30 (C10; FX-AN-093, FX-AN-103): a marker bound to a surface is held at the bowl's RIM in x and z as well as y. Readouts stay the program's own numbers, and the trace says
// which axes were held and the true and the drawn position. The fixture's surface is 5 wide and 4 deep (x in -2.5 to 2.5, z in -2 to 2), its clamp at max 2.
test('decision 30: a diverged marker is held at the rim in x and z as well as y, its readouts stay true and the clamp reports the axes and both positions', () => {
  const scene = built(), ball = holderOf(scene, 'ball');
  const result = scene.apply({ nodes: { ball: { position: [3.675, 10.84, 0.4] } }, readouts: { loss: 20.338, status: 'diverged' } });
  // The fixture's clamp says max 2: an explicit ceiling wins (C12, FX-AN-116: without one, the surface at the rim does).
  const tidy = list => list.map(c => ({ ...c, y: Math.round(c.y * 1e6) / 1e6, drawnAt: c.drawnAt.map(v => Math.round(v * 1e6) / 1e6) }));
  assert.deepEqual(tidy(result.clamped), [{ node: 'ball', axes: ['x', 'y'], trueY: 10.84, y: 2, trueAt: [3.675, 10.84, 0.4], drawnAt: [2.5, 2, 0.4] }]);
  assert.deepEqual(ball.position.toArray().map(v => Math.round(v * 1e6) / 1e6), [2.5, 2, 0.4], 'drawn at the rim');
  assert.deepEqual([result.value.readouts.loss, result.value.readouts.status], [20.338, 'diverged'], 'the readouts keep the true numbers');
  assert.equal(ball.userData.diverged, true);
  // z too, and both ends; a frame that does not move the marker holds it again from the program's position.
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [-9, 3, -7] } } }).clamped.map(c => [c.axes, c.drawnAt]), [[['x', 'y', 'z'], [-2.5, 2, -2]]]);
  assert.deepEqual(scene.apply({ nodes: {} }).clamped.map(c => c.trueAt), [[-9, 3, -7]]);
  scene.dispose();
});

test('decision 30: a marker inside the footprint is untouched; one beyond the rim below the ceiling is held in x or z only; one with no clampTo is never held', () => {
  const scene = built(), ball = holderOf(scene, 'ball');
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [1, 1.5, 0.4] } } }).clamped, [], 'inside the footprint and under the ceiling');
  assert.deepEqual(ball.position.toArray(), [1, 1.5, 0.4]);
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [3, 0.5, 0] } } }).clamped.map(c => [c.axes, c.drawnAt]), [[['x'], [2.5, 0.5, 0]]], 'beyond the rim in x only: its own height is under the ceiling');
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [0, 0.5, 2.2] } } }).clamped.map(c => [c.axes, c.drawnAt]), [[['z'], [0, 0.5, 2]]], 'beyond the rim in z only');
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [2.5, 2, -2] } } }).clamped, [], 'exactly on the rim and at the ceiling is inside');
  scene.dispose();
  const none = primitives(); delete none.scene.nodes.find(n => n.id === 'ball').clampTo;
  const loose = built(none);
  assert.deepEqual(loose.apply({ nodes: { ball: { position: [9, 9, 9] } } }).clamped, []);
  assert.deepEqual(holderOf(loose, 'ball').position.toArray(), [9, 9, 9]);
  loose.dispose();
});

test('decision 30: the golden\'s diverged ball (x 3.675 at learning rate 1.5) is drawn at the rim of its 4 by 4 bowl', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  const scene = built(golden), ball = golden.scene.nodes.find(node => node.clampTo);
  const result = scene.apply({ nodes: { [ball.id]: { position: [3.675, 10.8419, 0.4] } } });
  const top = Math.fround(Math.max(...golden.scene.geometries.find(g => g.kind === 'surface').heights.flat())); // the surface mesh's highest vertex (a float32)
  const heights = golden.scene.geometries.find(g => g.kind === 'surface').heights, radius = golden.scene.geometries.find(g => g.id === golden.scene.nodes.find(n => n.id === ball.id).geometry).radius;
  const [held] = result.clamped;
  assert.deepEqual([held.axes, held.trueAt, held.drawnAt.slice(0, 1), held.drawnAt.slice(2)], [['x', 'y'], [3.675, 10.8419, 0.4], [2], [0.4]]);
  assert.ok(Math.abs(held.drawnAt[1] - surfaceHeight(heights, 4, 4, 2, 0.4)) < 1e-5, `drawn on the surface at the rim: ${held.drawnAt[1]}`);
  const end = [2, surfaceHeight(heights, 4, 4, 2, 0.4) + 0.06, 0.4]; // where a program that holds its path at the surface ends it
  assert.ok(Math.abs(held.drawnAt[1] - end[1]) <= radius, `the trail ends within a ball radius (${radius}) of the ball`);
  assert.ok(held.drawnAt[1] < 4, 'below the old ceiling it was pinned to');
  assert.ok(held.drawnAt[1] <= top + 1e-5, "never above the surface mesh's highest vertex (lane f's golden, from its own heights)");
  scene.dispose();
});

// Owner order (C10; FX-AN-104): a plate stays near its anchor. C9 job 7: a "Lowest point" label about 100 px to the right of its dot; C7 job 7: rate tags pushed far from their balls.
// The distance is how far the plate lies from the point it names (the plate's nearest edge to the anchor), at most DECLUTTER.reach pixels; a plate with no clear spot that near stays
// where it is (an essential one) or is left out (an optional one), and is never moved farther.
test('a plate is moved to a clear spot only within DECLUTTER.reach of its anchor; with none that near it stays (essential) or is left out (optional), never farther', () => {
  assert.equal(DECLUTTER.reach, 48);
  const plate = essential => ({ x: 100, y: 100, w: 80, h: 20, placement: 'above', essential });
  const line = { x1: 0, y1: 110, x2: 400, y2: 110, half: 3 }; // an arrow across the plate: the nearest clear spot is a push of about 17 px
  const bounds = { x: 0, y: 0, w: 400, h: 300 };
  const near = declutterLabels([plate(false)], { bounds, obstacles: [line] })[0];
  assert.ok(near && Math.hypot(near.dx, near.dy) > 0 && Math.hypot(near.dx, near.dy) <= DECLUTTER.reach, `moved a short way: ${JSON.stringify(near)}`);
  // Up (about 21 px from the point) is too far for a reach of 5; the other side of the point (4 px) is not.
  assert.deepEqual(declutterLabels([plate(false)], { bounds, obstacles: [line], reach: 5 })[0], { dx: 0, dy: 28 });
  // A wall of arrows: every clear spot is far; the plate does not travel to it.
  const wall = Array.from({ length: 12 }, (_, i) => ({ x1: 0, y1: 40 + 14 * i, x2: 400, y2: 40 + 14 * i, half: 3 }));
  const walled = declutterLabels([plate(true)], { bounds, obstacles: wall })[0];
  assert.ok(Math.hypot(walled.dx, walled.dy) <= DECLUTTER.reach, `an essential plate behind a wall of arrows stays within ${DECLUTTER.reach} px: ${JSON.stringify(walled)}`);
  assert.equal(declutterLabels([plate(false)], { bounds, obstacles: wall })[0], null);
  // Unobstructed: where it always was.
  assert.deepEqual(declutterLabels([plate(false)], { bounds, obstacles: [] })[0], { dx: 0, dy: 0 });
});

// C12 (owner order, c): a trail tube is drawn at most TRAIL_RADIUS_SHARE (0.35) x the radius of the smallest sphere clamped to the same surface (the ball), whatever the artifact
// declares, so a path never swallows the marker that walks it (C11: the golden's 0.08 tube against its 0.12 ball). A ghost is still half its trail's drawn radius.
const tubeRadius = (scene, id) => { const p = drawn(scene, id).geometry.attributes.position, to = n => new THREE.Vector3(p.getX(n), p.getY(n), p.getZ(n)); return to(0).distanceTo(new THREE.Vector3(...trailPoints(10)[0])); };
const goldenTrail = change => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  change?.(golden);
  const scene = built(golden);
  scene.apply({ nodes: { trail: { points: trailPoints(10) }, ghost: { points: trailPoints(10) } } });
  return { golden, scene };
};

test('a trail tube is capped at 0.35 of the smallest clamped ball\'s radius: the golden\'s 0.08 against its 0.12 ball is drawn at 0.042, its ghost at half of that', () => {
  assert.equal(TRAIL_RADIUS_SHARE, 0.35);
  const { golden, scene } = goldenTrail();
  const radius = id => golden.scene.geometries.find(g => g.id === golden.scene.nodes.find(n => n.id === id).geometry).radius;
  assert.deepEqual([radius('trail'), radius('ball')], [0.08, 0.12], 'the golden as authored (a lane may retune it: the cap is relative)');
  assert.ok(Math.abs(tubeRadius(scene, 'trail') - 0.35 * radius('ball')) < 1e-5, `the trail tube is ${tubeRadius(scene, 'trail')} (0.042 expected)`);
  assert.ok(Math.abs(tubeRadius(scene, 'trail') - 0.042) < 1e-5);
  assert.ok(Math.abs(tubeRadius(scene, 'ghost') - 0.021) < 1e-5, `the ghost is half the capped radius: ${tubeRadius(scene, 'ghost')}`);
  scene.dispose();
});

test('a trail whose declared radius is already under the cap is unchanged; a scene with no clamped sphere keeps the declared radius; the cap follows the ball\'s radius and scale, and the smallest ball', () => {
  const small = goldenTrail(g => { g.scene.geometries.find(x => x.id === 'runPath').radius = 0.02; g.scene.geometries.find(x => x.id === 'keptPath').radius = 0.02; });
  assert.ok(Math.abs(tubeRadius(small.scene, 'trail') - 0.02) < 1e-5, 'under the cap: as declared');
  assert.ok(Math.abs(tubeRadius(small.scene, 'ghost') - 0.01) < 1e-5, 'and its ghost is half the declared radius, as before');
  small.scene.dispose();
  const loose = goldenTrail(g => { delete g.scene.nodes.find(n => n.id === 'ball').clampTo; });
  assert.ok(Math.abs(tubeRadius(loose.scene, 'trail') - 0.08) < 1e-5, 'no clamped sphere: the declared radius is kept');
  assert.ok(Math.abs(tubeRadius(loose.scene, 'ghost') - 0.04) < 1e-5);
  loose.scene.dispose();
  const bigger = goldenTrail(g => { g.scene.geometries.find(x => x.id === 'ballBall').radius = 0.3; });
  assert.ok(Math.abs(tubeRadius(bigger.scene, 'trail') - 0.08) < 1e-5, 'a 0.3 ball allows 0.105: the declared 0.08 stays');
  bigger.scene.dispose();
  const scaled = goldenTrail(g => { g.scene.nodes.find(n => n.id === 'ball').scale = [0.5, 0.5, 0.5]; });
  assert.ok(Math.abs(tubeRadius(scaled.scene, 'trail') - 0.35 * 0.12 * 0.5) < 1e-5, 'a ball drawn at half scale caps the tube at 0.021');
  scaled.scene.dispose();
  const twin = goldenTrail(g => {
    g.scene.geometries.push({ id: 'tiny', kind: 'sphere', radius: 0.04 });
    g.scene.nodes.push({ id: 'tinyBall', geometry: 'tiny', material: g.scene.nodes.find(n => n.id === 'ball').material, clampTo: { node: 'bowl' } });
  });
  assert.ok(Math.abs(tubeRadius(twin.scene, 'trail') - 0.35 * 0.04) < 1e-5, 'the smallest clamped sphere sets it');
  twin.scene.dispose();
});

// C12 (owner item d; FX-AN-116; C11 Gate 2 job 4, aj_8a26c46f059f4a159de2240e11ea556d: "the host pins the diverged ball at height 2.7, but the bowl's edge there is 2.16 and the trail ends at
// the edge: the ball floats in the air, apart from the end of its trail"). A marker held at the rim in x or z is drawn ON the surface at its drawn (x, z), never at the clamp's own ceiling.
const surfaceHeight = (heights, width, depth, x, z) => { // the surface's own two triangles per cell, independently of scene.js
  const rows = heights.length, cols = heights[0].length, col = (x / width + 0.5) * (cols - 1), row = (z / depth + 0.5) * (rows - 1);
  const c = Math.min(Math.floor(col), cols - 2), r = Math.min(Math.floor(row), rows - 2), u = col - c, v = row - r;
  return u + v <= 1 ? heights[r][c] + u * (heights[r][c + 1] - heights[r][c]) + v * (heights[r + 1][c] - heights[r][c]) : heights[r + 1][c + 1] + (1 - u) * (heights[r + 1][c] - heights[r + 1][c + 1]) + (1 - v) * (heights[r][c + 1] - heights[r + 1][c + 1]);
};
test('a marker held at the rim sits on the surface there, where its path ends, not at the corner height of the surface\'s box; one held in y only is drawn on the surface under it', () => {
  const job = primitives();
  delete job.scene.nodes.find(n => n.id === 'ball').clampTo.max; // the job's shape: no explicit ceiling; the box's top (2.5625, a corner) is far above the bowl's edge at the ball (1.6625 at x 2.5, z 0.4)
  const scene = built(job), heights = job.scene.geometries[0].heights, edge = surfaceHeight(heights, 5, 4, 2.5, 0.4);
  assert.ok(Math.abs(edge - 1.6625) < 1e-9);
  const result = scene.apply({ nodes: { ball: { position: [3.675, 10.84, 0.4] }, trail: { points: [[2, surfaceHeight(heights, 5, 4, 2, 0.4) + 0.02, 0.4], [2.5, edge + 0.02, 0.4]] } } });
  const [held] = result.clamped, ball = holderOf(scene, 'ball').position;
  assert.deepEqual([held.axes, held.drawnAt[0], held.drawnAt[2]], [['x', 'y'], 2.5, 0.4]);
  assert.ok(Math.abs(ball.y - edge) < 1e-6, `drawn at the surface height at its x and z (${edge}), not the box's top 2.5625: ${ball.y}`);
  assert.ok(Math.abs(ball.y - (edge + 0.02)) <= 0.1 + 1e-6, 'within a ball radius of where its trail ends');
  assert.deepEqual(scene.buried(), [], 'a marker held at the rim is not buried');
  // Inside the footprint and above the surface's top: held on the surface under it.
  const inside = scene.apply({ nodes: { ball: { position: [1, 10.84, 0.4] } } }).clamped[0];
  assert.deepEqual([inside.axes, inside.drawnAt[0], inside.drawnAt[2]], [['y'], 1, 0.4]);
  assert.ok(Math.abs(inside.drawnAt[1] - surfaceHeight(heights, 5, 4, 1, 0.4)) < 1e-6, `on the surface under it: ${inside.drawnAt[1]}`);
  // A marker that is not held is untouched, even above the surface: a ball resting on it, at its radius above.
  assert.deepEqual(scene.apply({ nodes: { ball: { position: [1, surfaceHeight(heights, 5, 4, 1, 0.4) + 0.1, 0.4] } } }).clamped, []);
  // An explicit max wins.
  scene.dispose();
  job.scene.nodes.find(n => n.id === 'ball').clampTo.max = 2.7;
  const capped = built(job);
  assert.deepEqual(capped.apply({ nodes: { ball: { position: [3.675, 10.84, 0.4] } } }).clamped.map(c => c.drawnAt), [[2.5, 2.7, 0.4]]);
  capped.dispose();
});

// C12 (b)(iii), (e) and (e2): the scene reports what the render stage checks, from what is DRAWN. Twin markers (C11 Gate 2 jobs 3 and 7: two balls at one place at the initial capture), an arrow
// that runs through the surface (job 2: a 4x step arrow, drawn flat at the ball's height, runs into the rising wall) and an arrow shorter than the ball it comes from (job 2's repair: a 2x
// arrow inside the ball; job 1: a tiny arrow next to its label), which is not drawn, and neither is its tip label.
const twin = (extra = {}, material = 'ballRed') => {
  const a = primitives();
  a.scene.geometries.push({ id: 'twinGeo', kind: 'sphere', radius: 0.1 });
  a.scene.materials.push({ id: 'faint', color: '#d64545', opacity: 0.4 });
  a.scene.nodes.push({ id: 'twin', geometry: 'twinGeo', material, ...extra });
  return built(a);
};
const twinAt = (scene, x) => { scene.apply({ nodes: { ball: { position: [0, 1, 0] }, twin: { position: [x, 1, 0] } } }); return scene.overlaps(); };
test('overlaps: two sphere markers whose centres are within half a radius are reported; a ghost, a translucent or a hidden one, and one a little farther off, are not', () => {
  const scene = twin();
  assert.deepEqual(twinAt(scene, 0.04), [{ a: 'ball', b: 'twin', distance: 0.04 }], 'under half a radius (0.05) apart: one marker hides the other');
  assert.deepEqual(twinAt(scene, 0), [{ a: 'ball', b: 'twin', distance: 0 }], 'the same place');
  assert.deepEqual(twinAt(scene, 0.06), [], 'a little farther off than half a radius');
  scene.dispose();
  const ghost = twin({ name: 'Kept ball (ghost)' });
  assert.deepEqual(twinAt(ghost, 0.01), [], 'named a ghost');
  ghost.dispose();
  const faint = twin({}, 'faint');
  assert.deepEqual(twinAt(faint, 0.01), [], 'a translucent marker is a ghost');
  faint.dispose();
  const hidden = twin({ visible: false });
  assert.deepEqual(twinAt(hidden, 0.01), [], 'a hidden one hides nothing');
  hidden.dispose();
  const plain = built();
  assert.deepEqual(plain.overlaps(), [], 'one marker overlaps nothing');
  plain.dispose();
});

// The fixture's arrow is 0.5 long with an offset of 0.1 outside the node's scale, on a ball at (0, 0.3, 0); turned to lie along +X at scale s, its tip is at x = 0.1 + 0.5 s.
const flatArrow = scale => {
  const a = primitives();
  const node = a.scene.nodes.find(n => n.id === 'slope');
  node.quaternion = [0, 0, -Math.SQRT1_2, Math.SQRT1_2]; // +Y to +X: drawn flat, along the ball's height
  node.scale = [1, scale, 1];
  const scene = built(a);
  scene.apply({ nodes: { ball: { position: [0, 0.3, 0] } } });
  return scene;
};
test('arrowsUnder: a flat arrow whose tip runs into the rising wall is reported with how far under; a short one is not; a hidden one is not drawn, so not reported', () => {
  const long = flatArrow(4), found = long.arrowsUnder(); // tip at x 2.1, where the bowl is 1.1625 high and the arrow 0.3
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.deepEqual([found[0].id, found[0].point], ['slope', 'tip']);
  assert.deepEqual(found[0].tip.map(v => Math.round(v * 1e3) / 1e3), [2.1, 0.3, 0]);
  assert.ok(Math.abs(found[0].under - 0.8625) < 1e-4, `${found[0].under} under`);
  assert.deepEqual(long.arrowsHidden(), [], '2 long against a ball 0.2 across: drawn');
  long.dispose();
  const short = flatArrow(1);
  assert.deepEqual(short.arrowsUnder(), [], 'tip at x 0.6 (0.3 high), the bowl 0.1125 there: above it');
  short.dispose();
  const plain = built();
  assert.deepEqual(plain.arrowsUnder(), [], 'the fixture\'s arrow stands up from the ball');
  plain.dispose();
  const watch = built(watchFixture.artifact);
  assert.deepEqual([watch.arrowsUnder(), watch.overlaps(), watch.arrowsHidden()], [[], [], []], 'no surface, no arrow, no twin: nothing to report');
  watch.dispose();
});

const goldenArtifact = () => JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
const stepTo = (stepArrow, fullArrow, ballAt = [0.3, 0.87, 1.6]) => ({ nodes: { ball: { position: ballAt }, stepArrow: { visible: true, scale: [1, stepArrow, 1] }, fullArrow: { visible: true, scale: [1, fullArrow, 1] } } });
const spriteOf = (scene, id) => holderOf(scene, id).children[0];
test('arrowsHidden on the golden: at the start the arrows are drawn with their labels; at the lowest point, shorter than the ball, neither the arrows nor their labels are drawn, and the trace lists them', () => {
  const golden = goldenArtifact(), radius = golden.scene.geometries.find(g => g.id === golden.scene.nodes.find(n => n.clampTo).geometry).radius, diameter = 2 * radius;
  assert.ok(Math.abs(diameter - 0.24) < 1e-9, 'the golden as authored (a lane may retune it: the rule is relative to the ball)');
  const scene = built(golden), view = camera(12);
  scene.apply(stepTo(0.75, 0.75)); // the start: the first arrows are 0.75 or more
  scene.layoutLabels({ width: 960, height: 540, camera: view });
  assert.deepEqual(scene.arrowsHidden(), []);
  assert.deepEqual(['stepArrow', 'fullArrow'].map(id => drawn(scene, id).visible), [true, true]);
  assert.deepEqual(['stepTag', 'fullTag'].map(id => spriteOf(scene, id).visible), [true, true], 'a drawn arrow keeps its label');
  scene.apply(stepTo(0.15, 0.2, [0, 0.2, 0])); // the lowest point, the end of the run at convergence: a step of 0.15 and one of 0.2 against a ball 0.24 across
  const boxes = scene.layoutLabels({ width: 960, height: 540, camera: view });
  assert.deepEqual(scene.arrowsHidden(), [{ id: 'stepArrow', hidden: true, length: 0.15, diameter }, { id: 'fullArrow', hidden: true, length: 0.2, diameter }]);
  assert.deepEqual(['stepArrow', 'fullArrow'].map(id => drawn(scene, id).visible), [false, false], 'not drawn');
  assert.deepEqual(['stepTag', 'fullTag'].map(id => spriteOf(scene, id).visible), [false, false], 'and no label');
  assert.deepEqual(boxes.filter(box => /step/i.test(box.text)), [], 'a label for no arrow takes no room');
  assert.deepEqual(scene.arrowsUnder(), [], 'an arrow that is not drawn runs through nothing');
  scene.apply(stepTo(0.75, 0.75)); // a new run: drawn again, not stuck hidden
  assert.deepEqual([scene.arrowsHidden(), drawn(scene, 'stepArrow').visible], [[], true]);
  scene.dispose();
});

test('arrowsHidden: exactly the ball\'s diameter is drawn, a hair under is not; a program-hidden arrow is not listed; an arrow that stays drawn keeps the label rule of FX-AN-099', () => {
  const golden = goldenArtifact(), diameter = 2 * golden.scene.geometries.find(g => g.id === 'ballBall').radius, scene = built(golden);
  scene.apply(stepTo(diameter, diameter));
  assert.deepEqual([scene.arrowsHidden(), drawn(scene, 'stepArrow').visible], [[], true], 'length = diameter: drawn');
  scene.apply(stepTo(diameter - 1e-4, diameter));
  assert.deepEqual(scene.arrowsHidden().map(a => a.id), ['stepArrow']);
  scene.apply({ nodes: { stepArrow: { visible: false }, fullArrow: { visible: false } } });
  assert.deepEqual(scene.arrowsHidden(), [], 'hidden by the program: not the renderer\'s doing');
  // A drawn arrow, small on a far camera, loses its label by the pixel rule, not the diameter rule, and is still drawn.
  scene.apply(stepTo(0.3, 0.3));
  scene.layoutLabels({ width: 960, height: 540, camera: camera(40) });
  assert.deepEqual([scene.arrowsHidden(), drawn(scene, 'stepArrow').visible, spriteOf(scene, 'stepTag').visible], [[], true, false], 'under 24 px: the label goes, the arrow stays');
  scene.dispose();
});

test('arrowsHidden: an arrow whose parent is not a sphere is unchanged, however short', () => {
  const golden = goldenArtifact();
  golden.scene.nodes.unshift({ id: 'rig' });
  golden.scene.nodes.find(n => n.id === 'stepArrow').parent = 'rig';
  const scene = built(golden);
  scene.apply(stepTo(0.15, 0.15));
  assert.deepEqual([scene.arrowsHidden().map(a => a.id), drawn(scene, 'stepArrow').visible], [['fullArrow'], true], 'only the arrow that comes from the ball is hidden');
  scene.dispose();
  const none = goldenArtifact();
  none.scene.nodes.find(n => n.id === 'stepArrow').parent = null;
  const orphan = built(none);
  orphan.apply(stepTo(0.15, 0.15));
  assert.deepEqual([orphan.arrowsHidden().map(a => a.id), drawn(orphan, 'stepArrow').visible], [['fullArrow'], true], 'no parent: no sphere to compare with');
  orphan.dispose();
});
