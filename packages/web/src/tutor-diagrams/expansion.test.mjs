import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramJsonSchema } from './spec.js';

const versioned = diagram => ({ version: 1, diagram: { title: diagram.kind, ...diagram } });
const samples = {
  figure: { kind: 'figure', figure: 'cell', callouts: [{ anchor: 'nucleus', label: 'Nucleus' }] },
  tree: { kind: 'tree', nodes: [{ id: 'root', label: 'Root' }, { id: 'branch', label: 'Branch', parent: 'root' }] },
  relationship: {
    kind: 'relationship', nodes: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
    edges: [{ from: 'one', to: 'two', label: 'affects' }, { from: 'two', to: 'one', label: 'feeds back' }],
  },
  transformation: {
    kind: 'transformation', before: { label: 'Before', items: ['2 × 3', '7'] }, after: { label: 'After', items: ['6', '7'] },
    operation: 'Simplify', links: [{ from: 0, to: 0, label: 'Multiply' }, { from: 1, to: 1 }],
  },
  argument: {
    kind: 'argument', claim: 'The pilot should continue', support: [{ label: 'More students completed the task', source: 'Pilot report, p. 2' }],
    objections: [{ label: 'The sample was small' }], conclusion: 'Continue the pilot and collect more evidence',
  },
  'number-line': {
    kind: 'number-line', min: -5, max: 5, markers: [{ value: 0, label: 'Origin' }],
    intervals: [{ from: -2, to: 3, startClosed: false, endClosed: true, label: 'Allowed range' }],
  },
  'coordinate-plot': {
    kind: 'coordinate-plot', x: { label: 'Time', min: 0, max: 3, unit: 's' }, y: { label: 'Distance', min: 0, max: 6, unit: 'm' },
    series: [{ label: 'Recorded points', kind: 'line', points: [{ x: 0, y: 0 }, { x: 3, y: 6 }] }],
  },
  'bar-chart': { kind: 'bar-chart', unit: 'points', bars: [{ label: 'Morning', value: -1 }, { label: 'Afternoon', value: 2 }] },
  't-account': { kind: 't-account', account: 'Cash', unit: 'USD', debits: [{ label: 'Deposit', amount: 0.3 }], credits: [{ label: 'Fee', amount: 0.1 }] },
  waterfall: { kind: 'waterfall', opening: 0.1, unit: 'USD', changes: [{ label: 'Deposit', amount: 0.2 }, { label: 'Fee', amount: -0.1 }] },
};
const edit = (kind, transform) => {
  const value = structuredClone(samples[kind]);
  transform(value);
  return versioned(value);
};

test('all ten new diagram kinds are version-1 documents and provider-schema variants', () => {
  const kinds = (tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf)
    .map(shape => shape.properties.kind.const);
  for (const [kind, diagram] of Object.entries(samples)) {
    assert.ok(kinds.includes(kind), kind);
    const value = versioned(diagram);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(value)), value);
    assert.ok(describeTutorDiagram(value).length > kind.length + 5);
  }
});

test('schematic callouts use known anchors and forces use explicit, unique directions', () => {
  assert.throws(() => parseTutorDiagram(edit('figure', d => { d.callouts[0].anchor = 'engine'; })), /anchor/i);
  assert.throws(() => parseTutorDiagram(edit('figure', d => { d.callouts[0].x = 12; })));
  const force = versioned({
    kind: 'figure', figure: 'free-body', unit: 'N', callouts: [{ anchor: 'up', label: 'Normal force' }],
    vectors: [{ direction: 'up', magnitude: 5, label: 'Normal' }, { direction: 'down', magnitude: 5, label: 'Weight' }],
  });
  assert.match(describeTutorDiagram(parseTutorDiagram(force)), /Normal.*5 N.*up/);
  assert.throws(() => parseTutorDiagram({ ...force, diagram: { ...force.diagram, vectors: [force.diagram.vectors[1]] } }), /anchor|vector/i);
  assert.throws(() => parseTutorDiagram({ ...force, diagram: { ...force.diagram, vectors: [force.diagram.vectors[0], force.diagram.vectors[0]] } }), /direction/i);
});

test('rejects disconnected tree cycles, missing relationship endpoints and out-of-range mappings', () => {
  assert.throws(() => parseTutorDiagram(edit('tree', d => {
    d.nodes[1].parent = 'orphan';
    d.nodes.push({ id: 'orphan', label: 'Orphan', parent: 'branch' });
  })), /cycle|reach/i);
  assert.throws(() => parseTutorDiagram(edit('relationship', d => { d.edges[0].to = 'missing'; })), /node|endpoint/i);
  assert.throws(() => parseTutorDiagram(edit('transformation', d => { d.links[0].to = 9; })), /index|item/i);
});

test('numeric diagrams reject reversed bounds, invisible coordinates and nonfinite values', () => {
  assert.throws(() => parseTutorDiagram(edit('number-line', d => { d.max = d.min; })), /range|minimum/i);
  assert.throws(() => parseTutorDiagram(edit('number-line', d => { d.intervals[0].from = -6; })), /range|bound/i);
  assert.throws(() => parseTutorDiagram(edit('coordinate-plot', d => { d.series[0].points[0].y = 7; })), /range|bound/i);
  assert.throws(() => parseTutorDiagram(edit('bar-chart', d => { d.bars[0].value = Infinity; })));
});

test('accounting refuses sub-cent amounts and describes exact totals', () => {
  assert.throws(() => parseTutorDiagram(edit('t-account', d => { d.debits[0].amount = 0.001; })), /decimal/i);
  assert.throws(() => parseTutorDiagram(edit('t-account', d => { d.debits = []; d.credits = []; })), /posting/i);
  assert.match(describeTutorDiagram(parseTutorDiagram(versioned(samples['t-account']))), /Debit balance: 0\.20 USD/i);
  assert.match(describeTutorDiagram(parseTutorDiagram(versioned(samples.waterfall))), /Closing: 0\.20 USD/i);
});
