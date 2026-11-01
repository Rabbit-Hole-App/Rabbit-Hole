import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { experimentFixture, watchFixture } from './fixtures.js';
import { FRAMING, fitAnimationView, fitCameraToPoints, sampleAnimationFrames, subjectPoints } from './framing.js';
import { buildAnimationScene } from './scene.js';

// Real Three.js scenes built in Node (labels get a plain Texture), measured over hand-written frames; the sampler half runs on the
// REAL pinned engine through an in-process stand-in for the Worker (as review.test.mjs).
const labelTexture = () => ({ texture: new THREE.Texture(), aspect: 2 });
const ASPECT = 16 / 9;
// A watch artifact with its own scene; frames are written by hand, so its program is never run here.
const sceneArtifact = (geometries, nodes, camera = { position: [0, 0, 40], target: [0, 0, 0], fov: 50 }) => ({
  ...structuredClone(watchFixture.artifact), camera, readouts: [],
  scene: { materials: [{ id: 'grey', color: '#888888' }], geometries, nodes: nodes.map(node => ({ material: 'grey', ...node })) },
});
const ball = [{ id: 'ballGeo', kind: 'sphere', radius: 0.2 }];
const fitOf = (artifact, frames) => {
  const built = buildAnimationScene(artifact, { labelTexture });
  assert.equal(built.ok, true);
  const points = subjectPoints(built.scene, frames);
  built.scene.dispose();
  return { points, camera: fitCameraToPoints(points, artifact.camera, ASPECT) };
};
// Every point's place on screen through the fitted camera, in normalized device coordinates (-1..1 is the view).
const onScreen = (camera, points) => {
  const view = new THREE.PerspectiveCamera(camera.fov, ASPECT, 0.05, 2000);
  view.position.fromArray(camera.position);
  view.lookAt(new THREE.Vector3().fromArray(camera.target));
  view.updateMatrixWorld();
  return points.map(point => point.clone().project(view));
};
const reach = ndc => Math.max(...ndc.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
const direction = camera => new THREE.Vector3().fromArray(camera.position).sub(new THREE.Vector3().fromArray(camera.target)).normalize();

test('a small subject far from the authored camera is pulled in to fill the view, on the authored direction', () => {
  const artifact = sceneArtifact(ball, [{ id: 'ball', geometry: 'ballGeo' }], { position: [0, 20, 40], target: [0, 0, 0], fov: 50 });
  const { points, camera } = fitOf(artifact, [{}]);
  const ndc = onScreen(camera, points);
  assert.ok(reach(ndc) <= FRAMING.fill + 1e-9, `inside the margin: ${reach(ndc)}`);
  assert.ok(reach(ndc) > FRAMING.fill - 0.05, `fills the view: ${reach(ndc)}`);
  assert.ok(new THREE.Vector3().fromArray(camera.position).length() < 3, 'moved from 44.7 to under 3 units');
  assert.ok(direction(camera).distanceTo(direction(artifact.camera)) < 1e-9, 'same viewing direction');
  assert.equal(camera.fov, 50);
});

test('motion beyond the initial frame is framed: every sampled position stays inside the margin', () => {
  const artifact = sceneArtifact(ball, [{ id: 'ball', geometry: 'ballGeo' }]);
  const frames = [{ nodes: { ball: { position: [0, 0, 0] } } }, { nodes: { ball: { position: [5, 1, 0] } } }];
  const { points, camera } = fitOf(artifact, frames);
  assert.ok(reach(onScreen(camera, points)) <= FRAMING.fill + 1e-9);
  assert.ok(Math.abs(camera.target[0] - 2.5) < 1e-9 && Math.abs(camera.target[1] - 0.5) < 1e-9, 'aimed at the middle of the range');
  assert.ok(points.some(point => point.x > 5), 'the moved ball counts');
  assert.ok(fitOf(artifact, frames.slice(0, 1)).camera.position[2] < camera.position[2], 'the range needs a wider view than the start');
});

test('a huge floor plane or ceiling slab is context: it does not shrink the subject, nor do its labels', () => {
  const subject = [{ id: 'ball', geometry: 'ballGeo' }, { id: 'arm', geometry: 'armGeo', position: [0.5, 0, 0] }];
  const geometries = [...ball, { id: 'armGeo', kind: 'box', size: [1, 0.1, 0.1] }];
  const alone = fitOf(sceneArtifact(geometries, subject), [{}]).camera;
  const floor = fitOf(sceneArtifact([...geometries, { id: 'floorGeo', kind: 'plane', width: 50, height: 50 }, { id: 'tag', kind: 'label', text: 'Floor' }],
    [...subject, { id: 'floor', geometry: 'floorGeo', position: [0, -1, 0], quaternion: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, { id: 'floorTag', parent: 'floor', geometry: 'tag', position: [20, 20, 0] }]), [{}]).camera;
  const ceiling = fitOf(sceneArtifact([...geometries, { id: 'slab', kind: 'box', size: [1, 1, 1] }], [...subject, { id: 'ceiling', geometry: 'slab', position: [0, 1, 0], scale: [6, 0.1, 6] }]), [{}]).camera;
  assert.deepEqual(floor, alone);
  assert.deepEqual(ceiling, alone);
});

test('a board a little larger than its tiles is subject, not backdrop, and a floating caption stays in view', () => {
  const tiles = [-1.1, 0, 1.1].flatMap(x => [-1.1, 0, 1.1].map(z => ({ id: `t${x}${z}`.replace(/[.-]/g, '_'), geometry: 'tile', position: [x, 0.1, z] })));
  const artifact = sceneArtifact([{ id: 'boardGeo', kind: 'box', size: [3.6, 0.2, 3.6] }, { id: 'tile', kind: 'box', size: [1, 0.1, 1] }, { id: 'caption', kind: 'label', text: 'Reach the goal' }],
    [{ id: 'board', geometry: 'boardGeo' }, ...tiles, { id: 'status', parent: 'board', geometry: 'caption', position: [0, 0.7, -2.5] }], { position: [0, 5, 4.6], target: [0, 0, 0], fov: 50 });
  const { points, camera } = fitOf(artifact, [{}]);
  assert.ok(points.some(point => Math.abs(point.x) > 1.75), 'the board edge counts');
  assert.ok(points.some(point => point.z < -2.4), 'the caption anchor counts');
  assert.ok(reach(onScreen(camera, points)) <= FRAMING.fill + 1e-9);
});

// ---- the sampler, on the real engine ----------------------------------------------------------------------------------------
let engineModule = null;
try { engineModule = await import('../explain-program/runtime.js'); } catch { engineModule = null; }
const run = engineModule ? test : test.skip;
let engine;
before(async () => { if (engineModule) engine = await engineModule.loadEngine(); });
after(() => engine?.dispose?.());
const workerFactory = () => {
  const worker = {
    terminated: false, terminate() { worker.terminated = true; },
    postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...engineModule.runProgram(engine, message) } }); }),
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};

