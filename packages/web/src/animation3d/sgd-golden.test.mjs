import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as contract from './contract.js';
import { ANIMATION_CAPABILITIES, ANIMATION_CLIENT_FEATURES } from './capabilities.js';
import { fitAnimationView } from './framing.js';
import { buildAnimationScene } from './scene.js';
import { buildGolden, goldenText } from './testdata/build-sgd-golden.mjs';

// The golden SGD artifact (AN-19, owner decisions 11 to 13 of 3 Nov 2026): testdata/sgd-golden.json, built by testdata/build-sgd-golden.mjs.
// A fixture and an exemplar, never a canned result. Three layers, so a failure names its layer:
//   structure   the plan's table (section 8, AN-18/AN-19), checked here with no contract code
//   contract    validateAnimationArtifact and validateAnimationFrame, for a client declaring every feature
//   behavior    the program in the pinned QuickJS engine against closed-form values worked out by hand
const FILE = new URL('./testdata/sgd-golden.json', import.meta.url);
const golden = JSON.parse(readFileSync(FILE, 'utf8'));
const { plan, artifact } = golden;
const { geometries, nodes } = artifact.scene;
const geometry = id => geometries.find(g => g.id === id);
const node = id => nodes.find(n => n.id === id);
const kindOf = n => geometry(n.geometry)?.kind;

let runtime = null;
try { runtime = await import('../explain-program/runtime.js'); } catch { runtime = null; }
const run = runtime ? test : test.skip;
let engine;
before(async () => { if (runtime) engine = await runtime.loadEngine(); });
after(() => engine?.dispose?.());

test('the JSON is exactly what build-sgd-golden.mjs builds (heights, program hash and plan hash cannot drift)', async () => {
  assert.equal(readFileSync(FILE, 'utf8'), goldenText(await buildGolden()), 'run: node src/animation3d/testdata/build-sgd-golden.mjs');
  assert.equal(artifact.planHash, await contract.hashAnimationPlan(plan));
  assert.equal(artifact.program.sourceHash, await contract.hashProgramSource(artifact.program.source));
  assert.equal(artifact.capabilityVersion, ANIMATION_CAPABILITIES.version);
});

test('structure: a 24 x 24 convex bowl with 8 contours, heights from a quadratic', () => {
  const surfaces = geometries.filter(g => g.kind === 'surface');
  assert.equal(surfaces.length, 1);
  const [{ heights, width, depth, contours }] = surfaces;
  assert.equal(heights.length, 24);
  assert.ok(heights.every(row => row.length === 24 && row.every(Number.isFinite)), 'rectangular and finite');
  assert.ok(contours >= 6 && contours <= 8 && contours === 8);
  assert.equal(width, depth);
  // heights[row][col]: row runs along z, column along x, both from -width/2 to width/2. The quadratic is 0.25 (3 x^2 + z^2).
  const at = i => -width / 2 + width * i / 23;
  heights.forEach((row, r) => row.forEach((h, c) => assert.ok(Math.abs(h - 0.25 * (3 * at(c) ** 2 + at(r) ** 2)) <= 0.005 + 1e-9, `heights[${r}][${c}]`)));
  const flat = heights.flat(), lowest = flat.indexOf(Math.min(...flat));
  assert.ok([11, 12].includes(Math.floor(lowest / 24)) && [11, 12].includes(lowest % 24), 'the lowest cell is one of the four at the centre');
  for (let i = 1; i < 23; i += 1) for (let j = 0; j < 24; j += 1) {
    assert.ok(heights[i - 1][j] - 2 * heights[i][j] + heights[i + 1][j] >= -0.011, `convex along z at ${i},${j}`);
    assert.ok(heights[j][i - 1] - 2 * heights[j][i] + heights[j][i + 1] >= -0.011, `convex along x at ${j},${i}`);
  }
});

