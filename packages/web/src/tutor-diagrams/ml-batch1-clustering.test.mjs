import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch1-clustering-references.js';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramSchema, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { TEACHING, TEACHING_STYLE } from './teaching-theme.js';
import { lineHeight, textWidth } from './primitives.js';

const record = id => {
  const found = references.find(reference => reference.id === id);
  assert.ok(found, id);
  return found;
};
const panels = id => record(id).spec.diagram.panels.map(panel => panel.diagram);
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} should equal ${expected} within ${tolerance}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const children = element => [element?.props?.children].flat(Infinity).filter(value => value && typeof value === 'object');
const walk = element => [element, ...children(element).flatMap(walk)];
const marked = (element, attribute) => walk(element).filter(node => node.props?.[attribute] !== undefined);
const cell = (table, row, column) => {
  const index = table.columns.indexOf(column);
  assert.ok(index >= 0, column);
  return row.cells[index];
};

test('GMM numeric table values stay on one line at a normal card width', () => {
  const [, table] = panels('ml-gmm-responsibilities');
  const result = renderTutorDiagram(record('ml-gmm-responsibilities').spec, 408);
  const nodes = walk(result.element);
  for (const row of table.rows) for (const [index, value] of row.cells.entries()) {
    const position = nodes.findIndex(node => node.props?.['data-tutor-matrix-cell'] === `${row.id}:${index}`);
    assert.ok(position >= 0);
    const text = nodes[position + 1];
    assert.equal(text.type, 'text');
    const spans = children(text);
    assert.equal(spans.length, 1, `${row.id}:${index}: ${value} must not break between digits`);
    assert.equal(spans[0].props.children, value);
  }
});

test('exactly three clustering references use lesson 07 and the public saved-JSON contract', () => {
  assert.deepEqual(references.map(reference => reference.id), [
    'ml-kmeans-assignment-update', 'ml-dbscan-core-border-noise', 'ml-gmm-responsibilities',
  ]);
  for (const reference of references) {
    assert.deepEqual(reference.lessons, ['07']);
    assert.ok(reference.prompts.length && reference.prompts.every(prompt => prompt.length > 30));
    assert.ok(reference.keywords.length >= 4 && reference.useWhen.length > 40);
    const saved = JSON.stringify(reference.spec);
    assert.ok(saved.length < 16_384);
    assert.deepEqual(parseTutorDiagram(saved), reference.spec);
    assert.deepEqual(parseTutorDiagram(reference.spec), reference.spec);
    assert.ok(tutorDiagramVisibleText(reference.spec).includes(reference.spec.diagram.title));
    assert.ok(describeTutorDiagram(reference.spec).length > reference.spec.diagram.title.length);
    assert.equal(reference.spec.diagram.kind, 'comparison');
    assert.equal(reference.spec.diagram.variant, 'panels');
    for (const { diagram } of reference.spec.diagram.panels) {
      assert.ok(['coordinate-plot', 'matrix'].includes(diagram.kind));
      if (diagram.kind === 'coordinate-plot') assert.ok(diagram.series.length <= 3);
      if (diagram.kind === 'matrix') assert.ok(diagram.columns.length <= 8);
    }
  }
});

