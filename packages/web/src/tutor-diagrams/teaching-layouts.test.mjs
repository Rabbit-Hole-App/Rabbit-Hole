import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TutorDiagram, { renderTutorDiagram } from './TutorDiagram.js';
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
const spans = props => [props.children].flat();
const labelText = props => spans(props).map(span => span.props.children).join(' ');
const texts = scene => tags(scene, 'text').map(e => labelText(e.props));
const arrows = scene => tags(scene, 'polygon').filter(e => Object.hasOwn(e.props, 'data-tutor-arrowhead'));
const points = value => value.split(' ').map(point => point.split(',').map(Number));
const center = rect => rect.x + rect.width / 2;
const binarySpec = nodes => ({ version: 1, diagram: { ...tree, layout: 'binary', nodes } });
function binary(nodes) {
  const { element, width, height } = renderTutorDiagram(binarySpec(nodes), 320);
  const drawing = element.props.children.find(child => child?.props.transform);
  return { width, height: height - Number(drawing.props.transform.match(/\d+/)[0]), elements: drawing.props.children };
}

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

test('binary tree puts both branches below their parent in side order, even when input is unordered', () => {
  const nodes = [
    { id: 'east', label: 'East', parent: 'root', side: 'right' }, root,
    { id: 'south', label: 'South', parent: 'east', side: 'left' },
    { id: 'west', label: 'West', parent: 'root', side: 'left' },
    { id: 'north', label: 'North', parent: 'west', side: 'right' },
  ];
  const scene = binary(nodes);
  assert.deepEqual(texts(scene), nodes.map(node => node.label), 'node text remains in authored reading order');
  const rectangles = tags(scene, 'rect').map(e => e.props);
  const byLabel = label => rectangles.find(rect => tags(scene, 'text').some(({ props }) =>
    props.x === center(rect) && props.y > rect.y && props.y < rect.y + rect.height && labelText(props) === label));
  const [parent, left, right, leftOnly, rightOnly] = ['Operating system', 'West', 'East', 'South', 'North'].map(byLabel);
  assert.ok([parent, left, right, leftOnly, rightOnly].every(Boolean), 'every node has a centered label');
  assert.ok(center(left) < center(parent) && center(parent) < center(right));
  assert.equal(left.y, right.y);
  assert.ok(center(leftOnly) < center(right) && center(rightOnly) > center(left));

  const wires = tags(scene, 'polyline').map(({ props }) => points(props.points));
  assert.equal(wires.length, 4);
  for (const [from, to] of [[parent, left], [parent, right], [left, rightOnly], [right, leftOnly]]) {
    assert.ok(to.y > from.y + from.height);
    const wire = wires.find(points => points[0][0] === center(from) && points[0][1] === from.y + from.height &&
      points.at(-1)[0] === center(to) && points.at(-1)[1] === to.y);
    assert.ok(wire?.some(([x], index) => index > 0 && x !== wire[index - 1][0]), 'the wire turns toward its child');
    assert.ok(wire.every(([x, y], index) => index === 0 || x === wire[index - 1][0] || y === wire[index - 1][1]));
  }
  fits(scene);
});

test('a wide, uneven binary tree preserves readable wrapped cards without overlaps', () => {
  const nodes = [{ ...root, label: 'Root' }, ...Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`,
    parent: index < 2 ? root.id : `n${Math.floor((index - 2) / 2)}`, side: index % 2 ? 'right' : 'left',
    label: '跨越层级测试'.repeat(10),
  }))];
  const scene = binary(nodes);
  assert.ok(scene.width > 320, 'the scene widens');
  const markup = renderToStaticMarkup(h(TutorDiagram, { spec: binarySpec(nodes) }));
  assert.match(markup, /overflow-x:auto[^>]*tabindex="0"[^>]*aria-label="Scrollable diagram"/);
  const rects = tags(scene, 'rect').map(e => e.props);
  const labels = tags(scene, 'text').map(e => e.props);
  assert.equal(rects.length, 12);
  assert.equal(labels.filter(p => spans(p).length > 1).length, 11);
  for (const rect of rects) {
    for (const other of rects) {
      if (rect === other) continue;
      assert.ok(rect.x + rect.width <= other.x || other.x + other.width <= rect.x ||
        rect.y + rect.height <= other.y || other.y + other.height <= rect.y, 'node cards do not overlap');
    }
    const label = labels.find(p => p.x === center(rect) && p.y > rect.y && p.y < rect.y + rect.height);
    assert.ok(spans(label).every(({ props: span }) => textWidth(span.children, label.fontSize) <= rect.width &&
      span.y > rect.y && span.y < rect.y + rect.height), 'wrapped text stays inside its card');
  }
  fits(scene);
});

test('a binary tree keeps the left or right turn at every level of a 12-node chain', () => {
  const nodes = [root, ...Array.from({ length: 11 }, (_, index) => ({ id: `n${index}`,
    parent: index ? `n${index - 1}` : root.id, side: index < 5 ? 'left' : 'right', label: `Depth ${index + 1}`,
  }))];
  const scene = binary(nodes);
  const rects = tags(scene, 'rect').map(e => e.props).sort((a, b) => a.y - b.y);
  assert.equal(rects.length, 12);
  assert.equal(tags(scene, 'polyline').length, 11);
  for (const [index, rect] of rects.slice(1).entries()) {
    assert.ok(rect.y > rects[index].y + rects[index].height);
    assert.equal(center(rect) < center(rects[index]), nodes[index + 1].side === 'left');
  }
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
