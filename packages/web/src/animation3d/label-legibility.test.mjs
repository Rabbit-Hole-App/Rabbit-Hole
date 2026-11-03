import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { experimentFixture, gameFixture, watchFixture } from './fixtures.js';
import { pendulumDemo } from './pendulum-demo.js';
import { buildAnimationScene, declutterLabels, LABEL_LINE, LABEL_PIXELS, wrapLabel } from './scene.js';

// Owner review of the Animation MVP1 correction (2026-11-03, issue 2): a card's label was clipped at the viewport edge and the scale
// explanation disappeared because the label-area budget was spent on decorative names. Real Three.js objects, no WebGL: the label
// texture is a stand-in with the real texture's geometry (font 0.64 of the plate, 0.38 padding each side, the real wrapLabel).
const GLYPH = 0.64 * 0.55; // average glyph width in plate heights
const labelTexture = (text, { pixels, ratio = 1, maxWidth = Infinity }) => {
  const height = Math.round(pixels * ratio), pad = Math.round(height * 0.38), measure = string => string.length * GLYPH * height;
  const lines = wrapLabel(text, measure, maxWidth * ratio - 2 * pad);
  const width = Math.ceil(Math.max(...lines.map(measure))) + 2 * pad, tall = Math.round(height * (1 + (lines.length - 1) * LABEL_LINE));
  return { texture: new THREE.Texture(), aspect: width / tall, rows: tall / height };
};

// A scene of labels over the orbit watch scene: `names` are object names (children of a node, optional), `live` are live values
// and `captions` parentless labels (essential). Each is [id, text, placement, world x].
const sceneWith = ({ names = [], live = [], captions = [] }) => {
  const artifact = structuredClone(watchFixture.artifact);
  const geometries = artifact.scene.geometries.filter(g => g.id !== 'moonText'), nodes = artifact.scene.nodes.filter(node => node.id !== 'moonTag');
  for (const [kind, list] of [['name', names], ['live', live], ['caption', captions]]) {
    list.forEach(([id, text, placement, x, y = 0, z = 0]) => {
      geometries.push({ id: `g_${id}`, kind: 'label', text, placement });
      nodes.push({ id, geometry: `g_${id}`, ...(kind === 'name' ? { parent: 'system' } : {}), position: [x, y, z] });
    });
  }
  Object.assign(artifact.scene, { geometries, nodes });
  const built = buildAnimationScene(artifact, { labelTexture });
  assert.equal(built.ok, true, JSON.stringify(built.issues?.slice(0, 2)));
  // Live values are essential from the frame that sets their text.
  built.scene.apply({ nodes: Object.fromEntries(live.map(([id, text]) => [id, { text }])) });
  return built.scene;
};
const viewOf = (W, H) => {
  const view = new THREE.PerspectiveCamera(50, W / H, 0.05, 2000);
  view.position.set(0, 6, 8);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  return view;
};
// The plate a sprite is drawn with, in CSS pixels, read back from its center and scale (independent of layoutLabels' return value).
const plateBox = (sprite, view, W, H) => {
  const f = 1 / Math.tan(view.fov * Math.PI / 360), world = sprite.getWorldScale(new THREE.Vector3()), h = world.y * f / 2 * H, w = h * world.x / world.y;
  const p = sprite.getWorldPosition(new THREE.Vector3()).project(view), sx = (p.x + 1) / 2 * W, sy = (1 - p.y) / 2 * H;
  return { x: sx - sprite.center.x * w, y: sy - (1 - sprite.center.y) * h, w, h, sx, sy };
};
const spriteOf = (scene, id) => scene.objects.get(id).children[0];
const inside = (box, W, H, tol = 1e-6) => box.x >= LABEL_PIXELS.inset - tol && box.y >= LABEL_PIXELS.inset - tol && box.x + box.w <= W - LABEL_PIXELS.inset + tol && box.y + box.h <= H - LABEL_PIXELS.inset + tol;
const SIZES = [[320, 240], [390, 240], [606, 240], [960, 540]]; // small card, phone, the 640-wide default card's viewport, a large card

