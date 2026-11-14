import assert from 'node:assert/strict';
import test from 'node:test';
import { lintDiagramContent } from './content-contract.js';
import { parseTutorDiagram } from './spec.js';

const lint = diagram => lintDiagramContent(parseTutorDiagram({ version: 1, diagram }));
const locations = issues => issues.map(({ rule, path }) => [rule, path]);

test('flow labels start with actions and edges communicate their purpose', () => {
  const issues = lint({ kind: 'flow', title: 'Record validation', nodes: [
    { id: 'input_data', label: 'Input data', role: 'process' },
    { id: 'valid', label: 'Is the record valid?', role: 'decision' },
    { id: 'save', label: 'Save the record', role: 'process' },
    { id: 'good', label: 'Publish the result', role: 'outcome' },
    { id: 'bad', label: 'Record rejected', role: 'outcome' },
  ], edges: [
    { from: 'input_data', to: 'valid', label: ' Then. ' },
    { from: 'valid', to: 'save', label: 'Yes' },
    { from: 'save', to: 'good', label: 'No' },
    { from: 'valid', to: 'bad', label: 'No' },
  ] });
  assert.deepEqual(locations(issues), [
    ['flow-label-verb-first', ['diagram', 'nodes', 0, 'label']],
    ['flow-label-verb-first', ['diagram', 'nodes', 4, 'label']],
    ['placeholder-edge-label', ['diagram', 'edges', 0, 'label']],
    ['placeholder-edge-label', ['diagram', 'edges', 2, 'label']],
  ]);
  assert.ok(issues.every(issue => issue.message.trim().length > 0));
});

const componentStack = steps => ({ kind: 'block-stack', title: 'Decoder components', blocks: [
  { id: 'attention', label: 'Attention', diagram: { kind: 'flow', steps } },
  { id: 'ffn', label: 'Feed-forward network' },
] });

test('role-tagged inset steps name components and legacy inset steps describe actions', () => {
  assert.deepEqual(lint(componentStack([
    { label: 'Pre-RMSNorm 1', role: 'norm' },
    { label: 'Sliding-window + GQA attention (5:1 local:global)', role: 'attention' },
    { label: 'Query projection', role: 'attention' },
    'Pass the output',
  ])), []);
  const issues = lint(componentStack([
    { label: 'Apply RMSNorm', role: 'norm' },
    'Attention output',
  ]));
  assert.deepEqual(locations(issues), [
    ['block-component-name', ['diagram', 'blocks', 0, 'diagram', 'steps', 0, 'label']],
    ['flow-label-verb-first', ['diagram', 'blocks', 0, 'diagram', 'steps', 1]],
  ]);
});

test('component name joins still require delimiters around arithmetic', () => {
  const issues = lint(componentStack([
    { label: 'GQA + FFN and x + y', role: 'attention' },
    { label: 'Pre-RMSNorm 1 + 2', role: 'norm' },
    { label: 'Gated GELU FFN $x+y$', role: 'feedforward' },
    { label: 'Projection $x$ + $y$', role: 'attention' },
    'Use sliding-window + GQA attention',
  ]));
  assert.deepEqual(locations(issues), [
    ['math-delimiters', ['diagram', 'blocks', 0, 'diagram', 'steps', 0, 'label']],
    ['math-delimiters', ['diagram', 'blocks', 0, 'diagram', 'steps', 1, 'label']],
    ['math-delimiters', ['diagram', 'blocks', 0, 'diagram', 'steps', 3, 'label']],
    ['math-delimiters', ['diagram', 'blocks', 0, 'diagram', 'steps', 4]],
  ]);
});

test('sequence messages are checked without requiring verbs in actor labels', () => {
  const issues = lint({ kind: 'sequence', title: 'Read a record', actors: [
    { id: 'client', label: 'Client' }, { id: 'cache', label: 'Cache' },
  ], messages: [
    { from: 'client', to: 'cache', label: 'Get key' },
    { from: 'cache', to: 'client', label: 'Miss' },
    { from: 'client', to: 'cache', label: 'Edge 3' },
  ] });
  assert.deepEqual(locations(issues), [['placeholder-edge-label', ['diagram', 'messages', 2, 'label']]]);
});

test('relationship labels distinguish a stated action from a generic connection', () => {
  const issues = lint({ kind: 'relationship', title: 'Send readings', nodes: [
    { id: 'sensor', label: 'Sensor' }, { id: 'monitor', label: 'Monitor' },
  ], edges: [
    { from: 'sensor', to: 'monitor', label: 'Connects to' },
    { from: 'monitor', to: 'sensor', label: 'Requests readings' },
  ] });
  assert.deepEqual(locations(issues), [['placeholder-edge-label', ['diagram', 'edges', 0, 'label']]]);
});