test('structure: one ball clamped to the surface node, a trail and a ghost, offset arrows with tip labels', () => {
  const spheres = nodes.filter(n => kindOf(n) === 'sphere' && n.clampTo);
  assert.equal(spheres.length, 1, 'one ball with clampTo');
  const [ball] = spheres, surfaceNode = node(ball.clampTo.node);
  assert.equal(kindOf(surfaceNode), 'surface');
  assert.deepEqual(nodes.filter(n => n.clampTo).map(n => n.id), [ball.id], 'one clamp');
  const radius = geometry(ball.geometry).radius;
  const trails = geometries.filter(g => g.kind === 'trail');
  assert.deepEqual(trails.map(g => g.style).sort(), ['ghost', 'trail']);
  for (const g of trails) assert.ok(g.max >= 41 && g.max <= 512, 'a 20-step run fits');
  assert.equal(nodes.filter(n => kindOf(n) === 'trail').length, 2, 'one node per style');
  const arrows = nodes.filter(n => kindOf(n) === 'arrow');
  assert.ok(arrows.length >= 2);
  for (const arrow of arrows) {
    assert.equal(arrow.parent, ball.id, 'drawn from the ball');
    assert.equal(geometry(arrow.geometry).offset, radius, 'offset equals the ball radius');
    const tips = nodes.filter(n => n.parent === arrow.id && geometry(n.geometry)?.kind === 'label' && geometry(n.geometry).anchor === 'tip');
    assert.equal(tips.length, 1, `${arrow.id} has a tip label`);
  }
  assert.equal(nodes.filter(n => kindOf(n) === 'arrow' || n.clampTo).length, 3);
});

test('structure: a text status readout with the four words, a number readout for the true loss, and the controls', () => {
  const status = artifact.readouts.find(r => r.id === 'status');
  assert.deepEqual(status, { id: 'status', label: 'Status', kind: 'text' });
  for (const word of ['running', 'paused', 'converged', 'diverged']) assert.ok(artifact.program.source.includes(`'${word}'`), word);
  assert.ok(artifact.readouts.some(r => r.id === 'loss' && r.kind === undefined), 'the true loss is a number readout');
  const rate = artifact.parameters.find(p => p.id === 'learningRate');
  assert.deepEqual([rate.type, rate.min, rate.max], ['number', 0.01, 2]);
  assert.ok(rate.default === 0.1 && 1.5 <= rate.max, 'the comparison rates 0.1 and 1.5 are on the slider');
  assert.ok(artifact.parameters.some(p => p.id === 'batchSize' && p.type === 'select'));
  assert.deepEqual(artifact.actions.map(a => [a.id, a.startsMotion]), [['run', undefined], ['pause', false], ['step', false], ['newRun', false]]);
  assert.equal(artifact.stepped, true);
  assert.deepEqual(plan.parameters, artifact.parameters, 'the artifact keeps the approved plan\'s controls');
});

test('structure: a fixture that says so, inside the MVP phase limits counted by hand', () => {
  assert.equal(artifact.provenance.origin, 'fixture');
  assert.match(artifact.title, /^Offline fixture/); // the dev seed-fixture route accepts only these
  assert.match(artifact.description, /^OFFLINE FIXTURE, not generated by a model/);
  const { limits } = ANIMATION_CAPABILITIES, cost = { surface: g => 2 * 23 * 23, trail: g => 2 * 8 * (g.max - 1), sphere: g => 2 * g.widthSegments * (g.heightSegments - 1), arrow: () => 48, label: () => 2 };
  const points = { surface: g => g.contours * 4 * (24 + 24 - 2), trail: g => g.max };
  const used = nodes.map(n => geometry(n.geometry)).filter(Boolean);
  assert.equal(used.reduce((sum, g) => sum + (cost[g.kind]?.(g) ?? 0), 0), 1058 + 2 * 1008 + 528 + 168 + 2 * 48 + 3 * 2, 'triangles by hand');
  assert.equal(used.reduce((sum, g) => sum + (points[g.kind]?.(g) ?? 0), 0), 8 * 4 * 46 + 64 + 64, 'line points by hand');
  assert.ok(nodes.length <= limits.nodes && nodes.length === 10);
  assert.ok(used.filter(g => g.kind === 'label').length + artifact.readouts.length <= limits.labels);
  assert.ok(new TextEncoder().encode(artifact.program.source).length <= limits.sourceBytes, 'the program is within 16 KiB');
});

