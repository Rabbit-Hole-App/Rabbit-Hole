import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameOverlaps, traceObjects, traceFrame, layoutProblems, figureTextBoxes } from './frame-overlap.js';
import { programSdkSource } from './sdk.js';

const text = (id, x, y, s = 'label') => ({ kind: 'text', id, x, y, text: s });
const circle = (id, x, y, w = 24) => ({ kind: 'circle', id, x, y, w });
const pairs = frame => frameOverlaps(frame).map(o => [o.a, o.b, o.kind]);

test('a text over a circle, a box or an arrowhead, and an arrowhead over a circle are overlaps; any intersection counts', () => {
  assert.deepEqual(pairs({ objects: [circle('ball', 100, 100), text('t', 95, 100, 'v = 0')] }), [['t', 'ball', 'text-circle']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'box', id: 'b', x: 80, y: 80, w: 60, h: 30 }, text('t', 90, 95, 'in the box')] }), [['t', 'b', 'text-box']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, text('t', 146, 100, 'v')] }), [['t', 'a', 'text-arrowhead']]);
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, circle('ball', 156, 100)] }), [['a', 'ball', 'arrowhead-circle']]);
  assert.deepEqual(pairs({ objects: [text('t1', 20, 20, 'one label'), text('t2', 25, 22, 'another')] }), [['t1', 't2', 'text-text']]);
});

test('clear objects are not overlaps: a label past the tip, a text beside a ball, a box with its own label, a point-length arrow', () => {
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 100 }, to: { x: 150, y: 100 } }, text('t', 175, 100, 'v')] }), [], 'a label 8 px past the head');
  assert.deepEqual(pairs({ objects: [circle('ball', 100, 100), text('t', 130, 100, 'v = 0')] }), []);
  assert.deepEqual(pairs({ objects: [{ kind: 'box', id: 'b', x: 80, y: 80, w: 60, h: 30, text: 'its own label' }] }), [], 'a box own label is not a separate object');
  assert.deepEqual(pairs({ objects: [{ kind: 'arrow', id: 'a', from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }, circle('ball', 5, 5)] }), []);
  assert.deepEqual(pairs({ objects: [{ kind: 'line', id: 'l', from: { x: 0, y: 100 }, to: { x: 300, y: 100 } }, text('t', 100, 160)] }), [], 'a line well clear of a label');
});

test('traceObjects keeps only the geometry the check needs and is bounded', () => {
  const objects = [circle('c', 1, 2), text('t', 3, 4, 'hi'), { kind: 'polyline', id: 'p', points: [[0, 0], [1, 1]] }, ...Array.from({ length: 100 }, (_, i) => circle('c' + i, i, i))];
  const out = traceObjects(objects);
  assert.equal(out.length, 80); assert.ok(!out.some(o => o.kind === 'polyline'));
  assert.deepEqual(out[1], { id: 't', kind: 'text', x: 3, y: 4, text: 'hi', align: undefined });
});

// ---- layout rules (owner 2026-11-12): label clearance to lines and arrows, figure text, text outside the frame.
const line = (id, x1, y1, x2, y2, extra = {}) => ({ kind: 'line', id, from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, ...extra });
const problems = frame => layoutProblems(frame).map(o => [o.a, o.b, o.kind]);

test('a label closer than 8 px to a line or an arrow shaft is a problem with both ids and a hint; 8 px clear, a hidden line and a short mark are not', () => {
  const near = layoutProblems({ objects: [line('rule', 0, 100, 300, 100), text('t', 100, 108, 'label')] });
  assert.deepEqual(near.map(o => [o.a, o.b, o.kind]), [['t', 'rule', 'text-line']]);
  assert.match(near[0].hint, /"t".*"rule"/); assert.ok(near[0].gap < 8);
  assert.deepEqual(problems({ objects: [line('rule', 0, 100, 300, 100), text('t', 100, 120, 'label')] }), [], '20 px clear');
  assert.deepEqual(problems({ objects: [{ kind: 'arrow', id: 'a', from: { x: 50, y: 200 }, to: { x: 50, y: 140 } }, text('t', 50, 150, 'v')] }), [['t', 'a', 'text-arrow']]);
  assert.deepEqual(problems({ objects: [line('rule', 0, 100, 300, 100, { opacity: 0 }), text('t', 100, 100, 'label')] }), [], 'a line drawn at opacity 0 is not there');
  assert.deepEqual(problems({ objects: [line('tick', 54, 200, 66, 200), text('t', 40, 200, '0')] }), [], 'a tick mark beside its label: only touching counts');
  assert.deepEqual(problems({ objects: [line('tick', 54, 200, 66, 200), text('t', 60, 200, '0')] }), [['t', 'tick', 'text-line']]);
});

