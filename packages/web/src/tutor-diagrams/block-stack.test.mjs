import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { createBlockStackShape, validateBlockStack, blockStackText, describeBlockStack } from './block-stack-spec.js';
import { blockStackNaturalWidth, layoutBlockStack } from './block-stack-layout.js';
import { layouts } from './layouts.js';
import { layoutTensor } from './tensor-layout.js';
import { PALETTE } from './primitives.js';
import { TEACHING } from './teaching-theme.js';
import { createTensorPayload, tensorText, validateTensor } from './tensor-spec.js';

const text = max => z.string().min(1).max(max);
const shape = createBlockStackShape({
  z, text, titled: { title: text(90), caption: text(140).optional() }, id: z.string().regex(/^[a-z][\w-]*$/),
  tensorPayload: createTensorPayload({ z, text, numeric: z.number() }),
}).superRefine((diagram, context) => validateBlockStack(diagram,
  (path, message) => context.addIssue({ code: 'custom', path, message }), validateTensor));

const simple = {
  kind: 'block-stack', title: 'Gemma attention variants', blocks: [
    { id: 'attention', label: 'Sliding-window attention', variant: 'Local', dims: '1,024 tokens', repeat: 5, role: 'changed' },
    { id: 'global', label: 'Global attention', variant: 'Global', detail: 2 },
  ],
  callouts: [{ node: 'attention', label: 'Local context window', value: '1,024' }],
};
const architecture = {
  kind: 'block-stack', title: 'Gemma transformer block', blocks: [
    { id: 'attention', label: 'Self-attention', repeat: 6, repeatTo: 'mlp', role: 'changed', detail: 2,
      inputs: [{ label: 'QK-Norm' }, { label: 'RoPE' }],
      diagram: { kind: 'flow', steps: ['Project queries and keys', 'Mix values'] } },
    { id: 'mlp', label: 'Gated MLP', merge: 'multiply', inputs: [{ label: 'Gate projection' }, { label: 'Up projection' }],
      diagram: { kind: 'layers', layers: [{ label: 'Gate', detail: 'Apply GeLU' }, { label: 'Up projection' }] } },
    { id: 'output', label: 'Output norm' },
  ],
  edges: [{ kind: 'residual', from: 'attention', to: 'attention' }, { kind: 'residual', from: 'attention', to: 'mlp', merge: 'multiply' }],
  callouts: [{ node: 'attention', label: 'Attention heads', value: '8' }],
};
const tokenRow = {
  kind: 'block-stack', orientation: 'horizontal', title: 'Token embeddings',
  blocks: ['the', 'cat', 'sat', 'on', 'the', 'mat'].map((word, index) => ({
    id: `token-${index}`, label: word,
    diagram: { kind: 'tensor', tensor: { rows: 1, columns: 4, dimensions: '512' } },
  })),
};

function draw(diagram, requestedWidth) {
  const scene = layoutBlockStack(shape.parse(diagram), requestedWidth, (child, width) =>
    (child.kind === 'tensor' ? layoutTensor : layouts[child.kind])(child, width));
  const svg = renderToStaticMarkup(h('svg', { width: scene.width, height: scene.height }, ...scene.elements));
  assert.doesNotMatch(svg, /NaN|Infinity/);
  return { ...scene, svg };
}

function findAll(elements, key) {
  return elements.filter(Boolean).flatMap(element => [
    ...(element.props?.[key] !== undefined ? [element] : []),
    ...findAll([element.props?.children].flat(Infinity), key),
  ]);
}

function polyline(element) {
  const wire = [element].flatMap(function descend(item) {
    return item?.type === 'polyline' ? [item] : [item?.props?.children].flat(Infinity).filter(Boolean).flatMap(descend);
  })[0];
  return wire.props.points.split(' ').map(point => point.split(',').map(Number));
}