test('layout: every shown plate stays inside the viewport at small, phone, default and large sizes, wherever its point is', () => {
  const edge = [['a', 'noisy update 0.15', 'right', 5.2], ['b', 'full-batch update 0.17', 'right', 4.6, 0.5], ['c', 'slope w', 'left', -5.2], ['d', 'Lowest point', 'above', 0, 0, -3], ['e', 'intercept b', 'below', 0, 0, 3.5]];
  for (const [W, H] of SIZES) {
    const scene = sceneWith({ names: edge.slice(0, 3), live: edge.slice(3, 4), captions: edge.slice(4) }), view = viewOf(W, H);
    scene.layoutLabels({ width: W, height: H, camera: view });
    const drawn = [...'abcde'].filter(id => spriteOf(scene, id).visible);
    assert.ok(drawn.includes('a') && drawn.includes('d') && drawn.includes('e'), `${W}x${H}: the live value and the caption are drawn (${drawn})`);
    for (const id of drawn) {
      const box = plateBox(spriteOf(scene, id), view, W, H);
      assert.ok(inside(box, W, H), `${W}x${H} ${id}: [${box.x.toFixed(1)}, ${box.y.toFixed(1)}, ${(box.x + box.w).toFixed(1)}, ${(box.y + box.h).toFixed(1)}] is outside the viewport`);
    }
    scene.dispose();
  }
});

test('layout: essential labels (live values, captions with no parent) are never dropped for object names, however tight the room', () => {
  // Twelve object names first in scene order, then the live value and the scale caption last: the old budget broke at the first name that
  // did not fit and dropped everything after it, essential or not.
  const names = Array.from({ length: 12 }, (_, i) => [`n${i}`, `object name ${i}`, 'right', -4 + (i % 4) * 2.2, 0, -2 + Math.floor(i / 4) * 2]);
  const scene = sceneWith({ names, live: [['value', 'noisy update 0.15', 'right', 0, 0.5, 0]], captions: [['scale', 'Arrow this long = update of 1.0', 'right', 0, 0, 3.4]] });
  for (const [W, H] of SIZES) {
    const view = viewOf(W, H);
    scene.layoutLabels({ width: W, height: H, camera: view });
    for (const id of ['value', 'scale']) assert.equal(spriteOf(scene, id).visible, true, `${W}x${H}: ${id} is drawn`);
    const shownNames = names.filter(([id]) => spriteOf(scene, id).visible).length;
    if (W === 320) assert.ok(shownNames < names.length, 'the room was exhausted: some object names were dropped, not the essential ones');
  }
  scene.setOptionalLabels(false);
  const view = viewOf(606, 240);
  scene.layoutLabels({ width: 606, height: 240, camera: view });
  assert.deepEqual(['value', 'scale'].map(id => spriteOf(scene, id).visible), [true, true], 'with Labels off the live value and the caption stay');
  scene.dispose();
});

test('layout: a plate that would leave the viewport flips to the other side of its point first, and keeps its point uncovered', () => {
  // Unit: a 100-wide plate whose point is at x 580 of a 606 viewport, placed to the right of it.
  const bounds = { x: 4, y: 4, w: 598, h: 232 }, plate = { x: 580, y: 100, w: 100, h: 18, placement: 'right' };
  const [offset] = declutterLabels([plate], { bounds });
  const x = plate.x + offset.dx;
  assert.ok(x >= bounds.x && x + plate.w <= bounds.x + bounds.w, `inside (${x})`);
  assert.ok(x + plate.w < 580 + 1e-9, `on the left of its point at 580, not over it (right edge ${x + plate.w})`);
  // Unbounded, the same call keeps the old behavior (no frame is known).
  assert.deepEqual(declutterLabels([plate]), [{ dx: 0, dy: 0 }]);
  // A plate at the top edge flips below; an essential plate with no clear spot is still placed, an optional one gets none.
  assert.ok(declutterLabels([{ x: 100, y: -10, w: 60, h: 18, placement: 'above' }], { bounds })[0].dy > 0);
  const crowd = Array.from({ length: 30 }, (_, i) => ({ x: 300, y: 110, w: 90, h: 18, placement: 'right', essential: i > 25 }));
  const out = declutterLabels(crowd, { bounds });
  assert.ok(out.slice(0, 26).some(offset => offset === null), 'optional plates that find no room are dropped');
  assert.ok(out.slice(26).every(Boolean), 'essential plates are always placed');
});

