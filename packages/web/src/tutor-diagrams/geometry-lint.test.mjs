// RD-3: the geometry lint over the renderers' layout output. (i) one violating and one clean synthetic layout per rule; (ii) every reference at natural width against the committed
// baseline (geometry-lint-baseline.json: reference id -> the rules it still breaks). The suite is green today, a NEW violation fails, and a baseline entry that no longer occurs fails too,
// so the baseline only shrinks and its list is the renderer work queue. (iii) the lint is deterministic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { diagramReferences } from './reference-library.js';
import { TOLERANCE, formatViolation, lintGeometry } from './geometry-lint.js';
import { lintReferenceGeometry, lintSpecGeometry } from './geometry-lint-references.js';

const baseline = JSON.parse(readFileSync(new URL('./geometry-lint-baseline.json', import.meta.url), 'utf8'));
const rect = (x, y, width, height) => ({ x, y, width, height });
const node = (id, shape, box, text = []) => ({ id, role: 'process', shape, ...box, text });
const edge = (from, to, points, label = null) => ({ from, to, points, label });
const layout = ({ nodes = [], edges = [] }) => ({ width: 400, height: 300, nodes, edges });
const rules = geometry => lintGeometry(geometry).map(violation => violation.rule);

test('(a) the labels of sibling branches stand at one y', () => {
  const branch = (to, x, y) => edge('d', to, [[x, 40], [x, 200]], rect(x - 20, y - 10, 40, 20));
  assert.deepEqual(rules(layout({ edges: [branch('x', 60, 80), branch('y', 160, 110)] })), ['a']);
  assert.deepEqual(rules(layout({ edges: [branch('x', 60, 80), branch('y', 160, 80 + TOLERANCE.labelY)] })), []);
  // one inline label alone, or branches of different nodes, are not siblings
  assert.deepEqual(rules(layout({ edges: [branch('x', 60, 80), { ...branch('y', 160, 110), from: 'other' }] })), []);
});

test('(b) no two parallel wires closer than 6 px', () => {
  const wire = (x, from) => edge(from, `${from}-t`, [[x, 0], [x, 40]]);
  assert.deepEqual(rules(layout({ edges: [wire(100, 'p'), wire(104, 'q')] })), ['b']);
  assert.deepEqual(rules(layout({ edges: [wire(100, 'p'), wire(100 + TOLERANCE.parallelGap, 'q')] })), []);
  // end to end (no shared run) and crossing wires are not side by side
  assert.deepEqual(rules(layout({ edges: [edge('p', 'x', [[100, 0], [100, 40]]), edge('q', 'y', [[102, 40], [102, 80]])] })), []);
  assert.deepEqual(rules(layout({ edges: [edge('p', 'x', [[100, 0], [100, 40]]), edge('q', 'y', [[60, 20], [140, 20]])] })), []);
  // the segments of one wire are never compared with each other
  assert.deepEqual(rules(layout({ edges: [edge('p', 'x', [[100, 0], [100, 40], [103, 40], [103, 0]])] })), []);
});

test('(c) no edge-label box on a wire other than its own', () => {
  const own = edge('a', 'b', [[100, 0], [100, 100]], rect(80, 40, 40, 20));
  assert.deepEqual(rules(layout({ edges: [own, edge('c', 'd', [[60, 50], [140, 50]])] })), ['c']);
  assert.deepEqual(rules(layout({ edges: [own, edge('c', 'd', [[60, 120], [140, 120]])] })), []);
  assert.deepEqual(rules(layout({ edges: [own] })), [], 'its own wire passes through the label');
});

test('(d) no text outside its node\'s shape', () => {
  const diamond = text => layout({ nodes: [node('n', 'diamond', rect(0, 0, 100, 80), [text])] });
  assert.deepEqual(rules(diamond(rect(30, 33, 40, 14))), []);
  assert.deepEqual(rules(diamond(rect(5, 33, 90, 14))), ['d'], 'the corners of a wide line leave the diamond');
  const capsule = text => layout({ nodes: [node('n', 'capsule', rect(0, 0, 120, 40), [text])] });
  assert.deepEqual(rules(capsule(rect(10, 13, 100, 14))), []);
  assert.deepEqual(rules(capsule(rect(0, 2, 120, 14))), ['d'], 'the corners reach the rounded ends');
  assert.deepEqual(rules(layout({ nodes: [node('n', 'box', rect(0, 0, 100, 40), [rect(95, 13, 20, 14)])] })), ['d']);
});

