// kinds-fit R1: the entry point takes { box, sizes, parts } and returns { width, height, element, min, geometry }; coordinate-plot and token-links are fitted, every other kind is drawn as always.
// The old callers' output is pinned by svg-snapshots.test.mjs (svg-snapshots.json is untouched by this lane); here: the new inputs and outputs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutFlow } from './flow.js';
import { lintGeometry } from './geometry-lint.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const gallery = JSON.parse(readFileSync(new URL('./kind-gallery.json', import.meta.url), 'utf8'));
const neutral = kind => gallery.find(spec => spec.diagram.kind === kind);
const BOXES = [[632, 312], [312, 312], [632, 152], [312, 392], [312, 232]];
const SIZES = [14, 12, 16];
const all = size => ({ title: size, heading: size, body: size, small: size });
const markup = rendered => renderToStaticMarkup(rendered.element);
const fontSizes = svg => [...new Set([...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1])))];

// The two worked examples of the spec (sections 6.1 and 6.2), rebuilt from their description: the pendulum card itself lives in the /interactive repo.
const pendulum = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Pendulum angle over time', x: { label: 'Time', unit: 's', min: 0, max: 8 }, y: { label: 'Angle', unit: '°', min: -25, max: 25 },
  series: [{ kind: 'line', label: 'Small swing', points: [{ x: 0, y: 10 }, { x: 2, y: 0 }, { x: 4, y: -10 }, { x: 6, y: 0 }, { x: 8, y: 10 }] },
    { kind: 'line', label: 'Large swing', points: [{ x: 0, y: 20 }, { x: 2, y: 0 }, { x: 4, y: -20 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }] } };
const attention = { version: 1, diagram: { kind: 'token-links', title: 'How sat attends to the sentence', source: ['The', 'cat', 'sat', 'on', 'the', 'mat'], target: ['The', 'cat', 'sat', 'on', 'the', 'mat'],
  queries: [{ index: 2, weights: [0.05, 0.4, 0.3, 0.1, 0.05, 0.1] }] } };

// Every number of a geometry that is a position, checked against the picture.
function insidePicture(geometry, { width, height }, where) {
  const check = (x, y, w = 0, hgt = 0) => {
    assert.ok(x >= -0.5 && y >= -0.5 && x + w <= width + 0.5 && y + hgt <= height + 0.5, `${where}: (${x}, ${y}, ${w}, ${hgt}) is outside ${width} x ${height}`);
  };
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (typeof node.x === 'number' && typeof node.y === 'number') check(node.x, node.y, node.width ?? 0, node.height ?? 0);
    if (typeof node.left === 'number') check(node.left, node.top, node.right - node.left, node.bottom - node.top);
    for (const key of ['from', 'to']) if (Array.isArray(node[key]) && typeof node[key][0] === 'number') check(node[key][0], node[key][1]);
    if (Array.isArray(node.points)) node.points.forEach(([x, y]) => check(x, y));
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(geometry);
}

