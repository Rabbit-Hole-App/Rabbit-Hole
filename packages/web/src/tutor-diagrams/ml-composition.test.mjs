import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { createShapes, validate, describe, visibleText } from './ml-composition-spec.js';
import { createLayouts } from './ml-composition-layouts.js';
import { references } from './ml-composition-references.js';
import { tutorDiagramSchema } from './spec.js';
import { layouts as legacy } from './layouts.js';
import { textWidth } from './primitives.js';

const text = max => z.string().min(1).max(max);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
const numeric = z.number().min(-1e9).max(1e9);
const titled = { title: text(90), caption: text(140).optional() };
const axis = z.strictObject({ label: text(36), min: numeric, max: numeric, unit: text(12).optional(), scale: z.enum(['linear', 'log']).optional() });
const point = z.strictObject({ x: numeric, y: numeric, id: id.optional(), label: text(42).optional() });
const leafKinds = tutorDiagramSchema.shape.diagram.options.filter(shape => !['comparison', 'transformation', 'coordinate-plot', 'matrix'].includes(shape.shape.kind.value));
const leafDiagram = z.discriminatedUnion('kind', [...leafKinds,
  z.strictObject({ ...titled, kind: z.literal('coordinate-plot'), x: axis, y: axis,
    series: z.array(z.strictObject({ label: text(42), kind: z.enum(['line', 'scatter', 'step', 'stem']), points: z.array(point).min(1).max(24) })).min(1).max(3) }),
  z.strictObject({ ...titled, kind: z.literal('matrix'), layout: z.literal('teaching').optional(), columns: z.array(text(24)).min(2).max(5),
    rows: z.array(z.strictObject({ id: id.optional(), heading: text(30), cells: z.array(text(40)).min(2).max(5) })).min(2).max(6),
    emphasis: z.strictObject({ rows: z.array(id).optional(), columns: z.array(z.int()).optional(), cells: z.array(z.strictObject({ row: id, column: z.int() })).optional() }).optional(),
    states: z.array(z.strictObject({ row: id, column: z.int(), state: z.enum(['missing', 'changed']) })).optional() }),
]);
const itemList = z.strictObject({ label: text(40), items: z.array(text(70)).min(1).max(5) });
const shapes = createShapes({ z, titled, text, id, numeric, itemList, leafDiagram });
const schema = z.discriminatedUnion('kind', shapes).superRefine((diagram, context) => validate(diagram,
  (path, message) => context.addIssue({ code: 'custom', path, message })));
const plot = (title = 'Observed values', extra = {}) => ({
  kind: 'coordinate-plot', title, x: { label: 'Input', min: 0, max: 4 }, y: { label: 'Output', min: 0, max: 8 },
  series: [{ label: 'Samples', kind: 'scatter', points: [{ id: 'a', label: 'A', x: 1, y: 2 }, { id: 'b', label: 'B', x: 3, y: 6 }] }], ...extra,
});
const comparison = extra => ({ kind: 'comparison', title: 'Two fits', variant: 'panels', panels: [
  { heading: 'First', diagram: plot() }, { heading: 'Second', diagram: plot('Fitted values') },
], ...extra });
const transformation = extra => ({ kind: 'transformation', title: 'Scale values', variant: 'visual',
  operation: 'Divide each value by two', before: { label: 'Before', diagram: plot() },
  after: { label: 'After', diagram: plot('Scaled values', { series: [{ label: 'Samples', kind: 'scatter', points: [{ id: 'b', label: 'B', x: 3, y: 3 }, { id: 'a', label: 'A', x: 1, y: 1 }] }] }) },
  identity: { mode: 'preserved', note: 'The same rows A and B remain present.' }, ...extra,
});
const realLayouts = createLayouts({ legacy, renderChild: (diagram, width, options) => legacy[diagram.kind](diagram, width, options) });
const walk = values => values.flatMap(value => value && typeof value === 'object' ? [value, ...walk([value.props?.children].flat())] : []);
const tags = (scene, type) => walk(scene.elements).filter(element => element.type === type);
const textContent = scene => tags(scene, 'text').flatMap(element => [element.props.children].flat().map(span => span.props.children)).join(' ');
const groups = scene => tags(scene, 'g').filter(element => Object.hasOwn(element.props, 'data-tutor-composition-child'));
const translation = element => element.props.transform.match(/translate\(([-.\d]+) ([-.\d]+)\)/).slice(1).map(Number);

