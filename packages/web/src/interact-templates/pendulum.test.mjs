import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './pendulum.js';
import { PENDULUM_PLANS } from '../interact-pendulum-plan.js';

// Briefs 34 and 35: the program run with a recording sdk. Where the plot figure's area really is (plotArea of FrameFigures.jsx) is read by scripts/interact/bake-pendulum-geometry.mjs (--check says whether the baked area is current).
const data = PENDULUM_PLANS['stepper-pendulum-detailed'].scene.data;
const sdk = new Proxy({}, { get: (_, fn) => (...args) => ({ fn, args }) });
const build = d => new Function('sdk', `${source({ geometry: { pendulum: d } }).replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)(sdk);
const evaluate = build(data);
const run = (length, time) => evaluate({ inputs: { mass: 1, length }, time }).frame.args[0];
const named = (objects, id) => objects.find(o => o.args[0] === id);
const A = data.plot.area, yOf = angle => A.bottom - (angle + data.plot.yMax) / (2 * data.plot.yMax) * (A.bottom - A.top);

test('the panel is the frame plot figure with axes and one empty series, the same object at every setting and time', () => {
  const first = JSON.stringify(named(run(1, 0), 'angle.plot'));
  for (const length of [0.5, 1, 2]) for (const time of [0, 3, 6]) assert.equal(JSON.stringify(named(run(length, time), 'angle.plot')), first);
  const figure = named(run(1, 0), 'angle.plot');
  assert.equal(figure.fn, 'plot'); assert.deepEqual(figure.args[1].series, [{ label: 'Angle', kind: 'scatter', points: [] }]);
  assert.deepEqual([figure.args[1].x, figure.args[1].y, figure.args[1].w, figure.args[1].h], data.plot.box);
  assert.equal(run(1, 0).some(o => o.fn === 'diagram'), false);
});

test('every peak and trough of both curves is exactly the start angle, at every length, and each curve has many points', () => {
  for (const length of [0.5, 1, 2]) for (const id of ['curve.A', 'curve.B']) {
    const points = named(run(length, 0), id).args[1], ys = points.map(p => p[1]);
    assert.equal(Math.min(...ys), Math.round(yOf(20) * 100) / 100); assert.equal(Math.max(...ys), Math.round(yOf(-20) * 100) / 100);
    assert.ok(points.length >= 161 && points.length <= 2000); assert.equal(points[0][0], A.left); assert.equal(points.at(-1)[0], A.right);
  }
});

test('the time marker is one line and one dot per curve, at the current time across the plot area, on the curves', () => {
  const objects = run(2, 4), x = Math.round((A.left + 4 / 8 * (A.right - A.left)) * 100) / 100;
  assert.equal(named(objects, 'now').args[1], x); assert.equal(named(objects, 'now').args[2], A.top + 2);
  for (const [dot, curve] of [['dot.A', 'curve.A'], ['dot.B', 'curve.B']]) {
    const [, cx, cy] = named(objects, dot).args, line = named(objects, curve).args[1];
    assert.equal(cx, x);
    const k = line.findIndex(p => p[0] >= cx), [x0, y0] = line[k - 1] ?? line[k], [x1, y1] = line[k], onLine = x1 === x0 ? y1 : y0 + (y1 - y0) * (cx - x0) / (x1 - x0);
    assert.ok(Math.abs(onLine - cy) < 0.05, `${dot} ${cy} against ${onLine}`);
  }
});

test('a plot box that covers the reset cell or leaves the panel is refused when the program is built', () => {
  assert.throws(() => build({ ...data, plot: { ...data.plot, box: [377, 4, 259, 196] } }), error => error.code === 'panel_box');
  assert.throws(() => build({ ...data, plot: { ...data.plot, box: [300, 40, 259, 196] } }), error => error.code === 'panel_box');
});

test('a note that does not fit its box is refused when the program is built', () => {
  assert.throws(() => build({ ...data, notes: { ...data.notes, same: 'B matches A: same mass, same length, same timing.' } }), error => error.code === 'text_too_wide');
});

test('the real program in the frozen SDK-8 sandbox gives a frame the host accepts at every setting and time: parsed, no overlaps, within the object budget', async () => {
  const { parseFrame, CONTRACT_LIMITS } = await import('../explain-program/contract.js'), { frameOverlaps, layoutProblems } = await import('../explain-program/frame-overlap.js'), { loadEngine, runProgram } = await import('../explain-program/runtime.js');
  const engine = await loadEngine(), program = source({ geometry: { pendulum: data } });
  for (const mass of [0.5, 1, 3]) for (const length of [0.5, 1, 2]) for (const time of [0, 3, 6, 8]) {
    const out = runProgram(engine, { source: program, request: { inputs: { mass, length }, time, seed: 1, state: null }, sdkVersion: 'sdk-8' });
    assert.equal(out.ok, true, out.detail);
    assert.equal(parseFrame(out.value.frame).ok, true, `${mass} kg ${length} m t=${time}`);
    assert.deepEqual(frameOverlaps(out.value.frame), [], `${mass} kg ${length} m t=${time}`); assert.deepEqual(layoutProblems(out.value.frame), []);
    assert.ok(out.value.frame.objects.length < CONTRACT_LIMITS.objects);
  }
});