for (const kind of ['coordinate-plot', 'token-links']) {
  test(`${kind}: the neutral example in every box at sizes 14, 12 and 16 equals the box when the box is at least min, else min; nothing text is larger than asked; geometry lies inside the picture`, () => {
    const spec = neutral(kind);
    for (const [boxWidth, boxHeight] of BOXES) for (const size of SIZES) {
      const where = `${kind} ${boxWidth}x${boxHeight} at ${size}`;
      const rendered = renderTutorDiagram(spec, boxWidth, { box: { width: boxWidth, height: boxHeight }, sizes: all(size), parts: { title: false } });
      const { min } = rendered;
      assert.ok(Number.isFinite(min.width) && Number.isFinite(min.height) && min.width > 0 && min.height > 0, `${where}: min`);
      // The width drawn is the box's, or the kind's own minimum when that is wider; the height is the box's, or the least height at that width.
      assert.ok(Math.abs(rendered.width - Math.max(boxWidth, min.width)) < 0.5, `${where}: width ${rendered.width} vs box ${boxWidth} and min ${min.width}`);
      assert.ok(Math.abs(rendered.height - Math.max(boxHeight, min.height)) < 1, `${where}: height ${rendered.height} vs box ${boxHeight} and min ${min.height}`);
      assert.ok(Math.max(...fontSizes(markup(rendered))) <= size, `${where}: a text is larger than ${size}`);
      assert.ok(rendered.geometry && typeof rendered.geometry === 'object', `${where}: geometry`);
      insidePicture(rendered.geometry, rendered, where);
    }
  });

  test(`${kind}: a box smaller than min is drawn at min, and min does not move with the box`, () => {
    const spec = neutral(kind);
    const small = renderTutorDiagram(spec, 20, { box: { width: 20, height: 20 }, sizes: all(14), parts: { title: false } });
    assert.ok(Math.abs(small.width - small.min.width) < 0.5 && Math.abs(small.height - small.min.height) < 1, `${kind}: drawn ${small.width}x${small.height}, min ${JSON.stringify(small.min)}`);
    // calling again at min.width gives the narrowest case: same width, and its own min height equals the picture's
    const again = renderTutorDiagram(spec, small.min.width, { box: { width: small.min.width, height: 1 }, sizes: all(14), parts: { title: false } });
    assert.equal(again.width, small.width);
    assert.deepEqual(again.min, small.min);
  });

  test(`${kind}: with no options (and with an empty options object) the picture is the one drawn today, min and geometry are still returned`, () => {
    const spec = neutral(kind);
    for (const width of [320, 408, 720]) {
      const plain = renderTutorDiagram(spec, width), empty = renderTutorDiagram(spec, width, {});
      assert.equal(markup(empty), markup(plain), `${kind} at ${width}`);
      assert.equal(empty.width, plain.width);
      assert.ok(plain.min.width > 0 && plain.min.height > 0 && plain.geometry);
    }
  });
}

test('spec 6.1: the pendulum plot in a 312 x 312 box, every text 14 px, left margin sized to its tick numbers, plot area from the height that is left, geometry returned', () => {
  const rendered = renderTutorDiagram(pendulum, 312, { box: { width: 312, height: 312 }, sizes: all(14), parts: { title: false } });
  assert.equal(rendered.width, 312);
  assert.equal(rendered.height, 312);
  assert.deepEqual(fontSizes(markup(rendered)), [14]);
  const { plotArea, x, y } = rendered.geometry;
  assert.ok(plotArea.left < 104, `the left margin is sized to the widest tick number and the axis title (${plotArea.left}), not the fixed 104`);
  assert.ok(plotArea.bottom - plotArea.top > 120 && plotArea.bottom - plotArea.top < 240, `plot area height ${plotArea.bottom - plotArea.top}`);
  assert.deepEqual([x.min, x.max, y.min, y.max], [0, 8, -25, 25]);
  assert.ok(rendered.min.height <= 312 && rendered.min.width <= 312, `min ${JSON.stringify(rendered.min)}`);
  const today = renderTutorDiagram(pendulum, 408);
  assert.equal(today.width, 408);
});

test('spec 6.2: six tokens in a 632 x 152 box at 14 px: the six tokens need more height, so the picture is drawn at min; every text 14 px; each token box and link end point is returned', () => {
  const rendered = renderTutorDiagram(attention, 632, { box: { width: 632, height: 152 }, sizes: all(14), parts: { title: false, caption: false } });
  assert.equal(rendered.width, 632);
  assert.ok(rendered.height > 152 && rendered.height === rendered.min.height, `drawn ${rendered.height}, min ${rendered.min.height}`);
  assert.deepEqual(fontSizes(markup(rendered)), [14]);
  const [panel] = rendered.geometry.panels;
  assert.equal(panel.sources.length, 6);
  assert.equal(panel.targets.length, 6);
  assert.equal(panel.links.length, 6);
  assert.deepEqual(panel.links.map(link => link.weight), [0.05, 0.4, 0.3, 0.1, 0.05, 0.1]);
  insidePicture(rendered.geometry, rendered, 'spec 6.2');
  // in a taller box the two token rows spread: the rest of the height goes to the space between the rows
  const tall = renderTutorDiagram(attention, 632, { box: { width: 632, height: 400 }, sizes: all(14), parts: { title: false, caption: false } });
  assert.equal(tall.height, 400);
  assert.ok(tall.geometry.panels[0].targets[0].y - tall.geometry.panels[0].sources[0].y > panel.targets[0].y - panel.sources[0].y);
});

