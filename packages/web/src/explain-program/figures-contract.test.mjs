import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGURE_BAND, FIGURE_KINDS, FIGURE_LIMITS, OBJECT_KINDS, parseFrame, parseGuestResult } from './contract.js';
import { FIGURES_CAPABILITY, FIGURES_SDK_VERSION } from './stamps.js';
import { normalizeFrame } from './frame.js';
import { getSceneState } from '../animation-scene.js';

// Hand-authored data: the semantic figure kinds (axis, plot, diagram) of the frame contract.
const frame = objects => ({ width: 640, height: 420, objects, readouts: [] });
const axis = (extra = {}) => ({ kind: 'axis', id: 'ax', x: 80, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'Time', unit: 's', ...extra });
const plot = (extra = {}) => ({
  kind: 'plot', id: 'pl', x: 40, y: 20, w: 400, h: 260,
  axes: { x: { label: 'Time', min: 0, max: 2, unit: 's' }, y: { label: 'Height', min: 0, max: 5, unit: 'm' } },
  series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }] }], ...extra,
});
const spec = { version: 1, diagram: { kind: 'flow', title: 'Cache lookup', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
const diagram = (extra = {}) => ({ kind: 'diagram', id: 'dg', x: 20, y: 20, w: 400, spec, ...extra });
const ok = object => parseFrame(frame([object]));
const issue = object => { const result = ok(object); assert.equal(result.ok, false, 'expected a refusal'); assert.equal(result.error.code, 'invalid_output'); return result.issue; };

test('the three figure kinds are listed and every older frame still parses', () => {
  assert.deepEqual(FIGURE_KINDS, ['axis', 'plot', 'diagram']);
  for (const kind of FIGURE_KINDS) assert.ok(OBJECT_KINDS.includes(kind));
  assert.equal(parseFrame(frame([{ kind: 'box', id: 'b', x: 1, y: 1, w: 10, h: 10 }, { kind: 'polyline', id: 'p', points: [[0, 0], [5, 5]] }])).ok, true);
});

test('a valid axis, plot and diagram parse, with the style defaults', () => {
  for (const object of [axis(), axis({ orientation: 'y', x: 90, y: 340, length: 280, ticks: [0, 5, 10] }), plot(), diagram()]) {
    const result = ok(object);
    assert.equal(result.ok, true, result.issue);
    assert.equal(result.value.objects[0].role, 'neutral');
  }
  assert.equal(ok(plot({ series: [{ label: 'A', kind: 'scatter', points: [{ x: 1, y: 1 }] }, { label: 'B', kind: 'step', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })).ok, true);
});

test('axis: strict keys, min below max, ticks inside, bounds with its tick labels and title', () => {
  assert.match(issue(axis({ min: 5, max: 5 })), /min (must be )?below max/);
  assert.match(issue(axis({ ticks: [0, 11] })), /tick must lie between/);
  assert.match(issue(axis({ ticks: [] })), /ticks/);
  assert.match(issue(axis({ orientation: 'z' })), /orientation/);
  assert.match(issue(axis({ label: '' })), /label/);
  assert.match(issue(axis({ href: 'https://example.com' })), /unrecognized|href/i);
  assert.match(issue(axis({ y: 420 - FIGURE_BAND.x + 1 })), /stay inside/, 'no room below the line for ticks and title');
  assert.equal(ok(axis({ y: 420 - FIGURE_BAND.x })).ok, true);
  assert.match(issue(axis({ x: 640 - 399 })), /stay inside/, 'runs past the right edge');
  assert.match(issue(axis({ orientation: 'y', x: FIGURE_BAND.y - 1, y: 300, length: 200 })), /stay inside/, 'no room left of a y axis');
  assert.match(issue(axis({ orientation: 'y', x: 80, y: 300, length: 300 - FIGURE_BAND.titleRoom + 1 })), /stay inside/, 'its top end leaves no room for the title');
  assert.equal(ok(axis({ orientation: 'y', x: 80, y: 300, length: 300 - FIGURE_BAND.titleRoom })).ok, true);
});

test('plot: rectangle inside the frame, 1 to 3 series, 24 points, points inside the axes', () => {
  assert.match(issue(plot({ w: 199 })), /at least 200 x 160/);
  assert.match(issue(plot({ x: 300 })), /inside the frame/);
  assert.match(issue(plot({ series: [] })), /series/);
  const series = n => Array.from({ length: n }, (_, i) => ({ label: `S${i}`, kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
  assert.equal(ok(plot({ series: series(FIGURE_LIMITS.series) })).ok, true);
  assert.match(issue(plot({ series: series(FIGURE_LIMITS.series + 1) })), /series/);
  const points = n => [{ label: 'P', kind: 'line', points: Array.from({ length: n }, (_, i) => ({ x: i / 20, y: 1 })) }];
  assert.equal(ok(plot({ series: points(FIGURE_LIMITS.points) })).ok, true);
  assert.match(issue(plot({ series: points(FIGURE_LIMITS.points + 1) })), /points/);
  assert.match(issue(plot({ series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }, { x: 3, y: 1 }] }] })), /point outside the plot axes/);
  assert.match(issue(plot({ series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: -1 }, { x: 1, y: 1 }] }] })), /point outside the plot axes/);
  assert.match(issue(plot({ series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }] }] })), /at least two points/);
  assert.match(issue(plot({ axes: { x: { label: 'T', min: 2, max: 2 }, y: { label: 'H', min: 0, max: 1 } } })), /min (must be )?below max/);
  assert.match(issue(plot({ series: [{ label: 'Ball', kind: 'curve', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })), /kind/);
});