test('layout: a long live label reflows onto more lines inside a narrow viewport instead of running off it', () => {
  const text = 'Diverged at step 12: off plot, learning rate above 1.0';
  const scene = sceneWith({ live: [['status', text, 'center', 0, 3, 0]] });
  const wide = viewOf(960, 540), narrow = viewOf(288, 240);
  scene.layoutLabels({ width: 960, height: 540, camera: wide });
  assert.equal(spriteOf(scene, 'status').userData.label.rows, 1, 'one line where it fits');
  assert.equal(inside(plateBox(spriteOf(scene, 'status'), wide, 960, 540), 960, 540), true);
  scene.layoutLabels({ width: 288, height: 240, camera: narrow });
  const sprite = spriteOf(scene, 'status'), box = plateBox(sprite, narrow, 288, 240);
  assert.ok(sprite.userData.label.rows > 1, `wrapped (${sprite.userData.label.rows} rows)`);
  assert.equal(sprite.visible, true);
  assert.ok(inside(box, 288, 240), `inside the 288 px viewport: [${box.x.toFixed(1)}, ${(box.x + box.w).toFixed(1)}]`);
  scene.dispose();
  assert.deepEqual(wrapLabel('a bb ccc', s => s.length, 4), ['a bb', 'ccc']);
  assert.deepEqual(wrapLabel('averyveryverylongword x', s => s.length, 5), ['averyveryverylongword', 'x'], 'a word wider than the limit stays whole');
});

test('layout: arrows stay proportional to the update they draw: no minimum length, none added by the layout', () => {
  // An arrow's drawn length is the node's scale.y (the program writes scale = [T, K x |update|, T]); labels and leaders never touch it.
  const artifact = structuredClone(watchFixture.artifact);
  artifact.scene.geometries.push({ id: 'arrowG', kind: 'arrow', length: 1 });
  artifact.scene.materials.push({ id: 'arrowM', color: '#d9481c' });
  artifact.scene.nodes.push({ id: 'arrow', geometry: 'arrowG', material: 'arrowM', position: [0, 1, 0] });
  const { scene } = buildAnimationScene(artifact, { labelTexture });
  const view = viewOf(606, 240);
  const pixels = size => { // the arrow points along +x, across the view: its projected length in CSS pixels
    scene.apply({ nodes: { arrow: { visible: true, position: [0, 1, 0], scale: [2, size, 2], quaternion: [0, 0, -0.7071067811865476, 0.7071067811865476] } } });
    scene.layoutLabels({ width: 606, height: 240, camera: view });
    scene.root.updateWorldMatrix(true, true);
    const a = new THREE.Vector3(0, 1, 0).project(view), b = new THREE.Vector3(size, 1, 0).project(view);
    return Math.hypot((b.x - a.x) / 2 * 606, (b.y - a.y) / 2 * 240);
  };
  const [big, half, tiny] = [pixels(2), pixels(1), pixels(0.002)]; // updates of 1.0, 0.5 and 0.001 at 2 units per update
  assert.ok(Math.abs(big / half - 2) < 0.05, `twice the update, twice the pixels (${big.toFixed(2)} vs ${half.toFixed(2)})`);
  assert.ok(Math.abs(big / tiny - 1000) < 20 && tiny < 1, `an update of 0.001 is a fraction of a pixel, not a minimum arrow (${tiny.toFixed(4)} px)`);
  const geometry = scene.objects.get('arrow').children[0];
  assert.equal(geometry.children.length, 2, 'drawn as shaft and head only');
  scene.dispose();
});

// Owner review of the SGD cards (2026-11-03, acceptance job aj_0b6ca2b5, round 4): the "Ready" status label sat on the arrows and hid the grey
// downhill one. Arrows are obstacles for label plates: the whole shaft with its head's thickness, not only the ends.
const touches = (plate, seg, margin) => { // independent of the layout: the segment sampled every 0.5 px, the plate grown by the margin
  const n = Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) * 2) + 1;
  return Array.from({ length: n + 1 }, (_, i) => [seg.x1 + (seg.x2 - seg.x1) * i / n, seg.y1 + (seg.y2 - seg.y1) * i / n])
    .some(([x, y]) => x > plate.x - margin && x < plate.x + plate.w + margin && y > plate.y - margin && y < plate.y + plate.h + margin);
};
const BOUNDS = { x: 4, y: 4, w: 598, h: 232 };
const shaft = { x1: 100, y1: 120, x2: 500, y2: 120, half: 3 }; // a long, horizontal arrow, 400 px