test('visual comparisons bound children and forbid recursive or authored geometry fields', () => {
  assert.equal(schema.safeParse(comparison()).success, true);
  const three = comparison();
  three.panels.push({ heading: 'Third', diagram: plot('Third') });
  assert.equal(schema.safeParse(three).success, true);
  three.panels.push({ heading: 'Fourth', diagram: plot('Fourth') });
  assert.equal(schema.safeParse(three).success, false);
  assert.equal(schema.safeParse(comparison({ panels: [{ heading: 'Only', diagram: plot() }] })).success, false);
  const recursive = comparison();
  recursive.panels[0].diagram = comparison();
  assert.equal(schema.safeParse(recursive).success, false);
  const unsafe = comparison();
  unsafe.panels[0].diagram.svg = '<svg />';
  assert.equal(schema.safeParse(unsafe).success, false);
});

test('shared axes reject mismatched domain, unit, label and scale while allowing unshared axes to differ', () => {
  assert.equal(schema.safeParse(comparison({ sharedAxes: ['x', 'y'] })).success, true);
  for (const [key, value] of [['max', 9], ['label', 'Other output'], ['unit', 'kg'], ['scale', 'log']]) {
    const input = comparison({ sharedAxes: ['y'] });
    input.panels[1].diagram.y[key] = value;
    const result = schema.safeParse(input);
    assert.equal(result.success, false, key);
    assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'panels.1.diagram.y'));
    input.sharedAxes = ['x'];
    assert.equal(schema.safeParse(input).success, true, `unshared ${key}`);
  }
  assert.equal(schema.safeParse(comparison({ sharedAxes: ['x', 'x'] })).success, false);
  const explicitLinear = comparison({ sharedAxes: ['x'] });
  explicitLinear.panels[1].diagram.x.scale = 'linear';
  assert.equal(schema.safeParse(explicitLinear).success, true);
  const nonPlot = comparison({ sharedAxes: ['x'] });
  nonPlot.panels[1].diagram = { kind: 'bar-chart', title: 'Bars', bars: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] };
  assert.equal(schema.safeParse(nonPlot).success, false);
});

test('a right-edge curve label keeps the same shared plot bounds in both panels', () => {
  const d = comparison({ sharedAxes: ['x', 'y'] });
  d.panels[0].diagram.series = [{
    kind: 'line', label: 'First fit', endLabel: true, points: [{ x: 0, y: 0 }, { x: 4, y: 8 }],
  }];
  for (const width of [408, 960]) {
    const scene = realLayouts.comparison(d, width);
    const bounds = tags(scene, 'rect').filter(el => Object.hasOwn(el.props, 'data-tutor-plot-area'))
      .map(({ props: { x, y, width, height } }) => [x, y, width, height]);
    assert.equal(bounds.length, 2);
    assert.deepEqual(bounds[0], bounds[1]);
  }
});

test('legacy shapes stay valid and cannot mix list and visual representations', () => {
  const oldComparison = { kind: 'comparison', title: 'Options', columns: [{ heading: 'A', items: ['One'] }, { heading: 'B', items: ['Two'] }] };
  const oldTransform = { kind: 'transformation', title: 'Convert', operation: 'Parse', before: { label: 'Raw', items: ['01'] }, after: { label: 'Integer', items: ['1'] }, links: [{ from: 0, to: 0 }] };
  for (const input of [oldComparison, oldTransform]) {
    assert.deepEqual(schema.parse(input), input);
    assert.deepEqual(realLayouts[input.kind](input, 320), legacy[input.kind](input, 320));
    assert.equal(describe(input), null);
    assert.equal(visibleText(input), null);
  }
  assert.equal(schema.safeParse({ ...comparison(), columns: oldComparison.columns }).success, false);
  assert.equal(schema.safeParse({ ...comparison(), variant: undefined }).success, false);
  assert.equal(schema.safeParse({ ...transformation(), links: oldTransform.links }).success, false);
  assert.equal(schema.safeParse({ ...oldTransform, variant: 'visual' }).success, false);
});