test('diagram: the spec is validated at parse time, bounded at 16 KB, and the left edge and width stay in the frame', () => {
  assert.match(issue(diagram({ spec: { version: 1, diagram: { kind: 'flow', title: 'T', nodes: [], edges: [] } } })), /diagram spec is not valid/);
  assert.match(issue(diagram({ spec: { version: 1, diagram: { kind: 'nonsense' } } })), /diagram spec is not valid/);
  assert.match(issue(diagram({ spec: 'a string' })), /diagram JSON object/);
  assert.match(issue(diagram({ spec: [spec] })), /diagram JSON object/);
  const heavy = { ...spec, diagram: { ...spec.diagram, caption: 'x'.repeat(FIGURE_LIMITS.specBytes) } };
  assert.match(issue(diagram({ spec: heavy })), /at most 16384 bytes/);
  assert.match(issue(diagram({ x: 300 })), /fit its width/);
  assert.match(issue(diagram({ y: 420 })), /start inside the frame/);
  assert.match(issue(diagram({ extra: 1 })), /unrecognized|extra/i);
  assert.equal(ok(diagram({ y: 419 })).ok, true, 'a diagram low in the frame parses: the renderer fits it into the room that is left');
});

test('a frame with a figure needs the figures capability and sdk-8, the rest of the contract is unchanged', () => {
  const result = { frame: frame([axis()]), quantities: {} };
  const manifest = capabilities => ({ capabilities });
  assert.equal(parseGuestResult(result, manifest(['time_playback', FIGURES_CAPABILITY]), FIGURES_SDK_VERSION).ok, true);
  for (const [m, v] of [[manifest(['time_playback']), FIGURES_SDK_VERSION], [manifest(['time_playback', FIGURES_CAPABILITY]), 'sdk-7'], [null, FIGURES_SDK_VERSION]]) {
    const out = parseGuestResult(result, m, v);
    assert.equal(out.ok, false);
    assert.match(out.issue, /require the figures capability and sdk-8/);
  }
  assert.equal(parseGuestResult({ frame: frame([{ kind: 'box', id: 'b', x: 1, y: 1, w: 10, h: 10 }]), quantities: {} }, manifest(['time_playback']), 'sdk-7').ok, true);
});

test('normalizeFrame threads each figure kind into a scene object with its box and its data, and keeps the other objects unchanged', () => {
  const result = normalizeFrame(frame([axis(), axis({ id: 'ay', orientation: 'y', x: 90, y: 340, length: 280 }), plot({ id: 'pl' }), diagram({ id: 'dg', y: 100 }), { kind: 'box', id: 'b', x: 1, y: 1, w: 10, h: 10 }]));
  assert.equal(result.ok, true, result.issue);
  const byId = Object.fromEntries(result.state.objects.map(object => [object.id, object]));
  assert.deepEqual([byId.ax.type, byId.ay.type, byId.pl.type, byId.dg.type], ['axis', 'axis', 'plot', 'figure']);
  // an x axis: the line at y with 4 above and the band below it; a y axis grows up from its start, band to its left, title room above
  assert.deepEqual([byId.ax.x, byId.ax.y, byId.ax.w, byId.ax.h], [80, 296, 400, FIGURE_BAND.x + 4]);
  assert.deepEqual([byId.ay.x, byId.ay.y, byId.ay.w, byId.ay.h], [90 - FIGURE_BAND.y, 340 - 280 - FIGURE_BAND.titleRoom, FIGURE_BAND.y + 4, 280 + FIGURE_BAND.titleRoom + 8]);
  assert.deepEqual([byId.ax.axisSpec.x0, byId.ax.axisSpec.y0, byId.ax.axisSpec.length, byId.ax.axisSpec.label, byId.ax.axisSpec.unit], [80, 300, 400, 'Time', 's']);
  assert.deepEqual([byId.pl.x, byId.pl.y, byId.pl.w, byId.pl.h], [40, 20, 400, 260]);
  assert.equal(byId.pl.plotSpec.series[0].points.length, 3);
  assert.deepEqual([byId.dg.x, byId.dg.y, byId.dg.w, byId.dg.h], [20, 100, 400, 320], 'a diagram owns the width and the height the frame leaves below it');
  assert.equal(byId.dg.diagramSpec.diagram.kind, 'flow');
  assert.equal('axisSpec' in byId.b || 'plotSpec' in byId.b || 'diagramSpec' in byId.b, false);
  assert.equal(getSceneState(result.scene, 0).objects.length, 5);
});
