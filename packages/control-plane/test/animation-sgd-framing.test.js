// OFFLINE FIXTURE, camera framing at a high learning rate (Animation MVP1 round 4, review 2 of job aj_0b6ca2b5: "at learning rate 1 the arrows, drawn
// at 3x length, reach beyond the bowl and the camera fits to them, leaving the bowl tiny"). The card's own fit (framing.js) on the real engine, for the
// hand-built fixture (its highest rate, 2.5) and the saved repaired draft of that job (arrows at 3x, its highest rate, 1): an arrow stays proportional
// to its update (scene.js; the guard is in label-legibility.test.mjs), so what must hold is that a long arrow does not decide the view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';
import { fitCameraToPoints, sampleAnimationFrames, subjectPoints } from '../../web/src/animation3d/framing.js';
import { buildAnimationScene } from '../../web/src/animation3d/scene.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { sealArtifact, validateStage } from '../src/animation-author.js';

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const fixture = read('animation-mvp1-correction-fixture.json'), savedJob = read('animation-aj_086fd46.json'), failed = read('animation-aj_0b6ca2b.json');
const W = 960, H = 540;

let engine;
const workerFactory = () => {
  const worker = { terminated: false, terminate() { worker.terminated = true; },
    postMessage(message) { queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runProgram(engine, message) } }); }); } };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const hand = async () => {
  engine ??= await loadEngine();
  const v = await validateStage({ prompt: savedJob.prompt, evidence: [], context: null, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft: fixture.draft, calls: [], features: ANIMATION_CLIENT_FEATURES }, { env: {} });
  assert.equal(v.problems, undefined, JSON.stringify(v.problems));
  return { artifact: v.artifact, bowl: ['c2', 'c3', 'c4'], defaults: { learningRate: 0.3, batchSize: '4', showTrueGradient: true }, max: 2.5 };
};
const saved = async () => {
  engine ??= await loadEngine();
  const sealed = await sealArtifact(failed.draft, { artifactId: failed.resultId, revision: 1, planHash: failed.planHash, createdAt: new Date(failed.approvalAt).toISOString() });
  return { artifact: validateAnimationArtifact(sealed).value, bowl: ['bowl'], defaults: { learningRate: 0.1, batchSize: '4', showTrueGradient: true }, max: 1 };
};

// The fit the review and the card make at these inputs, over the frames the sampler takes; hide: node ids drawn hidden, to compare with a scene without them.
async function fit({ artifact, defaults }, learningRate, hide = []) {
  // The deadline is not the test's business (FRAMING.budgetMs cut the sample under load): a fixed clock, and what is asserted is the sampled frames.
  const frames = await sampleAnimationFrames({ artifact, inputs: { ...defaults, learningRate }, workerFactory, now: () => 0 });
  assert.ok(frames.length > 1, `the motion was sampled (${frames.length} frames), not only its initial state`);
  const hidden = Object.assign(frames.map(frame => ({ ...frame, nodes: { ...frame.nodes, ...Object.fromEntries(hide.map(id => [id, { ...frame.nodes[id], visible: false }])) } })), frames.reference ? { reference: frames.reference } : {});
  const built = buildAnimationScene(artifact, { labelTexture: () => ({ texture: new THREE.Texture(), aspect: 1 }) });
  try { return { camera: fitCameraToPoints(subjectPoints(built.scene, hidden), artifact.camera, W / H) }; } finally { built.scene.dispose(); }
}
// The share of the frame's width the bowl spans (its box in the first state), through a camera.
function bowlShare({ artifact, bowl }, camera) {
  const built = buildAnimationScene(artifact, { labelTexture: () => ({ texture: new THREE.Texture(), aspect: 1 }) });
  built.scene.root.updateWorldMatrix(true, true);
  const box = bowl.reduce((all, id) => all.union(new THREE.Box3().setFromObject(built.scene.objects.get(id))), new THREE.Box3());
  built.scene.dispose();
  const view = new THREE.PerspectiveCamera(camera.fov, W / H, 0.01, 1000);
  view.position.fromArray(camera.position); view.lookAt(new THREE.Vector3().fromArray(camera.target)); view.updateMatrixWorld(); view.updateProjectionMatrix();
  const xs = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(view).x);
  return (Math.max(...xs) - Math.min(...xs)) / 2;
}
const arrowIds = ({ artifact }) => artifact.scene.nodes.filter(node => artifact.scene.geometries.find(g => g.id === node.geometry)?.kind === 'arrow').map(node => node.id);

test('the SGD fixture at its highest learning rate: the bowl keeps its share of the frame, and the arrows decide nothing', async () => {
  const sgd = await hand(), arrows = arrowIds(sgd);
  assert.deepEqual(arrows.sort(), ['stepArrow', 'trueArrow']);
  const low = bowlShare(sgd, (await fit(sgd, sgd.defaults.learningRate)).camera);
  const { camera } = await fit(sgd, sgd.max);
  assert.ok(bowlShare(sgd, camera) > 0.95 * low, `the bowl spans ${bowlShare(sgd, camera).toFixed(3)} of the frame, ${low.toFixed(3)} at the default rate`);
  assert.deepEqual(camera, (await fit(sgd, sgd.max, arrows)).camera, 'the view is the one without the arrows');
});

test('the failed generation\'s saved draft (arrows at 3x): a rate where the arrows outgrow the bowl does not shrink the bowl', async () => {
  const draft = await saved(), arrows = arrowIds(draft);
  assert.deepEqual(arrows.sort(), ['ga', 'sa']);
  const low = bowlShare(draft, (await fit(draft, draft.defaults.learningRate)).camera);
  const middle = (await fit(draft, 0.5)).camera;
  assert.ok(bowlShare(draft, middle) > 0.95 * low, `learning rate 0.5: ${bowlShare(draft, middle).toFixed(3)} of the frame, ${low.toFixed(3)} at the default rate`);
  // At 1 the program sends the ball itself far out of the bowl in one step (Diverged): that motion is framed, the arrows (to 10 units either way) are not.
  assert.deepEqual((await fit(draft, draft.max)).camera, (await fit(draft, draft.max, arrows)).camera, 'the view is the one without the arrows');
});
