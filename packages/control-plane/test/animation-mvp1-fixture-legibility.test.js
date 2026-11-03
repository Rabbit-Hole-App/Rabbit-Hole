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
import { validateStage } from '../src/animation-author.js';
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
