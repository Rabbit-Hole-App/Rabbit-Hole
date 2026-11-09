import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { references } from './ml-batch2a-transform-references.js';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramSchema, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { lineHeight, textWidth } from './primitives.js';
import { TEACHING, TEACHING_STYLE } from './teaching-theme.js';

const ids = ['ml-feature-interaction', 'ml-raw-log-distributions'];
const record = id => {
  const found = references.find(reference => reference.id === id);
  assert.ok(found, `${id} must supply a worked reference`);
  return found;
};
const children = element => [element?.props?.children].flat(Infinity).filter(value => value && typeof value === 'object');
const walk = element => [element, ...children(element).flatMap(walk)];
const marked = (element, attribute) => walk(element).filter(node => node.props?.[attribute] !== undefined);
const leaves = diagram => diagram.kind === 'comparison'
  ? diagram.panels.map(panel => panel.diagram) : [diagram.before.diagram, diagram.after.diagram];
const sum = values => values.reduce((total, value) => total + value, 0);

test('the two lesson 08 references survive the public saved-JSON contract', () => {
  assert.deepEqual(references.map(reference => reference.id), ids);
  for (const reference of references) {
    assert.deepEqual(reference.lessons, ['08']);
    assert.ok(reference.prompts.length >= 2 && reference.prompts.every(prompt => prompt.length > 30));
    assert.ok(reference.keywords.length >= 4 && reference.useWhen.length > 40);
    const saved = JSON.stringify(reference.spec);
    assert.ok(saved.length < 16_384);
    assert.deepEqual(parseTutorDiagram(saved), reference.spec);
    assert.deepEqual(parseTutorDiagram(reference.spec), reference.spec);
    assert.ok(tutorDiagramVisibleText(reference.spec).includes(reference.spec.diagram.title));
    assert.ok(describeTutorDiagram(reference.spec).length > reference.spec.diagram.title.length);
  }
});

test('the interaction column preserves both inputs and computes their product for every stable row', () => {
  const diagram = record('ml-feature-interaction').spec.diagram;
  assert.equal(diagram.kind, 'transformation');
  assert.equal(diagram.variant, 'visual');
  assert.equal(diagram.identity.mode, 'preserved');
  const before = diagram.before.diagram, after = diagram.after.diagram;
  assert.deepEqual(before.columns, ['$x_1$', '$x_2$']);
  assert.deepEqual(after.columns.slice(0, 2), before.columns);
  assert.equal(after.columns.length, 3);
  assert.deepEqual(before.rows.map(row => row.cells.map(Number)), [[1, 1], [1, 2], [2, 1], [2, 2]]);
  assert.deepEqual(after.rows.map(row => row.id), before.rows.map(row => row.id));
  assert.equal(new Set(before.rows.map(row => row.id)).size, 4);
  for (const row of before.rows) {
    const output = after.rows.find(candidate => candidate.id === row.id);
    assert.equal(output.heading, row.heading);
    assert.deepEqual(output.cells.slice(0, 2), row.cells);
    const [width, length] = row.cells.map(Number);
    assert.equal(Number(output.cells[2]), width * length);
  }
  assert.deepEqual(after.emphasis.columns, [2], 'the added product is the emphasized column');
});

test('the worked product shows a different width effect at each length', () => {
  const table = record('ml-feature-interaction').spec.diagram.after.diagram;
  const area = (width, length) => Number(table.rows.find(row => Number(row.cells[0]) === width && Number(row.cells[1]) === length).cells[2]);
  const atLengthOne = area(2, 1) - area(1, 1);
  const atLengthTwo = area(2, 2) - area(1, 2);
  assert.equal(atLengthOne, 1);
  assert.equal(atLengthTwo, 2);
  assert.notEqual(atLengthOne, atLengthTwo, 'an interaction changes the effect of one input with the other');
  assert.equal(area(2, 2) - area(1, 2) - area(2, 1) + area(1, 1), 1,
    'the nonzero mixed difference cannot come from a constant plus separate linear input terms');
});

test('raw and log histograms count exactly the paired observations displayed in the record', () => {
  const { spec } = record('ml-raw-log-distributions');
  const diagram = spec.diagram;
  assert.equal(diagram.kind, 'comparison');
  assert.equal(diagram.variant, 'panels');
  assert.equal(diagram.panels.length, 3);
  assert.equal(diagram.sharedAxes, undefined, 'raw and transformed coordinates have different units');
  const [raw, transformed, pairs] = leaves(diagram);
  assert.deepEqual([raw.kind, transformed.kind, pairs.kind], ['histogram', 'histogram', 'matrix']);
  assert.equal(pairs.rows.length, 8);
  assert.equal(new Set(pairs.rows.map(row => row.id)).size, 8);
  const values = pairs.rows.map(row => row.cells.map(Number));
  assert.deepEqual(values.map(row => row[0]), [0, 1, 3, 7, 15, 31, 63, 127]);
  assert.deepEqual(values.map(row => row[1]), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const [x, z] of values) {
    assert.ok(Number.isFinite(x) && x > -1, 'the stated log1p domain is satisfied');
    assert.equal(z, Math.log2(1 + x));
    assert.equal(2 ** z - 1, x, 'every output reverses to the same source observation');
  }
  assert.ok(pairs.caption.includes('$x>-1$'), 'the visible record states the actual transform domain');
  assert.ok(pairs.caption.includes('\\log_2(1+x)'));
  assert.deepEqual(raw.binEdges, [0, 32, 64, 96, 128]);
  assert.deepEqual(transformed.binEdges, [0, 2, 4, 6, 8]);
  for (const [column, histogram] of [raw, transformed].entries()) {
    assert.equal(histogram.measure, 'count');
    assert.equal(histogram.density ?? false, false);
    const edges = histogram.binEdges;
    assert.ok(values.every(row => row[column] >= edges[0] && row[column] <= edges.at(-1)));
    const counts = edges.slice(0, -1).map((left, bin) => values.filter(row => {
      const value = row[column], right = edges[bin + 1];
      return value >= left && (bin === edges.length - 2 ? value <= right : value < right);
    }).length);
    assert.deepEqual(histogram.series[0].values, counts);
    assert.equal(sum(counts), values.length);
    assert.deepEqual(counts, column === 0 ? [6, 1, 0, 1] : [2, 2, 2, 2]);
  }
  const rawGaps = values.slice(1).map((row, i) => row[0] - values[i][0]);
  const logGaps = values.slice(1).map((row, i) => row[1] - values[i][1]);
  assert.deepEqual(rawGaps, [1, 2, 4, 8, 16, 32, 64]);
  assert.deepEqual(logGaps, Array(7).fill(1), 'this toy transform compresses large gaps without asserting normality');
});