test('technical and everyday action verbs work at the start of a flow label', () => {
  assert.deepEqual(lint({ kind: 'flow', title: 'Prepare a sample', nodes: [
    { id: 'first', label: 'Rinse the sample', role: 'process' },
    { id: 'second', label: 'Differentiate the signal', role: 'process' },
    { id: 'last', label: 'Process data', role: 'outcome' },
  ], edges: [{ from: 'first', to: 'second' }, { from: 'second', to: 'last' }] }), []);
});

test('repeated node labels are reported inside their own visual leaf', () => {
  const tree = { kind: 'tree', title: 'Classes', nodes: [
    { id: 'root', label: 'Is the score high?' },
    { id: 'a', label: 'Class A', parent: 'root', edgeLabel: 'Yes' },
    { id: 'b', label: 'Class B', parent: 'root', edgeLabel: 'No' },
  ] };
  const issues = lint({ kind: 'comparison', variant: 'panels', title: 'Classify two cases', panels: [
    { heading: 'First model', diagram: tree },
    { heading: 'Second model', diagram: { ...tree, nodes: [tree.nodes[0], tree.nodes[1], { ...tree.nodes[2], label: ' Class   A ' }] } },
  ] });
  assert.deepEqual(locations(issues), [['duplicate-node-label', ['diagram', 'panels', 1, 'diagram', 'nodes', 2, 'label']]]);
});

test('visible formulas in a nested plot need single-dollar delimiters', () => {
  const plot = { kind: 'coordinate-plot', title: 'Compare scores', x: axis('Run', 1, 2), y: axis('Score', 0, 10), series: [{
    label: 'Predictions', kind: 'line', points: [
      { id: 'before_run', x: 1, y: 3, label: '$y$ = 3' }, { id: 'next_run', x: 2, y: 5, label: '$y = 5$' },
    ],
  }] };
  const issues = lint({ kind: 'transformation', variant: 'visual', title: 'Adjust scores', operation: 'Apply x_i + 1',
    identity: { mode: 'preserved', note: 'Sample IDs are preserved' }, before: { label: 'Before', diagram: plot },
    after: { label: 'After', diagram: { ...plot, caption: String.raw`Use \(\frac{x}{2}\) or $$x^2$$.`,
      series: [{ ...plot.series[0], points: [{ ...plot.series[0].points[0], label: 'Half (1/2)' }, plot.series[0].points[1]] }],
    } },
  });
  assert.deepEqual(locations(issues), [
    ['math-delimiters', ['diagram', 'before', 'diagram', 'series', 0, 'points', 0, 'label']],
    ['math-delimiters', ['diagram', 'after', 'diagram', 'caption']],
    ['math-delimiters', ['diagram', 'after', 'diagram', 'series', 0, 'points', 0, 'label']],
    ['math-delimiters', ['diagram', 'operation']],
  ]);
});

test('ordinary dates, percentages, signed values, IDs and currency are clean', () => {
  assert.deepEqual(lint({ kind: 'timeline', title: 'Budget for 2025–2026', caption: 'Set aside $5 or $10 each week.', events: [
    { time: '2025-01-01 to 2025-03-31', label: 'First period', detail: 'Spend 5% less.' },
    { time: '04/01/2025–06/30/2025', label: 'Second period', detail: 'Change: −3 points.' },
    { time: '7/1', label: 'Third period · midyear', detail: 'Raise the cap by 3–5 dollars.' },
    { time: '7/2 through 9/8', label: 'Fourth period', detail: 'Change: +3 points.' },
  ] }), []);
  assert.deepEqual(lint({ kind: 'sample-set', title: 'Two samples', samples: [
    { id: 'x_i', label: 'First', class: 'Class −1', weight: 1 }, { id: 'x_j', label: 'Second', class: 'Class +1', weight: 2 },
  ], groups: [{ id: 'group_1', label: 'Both samples', members: ['x_i', 'x_j'] }] }), []);
});

test('a division operator between separate math tokens is outside their delimiters', () => {
  const issues = lint({ kind: 'sequence', title: 'Calculate a ratio', actors: [
    { id: 'client', label: 'Client' }, { id: 'server', label: 'Server' },
  ], messages: [{ from: 'client', to: 'server', label: 'Calculate $x$/$y$' }] });
  assert.deepEqual(locations(issues), [['math-delimiters', ['diagram', 'messages', 0, 'label']]]);
});