test('preserved transformations use stable sample IDs, allowing row reorder but rejecting lost or unidentified rows', () => {
  assert.equal(schema.safeParse(transformation()).success, true);
  const missing = transformation();
  delete missing.after.diagram.series[0].points[0].id;
  assert.equal(schema.safeParse(missing).success, false);
  const lost = transformation();
  lost.after.diagram.series[0].points[0].id = 'c';
  assert.equal(schema.safeParse(lost).success, false);
  const withPrediction = transformation();
  withPrediction.before.diagram.series.push({ ...withPrediction.before.diagram.series[0], label: 'Prediction', kind: 'line' });
  assert.equal(schema.safeParse(withPrediction).success, true, 'same sample can appear in observed and prediction series');
  const matrix = { kind: 'matrix', title: 'Rows', layout: 'teaching', columns: ['Feature', 'Value'], rows: [
    { id: 'a', heading: 'A', cells: ['Age', '10'] }, { id: 'b', heading: 'B', cells: ['Age', '20'] },
  ] };
  const input = transformation({ before: { label: 'Before', diagram: matrix }, after: { label: 'After', diagram: { ...matrix, rows: [...matrix.rows].reverse() } } });
  assert.equal(schema.safeParse(input).success, true);
  input.after.diagram.rows = [...input.after.diagram.rows, { id: 'c', heading: 'C', cells: ['Age', '30'] }];
  assert.equal(schema.safeParse(input).success, false);
});

test('mapped transformations reject unknown IDs, duplicate mappings and unmapped output identities', () => {
  const input = transformation({ identity: { mode: 'mapped', note: 'Each output retains its corresponding input.', mappings: [{ from: 'a', to: 'a' }, { from: 'b', to: 'b', note: 'Second sample' }] } });
  assert.equal(schema.safeParse(input).success, true);
  for (const mappings of [[], [{ from: 'missing', to: 'a' }], [{ from: 'a', to: 'unknown' }], [{ from: 'a', to: 'a' }], [{ from: 'a', to: 'a' }, { from: 'a', to: 'a' }, { from: 'b', to: 'b' }]]) {
    assert.equal(schema.safeParse({ ...input, identity: { ...input.identity, mappings } }).success, false);
  }
  assert.equal(schema.safeParse({ ...input, identity: { mode: 'mapped', note: 'No mapping' } }).success, false);
  assert.equal(schema.safeParse({ ...input, identity: { ...input.identity, mode: 'preserved' } }).success, false);
});

