// OFFLINE FIXTURE, label legibility (owner review of the MVP1 correction, 2026-11-03, issue 2): in the card's viewport the noisy-update label was
// clipped at the right edge and the scale explanation disappeared because the label-area budget was spent on object names. This lays out the
// fixture's real labels (scene.js, the card's own layout) with the real engine's frames, the card's own framing and the card viewports measured in a
// browser (the 640 px default card's viewport is 604 x 238: its controls leave the viewport its 240 px minimum), for the owner's states, and checks
// what a learner must be able to read. Browser pixels, the readouts and the arrows' proportions are covered by the capture notes and the fixture tests;
// this is the layout: it proves the labels on this one scene, not that a model's generation keeps the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { fitAnimationView } from '../../web/src/animation3d/framing.js';
import { runReviewProgram } from '../../web/src/animation3d/review.js';
import { buildAnimationScene, LABEL_LINE, LABEL_PIXELS, wrapLabel } from '../../web/src/animation3d/scene.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { candidatesOf } from '../animation-sgd-qualification.mjs';
import { artifactHashOf, validateStage } from '../src/animation-author.js';
import { captureViews, middleOf } from '../src/animation-render.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-mvp1-correction-fixture.json', import.meta.url), 'utf8'));
const savedJob = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_086fd46.json', import.meta.url), 'utf8'));
// The card's 3D viewport (CSS px) at: a 320 px card, a phone (374 px card, dpr 2), the 640 px default card and a 960 px card.
const VIEWPORTS = { small: [284, 238], phone: [338, 238], default: [604, 238], large: [924, 356] };
const DEFAULTS = { learningRate: 0.3, batchSize: '4', showTrueGradient: true };
const FULL_BATCH = { batchSize: '64' };
const act = action => ({ type: 'action', action }), drag = (type, value) => ({ type, node: 'start', value });

let engine, sealed;
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; },
    postMessage(message) { queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); }); } };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const sgd = async () => {
  engine ??= await loadEngine();
  if (!sealed) {
    const v = await validateStage({ prompt: savedJob.prompt, evidence: [], context: null, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft: fixture.draft, calls: [], features: ANIMATION_CLIENT_FEATURES }, { env: {} });
    assert.equal(v.problems, undefined, JSON.stringify(v.problems));
    sealed = v;
  }
  return sealed;
};
// The label texture's own geometry (font 0.64 of the plate, 0.38 padding each side, the real wrapLabel, ~0.55 em per glyph).
const labelTexture = (text, { pixels, ratio = 1, maxWidth = Infinity }) => {
  const height = Math.round(pixels * ratio), pad = Math.round(height * 0.38), measure = string => string.length * 0.64 * 0.55 * height;
  const lines = wrapLabel(text, measure, maxWidth * ratio - 2 * pad);
  const tall = Math.round(height * (1 + (lines.length - 1) * LABEL_LINE));
  return { texture: new THREE.Texture(), aspect: (Math.ceil(Math.max(...lines.map(measure))) + 2 * pad) / tall, rows: tall / height };
};
const plateOf = (sprite, camera, W, H) => {
  const f = 1 / Math.tan(camera.fov * Math.PI / 360), world = sprite.getWorldScale(new THREE.Vector3()), h = world.y * f / 2 * H, w = h * world.x / world.y;
  const p = sprite.getWorldPosition(new THREE.Vector3()).project(camera), sx = (p.x + 1) / 2 * W, sy = (1 - p.y) / 2 * H;
  return { x: sx - sprite.center.x * w, y: sy - (1 - sprite.center.y) * h, w, h };
};
const STATES = async artifact => [
  ['initial', {}, {}],
  ['middle learning rate after steps', { learningRate: middleOf(artifact.parameters[0]) }, { events: [act('oneStep'), act('oneStep'), act('keepPath'), act('oneStep')] }],
  ['off plot', { learningRate: 2.5, ...FULL_BATCH }, { ticks: 90 }],
  ['zero update', { learningRate: 0.5, ...FULL_BATCH }, { events: [drag('drag_start', 0), drag('drag_move', 0), drag('drag_end', 0), act('oneStep')] }],
];