test('the sdk.vector, sdk.gate and sdk.groundMark labels are clear by construction', () => {
  const sdk = new Function(`${programSdkSource('sdk-7')}\nreturn sdk;`)();
  const objects = [...sdk.vector('up', { x: 100, y: 300 }, { value: 5, direction: 'up' }, { scale: 20, label: 'v' }), ...sdk.vector('down', { x: 200, y: 100 }, { value: 5, direction: 'down' }, { scale: 20, label: 'a' }),
    ...sdk.vector('right', { x: 250, y: 300 }, { value: 5, direction: 'right' }, { scale: 20, label: 'v = 2 m/s' }), ...sdk.gate('g', 400, 200, { open: true, label: 'gate' }), ...sdk.gate('h', 500, 200, { label: 'gate' }), ...sdk.groundMark('floor', 300, 350, 80, 'launch mark')];
  assert.deepEqual(problems({ objects }), []);
});

test('figureTextBoxes places an axis title and tick labels where FrameFigures draws them, and a plot its titles and legend', () => {
  const xAxis = { kind: 'axis', id: 'x', x: 60, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'time', unit: 's' };
  const boxes = figureTextBoxes(xAxis);
  assert.deepEqual(boxes.map(b => b.id), ['x.tick0', 'x.tick10', 'x.title']);
  const title = boxes[2].box; assert.equal(title.xMax, 460); assert.ok(title.yMin > 300 + 5 + 4, 'below the tick labels');
  assert.deepEqual(figureTextBoxes({ ...xAxis, ticks: [0, 5, 10] }).map(b => b.id), ['x.tick0', 'x.tick5', 'x.tick10', 'x.title']);
  const yAxis = figureTextBoxes({ kind: 'axis', id: 'y', x: 100, y: 300, length: 200, orientation: 'y', min: 0, max: 4, label: 'height', unit: 'm' });
  assert.equal(yAxis.at(-1).box.xMin, 100 - 60 + 4, 'a y title starts at the left of its band');
  const plot = figureTextBoxes({ kind: 'plot', id: 'p', x: 0, y: 0, w: 400, h: 240, axes: { x: { label: 'time', min: 0, max: 5, unit: 's' }, y: { label: 'speed', min: 0, max: 20 } }, series: [{ label: 'a' }, { label: 'b' }] });
  assert.deepEqual(plot.map(b => b.id), ['p.xtick0', 'p.xtick5', 'p.ytick0', 'p.ytick20', 'p.xtitle', 'p.ytitle', 'p.legend0', 'p.legend1']);
});

test('a figure title over a label, and a title that leaves the frame, are problems; the frame size is optional', () => {
  const axis = { kind: 'axis', id: 'x', x: 60, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'time', unit: 's' };
  const over = layoutProblems({ objects: [axis, text('note', 380, 337, 'a note')] });
  assert.deepEqual(over.map(o => [o.a, o.b, o.kind]), [['x.title', 'note', 'text-text']]);
  assert.match(over[0].hint, /"note".*"x"/);
  const longTitle = { kind: 'axis', id: 'h', x: 100, y: 300, length: 200, orientation: 'y', min: 0, max: 4, label: 'a very long vertical axis title of forty chars', unit: 'm' };
  assert.deepEqual(problems({ objects: [longTitle] }), [], 'no frame size, no frame rule');
  assert.deepEqual(layoutProblems({ objects: [longTitle], width: 320, height: 400 }).map(o => [o.a, o.b, o.kind]), [['h.title', 'frame', 'text-frame']]);
  // A frame text that leaves the frame is moved back in by the renderer (frame-look.js clampToFrame), never flagged: only a figure's own title or tick label, which the renderer cannot move, is.
  assert.deepEqual(layoutProblems({ objects: [text('t', 300, 50, 'runs off the right edge')], width: 320, height: 400 }), []);
  assert.deepEqual(problems({ objects: [text('t', 10, 20, 'inside')], width: 320, height: 400 }), []);
});

