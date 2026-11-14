// RD-4a: the labels of the branches that leave one node stand at one height (geometry lint rule a) even when the wires take separate lanes. Before, each branch's label sat on its own lane,
// 26 px under the one before. The labelled branches of a node now share one label lane below their lanes, each label on its own wire's last vertical leg; where the labels cannot stand
// side by side without touching, or a label would touch a wire passing through the lane, the node keeps its own lanes and labels as before (the lint still reports rule a for it).
import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutFlow } from './flow.js';
import { lintGeometry } from './geometry-lint.js';

const fork = labels => ({
  kind: 'flow', title: 'Fork',
  nodes: [
    { id: 'boot', label: 'Draw a bootstrap sample', role: 'process' },
    ...labels.map((_, index) => ({ id: `m${index}`, label: `Fit model ${index + 1}`, role: 'process' })),
    { id: 'vote', label: 'Combine the votes', role: 'outcome' },
  ],
  edges: [...labels.map((label, index) => ({ from: 'boot', to: `m${index}`, label })), ...labels.map((_, index) => ({ from: `m${index}`, to: 'vote' }))],
});
const labelsOf = (geometry, from) => geometry.edges.filter(edge => edge.from === from && edge.label).map(edge => edge.label);
const clean = geometry => lintGeometry(geometry).map(violation => `${violation.rule}: ${violation.detail}`);

test('RD-4a: the labels of a three-way fork stand at one height, at every card width', () => {
  for (const width of [0, 320, 408, 720]) {
    const { geometry } = layoutFlow(fork(['Sample A', 'Sample B', 'Sample C']), width);
    const labels = labelsOf(geometry, 'boot');
    assert.equal(labels.length, 3, `all three labels are inline at ${width}`);
    for (const label of labels) assert.ok(Math.abs(label.y - labels[0].y) <= 1, `labels at one height at ${width}`);
    assert.deepEqual(clean(geometry), [], `lint at ${width}`);
  }
  assert.equal(labelsOf(layoutFlow(fork(['Sample A', 'Sample B', 'Sample C']), 0).geometry, 'boot').length, 3, 'short labels stay inline at the natural width');
});

test('RD-4a: long labels that cannot stand side by side keep their own lanes as before, touching nothing', () => {
  const long = ['Resample with replacement from the training rows', 'Resample with replacement from a different seed', 'Resample the rows with replacement once more'];
  const { geometry } = layoutFlow(fork(long), 320);
  assert.ok(labelsOf(geometry, 'boot').length >= 2, 'the labels that find room stay inline');
  assert.deepEqual(lintGeometry(geometry).filter(violation => violation.rule !== 'a'), []);
});

test('RD-4a: a two-way decision whose branches both leave downward keeps its labels at one height', () => {
  const decision = {
    kind: 'flow', title: 'Fallback',
    nodes: [
      { id: 'a', label: 'Is the batch score usable?', role: 'decision' },
      { id: 'b', label: 'Ship the score', role: 'process' },
      { id: 'c', label: 'Use the rule', role: 'process' },
      { id: 'd', label: 'Done', role: 'outcome' },
    ],
    edges: [{ from: 'a', to: 'b', label: 'Yes' }, { from: 'a', to: 'c', label: 'No' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }],
  };
  for (const width of [0, 320, 408, 720]) assert.deepEqual(clean(layoutFlow(decision, width).geometry), [], `lint at ${width}`);
});

test('RD-4a: a branch without a label, or a node with one labelled branch, keeps its own lane height', () => {
  const lone = fork(['Only this one has a label']);
  const { geometry } = layoutFlow(lone, 0);
  assert.equal(labelsOf(geometry, 'boot').length, 1);
  assert.deepEqual(clean(geometry), []);
});
