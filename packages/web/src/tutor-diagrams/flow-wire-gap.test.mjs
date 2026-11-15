// RD-4b: wires of different edges never run side by side closer than the lint's minimum (geometry lint rule b). The residual-sublayers figure had two verticals 4 px apart over 12 px
// (a node centre at 224 above another at 220). A port that would sit too close to another wire's vertical is moved along its node edge until the gap is the minimum.
import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutFlow } from './flow.js';
import { TOLERANCE, lintGeometry } from './geometry-lint.js';
import { diagramReferences } from './reference-library.js';

const figure = diagramReferences.find(reference => reference.id === 'figure-parallel-residual-sublayers');
const diagrams = [figure.depths.overview.spec.diagram, figure.depths.deep.spec.diagram];

test('RD-4b: the residual-sublayers figure has no two wires closer than the minimum, at every card width', () => {
  for (const diagram of diagrams) for (const width of [0, 320, 408, 720]) {
    const { geometry } = layoutFlow(diagram, width);
    assert.deepEqual(lintGeometry(geometry).filter(violation => violation.rule === 'b'), [], `wires too close at ${width}`);
  }
});

test('RD-4b: moving a port keeps every wire attached to its two nodes and orthogonal', () => {
  for (const diagram of diagrams) {
    const { geometry } = layoutFlow(diagram, 0);
    const nodes = new Map(geometry.nodes.map(node => [node.id, node]));
    for (const edge of geometry.edges) {
      const [first] = edge.points, last = edge.points.at(-1), from = nodes.get(edge.from), to = nodes.get(edge.to);
      assert.ok(first[0] > from.x && first[0] < from.x + from.width, `${edge.from}:${edge.to} leaves inside its source`);
      assert.ok(last[0] > to.x && last[0] < to.x + to.width, `${edge.from}:${edge.to} arrives inside its target`);
      edge.points.slice(1).forEach(([x, y], index) => assert.ok(x === edge.points[index][0] || y === edge.points[index][1], `${edge.from}:${edge.to} stays orthogonal`));
    }
  }
  assert.equal(TOLERANCE.parallelGap, 6);
});
