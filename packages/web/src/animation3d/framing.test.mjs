import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { experimentFixture, gameFixture, watchFixture } from './fixtures.js';
import { FRAMING, fitAnimationView, fitCameraToPoints, raiseElevation, sampleAnimationFrames, subjectPoints, substantialRefit } from './framing.js';
import { readFileSync } from 'node:fs';
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

test('a label floating far from the subject does not widen the view (aj_283c19f: game text 20 m above a ground-level field)', () => {
  const geometries = [{ id: 'fieldGeo', kind: 'box', size: [40, 1, 4] }, { id: 'note', kind: 'label', text: 'Hit!' }];
  const field = [{ id: 'field', geometry: 'fieldGeo', position: [20, 0.5, 0] }];
  const alone = fitOf(sceneArtifact(geometries, field), [{}]).camera;
  const { points, camera } = fitOf(sceneArtifact(geometries, [...field, { id: 'result', geometry: 'note', position: [20, 23, 0] }, { id: 'tag', geometry: 'note', position: [20, 3, 0] }]), [{}]);
  assert.ok(!points.some(point => point.y > 20), 'the far label is not subject');
  assert.ok(points.some(point => Math.abs(point.y - 3) < 1e-9), 'the label beside the field still counts');
  assert.ok(Math.abs(camera.target[1] - alone.target[1]) < 1.5, `aimed at the field, not the sky: ${camera.target[1]}`);
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

run('the sampler covers the loop and the motion at the given inputs, never the parameter extremes; the fit is the same on every call', async () => {
  const watch = await sampleAnimationFrames({ artifact: watchFixture.artifact, workerFactory });
  assert.deepEqual(watch.map(frame => frame.nodes.moon.position.map(v => Math.round(v * 1e6) / 1e6 + 0)), [[3, 0, 0], [0, 0, 3], [-3, 0, 0], [0, 0, -3]]);
  const left = experimentFixture.artifact.parameters.find(p => p.id === 'leftDistance');
  const atDefault = (await sampleAnimationFrames({ artifact: experimentFixture.artifact, workerFactory })).map(frame => frame.nodes.leftWeight.position[0]);
  assert.ok(atDefault.every(x => x === -left.default), `only the default reach: ${atDefault}`);
  const atMax = (await sampleAnimationFrames({ artifact: experimentFixture.artifact, inputs: { leftDistance: left.max }, workerFactory })).map(frame => frame.nodes.leftWeight.position[0]);
  assert.ok(atMax.every(x => x === -left.max), `the chosen reach: ${atMax}`);
  const first = await fitAnimationView({ artifact: experimentFixture.artifact, aspect: ASPECT, workerFactory });
  assert.ok(first);
  assert.deepEqual(await fitAnimationView({ artifact: experimentFixture.artifact, aspect: ASPECT, workerFactory }), first);
  const wide = await fitAnimationView({ artifact: experimentFixture.artifact, aspect: ASPECT, inputs: { leftDistance: left.max }, workerFactory });
  assert.notDeepEqual(wide, first, 'another reach is another fit');
});

test('a refit moves the camera only for a substantial change of distance or aim', () => {
  const at = (distance, x = 0) => ({ position: [x, 0, distance], target: [x, 0, 0], fov: 50 });
  assert.equal(substantialRefit(null, at(10)), true, 'nothing shown yet');
  assert.equal(substantialRefit(at(10), null), false, 'no new fit');
  assert.equal(substantialRefit(at(10), at(11)), false, 'a 10% change keeps the view still');
  assert.equal(substantialRefit(at(10), at(13)), true);
  assert.equal(substantialRefit(at(10), at(7)), true);
  assert.equal(substantialRefit(at(10), at(10, 1)), false);
  assert.equal(substantialRefit(at(10), at(10, 2)), true, 'the aim moved by a fifth of the distance');
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
  const moved = { nodes: { robot: { position: [1, 0, 0] } } };
  let stop = null;
  const slow = ({ onFrame }) => {
    let calls = 0;
    const stopped = new Promise(resolve => { stop = resolve; });
    return {
      ready: Promise.resolve().then(() => onFrame({ nodes: {} })),
      dispatch: async () => { if (++calls <= 1) { onFrame(moved); return { accepted: true }; } await stopped; return { accepted: false, reason: 'disposed' }; }, // the first move, then it hangs
      dispose: () => stop(),
    };
  };
  const started = Date.now();
  assert.deepEqual(await sampleAnimationFrames({ artifact: gameFixture.artifact, createRuntime: slow }), [{ nodes: {} }, moved]);
  assert.ok(Date.now() - started < FRAMING.budgetMs + 500, 'cut at the budget');
});

// FX-AN-025 (aj_fac3ca4b, saved) and the grid robot: the fit at a set of inputs keeps every essential object (targets, the play area,
// reference marks) and the actual motion on screen, at the defaults and at the parameter extremes (owner 2026-11-02: 10 degrees at
// 5 m/s cropped the target; the grid robot's first move cropped its target). On the real engine, through the card's own sampler.
const onScreenAt = async (artifact, inputs, ids) => {
  const frames = await sampleAnimationFrames({ artifact, inputs, workerFactory });
  const built = buildAnimationScene(artifact, { labelTexture });
  const points = subjectPoints(built.scene, frames);
  const camera = fitCameraToPoints(points, artifact.camera, ASPECT);
  const check = {};
  for (const frame of frames) {
    built.scene.apply(frame); built.scene.root.updateWorldMatrix(true, true);
    for (const id of ids) {
      const holder = built.scene.objects.get(id);
      const box = new THREE.Box3().setFromObject(holder);
      const corners = Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      check[id] = Math.max(check[id] ?? 0, reach(onScreen(camera, corners)));
    }
  }
  built.scene.dispose();
  return { frames, check, camera };
};
const loadSavedGame = async () => {
  const { readFileSync } = await import('node:fs');
  const saved = JSON.parse(readFileSync(new URL('./testdata/fx025-game-candidate.json', import.meta.url), 'utf8'));
  const { sealArtifact } = await import('../../../control-plane/src/animation-author.js');
  const { validateAnimationArtifact } = await import('./contract.js');
  const sealed = await sealArtifact(saved.draft, { artifactId: `ar_${'0'.repeat(32)}`, revision: 1, planHash: saved.planHash, createdAt: new Date(saved.createdAt).toISOString() });
  return validateAnimationArtifact(sealed).value;
};
run('the saved FX-AN-025 game: target, launcher, marks and the flight stay on screen at the defaults and at every extreme', async () => {
  const artifact = await loadSavedGame();
  const essential = ['target', 'disc', 'flag', 'base', 'barrel', 't5', 't10', 't20', 't35', 'ballN'];
  for (const inputs of [undefined, { angle: 10, speed: 5 }, { angle: 80, speed: 20 }, { angle: 45, speed: 20 }, { angle: 10, speed: 20 }]) {
    const { frames, check } = await onScreenAt(artifact, inputs, essential);
    if (!inputs) assert.ok(Math.max(...frames.map(f => f.nodes?.ballN?.position?.[0] ?? 0)) > 16, 'the default flight is sampled to its landing');
    for (const [id, r] of Object.entries(check)) assert.ok(r <= 1, `${JSON.stringify(inputs ?? 'defaults')}: ${id} reaches ${r.toFixed(2)} of the view`);
  }
});
run('the grid robot game: the target, the board and the robot\'s moves stay on screen', async () => {
  const { gameFixture: grid } = await import('./fixtures.js');
  const { check } = await onScreenAt(grid.artifact, undefined, grid.artifact.scene.nodes.filter(n => n.geometry).map(n => n.id));
  for (const [id, r] of Object.entries(check)) assert.ok(r <= 1, `${id} reaches ${r.toFixed(2)} of the view`);
  assert.ok(check.target <= 1, 'the target at [3, 0.03, 2]');
});

// Arrows (Animation MVP1 round 4, aj_0b6ca2b5: at learning rate 1 the arrows, drawn at 3x their update, reached far beyond the bowl and the
// camera fitted to them, leaving the bowl a small part of the view). An arrow is drawn proportional to its quantity, with no cap; the fit
// keeps one that stays within FRAMING.caption of the rest of the scene and leaves a longer one to run past the edge of the view.
const ALONG_X = [0, 0, -Math.SQRT1_2, Math.SQRT1_2];
const plate = [{ id: 'plateGeo', kind: 'box', size: [3, 1, 3] }, { id: 'ballGeo', kind: 'sphere', radius: 0.7 }, { id: 'arrowGeo', kind: 'arrow', length: 1 }];
const objects = [{ id: 'plate', geometry: 'plateGeo' }, { id: 'ball', geometry: 'ballGeo', position: [0, 1.2, 0] }];
const push = [{ id: 'push', geometry: 'arrowGeo' }];
const arrowFrame = length => ({ nodes: { push: { position: [1, 1.2, 0], scale: [1, length, 1], quaternion: ALONG_X } } }); // from x = 1, 'length' long
const authored = { position: [0, 0, 40], target: [0, 0, 0], fov: 50 };
const withArrow = length => fitOf(sceneArtifact(plate, [...objects, ...push], authored), [arrowFrame(length)]);
const lengthPx = (length, { camera }) => { // the arrow lies across the view: its drawn length in pixels of a 1000 px wide view
  const [a, b] = onScreen(camera, [new THREE.Vector3(1, 1.2, 0), new THREE.Vector3(1 + length, 1.2, 0)]);
  return Math.abs(b.x - a.x) / 2 * 1000;
};

test('an arrow far longer than its object is not subject: the object keeps its share of the view, the arrow stays proportional', () => {
  const alone = fitOf(sceneArtifact(plate, objects, authored), [{}]);
  const [long, longer] = [withArrow(6), withArrow(12)]; // 6 is under three times the rest of the scene (so not a backdrop), 12 over
  assert.deepEqual(long.camera, alone.camera, 'the view is the one the object alone needs');
  assert.deepEqual(longer.camera, alone.camera);
  assert.ok(!long.points.some(point => point.x > 2), 'no point of the arrow past the object is framed');
  assert.ok(Math.abs(lengthPx(12, longer) / lengthPx(6, long) - 2) < 1e-9, 'twice the vector, twice the pixels: no cap');
  assert.ok(onScreen(long.camera, [new THREE.Vector3(7, 1.2, 0)])[0].x > 1, 'and its tip runs past the edge of the view');
});

test('a short arrow has no minimum length and does not move the view; one that stays near its object is kept in view', () => {
  const alone = fitOf(sceneArtifact(plate, objects, authored), [{}]);
  const tiny = withArrow(0.001);
  assert.deepEqual(tiny.camera, alone.camera);
  assert.ok(Math.abs(lengthPx(0.001, tiny) / lengthPx(0.002, withArrow(0.002)) - 0.5) < 1e-9, 'half the vector, half the pixels, however small');
  const near = withArrow(1.2); // its tip 0.7 past the plate's edge, within a quarter of the object's size
  assert.ok(near.points.some(point => point.x > 2.1), 'the tip is framed');
  assert.ok(reach(onScreen(near.camera, near.points)) <= FRAMING.fill + 1e-9);
});

test('a scene of only arrows is framed by them', () => {
  const { points, camera } = fitOf(sceneArtifact([{ id: 'arrowGeo', kind: 'arrow', length: 1 }], push, authored), [arrowFrame(3)]);
  assert.ok(points.some(point => point.x > 3.9), 'the tip counts');
  assert.ok(reach(onScreen(camera, points)) <= FRAMING.fill + 1e-9);
});

// The fits the saved scenes had before the arrow rule (pinned from 5427f0db4): scenes with no arrow, and the two with a modest one (the grid
// robot's compass, the projectile's aim arrow), are framed exactly as before.
run('the saved scenes keep their fit: none of them has an arrow that dwarfs its object', async () => {
  const { pendulumDemo } = await import('./pendulum-demo.js');
  const { projectileExample, predatorPreyExample } = await import('./learning-examples.js');
  const { gameFixture: grid } = await import('./fixtures.js');
  const max = (artifact, id) => ({ [id]: artifact.parameters.find(p => p.id === id).max });
  const game = await loadSavedGame();
  const cases = [
    [watchFixture.artifact, undefined, [[0, 5.046604051, 6.728805401], [0, 0, 0]]],
    [experimentFixture.artifact, max(experimentFixture.artifact, 'leftDistance'), [[-0.068404008, 1.577277373, 4.912589675], [-0.068404008, 0.173680323, 0]]],
    [grid.artifact, undefined, [[1.712499999, 5.539229749, 5.619092675], [1.712499999, 0.262500004, 1.85]]],
    [pendulumDemo.artifact, max(pendulumDemo.artifact, 'length'), [[1.940965605, 2.386778948, 5.767789492], [-0.270020367, 1.809999999, 0]]],
    [projectileExample.artifact, undefined, [[22.954983897, 12.969047775, 47.374652063], [22.954983897, 11.440833192, 0]]],
    [predatorPreyExample.artifact, undefined, [[5.590000097, 2.974356102, 11.239268768], [5.590000097, 2.299999976, 0]]],
    [game, max(game, 'speed'), [[20.677123145, 21.103651607, 30.678056373], [20.677123145, 5.764623421, 0]]],
  ];
  for (const [artifact, inputs, [position, target]] of cases) {
    const fit = await fitAnimationView({ artifact, aspect: ASPECT, inputs, workerFactory });
    for (const [got, want] of [[fit.position, position], [fit.target, target]]) assert.ok(got.every((v, i) => Math.abs(v - want[i]) < 1e-6), `${artifact.title}: ${got} is not ${want}`);
  }
});

// AN-19 (owner decision 11): a sphere bound to a surface is clamped by the renderer after the program's frame, so the camera fits the clamped box.
const BOWL = [{ id: 'bowlGeo', kind: 'surface', heights: [[2, 1, 1, 2], [1, 0, 0, 1], [1, 0, 0, 1], [2, 1, 1, 2]], width: 4, depth: 4 }, { id: 'ballGeo', kind: 'sphere', radius: 0.2 }];
const bowlNodes = clampTo => [{ id: 'bowl', geometry: 'bowlGeo' }, { id: 'ball', geometry: 'ballGeo', ...(clampTo ? { clampTo } : {}) }];
const ballAt = y => ({ nodes: { ball: { position: [0, y, 0] } } });
const topOf = points => Math.max(...points.map(point => point.y));

test('a clamped marker contributes its clamped box: a ball at 5.6 against a rim at 2 does not widen the fit', () => {
  const clamped = sceneArtifact(BOWL, bowlNodes({ node: 'bowl' }));
  const high = fitOf(clamped, [ballAt(5.6)]), atRim = fitOf(clamped, [ballAt(2)]);
  assert.ok(Math.abs(topOf(high.points) - 2.2) < 1e-6, `the subject reaches the rim plus the ball radius, not 5.8 (${topOf(high.points)})`);
  assert.deepEqual(high.camera, atRim.camera, 'the view is the one with the ball at the rim');
  // Without the clamp the same frame is drawn where it is and the view follows it: this is what the clamp changes.
  const free = fitOf(sceneArtifact(BOWL, bowlNodes(null)), [ballAt(5.6)]);
  assert.ok(Math.abs(topOf(free.points) - 5.8) < 1e-6);
  assert.notDeepEqual(free.camera, atRim.camera);
  // max overrides the surface top; the ball is held at it.
  assert.ok(topOf(fitOf(sceneArtifact(BOWL, bowlNodes({ node: 'bowl', max: 1 })), [ballAt(5.6)]).points) < 2.1, 'held at max 1 (the surface itself reaches 2), never at 5.6');
});

test('an empty trail is not framed: it has no points to fit, and the zero-filled buffer is not a point at the origin', () => {
  const trail = [{ id: 'pathGeo', kind: 'trail', max: 10, style: 'trail', radius: 0.05 }, ...BOWL.slice(1)];
  const artifact = sceneArtifact(trail, [{ id: 'path', geometry: 'pathGeo' }, { id: 'ball', geometry: 'ballGeo' }]);
  const empty = fitOf(artifact, [{ nodes: { ball: { position: [8, 8, 0] } } }]);
  assert.ok(empty.points.every(point => point.x > 7), 'only the ball');
  const drawn = fitOf(artifact, [{ nodes: { ball: { position: [8, 8, 0] }, path: { points: [[6, 6, 0], [8, 8, 0]] } } }]);
  assert.ok(drawn.points.every(point => point.x > 5.9), 'the trail adds its own points and nothing at the origin');
});

// FX-AN-074: a trail above the height a clamp holds the marker to is the diverged path; the fit follows the clamped marker, not the program's trail vertices.
test('a trail above the clamp ceiling is not framed above it; a trail below it is framed as it is', () => {
  const geometries = [...BOWL, { id: 'pathGeo', kind: 'trail', max: 10, style: 'trail' }];
  const artifact = sceneArtifact(geometries, [...bowlNodes({ node: 'bowl' }), { id: 'path', geometry: 'pathGeo' }]);
  const frame = (ballY, pathY) => ({ nodes: { ball: { position: [0, ballY, 0] }, path: { points: [[0, 0.5, 0], [0, pathY, 0]] } } });
  const diverged = fitOf(artifact, [frame(5.6, 5.6)]), atRim = fitOf(artifact, [frame(2, 2)]);
  assert.ok(topOf(diverged.points) <= 2.2 + 1e-6, `nothing is framed above the rim plus the ball radius (${topOf(diverged.points)})`);
  assert.deepEqual(diverged.camera, atRim.camera, 'the view is the one with the path at the rim');
  const below = fitOf(artifact, [frame(1, 1.5)]);
  assert.ok(Math.abs(topOf(below.points) - 1.5) < 1e-6, 'a path under the ceiling is framed where it is');
  const free = fitOf(sceneArtifact(geometries, [...bowlNodes(null), { id: 'path', geometry: 'pathGeo' }]), [frame(5.6, 5.6)]);
  assert.ok(topOf(free.points) > 5.5, 'with no clamp nothing is held');
});

// FX-AN-097 (owner order for C7; Gate 2 on C6 job 2 and C4 jobs 1, 2 and 4: authored cameras at 15 to 25 degrees (the minimum was 25 and is now 35, C9) hid the trail and collapsed the zig-zag): a scene with a surface node is
// never viewed from lower than FRAMING.surfaceElevation degrees above the horizon. Only the elevation is raised; the azimuth, the distance and the target are kept.
const elevationOf = ({ position, target }) => { const [x, y, z] = position.map((v, i) => v - target[i]); return Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI; };
const azimuthOf = ({ position, target }) => { const [x, , z] = position.map((v, i) => v - target[i]); return Math.atan2(z, x) * 180 / Math.PI; };
const distanceOf = ({ position, target }) => Math.hypot(...position.map((v, i) => v - target[i]));
const around = (azimuth, elevation, distance, target = [0, 1, 0]) => {
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  return { position: [target[0] + distance * Math.cos(e) * Math.cos(a), target[1] + distance * Math.sin(e), target[2] + distance * Math.cos(e) * Math.sin(a)], target, fov: 50 };
};

test('raiseElevation lifts a camera below the minimum to it, keeping its azimuth, distance, target and fov; one at or above it is returned as it is', () => {
  assert.equal(FRAMING.surfaceElevation, 35);
  const low = around(30, 10, 40), raised = raiseElevation(low, 35);
  assert.ok(Math.abs(elevationOf(raised) - 35) < 1e-9, `elevation ${elevationOf(raised)}`);
  assert.ok(Math.abs(azimuthOf(raised) - 30) < 1e-9 && Math.abs(distanceOf(raised) - 40) < 1e-9, 'same azimuth and distance');
  assert.deepEqual([raised.target, raised.fov], [low.target, 50]);
  for (const azimuth of [-170, -90, 0, 90, 135]) assert.ok(Math.abs(azimuthOf(raiseElevation(around(azimuth, 3, 20), 35)) - azimuth) < 1e-9, `azimuth ${azimuth}`);
  assert.ok(Math.abs(elevationOf(raiseElevation(around(30, -20, 40), 35)) - 35) < 1e-9, 'a camera below the horizon is lifted too');
  for (const high of [around(30, 35, 40), around(30, 40, 40), around(0, 62, 12), around(0, 90, 12)]) assert.deepEqual(raiseElevation(high, 35), high, `${elevationOf(high)} degrees is untouched`);
  assert.deepEqual(elevationOf(raiseElevation({ position: [0, -5, 0], target: [0, 0, 0], fov: 50 }, 35)) > 34.9, true, 'straight below: lifted, with a defined azimuth');
});

test('a scene with a surface is fitted from at least 35 degrees above, on its authored azimuth; a scene without one keeps its camera direction', () => {
  const surface = sceneArtifact(BOWL, bowlNodes({ node: 'bowl' }), around(30, 10, 40)), plain = sceneArtifact([BOWL[1]], [{ id: 'ball', geometry: 'ballGeo' }], around(30, 10, 40));
  const frames = [{ nodes: { ball: { position: [0, 1, 0] } } }, { nodes: { ball: { position: [1, 0.5, 1] } } }];
  const high = fitOf(surface, frames).camera, flat = fitOf(plain, frames).camera, centre = camera => ({ position: camera.position, target: camera.target });
  assert.ok(Math.abs(elevationOf(centre(high)) - 35) < 1e-6, `the surface scene is viewed from ${elevationOf(centre(high))} degrees`);
  assert.ok(Math.abs(azimuthOf(centre(high)) - 30) < 1e-6, 'on the authored azimuth');
  assert.ok(Math.abs(elevationOf(centre(flat)) - 10) < 1e-6, `a scene with no surface keeps its 10 degrees (${elevationOf(centre(flat))})`);
  const steep = fitOf(sceneArtifact(BOWL, bowlNodes({ node: 'bowl' }), around(30, 40, 40)), frames).camera;
  assert.ok(Math.abs(elevationOf(centre(steep)) - 40) < 1e-6, 'a camera already above the minimum is untouched');
});

test('after the raise the fit still contains the marker and the path, and a tilted low camera sees the whole subject', () => {
  const geometries = [...BOWL, { id: 'pathGeo', kind: 'trail', max: 10, style: 'trail', radius: 0.05 }];
  const artifact = sceneArtifact(geometries, [...bowlNodes({ node: 'bowl' }), { id: 'path', geometry: 'pathGeo' }], around(30, 10, 40));
  const frames = [{ nodes: { ball: { position: [1.5, 1, 1] }, path: { points: [[1.5, 1, 1], [-1, 0.6, 0.4], [0.3, 0.2, -1]] } } }, { nodes: { ball: { position: [-1, 0.5, 0.4] }, path: { points: [[1.5, 1, 1], [-1, 0.6, 0.4]] } } }];
  const { points, camera } = fitOf(artifact, frames);
  assert.ok(Math.abs(elevationOf(camera) - 35) < 1e-6);
  for (const p of onScreen(camera, points)) assert.ok(Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001, `a subject point is off screen at ${p.x}, ${p.y}`);
});

test('the golden SGD camera, already at about 62 degrees, is untouched by the minimum', () => {
  const golden = JSON.parse(readFileSync(new URL('./testdata/sgd-golden.json', import.meta.url), 'utf8')).artifact;
  assert.ok(elevationOf(golden.camera) > 60);
  assert.deepEqual(raiseElevation(golden.camera, 35), golden.camera);
  const scene = buildAnimationScene(golden, { labelTexture });
  assert.equal(scene.ok, true);
  const points = subjectPoints(scene.scene, [{ nodes: {} }]);
  assert.equal(points.surface, true, 'the subject knows it has a surface');
  const fitted = fitCameraToPoints(points, golden.camera, ASPECT);
  assert.ok(Math.abs(elevationOf(fitted) - elevationOf(golden.camera)) < 1e-6, 'the fit keeps its authored direction');
  scene.scene.dispose();
});

// C9 (owner): the minimum is 35 degrees. A camera authored between the old minimum and the new one is lifted too, on the same azimuth.
test('a surface scene authored at 30 degrees is now fitted from 35, on its authored azimuth', () => {
  const artifact = sceneArtifact(BOWL, bowlNodes({ node: 'bowl' }), around(30, 30, 40));
  const { camera } = fitOf(artifact, [{ nodes: { ball: { position: [0, 1, 0] } } }, { nodes: { ball: { position: [1, 0.5, 1] } } }]);
  assert.ok(Math.abs(elevationOf(camera) - 35) < 1e-6 && Math.abs(azimuthOf(camera) - 30) < 1e-6, `${elevationOf(camera)} degrees, azimuth ${azimuthOf(camera)}`);
  assert.deepEqual(raiseElevation(around(30, 35, 40), FRAMING.surfaceElevation), around(30, 35, 40), 'exactly at the minimum is untouched');
});