test('K-means assigns to fixed initial centers, then computes means without moving samples', () => {
  const [assigned, updated] = panels('ml-kmeans-assignment-update');
  const originalCenters = [{ x: 0, y: 0 }, { x: 8, y: 0 }];
  const expectedSamples = [
    ['a1', 1, 1], ['a2', 2, 2], ['a3', 3, 1],
    ['b1', 6, 1], ['b2', 7, 2], ['b3', 8, 1],
  ];
  assert.equal(assigned.series.length, 2);
  assert.deepEqual(assigned.series.flatMap(series => series.points.map(point => [point.id, point.x, point.y])), expectedSamples);
  assert.deepEqual(assigned.annotations.map(({ x, y }) => ({ x, y })), originalCenters,
    'the assignment snapshot must retain the initial centers');
  assert.deepEqual(updated.series, assigned.series, 'sample IDs, coordinates, labels and series order remain unchanged');
  assert.deepEqual(updated.x, assigned.x);
  assert.deepEqual(updated.y, assigned.y);
  assert.deepEqual(record('ml-kmeans-assignment-update').spec.diagram.sharedAxes, ['x', 'y']);
  for (const [index, series] of assigned.series.entries()) {
    for (const sample of series.points) {
      assert.ok(distance(sample, originalCenters[index]) < distance(sample, originalCenters[1 - index]), sample.id);
    }
    const mean = dimension => series.points.reduce((sum, sample) => sum + sample[dimension], 0) / series.points.length;
    close(updated.annotations[index].x, mean('x'));
    close(updated.annotations[index].y, mean('y'));
  }
  assert.deepEqual(updated.annotations.map(({ x }) => x), [2, 7]);
  updated.annotations.forEach(({ y }) => close(y, 4 / 3));
  assert.match(assigned.caption, /centers stay fixed/i);
  assert.ok(updated.caption.includes('\\frac{4}{3}'));
});

test('DBSCAN roles follow all pairwise distances, self-inclusive counts and core connectivity', () => {
  const [plot, table] = panels('ml-dbscan-core-border-noise');
  const samples = plot.series.flatMap(series => series.points);
  assert.equal(table.rows.length, samples.length);
  assert.deepEqual(samples.map(({ id, x, y }) => [id, x, y]), [
    ['c1', 2, 2], ['c2', 2.5, 2], ['c3', 2, 2.5], ['c4', 2.5, 2.5], ['b', 3.4, 2], ['n', 5, 4],
  ]);
  const epsilon = 1, minimum = 4;
  const distances = samples.map(a => samples.map(b => distance(a, b)));
  const neighbors = distances.map(row => row.flatMap((value, index) => value <= epsilon ? [index] : []));
  assert.deepEqual(neighbors.map(list => list.length), [4, 5, 4, 4, 2, 1]);
  const core = samples.map((_, index) => index).filter(index => neighbors[index].length >= minimum);
  assert.deepEqual(core, [0, 1, 2, 3]);
  const reachable = new Set([core[0]]), queue = [core[0]];
  for (const current of queue) {
    for (const next of neighbors[current]) if (core.includes(next) && !reachable.has(next)) {
      reachable.add(next); queue.push(next);
    }
  }
  assert.equal(reachable.size, core.length, 'all four core points belong to one density-connected cluster');
  samples.forEach((sample, index) => {
    close(distances[index][index], 0);
    samples.forEach((_, other) => close(distances[index][other], distances[other][index]));
    const nearestCore = Math.min(...core.map(other => distances[index][other]));
    const role = core.includes(index) ? 'Core' : nearestCore <= epsilon ? 'Border' : 'Noise';
    const series = plot.series.find(series => series.points.some(point => point.id === sample.id));
    assert.equal(series.label, role);
    const row = table.rows.find(row => row.id === sample.id);
    assert.ok(row, sample.id);
    assert.equal(Number(cell(table, row, 'Count')), neighbors[index].length);
    assert.equal(row.heading, `${sample.label} · ${role}`);
    assert.deepEqual(cell(table, row, 'Nearby').split(' '), neighbors[index].map(other => samples[other].label));
    close(Number(cell(table, row, 'To core')), nearestCore, 0.0005);
  });
  assert.deepEqual(neighbors[4].map(index => samples[index].id), ['c2', 'b']);
  close(distances[4][1], 0.9);
  assert.ok(distances[4][3] > epsilon, 'border is outside C4’s neighborhood');
  assert.deepEqual(neighbors[5], [5], 'noise has no other neighbor');
  const circle = plot.annotations.find(annotation => annotation.kind === 'circle');
  assert.deepEqual(circle.center, { x: samples[1].x, y: samples[1].y });
  assert.equal(circle.radius, epsilon);
  assert.match(record('ml-dbscan-core-border-noise').spec.diagram.caption, /min_samples 4/);
  assert.match(table.caption, /includes self/);
});

