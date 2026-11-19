import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTutorDiagram, parseTutorDiagram, tutorDiagramJsonSchema, tutorDiagramSchema, tutorDiagramVisibleText } from './spec.js';

const flow = {
  version: 1,
  diagram: {
    kind: 'flow',
    title: 'Cache lookup',
    caption: 'Follow the route from the lookup to the response.',
    nodes: [
      { id: 'lookup', label: 'Read cache', role: 'process' },
      { id: 'check', label: 'Value present?', role: 'decision' },
      { id: 'db', label: 'Read database', role: 'process' },
      { id: 'answer', label: 'Return value', role: 'outcome' },
    ],
    edges: [
      { from: 'lookup', to: 'check' },
      { from: 'check', to: 'answer', label: 'Hit' },
      { from: 'check', to: 'db', label: 'Miss' },
      { from: 'db', to: 'answer' },
    ],
  },
};
const other = [
  { kind: 'comparison', title: 'Reads', columns: [{ heading: 'Cache', items: ['Fast'] }, { heading: 'Database', items: ['Authoritative'] }] },
  { kind: 'timeline', title: 'Rollout', events: [{ time: 'Monday', label: 'Prepare' }, { time: 'Friday', label: 'Release', detail: 'Measure traffic' }] },
  { kind: 'sequence', title: 'Request', actors: [{ id: 'c', label: 'Client' }, { id: 's', label: 'Server' }], messages: [{ from: 'c', to: 's', label: 'Request' }] },
  { kind: 'matrix', title: 'Table', columns: ['Cold', 'Warm'], rows: [{ heading: 'Latency', cells: ['High', 'Low'] }, { heading: 'Lookup', cells: ['Miss', 'Hit'] }] },
  { kind: 'layers', title: 'Stack', layers: [{ label: 'Web' }, { label: 'Store', detail: 'Persistent' }] },
  { kind: 'cycle', title: 'Iteration', steps: ['Observe', 'Adjust'] },
];

const versioned = diagram => ({ version: 1, diagram });
const changeFlow = change => {
  const { diagram } = structuredClone(flow);
  change(diagram);
  return versioned(diagram);
};
const binaryTree = versioned({
  kind: 'tree', layout: 'binary', title: 'Binary search tree', caption: 'Compare each child with its parent.',
  nodes: [
    { id: 'root', label: '8' },
    { id: 'high', label: '12', parent: 'root', side: 'right' },
    { id: 'low', label: '4', parent: 'root', side: 'left' },
    { id: 'leaf', label: '14', parent: 'high', side: 'right' },
  ],
});
const changeBinaryTree = change => {
  const { diagram } = structuredClone(binaryTree);
  change(diagram);
  return versioned(diagram);
};

test('accepts each versioned kind, as an object or JSON string', () => {
  for (const input of [flow, ...other.map(versioned)]) {
    assert.deepEqual(parseTutorDiagram(input), input);
    assert.deepEqual(parseTutorDiagram(JSON.stringify(input)), input);
  }
  assert.equal(tutorDiagramSchema.safeParse(flow).success, true);
});

test('rejects invalid JSON, oversized JSON, unknown versions and unexpected fields', () => {
  assert.throws(() => parseTutorDiagram('{'), /JSON/i);
  assert.throws(() => parseTutorDiagram(' '.repeat(70_000) + JSON.stringify(flow)), /too long/i);
  assert.throws(() => parseTutorDiagram({ ...flow, version: 2 }));
  assert.throws(() => parseTutorDiagram({ ...flow, style: 'fill:red' }));
  assert.throws(() => parseTutorDiagram(versioned({ ...flow.diagram, kind: 'diagram' })));
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.nodes[0].svg = '<script/>'; })));
});

test('requires bounded, nonblank XML-compatible text, while markup-like labels can remain plain text', () => {
  for (const title of ['', ' \u00a0 ', 'x'.repeat(91), 'one\u0000two', 'x\ud800']) {
    assert.throws(() => parseTutorDiagram(changeFlow(d => { d.title = title; })));
  }
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges[1].label = 'x'.repeat(31); })));
  const input = changeFlow(d => { d.nodes[0].label = '<script>& use "cache"'; });
  assert.deepEqual(parseTutorDiagram(input), input);
});

