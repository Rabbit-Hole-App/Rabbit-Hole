// RD-4c: the text of an outcome node stays inside its capsule (geometry lint rule d). Before, the radius was always half the node height, so a tall outcome (three or four lines in a
// narrow card) became a circle and the corners of its widest lines left the shape. The radius is now the largest one, up to half the height, that keeps every line inside.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutFlow } from './flow.js';
import { lintGeometry } from './geometry-lint.js';

const tall = { kind: 'flow', title: 'Capsule text', nodes: [
  { id: 'train', label: 'Fit on training data', role: 'process' },
  { id: 'reserve', label: 'Keep the validation set and the test set separate from the training data until the final report', role: 'outcome' },
], edges: [{ from: 'train', to: 'reserve' }] };
const short = { ...tall, nodes: [tall.nodes[0], { id: 'reserve', label: 'Done', role: 'outcome' }] };
const radiusOf = layout => Number(/data-tutor-node="reserve"[^>]*><rect[^>]*? rx="([0-9.]+)"/.exec(renderToStaticMarkup(createElement('svg', null, ...layout.elements)))?.[1]);

test('RD-4c: no line of an outcome node leaves its capsule, at every card width', () => {
  for (const width of [0, 320, 408, 720]) {
    const { geometry } = layoutFlow(tall, width);
    const [node] = geometry.nodes.filter(n => n.id === 'reserve');
    if (width === 0) assert.ok(node.text.length >= 3, 'at the natural width the label wraps to three or more lines');
    assert.deepEqual(lintGeometry(geometry).filter(v => v.rule === 'd'), [], `text outside the capsule at ${width}`);
  }
});

test('RD-4c: a short outcome keeps the full pill, a tall one gets a smaller radius', () => {
  const pill = layoutFlow(short, 0), roomy = pill.geometry.nodes.find(n => n.id === 'reserve');
  assert.equal(radiusOf(pill), Math.min(roomy.width, roomy.height) / 2);
  // Nodes are at least 180 wide with 24 px padding, so the card width where a tall label stops fitting a full pill is 320.
  const layout = layoutFlow(tall, 320), node = layout.geometry.nodes.find(n => n.id === 'reserve');
  assert.ok(radiusOf(layout) < Math.min(node.width, node.height) / 2);
});