test('contract: the plan and the artifact validate, for a client that declares every feature', () => {
  assert.deepEqual(contract.validateAnimationPlan(plan).issues, undefined);
  const checked = contract.validateAnimationArtifact(artifact, undefined, { draft: true });
  assert.deepEqual(checked.issues, undefined);
  const needed = new Set(contract.clientFeatureUses(artifact).map(u => u.feature));
  assert.deepEqual([...needed].sort(), ['arrow_anchor', 'clamp', 'surface_grid', 'text_readout', 'trail_points']);
  for (const feature of needed) assert.ok(ANIMATION_CLIENT_FEATURES.includes(feature), `${feature} is declared by the client`);
});

// ---- behavior, in the pinned engine ---------------------------------------------------------------------------------------
const call = (operation, request) => {
  const out = runtime.runProgram(engine, { source: artifact.program.source, request: { seed: artifact.seed, time: 0, ...request }, operation });
  assert.equal(out.ok, true, out.detail);
  return out.value;
};
const press = (state, action, inputs) => call('reduce', { state, event: { type: 'action', action }, inputs });
const tick = (state, n, inputs) => call('reduce', { state, event: { type: 'step', tick: n }, inputs });
const shown = (state, inputs) => call('evaluate', { state, inputs });
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
// The host's clock: ticks 1, 2, 3 ...; the program takes a step on every sixth.
const runUntilOver = (inputs, from = 'run') => {
  let state = press(call('initialize', { inputs }), from, inputs), steps = 0;
  for (let t = 1; t <= 6 * 80 && !['converged', 'diverged'].includes(shown(state, inputs).readouts.status); t += 1) {
    const after = tick(state, t, inputs);
    if (after.step !== state.step) steps += 1;
    state = after;
  }
  return { state, steps };
};
// Closed form with all 256 examples (no noise), from the start (0.3, 1.6): x_n = 0.3 (1 - 3 r)^n, z_n = 1.6 (1 - r)^n, loss = (3 x^2 + z^2) / 2.
const closed = (rate, n) => { const x = 0.3 * (1 - 3 * rate) ** n, z = 1.6 * (1 - rate) ** n; return { x, z, loss: 0.5 * (3 * x * x + z * z) }; };
const FULL = '256';

run('learning rate 0.1: paused until Run, then converges in 20 steps along the closed form; the true loss and the path agree', () => {
  const inputs = { learningRate: 0.1, batchSize: FULL }, start = call('initialize', { inputs });
  const first = shown(start, inputs);
  assert.equal(first.readouts.status, 'paused');
  near(first.readouts.loss, closed(0.1, 0).loss, 'start loss');
  assert.equal(shown(tick(start, 6, inputs), inputs).readouts.steps, 0, 'a tick does nothing before Run');
  const running = press(start, 'run', inputs);
  assert.equal(shown(running, inputs).readouts.status, 'running');
  assert.equal(tick(running, 5, inputs).step, 0, 'only every sixth tick steps');
  const { state, steps } = runUntilOver(inputs);
  assert.equal(steps, 20);
  const end = shown(state, inputs);
  assert.equal(end.readouts.status, 'converged');
  near(end.readouts.loss, closed(0.1, 20).loss, 'loss after 20 steps');
  assert.ok(end.readouts.loss < 0.02 && closed(0.1, 19).loss >= 0.02, 'the first step under 0.02');
  assert.equal(end.nodes.trail.points.length, 21);
  near(end.nodes.trail.points[20][0], closed(0.1, 20).x, 'last path x');
  near(end.nodes.trail.points[20][2], closed(0.1, 20).z, 'last path z');
  assert.equal(end.nodes.stepArrow.visible, false, 'a finished run shows no arrows');
});