run('the sampler covers the loop and every parameter range, and the fit is the same on every call', async () => {
  const watch = await sampleAnimationFrames({ artifact: watchFixture.artifact, workerFactory });
  assert.deepEqual(watch.map(frame => frame.nodes.moon.position.map(v => Math.round(v * 1e6) / 1e6 + 0)), [[3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 0, -3]]);
  const lever = await sampleAnimationFrames({ artifact: experimentFixture.artifact, workerFactory });
  const reaches = lever.map(frame => frame.nodes.leftWeight.position[0]);
  const left = experimentFixture.artifact.parameters.find(p => p.id === 'leftDistance');
  assert.ok(reaches.includes(-left.max) && reaches.includes(-left.min), `both ends of leftDistance: ${reaches}`);
  assert.ok(lever.length <= FRAMING.samples);
  const first = await fitAnimationView({ artifact: experimentFixture.artifact, aspect: ASPECT, workerFactory });
  assert.ok(first);
  assert.deepEqual(await fitAnimationView({ artifact: experimentFixture.artifact, aspect: ASPECT, workerFactory }), first);
});

test('any refusal falls back to the initial frame only; an abort answers null; the sampler disposes its own runtime', async () => {
  let disposed = 0;
  const fake = refuse => ({ onFrame }) => {
    let n = 0;
    const answer = () => { onFrame({ nodes: { leftWeight: { position: [-(++n), 0.25, 0] } } }); return { accepted: !refuse }; };
    return { ready: Promise.resolve().then(() => onFrame({ nodes: {} })), dispatch: async () => answer(), seek: async () => answer(), advance: async () => answer(), dispose: () => { disposed += 1; } };
  };
  const refused = await sampleAnimationFrames({ artifact: experimentFixture.artifact, createRuntime: fake(true) });
  assert.deepEqual(refused, [{ nodes: {} }]);
  const abort = new AbortController();
  abort.abort();
  assert.equal(await sampleAnimationFrames({ artifact: experimentFixture.artifact, createRuntime: fake(false), signal: abort.signal }), null);
  assert.equal(disposed, 2);
});

// CI fast-e2e 5c79023f7: the sampler must never take an engine from a card (runtime.js background), and the card waits for the fit
// before it draws, so a sampler with no engine answers the card's shown frame and a slow one is cut at the budget.
test('the sampler runs as a background runtime; with no engine of its own it answers the frame the card shows', async () => {
  const asked = [], shown = { nodes: { leftWeight: { position: [-2, 0.25, 0] } } };
  const noEngine = options => { asked.push(options); const ready = Promise.reject(Object.assign(new Error('no free engine'), { code: 'runtime_limit' })); ready.catch(() => {}); return { ready, dispose() {} }; };
  assert.deepEqual(await sampleAnimationFrames({ artifact: experimentFixture.artifact, frame: shown, createRuntime: noEngine }), [shown]);
  assert.equal(asked[0].background, true);
  assert.deepEqual(await sampleAnimationFrames({ artifact: experimentFixture.artifact, createRuntime: noEngine }), [], 'nothing shown: the authored scene');
});

test('past its time budget the sampler stops its runtime and keeps the frames it finished', async () => {
  const max = { nodes: { leftWeight: { position: [-3, 0.25, 0] } } };
  let stop = null;
  const slow = ({ onFrame }) => {
    let calls = 0;
    const stopped = new Promise(resolve => { stop = resolve; });
    return {
      ready: Promise.resolve().then(() => onFrame({ nodes: {} })),
      dispatch: async () => { if (++calls <= 4) { onFrame(max); return { accepted: true }; } await stopped; return { accepted: false, reason: 'disposed' }; }, // the 4 maxima, then it hangs
      dispose: () => stop(),
    };
  };
  const started = Date.now();
  assert.deepEqual(await sampleAnimationFrames({ artifact: experimentFixture.artifact, createRuntime: slow }), [{ nodes: {} }, max]);
  assert.ok(Date.now() - started < FRAMING.budgetMs + 500, 'cut at the budget');
});