test('the scale explanation keeps its meaning, as a caption that is never dropped (no parent: essential, shown also with Labels off)', async () => {
  const { artifact } = await sgd();
  const text = artifact.scene.geometries.find(g => g.id === 'lBar').text, node = artifact.scene.nodes.find(node => node.id === 'lbar');
  assert.match(text, /arrow/i, 'it says which thing it measures');
  assert.match(text, /update of 1\.0/, 'and the size it stands for');
  assert.ok(node.parent == null, 'a label with no parent is essential (contract: always shows)');
  const bar = artifact.scene.nodes.find(n => n.id === 'bar'), barLength = artifact.scene.geometries.find(g => g.id === 'barG').size[0];
  assert.deepEqual([node.position[0], node.position[2]], [bar.position[0] + barLength / 2 + 0.1, bar.position[2]], "at the bar's right end, as before");
  assert.match(artifact.assumptions.join(' '), /2 units of length per 1\.0 of update/, 'the disclosed scale the bar draws (2 units = an update of 1.0)');
});

test('every label the learner needs is drawn, inside the card viewport, in every state at every card size', async () => {
  const { artifact, artifactHash } = await sgd();
  engine ??= await loadEngine();
  const fits = new Map();
  for (const [state, inputs, options] of await STATES(artifact)) {
    const all = { ...DEFAULTS, ...inputs };
    const run = await runReviewProgram({ artifact, artifactHash, view: captureViews(artifact)[0], inputs: all, time: 0, events: options.events ?? [], leadTicks: 0, ticks: options.ticks ?? 0, seed: artifact.seed, theme: 'light', width: 960, height: 540 }, { workerFactory });
    assert.ok(run.ok, JSON.stringify(run));
    const need = ['status', 'lbar'];
    if (run.frame.nodes.lblStep?.visible) need.push('lblStep');
    if (run.frame.nodes.lblTrue?.visible) need.push('lblTrue');
    for (const [size, [W, H]] of Object.entries(VIEWPORTS)) {
      if (!fits.has(size)) fits.set(size, await fitAnimationView({ artifact, aspect: W / H, inputs: DEFAULTS, workerFactory }));
      const cam = fits.get(size), camera = new THREE.PerspectiveCamera(cam.fov, W / H, 0.05, 2000);
      camera.position.set(...cam.position); camera.lookAt(...cam.target); camera.updateMatrixWorld();
      const { scene } = buildAnimationScene(artifact, { labelTexture });
      scene.apply(run.frame);
      for (const optional of [true, false]) {
        scene.setOptionalLabels(optional);
        scene.layoutLabels({ width: W, height: H, camera });
        const where = `${state}, ${size} ${W}x${H}, Labels ${optional ? 'on' : 'off'}`;
        for (const id of need) assert.equal(scene.objects.get(id).children[0].visible, true, `${where}: ${id} is drawn`);
        for (const [id, holder] of scene.objects) {
          const sprite = holder.children.find(child => child.isSprite);
          if (!sprite?.visible) continue;
          const box = plateOf(sprite, camera, W, H);
          assert.ok(box.x >= LABEL_PIXELS.inset - 1e-6 && box.y >= LABEL_PIXELS.inset - 1e-6 && box.x + box.w <= W - LABEL_PIXELS.inset + 1e-6 && box.y + box.h <= H - LABEL_PIXELS.inset + 1e-6,
            `${where}: ${id} "${sprite.userData.label.text}" [${box.x.toFixed(1)}, ${box.y.toFixed(1)}, ${(box.x + box.w).toFixed(1)}, ${(box.y + box.h).toFixed(1)}] is outside the viewport`);
        }
      }
      scene.dispose();
    }
    // The four readouts the plan names are in the frame as numbers the card prints as text (step, passes through the data, loss, distance).
    assert.deepEqual(['stepNo', 'passes', 'loss', 'dist'].map(id => Number.isFinite(run.trace.readouts[id])), [true, true, true, true], `${state}: four readouts`);
  }
});

