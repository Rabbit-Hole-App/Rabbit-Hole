import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { flowPathShape, flowPaths, validateFlowPaths } from './flow-paths.js';
import { moeReferences } from './illustration-moe-reference.js';

const shape = flowPathShape({ z, id: z.string().regex(/^[a-z]+$/) });

const edges = pairs => pairs.map(([from, to]) => ({ from, to }));
const flow = {
  nodes: [
    { id: 'r', role: 'process' }, { id: 'f', role: 'fork' },
    { id: 'a', role: 'process' }, { id: 'b', role: 'process' },
    { id: 'p', role: 'process' }, { id: 'u', role: 'outcome' },
    { id: 'm', role: 'merge' }, { id: 'o', role: 'outcome' },
  ],
  edges: edges([['r', 'f'], ['f', 'a'], ['f', 'b'], ['f', 'u'], ['a', 'm'], ['b', 'p'], ['p', 'm'], ['m', 'o']]),
};
const first = ['r', 'f', 'a', 'm', 'o'];
const second = ['r', 'f', 'b', 'p', 'm', 'o'];
function issues(diagram, highlightPath) {
  const results = [];
  validateFlowPaths({ ...diagram, highlightPath }, (path, message) => results.push({ path, message }));
  return results;
}

test('flow path shape preserves a flat route and accepts exactly two bounded routes', () => {
  assert.deepEqual(shape.parse(first), first);
  assert.equal(shape.safeParse([first, second]).success, true);
  const longest = [...'abcdefghijkl'];
  assert.equal(shape.safeParse([['a', 'b'], longest]).success, true);
  for (const bad of [[first], [first, second, first], ['r', second], [first, ['a']], [first, [...longest, 'm']], [first, ['a', '1']]]) {
    assert.equal(shape.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('flow paths normalize absent, flat, and paired highlights', () => {
  assert.deepEqual(flowPaths(undefined), []);
  assert.deepEqual(flowPaths(first), [first]);
  assert.deepEqual(flowPaths([first, second]), [first, second]);
});

test('flat paths keep their existing validation and issue locations', () => {
  assert.deepEqual(issues(flow, first), []);
  for (const [path, at, message] of [
    [['r', 'f', 'r'], ['highlightPath'], /repeat/],
    [['r', 'missing'], ['highlightPath', 1], /unknown/],
    [['r', 'f', 'b', 'm', 'o'], ['highlightPath', 3], /existing edges/],
    [['f', 'a', 'm', 'o'], ['highlightPath', 0], /start/],
    [['r', 'f', 'a', 'm'], ['highlightPath', 3], /end/],
  ]) {
    const [finding] = issues(flow, path);
    assert.deepEqual(finding.path, at);
    assert.match(finding.message, message);
  }
});

test('paired paths can use unequal branch lengths from the same fork to the same merge', () => {
  assert.deepEqual(issues(flow, [first, second]), []);
  const [finding] = issues(flow, [first, ['r', 'f', 'b', 'missing', 'm', 'o']]);
  assert.deepEqual(finding.path, ['highlightPath', 1, 3]);
  assert.match(finding.message, /unknown/);
});

test('paired paths require distinct fork branches and a shared merge and terminal', () => {
  const withRole = (id, role) => ({ ...flow, nodes: flow.nodes.map(n => n.id === id ? { ...n, role } : n) });
  for (const [diagram, paths, message] of [
    [flow, [first, first], /distinct/],
    [withRole('f', 'decision'), [first, second], /fork/],
    [withRole('m', 'process'), [first, second], /merge/],
    [flow, [first, ['r', 'f', 'u']], /terminal/],
  ]) {
    const [finding] = issues(diagram, paths);
    assert.deepEqual(finding.path, ['highlightPath']);
    assert.match(finding.message, message);
  }
});

test('paired highlights cannot split again after reconverging', () => {
  const diagram = {
    nodes: [
      ...flow.nodes, { id: 'q', role: 'fork' }, { id: 'x', role: 'process' },
      { id: 'y', role: 'process' }, { id: 'j', role: 'merge' },
    ],
    edges: [
      ...flow.edges.filter(e => e.from !== 'm'),
      ...edges([['m', 'q'], ['q', 'x'], ['q', 'y'], ['x', 'j'], ['y', 'j'], ['j', 'o']]),
    ],
  };
  const [finding] = issues(diagram, [
    ['r', 'f', 'a', 'm', 'q', 'x', 'j', 'o'],
    ['r', 'f', 'b', 'p', 'm', 'q', 'y', 'j', 'o'],
  ]);
  assert.match(finding.message, /merge/);
});

test('the MoE reference depicts two selected routes out of eight and a shared expert', () => {
  assert.equal(moeReferences.length, 1);
  const [ref] = moeReferences;
  assert.equal(ref.id, 'ml-moe-top-two-experts');
  assert.deepEqual(ref.prompts, ['How does a mixture-of-experts router choose the top two experts for one token?']);
  assert.deepEqual(lintDiagramContent(ref.spec), []);
  const diagram = ref.spec.diagram;
  assert.equal(diagram.kind, 'flow');
  assert.deepEqual(issues(diagram, diagram.highlightPath), []);

  const router = diagram.nodes.find(n => n.role === 'fork');
  const merge = diagram.nodes.find(n => n.role === 'merge');
  const routed = diagram.edges.filter(e => e.from === router.id).map(e => diagram.nodes.find(n => n.id === e.to));
  assert.equal(routed.length, 9);
  assert.equal(routed.filter(n => n.label.startsWith('Skip ')).length, 6);
  const highlightedExperts = diagram.highlightPath.map(path => path[1]);
  assert.deepEqual(routed.filter(n => n.label.startsWith('Run ') && n.label !== 'Run shared').map(n => n.id), highlightedExperts);
  const shared = routed.find(n => n.label === 'Run shared');
  assert.ok(shared);
  assert.deepEqual(diagram.edges.filter(e => e.to === merge.id).map(e => e.from).sort(), [...highlightedExperts, shared.id].sort());
  assert.equal(diagram.nodes.find(n => n.id === diagram.highlightPath[0].at(-1)).role, 'outcome');
});