test('comparison includes real child marks and titles at native sizes without nested SVG shells', () => {
  const input = comparison({ sharedAxes: ['x', 'y'], panels: [
    { heading: 'First', diagram: plot() },
    { heading: 'Second panel with a heading that wraps onto another line', diagram: plot('Fitted values', { caption: 'Exact fixed sample values.' }) },
  ] });
  const scene = realLayouts.comparison(input, 900);
  assert.equal(scene.width, 900);
  const children = groups(scene);
  assert.equal(children.length, 2);
  assert.equal(translation(children[0])[1], translation(children[1])[1], 'child plots share a common top');
  assert.equal(tags(scene, 'svg').length, 0);
  assert.equal(walk(scene.elements).filter(e => e.props?.['data-tutor-coordinate-point'] !== undefined).length, 4);
  assert.match(textContent(scene), /Observed values/);
  assert.match(textContent(scene), /Fitted values/);
  assert.match(textContent(scene), /Exact fixed sample values/);
  assert.ok(tags(scene, 'text').every(e => e.props.fontSize >= 12));
  assert.ok(!walk(scene.elements).some(e => /scale\(/.test(e.props?.transform ?? '')));
});

test('narrow comparisons stack full real panels instead of creating a multi-chart horizontal strip', () => {
  const input = comparison({ sharedAxes: ['x', 'y'] });
  input.panels.push({ heading: 'Third', diagram: plot('Third fit') });
  const scene = realLayouts.comparison(input, 408);
  const children = groups(scene).map(translation);
  assert.equal(scene.width, 444, '420px native plot plus panel padding; panels stack rather than shrink text');
  assert.equal(children.length, 3);
  assert.equal(children[0][0], children[1][0]);
  assert.equal(children[1][0], children[2][0]);
  assert.ok(children[1][1] > children[0][1] + 250);
  assert.ok(children[2][1] > children[1][1] + 250);
  assert.ok(!walk(scene.elements).some(e => /scale\(/.test(e.props?.transform ?? '')));
});

test('unequal intrinsic child widths and heights stay nonoverlapping inside a bounded full scene', () => {
  const tree = { kind: 'tree', layout: 'binary', title: 'A wide hierarchy', nodes: [
    { id: 'root', label: 'Root' }, { id: 'left', label: 'LeftLongUnbrokenLabel'.repeat(3), parent: 'root', side: 'left' },
    { id: 'right', label: 'RightLongUnbrokenLabel'.repeat(3), parent: 'root', side: 'right' },
  ] };
  const input = comparison({ panels: [{ heading: 'Plot', diagram: plot() }, { heading: 'Tree', diagram: tree }] });
  const scene = realLayouts.comparison(input, 320);
  const children = groups(scene);
  const [first, second] = children.map(translation);
  const plotScene = legacy['coordinate-plot'](input.panels[0].diagram, 320);
  const treeScene = legacy.tree(tree, 320);
  assert.ok(second[1] >= first[1] + plotScene.height + 12);
  assert.ok(scene.width >= second[0] + treeScene.width);
  assert.ok(scene.height >= second[1] + treeScene.height);
  assert.ok(scene.height >= first[1] + plotScene.height);
  assert.equal(tags(scene, 'svg').length, 0);
});

test('visual transformations render explicit identity and mapping notes beneath their real children', () => {
  const input = transformation({ identity: { mode: 'mapped', note: 'Rows retain stable identities.', mappings: [
    { from: 'a', to: 'a', note: 'First sample remains first.' }, { from: 'b', to: 'b', note: 'Second sample may move.' },
  ] } });
  const scene = realLayouts.transformation(input, 320);
  assert.equal(groups(scene).length, 2);
  assert.match(textContent(scene), /Divide each value by two/);
  assert.match(textContent(scene), /Rows retain stable identities/);
  assert.match(textContent(scene), /a → a/);
  assert.match(textContent(scene), /First sample remains first/);
  assert.ok(scene.height > Math.max(...groups(scene).map(group => translation(group)[1] + 300)));
  const lastLabel = tags(scene, 'text').at(-1);
  assert.ok([lastLabel.props.children].flat().every(span => span.props.y < scene.height));
  const own = visibleText(input).filter(Boolean);
  for (const value of [input.operation, input.identity.note, 'a', 'b', input.identity.mappings[0].note]) assert.ok(own.includes(value), value);
  assert.match(describe(input).join('\n'), /a → a/);
});

test('long operation and identity notes wrap inside the composed scene without shrinking labels', () => {
  const input = transformation({ operation: 'Apply the recorded deterministic operation to every stable sample identity', identity: { mode: 'preserved', note: 'Every source row keeps its identity while the feature values change according to the stated operation.' } });
  const scene = realLayouts.transformation(input, 320);
  for (const element of scene.elements.filter(element => element.type === 'text')) {
    for (const span of [element.props.children].flat()) {
      const width = textWidth(span.props.children, element.props.fontSize);
      const left = element.props.textAnchor === 'start' ? span.props.x : span.props.x - width / 2;
      assert.ok(left >= 0 && left + width <= scene.width, span.props.children);
      assert.ok(span.props.y > 0 && span.props.y < scene.height);
    }
  }
});

test('a child title reused as its heading is rendered and counted once', () => {
  const input = comparison();
  input.panels[0].heading = input.panels[0].diagram.title;
  const scene = realLayouts.comparison(input, 408);
  assert.equal(textContent(scene).split('Observed values').length - 1, 1);
  const counted = [...visibleText(input), ...input.panels.map(panel => panel.diagram.title)];
  assert.equal(counted.filter(text => text === 'Observed values').length, 1);
});

test('composition references are bounded executable examples covering the approved teaching families', () => {
  const ids = new Set();
  assert.ok(references.length >= 9);
  for (const reference of references) {
    assert.ok(!ids.has(reference.id));
    ids.add(reference.id);
    assert.ok(reference.lessons.length && reference.prompts.length && reference.keywords.length && reference.useWhen);
    const diagram = schema.parse(reference.spec.diagram);
    const scene = realLayouts[diagram.kind](diagram, 320);
    assert.ok(scene.width > 0 && scene.height > 0 && scene.elements.length > 0, reference.id);
    const markup = renderToStaticMarkup(h('svg', { width: scene.width, height: scene.height }, ...scene.elements));
    assert.ok(!/NaN|Infinity|<svg[^>]*<svg/.test(markup), reference.id);
    assert.ok(JSON.stringify(reference.spec).length < 16384, reference.id);
  }
  for (const lesson of ['02', '06', '07', '08', '10', '11', '15', '20']) assert.ok(references.some(reference => reference.lessons.includes(lesson)), lesson);
});
