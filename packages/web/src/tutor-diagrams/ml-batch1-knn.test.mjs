import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { references } from './ml-batch1-knn-references.js';
import { parseTutorDiagram, tutorDiagramVisibleText, describeTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const byId = id => references.find(reference => reference.id === id);
const panels = id => byId(id).spec.diagram.panels.map(panel => panel.diagram);
const query = plot => plot.series.find(series => series.label === 'Query q').points[0];
const training = plot => plot.series.filter(series => series.label !== 'Query q')
  .flatMap(series => series.points.map(point => ({ ...point, class: series.label.replace('Class ', '') })));
const squaredDistance = (point, q, factor = 1) => (factor * (point.x - q.x)) ** 2 + (point.y - q.y) ** 2;
const nearest = (points, q, k, factor = 1) => [...points].sort((a, b) =>
  squaredDistance(a, q, factor) - squaredDistance(b, q, factor) || a.x - b.x).slice(0, k);
const votes = (points, weight = () => 1) => points.reduce((totals, point) => {
  totals[point.class] = (totals[point.class] ?? 0) + weight(point);
  return totals;
}, {});
const winner = totals => Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const fraction = text => {
  const source = text.replace(/^\$|\$$/g, '');
  const match = source.match(/^\\frac\{(\d+)\}\{(\d+)\}$/);
  const value = match ? Number(match[1]) / Number(match[2]) : Number(source);
  assert.ok(Number.isFinite(value), `Not a displayed number: ${text}`);
  return value;
};
const coordinates = point => ({ x: point.x, y: point.y });
const number = (element, name) => Number(element.getAttribute(name));
const pointList = element => element.getAttribute('points').trim().split(/\s+/).map(pair => pair.split(',').map(Number));
function center(element) {
  if (element.localName === 'circle') return [number(element, 'cx'), number(element, 'cy')];
  if (element.localName === 'rect') return [number(element, 'x') + number(element, 'width') / 2,
    number(element, 'y') + number(element, 'height') / 2];
  const points = pointList(element);
  return [0, 1].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
}
function render(reference, width = 408) {
  const result = renderTutorDiagram(reference.spec, width);
  const markup = renderToStaticMarkup(result.element);
  const { document } = parseHTML(markup);
  return { ...result, markup, svg: document.querySelector('svg') };
}
const children = svg => [...svg.querySelectorAll('[data-tutor-composition-child]')];
function projection(plot, child) {
  const area = child.querySelector('[data-tutor-plot-area]');
  assert.ok(area, plot.title);
  const x = value => number(area, 'x') + number(area, 'width') * (value - plot.x.min) / (plot.x.max - plot.x.min);
  const y = value => number(area, 'y') + number(area, 'height') * (plot.y.max - value) / (plot.y.max - plot.y.min);
  return { area, x, y };
}
function assertPlotGeometry(plot, child) {
  const { x, y } = projection(plot, child);
  const points = plot.series.flatMap(series => series.points);
  assert.equal(child.querySelectorAll('[data-tutor-coordinate-point]').length, points.length);
  for (const point of points) {
    const mark = child.querySelector(`[data-tutor-sample-id="${point.id}"]`);
    assert.ok(mark, `${plot.title}: ${point.id}`);
    const [cx, cy] = center(mark);
    close(cx, x(point.x)); close(cy, y(point.y));
  }
  const segments = plot.annotations.filter(annotation => annotation.kind === 'segment');
  const drawn = [...child.querySelectorAll('[data-tutor-plot-segment]')];
  assert.equal(drawn.length, segments.length);
  segments.forEach((segment, index) => {
    const endpoints = pointList(drawn[index].querySelector('polyline'));
    assert.equal(endpoints.length, 2);
    close(endpoints[0][0], x(segment.from.x)); close(endpoints[0][1], y(segment.from.y));
    close(endpoints[1][0], x(segment.to.x)); close(endpoints[1][1], y(segment.to.y));
  });
  for (const boundary of plot.annotations.filter(annotation => annotation.kind === 'reference-line')) {
    const line = child.querySelector(`[data-tutor-plot-reference="${boundary.axis}:${boundary.value}"]`);
    assert.ok(line);
    close(number(line, 'x1'), x(boundary.value)); close(number(line, 'x2'), x(boundary.value));
    close(number(line, 'y1'), y(plot.y.max)); close(number(line, 'y2'), y(plot.y.min));
  }
}

test('the batch contains exactly four lesson-06 references using existing semantic kinds', () => {
  assert.deepEqual(references.map(reference => reference.id), [
    'ml-knn-distance-weighted-vote', 'ml-knn-scaled-distance', 'ml-knn-k-boundaries', 'ml-kd-tree-partitions',
  ]);
  for (const reference of references) {
    assert.deepEqual(reference.lessons, ['06']);
    assert.ok(reference.prompts.length >= 1 && reference.prompts.every(prompt => prompt.length > 25));
    assert.ok(reference.keywords.length >= 4 && reference.useWhen.length > 40);
    assert.equal(reference.spec.diagram.kind, 'comparison');
    assert.equal(reference.spec.diagram.variant, 'panels');
    assert.equal(reference.spec.diagram.panels.length, 2);
    assert.doesNotMatch(JSON.stringify(reference.spec), /"(?:fill|stroke|style|className|svg|html)"\s*:/,
      'reference data cannot author colors or rendering code');
  }
});

for (const reference of references) {
  test(`${reference.id}: public schema, saved JSON and real renderer agree at narrow/card/wide widths`, () => {
    const parsed = parseTutorDiagram(reference.spec);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(parsed)), parsed);
    const visible = tutorDiagramVisibleText(parsed).filter(Boolean);
    assert.ok(visible.includes(parsed.diagram.title));
    for (const { diagram } of parsed.diagram.panels) assert.ok(visible.includes(diagram.title));
    assert.ok(describeTutorDiagram(parsed).length > parsed.diagram.title.length);
    for (const width of [320, 408, 720]) {
      const result = render(reference, width);
      assert.ok(result.width >= width && result.height > 0);
      assert.doesNotMatch(result.markup, /NaN|Infinity|undefined|katex-error/);
      assert.equal(result.svg.getAttribute('role'), 'img');
      assert.equal(result.svg.getAttribute('viewBox'), `0 0 ${result.width} ${result.height}`);
      assert.ok(result.svg.querySelector('[data-tutor-tex]'), 'formulas use the existing math renderer');
      assert.equal(result.markup, renderToStaticMarkup(renderTutorDiagram(JSON.stringify(parsed), width).element));
      const childElements = children(result.svg);
      assert.equal(childElements.length, parsed.diagram.panels.length);
      parsed.diagram.panels.forEach(({ diagram }, index) => {
        if (diagram.kind === 'coordinate-plot') assertPlotGeometry(diagram, childElements[index]);
      });
    }
    const invalid = structuredClone(reference.spec);
    const plot = invalid.diagram.panels.find(panel => panel.diagram.kind === 'coordinate-plot').diagram;
    plot.series[0].points[0].x = plot.x.max + 1;
    assert.throws(() => parseTutorDiagram(invalid), /bounds|domain|range/i);
  });
}

