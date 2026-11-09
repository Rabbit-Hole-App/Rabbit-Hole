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

test('rejects sequence self messages, missing actors, duplicate actor IDs, and ragged matrices', () => {
  const sequence = structuredClone(other.find(d => d.kind === 'sequence'));
  assert.throws(() => parseTutorDiagram(versioned({ ...sequence, messages: [{ from: 'c', to: 'c', label: 'Loop' }] })), /itself/i);
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
