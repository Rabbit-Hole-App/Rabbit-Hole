import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { normalizeFrame } from './explain-program/frame.js';
import { TEACHING, TEACHING_SERIES } from './tutor-diagrams/teaching-theme.js';

// The semantic figures (axis, plot, diagram) drawn by the real Frame in interact mode, and nothing at all in the /animation frame. Hand-authored frames; the markup of each kind is
// pinned by hash (the renderer is deterministic: no clock, no randomness), so a change to how a figure is drawn is a visible, deliberate edit of this file.
function frameBundle() {
  const dir = mkdtempSync(join(tmpdir(), 'figures-frame-'));
  const outfile = join(dir, 'frame.cjs');
  try {
    buildSync({
      stdin: { contents: "export { Frame } from './AnimatedScene.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
      bundle: true, outfile, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
    });
    return createRequire(import.meta.url)(outfile);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const bundle = frameBundle();
const draw = (objects, interact = true, size = { width: 640, height: 420 }) => {
  const result = normalizeFrame({ ...size, objects });
  assert.equal(result.ok, true, result.issue);
  return bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, { scene: result.scene, state: result.state, interact, fixedView: true, pop: { duration: 0 } }));
};
const hash = markup => createHash('sha256').update(markup).digest('hex');

const xAxis = { kind: 'axis', id: 'ax', x: 80, y: 300, length: 400, orientation: 'x', min: 0, max: 10, label: 'Time', unit: 's' };
const yAxis = { kind: 'axis', id: 'ay', x: 80, y: 300, length: 240, orientation: 'y', min: 0, max: 5, ticks: [0, 2.5, 5], label: 'Height', unit: 'm' };
const plot = {
  kind: 'plot', id: 'pl', x: 40, y: 20, w: 420, h: 280,
  axes: { x: { label: 'Time', min: 0, max: 2, unit: 's' }, y: { label: 'Height', min: 0, max: 5, unit: 'm' } },
  series: [{ label: 'Ball', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }] }],
};
const spec = { version: 1, diagram: { kind: 'flow', title: 'Cache lookup', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
const diagram = { kind: 'diagram', id: 'dg', x: 20, y: 20, w: 400, spec };
const group = (markup, id) => { const at = markup.indexOf(`data-animation-object="${id}"`); const next = markup.indexOf('data-animation-object=', at + 1); return at < 0 ? '' : markup.slice(at, next < 0 ? undefined : next); };
// x, y, width, height of the diagram's own svg element, whatever order its attributes are in
const box = g => { const tag = g.match(/<svg[^>]*>/)[0]; return ['x', 'y', 'width', 'height'].map(name => Number(tag.match(new RegExp(` ${name}="([0-9.]+)"`))[1])); };
const texts = markup => [...markup.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1]);

test('an x axis is the written connector with an arrowhead, ticks at the written plots tick positions, a 13 px tick label each and a bold title with its unit', () => {
  const g = group(draw([xAxis]), 'ax');
  assert.match(g, /data-frame-figure="axis"/);
  assert.match(g, /data-tutor-arrowhead/, 'the same arrowhead rule as the written card');
  assert.match(g, /<polyline points="80,300 480,300"/, 'the line runs from the start by its length');
  assert.ok(texts(g).includes('0') && texts(g).includes('10'), 'the end ticks are labelled');
  assert.ok(texts(g).includes('Time (s)'));
  assert.match(g, /font-size="13"/, 'tick labels are at the caption size');
  assert.match(g, /font-weight="700"[^>]*><tspan[^>]*>Time \(s\)</, 'the title is bold');
});

test('a y axis grows up from its start, takes the declared ticks, and puts its title above its top end', () => {
  const g = group(draw([yAxis]), 'ay');
  assert.match(g, /<polyline points="80,300 80,60"/);
  for (const tick of ['0', '2.5', '5']) assert.ok(texts(g).includes(tick), `tick ${tick}`);
  assert.ok(texts(g).includes('Height (m)'));
  assert.match(g, /<text x="24" y="42"[^>]*><tspan[^>]*>Height \(m\)</, 'the title sits in the room above the top end, at the left of the band');
});

test('a plot has an area, dashed gridlines, tick labels, titles, and its series in the written plot colours', () => {
  const g = group(draw([plot]), 'pl');
  assert.match(g, /data-frame-plot-area/);
  assert.match(g, /stroke-dasharray/, 'gridlines are the written plots dashed connectors');
  assert.ok(texts(g).includes('Time (s)') && texts(g).includes('Height (m)'));
  assert.match(g, new RegExp(`<polyline[^>]*stroke="${TEACHING_SERIES[0]}"[^>]*data-frame-series="Ball"`));
  assert.doesNotMatch(g, /Ball</, 'one series needs no legend');
  const many = group(draw([{ ...plot, series: [
    plot.series[0],
    { label: 'Drop', kind: 'scatter', points: [{ x: 0.5, y: 1 }, { x: 1.5, y: 2 }] },
    { label: 'Hold', kind: 'step', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }] },
  ] }]), 'pl');
  assert.equal((many.match(/<circle/g) || []).length, 2, 'a scatter series draws one dot per point');
  assert.match(many, new RegExp(`<circle[^>]*fill="${TEACHING_SERIES[1]}"`));
  assert.match(many, new RegExp(`<polyline[^>]*stroke="${TEACHING_SERIES[2]}"`));
  for (const name of ['Ball', 'Drop', 'Hold']) assert.ok(texts(many).includes(name), `legend names ${name}`);
  const step = many.match(new RegExp(`<polyline points="([^"]+)"[^>]*stroke="${TEACHING_SERIES[2]}"`))[1].split(' ');
  assert.equal(step.length, 5, 'a step series of 3 points is 5 vertices: each change is a horizontal run, then a vertical one');
});