test('rejects duplicate IDs, repeated edges and unknown endpoints', () => {
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.nodes[1].id = 'lookup'; })), /unique/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges.push({ ...d.edges[1], label: 'Another hit' }); })), /repeat/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges[2].to = 'missing'; })), /unknown/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges[0].to = 'lookup'; })), /itself/i);
});

test('requires explicit, labeled decisions and terminal outcomes', () => {
  assert.throws(() => parseTutorDiagram(changeFlow(d => { delete d.edges[1].label; })), /labeled/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges[2].label = ' hit '; })), /distinct/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges.splice(1, 1); })), /two or three/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges.push({ from: 'lookup', to: 'db' }); })), /process.*one/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => { d.edges.push({ from: 'answer', to: 'db' }); })), /outcome.*outgoing/i);
});

test('requires a single-root connected DAG and allows branches that merge', () => {
  assert.deepEqual(parseTutorDiagram(flow), flow);
  assert.throws(() => parseTutorDiagram(changeFlow(d => {
    d.nodes.push({ id: 'extra', label: 'Another root', role: 'process' });
    d.edges.push({ from: 'extra', to: 'answer' });
  })), /one root/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => {
    d.nodes[3].role = 'process';
    d.edges.push({ from: 'answer', to: 'db' });
  })), /cycle/i);
  assert.throws(() => parseTutorDiagram(changeFlow(d => {
    d.nodes.push({ id: 'x', label: 'X', role: 'process' }, { id: 'y', label: 'Y', role: 'process' });
    d.edges.push({ from: 'x', to: 'y' }, { from: 'y', to: 'x' });
  })), /cycle|reach/i);
});

test('sequence self-messages can appear first, in the middle, or last', () => {
  const sequence = structuredClone(other.find(d => d.kind === 'sequence'));
  const [request] = sequence.messages;
  const sign = { from: 'c', to: 'c', label: 'Sign request' };
  const verify = { from: 's', to: 's', label: 'Verify request' };
  const reply = { from: 's', to: 'c', label: 'Send reply' };
  for (const messages of [[sign, request], [request, verify, reply], [request, verify], [sign, request, verify]]) {
    const valid = versioned({ ...sequence, messages });
    assert.deepEqual(parseTutorDiagram(valid), valid);
  }
});

test('a sequence requires an ordinary message and rejects consecutive self-messages', () => {
  const sequence = structuredClone(other.find(d => d.kind === 'sequence'));
  const [request] = sequence.messages;
  const sign = { from: 'c', to: 'c', label: 'Sign request' };
  const verify = { from: 's', to: 's', label: 'Verify request' };
  const audit = { from: 's', to: 's', label: 'Record verification' };
  for (const messages of [[request, verify, audit], [sign, verify, request]]) {
    assert.throws(() => parseTutorDiagram(versioned({ ...sequence, messages })), /consecutive self-messages/i);
  }
  assert.throws(() => parseTutorDiagram(versioned({ ...sequence, messages: [sign] })), /message between different actors/i);
});

test('rejects missing sequence actors, duplicate actor IDs, and ragged matrices', () => {
  const sequence = structuredClone(other.find(d => d.kind === 'sequence'));
  assert.throws(() => parseTutorDiagram(versioned({ ...sequence, messages: [{ from: 'c', to: 'other', label: 'Unknown' }] })), /unknown/i);
  assert.throws(() => parseTutorDiagram(versioned({ ...sequence, actors: [sequence.actors[0], sequence.actors[0]] })), /unique/i);
  const matrix = structuredClone(other.find(d => d.kind === 'matrix'));
  matrix.rows[0].cells.pop();
  assert.throws(() => parseTutorDiagram(versioned(matrix)), /cells.*columns/i);
});

