// C12 (b)(i) to (iii) and (e): render-stage problems found in the capture traces, the same kind as a buried marker (animation-buried-marker.test.js): repairable spec problems, before any review
// is paid, through the existing repair path (no correction ask). Job shapes are small inline fixtures from the C11 Gate 2 evidence, not machine-local files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_CAPTURE, renderStage, traceProblems } from '../src/animation-render.js';
import { artifactHashOf } from '../src/animation-author.js';
import { primitivesFixture } from '../../web/src/animation3d/fixtures.js';

// A stepped experiment whose rate control has a high end, with a text status, a step count and a run path (and a kept path that is not counted).
const sgd = {
  parameters: [{ id: 'learningRate', type: 'number', min: 0.01, max: 2, default: 0.1 }],
  readouts: [{ id: 'status', label: 'Status', kind: 'text' }, { id: 'loss', label: 'Loss (true value)', decimals: 3 }, { id: 'steps', label: 'Steps taken', decimals: 0 }],
  scene: { geometries: [{ id: 'runPath', kind: 'trail', max: 64, style: 'trail' }, { id: 'keptPath', kind: 'trail', max: 64, style: 'ghost' }], nodes: [{ id: 'trail', geometry: 'runPath' }, { id: 'ghost', geometry: 'keptPath' }] },
};
// A capture as the render stage hands it on: the state it was taken in, and its trace.
const shot = (id, { rate = 0.1, ticks = 90, events = [{ type: 'action', action: 'run' }], time = 0 } = {}, trace = {}) => ({ id, time, ticks, events, inputs: { learningRate: rate }, trace: { readouts: {}, ...trace } });
const swung = (id, steps, points, rate = 2) => shot(id, { rate }, { readouts: { status: 'diverged', loss: 3.3, steps }, trails: { trail: points } });

test('the trace may carry trails, overlaps, arrowsUnder and arrowsHidden (the capture keys allow them)', () => {
  for (const key of ['trails', 'overlaps', 'arrowsUnder', 'arrowsHidden']) assert.ok(ANIMATION_CAPTURE.traceKeys.includes(key), key);
});

test('(i) a run that reads diverged at the high end of the rate control with fewer than 4 trail points since it started is a problem naming the steps it took', () => {
  const out = traceProblems(sgd, [swung('v0-s2', 1, 2), swung('v1-s2', 1, 2)]); // C11 job 1: the ball leaves the surface in one step at the top rate
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.match(out[0], /^at the highest learningRate \(2\) the run diverges in 1 step in captures v0-s2, v1-s2: its path holds 2 trail points since the run started and a diverging run makes at least 4: /);
  assert.deepEqual(traceProblems(sgd, [swung('v0-s2', 3, 4)]), [], 'four points since the run started: gradual enough');
  assert.deepEqual(traceProblems(sgd, [swung('v0-s2', 4, 5)]), [], 'more than four');
  assert.deepEqual(traceProblems(sgd, [shot('v0-s2', { rate: 2 }, { readouts: { status: 'running', steps: 1 }, trails: { trail: 2 } })]), [], 'it does not read diverged');
  assert.deepEqual(traceProblems(sgd, [swung('v0-s1', 1, 2, 1.5)]), [], 'a rate below the control\'s max is not the high-end sample');
  assert.deepEqual(traceProblems(sgd, [shot('v0-s2', { rate: 2 }, { readouts: { status: 'diverged', steps: 1 } })]), [], 'no run path in the trace: nothing to count');
  assert.deepEqual(traceProblems(sgd, [swung('v0-s0', 0, 1)].map(c => ({ ...c, ticks: 0 }))), [], 'a capture with no steps is not a run');
});

test('(ii) a run still going after K steps whose path holds fewer than K points is a problem that says how often it marks', () => {
  const running = (steps, points, extra = {}) => shot('v0-s1', {}, { readouts: { status: 'running', loss: 0.1, steps, ...extra }, trails: { trail: points } }); // C11 job 1 shape: a mark for every Nth step
  const out = traceProblems(sgd, [running(12, 5)]);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.match(out[0], /^the trail marks every 3rd step: it holds 5 points after 12 steps in capture v0-s1: add a point for every step, so the path shows each one$/);
  assert.match(traceProblems(sgd, [running(8, 5)])[0], /^the trail marks every 2nd step: it holds 5 points after 8 steps/);
  assert.deepEqual(traceProblems(sgd, [running(12, 13)]), [], 'the start and a mark for every step');
  assert.deepEqual(traceProblems(sgd, [running(12, 12)]), [], 'a mark for every step');
  assert.deepEqual(traceProblems(sgd, [running(0, 1)]), [], 'no step yet');
  assert.deepEqual(traceProblems(sgd, [shot('v0-s1', {}, { readouts: { status: 'converged', steps: 12 }, trails: { trail: 5 } })]), [], 'the run ended');
  assert.deepEqual(traceProblems(sgd, [running(70, 64)]), [], 'a path holds at most its max: 64 points after 70 steps is full, not sparse');
  assert.deepEqual(traceProblems({ ...sgd, readouts: [{ id: 'status', label: 'Status', kind: 'text' }, { id: 'moves', label: 'Moves made' }] }, [shot('v0-s1', {}, { readouts: { status: 'running', moves: 12 }, trails: { trail: 5 } })]), [], 'no step count reported: nothing to compare');
});