test('a plot maps data values into its area: the highest point is at the top of the area and the first is on the left', () => {
  const g = group(draw([plot]), 'pl');
  const area = g.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*data-frame-plot-area/).slice(1).map(Number);
  const points = g.match(/<polyline points="([^"]+)"[^>]*data-frame-series/)[1].split(' ').map(pair => pair.split(',').map(Number));
  assert.equal(points[0][0], area[0], 'x = min is the left edge of the area');
  assert.equal(points[1][1], area[1], 'y = max is the top edge of the area');
  assert.equal(points[2][1], area[1] + area[3], 'y = min is the bottom edge');
  assert.equal(points[2][0], area[0] + area[2], 'x = max is the right edge');
});

test('a diagram is the written diagram drawn at the width the frame gives it, inside its box', () => {
  const markup = draw([diagram]);
  const g = group(markup, 'dg');
  assert.match(g, /data-frame-figure="diagram"/);
  assert.match(g, /data-tutor-diagram="flow"/);
  assert.ok(texts(g).includes('Read cache') && texts(g).includes('Return value'));
  const [x, y, width, height] = box(g);
  assert.deepEqual([x, y], [20, 20]);
  assert.ok(width <= 400 + 1e-9 && y + height <= 420 + 1e-9, 'inside the box the frame gives it');
  // a diagram low in the frame is scaled down, aspect kept, to fit the room below it
  const low = box(group(draw([{ ...diagram, y: 380 }]), 'dg'));
  assert.ok(low[1] + low[3] <= 420 + 1e-9 && low[2] < width, `fitted into 40 px: ${low}`);
});

test('the /animation frame (not interact) draws nothing at all for the figure kinds', () => {
  const standard = draw([xAxis, yAxis, plot, diagram], false);
  assert.doesNotMatch(standard, /data-frame-figure|data-tutor-diagram|data-frame-plot-area|data-tutor-arrowhead/);
  assert.deepEqual(texts(standard), [], 'no tick, title or diagram text');
  assert.doesNotMatch(standard, /<rect[^>]*data-frame/, 'no fallback rectangle either');
});

test('the markup of each figure kind in the composed card is pinned', () => {
  const pins = {
    axisX: hash(draw([xAxis])), axisY: hash(draw([yAxis])), plot: hash(draw([plot])), diagram: hash(draw([diagram])),
  };
  assert.deepEqual(pins, EXPECTED_MARKUP_HASHES, 'update only with a deliberate change to how a figure is drawn');
});
const EXPECTED_MARKUP_HASHES = {
  axisX: 'a560140acaa12466e1f91058e0d27fe305a0b69b54e8c3179d95b4f5b01f3491',
  axisY: '82f48c2487842873aefc04b0df5a842101a1e332028dc432030980c9adaccdec',
  plot: '9d2a6f3f51fce6d606936642767acbc88cdc7ce16f801cce22e8ffcf2a514577',
  diagram: '97c0443ec308667cf6f1cb2952b53cc20095b02dff7461dba427894a792de4c5',
};
