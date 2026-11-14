import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFrame, parseGuestResult } from './contract.js';
import { fitGuestLabels, frameOverlaps, layoutProblems } from './frame-overlap.js';
import { programSdkSource } from './sdk.js';

// The fits of the 14:20 brief (section 3): each is built from the failing message of a named google-low run (the 2026-11-13 bench keeps the problem text, not the authored program, so each input is rebuilt
// from that text). A fit moves or caps and is logged as `fitted:<id>`; it is never a problem. The runtime errors ('lane' is not defined, a declared quantity never emitted) are not fitted.
const sdk = new Function(`${programSdkSource('sdk-8')}\nreturn sdk;`)();
const MANIFEST = { title: 'A figure card', summary: 'A frame.', assumptions: [], description: 'A frame.', inputs: [], duration: 2, readouts: [], capabilities: ['time_playback', 'figures'] };
const parse = (objects, { width = 640, height = 420, version = 'sdk-8' } = {}) => fitGuestLabels(parseGuestResult({ frame: { width, height, objects, readouts: [] }, quantities: {} }, MANIFEST, version), version);
const find = (result, id) => result.value.frame.objects.find(object => object.id === id);

test('g8/g9: an axis (or its tick labels or title) outside the 640 x 420 frame is moved and shortened into it, keeping 52 below / 60 left / 28 above, and drawn', () => {
  // "frame.objects.6: the axis, its tick labels and its title must stay inside the 640 x 420 frame (an x axis keeps 52 below it; a y axis ... keeps 60 to its left and 28 above its top)"
  const result = parse([
    sdk.axis('time', { x: 300, y: 410, length: 500, orientation: 'x', min: 0, max: 6, label: 'Time', unit: 's' }),
    sdk.axis('height', { x: 20, y: 100, length: 380, orientation: 'y', min: 0, max: 2, label: 'Height', unit: 'm' }),
  ]);
  assert.equal(result.ok, true, result.issue);
  const x = find(result, 'time'), y = find(result, 'height');
  assert.ok(x.x >= 0 && x.x + x.length <= 640 && x.y - 4 >= 0 && x.y + 52 <= 420, JSON.stringify(x));
  assert.ok(y.x - 60 >= 0 && y.x + 4 <= 640 && y.y - y.length - 28 >= 0 && y.y + 8 <= 420, JSON.stringify(y));
  assert.equal(x.length, 500, 'moved first; 500 fits a 640 frame, so not shortened');
  assert.ok(y.length <= 420 - 28 - 8, 'a 380 px y axis cannot keep 28 above and 8 below in 420 without being shortened');
  assert.deepEqual(result.fitted, ['fitted:axis']);
  assert.equal(parse([sdk.axis('h', { x: 80, y: 300, length: 200, orientation: 'y', min: 0, max: 5, label: 'Height' })]).fitted, undefined, 'an axis already inside the frame is not a fit');
});

test('f4/f7/f8: a label over a body (text-circle) moves to the nearest free side, 6 px clear, and the overlap check is then silent; a label with no free side is left for the check', () => {
  // "mark.launchL overlaps ball.toss (text-circle, 28 x 14.4 px)"; "vec.v.dropL overlaps ball.drop (text-circle, 0.3 x 15.6 px)"
  const ball = sdk.circle('ball.toss', 200, 300, 28), label = sdk.text('mark.launchL', 190, 305, 'Launch');
  const before = parseGuestResult({ frame: { width: 640, height: 420, objects: [ball, label], readouts: [] }, quantities: {} }, MANIFEST, 'sdk-8');
  assert.ok(frameOverlaps({ objects: before.value.frame.objects }).some(p => p.kind === 'text-circle'), 'the input overlaps as the runs did');
  const result = parse([ball, label]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.fitted, ['fitted:label-off-body']);
  assert.deepEqual(frameOverlaps({ objects: result.value.frame.objects, width: 640, height: 420 }), [], 'no overlap after the fit');
  assert.ok(layoutProblems({ objects: result.value.frame.objects, width: 640, height: 420 }).every(p => p.kind !== 'text-body'));
  const moved = find(result, 'mark.launchL'), body = find(result, 'ball.toss');
  assert.ok(moved.x >= body.x + 14 + 6 || moved.x + 'Launch'.length * 7.2 <= body.x - 14 - 6 || moved.y !== 305, `moved off the body: ${moved.x},${moved.y}`);
  // a thin brim: the 0.3 px overlap of the drop run is fitted too
  const drop = parse([sdk.circle('ball.drop', 200, 300, 28), sdk.text('vec.v.dropL', 211.7, 300, 'v')]);
  assert.deepEqual(drop.fitted, ['fitted:label-off-body']);
  // no free side: a label inside a 60 x 40 lane that holds a 28 px ball, text 90 px wide
  const cramped = parse([sdk.circle('ball.a', 30, 30, 28), sdk.text('long', 14, 34, 'a label wider than the frame allows beside it', {}), sdk.circle('ball.b', 560, 30, 28)], { width: 120, height: 60 });
  assert.equal(cramped.ok, true);
  assert.equal(cramped.fitted, undefined, 'nowhere to go: left as it was');
  assert.ok(frameOverlaps({ objects: cramped.value.frame.objects }).some(p => p.kind === 'text-circle'), 'and the check still reports it');
  // older SDKs and non-bodies are untouched
  assert.equal(parse([ball, label], { version: 'sdk-7' }).fitted, undefined);
  assert.equal(parse([sdk.circle('dot', 200, 300, 8), sdk.text('t', 198, 303, 'x')]).fitted, undefined, 'a mark (under 12 px) is not a body');
});