// MAT-E: a column whose every cell is empty or a dash.
test('matrix: a column with no value in any row is rejected; the R2 bench fraud card (values one column left) fails on Proportion', () => {
  const fraud = { kind: 'matrix', title: 'Class Imbalance in Transactions', caption: 'Legitimate transactions vastly outnumber fraudulent ones in typical datasets.', columns: ['Class', 'Count', 'Proportion'],
    rows: [{ heading: 'Legitimate', cells: ['999,000', '99.9%', '\u2014'] }, { heading: 'Fraudulent', cells: ['1,000', '0.1%', '\u2014'] }] };
  assert.throws(() => parseTutorDiagram(versioned(fraud)), /Proportion\\" has no value in any row/);
  const fixed = structuredClone(fraud); fixed.columns = ['Count', 'Proportion', 'Note']; fixed.rows[0].cells = ['999,000', '99.9%', 'Majority']; fixed.rows[1].cells = ['1,000', '0.1%', 'Rare'];
  assert.doesNotThrow(() => parseTutorDiagram(versioned(fixed)));
  for (const blank of ['', ' ', '-', '\u2013', '\u2212', '--']) {
    const m = structuredClone(fraud); m.rows.forEach(r => { r.cells[2] = blank; });
    assert.throws(() => parseTutorDiagram(versioned(m)), /no value in any row/, JSON.stringify(blank));
  }
  const some = structuredClone(fraud); some.rows[1].cells[2] = '0.1%';
  assert.doesNotThrow(() => parseTutorDiagram(versioned(some)), 'one value in the column is enough');
  const na = structuredClone(fraud); na.rows.forEach(r => { r.cells[2] = 'n/a'; });
  assert.doesNotThrow(() => parseTutorDiagram(versioned(na)), 'n/a is a value');
});

test('accepts an explicit binary tree with a lone right child', () => {
  assert.deepEqual(parseTutorDiagram(JSON.stringify(binaryTree)), binaryTree);
});

test('still accepts legacy hierarchies with more than two children', () => {
  const legacy = versioned({
    kind: 'tree', title: 'Documents', nodes: [
      { id: 'folder', label: 'Folder' },
      { id: 'notes', label: 'Notes', parent: 'folder' },
      { id: 'tasks', label: 'Tasks', parent: 'folder' },
      { id: 'drafts', label: 'Drafts', parent: 'folder' },
    ],
  });
  assert.deepEqual(parseTutorDiagram(legacy), legacy);
  assert.match(describeTutorDiagram(legacy), /Folder → Drafts/);
});

test('requires sides only on non-root nodes in a binary layout', () => {
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[0].side = 'left'; })), /root.*side/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { delete d.nodes[3].side; })), /child.*side/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { delete d.layout; })), /side.*binary/i);
});

test('rejects two binary children on the same side of a parent', () => {
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[2].side = 'right'; })), /one.*right.*child/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[1].side = 'left'; })), /one.*left.*child/i);
});

test('keeps tree topology checks for binary layouts', () => {
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[3].id = 'low'; })), /unique/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { delete d.nodes[3].parent; })), /one root/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[3].parent = 'missing'; })), /unknown/i);
  assert.throws(() => parseTutorDiagram(changeBinaryTree(d => { d.nodes[1].parent = 'leaf'; })), /cycle/i);
});

test('exports a strict, serializable JSON Schema and keeps the original seven kinds', () => {
  const schema = JSON.parse(JSON.stringify(tutorDiagramJsonSchema));
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['version', 'diagram']);
  assert.equal(schema.properties.version.const, 1);
  const shapes = schema.properties.diagram.anyOf ?? schema.properties.diagram.oneOf;
  const kinds = new Set(shapes.map(shape => shape.properties.kind.const));
  for (const kind of ['flow', ...other.map(d => d.kind)]) assert.ok(kinds.has(kind), kind);
  assert.ok(shapes.every(shape => shape.additionalProperties === false));
});