test('block-stack schema bounds labels, metadata, repeats and compact children', () => {
  assert.equal(shape.safeParse(architecture).success, true);
  for (const invalid of [
    { label: 'a'.repeat(61) }, { variant: 'a'.repeat(15) }, { dims: 'a'.repeat(19) }, { detail: 4 },
    { repeat: 1000 }, { repeat: 1 }, { role: 'input' }, { merge: 'subtract' }, { fill: 'red' },
    { inputs: [{ label: 'a'.repeat(25) }] }, { inputs: Array.from({ length: 3 }, () => ({ label: 'Input' })) },
    { diagram: { kind: 'flow', steps: ['Only one step'] } }, { diagram: { kind: 'flow', steps: ['A', 'B'], diagram: simple } },
    { diagram: { kind: 'layers', layers: [{ label: 'One' }, { label: 'Two', detail: 'a'.repeat(81) }] } },
    { diagram: simple },
  ]) {
    assert.equal(shape.safeParse({ ...simple, blocks: [{ ...simple.blocks[0], ...invalid }, simple.blocks[1]] }).success, false, JSON.stringify(invalid));
  }
  assert.equal(shape.safeParse({ ...simple, blocks: [simple.blocks[0]] }).success, false);
  assert.equal(shape.safeParse({ ...simple, callouts: [{ node: 'attention', label: 'a'.repeat(49), value: '1' }] }).success, false);
  assert.equal(shape.safeParse({ ...simple, callouts: [{ node: 'attention', label: 'Context', value: 'a'.repeat(17) }] }).success, false);
});

test('block-stack semantic checks reject invalid targets, crossing repeats and malformed tensor payloads', () => {
  const blocks = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id }));
  const base = { ...simple, blocks, callouts: [] };
  const withRepeat = (first, second) => ({ ...base, blocks: [{ ...blocks[0], ...first }, { ...blocks[1], ...second }, ...blocks.slice(2)] });
  assert.equal(shape.safeParse(withRepeat({ repeat: 3, repeatTo: 'd' }, { repeat: 2, repeatTo: 'c' })).success, true);
  for (const [diagram, path] of [
    [{ ...base, blocks: [blocks[0], blocks[0]] }, ['blocks', 1, 'id']],
    [withRepeat({ repeatTo: 'b' }), ['blocks', 0, 'repeatTo']],
    [withRepeat({ repeat: 2, repeatTo: 'a' }), ['blocks', 0, 'repeatTo']],
    [withRepeat({}, { repeat: 2, repeatTo: 'a' }), ['blocks', 1, 'repeatTo']],
    [withRepeat({ repeat: 2, repeatTo: 'missing' }), ['blocks', 0, 'repeatTo']],
    [withRepeat({ repeat: 3, repeatTo: 'c' }, { repeat: 2, repeatTo: 'd' }), ['blocks', 1, 'repeatTo']],
    [{ ...base, edges: [{ kind: 'residual', from: 'missing', to: 'b' }] }, ['edges', 0, 'from']],
    [{ ...base, edges: [{ kind: 'residual', from: 'b', to: 'a' }] }, ['edges', 0, 'to']],
    [{ ...base, callouts: [{ node: 'missing', label: 'Callout' }] }, ['callouts', 0, 'node']],
    [{ ...base, blocks: [{ ...blocks[0], diagram: { kind: 'tensor', tensor: { rows: 1, columns: 2, dimensions: '1 × 2', values: [1] } } }, blocks[1]] },
      ['blocks', 0, 'diagram', 'tensor', 'values']],
  ]) {
    const result = shape.safeParse(diagram);
    assert.ok(result.error?.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(path)), JSON.stringify(path));
  }
});

test('block-stack text and description preserve authored annotations and the meaning of residuals', () => {
  const visible = blockStackText(architecture);
  for (const value of ['Self-attention', 'QK-Norm', 'RoPE', 'Project queries and keys', 'Apply GeLU', 'Attention heads', '8']) assert.ok(visible.includes(value), value);
  const description = describeBlockStack(architecture).join('\n');
  assert.match(description, /Self-attention.*Gated MLP.*6/);
  assert.match(description, /Self-attention.*Self-attention.*add/i);
  assert.match(description, /Self-attention.*Gated MLP.*multiply/i);
  assert.match(description, /Attention heads.*8/);
});

