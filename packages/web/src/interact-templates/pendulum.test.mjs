import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './pendulum.js';
import { PENDULUM_PLANS } from '../interact-pendulum-plan.js';

// Brief 34: the program run with a recording sdk. The renderer-side checks (plot box, legend, dot on the drawn curve) are scripts/interact/bake-pendulum-geometry.mjs --measure.
const data = PENDULUM_PLANS['stepper-pendulum-detailed'].scene.data;
const sdk = new Proxy({}, { get: (_, fn) => (...args) => ({ fn, args }) });
const evaluate = new Function('sdk', `${source({ geometry: { pendulum: data } }).replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)(sdk);
const run = (length, time) => evaluate({ inputs: { mass: 1, length }, time }).frame.args[0];
const plotOf = (length, time) => run(length, time).find(o => o.fn === 'diagram').args[0].diagram;

test('every peak and trough of both curves is exactly the start angle, and the curves have at most 25 samples', () => {
  for (const length of [0.5, 1, 2]) for (const series of plotOf(length, 0).series) {
    assert.equal(Math.max(...series.samples.y), 20); assert.equal(Math.min(...series.samples.y), -20);
    assert.ok(series.samples.x.length <= 25 && series.samples.x.length === series.samples.y.length);
    assert.equal(series.samples.x.at(-1), 8);
  }
});

test('the plot spec has one structure at every setting and time: only the curve samples differ', () => {
  const shape = diagram => JSON.stringify({ ...diagram, series: diagram.series.map(({ samples, ...rest }) => rest) });
  const first = shape(plotOf(1, 0));
  for (const length of [0.5, 1, 2]) for (const time of [0, 3, 6]) assert.equal(shape(plotOf(length, time)), first);
  assert.equal(plotOf(1, 0).annotations, undefined);
});

test('the time marker is one line and one dot per curve, at the current time across the baked plot area', () => {
  const objects = run(2, 4), F = data.plot.frame, x = F.left + 4 / 8 * (F.right - F.left);
  assert.equal(objects.find(o => o.fn === 'line' && o.args[0] === 'now').args[1], x);
  for (const id of ['dot.A', 'dot.B']) assert.equal(objects.find(o => o.fn === 'circle' && o.args[0] === id).args[1], x);
});

test('the real program in the frozen SDK-8 sandbox gives a frame the host accepts at every setting and time: parsed, normalized, no overlaps, within the object budget', async () => {
  const { parseFrame, CONTRACT_LIMITS } = await import('../explain-program/contract.js'), { normalizeFrame } = await import('../explain-program/frame.js');
  const { frameOverlaps, layoutProblems } = await import('../explain-program/frame-overlap.js'), { loadEngine, runProgram } = await import('../explain-program/runtime.js');
  const engine = await loadEngine(), program = source({ geometry: { pendulum: data } });
  for (const mass of [0.5, 1, 3]) for (const length of [0.5, 1, 2]) for (const time of [0, 3, 6, 8]) {
    const out = runProgram(engine, { source: program, request: { inputs: { mass, length }, time, seed: 1, state: null }, sdkVersion: 'sdk-8' });
    assert.equal(out.ok, true, out.detail);
    assert.equal(parseFrame(out.value.frame).ok, true, `${mass} kg ${length} m t=${time}`); assert.equal(normalizeFrame(out.value.frame).ok, true);
    assert.deepEqual(frameOverlaps(out.value.frame), [], `${mass} kg ${length} m t=${time}`); assert.deepEqual(layoutProblems(out.value.frame), []);
    assert.ok(out.value.frame.objects.length < CONTRACT_LIMITS.objects);
  }
});