test('exports the optional binary layout and child sides in the provider tree schema', () => {
  const shapes = tutorDiagramJsonSchema.properties.diagram;
  const tree = (shapes.anyOf ?? shapes.oneOf).find(shape => shape.properties.kind.const === 'tree');
  assert.deepEqual(tree.properties.layout.enum, ['binary', 'hierarchy', 'dendrogram']);
  assert.ok(!tree.required.includes('layout'));
  const node = tree.properties.nodes.items;
  assert.deepEqual(node.properties.side.enum, ['left', 'right']);
  assert.ok(!node.required.includes('side'));
});

test('describes binary tree positions without adding to the visible words', () => {
  const spec = parseTutorDiagram(binaryTree);
  const description = describeTutorDiagram(spec);
  assert.match(description, /Root: 8/);
  assert.match(description, /4.*left child of 8/);
  assert.match(description, /12.*right child of 8/);
  assert.match(description, /14.*right child of 12/);
  assert.deepEqual(tutorDiagramVisibleText(spec), ['Binary search tree', 'Compare each child with its parent.', '8', '12', '4', '14']);
});

test('descriptions include titles, captions, all visible labels and directed relationships', () => {
  const description = describeTutorDiagram(flow);
  for (const value of [flow.diagram.title, flow.diagram.caption, ...flow.diagram.nodes.map(n => n.label), 'Hit', 'Miss']) assert.ok(description.includes(value));
  assert.match(description, /Value present\?.*Hit.*Return value/);
  assert.match(description, /Value present\?.*Miss.*Read database/);
  assert.match(describeTutorDiagram(versioned(other.find(d => d.kind === 'sequence'))), /Client.*Request.*Server/);
  const expected = [
    ['Reads', 'Cache', 'Fast', 'Database', 'Authoritative'],
    ['Rollout', 'Monday', 'Prepare', 'Friday', 'Release', 'Measure traffic'],
    ['Request', 'Client', 'Server'],
    ['Table', 'Cold', 'Warm', 'Latency', 'High', 'Low', 'Lookup', 'Miss', 'Hit'],
    ['Stack', 'Web', 'Store', 'Persistent'],
    ['Iteration', 'Observe', 'Adjust'],
  ];
  for (const [index, diagram] of other.entries()) {
    const result = describeTutorDiagram(versioned(diagram));
    for (const value of expected[index]) assert.ok(result.includes(value), result);
  }
});

// Item 47 (2026-11-08): a flow node may carry the server's title (a trimmed label's full text); the author's JSON schema never asks for it.
test('a flow node title parses, within its limit, and is not in the author schema', () => {
  const flow = title => ({ version: 1, diagram: { kind: 'flow', title: 'T', nodes: [{ id: 'a', label: 'Go', role: 'process', ...(title === undefined ? {} : { title }) }, { id: 'b', label: 'Stop', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } });
  assert.equal(parseTutorDiagram(flow('Go all the way')).diagram.nodes[0].title, 'Go all the way');
  assert.throws(() => parseTutorDiagram(flow('x'.repeat(241))));
  const shapes = tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf;
  assert.deepEqual(Object.keys(shapes.find(s => s.properties.kind.const === 'flow').properties.nodes.items.properties), ['id', 'label', 'tensor', 'role']);
});

// Softmax recompute for list transformations (item 3): after_i = softmax(before)_i within half a unit of the decimals the author wrote for that item; off for temperature, scaled, masked, causal, log-softmax and "T =" cards.
const softmax = (before, after, extra = {}) => ({ version: 1, diagram: { kind: 'transformation', title: 'Softmax transformation', before: { label: 'Scores', items: before }, after: { label: 'Probabilities', items: after }, operation: 'Apply softmax', ...extra } });
const softmaxIssues = value => { const r = tutorDiagramSchema.safeParse(value); return r.success ? [] : r.error.issues; };
const arithmetic = issues => issues.filter(i => i.params?.code === 'arithmetic');

test('softmax list transformation: the real failing archive cards fail with the correct values for EVERY item, tagged arithmetic', () => {
  const [wrong] = arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04'])));
  assert.match(wrong.message, /softmax\(2\.0, 1\.0, 0\.1\) = 0\.66, 0\.24, 0\.10, not 0\.70, 0\.26, 0\.04\./);
  assert.deepEqual(wrong.path, ['diagram', 'after', 'items']);
  assert.match(arithmetic(softmaxIssues(softmax(['-2', '0', '3'], ['0.04', '0.11', '0.85'])))[0].message, /softmax\(-2, 0, 3\) = 0\.01, 0\.05, 0\.95, not 0\.04, 0\.11, 0\.85\./);
  assert.throws(() => parseTutorDiagram(softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04'])), /softmax of the before values/);
});

test('softmax list transformation: half a unit of the decimals the author wrote for THAT item decides', () => {
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.2', '0.1'])), [], 'one decimal: 0.7 against the true 0.659 passes');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.10'])), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.659', '0.242', '0.099'])), []);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.04']))).length, 1, 'two decimals: 0.04 against 0.099 fails');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.24', '0.099'])), [], 'each item has its own decimals');
  assert.deepEqual(softmaxIssues(softmax(['z_1 = 2.0', 'z_2 = 1.0', 'z_3 = 0.1'], ['p_1 = 0.66', 'p_2 = 0.24', 'p_3 = 0.10'])), [], 'a label before the number is read past');
  assert.deepEqual(softmaxIssues(softmax(['2', '1', '0.1'], ['66%', '24%', '10%'])), [], 'percent items');
  assert.equal(arithmetic(softmaxIssues(softmax(['2', '1', '0.1'], ['70%', '26%', '4%']))).length, 1);
});