test('(iii) at the initial capture two markers within half a radius of each other are a problem naming both', () => {
  const twins = (id, extra) => shot(id, { ticks: 0, events: [], ...extra }, { overlaps: [{ a: 'ball', b: 'minimumDot', distance: 0.02 }] }); // C11 jobs 3 and 7: twin balls
  const out = traceProblems(sgd, [twins('v0-s0'), twins('v1-s0')]);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.match(out[0], /^one marker hides the other in captures v0-s0, v1-s0: ball and minimumDot are 0.02 apart, under half a radius: put them apart$/);
  assert.deepEqual(traceProblems(sgd, [twins('v0-s1', { ticks: 12 })]), [], 'after steps: a ball reaching the minimum is the point of the run');
  assert.deepEqual(traceProblems(sgd, [twins('v0-s1', { events: [{ type: 'action', action: 'run' }] })]), [], 'after an action');
  assert.deepEqual(traceProblems(sgd, [shot('v0-s0', { ticks: 0, events: [] })]), []);
});

test('(e) an arrow whose tip or middle runs under the surface is a problem that says how to scale it', () => {
  const through = id => shot(id, {}, { arrowsUnder: [{ id: 'stepArrow', point: 'tip', tip: [2.1, 0.3, 0], under: 0.86 }] }); // C11 Gate 2 job 2: 4x at rate 0.6, v0-s2 and v1-s2
  const out = traceProblems(sgd, [through('v0-s2'), through('v1-s2')]);
  assert.equal(out.length, 1, JSON.stringify(out));
  assert.match(out[0], /^the stepArrow arrow runs through the surface in captures v0-s2, v1-s2: its tip is 0.86 under it: scale it so its longest arrow stays under a quarter of the surface width$/);
  assert.deepEqual(traceProblems(sgd, [shot('v0-s2', {}, { arrowsHidden: [{ id: 'stepArrow', hidden: true, length: 0.15, diameter: 0.24 }] })]), [], 'a hidden arrow is the renderer\'s doing, not a problem to repair');
});

// The stage: trace problems are repairable spec problems found before any review is paid, together with a buried marker's.
const media = () => { const objects = new Map(); return { put: async (key, value) => { objects.set(key, new Uint8Array(value)); }, get: async key => (objects.has(key) ? { arrayBuffer: async () => objects.get(key).buffer } : null) }; };
function fakeBrowser(extra) {
  const evaluated = [];
  const page = { setRequestInterception: async () => {}, on: () => {}, emulateMediaFeatures: async () => {}, goto: async () => {}, waitForFunction: async () => {}, setViewport: async () => {},
    evaluate: async (_fn, request) => { evaluated.push(request); return { ok: true, artifactHash: request.artifactHash, trace: { inputs: request.inputs, time: request.time, events: request.events, readouts: {}, ...extra(request, evaluated.length) } }; },
    $: async () => ({ screenshot: async () => new Uint8Array([137, 80, 78, 71, evaluated.length]) }), close: async () => {} };
  return { newPage: async () => page, close: async () => {} };
}
const env = { ASSETS: { fetch: async () => new Response('ok') }, BROWSER: {}, LEARN_MEDIA: media() };
const stage = async extra => renderStage({ browser: fakeBrowser(extra) })({ id: 'aj_1', artifact: primitivesFixture.artifact, artifactHash: await artifactHashOf(primitivesFixture.artifact) }, { env });

test('the render stage answers a trace check as one repairable spec problem list; a buried marker comes first; a clean trace renders as before', async () => {
  const twins = { overlaps: [{ a: 'ball', b: 'twin', distance: 0.03 }] };
  const out = await stage((_request, n) => (n === 1 || n === 4 ? twins : {})); // the initial capture of each view
  assert.deepEqual([out.category, out.repairable, out.captures], ['spec', true, undefined]);
  assert.equal(out.problems.length, 1, JSON.stringify(out.problems));
  assert.match(out.problems[0], /^one marker hides the other in captures v0-s0, v1-s0: ball and twin are 0.03 apart/);
  const both = await stage((_request, n) => (n === 1 ? { ...twins, buried: [{ node: 'ball', y: 0.6625, surfaceY: 1.125 }] } : n === 4 ? twins : {}));
  assert.equal(both.problems.length, 2);
  assert.match(both.problems[0], /^ball is drawn below the surface it sits on/);
  assert.match(both.problems[1], /^one marker hides the other/);
  const clean = await stage(() => ({}));
  assert.equal(clean.problems, undefined);
  assert.ok(clean.captures.length > 0);
});