// Round 4 (owner review of the SGD cards, acceptance job aj_0b6ca2b5): a label plate sat on the arrows and hid the grey downhill one. In every
// state at every card size no drawn plate may meet an arrow's shaft or head (the arrow's segment on screen, thickened by its head's half width),
// and every label the learner needs is still drawn, inside the viewport, on the offline fixture and on the real repaired draft of that job.
// Round 4b: nor may a plate cover a small marker (a ball, a trail or saved-path dot, the lowest-point dot) other than the one it names.
const arrowsOnScreen = (scene, artifact, camera, W, H) => {
  const kinds = new Map(artifact.scene.geometries.map(g => [g.id, g])), f = 1 / Math.tan(camera.fov * Math.PI / 360), out = [];
  const px = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
  for (const node of artifact.scene.nodes) {
    const g = kinds.get(node.geometry), holder = scene.objects.get(node.id);
    let shown = g?.kind === 'arrow' && holder.visible;
    holder.traverseAncestors(ancestor => { if (!ancestor.visible) shown = false; });
    if (!shown) continue;
    const base = holder.getWorldPosition(new THREE.Vector3()), tip = holder.localToWorld(new THREE.Vector3(0, g.length, 0));
    const [x1, y1] = px(base), [x2, y2] = px(tip), depth = -base.clone().applyMatrix4(camera.matrixWorldInverse).z;
    out.push({ id: node.id, x1, y1, x2, y2, half: g.length * 0.03 * 2.5 * holder.getWorldScale(new THREE.Vector3()).x * f * H / (2 * depth) });
  }
  return out;
};
const markersOnScreen = (scene, artifact, camera, W, H) => { // spheres of radius <= 0.2: centre and projected radius in px
  const kinds = new Map(artifact.scene.geometries.map(g => [g.id, g])), f = 1 / Math.tan(camera.fov * Math.PI / 360), out = [];
  for (const node of artifact.scene.nodes) {
    const g = kinds.get(node.geometry), holder = scene.objects.get(node.id);
    let shown = g?.kind === 'sphere' && g.radius <= 0.2 && holder.visible;
    holder.traverseAncestors(ancestor => { if (!ancestor.visible) shown = false; });
    if (!shown) continue;
    const c = holder.getWorldPosition(new THREE.Vector3()), depth = -c.clone().applyMatrix4(camera.matrixWorldInverse).z, p = c.clone().project(camera);
    if (depth > 0 && Math.abs(p.z) <= 1) out.push({ id: node.id, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, r: g.radius * holder.getWorldScale(new THREE.Vector3()).x * f * H / (2 * depth) });
  }
  return out;
};
const coversMarker = (plate, m) => Math.hypot(Math.max(plate.x - m.x, 0, m.x - plate.x - plate.w), Math.max(plate.y - m.y, 0, m.y - plate.y - plate.h)) < m.r;
const meetsArrow = (plate, seg) => { // the segment sampled every 0.5 px: independent of the layout's own test
  const n = Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) * 2) + 1;
  return Array.from({ length: n + 1 }, (_, i) => [seg.x1 + (seg.x2 - seg.x1) * i / n, seg.y1 + (seg.y2 - seg.y1) * i / n])
    .some(([x, y]) => x > plate.x - seg.half && x < plate.x + plate.w + seg.half && y > plate.y - seg.half && y < plate.y + plate.h + seg.half);
};
const noPlateOnAnArrow = async ({ artifact, artifactHash, states, base, need }) => {
  engine ??= await loadEngine();
  let arrowsSeen = 0, markersSeen = 0;
  const parentOf = new Map(artifact.scene.nodes.map(node => [node.id, node.parent]));
  for (const [state, inputs, options] of states) {
    const run = await runReviewProgram({ artifact, artifactHash, view: captureViews(artifact)[0], inputs: { ...base, ...inputs }, time: 0, events: options.events ?? [], leadTicks: 0, ticks: options.ticks ?? 0, seed: artifact.seed, theme: 'light', width: 960, height: 540 }, { workerFactory });
    assert.ok(run.ok, JSON.stringify(run));
    for (const [size, [W, H]] of Object.entries(VIEWPORTS)) {
      const cam = await fitAnimationView({ artifact, aspect: W / H, inputs: base, workerFactory }), camera = new THREE.PerspectiveCamera(cam.fov, W / H, 0.05, 2000);
      camera.position.set(...cam.position); camera.lookAt(...cam.target); camera.updateMatrixWorld();
      const { scene } = buildAnimationScene(artifact, { labelTexture });
      scene.apply(run.frame);
      const plates = scene.layoutLabels({ width: W, height: H, camera }), arrows = arrowsOnScreen(scene, artifact, camera, W, H), where = `${state}, ${size} ${W}x${H}`;
      const markers = markersOnScreen(scene, artifact, camera, W, H);
      arrowsSeen += arrows.length;
      markersSeen += markers.length;
      for (const plate of plates.filter(p => p.shown)) {
        for (const seg of arrows) assert.equal(meetsArrow(plate, seg), false, `${where}: "${plate.text}" [${plate.x.toFixed(0)}, ${plate.y.toFixed(0)}, ${(plate.x + plate.w).toFixed(0)}, ${(plate.y + plate.h).toFixed(0)}] is on arrow ${seg.id} (${seg.x1.toFixed(0)},${seg.y1.toFixed(0)})-(${seg.x2.toFixed(0)},${seg.y2.toFixed(0)})`);
        assert.deepEqual(markers.filter(m => m.id !== parentOf.get(plate.id) && coversMarker(plate, m)).map(m => m.id), [], `${where}: "${plate.text}" [${plate.x.toFixed(0)}, ${plate.y.toFixed(0)}, ${(plate.x + plate.w).toFixed(0)}, ${(plate.y + plate.h).toFixed(0)}] covers a marker`);
        assert.ok(plate.x >= LABEL_PIXELS.inset - 1e-6 && plate.y >= LABEL_PIXELS.inset - 1e-6 && plate.x + plate.w <= W - LABEL_PIXELS.inset + 1e-6 && plate.y + plate.h <= H - LABEL_PIXELS.inset + 1e-6, `${where}: "${plate.text}" is outside the viewport`);
      }
      for (const id of need(run.frame, state)) assert.equal(plates.find(p => p.id === id)?.shown, true, `${where}: ${id} is drawn`);
      scene.dispose();
    }
  }
  assert.ok(arrowsSeen > 0 && markersSeen > 0, 'the states drew arrows and markers');
};