test('GMM densities and responsibilities independently satisfy two-dimensional Bayes normalization', () => {
  const [plot, table] = panels('ml-gmm-responsibilities');
  const contours = plot.annotations.filter(annotation => annotation.kind === 'circle');
  assert.deepEqual(contours.map(({ center, radius }) => [center.x, center.y, radius]), [[0, 0, 1], [2, 0, 1]]);
  const samples = plot.series.flatMap(series => series.points);
  assert.deepEqual(samples.map(({ id, x, y }) => [id, x, y]), [['x0', 0, 0], ['x1', 1, 0], ['x2', 2, 0]]);
  assert.equal(table.rows.length, 2 * samples.length);
  const posteriors = [];
  for (const sample of samples) {
    const rows = ['a', 'b'].map(component => table.rows.find(row => row.id === `${sample.id}${component}`));
    rows.forEach(row => assert.ok(row, sample.id));
    assert.deepEqual(rows.map(row => row.heading), [`${sample.label} / A`, `${sample.label} / B`]);
    const priors = rows.map(row => Number(cell(table, row, 'Prior')));
    assert.deepEqual(priors, [0.5, 0.5]);
    const densities = contours.map(({ center }) => Math.exp(-(distance(sample, center) ** 2) / 2) / (2 * Math.PI));
    densities.forEach((value, index) => close(Number(cell(table, rows[index], 'Density')), value, 0.00005));
    const weights = densities.map((density, index) => density * priors[index]);
    const evidence = weights.reduce((sum, value) => sum + value, 0);
    const responsibility = weights.map(value => value / evidence);
    responsibility.forEach((value, index) => close(Number(cell(table, rows[index], 'Share')), value, 0.00005));
    close(rows.reduce((sum, row) => sum + Number(cell(table, row, 'Share')), 0), 1);
    assert.ok(responsibility.every(value => value > 0 && value < 1), 'all examples have soft membership');
    rows.forEach(row => assert.notEqual(Number(cell(table, row, 'Density')), Number(cell(table, row, 'Share')),
      'density is not posterior probability'));
    posteriors.push(responsibility);
  }
  close(posteriors[0][0], 0.8807970779778823);
  close(posteriors[1][0], 0.5);
  close(posteriors[2][0], 0.11920292202211755);
  close(posteriors[0][0], posteriors[2][1]);
  assert.match(table.caption, /density/);
  assert.match(table.caption, /r_k/);
  assert.match(plot.caption, /equal-density contours/);
  assert.doesNotMatch(JSON.stringify(record('ml-gmm-responsibilities')), /68\s*%/);
});

test('the public schema rejects authored styles, invalid nested points and ragged calculation tables', () => {
  for (const change of [
    spec => { spec.diagram.panels[0].diagram.series[0].points[0].x = 99; },
    spec => { spec.diagram.panels[0].diagram.fill = '#ff0000'; },
    spec => { spec.diagram.panels[1].diagram.rows[0].cells.pop(); },
  ]) {
    const spec = structuredClone(record('ml-gmm-responsibilities').spec);
    change(spec);
    assert.equal(tutorDiagramSchema.safeParse(spec).success, false);
  }
  const mismatched = structuredClone(record('ml-kmeans-assignment-update').spec);
  mismatched.diagram.panels[1].diagram.x.max++;
  assert.equal(tutorDiagramSchema.safeParse(mismatched).success, false);
});

