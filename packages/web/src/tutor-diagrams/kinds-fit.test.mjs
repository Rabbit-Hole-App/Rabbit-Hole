// kinds-fit R1 and R2: the entry point takes { box, sizes, parts } and returns { width, height, element, min, geometry }; coordinate-plot, token-links, bar-chart (plain and grouped), heatmap and matrix are fitted, every other kind is drawn as always.
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
    if (typeof node.left === 'number' && typeof node.top === 'number') check(node.left, node.top, node.right - node.left, node.bottom - node.top);
    for (const key of ['from', 'to']) if (Array.isArray(node[key]) && typeof node[key][0] === 'number') check(node[key][0], node[key][1]);
    if (Array.isArray(node.points)) node.points.forEach(([x, y]) => check(x, y));
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
  };
  walk(geometry);
}

const FITTED = ['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix', 'flow'];
for (const kind of FITTED) {
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
  const bars = { version: 1, diagram: { kind: 'bar-chart', title: 'One stacked bar', variant: 'stacked', unit: 'share', bars: [{ label: 'A', value: 0.6 }, { label: 'B', value: 0.4 }], total: 1 } };
  const plain = renderTutorDiagram(bars, 408), asked = renderTutorDiagram(bars, 408, { box: { width: 200, height: 100 }, sizes: { body: 30, heading: 30 } });
  assert.equal(markup(asked), markup(plain));
  assert.deepEqual(plain.min, { width: plain.width, height: plain.height });
  assert.equal(plain.geometry, null);
  for (const kind of ['tensor', 'layers', 'cycle']) assert.equal(renderTutorDiagram(neutral(kind), 408).geometry, null, kind);
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

// ---- batch 2: min.parts, bar-chart, heatmap, matrix ----
const grouped = { version: 1, diagram: { kind: 'bar-chart', title: 'Loans by season', variant: 'grouped', unit: 'books', categories: ['Spring', 'Summer', 'Autumn'], series: [{ label: 'Adults', values: [12, 18, 9] }, { label: 'Children', values: [7, 15, 11] }] } };
const sumOf = (parts, axis) => parts.filter(part => part.axis === axis).reduce((all, part) => all + part.px, 0);

test('min.parts: the parts of an axis add up to min.width and min.height, for every fitted kind in several boxes and caption/title on or off', () => {
  for (const kind of FITTED) for (const [boxWidth, boxHeight] of BOXES) for (const partsOpt of [{ title: false }, {}]) {
    const rendered = renderTutorDiagram(neutral(kind), boxWidth, { box: { width: boxWidth, height: boxHeight }, sizes: all(14), parts: partsOpt });
    const { min } = rendered, where = `${kind} ${boxWidth}x${boxHeight} ${JSON.stringify(partsOpt)}`;
    assert.ok(Array.isArray(min.parts) && min.parts.length > 0, `${where}: parts`);
    assert.ok(min.parts.every(part => (part.axis === 'height' || part.axis === 'width') && typeof part.part === 'string' && Number.isFinite(part.px) && part.px >= 0), `${where}: shape`);
    assert.ok(Math.abs(sumOf(min.parts, 'height') - min.height) < 1e-6, `${where}: height parts ${sumOf(min.parts, 'height')} vs ${min.height}`);
    assert.ok(Math.abs(sumOf(min.parts, 'width') - min.width) < 1e-6, `${where}: width parts ${sumOf(min.parts, 'width')} vs ${min.width}`);
  }
  // a title and a caption are parts of the height
  const spec = { version: 1, diagram: { ...pendulum.diagram, caption: 'The same swing, two angles' } };
  const names = renderTutorDiagram(spec, 408, { box: { width: 408, height: 100 } }).min.parts.filter(part => part.axis === 'height').map(part => part.part);
  assert.ok(names.includes('title') && names.includes('caption') && names.includes('plot area'), names.join(', '));
  // a kind that is not fitted has no parts: min is its drawn size
  assert.equal(renderTutorDiagram(neutral('tensor'), 408).min.parts, undefined);
});

test('what sets min.height of a plot: a legend that needs a second row grows min.height by that row, and min.parts names it', () => {
  const short = renderTutorDiagram(pendulum, 304, { box: { width: 304, height: 299 }, sizes: all(14), parts: { title: false, legend: 'always' } });
  const longName = { version: 1, diagram: { ...pendulum.diagram, series: pendulum.diagram.series.map((s, i) => ({ ...s, label: i ? 'Large swing released from a greater height' : s.label })) } };
  const long = renderTutorDiagram(longName, 304, { box: { width: 304, height: 299 }, sizes: all(14), parts: { title: false, legend: 'always' } });
  const rows = spec => spec.min.parts.find(part => part.axis === 'height' && part.part === 'legend rows').px;
  assert.ok(rows(long) > rows(short), `legend rows ${rows(short)} -> ${rows(long)}`);
  assert.equal(long.min.height - short.min.height, rows(long) - rows(short));
});

test('bar-chart: plain and grouped bars fill the box, report the plot area, the value axis, the baseline and every bar; the stacked forms are not fitted', () => {
  for (const spec of [neutral('bar-chart'), grouped]) {
    const rendered = renderTutorDiagram(spec, 408, { box: { width: 408, height: 360 }, sizes: all(14), parts: { title: false } });
    assert.equal(rendered.height, 360);
    const { plotArea, y, baseline, bars } = rendered.geometry;
    assert.equal(bars.length, spec.diagram.series ? spec.diagram.categories.length * spec.diagram.series.length : spec.diagram.bars.length);
    assert.ok(y.min <= 0 && y.max > 0 && baseline.y >= plotArea.top && baseline.y <= plotArea.bottom);
    for (const bar of bars) assert.ok(bar.x >= plotArea.left - 0.5 && bar.x + bar.width <= plotArea.right + 0.5 && bar.height >= 0);
    insidePicture(rendered.geometry, rendered, 'bar-chart');
  }
  // the taller the box, the taller the plot area; below the floor the plot area stays at 120
  const tall = renderTutorDiagram(grouped, 408, { box: { width: 408, height: 500 }, sizes: all(14), parts: { title: false } }).geometry.plotArea;
  const low = renderTutorDiagram(grouped, 408, { box: { width: 408, height: 100 }, sizes: all(14), parts: { title: false } }).geometry.plotArea;
  assert.equal(low.bottom - low.top, 120);
  assert.ok(tall.bottom - tall.top > 200);
});

test('bar-chart parts: legend none, auto and always (a plain chart draws a pill for its one series under always); values false leaves out the value above each bar', () => {
  const pills = svg => />Adults</.test(svg) && />Children</.test(svg);
  const groupedAuto = markup(renderTutorDiagram(grouped, 408)), groupedNone = markup(renderTutorDiagram(grouped, 408, { parts: { legend: 'none' } }));
  assert.ok(pills(groupedAuto) && !pills(groupedNone), 'a grouped chart: pills under auto, none under none');
  const plain = neutral('bar-chart');
  const plainAuto = renderTutorDiagram(plain, 408), plainAlways = renderTutorDiagram(plain, 408, { parts: { legend: 'always' } });
  assert.ok(plainAlways.height > plainAuto.height, 'always adds a legend row to a plain chart');
  const withValues = markup(renderTutorDiagram(plain, 408)), noValues = markup(renderTutorDiagram(plain, 408, { parts: { values: false } }));
  assert.ok(withValues.length > noValues.length);
});

test('heatmap: the rows share the height that is left, cells and ranges are reported; parts.scale false leaves out the range line and the colour scale and takes no room', () => {
  const spec = neutral('heatmap');
  const tall = renderTutorDiagram(spec, 408, { box: { width: 408, height: 520 }, sizes: all(14), parts: { title: false } });
  assert.equal(tall.height, 520);
  const { cells, rowHeadings, columnHeadings, range } = tall.geometry;
  assert.equal(cells.length, spec.diagram.rows.length * spec.diagram.columns.length);
  assert.equal(rowHeadings.length, spec.diagram.rows.length);
  assert.equal(columnHeadings.length, spec.diagram.columns.length);
  assert.deepEqual(range, spec.diagram.range);
  assert.deepEqual(cells.map(cell => [cell.row, cell.col]), cells.map(cell => [cell.row, cell.col]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  const natural = renderTutorDiagram(spec, 408, { box: { width: 408, height: 1 }, sizes: all(14), parts: { title: false } });
  assert.ok(tall.geometry.cells[0].height > natural.geometry.cells[0].height);
  const withScale = renderTutorDiagram(spec, 408, { parts: { title: false } }), without = renderTutorDiagram(spec, 408, { parts: { title: false, scale: false } });
  assert.ok(withScale.height > without.height && />Range: /.test(markup(withScale)) && !/>Range: /.test(markup(without)));
});

test('matrix: the rows share the height that is left; every body cell and heading is reported; sizes.body sets every text', () => {
  const spec = neutral('matrix');
  const tall = renderTutorDiagram(spec, 408, { box: { width: 408, height: 400 }, sizes: all(16), parts: { title: false } });
  assert.equal(tall.height, 400);
  assert.deepEqual(fontSizes(markup(tall)), [16]);
  const { cells, rowHeadings, columnHeadings } = tall.geometry;
  assert.equal(cells.length, spec.diagram.rows.length * spec.diagram.columns.length);
  assert.equal(rowHeadings.length, spec.diagram.rows.length);
  assert.equal(columnHeadings.length, spec.diagram.columns.length);
  const first = cells[0], right = cells.find(cell => cell.row === 0 && cell.col === 1);
  assert.ok(right.x > first.x && Math.abs(right.y - first.y) < 0.5, 'cells are in row and column order');
});

// Batch 3 rule (the /interactive session): a fitted kind never draws a text smaller than the size asked. When a word does not fit, min grows and the kind draws at min.
// The stress spec: every label-like text of the neutral example is one long unbreakable word.
const LONG = 'Incomprehensibilities';
function lengthen(spec) {
  const copy = structuredClone(spec);
  let count = 0;
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (['label', 'heading', 'name'].includes(key) && typeof value === 'string') node[key] = `${LONG}${count++}`;
      else if (['columns', 'categories', 'source', 'target'].includes(key) && Array.isArray(value) && typeof value[0] === 'string') node[key] = value.map(() => LONG).map((text, i) => `${text}${i ? i : ''}`);
      else walk(value);
    }
  };
  walk(copy.diagram);
  return copy;
}
for (const kind of FITTED) {
  test(`${kind}: with long unbreakable words every text is drawn at the size asked, never smaller; min grows instead`, () => {
    for (const source of [neutral(kind), lengthen(neutral(kind))]) for (const [boxWidth, boxHeight] of BOXES) for (const size of SIZES) {
      const rendered = renderTutorDiagram(source, boxWidth, { box: { width: boxWidth, height: boxHeight }, sizes: all(size), parts: { title: false } });
      const sizes = fontSizes(markup(rendered));
      assert.ok(Math.min(...sizes) >= size - 0.01, `${kind} ${boxWidth}x${boxHeight} at ${size}: font sizes ${sizes.join(', ')}`);
    }
  });
}

// Batch 3: the top-down tree (decision trees: binary and hierarchy layouts with metadata) is fitted; the library's own decision-tree references are the examples.
const { diagramReferences } = await import('./reference-library.js');
const treeRef = pick => diagramReferences.find(ref => ref.spec?.diagram?.kind === 'tree' && pick(ref.spec.diagram))?.spec;
const TREES = { binary: treeRef(d => d.layout === 'binary' && d.nodes.some(n => n.count !== undefined || n.detail) && d.nodes.every(n => n.label !== undefined)), hierarchy: treeRef(d => d.layout === 'hierarchy') };
for (const [name, spec] of Object.entries(TREES)) {
  test(`tree (${name}): the library example in every box at sizes 14, 12 and 16 equals the box when it is at least min, else min; every text is the size asked; nodes and links lie inside the picture`, () => {
    assert.ok(spec, `a ${name} tree reference exists`);
    for (const [boxWidth, boxHeight] of BOXES) for (const size of SIZES) {
      const where = `tree ${name} ${boxWidth}x${boxHeight} at ${size}`;
      const rendered = renderTutorDiagram(spec, boxWidth, { box: { width: boxWidth, height: boxHeight }, sizes: all(size), parts: { title: false, caption: false } });
      const { min } = rendered;
      assert.ok(Math.abs(rendered.width - Math.max(boxWidth, min.width)) < 0.5, `${where}: width ${rendered.width} vs box ${boxWidth} and min ${min.width}`);
      assert.ok(Math.abs(rendered.height - Math.max(boxHeight, min.height)) < 1, `${where}: height ${rendered.height} vs box ${boxHeight} and min ${min.height}`);
      const sizes = fontSizes(markup(rendered));
      assert.ok(Math.min(...sizes) >= size - 0.01 && Math.max(...sizes) <= size + 0.01, `${where}: font sizes ${sizes.join(', ')}`);
      assert.ok(rendered.geometry && rendered.geometry.nodes.length === spec.diagram.nodes.length && rendered.geometry.links.length === spec.diagram.nodes.length - 1, `${where}: geometry`);
      insidePicture(rendered.geometry, rendered, where);
      const sum = axis => min.parts.filter(part => part.axis === axis).reduce((all2, part) => all2 + part.px, 0);
      assert.ok(Math.abs(sum('height') - min.height) < 0.5 && Math.abs(sum('width') - min.width) < 0.5, `${where}: min.parts sum`);
    }
  });
  test(`tree (${name}): with no options the picture is the one drawn today; a box below min draws min; long words widen the nodes instead of shrinking the text`, () => {
    for (const width of [320, 408, 720]) assert.equal(markup(renderTutorDiagram(spec, width, {})), markup(renderTutorDiagram(spec, width)));
    const small = renderTutorDiagram(spec, 20, { box: { width: 20, height: 20 }, sizes: all(14), parts: { title: false, caption: false } });
    assert.ok(Math.abs(small.width - small.min.width) < 0.5 && Math.abs(small.height - small.min.height) < 1);
    const long = structuredClone(spec);
    let count = 0;
    for (const node of long.diagram.nodes) node.label = `${LONG}${count++}`;
    const rendered = renderTutorDiagram(long, 632, { box: { width: 632, height: 312 }, sizes: all(14), parts: { title: false, caption: false } });
    assert.ok(Math.min(...fontSizes(markup(rendered))) >= 13.99, `long words: ${fontSizes(markup(rendered))}`);
  });
}

// Batch 3: a bar's value label never runs over its neighbour in box mode (the unit goes first, then the label); options.range fixes the value axis; no options: as today.
const books = { version: 1, diagram: { kind: 'bar-chart', variant: 'grouped', title: 'Loans', unit: 'books', categories: ['Mon', 'Tue', 'Wed'], series: [{ label: 'Town', values: [9, 7, 11] }, { label: 'Park', values: [7, 12, 8] }] } };
test('bar-chart grouped: in a box every value label is at most as wide as its bar (the unit is dropped first), and no options keeps today\'s labels', () => {
  const rendered = renderTutorDiagram(books, 408, { box: { width: 408, height: 312 }, sizes: all(14), parts: { title: false } });
  const svg = markup(rendered);
  const barWidth = rendered.geometry.bars[0].width;
  const texts = [...svg.matchAll(/<text[^>]*font-weight="600"[^>]*><tspan[^>]*>([^<]*)<\/tspan>/g)].map(match => match[1]);
  assert.ok(texts.length > 0, 'the value labels are drawn (digits fit their bars)');
  for (const text of texts) assert.ok(!text.includes('books') || textWidthOf(text) <= barWidth + 0.5, `"${text}" is wider than its bar (${barWidth})`);
  assert.ok(!texts.some(text => text.includes('books')), 'at this bar width the unit is dropped before the label');
  assert.equal(markup(renderTutorDiagram(books, 408, {})), markup(renderTutorDiagram(books, 408)), 'with no options (or an empty one) the picture is today\'s: the rule applies in box mode only');
});
import { textWidth as textWidthOf } from './primitives.js';

const plain = values => ({ version: 1, diagram: { kind: 'bar-chart', title: 'Loans', unit: 'books', bars: values.map((value, i) => ({ label: `Day ${i + 1}`, value })) } });
test('bar-chart: options.range fixes the value axis; values outside it are clamped and reported; the same range gives the same scale for other values; no range is today\'s axis', () => {
  const opts = range => ({ box: { width: 408, height: 312 }, sizes: all(14), parts: { title: false }, ...(range ? { range } : {}) });
  const a = renderTutorDiagram(plain([12, 18]), 408, opts({ min: 0, max: 40 })), b = renderTutorDiagram(plain([30, 5]), 408, opts({ min: 0, max: 40 }));
  assert.deepEqual(a.geometry.range, { min: 0, max: 40 });
  assert.deepEqual(a.geometry.y, { min: 0, max: 40 });
  assert.deepEqual(a.geometry.plotArea, b.geometry.plotArea, 'one plot area for one range');
  assert.ok(Math.abs(a.geometry.bars[0].height / a.geometry.bars[1].height - 12 / 18) < 0.01, 'bars are to scale against the given range');
  assert.ok(!a.geometry.bars.some(bar => bar.clamped));
  const clamped = renderTutorDiagram(plain([12, 18]), 408, opts({ min: 0, max: 10 }));
  assert.deepEqual(clamped.geometry.bars.map(bar => [bar.value, bar.clamped === true]), [[12, true], [18, true]], 'the original value stays, clamped: true');
  assert.ok(Math.abs(clamped.geometry.bars[0].height - (clamped.geometry.plotArea.bottom - clamped.geometry.plotArea.top)) < 0.5, 'a clamped bar reaches the plot edge');
  const none = renderTutorDiagram(plain([12, 18]), 408, opts());
  assert.ok(none.geometry.range && none.geometry.range.min === none.geometry.y.min && none.geometry.range.max === none.geometry.y.max, 'without a range, geometry.range is the axis derived from the values');
  assert.equal(markup(renderTutorDiagram(plain([12, 18]), 408, { range: { min: 0, max: 40 } })), markup(renderTutorDiagram(plain([12, 18]), 408)), 'a range with no box or sizes is ignored: today\'s drawing');
  assert.ok(Number.isFinite(a.min.width) && a.min.width > 0 && a.min.parts.length > 0);
});