test('traceObjects carries lines and figures, and layout problems reach frameOverlaps (the path the capture checks read)', () => {
  const objects = traceObjects([line('l', 0, 100, 300, 100), { kind: 'axis', id: 'x', x: 1, y: 2, length: 3, orientation: 'x', min: 0, max: 1, label: 'x', role: 'neutral', opacity: 1 }, text('t', 100, 104, 'label')]);
  assert.deepEqual(objects.map(o => o.kind), ['line', 'axis', 'text']);
  assert.deepEqual(frameOverlaps({ objects }).filter(o => o.kind === 'text-line').map(o => [o.a, o.b]), [['t', 'l']]);
  assert.deepEqual(traceFrame({ width: 640, height: 420, objects: [] }), { width: 640, height: 420 });
});

// The recorded frames: the sealed run-13 and run-15 programs (docs/features/interact/evidence/2026-11-12-clone-runs) run in the engine at the states below (testdata/layout-run-frames.json).
// The reviewer's label findings on those runs were label collisions with a line, an arrow and a column header; each is a problem naming the same two objects.
const recorded = JSON.parse(readFileSync(new URL('./testdata/layout-run-frames.json', import.meta.url)));
const frameOf = (run, speed, time) => recorded.find(f => f.run === run && f.time === time && (f.inputs.launchSpeed ?? 3) === speed);
const found = frame => frameOverlaps(frame, 20).map(o => [o.a, o.b, o.kind]);

test('run 13 at 5 m/s at its top: the velocity label touches the Tossed ball header', () => {
  assert.deepEqual(found(frameOf('run13', 5, 0.306)).filter(([, , kind]) => kind === 'text-text'), [['nameT', 'vTL', 'text-text']]);
});

test('run 15: the velocity label sits on the dashed top line at 5 m/s, touches the header at its top, and the held ball a label is 3.8 px from the gate leg', () => {
  assert.ok(found(frameOf('run15', 5, 0.102)).some(([a, b]) => a === 'tossedVL' && b === 'topLine'), 'v label on the top line');
  assert.deepEqual(found(frameOf('run15', 5, 0.306)).filter(([, , kind]) => kind === 'text-text'), [['tossedLabel', 'tossedVL', 'text-text']]);
  assert.ok(found(frameOf('run15', 3, 0)).some(([a, b]) => a === 'heldAL' && b === 'gateB'), 'held a label by the gate leg');
});

test('a label on a body is a text-body problem with the ids, the reach into the radius and a hint; beside it, over a small mark, or over a hidden body is not', () => {
  const ball = { kind: 'circle', id: 'ball.toss', x: 100, y: 100, w: 30 };
  const on = layoutProblems({ objects: [ball, { kind: 'text', id: 'motion', x: 94, y: 100, text: 'Motion' }] });
  assert.deepEqual(on.map(p => [p.a, p.b, p.kind]), [['motion', 'ball.toss', 'text-body']]);
  assert.ok(on[0].width > 0 && on[0].width <= 15 && /move "motion" off the body "ball.toss"/.test(on[0].hint));
  assert.deepEqual(layoutProblems({ objects: [ball, { kind: 'text', id: 'beside', x: 120, y: 100, text: 'Motion' }] }).filter(p => p.kind === 'text-body'), [], 'a label starting at the body edge clears its radius');
  assert.deepEqual(layoutProblems({ objects: [{ ...ball, w: 8 }, { kind: 'text', id: 'motion', x: 94, y: 100, text: 'Motion' }] }), [], 'a mark under 12 px is not a body');
  assert.deepEqual(layoutProblems({ objects: [{ ...ball, opacity: 0 }, { kind: 'text', id: 'motion', x: 94, y: 100, text: 'Motion' }] }), []);
  assert.ok(frameOverlaps({ objects: [ball, { kind: 'text', id: 'motion', x: 94, y: 100, text: 'Motion' }] }).some(p => p.b === 'ball.toss'), 'frameOverlaps reports it once, whichever rule saw it first');
});