test('explicit block and inset roles change paint without moving the geometry', () => {
  const roles = ['norm', 'attention', 'feedforward', 'embedding', 'output', 'changed'];
  const labels = ['Read state', 'Mix tokens', 'Update features', 'Read embeddings', 'Return output', 'Compare block'];
  const steps = ['Normalize input', 'Mix tokens', 'Update features', 'Return output'];
  const blocks = labels.map((label, index) => ({ id: `block-${index}`, label }));
  blocks[1].diagram = { kind: 'flow', steps };
  const plain = { kind: 'block-stack', title: 'Role colours', blocks };
  const coloured = { ...plain, blocks: blocks.map((block, index) => ({ ...block, role: roles[index] })) };
  coloured.blocks[1].diagram = { kind: 'flow', steps: [steps[0],
    { label: steps[1], role: 'attention' }, { label: steps[2], role: 'feedforward' }, { label: steps[3], role: 'norm' },
  ] };
  const original = draw(plain, 408);
  const styled = draw(coloured, 408);
  const rects = (scene, key) => findAll(scene.elements, key).map(element => element.props.children[0].props);
  const outer = rects(styled, 'data-block-stack-node');
  const inner = rects(styled, 'data-tutor-node');
  assert.deepEqual(outer.map(({ fill }) => fill), [TEACHING.inset, TEACHING.blueSoft, TEACHING.warmSoft,
    TEACHING.greenSoft, TEACHING.greenSoft, TEACHING.blueSoft]);
  assert.equal(outer[4].stroke, TEACHING.green);
  assert.equal(outer[5].stroke, TEACHING.blue);
  assert.equal(outer[5].strokeWidth, 2);
  assert.deepEqual(inner.map(({ fill }) => fill), [PALETTE.process, TEACHING.blueSoft, TEACHING.warmSoft, TEACHING.inset]);
  const geometry = ({ x, y, width, height, rx }) => ({ x, y, width, height, rx });
  assert.deepEqual(outer.map(geometry), rects(original, 'data-block-stack-node').map(geometry));
  assert.deepEqual(inner.map(geometry), rects(original, 'data-tutor-node').map(geometry));
  assert.deepEqual(blockStackText(coloured), blockStackText(plain));
  assert.ok(describeBlockStack(coloured).includes(steps.join(' → ')));
  const invalid = structuredClone(coloured);
  invalid.blocks[1].diagram.steps[1].role = 'process';
  assert.equal(shape.safeParse(invalid).success, false);
});

test('residuals leave before their source block, route outside it and rejoin after their inclusive target', () => {
  for (const width of [408, blockStackNaturalWidth(architecture), 960]) {
    const scene = draw(architecture, width);
    assert.ok(scene.width >= width && scene.width <= 960);
    const blocks = findAll(scene.elements, 'data-block-stack-node');
    const residuals = findAll(scene.elements, 'data-block-stack-residual');
    const joins = findAll(scene.elements, 'data-block-stack-merge');
    assert.equal(residuals.length, 2);
    assert.equal(joins.length, 3);
    for (const [index, residual] of residuals.entries()) {
      const source = blocks[0].props.children[0].props;
      const target = blocks[index].props.children[0].props;
      const points = polyline(residual);
      assert.ok(points[0][1] < source.y);
      assert.ok(points[1][0] > source.x + source.width);
      assert.ok(points.at(-1)[1] > target.y + target.height);
      assert.ok(points.at(-1)[0] < points[1][0]);
    }
    assert.match(scene.svg, /⊕/);
    assert.equal((scene.svg.match(/⊗/g) ?? []).length, 2);
    assert.match(scene.svg, /data-block-stack-group="attention:mlp"/);
    assert.match(scene.svg, /×6/);
    assert.match(scene.svg, /data-block-stack-node="attention"[^>]*>\s*<rect[^>]*stroke="#426db2"/);
    assert.match(scene.svg, /Visual 2/);
    assert.match(scene.svg, /data-block-stack-child="flow"/);
    assert.match(scene.svg, /data-block-stack-child="layers"/);
    assert.equal(findAll(scene.elements, 'data-block-stack-input').length, 4);
    for (const wire of findAll(scene.elements, 'data-block-stack-input-wire')) {
      const points = polyline(wire);
      assert.ok(points.at(-1)[0] > points[0][0]);
      assert.ok(findAll([wire], 'data-tutor-arrowhead').length);
    }
  }
});