test('f9: a repeated default id takes -2, -3 on its stem, in order, a whole lane or callout together; a plain repeated id is suffixed too', () => {
  // "frame.objects.3.id: duplicate object id \"panel\""
  const lane = x => sdk.panel({ x, y: 60, w: 180, h: 200, title: 'Toss', state: 'Ready' });
  const result = parse([...lane(20), ...lane(220), ...lane(420)].flat());
  assert.equal(result.ok, true, result.issue);
  assert.deepEqual(result.value.frame.objects.map(o => o.id), ['panel', 'panel.title', 'panel.state', 'panel-2', 'panel-2.title', 'panel-2.state', 'panel-3', 'panel-3.title', 'panel-3.state']);
  assert.deepEqual(result.fitted, ['fitted:duplicate-id']);
  const callouts = parse([...sdk.callout(20, 20, ['v = 1', 'a = 2']), ...sdk.callout(300, 20, ['v = 3'])]);
  assert.deepEqual(callouts.value.frame.objects.map(o => o.id), ['callout.l0', 'callout.l1', 'callout-2.l0']);
  const plain = parse([sdk.circle('b', 50, 50, 20), sdk.circle('b', 90, 50, 20)]);
  assert.deepEqual(plain.value.frame.objects.map(o => o.id), ['b', 'b-2']);
});

test('f3/f6: a line or step series of one point is the current-point dot, of none draws nothing; neither is a problem', () => {
  // "frame.objects.15.series.0.points: a line or step series needs at least two points"
  const axes = { x: { label: 'Time', min: 0, max: 2 }, y: { label: 'Velocity', min: -5, max: 5 } };
  const plot = series => sdk.plot('plot.vt', { x: 340, y: 40, w: 280, h: 220, axes, series });
  const result = parse([plot([{ label: 'now', kind: 'line', points: [{ x: 0, y: 4 }] }, { label: 'v', kind: 'step', points: [] }, { label: 'ok', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }])]);
  assert.equal(result.ok, true, result.issue);
  assert.deepEqual(find(result, 'plot.vt').series.map(s => [s.kind, s.points.length]), [['scatter', 1], ['scatter', 0], ['line', 2]]);
  assert.deepEqual(result.fitted, ['fitted:single-point']);
  assert.equal(parse([plot([{ label: 'a', kind: 'scatter', points: [{ x: 0, y: 1 }] }])]).fitted, undefined, 'a scatter series is as it was');
});

test('g3: axis ticks given as a count become that many evenly spaced ticks; a list is untouched', () => {
  // "frame.objects.3.ticks: Invalid input: expected array, received number"
  const result = parse([{ kind: 'axis', id: 'h', x: 80, y: 300, length: 200, orientation: 'y', min: 0, max: 2, label: 'Height', ticks: 5 }]);
  assert.equal(result.ok, true, result.issue);
  assert.deepEqual(find(result, 'h').ticks, [0, 0.5, 1, 1.5, 2]);
  assert.deepEqual(result.fitted, ['fitted:ticks']);
  assert.deepEqual(find(parse([{ kind: 'axis', id: 'h', x: 80, y: 300, length: 200, orientation: 'y', min: 0, max: 2, label: 'Height', ticks: 40 }]), 'h').ticks.length, 12, 'capped at 12');
  assert.equal(find(parse([sdk.axis('h', { x: 80, y: 300, length: 200, orientation: 'y', min: 0, max: 2, label: 'Height', ticks: [0, 2] })]), 'h').ticks.length, 2);
});

test('the flatten fit and the notes: an array inside objects is flattened and logged, parseFrame carries the notes too', () => {
  const result = parseFrame({ width: 640, height: 420, objects: [sdk.panel({ x: 20, y: 60, w: 180, h: 200, title: 'Toss', state: 'Ready' }), sdk.circle('ball', 50, 50, 20)] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.fitted, ['fitted:flatten']);
  assert.equal(parseFrame({ width: 640, height: 420, objects: [sdk.circle('ball', 50, 50, 20)] }).fitted, undefined, 'nothing fitted: no notes');
  const bad = parseFrame({ width: 640, height: 420, objects: [[{ kind: 'nope', id: 'x' }]] });
  assert.equal(bad.ok, false, 'a bad object inside the array is still refused');
});
