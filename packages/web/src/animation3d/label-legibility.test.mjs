import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { watchFixture } from './fixtures.js';
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