test('no label plate meets an arrow shaft or head, or covers a small marker, in the fixture states (initial, middle after steps, off plot, zero update) at every card size', async () => {
  const { artifact, artifactHash } = await sgd();
  await noPlateOnAnArrow({ artifact, artifactHash, states: await STATES(artifact), base: DEFAULTS, need: frame => ['status', 'lbar', ...['lblStep', 'lblTrue'].filter(id => frame.nodes[id]?.visible)] });
});

test('no label plate meets an arrow or covers a dot in the real repaired draft of job aj_0b6ca2b (arrows at 3x, a Ready label on them, bunched trail and saved-path dots): initial, after steps, a saved path, at the high rate', async () => {
  const data = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_0b6ca2b.json', import.meta.url), 'utf8'));
  const [{ artifact }] = await candidatesOf(data);
  engine ??= await loadEngine();
  const artifactHash = await artifactHashOf(artifact), step = act('stepOnce');
  await noPlateOnAnArrow({ artifact, artifactHash, base: { learningRate: 0.1, batchSize: '4', showTrueGradient: true },
    states: [['initial', {}, {}], ['learning rate 0.1, three steps', { learningRate: 0.1 }, { events: [step, step, step] }], ['learning rate 1, one step', { learningRate: 1 }, { events: [step] }],
      ['learning rate 0.1, run, save the path, run on', { learningRate: 0.1 }, { events: [act('run'), act('savePath'), act('run')], ticks: 40 }]],
    need: (frame, state) => state === 'learning rate 1, one step' ? [] : ['st'] }); // at rate 1 the ball is at y 5.6, above the framed view, and its Diverged label with it (a framing matter, not a layout one)
});