function verifyFrame(element, width, height, offset = [0, 0]) {
  const props = element.props ?? {};
  let [dx, dy] = offset;
  if (props.transform) {
    const match = props.transform.match(/^translate\(([-.\d]+)[ ,]([-.\d]+)\)$/);
    assert.ok(match, `unexpected scaling or transform: ${props.transform}`);
    dx += Number(match[1]); dy += Number(match[2]);
  }
  const within = (x, y) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= -0.01 && x <= width + 0.01 && y >= -0.01 && y <= height + 0.01,
      `${element.type} (${x}, ${y}) outside ${width} × ${height}`);
  };
  if (element.type === 'rect') {
    within(dx + props.x, dy + props.y);
    within(dx + props.x + props.width, dy + props.y + props.height);
    assert.ok(props.width >= 0 && props.height >= 0);
  }
  if (element.type === 'foreignObject') {
    within(dx + props.x, dy + props.y);
    within(dx + props.x + props.width, dy + props.y + props.height);
  }
  if (element.type === 'circle' || element.type === 'ellipse') {
    const rx = props.r ?? props.rx, ry = props.r ?? props.ry;
    within(dx + props.cx - rx, dy + props.cy - ry);
    within(dx + props.cx + rx, dy + props.cy + ry);
  }
  if (element.type === 'line') {
    within(dx + props.x1, dy + props.y1); within(dx + props.x2, dy + props.y2);
  }
  if (element.type === 'polygon' || element.type === 'polyline') {
    props.points.split(' ').forEach(pair => { const [x, y] = pair.split(',').map(Number); within(dx + x, dy + y); });
  }
  if (element.type === 'text') {
    assert.ok(props.fontSize >= 12, 'native readable text size');
    for (const span of children(element).filter(child => child.type === 'tspan')) {
      const text = span.props.children, size = props.fontSize;
      const textLength = textWidth(text, size);
      const left = dx + span.props.x - (props.textAnchor === 'middle' ? textLength / 2 : props.textAnchor === 'end' ? textLength : 0);
      const center = dy + span.props.y - size * 0.34;
      within(left, center - lineHeight(size) / 2);
      within(left + textLength, center + lineHeight(size) / 2);
    }
  }
  for (const attribute of ['fill', 'stroke']) if (props[attribute] && props[attribute] !== 'none') {
    const color = props[attribute].startsWith('var(')
      ? TEACHING_STYLE[props[attribute].match(/^var\(([^,]+)/)[1]] : props[attribute];
    assert.ok(Object.values(TEACHING).includes(color), `unapproved ${attribute}: ${props[attribute]}`);
  }
  children(element).forEach(child => verifyFrame(child, width, height, [dx, dy]));
}

for (const reference of references) {
  test(`${reference.id}: actual SVG is deterministic, bounded and uses the approved palette at 440/880`, () => {
    const saved = JSON.stringify(reference.spec);
    for (const available of [440, 880]) {
      const result = renderTutorDiagram(saved, available);
      const svg = renderToStaticMarkup(result.element);
      assert.ok(Number.isFinite(result.width) && result.width >= Math.min(available, 720));
      assert.ok(result.width <= 880 && Number.isFinite(result.height) && result.height > 0);
      assert.match(svg, /role="img"/);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(reference.spec, available).element));
      assert.equal(JSON.stringify(reference.spec), saved, 'rendering cannot mutate the reference');
      assert.equal(marked(result.element, 'data-tutor-composition-child').length, 2);
      const count = reference.spec.diagram.panels.flatMap(({ diagram }) => diagram.series ?? [])
        .reduce((sum, series) => sum + series.points.length, 0);
      assert.equal(marked(result.element, 'data-tutor-coordinate-point').length, count);
      const matrix = reference.spec.diagram.panels.find(({ diagram }) => diagram.kind === 'matrix')?.diagram;
      if (matrix) assert.equal(marked(result.element, 'data-tutor-matrix-cell').length, matrix.rows.length * matrix.columns.length);
      verifyFrame(result.element, result.width, result.height);
    }
  });
}

test('K-means renders identical sample positions and colors across both snapshots', () => {
  for (const width of [440, 880]) {
    const result = renderTutorDiagram(record('ml-kmeans-assignment-update').spec, width);
    const children = marked(result.element, 'data-tutor-composition-child');
    const signature = child => marked(child, 'data-tutor-sample-id').map(({ type, props }) => ({
      id: props['data-tutor-sample-id'], type, x: props.x ?? props.cx, y: props.y ?? props.cy, fill: props.fill,
    }));
    assert.deepEqual(signature(children[0]), signature(children[1]));
    assert.equal(marked(result.element, 'data-tutor-plot-point').length, 4, 'each snapshot has two separately marked centers');
  }
});