test('softmax list transformation: only with softmax in the title or operation and plain numbers on both sides', () => {
  assert.deepEqual(softmaxIssues(softmax(['h1', 'h2', 'h3'], ['0.7', '0.26', '0.04'])), [], 'non-numeric before items skip the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', 'about 0.04'])), [], 'a non-numeric after item skips the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26'])), [], 'different lengths skip the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', '0.04'], { title: 'Scores to shares', operation: 'Normalize' })), [], 'no softmax named');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', '0.04'], { title: 'Scores to shares', operation: 'Apply softmax' }))).length, 1, 'softmax in the operation alone is enough');
});

test('softmax list transformation (NUM-3a): the word on the before or after label, or the operation written out as exponential and normalize, also starts the recompute; plain numbers on both sides are still required', () => {
  const card = (before, after, extra) => softmax(before, after, { title: 'Convert raw scores to weights', operation: 'Apply exponential and normalize', before: { label: 'Raw Scores', items: before }, after: { label: 'Softmax Weights', items: after }, ...extra });
  const issues = softmaxIssues(card(['0.5', '2.0', '1.0'], ['0.10', '0.45', '0.45']));
  assert.equal(arithmetic(issues).length, 1, 'the R3-pre cell 5 card is rejected');
  assert.ok(issues[0].message.includes('softmax(0.5, 2.0, 1.0) = 0.14, 0.63, 0.23, not 0.10, 0.45, 0.45'), 'with the correct values');
  assert.deepEqual(softmaxIssues(card(['0.5', '2.0', '1.0'], ['0.14', '0.63', '0.23'])), [], 'the correct card passes');
  const labelOnly = softmaxIssues({ version: 1, diagram: { kind: 'transformation', title: 'Scores to shares', before: { label: 'Scores', items: ['2.0', '1.0', '0.1'] }, after: { label: 'Softmax output', items: ['0.7', '0.26', '0.04'] }, operation: 'Apply the function' } });
  assert.equal(arithmetic(labelOnly).length, 1, 'softmax on the after label alone is enough');
  assert.deepEqual(softmaxIssues(card(['h1', 'h2', 'h3'], ['0.10', '0.45', '0.45'])), [], 'non-numeric before items still skip the rule');
  assert.deepEqual(softmaxIssues(card(['0.5', '2.0', '1.0'], ['0.10', '0.45', '0.45'], { operation: 'Apply exponential, scaled by temperature' })), [], 'a switched-off wording still turns the recompute off');
});