test('parts: title false takes no room; legend none, always and auto on a two-series plot; always draws a pill for one series too', () => {
  const withTitle = renderTutorDiagram(pendulum, 408), without = renderTutorDiagram(pendulum, 408, { parts: { title: false } });
  assert.equal(withTitle.height - without.height, 39, 'a one-line title block is 22 + 17 px');
  const names = svg => svg.includes('data-tutor-plot-curve-label');
  const pills = svg => svg.includes('data-tutor-plot-legend');
  const auto = markup(renderTutorDiagram(pendulum, 408)), none = markup(renderTutorDiagram(pendulum, 408, { parts: { legend: 'none' } })), always = markup(renderTutorDiagram(pendulum, 408, { parts: { legend: 'always' } }));
  assert.ok(names(auto) !== pills(auto), 'auto draws names or pills, as today');
  assert.ok(!names(none) && !pills(none), 'none draws neither');
  assert.ok(pills(always) && !names(always), 'always draws pills and never names');
  const one = { version: 1, diagram: { ...pendulum.diagram, series: [pendulum.diagram.series[0]] } };
  assert.ok(!pills(markup(renderTutorDiagram(one, 408))), 'auto: one series has no legend');
  assert.ok(pills(markup(renderTutorDiagram(one, 408, { parts: { legend: 'always' } }))), 'always: a pill for one series');
});

test('a kind that is not fitted ignores box and sizes, returns min equal to its drawn size and geometry null (flow returns its geometry object)', () => {
  const bars = neutral('bar-chart');
  const plain = renderTutorDiagram(bars, 408), asked = renderTutorDiagram(bars, 408, { box: { width: 200, height: 100 }, sizes: { body: 30, heading: 30 } });
  assert.equal(markup(asked), markup(plain));
  assert.deepEqual(plain.min, { width: plain.width, height: plain.height });
  assert.equal(plain.geometry, null);
  for (const kind of ['tensor', 'heatmap', 'layers']) assert.equal(renderTutorDiagram(neutral(kind), 408).geometry, null, kind);
  const flow = neutral('flow'), rendered = renderTutorDiagram(flow, 408);
  assert.ok(rendered.geometry && Array.isArray(rendered.geometry.nodes) && Array.isArray(rendered.geometry.edges));
  // the title block is counted: each node is lower than in the layout's own coordinates by the title height
  const own = layoutFlow(flow.diagram, rendered.width).geometry;
  const titleHeight = rendered.height - (own.height);
  assert.ok(titleHeight > 0);
  rendered.geometry.nodes.forEach((node, index) => assert.ok(Math.abs(node.y - (own.nodes[index].y + titleHeight)) < 0.5));
  assert.deepEqual(lintGeometry(own), lintGeometry(own), 'the flow layout and its lint are unchanged');
});

test('parts: caption false leaves the caption out and takes no room', () => {
  const spec = { version: 1, diagram: { ...pendulum.diagram, caption: 'The same swing, two angles' } };
  const withCaption = renderTutorDiagram(spec, 408), without = renderTutorDiagram(spec, 408, { parts: { caption: false } });
  assert.ok(withCaption.height > without.height);
  assert.ok(!/>The same swing/.test(markup(without)) && />The same swing/.test(markup(withCaption)));
});
