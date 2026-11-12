import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { lintDiagramContent } from '../../scripts/explanation-content-contract.mjs';
import { tensorReferences } from './illustration-tensor-reference.js';
import { layoutTensor, layoutTensorStrip, layoutTensorTransformation, tensorMinimumWidth } from './tensor-layout.js';
import { createTensorPayload, createTensorShape, tensorText, validateTensor } from './tensor-spec.js';
import { TEACHING } from './teaching-theme.js';

const text = max => z.string().min(1).max(max);
const numeric = z.number().min(-1e9).max(1e9);
const tensorPayload = createTensorPayload({ z, text, numeric });
const tensorShape = createTensorShape({ z, titled: { title: text(90) }, tensorPayload }).superRefine(({ tensor }, ctx) => {
  validateTensor(tensor, (path, message) => ctx.addIssue({ code: 'custom', path: ['tensor', ...path], message }));
});
const tensor = { rows: 2, columns: 2, dimensions: '2 × 2', name: 'Weights', values: [0, -12.5, 9.25e-8, 1000000000], role: 'weight' };
const svg = scene => renderToStaticMarkup(h('svg', { viewBox: `0 0 ${scene.width} ${scene.height}` }, ...scene.elements));
const children = element => Children.toArray(element.props.children);

test('the tensor schema rejects extra rendering fields and validates its visible grid', () => {
  const diagram = { kind: 'tensor', title: 'A weight tensor', tensor };
  assert.deepEqual(tensorShape.parse(diagram), diagram);
  assert.ok(tensorPayload.safeParse({ rows: 1, columns: 8, dimensions: '1 × 64' }).success);
  for (const patch of [
    { color: 'blue' }, { rows: 0 }, { columns: 9 }, { rows: 1.5 }, { role: 'custom' },
    { values: [] }, { values: [NaN, 0, 1, 2] }, { dimensions: 'a shape that is too long' },
  ]) assert.equal(tensorPayload.safeParse({ ...tensor, ...patch }).success, false);

  const issues = [];
  validateTensor({ rows: 3, columns: 3, dimensions: '3 × 3' }, (path, message) => issues.push([path, message]));
  assert.equal(issues.length, 1);
  assert.match(issues[0][1], /eight visible cells/i);
  const badCount = tensorShape.safeParse({ ...diagram, tensor: { ...tensor, values: [1, 2, 3] } });
  assert.equal(badCount.success, false);
  assert.deepEqual(badCount.error.issues[0].path, ['tensor', 'values']);
});

test('the local strip fits all value labels and uses renderer-owned colors', () => {
  const scene = layoutTensorStrip(tensor, 20);
  assert.equal(scene.width, tensorMinimumWidth(tensor));
  assert.deepEqual(tensorText(tensor), ['Weights', '2 × 2', '0', '-12.5', '9.25e-8', '1000000000']);
  const cells = scene.elements.filter(element => element.props['data-tutor-tensor-cell'] !== undefined);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map(element => element.props['data-tutor-tensor-cell']), [0, 1, 2, 3]);
  assert.deepEqual(cells.map(element => element.props.fill), Array(4).fill(TEACHING.warmSoft));
  for (const { props: { x, y, width, height } } of cells) {
    assert.ok(x > 0 && y > 0 && x + width < scene.width && y + height < scene.height);
  }
  const markup = svg(layoutTensor({ tensor }, 320));
  for (const value of tensorText(tensor)) assert.ok(markup.includes(value), value);
  assert.doesNotMatch(markup, /NaN|Infinity|undefined|katex-error/);
});

function itemPosition(item) {
  const [, x, y] = item.props.transform.match(/^translate\(([^ ]+) ([^)]+)\)$/);
  return [Number(x), Number(y)];
}

test('Q/K/V uses four natural-width strips on a single row with three mapped arrows', () => {
  const [{ id, spec }] = tensorReferences;
  assert.equal(id, 'ml-transformer-qkv-projections');
  assert.deepEqual(lintDiagramContent(spec), []);
  const { diagram } = spec;
  const payloads = [...diagram.before.items, ...diagram.after.items].map(item => item.tensor);
  assert.deepEqual(payloads.map(payload => [payload.dimensions, payload.role]), [
    ['1 × 512', 'input'], ['1 × 256', 'output'], ['1 × 256', 'output'], ['1 × 256', 'output'],
  ]);
  assert.equal(payloads[0].values.length, 4);
  for (const payload of payloads) {
    assert.deepEqual(tensorPayload.parse(payload), payload);
    validateTensor(payload, (_, message) => assert.fail(message));
  }
  const natural = layoutTensorTransformation(diagram, 0);
  assert.ok(natural.width > 408);
  for (const width of [408, natural.width, 960]) {
    const scene = layoutTensorTransformation(diagram, width);
    assert.equal(scene.width, Math.max(natural.width, width));
    const items = scene.elements.filter(element => element.props['data-tutor-transformation-item']);
    assert.deepEqual(items.map(item => item.props['data-tutor-transformation-item']), ['before:0', 'after:0', 'after:1', 'after:2']);
    const positions = items.map(itemPosition);
    assert.ok(positions.every(([, y]) => y === positions[0][1]));
    const gridTops = [];
    items.forEach((item, i) => {
      const [x, y] = positions[i];
      const cells = children(item).filter(element => element.props['data-tutor-tensor-cell'] !== undefined);
      assert.equal(cells.length, payloads[i].columns);
      gridTops.push(y + cells[0].props.y);
      for (const cell of cells) {
        assert.ok(x + cell.props.x > 0 && x + cell.props.x + cell.props.width < scene.width);
        assert.ok(y + cell.props.y > 0 && y + cell.props.y + cell.props.height < scene.height);
      }
      if (i > 0) assert.ok(positions[i - 1][0] + tensorMinimumWidth(payloads[i - 1]) < x);
    });
    assert.equal(new Set(gridTops).size, 1, 'all four grids align on the same row');
    const markup = svg(scene);
    assert.equal([...markup.matchAll(/data-tutor-arrowhead/g)].length, 3);
    assert.match(markup, /Multiply by the learned weight matrices/);
    assert.doesNotMatch(markup, /NaN|Infinity|undefined|katex-error/);
  }
});

test('tensor transformations keep mixed text items and respect explicit mapping indices', () => {
  const scene = layoutTensorTransformation({
    before: { label: 'Before', items: ['Plain input', { label: 'Selected tensor', tensor }] },
    after: { label: 'After', items: [{ tensor }, 'Mapped output'] },
    operation: 'Map the items', links: [{ from: 1, to: 1, label: 'Use this pair' }],
  }, 408);
  const markup = svg(scene);
  for (const value of ['Plain input', 'Selected tensor', 'Mapped output', 'Use this pair']) assert.ok(markup.includes(value), value);
  assert.match(markup, /data-tutor-tensor-link="1:1"/);
  assert.equal([...markup.matchAll(/data-tutor-arrowhead/g)].length, 1);
});