test('softmax grouped bar chart (NUM-3c): a score series and a probability series that say softmax are recomputed like the transformation rule', () => {
  const bars = (raw, prob, extra = {}) => ({ version: 1, diagram: { kind: 'bar-chart', variant: 'grouped', unit: 'value', title: 'Scores to probabilities via Softmax', caption: 'Raw scores turning into a probability distribution.', categories: ['Token A', 'Token B', 'Token C'], series: [{ label: 'Raw score', values: raw }, { label: 'Probability', values: prob }], ...extra } });
  const issues = softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1]));
  assert.equal(arithmetic(issues).length, 1, 'the R2 bench card is rejected, tagged arithmetic');
  assert.ok(issues[0].message.includes('softmax(3, 1, 0.5) = 0.82, 0.11, 0.07, not 0.79, 0.11, 0.10'), 'with the correct values');
  assert.deepEqual(issues[0].path.slice(0, 3), ['diagram', 'series', 1], 'on the probability series');
  assert.deepEqual(softmaxIssues(bars([3, 1, 0.5], [0.82, 0.11, 0.07])), [], 'the true values pass');
  assert.equal(arithmetic(softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1], { series: [{ label: 'Probability', values: [0.79, 0.11, 0.1] }, { label: 'Logit', values: [3, 1, 0.5] }] }))).length, 1, 'either series order, a logit label counts');
  assert.deepEqual(softmaxIssues(bars([1, 1, 1], [0.33, 0.33, 0.34])), [], 'the rounding clause of the transformation rule applies: 1/1/1 written 0.33/0.33/0.34');
  assert.deepEqual(softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1], { title: 'Scores to shares', caption: 'Raw scores and shares.' })), [], 'no softmax word on the title, caption or a series label: not applicable');
  assert.deepEqual(softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1], { caption: 'Softmax with temperature 2 on the raw scores.' })), [], 'a switched-off wording (temperature) leaves it to the distribution rule');
  assert.deepEqual(softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1], { series: [{ label: 'Raw score', values: [3, 1, 0.5] }, { label: 'Probability', values: [0.79, 0.11, 0.1] }, { label: 'Other', values: [1, 1, 1] }] })), [], 'exactly two series');
  assert.deepEqual(softmaxIssues(bars([3, 1, 0.5], [0.79, 0.11, 0.1], { series: [{ label: 'Input A', values: [3, 1, 0.5] }, { label: 'Input B', values: [0.79, 0.11, 0.1] }] })), [], 'series labelled neither score nor probability: not applicable');
});

test('softmax list transformation: temperature, T =, scaled, scaling, masked, causal and log-softmax turn the recompute off; a correct softmax(before / T) card passes', () => {
  const plain = ['0.70', '0.26', '0.04'];
  for (const extra of [{ title: 'Softmax with temperature' }, { caption: 'Temperature T lowers the entropy' }, { title: 'Scaled softmax' },
    { title: 'Softmax after scaling' }, { title: 'Masked softmax' }, { operation: 'Causal softmax' }, { title: 'Log-softmax' }, { title: 'Log softmax' }, { before: { label: 'Scaled scores', items: ['2.0', '1.0', '0.1'] } }, { after: { label: 'Softmax at temperature 2', items: plain } }]) {
    assert.deepEqual(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, extra))), [], JSON.stringify(extra));
  }
  // softmax(2.0 / 0.5, 1.0 / 0.5, 0.1 / 0.5) = softmax(4, 2, 0.2) = 0.86, 0.12, 0.02: correct for T = 0.5, wrong for a plain softmax of the before values
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02'], { operation: 'Softmax of scores divided by temperature T = 0.5' })), []);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02']))).length, 1, 'the same numbers without the gate word are a plain softmax and are wrong');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, { title: 'Softmax result, set t = 3' }))).length, 1, 'a lowercase t is not the temperature marker');
});