test('(e) no two labels intersect', () => {
  const labelled = (to, box) => edge('a', to, [[0, 0], [0, 10]], box);
  assert.deepEqual(rules(layout({ edges: [labelled('x', rect(10, 10, 40, 20)), labelled('y', rect(30, 20, 40, 20))] })).filter(rule => rule === 'e'), ['e']);
  assert.deepEqual(rules(layout({ edges: [labelled('x', rect(10, 10, 40, 20)), labelled('y', rect(50, 10, 40, 20))] })).filter(rule => rule === 'e'), [], 'touching is not intersecting');
  const geometry = layout({ nodes: [node('n', 'box', rect(0, 100, 200, 60), [rect(20, 120, 100, 14)])], edges: [labelled('x', rect(60, 110, 40, 20))] });
  assert.deepEqual(rules(geometry), ['e'], 'an edge label on a node\'s text');
});

test('a violation reads as one line with its fix', () => {
  const [violation] = lintGeometry(layout({ edges: [edge('p', 'x', [[100, 0], [100, 40]]), edge('q', 'y', [[103, 0], [103, 40]])] }), { id: 'ml-example' });
  assert.match(formatViolation(violation), /^ml-example: geometry rule b at edge p:x and edge q:y: parallel wires 3 px apart over 40 px .*the minimum is 6 px\. fix the renderer: space the wires at least 6 px apart$/);
});

const found = () => {
  const byId = new Map();
  for (const reference of diagramReferences) {
    const violations = lintReferenceGeometry(reference);
    if (violations.length) byId.set(reference.id, violations);
  }
  return byId;
};

test('the lint is deterministic: two runs over every reference give identical output', () => {
  const run = () => JSON.stringify([...found()]);
  assert.equal(run(), run());
});

test('a flow spec is linted through its panels and composition states', () => {
  const flow = { kind: 'flow', title: 'Pick', nodes: [{ id: 'a', label: 'Start', role: 'process' }, { id: 'b', label: 'Done', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] };
  assert.deepEqual(lintSpecGeometry({ version: 1, diagram: flow }), []);
  assert.deepEqual(lintSpecGeometry({ version: 1, diagram: { kind: 'bar-chart', title: 'x', unit: 'u', bars: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] } }), []);
});

test('every reference at natural width: no new geometry violation, and every baseline entry still occurs', () => {
  const actual = found();
  const lines = [];
  for (const [id, violations] of actual) {
    const byRule = new Map();
    for (const violation of violations) byRule.set(violation.rule, [...(byRule.get(violation.rule) ?? []), violation]);
    for (const [rule, items] of byRule) lines.push(`${id} rule ${rule}: ${items.length} (${baseline[id]?.includes(rule) ? 'baseline' : 'NEW'}) e.g. ${formatViolation(items[0])}`);
  }
  console.log(`geometry lint: ${actual.size} of ${diagramReferences.length} references have violations; per reference and rule:\n${lines.join('\n')}`);
  const fresh = [...actual].flatMap(([id, violations]) => [...new Set(violations.map(violation => violation.rule))].filter(rule => !baseline[id]?.includes(rule)).map(rule => `${id} rule ${rule}`));
  assert.deepEqual(fresh, [], 'new geometry violations: fix the renderer or the reference, never the baseline');
  const stale = Object.entries(baseline).flatMap(([id, ruleList]) => ruleList.filter(rule => !(actual.get(id) ?? []).some(violation => violation.rule === rule)).map(rule => `${id} rule ${rule}`));
  assert.deepEqual(stale, [], 'these baseline entries no longer occur: delete them from geometry-lint-baseline.json (the baseline only shrinks)');
  assert.ok(Object.keys(baseline).every(id => diagramReferences.some(reference => reference.id === id)), 'every baseline id is a reference');
});