run('learning rate 1.5: the first step overshoots across the bowl, the second leaves it; the ball keeps its true height and the loss its true value', () => {
  const inputs = { learningRate: 1.5, batchSize: FULL };
  const start = press(call('initialize', { inputs }), 'run', inputs);
  const arrow = shown(start, inputs).nodes.stepArrow; // the next step, 1:1 in the bowl's units: (-1.35, -2.4)
  near(arrow.scale[1], 2, 'next step |(-1.35, -2.4)| = 2.7536 drawn at 4.5 times is 12.4 long: held at the longest, 2');
  const { state, steps } = runUntilOver(inputs);
  assert.equal(steps, 2);
  const one = shown(press(call('initialize', { inputs }), 'step', inputs), inputs);
  near(one.readouts.loss, closed(1.5, 1).loss, 'loss after one step');
  assert.equal(one.readouts.status, 'paused', 'a single Step leaves the run paused, still on the bowl');
  assert.deepEqual([one.nodes.ball.position[0], one.nodes.ball.position[2]].map(v => Math.round(v * 1e9) / 1e9), [-1.05, -0.8]);
  const end = shown(state, inputs);
  assert.equal(end.readouts.status, 'diverged');
  near(end.readouts.loss, closed(1.5, 2).loss, 'true loss 20.34');
  near(end.readouts.loss, 20.3384375, 'true loss, by hand: (3 x 3.675^2 + 0.4^2) / 2');
  assert.ok(end.nodes.ball.position[1] > 10.5 && end.nodes.ball.position[1] < 11.2, 'the program draws the ball at its true height (about 10.8), the renderer clamps it');
  assert.equal(end.nodes.trail.points.length, 3);
  const [rx, ry, rz] = end.nodes.trail.points.at(-1);
  assert.equal(rx, 2, 'the path ends at the rim, where the renderer holds the ball (x 3.675 held to 2), not outside the bowl');
  near(rz, 0.4, 'its z is the ball z');
  assert.ok(Math.abs(ry - 4.06) < 1e-9, 'at the surface top plus the path lift');
  assert.ok(end.nodes.trail.points.every(p => p[1] <= 4.0601), 'the trail, which the renderer does not clamp, stays at the bowl top');
  assert.equal(end.nodes.fullArrow.visible, false);
});

run('batch noise: the same run and step give the same path, a smaller batch leaves the true path, all 256 examples add none', () => {
  const at = (batchSize) => shown(press(press(call('initialize', { inputs: { learningRate: 0.1, batchSize } }), 'step', { learningRate: 0.1, batchSize }), 'step', { learningRate: 0.1, batchSize }), { learningRate: 0.1, batchSize });
  const again = at('1'), twice = at('1');
  assert.deepEqual(again.nodes.ball.position, twice.nodes.ball.position, 'deterministic');
  const exact = closed(0.1, 2), noisy = at('1'), full = at(FULL);
  near(full.readouts.loss, exact.loss, 'full batch is the closed form');
  assert.ok(Math.abs(noisy.readouts.loss - exact.loss) > 1e-3, 'batch 1 differs from the true path');
});

run('actions: Pause stops it, Step once moves one step and stays paused, New run keeps the old path as the ghost, a finished run ignores Run', () => {
  const inputs = { learningRate: 0.1, batchSize: FULL };
  let state = press(call('initialize', { inputs }), 'run', inputs);
  for (let t = 1; t <= 18; t += 1) state = tick(state, t, inputs); // three steps
  assert.equal(state.step, 3);
  const paused = press(state, 'pause', inputs);
  assert.equal(shown(paused, inputs).readouts.status, 'paused');
  assert.equal(tick(paused, 24, inputs).step, 3, 'no step while paused');
  const stepped = press(paused, 'step', inputs);
  assert.equal(stepped.step, 4);
  assert.equal(shown(stepped, inputs).readouts.status, 'paused');
  const next = press(stepped, 'newRun', inputs), after = shown(next, inputs);
  assert.equal(after.nodes.ghost.points.length, 5, 'the four steps and the start are kept');
  assert.equal(after.nodes.trail.points.length, 1);
  assert.equal(after.readouts.steps, 0);
  assert.deepEqual(shown(press(next, 'newRun', inputs), inputs).nodes.ghost.points, after.nodes.ghost.points, 'a run with no steps replaces nothing');
  const { state: done } = runUntilOver(inputs);
  assert.equal(press(done, 'run', inputs).on, done.on, 'Run on a converged run changes nothing');
  assert.equal(shown(call('initialize', { inputs }), inputs).nodes.ghost.points.length, 0, 'Reset (initialState) clears the ghost');
});