// NUM-3d (i): "exponential and divide by the sum" and the written formula start the recompute like the word softmax; (ii) SOFT-T: a label T = <positive number> is the temperature, the after items are checked against softmax(before / T).
const words = (operation, extra = {}) => softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04'], { title: 'Turning scores into shares', operation, before: { label: 'Raw scores', items: ['2.0', '1.0', '0.1'] }, after: { label: 'Shares', items: ['0.70', '0.26', '0.04'] }, ...extra });
test('softmax list transformation (NUM-3d i): the spellings of exponential and divide by the sum, and the written formula, start the recompute; unrelated divide-by-sum wording does not', () => {
  for (const operation of ['Apply exponential and divide by the sum', 'Exponentiate and divide by the sum', 'Exponentials divided by their sum', 'exp(x) / sum of exp', 'e^x over the sum of e^x', 'Exponentiate each score, then divide each by the total',
    String.raw`Apply $\sigma(z)_i = \frac{e^{z_i}}{\sum_j e^{z_j}}$`, String.raw`e^{z_i} / \sum_j e^{z_j}`, 'exp(z_i)/Σ exp(z_j)']) {
    const issues = arithmetic(softmaxIssues(words(operation)));
    assert.equal(issues.length, 1, operation);
    assert.ok(issues[0].message.includes('softmax(2.0, 1.0, 0.1) = 0.66, 0.24, 0.10, not 0.70, 0.26, 0.04'), operation);
    assert.deepEqual(softmaxIssues(words(operation, { after: { label: 'Shares', items: ['0.66', '0.24', '0.10'] } })), [], 'the right values pass: ' + operation);
  }
  for (const operation of ['Divide by the square root of 4', 'Scale and round to 8 bits', 'Subtract the mean and divide by the standard deviation', 'Sum of squares divided by n', 'Exponential decay over the sum of years']) {
    assert.deepEqual(arithmetic(softmaxIssues(words(operation))), [], operation);
  }
  assert.deepEqual(arithmetic(softmaxIssues(words('Apply exponential and divide by the sum, masked'))), [], 'a switched-off wording still turns it off');
  assert.deepEqual(softmaxIssues(words('Apply exponential and divide by the sum', { after: { label: 'Percent', items: ['66%', '24%', '10%'] } })), [], 'percent items are read as fractions');
});

test('softmax list transformation (NUM-3d ii, SOFT-T): a T = <positive number> label is the temperature and the after items are checked; an unparsable or non-positive T, two different Ts, or masked / scaled-dot wording keeps the switch-off', () => {
  const t = (label, after) => softmax(['2.0', '1.0', '0.1'], after, { operation: 'Apply softmax', after: { label: 'Probabilities', items: after }, before: { label: label, items: ['2.0', '1.0', '0.1'] } });
  // softmax(2.0, 1.0, 0.1 / 2) = 0.50, 0.30, 0.19 ; softmax(2.0 / 0.5, 1.0 / 0.5, 0.1 / 0.5) = 0.86, 0.12, 0.02
  const wrong = arithmetic(softmaxIssues(t('Scores, T = 2', ['0.66', '0.24', '0.10'])));
  assert.equal(wrong.length, 1);
  assert.ok(wrong[0].message.includes('softmax(2.0, 1.0, 0.1 / 2) = 0.50, 0.30, 0.19, not 0.66, 0.24, 0.10'), wrong[0].message);
  assert.deepEqual(softmaxIssues(t('Scores, T = 2', ['0.50', '0.30', '0.19'])), [], 'the right softmax(before / 2) passes');
  assert.deepEqual(softmaxIssues(t('Scores at T=0.5', ['0.86', '0.12', '0.02'])), [], 'T=0.5 with no spaces');
  assert.equal(arithmetic(softmaxIssues(t('Scores at T=0.5', ['0.66', '0.24', '0.10']))).length, 1);
  assert.deepEqual(softmaxIssues(t('Temperature scaled scores, T = 2', ['0.50', '0.30', '0.19'])), [], 'temperature and scaled words do not switch a parsable T off');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.10'], { operation: 'Softmax with T = 2' }))).length, 1, 'T on the operation counts too');
  for (const [label, why] of [['Scores, T = tau', 'unparsable'], ['Scores, T = 0', 'zero'], ['Scores, T = -1', 'negative'], ['Scores, T = 1 and T = 2', 'two Ts'], ['Masked scores, T = 2', 'masked'], ['Scaled dot-product scores, T = 2', 'scaled dot'], ['Temperature 2', 'temperature without T =']]) {
    assert.deepEqual(arithmetic(softmaxIssues(t(label, ['0.66', '0.24', '0.10']))), [], why);
  }
});

