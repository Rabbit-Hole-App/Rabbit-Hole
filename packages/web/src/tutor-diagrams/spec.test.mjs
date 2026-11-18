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

test('softmax list transformation: temperature, T =, scaled, scaling, masked, causal and log-softmax turn the recompute off; a correct softmax(before / T) card passes', () => {
  const plain = ['0.70', '0.26', '0.04'];
  for (const extra of [{ title: 'Softmax with temperature' }, { caption: 'Temperature T lowers the entropy' }, { operation: 'Apply softmax with T = 0.5' }, { operation: 'Softmax, T=2' }, { title: 'Scaled softmax' },
    { title: 'Softmax after scaling' }, { title: 'Masked softmax' }, { operation: 'Causal softmax' }, { title: 'Log-softmax' }, { title: 'Log softmax' }, { before: { label: 'Scaled scores', items: ['2.0', '1.0', '0.1'] } }, { after: { label: 'Softmax at temperature 2', items: plain } }]) {
    assert.deepEqual(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, extra))), [], JSON.stringify(extra));
  }
  // softmax(2.0 / 0.5, 1.0 / 0.5, 0.1 / 0.5) = softmax(4, 2, 0.2) = 0.86, 0.12, 0.02: correct for T = 0.5, wrong for a plain softmax of the before values
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02'], { operation: 'Softmax of scores divided by temperature T = 0.5' })), []);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02']))).length, 1, 'the same numbers without the gate word are a plain softmax and are wrong');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, { title: 'Softmax result, set t = 3' }))).length, 1, 'a lowercase t is not the temperature marker');
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

// SAME-1 b: a list transformation needs at least 2 items on each side (tensor items exempt); the message names what to write.
const listTransformation = (before, after) => ({ version: 1, diagram: { kind: 'transformation', title: 'Scores to shares', before: { label: 'Before', items: before }, after: { label: 'After', items: after }, operation: 'Rescale' } });
test('transformation list: one item on a side is rejected with a message that asks for the concrete items and their values', () => {
  for (const [before, after] of [[['Water'], ['Ice']], [['a', 'b'], ['c']], [['a'], ['b', 'c']]]) {
    assert.throws(() => parseTutorDiagram(JSON.stringify(listTransformation(before, after))), /at least 2 items before and 2 after.*concrete items before and after.*values/s);
  }
});
test('transformation list: two items on each side pass; tensor items are exempt from the count', () => {
  assert.ok(parseTutorDiagram(JSON.stringify(listTransformation(['x', 'y'], ['u', 'v']))));
  const tensor = { tensor: { name: 'State', rows: 1, columns: 4, dimensions: '1 × 4', values: [1.8, -0.1, 0.3, 0.4] } };
  const mixed = parseTutorDiagram(JSON.stringify(listTransformation([tensor], [tensor])));
  assert.equal(mixed.diagram.before.items.length, 1);
});
