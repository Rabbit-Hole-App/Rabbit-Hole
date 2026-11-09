import assert from 'node:assert/strict';
import test from 'node:test';
import { layouts } from './layouts.js';
import { textWidth } from './primitives.js';
import { TEACHING } from './teaching-theme.js';

const edge = (from, to) => ({ from, to });
const walk = items => items.flatMap(item => item?.props ? [item, ...walk([item.props.children].flat())] : []);
const nodeFor = (scene, id) => scene.elements.find(item => item.props['data-tutor-node'] === id);
const points = p => p.split(' ').map(point => point.split(',').map(Number));
const text = items => walk(items).filter(item => item.type === 'tspan').map(item => item.props.children).join(' ');
const output = { rows: 2, columns: 3, dimensions: '2 × 3', name: 'Scores', values: [0.12, -0.3, 0.5, 0.8, 1.1, 0.2], role: 'output' };

test('flow keeps an inline tensor and its label inside the decision diamond', () => {
  const d = { nodes: [
    { id: 'check', label: 'Accept scores?', role: 'decision', tensor: output },
    { id: 'yes', role: 'outcome', tensor: { rows: 1, columns: 2, dimensions: '1 × 2' } },
    { id: 'no', label: 'Retry', role: 'outcome' },
  ], edges: [edge('check', 'yes'), edge('check', 'no')] };
  for (const width of [320, 960]) {
    const scene = layouts.flow(d, width);
    const { children } = nodeFor(scene, 'check').props;
    const [diamond] = children;
    assert.equal(diamond.type, 'polygon');
    const [[cx, top], [right, cy], [, bottom], [left]] = points(diamond.props.points);
    const fits = (x, y) => Math.abs(x - cx) / ((right - left) / 2) + Math.abs(y - cy) / ((bottom - top) / 2) < 1;
    const embedded = children.find(item => item.props['data-tutor-node-tensor'] !== undefined);
    assert.ok(embedded, 'the tensor is inside its node group');
    const [, tx, ty] = embedded.props.transform.match(/^translate\(([^ ]+) ([^ ]+)\)$/).map(Number);
    const cells = walk([embedded]).filter(item => item.props['data-tutor-tensor-cell'] !== undefined);
    assert.equal(cells.length, 6);
    for (const { props: p } of cells) {
      for (const x of [tx + p.x, tx + p.x + p.width]) {
        for (const y of [ty + p.y, ty + p.y + p.height]) assert.ok(fits(x, y), `${x},${y} fits`);
      }
    }
    for (const [items, x, y] of [[children, 0, 0], [embedded.props.children, tx, ty]]) {
      for (const { props: p } of items.filter(item => item.type === 'text')) {
        for (const { props: span } of [p.children].flat()) {
          const half = textWidth(span.children, p.fontSize) / 2;
          assert.ok(fits(x + span.x - half, y + span.y - p.fontSize));
          assert.ok(fits(x + span.x + half, y + span.y + 3));
        }
      }
    }
    for (const value of ['Accept scores?', 'Scores', '2 × 3', '-0.3']) assert.ok(text(children).includes(value));
    const outcome = nodeFor(scene, 'yes');
    assert.equal(outcome.props['aria-label'], '1 × 2');
    assert.equal(text([outcome]), '1 × 2');
  }
});