test('softmax list transformation: a gated card that calls its after values probabilities must still sum to 1 within the half-units', () => {
  const gated = { title: 'Softmax with temperature', caption: 'The probabilities after scaling' };
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02'], gated)), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.33', '0.33', '0.34'], gated)), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.2', '0.1'], gated)), []);
  const [bad] = arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.22', '0.02'], gated)));
  assert.match(bad.message, /must sum to 1: 0\.86 \+ 0\.22 \+ 0\.02 = 1\.1\./);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.5', '0.2', '0.1'], { title: 'Masked softmax', caption: 'Probabilities of each token' }))).length, 1);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.5', '0.3', '0.1'], { title: 'Masked softmax' })), [], 'not called probabilities: no sum check');
});

test('softmax list transformation: rounding clause: values summing to exactly 1 pass when only one is past its half-unit (and within a full unit), otherwise the half-unit rule decides', () => {
  assert.deepEqual(softmaxIssues(softmax(['1', '1', '1'], ['0.33', '0.33', '0.34'])), [], 'true 0.3333: 0.34 is 0.0067 away, under one unit');
  assert.equal(arithmetic(softmaxIssues(softmax(['1', '1', '1'], ['0.33', '0.33', '0.35']))).length, 1, 'sum is 1.01, so the half-unit rule decides');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.04']))).length, 1, 'sum 0.94, 0.04 against 0.099');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04']))).length, 1, 'sum 1.00 but 0.04 is 0.059 away: more than one unit');
  // Tightened (Reviewer): sum 1.00 but TWO values are past half a unit (0.66 vs 0.665241 is 0.005241; 0.10 vs 0.090031 is 0.009969), so the half-unit rule decides and it fails.
  assert.equal(arithmetic(softmaxIssues(softmax(['2', '1', '0'], ['0.66', '0.24', '0.10']))).length, 1);
});

// SAME-1 b (narrowed): a list transformation of exactly one text item into one text item is rejected; every other count passes; tensor items are exempt.
const listTransformation = (before, after) => ({ version: 1, diagram: { kind: 'transformation', title: 'Scores to shares', before: { label: 'Before', items: before }, after: { label: 'After', items: after }, operation: 'Rescale' } });
test('transformation list: one text item into one text item is rejected with the message that asks for concrete items and values', () => {
  assert.throws(() => parseTutorDiagram(JSON.stringify(listTransformation(['Water'], ['Ice']))), /one item into one item shows nothing.*concrete items before and after.*values.*the kind the plan names/s);
});
test('transformation list: 2 -> 1, 1 -> 3, 1 -> 2 and 2 -> 2 are accepted', () => {
  for (const [before, after] of [[['a', 'b'], ['c']], [['a'], ['b', 'c', 'd']], [['a'], ['b', 'c']], [['a', 'b'], ['c', 'd']]]) assert.ok(parseTutorDiagram(JSON.stringify(listTransformation(before, after))));
});
test('transformation list: tensor items are exempt from the one-into-one rule', () => {
  const tensor = { tensor: { name: 'State', rows: 1, columns: 4, dimensions: '1 × 4', values: [1.8, -0.1, 0.3, 0.4] } };
  assert.equal(parseTutorDiagram(JSON.stringify(listTransformation([tensor], [tensor]))).diagram.before.items.length, 1);
  assert.ok(parseTutorDiagram(JSON.stringify(listTransformation([tensor], ['text']))));
});