test('declutter: a plate centred on the middle of a long shaft is moved off it, to the side of its point that is free', () => {
  const plate = { x: 250, y: 111, w: 100, h: 18, placement: 'above' }; // its point is at (300, 132.6): the plate lies on the shaft
  const [offset] = declutterLabels([plate], { bounds: BOUNDS, obstacles: [shaft] });
  const moved = { ...plate, x: plate.x + offset.dx, y: plate.y + offset.dy };
  assert.ok(offset.dx || offset.dy, 'moved');
  assert.equal(touches(moved, shaft, shaft.half), false, `clear of the shaft (plate y ${moved.y})`);
  assert.ok(moved.y > 120 && moved.y < 150, `flipped below its point, still beside it, not pushed along the shaft (y ${moved.y}, x ${moved.x})`);
  assert.deepEqual(declutterLabels([plate], { bounds: BOUNDS }), [{ dx: 0, dy: 0 }], 'without the obstacle the same plate stays');
});

test('declutter: a plate that overlaps only the arrow head, or touches the shaft only within the margin, is moved; one outside the margin is not', () => {
  const tip = { x: 290, y: 111, w: 100, h: 18, placement: 'right' }; // covers the tip at (300, 120) and nothing of the shaft before it
  const short = { x1: 100, y1: 120, x2: 300, y2: 120, half: 8 };
  const [head] = declutterLabels([tip], { bounds: BOUNDS, obstacles: [short] });
  assert.ok(head.dx || head.dy, 'the head-only plate is moved');
  assert.equal(touches({ ...tip, x: tip.x + head.dx, y: tip.y + head.dy }, short, short.half), false);
  // A plate whose top edge is `d` px below the shaft's centre line: margin = half 3 + gap 4 = 7 px.
  const below = d => ({ x: 250, y: 120 + d, w: 100, h: 18, placement: 'below' });
  const edge = declutterLabels([below(5)], { bounds: BOUNDS, obstacles: [shaft] })[0], far = declutterLabels([below(8)], { bounds: BOUNDS, obstacles: [shaft] })[0];
  assert.ok(edge.dx || edge.dy, 'a plate 5 px from the shaft (inside its 7 px margin) is moved');
  assert.deepEqual(far, { dx: 0, dy: 0 }, 'a plate 8 px from the shaft (outside the margin) stays');
  // A slanted shaft: a plate clear of its line stays (though inside its bounding box), one on the line is moved.
  const slant = { x1: 100, y1: 40, x2: 400, y2: 200, half: 3 };
  assert.deepEqual(declutterLabels([{ x: 250, y: 40, w: 60, h: 18, placement: 'above' }], { bounds: BOUNDS, obstacles: [slant] }), [{ dx: 0, dy: 0 }]);
  const [on] = declutterLabels([{ x: 220, y: 100, w: 60, h: 18, placement: 'above' }], { bounds: BOUNDS, obstacles: [slant] });
  assert.ok(on.dx || on.dy);
});

test('declutter: an essential plate with no free spot is still placed (overlapping rather than dropped), an optional one is left out', () => {
  // Arrows every 9 px across a small viewport leave no spot a plate could keep clear of them.
  const bounds = { x: 4, y: 4, w: 120, h: 60 }, grid = Array.from({ length: 8 }, (_, i) => ({ x1: 0, y1: 4 + i * 9, x2: 130, y2: 4 + i * 9, half: 3 }));
  const plates = [{ x: 30, y: 20, w: 50, h: 18, placement: 'right', essential: true }, { x: 40, y: 25, w: 50, h: 18, placement: 'right' }, { x: 50, y: 30, w: 50, h: 18, placement: 'right', essential: true }];
  const out = declutterLabels(plates, { bounds, obstacles: grid });
  assert.deepEqual(out.map(Boolean), [true, false, true], 'both essential plates placed, the optional one not');
  for (const [i, offset] of [[0, out[0]], [2, out[2]]]) {
    const x = plates[i].x + offset.dx, y = plates[i].y + offset.dy;
    assert.ok(x >= bounds.x && y >= bounds.y && x + plates[i].w <= bounds.x + bounds.w && y + plates[i].h <= bounds.y + bounds.h, `essential plate ${i} inside the bounds`);
  }
  assert.deepEqual(declutterLabels(plates, { bounds }).map(Boolean), [true, true, true], 'without arrows all three fit');
});

