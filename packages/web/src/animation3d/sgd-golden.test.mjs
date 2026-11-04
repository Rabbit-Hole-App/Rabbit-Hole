import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as contract from './contract.js';
import { ANIMATION_CAPABILITIES, ANIMATION_CLIENT_FEATURES } from './capabilities.js';
import { buildGolden, goldenText } from './testdata/build-sgd-golden.mjs';

// The golden SGD artifact (AN-19, owner decisions 11 to 13 of 3 Nov 2026): testdata/sgd-golden.json, built by testdata/build-sgd-golden.mjs.
// A fixture and an exemplar, never a canned result. Three layers, so a failure names its layer:
//   structure   the plan's table (section 8, AN-18/AN-19), checked here with no contract code: always runs
//   contract    validateAnimationArtifact for a client declaring every feature: runs once the AN-18 contract is in this checkout
//   behavior    the program in the pinned QuickJS engine against closed-form values worked out by hand: always runs
const FILE = new URL('./testdata/sgd-golden.json', import.meta.url);
const golden = JSON.parse(readFileSync(FILE, 'utf8'));
const { plan, artifact } = golden;
const { geometries, nodes } = artifact.scene;
const geometry = id => geometries.find(g => g.id === id);
const node = id => nodes.find(n => n.id === id);
const kindOf = n => geometry(n.geometry)?.kind;

const contractReady = ANIMATION_CAPABILITIES.geometry.includes('surface'); // AN-18 has landed here
const withContract = contractReady ? test : (name, fn) => test(name, { skip: 'waiting for the AN-18 contract (surface, trail, text readout, arrow anchor, clamp) to be merged into this branch' }, fn);

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

withContract('contract: the plan and the artifact validate, for a client that declares every feature', () => {
  assert.deepEqual(contract.validateAnimationPlan(plan).issues, undefined);
  const checked = contract.validateAnimationArtifact(artifact, undefined, { draft: true });
  assert.deepEqual(checked.issues, undefined);
  if (contract.clientFeatureUses) {
    const needed = new Set(contract.clientFeatureUses(artifact).map(u => u.feature));
    assert.deepEqual([...needed].sort(), ['arrow_anchor', 'clamp', 'surface_grid', 'text_readout', 'trail_points']);
    for (const feature of needed) assert.ok(ANIMATION_CLIENT_FEATURES.includes(feature), `${feature} is declared by the client`);
  }
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
// Closed form with all 256 examples (no noise): x_n = 0.5 (1 - 3 r)^n, z_n = 1.6 (1 - r)^n, loss = (3 x^2 + z^2) / 2.
const closed = (rate, n) => { const x = 0.5 * (1 - 3 * rate) ** n, z = 1.6 * (1 - rate) ** n; return { x, z, loss: 0.5 * (3 * x * x + z * z) }; };
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
  const arrow = shown(start, inputs).nodes.stepArrow; // the next step, 1:1 in the bowl's units: (-2.25, -2.4)
  near(arrow.scale[1], Math.hypot(1.5 * 3 * 0.5, 1.5 * 1.6), 'next step length: |(-2.25, -2.4)| = 3.2898');
  const { state, steps } = runUntilOver(inputs);
  assert.equal(steps, 2);
  const one = shown(press(call('initialize', { inputs }), 'step', inputs), inputs);
  near(one.readouts.loss, closed(1.5, 1).loss, 'loss after one step');
  assert.equal(one.readouts.status, 'paused', 'a single Step leaves the run paused, still on the bowl');
  assert.deepEqual([one.nodes.ball.position[0], one.nodes.ball.position[2]].map(v => Math.round(v * 1e9) / 1e9), [-1.75, -0.8]);
  const end = shown(state, inputs);
  assert.equal(end.readouts.status, 'diverged');
  near(end.readouts.loss, closed(1.5, 2).loss, 'true loss 56.35');
  near(end.readouts.loss, 56.3534375, 'true loss, by hand: (3 x 6.125^2 + 0.4^2) / 2');
  assert.ok(end.nodes.ball.position[1] > 28 && end.nodes.ball.position[1] < 29.5, 'the program draws the ball at its true height (about 29), the renderer clamps it');
  assert.equal(end.nodes.trail.points.length, 3);
  assert.ok(end.nodes.trail.points.every(p => p[1] <= 4.0601), 'the trail, which the renderer does not clamp, stays at the bowl top');
  assert.equal(end.nodes.slopeArrow.visible, false);
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

(contractReady ? run : test.skip)('every frame of both comparison runs validates against the contract, and the state stays within the snapshot budget', () => {
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