test('callouts occupy available margins and keep a highlighted value, with numbered rows at 320', () => {
  const narrow = draw(simple, 320);
  assert.match(narrow.svg, /data-block-stack-callout-badge="1"/);
  assert.match(narrow.svg, /data-block-stack-callout-row="1"/);
  assert.doesNotMatch(narrow.svg, /data-block-stack-callout-leader/);
  assert.match(narrow.svg, /Local context window/);
  assert.match(narrow.svg, /data-block-stack-callout-value="".*?>1,024</);
  const wide = draw(simple, 408);
  const right = findAll(wide.elements, 'data-block-stack-callout-leader')[0];
  assert.ok(polyline(right).at(-1)[0] > polyline(right)[0][0]);
  assert.match(wide.svg, /stroke-dasharray="2 4"/);
  assert.doesNotMatch(wide.svg, /data-block-stack-callout-row/);
  const crowded = draw(architecture, 960);
  const left = findAll(crowded.elements, 'data-block-stack-callout-leader')[0];
  assert.ok(polyline(left).at(-1)[0] < polyline(left)[0][0]);
});

test('a simple block-stack can fit in each half of a 408-pixel comparison', () => {
  const scene = draw(simple, 182);
  assert.equal(scene.width, 182);
  assert.match(scene.svg, /data-block-stack-callout-row="1"/);
  assert.ok(blockStackNaturalWidth(architecture) > 320 && blockStackNaturalWidth(architecture) <= 960);
});

test('horizontal token blocks keep reading order and native cell size at every width', () => {
  const natural = blockStackNaturalWidth(shape.parse(tokenRow));
  assert.ok(natural > 408 && natural <= 960);
  for (const requested of [320, 408, natural, 960]) {
    const scene = draw(tokenRow, requested);
    assert.equal(scene.width, Math.max(requested, natural));
    const blocks = findAll(scene.elements, 'data-block-stack-node');
    assert.deepEqual(blocks.map(block => block.props['data-block-stack-node']), tokenRow.blocks.map(block => block.id));
    const rects = blocks.map(block => block.props.children[0].props);
    for (const [index, rect] of rects.entries()) {
      assert.equal(rect.y, rects[0].y);
      assert.ok(rect.x >= 0 && rect.x + rect.width <= scene.width);
      if (index) assert.ok(rect.x > rects[index - 1].x + rects[index - 1].width);
    }
    const cells = findAll(scene.elements, 'data-tutor-tensor-cell');
    assert.equal(cells.length, 24);
    assert.ok(cells.every(cell => cell.props.width >= 24));
    assert.doesNotMatch(scene.svg, /<polyline|data-tutor-arrowhead/);
  }
  assert.equal(describeBlockStack(tokenRow)[0], 'the · cat · sat · on · the · mat');
  const weighted = { ...tokenRow, blocks: tokenRow.blocks.map((block, index) => index === 2
    ? { ...block, label: 'sat at weight 0.17' } : block) };
  const children = findAll(draw(weighted, 320).elements, 'data-block-stack-child');
  const starts = children.map(child => child.props.transform.match(/[\d.]+/g).map(Number)[1]);
  assert.ok(starts.every(y => y === starts[0]), 'wrapped labels share a heading height above the tensor strips');
});