run('the path is bounded: a long slow run keeps the last 64 points, and every frame value is finite and within the coordinate limit', () => {
  const inputs = { learningRate: 0.01, batchSize: FULL };
  let state = press(call('initialize', { inputs }), 'run', inputs);
  for (let t = 1; t <= 6 * 100; t += 1) state = tick(state, t, inputs);
  const frame = shown(state, inputs);
  assert.equal(frame.nodes.trail.points.length, 64);
  assert.equal(frame.readouts.steps, 100);
  for (const value of JSON.stringify(frame).match(/-?\d+\.?\d*(?:e[+-]?\d+)?/g)) assert.ok(Math.abs(Number(value)) < contract.CONTRACT_LIMITS.coordinate);
});

run('every frame of both comparison runs validates against the contract, and the state stays within the snapshot budget', () => {
  const checked = contract.validateAnimationArtifact(artifact, undefined, { draft: true });
  for (const learningRate of [0.1, 1.5]) {
    const inputs = { learningRate, batchSize: '16' };
    let state = press(call('initialize', { inputs }), 'run', inputs);
    for (let t = 1; t <= 6 * 30; t += 1) {
      state = tick(state, t, inputs);
      const result = contract.validateAnimationFrame(shown(state, inputs), checked.value);
      assert.deepEqual(result.issues, undefined, `lr ${learningRate} tick ${t}`);
    }
    assert.ok(new TextEncoder().encode(JSON.stringify(state)).length < 32 * 1024);
  }
});

