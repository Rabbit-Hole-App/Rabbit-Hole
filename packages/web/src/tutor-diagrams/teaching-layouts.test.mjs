import assert from 'node:assert/strict';
import test from 'node:test';
import { textWidth } from './primitives.js';
import { teachingLayouts } from './teaching-layouts.js';

const root = { id: 'root', label: 'Operating system' };
const tree = {
  kind: 'tree', title: 'Concept hierarchy',
  nodes: [
    { id: 'io', label: 'I/O scheduler', parent: 'kernel' }, root,
    { id: 'kernel', label: 'Kernel', parent: 'root' },
    { id: 'user', label: 'User space', parent: 'root' },
  ],
};
const relationship = {
  kind: 'relationship', title: 'Module relationships',
  nodes: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Service' }],
  edges: [{ from: 'a', to: 'b', label: 'Requests data' }, { from: 'b', to: 'a', label: 'Returns data' }],
};
const transformation = {
  kind: 'transformation', title: 'Normalize records',
  before: { label: 'Raw records', items: ['Value 01', 'Value 10'] },
  operation: 'Convert to integers',
  after: { label: 'Clean records', items: ['Integer 1', 'Integer 10'] },
  links: [{ from: 0, to: 1, label: 'Reordered' }, { from: 1, to: 0 }],
};
const argument = {
  kind: 'argument', title: 'Cache policy', claim: 'Caching cuts latency',
  support: [{ label: 'Fewer origin reads', source: 'Load test' }],
  objections: [{ label: 'Stale data risk' }],
  conclusion: 'Cache with a freshness policy',
};

const walk = elements => elements.flatMap(e => typeof e === 'object' && e !== null ? [e, ...walk([e.props.children].flat())] : []);
const tags = (scene, type) => walk(scene.elements).filter(e => e.type === type);
const texts = scene => tags(scene, 'text').map(e => [e.props.children].flat().map(span => span.props.children).join(' '));
const arrows = scene => tags(scene, 'polygon').filter(e => Object.hasOwn(e.props, 'data-tutor-arrowhead'));
const points = value => value.split(' ').map(point => point.split(',').map(Number));

function fits(scene) {
  const { width, height } = scene;
  for (const { props: p } of tags(scene, 'rect')) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.width <= width && p.y + p.height <= height);
  }
  for (const { props: p } of [...tags(scene, 'polyline'), ...tags(scene, 'polygon')]) {
    assert.ok(points(p.points).every(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height));
  }
  for (const { props: p } of tags(scene, 'text')) {
    for (const { props: span } of [p.children].flat()) {
      const size = textWidth(span.children, p.fontSize);
      const left = p.textAnchor === 'start' ? span.x : span.x - size / 2;
      assert.ok(left >= -0.01 && left + size <= width + 0.01 && span.y > 0 && span.y < height, span.children);
    }
  }
}

test('tree sorts out-of-order input into visual parent and child order', () => {
  const scene = teachingLayouts.tree(tree, 320);
  assert.equal(scene.width, 320);
  assert.deepEqual(texts(scene), ['Operating system', 'Kernel', 'I/O scheduler', 'User space']);
  assert.equal(arrows(scene).length, 3);
  const rectangles = tags(scene, 'rect').map(e => e.props);
  assert.ok(rectangles[2].x > rectangles[1].x && rectangles[1].x > rectangles[0].x);
  assert.equal(rectangles[3].x, rectangles[1].x);
  fits(scene);
});

test('tree leaves room to wrap labels at the maximum nesting depth', () => {
  const nodes = [root, ...Array.from({ length: 11 }, (_, index) => ({ id: 'n' + index,
    parent: index ? 'n' + (index - 1) : root.id, label: '跨越层级测试'.repeat(10) }))];
  const scene = teachingLayouts.tree({ ...tree, nodes }, 320);
  assert.equal(arrows(scene).length, 11);
  fits(scene);
});

test('relationship shows the actual source, label, and target of each direction', () => {
  const scene = teachingLayouts.relationship(relationship, 320);
  const labels = texts(scene);
  assert.deepEqual(labels.slice(0, 6), ['Client', 'Requests data', 'Service', 'Service', 'Returns data', 'Client']);
  assert.equal(arrows(scene).length, 2);
  fits(scene);
});

test('relationship keeps ordinary words intact when the middle lane is narrow', () => {
  const scene = teachingLayouts.relationship({ ...relationship,
    nodes: [{ id: 'a', label: 'Room temperature' }, { id: 'b', label: 'Thermostat' }],
    edges: [{ from: 'a', to: 'b', label: 'Feeds back as a measurement' }],
  }, 320);
  assert.deepEqual(texts(scene), ['Room temperature', 'Feeds back as a measurement', 'Thermostat']);
  assert.equal(arrows(scene).length, 1);
  fits(scene);
});

test('transformation renders operation, numbered states and each indexed mapping', () => {
  const scene = teachingLayouts.transformation(transformation, 320);
  const labels = texts(scene);
  for (const value of ['Raw records', 'Clean records', 'Convert to integers', '1. Value 01', '2. Integer 10', 'Reordered']) assert.ok(labels.includes(value), value);
  assert.equal(arrows(scene).length, 3);
  assert.ok(labels.includes('Before 1') && labels.includes('After 2'));
  fits(scene);
  const noLinks = teachingLayouts.transformation({ ...transformation, links: [] }, 320);
  assert.equal(arrows(noLinks).length, 1);
  assert.ok(texts(noLinks).includes('Value 01'));
  fits(noLinks);
});

test('argument connects the claim, both reasoning lanes and the conclusion', () => {
  const scene = teachingLayouts.argument(argument, 320);
  assert.deepEqual(texts(scene), ['Caching cuts latency', 'Support', 'Fewer origin reads', 'Load test', 'Objections', 'Stale data risk', 'Cache with a freshness policy']);
  assert.equal(arrows(scene).length, 3);
  fits(scene);
  const noObjections = teachingLayouts.argument({ ...argument, objections: [] }, 320);
  assert.ok(!texts(noObjections).includes('Objections'));
  assert.equal(arrows(noObjections).length, 2);
  fits(noObjections);
});

test('the remaining layouts wrap long labels and fit the original 320-pixel width', () => {
  const long = 'UnbrokenIdentifier'.repeat(4);
  const inputs = [
    { ...relationship, nodes: relationship.nodes.map(node => ({ ...node, label: long })), edges: relationship.edges.map(edge => ({ ...edge, label: long })) },
    { ...transformation, before: { label: long, items: [long, long, long] }, after: { label: long, items: [long, long] }, operation: long },
    { ...argument, claim: long, support: [{ label: long, source: long }, { label: long }], objections: [{ label: long }], conclusion: long },
  ];
  for (const input of inputs) {
    const scene = teachingLayouts[input.kind](input, 320);
    assert.equal(scene.width, 320);
    fits(scene);
  }
});
