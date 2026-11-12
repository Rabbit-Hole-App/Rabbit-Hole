// Batch-1 audit (owner 2026-11-09, card 09 database index): a tree with no layout and short key labels is drawn top-down (`hierarchy`) instead of the legacy indented outline; a
// long-text hierarchy keeps the outline and a binary tree is never touched. The spec is card 09's own (docs/features/explain/review/batch-01/09-database-index/visual-1.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { treesAsHierarchy } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';

const card09 = JSON.parse(readFileSync(new URL('./fixtures/explanation-b-tree-index.spec.json', import.meta.url), 'utf8'));
const body = spec => `A database index avoids a full scan.\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\nThe query walks the tree.`;
const diagramOf = md => JSON.parse(md.match(/```rh-diagram\n([\s\S]*?)\n```/)[1]).diagram;
const tree = (labels, extra = {}) => ({ version: 1, diagram: { kind: 'tree', title: 'T', ...extra, nodes: labels.map((label, i) => ({ id: `n${i}`, label, ...(i ? { parent: 'n0' } : {}) })) } });

test('card 09 of batch 1: the short-key tree gets the top-down hierarchy layout, labels and parents unchanged', () => {
  assert.equal(card09.diagram.layout, undefined, 'the fixture is the tree as it was delivered, with no layout');
  const out = treesAsHierarchy(body(card09));
  assert.equal(out.count, 1);
  const d = diagramOf(out.md);
  assert.equal(d.layout, 'hierarchy');
  assert.deepEqual(d.nodes.map(n => [n.id, n.label, n.parent]), card09.diagram.nodes.map(n => [n.id, n.label, n.parent]));
});

test('a binary tree is untouched, byte for byte (the 15 binary layouts of the bench keep theirs)', () => {
  const binary = { version: 1, diagram: { kind: 'tree', title: 'BST', layout: 'binary', nodes: [{ id: 'a', label: '50' }, { id: 'b', label: '25', parent: 'a', side: 'left' }, { id: 'c', label: '75', parent: 'a', side: 'right' }] } };
  assert.deepEqual([treesAsHierarchy(body(binary)).md, treesAsHierarchy(body(binary)).count], [body(binary), 0]);
});

test('long-text hierarchies keep the outline: several words, or a label over 12 characters', () => {
  for (const labels of [['Sentence', 'Noun phrase of the subject', 'Verb phrase'], ['Folder', 'Documents', 'Pictures and videos'], ['Organisations', 'Engineering']]) {
    const out = treesAsHierarchy(body(tree(labels)));
    assert.equal(out.count, 0, labels.join('|'));
    assert.equal(diagramOf(out.md).layout, undefined);
  }
});

test('one or two short words qualify, 12 characters is the limit, and a layout the author set is never changed', () => {
  assert.equal(treesAsHierarchy(body(tree(['Root', 'Left key', 'Right key', 'x']))).count, 1);
  assert.equal(treesAsHierarchy(body(tree(['Root', '123456789012']))).count, 1, '12 characters');
  assert.equal(treesAsHierarchy(body(tree(['Root', '1234567890123']))).count, 0, '13 characters');
  assert.equal(treesAsHierarchy(body(tree(['Root', 'A'], { layout: 'dendrogram' }))).count, 0, 'an author layout stays');
  assert.equal(treesAsHierarchy('No diagram here.').count, 0);
});

test('generateArtifact applies it, counts it on the card and logs it as tree_hierarchy_layout', async () => {
  const log = console.log, lines = []; console.log = line => lines.push(line);
  try {
    const card = { title: 'Database index', body: body(card09) };
    const out = await generateArtifact({}, { command: 'explanation', args: 'how does a database index speed up a query?' }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: card }] }) });
    assert.equal(out.result, 'artifact');
    assert.deepEqual(out.block.diagramCorrections, { tree_hierarchy_layout: 1 });
    assert.equal(diagramOf(out.block.body).layout, 'hierarchy');
    assert.ok(lines.some(l => l.includes('explanation_diagram_corrected') && l.includes('tree_hierarchy_layout')));
  } finally { console.log = log; }
});