// The renderer's side, on the real scene builder, clamp and fit in Node (no GL): what animation-primitives-check.mjs looks for in a browser, worked out by projection and
// by RAY CASTING from the camera against the real surface mesh, because a path or a ball behind the bowl's own near wall is drawn and still invisible (CI run 41762152651:
// the first camera sat 22 degrees above the floor, the near rim hid the ball and the path at every step). The card's viewport is 725 x 240 once More settings is open
// (725 x 314 before), so the aspects are 2.3 to 3.4. The workerFactory is the one framing.test.mjs uses.
const workerFactory = () => {
  const worker = {
    terminated: false, terminate() { worker.terminated = true; },
    postMessage: message => queueMicrotask(() => { if (!worker.terminated) worker.onmessage?.({ data: { id: message.id, ...runtime.runProgram(engine, message) } }); }),
  };
  queueMicrotask(() => worker.onmessage?.({ data: { ready: true } }));
  return worker;
};
const HEIGHT = 240, ASPECTS = [2.3, 725 / 240, 3.4];
const hullShare = (points, area) => { // the convex hull's area as a share of the view
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = list => { const out = []; for (const p of list) { while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } return out.slice(0, -1); };
  const hull = [...chain(sorted), ...chain(sorted.slice().reverse())];
  return Math.abs(hull.reduce((sum, a, i) => { const b = hull[(i + 1) % hull.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2 / area;
};
async function drawn(learningRate, aspect, play) {
  const width = Math.round(HEIGHT * aspect), inputs = { learningRate, batchSize: FULL };
  const fit = await fitAnimationView({ artifact, aspect, inputs, workerFactory });
  const camera = new THREE.PerspectiveCamera(fit.fov, aspect, 0.1, 2000);
  camera.position.fromArray(fit.position); camera.lookAt(...fit.target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const built = buildAnimationScene(artifact, { labelTexture: () => ({ texture: new THREE.Texture(), aspect: 1 }) }), { scene } = built;
  const screen = point => { const p = point.clone().project(camera); return [(p.x + 1) / 2 * width, (1 - p.y) / 2 * HEIGHT]; };
  let state = call('initialize', { inputs }), result = null;
  play({ press: action => { state = press(state, action, inputs); }, tick: n => { state = tick(state, n, inputs); } });
  const frame = call('evaluate', { inputs, state }); result = scene.apply(frame); scene.root.updateWorldMatrix(true, true);
  const meshes = []; scene.objects.get('bowl').traverse(o => { if (o.isMesh) meshes.push(o); });
  const ray = new THREE.Raycaster(), eye = camera.position.clone();
  const seen = point => { const toward = point.clone().sub(eye), far = toward.length(); ray.set(eye, toward.normalize()); ray.far = far; const hit = ray.intersectObjects(meshes, false)[0]; return !hit || hit.distance > far - 0.04; }; // nothing of the bowl in front of it
  const inside = ([x, y]) => x > 6 && x < width - 6 && y > 6 && y < HEIGHT - 6;
  const world = scene.objects.get('ball').getWorldPosition(new THREE.Vector3()), path = frame.nodes.trail.points.map(p => new THREE.Vector3(...p));
  const bowl = []; meshes.forEach(o => { const at = o.geometry.attributes.position; for (let i = 0; i < at.count; i += 1) bowl.push(screen(new THREE.Vector3().fromBufferAttribute(at, i).applyMatrix4(o.matrixWorld))); });
  const visible = id => { let shown = false; scene.objects.get(id).traverse(o => { if ((o.isMesh || o.isLine) && o.visible) shown = true; }); return shown; };
  let lit = null; scene.objects.get('trail').traverse(o => { if (o.isMesh) lit = o.geometry.attributes.normal ?? false; }); // a lit tube needs vertex normals: without them it renders (0, 0, 0)
  const normalsUnit = n => lit && Array.from({ length: n * 8 }, (_, i) => Math.abs(Math.hypot(lit.getX(i), lit.getY(i), lit.getZ(i)) - 1) < 1e-6).every(Boolean);
  const plates = scene.layoutLabels({ width, height: HEIGHT, camera, ratio: 1 });
  const out = { frame, plates, clamped: result.clamped, lit: normalsUnit(path.length), ballY: world.y, ballSeen: seen(world), ballInside: inside(screen(world)), pathSeen: path.filter(seen).length, pathPoints: path.length,
    bowlWidth: (Math.max(...bowl.map(p => p[0])) - Math.min(...bowl.map(p => p[0]))) / width, bowlShare: hullShare(bowl, width * HEIGHT), trail: visible('trail'), ghost: visible('ghost') };
  built.scene.dispose();
  return out;
}
const finish = p => { p.press('run'); for (let t = 1; t <= 6 * 25; t += 1) p.tick(t); };
const STATES = {
  start: () => {}, mid: p => { for (let i = 0; i < 5; i += 1) p.press('step'); }, converged: finish, kept: p => { finish(p); p.press('newRun'); },
};

run('at the card viewport sizes nothing the learner needs is hidden behind the bowl: the ball and every path point are in line of sight and in view, at start, mid-run and converged', async () => {
  for (const aspect of ASPECTS) for (const [name, play] of Object.entries(STATES)) {
    const got = await drawn(0.1, aspect, play);
    assert.equal(got.ballSeen, true, `${name} at aspect ${aspect.toFixed(2)}: the ball is hidden by the bowl`);
    assert.equal(got.ballInside, true, `${name} at aspect ${aspect.toFixed(2)}: the ball is outside the view`);
    assert.equal(got.pathSeen, got.pathPoints, `${name} at aspect ${aspect.toFixed(2)}: ${got.pathPoints - got.pathSeen} of ${got.pathPoints} path points are behind the bowl`);
    assert.ok(got.bowlShare >= 0.15, `${name} at aspect ${aspect.toFixed(2)}: the bowl is ${(got.bowlShare * 100).toFixed(0)}% of the view`);
  }
});

run('rendered by the real scene builder: nothing is drawn as a path until a step, the path and the kept path appear', async () => {
  const start = await drawn(0.1, 725 / 240, STATES.start);
  assert.deepEqual([start.trail, start.ghost, start.clamped], [false, false, []], 'one path point draws nothing; no clamp inside the bowl');
  const done = await drawn(0.1, 725 / 240, STATES.converged);
  assert.equal(done.frame.readouts.status, 'converged');
  assert.deepEqual([done.trail, done.ghost], [true, false]);
  assert.equal(done.lit, true, 'the path tube has unit vertex normals for every ring of its 21 points (CI run 41762152651 drew it pure black without them)');
  const kept = await drawn(0.1, 725 / 240, STATES.kept);
  assert.deepEqual([kept.trail, kept.ghost], [false, true], 'New run: the old path is the ghost, the new one has one point');
});

run('rendered at learning rate 1.5: the ball is held at the surface top while the Loss keeps its true value, and the fitted camera keeps the ball, the whole path and most of the bowl in view', async () => {
  for (const aspect of ASPECTS) {
    const far = await drawn(1.5, aspect, p => { p.press('run'); for (let t = 1; t <= 12; t += 1) p.tick(t); });
    assert.equal(far.frame.readouts.status, 'diverged');
    assert.equal(far.clamped.length, 1);
    assert.ok(far.clamped[0].trueY > 10 && far.clamped[0].y === 4 && Math.abs(far.ballY - 4) < 1e-9, `true ${far.clamped[0].trueY}, drawn ${far.ballY}`);
    assert.ok(far.frame.readouts.loss > 20, 'the readout keeps the true value');
    assert.deepEqual([far.ballSeen, far.ballInside, far.pathSeen, far.trail], [true, true, 3, true], `at aspect ${aspect.toFixed(2)}`);
    assert.ok(far.bowlShare >= 0.12 && far.bowlWidth >= 0.2, `the bowl keeps ${(far.bowlShare * 100).toFixed(0)}% of the view, ${(far.bowlWidth * 100).toFixed(0)}% of its width, at aspect ${aspect.toFixed(2)}`);
  }
});

// ---- the arrows (decision 34, C10 Gate 2 control: the review of this golden returned majors) -----------------------------------
// Both arrows are STEPS at one disclosed scale: Next step is the step this batch gives, Full-batch step the step all 256 examples would give. Near the lowest point an
// arrow is hidden rather than left as an unlabelled speck. At the default rate the largest typical step, drawn, is under a quarter of the surface width (the archetype rule).
const SCALE = Number(artifact.program.source.match(/SCALE = ([\d.]+)/)[1]);
const arrowsAt = (inputs, upTo) => { let state = call('initialize', { inputs }); state = press(state, 'run', inputs); const frames = [shown(state, inputs)]; for (let t = 1; frames.length <= upTo && t <= 6 * 80; t += 1) { const after = tick(state, t, inputs); if (after.step !== state.step) frames.push(shown(after, inputs)); state = after; } return frames; };

test('structure: the arrows are steps, labelled as steps, in colours that are neither the path nor each other', () => {
  const materialOf = id => artifact.scene.materials.find(m => m.id === node(id).material).color, rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const apart = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const [step, full, trail, kept, ball] = ['stepArrow', 'fullArrow', 'trail', 'ghost', 'ball'].map(materialOf);
  for (const [name, a, b] of [['Next step against the path', step, trail], ['Full-batch step against the path', full, trail], ['the two arrows', step, full], ['Next step against the kept path', step, kept], ['Next step against the ball', step, ball]]) assert.ok(apart(a, b) > 100, `${name} are too alike`);
  const labels = ['stepTag', 'fullTag'].map(id => geometry(node(id).geometry).text);
  assert.deepEqual(labels, ['Next step', 'Full-batch step']);
  assert.ok(!/slope|downhill/i.test(labels.join(' ')), 'the second arrow is a step, so it is not called the slope');
  assert.ok(artifact.assumptions.some(a => a.includes(`${SCALE} times`) && a.includes('one scale')), 'the scale is disclosed');
  assert.ok(artifact.assumptions.some(a => /rim/.test(a)), 'a path point outside the bowl is said to be drawn at the rim');
});

run('one scale: both arrows are SCALE times their step; the longest is held, a speck is hidden', () => {
  const full = arrowsAt({ learningRate: 0.1, batchSize: FULL }, 0)[0];
  near(full.nodes.stepArrow.scale[1], SCALE * 0.1 * Math.hypot(3 * 0.3, 1.6), 'Next step with all examples is the full-batch step');
  full.nodes.stepArrow.quaternion.forEach((v, i) => near(v, full.nodes.fullArrow.quaternion[i], 'with all 256 examples the two arrows point the same way'));
  near(full.nodes.stepArrow.scale[1], full.nodes.fullArrow.scale[1], 'and are the same length');
  const noisy = arrowsAt({ learningRate: 0.1, batchSize: '16' }, 0)[0];
  assert.notDeepEqual(noisy.nodes.stepArrow.quaternion, noisy.nodes.fullArrow.quaternion, 'with a batch of 16 the noisy step points a little differently');
  near(noisy.nodes.fullArrow.scale[1], SCALE * 0.1 * Math.hypot(3 * 0.3, 1.6), 'the full-batch step is the same whatever the batch');
  const late = arrowsAt({ learningRate: 0.1, batchSize: FULL }, 15);
  assert.equal(late[15].readouts.status, 'running');
  assert.equal(late[15].nodes.stepArrow.visible, false, 'a step of 0.033 drawn at 4.5 is 0.15 long: hidden, not an unlabelled speck');
  const big = arrowsAt({ learningRate: 1.5, batchSize: FULL }, 0)[0];
  near(big.nodes.stepArrow.scale[1], 2, 'a step far above the default is held at the longest arrow');
});

run('the default rate: the first arrows are 0.75 units or more, and the largest typical step drawn is under a quarter of the surface width', () => {
  const width = geometries.find(g => g.kind === 'surface').width, inputs = { learningRate: 0.1, batchSize: '16' };
  const start = arrowsAt(inputs, 0)[0];
  assert.ok(start.nodes.stepArrow.scale[1] >= 0.75 && start.nodes.fullArrow.scale[1] >= 0.75, `${start.nodes.stepArrow.scale[1]} and ${start.nodes.fullArrow.scale[1]}`);
  // The largest arrow of each of 12 runs (a New run changes the noise), by the median: a typical largest step, not the worst of many.
  let state = call('initialize', { inputs }); const largest = [];
  for (let run = 0; run < 12; run += 1) {
    state = press(state, 'run', inputs); let top = 0;
    for (let t = 1; t <= 6 * 70; t += 1) { const f = shown(state, inputs); top = Math.max(top, f.nodes.stepArrow.scale?.[1] ?? 0, f.nodes.fullArrow.scale?.[1] ?? 0); if (['converged', 'diverged'].includes(f.readouts.status)) break; state = tick(state, t, inputs); }
    largest.push(top); state = press(state, 'newRun', inputs);
  }
  const median = largest.slice().sort((a, b) => a - b).filter((_, i, all) => i === Math.floor(all.length / 2) - 1 || i === Math.floor(all.length / 2)).reduce((a, b) => a + b) / 2;
  assert.ok(median < width / 4, `the median largest arrow is ${median.toFixed(3)}, a quarter of the surface width is ${width / 4}`);
});

run('rendered: at the default rate both arrow labels show at the start, at every card size, so a reader can tell the noisy step from the full-batch step', async () => {
  for (const aspect of ASPECTS) for (const batch of ['16', FULL]) {
    const inputs = { learningRate: 0.1, batchSize: batch };
    const got = await drawn(0.1, aspect, () => {});
    for (const id of ['stepTag', 'fullTag']) assert.ok(got.plates.some(plate => plate.id === id && plate.shown), `${id} is not shown at aspect ${aspect.toFixed(2)} (the renderer hides an arrow's label under 24 px)`);
    assert.ok(inputs.batchSize === batch);
  }
});