test('uniform and inverse-distance votes are independently recomputed from the plotted neighbor coordinates', () => {
  const [plot, matrix] = panels('ml-knn-distance-weighted-vote');
  const q = query(plot), points = training(plot), k = Number(plot.title.match(/k = (\d+)/)[1]);
  const selected = nearest(points, q, k);
  assert.equal(k, 3); assert.equal(selected.length, points.length);
  for (const point of selected) {
    const distance = Math.sqrt(squaredDistance(point, q));
    assert.ok(distance > 0);
    const row = matrix.rows.find(row => row.id === point.id);
    close(fraction(row.cells[0]), distance);
    close(fraction(row.cells[1]), 1);
    close(fraction(row.cells[2]), 1 / distance);
    const segment = plot.annotations.find(annotation => annotation.label.startsWith(`${point.label}:`));
    assert.deepEqual(segment.from, coordinates(q)); assert.deepEqual(segment.to, coordinates(point));
    close(Number(segment.label.match(/\$d = (\d+)\$/)[1]), distance);
    close(fraction(segment.label.match(/\$1\/d = (.+)\$$/)[1]), 1 / distance);
  }
  const uniform = votes(selected), weighted = votes(selected, point => 1 / Math.sqrt(squaredDistance(point, q)));
  for (const className of Object.keys(uniform)) {
    const total = matrix.rows.find(row => row.heading === `Class ${className} total`);
    close(fraction(total.cells[1]), uniform[className]); close(fraction(total.cells[2]), weighted[className]);
  }
  const result = matrix.rows.find(row => row.id === 'winner');
  assert.deepEqual(result.cells.slice(1), [winner(uniform), winner(weighted)]);
  assert.deepEqual(result.cells.slice(1), ['A', 'B']);
  close(weighted.A, 5 / 6); close(weighted.B, 1);
});