test('declutter: no obstacles, no change: the layouts of the saved arrowless fixtures are those of 5427f0db4', () => {
  const GOLDEN = { watch: { '606x240': [['moonTag', 363, 86, 40, 18]], '320x240': [['moonTag', 220, 86, 40, 18]] }, experiment: { '606x240': [['leftTag', 228, 70, 40, 18], ['rightTag', 353, 70, 46, 18]], '320x240': [['leftTag', 85, 70, 40, 18], ['rightTag', 210, 70, 46, 18]] }, game: { '606x240': [['compassTag', 216, 37, 21, 18]], '320x240': [['compassTag', 73, 37, 21, 18]] }, pendulum: { '606x240': [['bobLabel', 311, 84, 34, 18]], '320x240': [['bobLabel', 168, 84, 34, 18]] } };
  const artifacts = { watch: watchFixture.artifact, experiment: experimentFixture.artifact, game: gameFixture.artifact, pendulum: pendulumDemo.artifact };
  for (const [name, artifact] of Object.entries(artifacts)) {
    for (const [size, golden] of Object.entries(GOLDEN[name])) {
      const [W, H] = size.split('x').map(Number), built = buildAnimationScene(structuredClone(artifact), { labelTexture });
      const view = new THREE.PerspectiveCamera(artifact.camera.fov, W / H, 0.05, 2000);
      view.position.set(...artifact.camera.position);
      view.lookAt(...artifact.camera.target);
      view.updateMatrixWorld();
      const boxes = built.scene.layoutLabels({ width: W, height: H, camera: view }).map(b => [b.id, ...[b.x, b.y, b.w, b.h].map(n => Math.round(n * 10) / 10)]);
      assert.deepEqual(boxes, golden, `${name} ${size}`);
      built.scene.dispose();
    }
  }
});

test('layout: a status label placed on an arrow keeps off its whole shaft and head, at every card size, and stays a drawn essential label inside the viewport', () => {
  // An arrow 4 units long along +x at y = 1, its base at x = -2 (the node's scale.y is its length); a parentless status label (essential) at its
  // base, one at its middle and one at its tip: each would lie on the shaft without the arrow as an obstacle.
  for (const [at, placement] of [[-2, 'above'], [0, 'center'], [2, 'right']]) {
    for (const [W, H] of SIZES) {
      const artifact = structuredClone(watchFixture.artifact);
      artifact.scene.geometries.push({ id: 'arrowG', kind: 'arrow', length: 1 }, { id: 'readyG', kind: 'label', text: 'Ready', placement });
      artifact.scene.materials.push({ id: 'arrowM', color: '#d9481c' });
      artifact.scene.nodes.push({ id: 'arrow', geometry: 'arrowG', material: 'arrowM', position: [-2, 1, 0], scale: [2, 4, 2], quaternion: [0, 0, -0.7071067811865476, 0.7071067811865476] }, { id: 'ready', geometry: 'readyG', position: [at, 1, 0] });
      const { scene } = buildAnimationScene(artifact, { labelTexture }), view = viewOf(W, H);
      const boxes = scene.layoutLabels({ width: W, height: H, camera: view });
      const f = 1 / Math.tan(view.fov * Math.PI / 360), px = v => { const p = v.clone().project(view); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
      const [x1, y1] = px(new THREE.Vector3(-2, 1, 0)), [x2, y2] = px(new THREE.Vector3(2, 1, 0)), depth = -new THREE.Vector3(-2, 1, 0).applyMatrix4(view.matrixWorldInverse).z;
      const seg = { x1, y1, x2, y2, half: 0.075 * 2 * f * H / (2 * depth) }; // the head's radius: 0.075 of the length, times scale x 2
      const plate = boxes.find(b => b.id === 'ready');
      assert.equal(plate.shown, true, `${W}x${H} ${placement}: drawn`);
      assert.ok(inside(plate, W, H), `${W}x${H} ${placement}: inside the viewport`);
      assert.equal(touches(plateBox(spriteOf(scene, 'ready'), view, W, H), seg, seg.half), false, `${W}x${H} ${placement}: [${plate.x.toFixed(1)}, ${plate.y.toFixed(1)}] is on the arrow (${x1.toFixed(0)},${y1.toFixed(0)})-(${x2.toFixed(0)},${y2.toFixed(0)})`);
      scene.dispose();
    }
  }
});
