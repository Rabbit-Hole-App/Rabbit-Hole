import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokenizeMath } from '../math-tokens.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { references } from './ml-batch3-topology-references.js';
import { parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';

const kinds = {
  'ml-backpropagation': 'flow',
  'ml-gpu-matmul': 'flow',
  'ml-convolutional-network': 'flow',
  'ml-beam-search': 'tree',
  'ml-rlhf-feedback': 'cycle',
  'ml-neural-network-weights': 'relationship',
  'ml-computational-graph': 'relationship',
};

function referenceSpec(id) {
  const reference = references.find(item => item.id === id);
  assert.ok(reference, `${id} is available as a worked reference`);
  return reference.spec;
}

const pairs = edges => edges.map(({ from, to }) => `${from}:${to}`);
const chain = nodes => nodes.slice(1).map((to, i) => `${nodes[i]}:${to}`);

for (const [id, kind] of Object.entries(kinds)) {
  test(`${id} round-trips and renders its labels at card widths`, () => {
    const spec = referenceSpec(id);
    const saved = JSON.stringify(spec);
    assert.deepEqual(parseTutorDiagram(saved), spec);
    assert.equal(spec.diagram.kind, kind);

    const labels = tutorDiagramVisibleText(spec).filter(Boolean).map(tokenizeMath);
    const formulas = new Set(labels.flatMap(({ math }) => math.map(({ raw }) => raw)));
    for (const { source } of labels) assert.doesNotMatch(source, /[$=×∂∇]|\\(?:frac|partial|times|nabla)\b/u);

    for (const width of [320, 408, 720]) {
      const rendered = renderTutorDiagram(saved, width);
      const svg = renderToStaticMarkup(rendered.element);
      assert.ok(Number.isFinite(rendered.width) && rendered.width >= width);
      assert.ok(Number.isFinite(rendered.height) && rendered.height > 0);
      assert.ok(svg.includes(`data-tutor-diagram="${kind}"`));
      assert.doesNotMatch(svg, /NaN|Infinity|undefined|katex-error/);
      for (const formula of formulas) assert.ok(svg.includes(`data-tutor-tex="${formula}"`), `${width}px: ${formula}`);
    }
  });
}

test('backprop carries the loss gradient through the output and hidden layers before updating weights', () => {
  const { nodes, edges } = referenceSpec('ml-backpropagation').diagram;
  assert.deepEqual(pairs(edges), chain(['input', 'hidden', 'output', 'loss', 'seed', 'outputGrad', 'hiddenGrad', 'update']));
  assert.match(nodes.find(node => node.id === 'outputGrad').label, /chain rule at output layer/i);
  assert.match(nodes.find(node => node.id === 'hiddenGrad').label, /chain rule at hidden layer/i);
  assert.equal(edges.find(edge => edge.from === 'outputGrad').label, String.raw`$\partial L/\partial h$`);
  assert.equal(nodes.find(node => node.id === 'update').role, 'outcome');
});

test('four GPU blocks fill four different output tiles before merging', () => {
  const { nodes, edges } = referenceSpec('ml-gpu-matmul').diagram;
  assert.equal(nodes.find(node => node.id === 'split').role, 'fork');
  assert.equal(nodes.find(node => node.id === 'merge').role, 'merge');
  const tasks = edges.filter(edge => edge.from === 'split');
  assert.equal(new Set(tasks.map(edge => edge.label)).size, 4);
  for (const [i, j] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
    const node = nodes.find(item => item.id === `tile${i}${j}`);
    assert.ok(tasks.some(edge => edge.to === node.id));
    assert.ok(node.label.includes(`$A_${i} B_${j}$`));
    assert.ok(edges.some(edge => edge.from === node.id && edge.to === 'merge' && edge.label === `$C_{${i}${j}}$`));
  }
  assert.ok(edges.some(edge => edge.from === 'merge' && edge.to === 'result'));
});

test('CNN feature extraction leads from learned filters to class scores', () => {
  const cnn = referenceSpec('ml-convolutional-network').diagram;
  assert.deepEqual(pairs(cnn.edges), chain(['image', 'convolution', 'activation', 'pooling', 'flatten', 'dense', 'scores']));
  assert.match(cnn.nodes.find(node => node.id === 'convolution').label, /learned filters/);
  assert.match(cnn.nodes.find(node => node.id === 'dense').label, /fully connected/);
});

test('RLHF uses human rankings and leads back to sampling with the tuned policy', () => {
  const spec = referenceSpec('ml-rlhf-feedback');
  assert.deepEqual(spec.diagram.steps, [
    'Sample several answers per prompt', 'Have humans rank the answers',
    'Train a reward model on rankings', 'Tune the policy with PPO using predicted rewards',
  ]);
  assert.match(spec.diagram.caption, /pretrained model.*next round.*tuned model/);
  const svg = renderToStaticMarkup(renderTutorDiagram(spec, 320).element);
  const routes = [...svg.matchAll(/<polyline points="([^"]+)"/g)].map(([, points]) => points.split(' '));
  const returning = routes.find(points => points.length === 4);
  assert.ok(returning, 'Draw a return connector from policy tuning to sampling');
  assert.ok(Number(returning[0].split(',')[1]) > Number(returning[3].split(',')[1]));
});

test('beam search prunes to the global top two at each depth and highlights the winning sequence', () => {
  const spec = referenceSpec('ml-beam-search');
  const { layout, title, nodes, highlightPath } = spec.diagram;
  assert.equal(layout, 'hierarchy');
  assert.match(title, /\$k=2\$/);
  const root = nodes.find(node => !node.parent);
  const first = nodes.filter(node => node.parent === root.id);
  const second = nodes.filter(node => node.parent && node.parent !== root.id);
  const score = node => Number(tokenizeMath(node.detail).math[0].expression);
  for (const level of [first, second]) {
    assert.ok(level.length > 2);
    level.sort((a, b) => score(b) - score(a));
    assert.deepEqual(level.map(node => Boolean(node.pruned)), level.map((_, index) => index >= 2));
  }
  for (const parent of [root, ...first]) {
    const children = nodes.filter(node => node.parent === parent.id);
    if (parent.pruned) assert.equal(children.length, 0);
    else assert.ok(Math.abs(children.reduce((sum, node) => sum + score(node), 0) - (parent === root ? 1 : score(parent))) < 1e-10);
  }
  const best = second[0];
  assert.deepEqual(highlightPath, [root.id, best.parent, best.id]);
  const svg = renderToStaticMarkup(renderTutorDiagram(spec, 320).element);
  assert.ok(svg.includes(`data-tutor-node="${best.id}" data-tutor-path=""`));
  assert.equal(svg.match(/data-tutor-pruned=""/g)?.length, nodes.filter(node => node.pruned).length);
});

test('every unit has a distinct weighted connection to every unit in the next layer', () => {
  const spec = referenceSpec('ml-neural-network-weights');
  const { nodes, edges } = spec.diagram;
  assert.deepEqual(pairs(edges), ['x1:h1', 'x1:h2', 'x2:h1', 'x2:h2', 'h1:y', 'h2:y']);
  assert.equal(new Set(edges.map(edge => edge.label)).size, edges.length);
  assert.ok(edges.every(edge => /^Scale by \$[wv]/.test(edge.label)));
  const svg = renderToStaticMarkup(renderTutorDiagram(spec, 320).element);
  for (const { id } of nodes) assert.equal(svg.split(`data-tutor-node="${id}"`).length, 2);
});

test('the computational graph carries intermediate values and reuses their route for gradients', () => {
  const { nodes, edges, caption } = referenceSpec('ml-computational-graph').diagram;
  assert.deepEqual(pairs(edges), ['x:multiply', 'w:multiply', 'multiply:add', 'b:add', 'add:loss']);
  assert.equal(nodes.find(node => node.id === 'loss').label, 'Square for loss');
  assert.deepEqual(edges.map(({ label }) => label), ['Pass $x$', 'Pass $w$', 'Pass $u=wx$', 'Pass $b$', 'Pass $z=u+b$']);
  assert.match(caption, /backward for gradients/);
  assert.ok(caption.includes('$L=z^2$'));
  assert.ok(caption.includes(String.raw`$\partial L/\partial w=2zx$`));
});