test('scaling changes the metric distances and winner while every raw coordinate and rendered position stays fixed', () => {
  const reference = byId('ml-knn-scaled-distance'), [first, second] = panels(reference.id);
  assert.deepEqual(reference.spec.diagram.sharedAxes, ['x', 'y']);
  assert.deepEqual(first.series, second.series);
  assert.deepEqual(first.x, second.x); assert.deepEqual(first.y, second.y);
  assert.deepEqual([first.x.min, first.x.max, first.y.min, first.y.max], [0, 12, 0, 12]);
  const predicted = [];
  for (const plot of [first, second]) {
    const s = Number(plot.title.match(/s = (\d+)/)[1]), q = query(plot);
    const points = training(plot);
    for (const point of points) {
      const distanceLabel = plot.annotations.find(annotation => annotation.label.startsWith(`${point.class}:`));
      const shownSquared = Number(distanceLabel.label.match(/\\sqrt\{(\d+)\}/)[1]);
      close(shownSquared, squaredDistance(point, q, s));
      assert.deepEqual(distanceLabel.from, coordinates(q)); assert.deepEqual(distanceLabel.to, coordinates(point));
    }
    const closest = nearest(points, q, 1, s)[0].class;
    assert.ok(plot.title.endsWith(`nearest class ${closest}`));
    predicted.push(closest);
  }
  assert.deepEqual(predicted, ['B', 'A']);
  for (const width of [320, 408, 720]) {
    const [left, right] = children(render(reference, width).svg);
    for (const point of first.series.flatMap(series => series.points)) {
      assert.deepEqual(center(left.querySelector(`[data-tutor-sample-id="${point.id}"]`)),
        center(right.querySelector(`[data-tutor-sample-id="${point.id}"]`)));
    }
  }
  const changedAxis = structuredClone(reference.spec);
  changedAxis.diagram.panels[1].diagram.x = { ...changedAxis.diagram.panels[1].diagram.x, max: 13 };
  assert.throws(() => parseTutorDiagram(changedAxis), /Shared axes/);
});

test('KNN boundaries are the real two-dimensional vote transitions, including stated equal-distance ties', () => {
  const reference = byId('ml-knn-k-boundaries'), [first, second] = panels(reference.id);
  assert.deepEqual(first.series, second.series); assert.deepEqual(first.x, second.x); assert.deepEqual(first.y, second.y);
  assert.deepEqual(reference.spec.diagram.sharedAxes, ['x', 'y']);
  assert.match(reference.spec.diagram.caption, /equal-distance neighbor ties by smaller x/);
  for (const plot of [first, second]) {
    const k = Number(plot.title.match(/k = (\d+)/)[1]), points = training(plot), q = query(plot);
    assert.equal(new Set(points.map(point => point.y)).size, 1, 'all sites share a y coordinate, making bisectors vertical');
    assert.notEqual(q.y, points[0].y, 'the example is genuinely queried off the training line');
    const classify = (x, y) => winner(votes(nearest(points, { x, y }, k)));
    const bounds = plot.annotations.map(annotation => {
      assert.equal(annotation.kind, 'reference-line'); assert.equal(annotation.axis, 'x');
      const [, left, right] = annotation.label.match(/^([AB]) \| ([AB]) /);
      return { ...annotation, left, right };
    }).sort((a, b) => a.value - b.value);
    const candidates = [...new Set(points.flatMap((a, i) => points.slice(i + 1).map(b => (a.x + b.x) / 2)))].sort((a, b) => a - b);
    const transitions = candidates.filter(x => classify(x - 1e-6, q.y) !== classify(x + 1e-6, q.y));
    assert.deepEqual(bounds.map(bound => bound.value), transitions, 'no invented or missing decision transition');
    const expectedAt = x => bounds.reduce((label, bound) => x > bound.value ? bound.right : label, bounds[0].left);
    for (const y of [plot.y.min, 1, q.y, plot.y.max]) {
      // Test every interval throughout the domain, not only one hand-picked query.
      for (let step = 0; step <= 280; step++) {
        const x = plot.x.min + (plot.x.max - plot.x.min) * step / 280;
        assert.equal(classify(x, y), expectedAt(x), `${plot.title} at (${x}, ${y})`);
      }
      for (const bound of bounds) assert.equal(classify(bound.value, y), bound.left, 'smaller-x site wins equal-distance selection');
    }
    assert.ok(plot.title.endsWith(`q predicts ${classify(q.x, q.y)}`));
  }
  assert.deepEqual(first.annotations.map(annotation => annotation.value), [2.5, 4.5, 5.5]);
  assert.deepEqual(second.annotations.map(annotation => annotation.value), [2.5]);
});

