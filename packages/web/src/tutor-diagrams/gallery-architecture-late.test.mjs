import assert from 'node:assert/strict';
import { test } from 'node:test';
import { references } from './gallery-architecture-late-references.js';
import { architectureToy } from './gallery-architecture-data.js';

test('parallel update combines two independent changes with the original stream', () => {
  const { stream, attention, experts, result } = architectureToy.parallel;
  assert.deepEqual(stream.map((value, i) => value + attention[i] + experts[i]), result);
  const { nodes, edges } = references[1].spec.diagram;
  assert.deepEqual(edges.filter(edge => edge.from === 'read').map(edge => edge.to), ['a', 'e', 'r']);
  assert.deepEqual(edges.filter(edge => edge.to === 'add').map(edge => edge.from), ['a', 'e', 'r']);
  assert.equal(nodes.find(node => node.id === 'add').role, 'merge');
});

test('one shortlist feeds two distinct attention reads and the next state', () => {
  const { scores, shortlist } = architectureToy.index;
  const sorted = scores.map((score, index) => [score, index + 1]).sort((a, b) => b[0] - a[0]);
  assert.deepEqual(sorted.slice(0, 2).map(([, position]) => position), shortlist);
  const { edges } = references[2].spec.diagram;
  assert.deepEqual(edges.filter(edge => edge.from === 'index').map(edge => edge.to), ['early', 'late']);
  assert.ok(edges.some(edge => edge.from === 'early' && edge.to === 'late'));
});

test('core repetition counts applications and distinct parameters separately', () => {
  const { prefix, core, passes, tail, unique, executions } = architectureToy.sharedCore;
  assert.equal(prefix + core + tail, unique);
  assert.equal(prefix + core * passes + tail, executions);
  const repeated = references[3].spec.diagram.blocks.find(block => block.id === 'core-a');
  assert.equal(repeated.repeat, passes);
  assert.equal(repeated.repeatTo, 'core-c');
});
