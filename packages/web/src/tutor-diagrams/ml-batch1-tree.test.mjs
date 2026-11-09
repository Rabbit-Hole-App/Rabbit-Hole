import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from './offline-reference-library.js';
import { parseTutorDiagram } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const getReference = () => {
  const reference = diagramReferences.find(ref => ref.id === 'ml-tree-impurity-gain');
  assert.ok(reference, 'The offline corpus includes the worked impurity-gain reference');
  return reference;
};

test('worked split conserves class counts and computes weighted impurity on that same data', () => {
  const { spec } = getReference();
  const tree = spec.diagram.panels.find(panel => panel.diagram.kind === 'tree').diagram;
  const table = spec.diagram.panels.find(panel => panel.diagram.kind === 'matrix').diagram;
  const counts = node => [...node.detail.matchAll(/(\d+) [AB]/g)].map(match => Number(match[1]));
  const root = tree.nodes.find(node => !node.parent);
  const children = tree.nodes.filter(node => node.parent === root.id);
  const sum = values => values.reduce((a, b) => a + b, 0);
  assert.equal(children.length, 2);
  for (const node of tree.nodes) assert.equal(sum(counts(node)), node.count);
  assert.deepEqual(counts(root), [0, 1].map(i => sum(children.map(node => counts(node)[i]))));
  const metrics = {
    gini: values => 1 - sum(values.map(value => (value / sum(values)) ** 2)),
    entropy: values => -sum(values.filter(Boolean).map(value => value / sum(values) * Math.log2(value / sum(values)))),
  };
  for (const [column, metric] of Object.values(metrics).entries()) {
    const parent = metric(counts(root));
    const values = children.map(node => metric(counts(node)));
    const weighted = sum(children.map(node => node.count / root.count * metric(counts(node))));
    for (const [id, expected] of Object.entries({ parent, left: values[0], right: values[1], weighted, gain: parent - weighted })) {
      const row = table.rows.find(row => row.id === id);
      assert.ok(row, `${id} step must be shown`);
      assert.ok(Math.abs(Number(row.cells[column]) - expected) < 0.00005);
    }
  }
  assert.equal(root.count, 8);
  assert.deepEqual(counts(root), [4, 4]);
});

test('worked split survives saved JSON and renders its actual binary tree and arithmetic', () => {
  const { spec } = getReference();
  const read = parseTutorDiagram(JSON.parse(JSON.stringify(spec)));
  assert.deepEqual(read, spec);
  for (const width of [320, 408, 720]) {
    const rendered = renderTutorDiagram(read, width);
    const svg = renderToStaticMarkup(rendered.element);
    assert.ok(Number.isFinite(rendered.width) && Number.isFinite(rendered.height));
    assert.doesNotMatch(svg, /NaN|Infinity/);
    assert.match(svg, /data-tutor-composition-child/);
    assert.match(svg, /4 A; 4 B/);
    assert.match(svg, /0\.1887/);
    assert.match(svg, /0\.125/);
    assert.match(svg, /#426db2/);
  }
});