test('KD-tree node counts, leaf memberships, query route and bounded partition segments agree with the plotted samples', () => {
  const reference = byId('ml-kd-tree-partitions'), [tree, plot] = panels(reference.id);
  const points = training(plot), q = query(plot), root = tree.nodes.find(node => !node.parent);
  const regions = new Map(), memberships = new Map(), splits = [];
  function visit(node, members, region) {
    regions.set(node.id, region); memberships.set(node.id, members);
    assert.equal(node.count, members.length, `count at ${node.id}`);
    const descendants = tree.nodes.filter(child => child.parent === node.id);
    if (!descendants.length) {
      assert.deepEqual(node.label.split(', '), members.map(point => point.label));
      assert.equal(node.count, 2);
      return;
    }
    const [, dimension, thresholdText] = node.label.match(/^\$([xy]) < (\d+)\$\?$/);
    const threshold = Number(thresholdText);
    splits.push(dimension === 'x'
      ? { from: { x: threshold, y: region.yMin }, to: { x: threshold, y: region.yMax } }
      : { from: { x: region.xMin, y: threshold }, to: { x: region.xMax, y: threshold } });
    assert.equal(descendants.length, 2);
    for (const child of descendants) {
      const lower = child.side === 'left';
      assert.equal(child.edgeLabel, lower ? `$${dimension} < ${threshold}$` : `$${dimension} \\ge ${threshold}$`);
      visit(child, members.filter(point => lower ? point[dimension] < threshold : point[dimension] >= threshold),
        { ...region, [`${dimension}${lower ? 'Max' : 'Min'}`]: threshold });
    }
  }
  visit(root, points, { xMin: plot.x.min, xMax: plot.x.max, yMin: plot.y.min, yMax: plot.y.max });
  assert.equal(root.count, 8);
  const actualSplits = plot.annotations.filter(annotation => annotation.label.includes('split:'));
  assert.deepEqual(actualSplits.map(({ from, to }) => ({ from, to })), splits);
  const route = [root.id];
  let node = root;
  while (tree.nodes.some(child => child.parent === node.id)) {
    const [, dimension, threshold] = node.label.match(/^\$([xy]) < (\d+)\$\?$/);
    const side = q[dimension] < Number(threshold) ? 'left' : 'right';
    node = tree.nodes.find(child => child.parent === node.id && child.side === side);
    route.push(node.id);
  }
  assert.deepEqual(tree.highlightPath, route);
  assert.equal(route.at(-1), 'lowerLeft'); assert.match(node.detail, /First leaf visited/);
  const highlighted = plot.annotations.find(annotation => annotation.kind === 'rectangle');
  for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) assert.equal(highlighted[key], regions.get(node.id)[key]);
  assert.ok(memberships.get(node.id).every(point => highlighted.label.includes(point.label)));
  const closest = nearest(points, q, 1)[0];
  const nearestSegment = plot.annotations.find(annotation => annotation.label.includes('is nearest'));
  assert.deepEqual(nearestSegment.from, coordinates(q)); assert.deepEqual(nearestSegment.to, coordinates(closest));
  assert.ok(nearestSegment.label.startsWith(`${closest.label} is nearest`));
  close(Number(nearestSegment.label.match(/\$d = (\d+)\$/)[1]), Math.sqrt(squaredDistance(closest, q)));
  assert.match(tree.caption, /Exact nearest-neighbor search may backtrack/);
  for (const width of [320, 408, 720]) {
    const [treeElement, plotElement] = children(render(reference, width).svg);
    assert.deepEqual([...treeElement.querySelectorAll('[data-tutor-node][data-tutor-path]')].map(element => element.getAttribute('data-tutor-node')), route);
    assert.deepEqual([...treeElement.querySelectorAll('[data-tutor-edge][data-tutor-path]')].map(element => element.getAttribute('data-tutor-edge')),
      route.slice(1).map((id, i) => `${route[i]}:${id}`));
    for (const item of tree.nodes) assert.ok(treeElement.querySelector(`[data-tutor-node="${item.id}"]`).textContent.includes(`n = ${item.count}`));
    const rect = plotElement.querySelector('[data-tutor-plot-rectangle]'), { x, y } = projection(plot, plotElement);
    close(number(rect, 'x'), x(highlighted.xMin)); close(number(rect, 'y'), y(highlighted.yMax));
    close(number(rect, 'width'), x(highlighted.xMax) - x(highlighted.xMin));
    close(number(rect, 'height'), y(highlighted.yMin) - y(highlighted.yMax));
  }
});