test('the reference boundary rejects broken row identities, ragged tables, invalid bins and authored styles', () => {
  for (const change of [
    spec => { spec.diagram.after.diagram.rows[0].id = 'replacement'; },
    spec => { spec.diagram.after.diagram.rows[0].cells.pop(); },
    spec => { spec.diagram.before.diagram.fill = '#ff0000'; },
  ]) {
    const spec = structuredClone(record('ml-feature-interaction').spec);
    change(spec);
    assert.equal(tutorDiagramSchema.safeParse(spec).success, false);
  }
  for (const change of [
    spec => { spec.diagram.panels[0].diagram.series[0].values.pop(); },
    spec => { spec.diagram.panels[0].diagram.series[0].values[0] = -1; },
    spec => { spec.diagram.panels[1].diagram.binEdges[1] = 0; },
    spec => { spec.diagram.sharedAxes = ['x']; },
  ]) {
    const spec = structuredClone(record('ml-raw-log-distributions').spec);
    change(spec);
    assert.equal(tutorDiagramSchema.safeParse(spec).success, false);
  }
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
  if (element.type === 'rect' || element.type === 'foreignObject') {
    within(dx + props.x, dy + props.y);
    within(dx + props.x + props.width, dy + props.y + props.height);
    assert.ok(props.width >= 0 && props.height >= 0);
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
      const size = props.fontSize, length = textWidth(span.props.children, size);
      const left = dx + span.props.x - (props.textAnchor === 'middle' ? length / 2 : props.textAnchor === 'end' ? length : 0);
      const center = dy + span.props.y - size * 0.34;
      within(left, center - lineHeight(size) / 2);
      within(left + length, center + lineHeight(size) / 2);
    }
  }
  for (const attribute of ['fill', 'stroke']) if (props[attribute] && props[attribute] !== 'none') {
    const color = props[attribute].startsWith('var(')
      ? TEACHING_STYLE[props[attribute].match(/^var\(([^,]+)/)[1]] : props[attribute];
    assert.ok(Object.values(TEACHING).includes(color), `unapproved ${attribute}: ${props[attribute]}`);
  }
  children(element).forEach(child => verifyFrame(child, width, height, [dx, dy]));
}

for (const id of ids) {
  test(`${id}: actual SVG remains deterministic, bounded and complete at 320/408/720`, () => {
    const reference = record(id), diagrams = leaves(reference.spec.diagram);
    const saved = JSON.stringify(reference.spec);
    for (const available of [320, 408, 720]) {
      const result = renderTutorDiagram(saved, available);
      const svg = renderToStaticMarkup(result.element);
      assert.ok(Number.isFinite(result.width) && result.width >= available && result.width <= 880);
      assert.ok(Number.isFinite(result.height) && result.height > 0);
      assert.match(svg, /role="img"/);
      assert.match(svg, /class="katex"/);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      assert.equal(svg, renderToStaticMarkup(renderTutorDiagram(reference.spec, available).element));
      assert.equal(JSON.stringify(reference.spec), saved, 'rendering cannot mutate the source data');
      assert.equal(marked(result.element, 'data-tutor-composition-child').length, diagrams.length);
      assert.equal(marked(result.element, 'data-tutor-matrix-cell').length,
        sum(diagrams.filter(diagram => diagram.kind === 'matrix').map(table => table.rows.length * table.columns.length)));
      assert.equal(marked(result.element, 'data-tutor-histogram-bin').length,
        sum(diagrams.filter(diagram => diagram.kind === 'histogram').map(histogram => histogram.series[0].values.length)));
      verifyFrame(result.element, result.width, result.height);
      const renderedPanels = marked(result.element, 'data-tutor-composition-child');
      diagrams.forEach((diagram, index) => {
        if (diagram.kind === 'histogram') {
          assert.deepEqual(marked(renderedPanels[index], 'data-tutor-histogram-bin').map(node => node.props['data-tutor-bin-mass']), diagram.series[0].values);
        }
        if (diagram.kind !== 'matrix') return;
        const nodes = walk(renderedPanels[index]);
        for (const row of diagram.rows) for (const [column, value] of row.cells.entries()) {
          const position = nodes.findIndex(node => node.props?.['data-tutor-matrix-cell'] === `${row.id}:${column}`);
          assert.ok(position >= 0);
          const text = nodes[position + 1];
          assert.equal(text.type, 'text');
          const spans = children(text);
          assert.equal(spans.length, 1, `${row.id}:${column}: ${value} must not split between digits`);
          assert.equal(spans[0].props.children, value);
        }
      });
    }
  });
}