test('relationship embeds tensors in measured graph nodes and names unlabeled endpoints in its legend', () => {
  const d = { nodes: [
    { id: 'scores', tensor: output },
    { id: 'selected', tensor: { rows: 1, columns: 2, dimensions: '1 × 2' } },
    { id: 'consumer', label: 'Consumer' },
  ], edges: [{ ...edge('scores', 'selected'), label: 'Keep top two' }, { ...edge('selected', 'consumer'), label: 'Pass to consumer' }] };
  const scene = layouts.relationship(d, 320);
  const nodes = d.nodes.map(n => nodeFor(scene, n.id));
  assert.ok(nodes.every(Boolean), 'graph draws each tensor in its own node even without an explicit layout');
  assert.deepEqual(nodes.slice(0, 2).map(item => item.props['aria-label']), ['Scores', '1 × 2']);
  assert.match(text(scene.elements), /Scores → 1 × 2: Keep top two/);
  assert.match(text(scene.elements), /1 × 2 → Consumer: Pass to consumer/);
  const cards = new Map(nodes.map(item => [item.props['data-tutor-node'], item.props.children[0].props]));
  for (const item of nodes.slice(0, 2)) {
    const box = cards.get(item.props['data-tutor-node']);
    const embedded = item.props.children.find(child => child?.props['data-tutor-node-tensor'] !== undefined);
    assert.ok(embedded);
    const [, x, y] = embedded.props.transform.match(/^translate\(([^ ]+) ([^ ]+)\)$/).map(Number);
    for (const { props: cell } of walk([embedded]).filter(child => child.props['data-tutor-tensor-cell'] !== undefined)) {
      assert.ok(x + cell.x > box.x && x + cell.x + cell.width < box.x + box.width);
      assert.ok(y + cell.y > box.y && y + cell.y + cell.height < box.y + box.height);
    }
  }
  for (const item of scene.elements.filter(item => item.props['data-tutor-edge'])) {
    const ids = item.props['data-tutor-edge'].split(':');
    const route = points(walk([item]).find(child => child.type === 'polyline').props.points);
    [route[0], route.at(-1)].forEach(([x, y], index) => {
      const box = cards.get(ids[index]);
      assert.ok(x === box.x || x === box.x + box.width);
      assert.ok(y > box.y + box.rx && y < box.y + box.height - box.rx);
    });
  }
});

test('paired flow paths style only traversed edges and preserve the embedded tensor role color', () => {
  const nodes = ['f', 'a', 'b', 'm', 'end'].map((id, i) => ({ id, label: id, role: ['fork', 'process', 'process', 'merge', 'outcome'][i] }));
  nodes[0].tensor = output;
  const edges = [edge('f', 'a'), edge('f', 'b'), edge('a', 'm'), edge('b', 'm'), edge('m', 'end'), edge('a', 'b')];
  const scene = layouts.flow({ nodes, edges, highlightPath: [['f', 'a', 'm', 'end'], ['f', 'b', 'm', 'end']] }, 408);
  const renderedEdges = scene.elements.filter(item => item.props['data-tutor-edge']);
  assert.deepEqual(renderedEdges.filter(item => item.props['data-tutor-path'] !== undefined)
    .map(item => item.props['data-tutor-edge']), ['f:a', 'f:b', 'a:m', 'b:m', 'm:end']);
  for (const item of renderedEdges) {
    const wire = walk([item]).find(child => child.type === 'polyline');
    assert.equal(wire.props.stroke, item.props['data-tutor-edge'] === 'a:b' ? TEACHING.wire : TEACHING.blue);
  }
  for (const { id } of nodes) assert.equal(nodeFor(scene, id).props['data-tutor-path'], '');
  assert.equal(walk([nodeFor(scene, 'f')]).find(item => item.props['data-tutor-tensor-cell'] === 0).props.fill, TEACHING.greenSoft);
});

test('a nine-box parallel tier fits within 960 pixels without dropping labels', () => {
  const experts = ['Skip A', 'Skip B', 'Skip C', 'Run D', 'Run shared', 'Run E', 'Skip F', 'Skip G', 'Skip H'];
  const tier = experts.map((label, i) => ({ id: `expert${i}`, label, role: label.startsWith('Skip') ? 'outcome' : 'process' }));
  const nodes = [{ id: 'rank', label: 'Rank', role: 'fork' }, ...tier,
    { id: 'merge', label: 'Blend', role: 'merge' }, { id: 'end', label: 'Return', role: 'outcome' }];
  const edges = [...tier.map(n => edge('rank', n.id)), ...tier.slice(3, 6).map(n => edge(n.id, 'merge')), edge('merge', 'end')];
  const highlightPath = [3, 5].map(i => ['rank', tier[i].id, 'merge', 'end']);
  const scene = layouts.flow({ nodes, edges, highlightPath }, 408);
  assert.ok(scene.width <= 960, `tier needs ${scene.width}px`);
  for (const n of tier) assert.equal(text([nodeFor(scene, n.id)]), n.label);
  const boxes = tier.map(n => nodeFor(scene, n.id).props.children[0].props);
  for (const [index, box] of boxes.entries()) {
    const previous = boxes[index - 1];
    assert.ok(box.x >= 0 && box.x + box.width <= scene.width);
    if (previous) assert.ok(box.x > previous.x + previous.width);
  }
});