const axis = (label, min, max) => ({ label, min, max });
const plot = (x, y, options = {}) => ({ kind: 'coordinate-plot', title: 'Measure change',
  x: axis('Input', 0, 5), y: axis('Result', 0, 10), series: [{ label: 'Samples', kind: 'scatter', points: [{ x, y }] }], ...options,
});
const bars = (first, second, unit = 'samples') => ({ kind: 'bar-chart', title: 'Count classes', unit,
  bars: [{ label: 'Class A', value: first }, { label: 'Class B', value: second }],
});
const compare = (left, right) => lint({ kind: 'comparison', variant: 'panels', title: 'Compare results', panels: [
  { heading: 'Reference', diagram: left }, { heading: 'Current', diagram: right },
] });

test('two panels that can share a drawing report the comparison location', () => {
  const expected = [['redundant-comparison', ['diagram', 'panels']]];
  assert.deepEqual(locations(compare(plot(1, 2), plot(3, 4))), expected);
  assert.deepEqual(locations(compare(bars(2, 3), bars(4, 1))), expected);
  assert.deepEqual(locations(compare(bars(2, 3), { ...bars(2, 3), title: 'Same counts' })), expected);
  const line = (start, end) => plot(0, 0, { series: [{ label: 'Line', kind: 'line', points: [
    { x: start, y: 1 }, { x: end, y: 2 },
  ] }] });
  assert.deepEqual(locations(compare(line(0, 1), line(2, 3))), expected);
});

test('comparison panels with different axes, marks, or units remain separate', () => {
  assert.deepEqual(compare(plot(1, 2), plot(3, 4, { y: axis('Result', 0, 20) })), []);
  assert.deepEqual(compare(plot(1, 2), plot(3, 4, { annotations: [{ kind: 'point', label: 'Threshold', x: 2, y: 3 }] })), []);
  assert.deepEqual(compare(plot(1, 2), plot(3, 4, { caption: 'This panel explains a separate condition.' })), []);
  assert.deepEqual(compare(bars(2, 3), bars(4, 1, 'hours')), []);
  const overlapping = plot(1, 2, { series: [{ label: 'Other samples', kind: 'scatter', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] });
  assert.deepEqual(compare(plot(1, 2), overlapping), []);
});


// PL-1: a point is labelled to name what it is; its own coordinates are never a label, and a plot has at most six labelled points.
const pointPlot = (labels, kind = 'scatter') => ({ kind: 'coordinate-plot', title: 'Samples', x: { label: 'X', min: 0, max: 20 }, y: { label: 'Y', min: 0, max: 40 },
  series: [{ label: 'Samples', kind, points: labels.map((label, i) => ({ x: i + 1, y: 2 * i + 0.5, ...(label === undefined ? {} : { label }) })) }] });
test('a point label that restates the point is flagged, a name is not', () => {
  assert.deepEqual(locations(lint(pointPlot(['1', '2.5', '(3, 4.5)', 'Samples: 4 6.5', 'Peak', undefined]))).filter(([rule]) => rule.startsWith('plot-point')), [
    ['plot-point-label-coordinates', ['diagram', 'series', 0, 'points', 0, 'label']],
    ['plot-point-label-coordinates', ['diagram', 'series', 0, 'points', 1, 'label']],
    ['plot-point-label-coordinates', ['diagram', 'series', 0, 'points', 2, 'label']],
    ['plot-point-label-coordinates', ['diagram', 'series', 0, 'points', 3, 'label']],
  ]);
});
test('more than six labelled points on one plot are flagged once', () => {
  assert.deepEqual(locations(lint(pointPlot(['A1', 'B2', 'C3', 'D4', 'E5', 'F6']))), []);
  assert.deepEqual(locations(lint(pointPlot(['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7']))), [['plot-point-label-count', ['diagram', 'series']]]);
});
test('samples.showValues is flagged once at the samples and counts toward the cap', () => {
  const plot = n => ({ kind: 'coordinate-plot', title: 'Fit', x: { label: 'X', min: 0, max: 30 }, y: { label: 'Y', min: 0, max: 30 }, series: [{ label: 'Fit', kind: 'scatter', samples: { x: { start: 0, step: 1 }, y: Array.from({ length: n }, (_, i) => i + 1), showValues: true } }] });
  assert.deepEqual(locations(lint(plot(3))), [['plot-point-label-coordinates', ['diagram', 'series', 0, 'samples', 'showValues']]]);
  assert.deepEqual(locations(lint(plot(8))), [['plot-point-label-coordinates', ['diagram', 'series', 0, 'samples', 'showValues']], ['plot-point-label-count', ['diagram', 'series']]]);
});