test('horizontal block stacks reject vertical topology and retain an oversized native width', () => {
  const { blocks } = tokenRow;
  for (const [diagram, path] of [
    [{ edges: [{ kind: 'residual', from: 'token-0', to: 'token-0' }] }, ['edges']],
    [{ callouts: [{ node: 'token-0', label: 'Token' }] }, ['callouts']],
    ...[
      [{ merge: 'add' }, 'merge'],
      [{ inputs: [{ label: 'Side input' }] }, 'inputs'],
      [{ repeat: 2, repeatTo: 'token-1' }, 'repeatTo'],
      [{ diagram: { kind: 'flow', steps: ['First', 'Second'] } }, 'diagram'],
    ].map(([fields, key]) => [{ blocks: [{ ...blocks[0], ...fields }, ...blocks.slice(1)] }, ['blocks', 0, key]]),
  ]) {
    const result = shape.safeParse({ ...tokenRow, ...diagram });
    assert.ok(result.error?.issues.some(issue => JSON.stringify(issue.path) === JSON.stringify(path)), JSON.stringify(path));
  }
  const oversized = { ...tokenRow, blocks: blocks.map(block => ({ ...block, diagram: { kind: 'tensor',
    tensor: { rows: 1, columns: 8, dimensions: '512', values: Array(8).fill(123456.789) },
  } })) };
  const natural = blockStackNaturalWidth(oversized);
  assert.ok(natural > 960);
  assert.equal(draw(oversized, 960).width, natural);
});

test('a compact tensor is drawn inside its block without shrinking cells', () => {
  const tensor = { rows: 1, columns: 4, dimensions: '1 × 4', name: 'Query vector', values: [1, -2, 3, 4], role: 'input' };
  const diagram = { ...simple, blocks: [{ ...simple.blocks[0], diagram: { kind: 'tensor', tensor } }, simple.blocks[1]] };
  const scene = draw(diagram, 186);
  const block = findAll(scene.elements, 'data-block-stack-node')[0].props.children[0].props;
  const child = findAll(scene.elements, 'data-block-stack-child')[0];
  const cells = findAll([child], 'data-tutor-tensor-cell');
  const [x, y] = child.props.transform.match(/[\d.]+/g).map(Number);
  assert.equal(cells.length, 4);
  assert.ok(cells.every(({ props: cell }) => cell.width >= 24 && x + cell.x >= block.x
    && x + cell.x + cell.width <= block.x + block.width && y + cell.y + cell.height <= block.y + block.height));
  assert.ok(blockStackText(diagram, tensorText).includes('Query vector'));
  assert.match(describeBlockStack(diagram, tensorText).join('\n'), /Query vector.*\n1 × 4/);
});

test('two projections branch from the shared state and are the only operands of the standalone merge', () => {
  const scene = draw(architecture, 408);
  const forks = findAll(scene.elements, 'data-block-stack-input-fork').map(polyline);
  const mlp = findAll(scene.elements, 'data-block-stack-node')[1].props.children[0].props;
  const join = findAll(scene.elements, 'data-block-stack-merge')[1].props.children[0].props;
  const inputs = findAll(scene.elements, 'data-block-stack-input').slice(2).map(group => group.props.children[0].props);
  assert.equal(forks.length, 2);
  assert.ok(forks.some(points => points[0][0] === join.cx && points[0][1] === mlp.y + mlp.height));
  assert.ok(inputs.every(input => forks.some(points => points.at(-1)[0] === input.x && points.at(-1)[1] === input.y + input.height / 2)));
  const wires = scene.elements.filter(element => element.type === 'g' && !Object.keys(element.props).some(key => key.startsWith('data-'))
    && element.props.children?.[0]?.type === 'polyline').map(polyline);
  assert.ok(wires.every(points => points.at(-1)[0] !== join.cx || points.at(-1)[1] !== join.cy - join.r));
  const operands = findAll(scene.elements, 'data-block-stack-input-wire').slice(2).map(polyline);
  assert.ok(operands.every(points => points.at(-1)[0] < join.cx && Math.abs(points.at(-1)[1] - join.cy) < join.r));
});
