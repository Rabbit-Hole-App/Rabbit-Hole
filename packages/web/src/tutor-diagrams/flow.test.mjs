import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { layoutFlow } from './flow.js';

const cache = {
  kind: 'flow', title: 'Cache lookup',
  nodes: [
    { id: 'read', label: 'Read cache', role: 'process' },
    { id: 'cached', label: 'Value in cache?', role: 'decision' },
    { id: 'hit', label: 'Return cached value', role: 'outcome' },
    { id: 'miss', label: 'Read database', role: 'process' },
    { id: 'return', label: 'Cache and return value', role: 'outcome' },
  ],
  edges: [
    { from: 'read', to: 'cached' }, { from: 'cached', to: 'hit', label: 'Hit' },
    { from: 'cached', to: 'miss', label: 'Miss' }, { from: 'miss', to: 'return' },
  ],
};

function render(layout) {
  return renderToStaticMarkup(createElement('svg', null, ...layout.elements));
}

test('cache diagram draws the approved component roles and every labeled branch', () => {
  const layout = layoutFlow(cache, 408);
  assert.equal(layout.width, 408);
  const svg = render(layout);
  for (const color of ['#8DBFEF', '#E5AA46', '#67B9A0']) assert.ok(svg.includes(color), color);
  const visible = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const value of ['Read cache', 'Hit', 'Miss', 'Return cached value']) assert.ok(visible.includes(value), value);
  assert.equal((svg.match(/data-tutor-arrowhead/g) ?? []).length, 4);
});

test('a skip edge stays outside intermediate boxes and preserves a labeled join', () => {
  const flow = {
    kind: 'flow', title: 'Retry policy',
    nodes: [
      { id: 'a', label: 'Retry needed?', role: 'decision' },
      { id: 'b', label: 'Run the request a second time', role: 'process' },
      { id: 'c', label: 'Return the response', role: 'outcome' },
    ],
    edges: [{ from: 'a', to: 'b', label: 'Retry' }, { from: 'a', to: 'c', label: 'Continue' }, { from: 'b', to: 'c' }],
  };
  const { elements } = layoutFlow(flow, 320);
  const routes = elements.filter(element => element.props['data-tutor-edge']);
  const boxes = elements.filter(element => element.props['data-tutor-node']);
  assert.equal(routes.length, 3);
  for (const route of routes) {
    const points = route.props.children.props.children[0].props.points.split(' ').map(pair => pair.split(',').map(Number));
    for (const node of boxes.filter(node => !route.props['data-tutor-edge'].split(':').includes(node.props['data-tutor-node']))) {
      const { x, y, width, height } = node.props.children[0].props;
      for (let i = 1; i < points.length; i++) {
        const [[x1, y1], [x2, y2]] = points.slice(i - 1, i + 1);
        assert.ok(x1 === x2 || y1 === y2, 'edge is orthogonal');
        const crosses = x1 === x2
          ? x < x1 && x1 < x + width && Math.max(y1, y2) > y && Math.min(y1, y2) < y + height
          : y < y1 && y1 < y + height && Math.max(x1, x2) > x && Math.min(x1, x2) < x + width;
        assert.equal(crosses, false, route.props['data-tutor-edge']);
      }
    }
  }
  assert.match(render(layoutFlow(flow, 320)), /Continue/);
});

const pointsFor = element => element.props.children.props.children[0].props.points
  .split(' ').map(pair => pair.split(',').map(Number));

function touches(points, rect) {
  return points.slice(1).some(([x2, y2], index) => {
    const [x1, y1] = points[index];
    const { x, y, width, height } = rect;
    return x1 === x2
      ? x < x1 && x1 < x + width && Math.max(y1, y2) > y && Math.min(y1, y2) < y + height
      : y < y1 && y1 < y + height && Math.max(x1, x2) > x && Math.min(x1, x2) < x + width;
  });
}

test('long branch labels never mask an unrelated connector in a nested flow', () => {
  const diagram = {
    nodes: ['r', 'a', 'b', 'c', 'd', 'e', 'f'].map(id => ({
      id, label: `Node ${id}`, role: ['r', 'a'].includes(id) ? 'decision' : id === 'f' ? 'outcome' : 'process',
    })),
    edges: [
      { from: 'r', to: 'a', label: 'First branch' }, { from: 'r', to: 'b', label: 'Second branch' },
      { from: 'a', to: 'd', label: 'On the first branch' }, { from: 'a', to: 'e', label: 'On the second branch' },
      { from: 'b', to: 'c' }, { from: 'c', to: 'f' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' },
    ],
  };
  const result = layoutFlow(diagram, 320);
  const wires = result.elements.filter(item => item.props['data-tutor-edge']);
  const annotations = result.elements.filter(item => Array.isArray(item.props.children)
    && item.props.children[0]?.type === 'rect' && !item.props['data-tutor-node']);
  assert.equal(annotations.length, 4);
  for (const [index, annotation] of annotations.entries()) {
    const { from, to } = diagram.edges[index];
    const other = wires.filter(wire => wire.props['data-tutor-edge'] !== `${from}:${to}`);
    assert.ok(other.every(wire => !touches(pointsFor(wire), annotation.props.children[0].props)));
  }
  assert.match(render(result).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /On the second branch/);
});

test('wrapped decision text fits inside the sloping sides on a narrow tier', () => {
  const diagram = {
    nodes: ['root', 'a', 'b', 'c', 'yes', 'no'].map(id => ({
      id, label: id === 'a' ? 'M'.repeat(60) : id, role: ['yes', 'no'].includes(id) ? 'outcome' : 'decision',
    })),
    edges: ['a', 'b', 'c'].flatMap(id => [
      { from: 'root', to: id, label: id }, { from: id, to: 'yes', label: 'Yes' }, { from: id, to: 'no', label: 'No' },
    ]),
  };
  const result = layoutFlow(diagram, 320);
  const node = result.elements.find(item => item.props['data-tutor-node'] === 'a');
  const [shape, text] = node.props.children;
  const [[, top], [right, middle], [, bottom], [left]] = shape.props.points.split(' ').map(pair => pair.split(',').map(Number));
  const lines = Array.isArray(text.props.children) ? text.props.children : [text.props.children];
  assert.ok(lines.length > 1);
  for (const span of lines) {
    const baseline = span.props.y;
    const inset = Math.max(Math.abs(baseline - 11 - middle), Math.abs(baseline + 2 - middle));
    const widthAtLine = (right - left) * (1 - 2 * inset / (bottom - top));
    assert.ok(span.props.children.length * 11.66 <= widthAtLine);
  }
});
