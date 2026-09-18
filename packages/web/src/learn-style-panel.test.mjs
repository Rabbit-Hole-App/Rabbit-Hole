import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelFor, textStyle, reorder, dashStyle, dashArray, TEXT_LEVELS } from './learn-style-panel.js';

const shape = (id, kind = 'rect') => ({ id, kind });
const text = id => ({ id, kind: 'text' });
const sticky = id => ({ id, kind: 'sticky' });

test('an armed drawing tool opens the panel with nothing selected', () => {
  for (const tool of ['pen', 'highlighter', 'text', 'sticky', 'rect', 'curve']) {
    assert.equal(panelFor({ tool, selection: [] }).open, true, tool);
  }
});

test('select with an empty selection keeps the panel shut', () => {
  const panel = panelFor({ tool: 'select', selection: [] });
  assert.equal(panel.open, false);
  assert.deepEqual(panel.targets, []);
});

test('hand and eraser never open it - neither carries a style', () => {
  assert.equal(panelFor({ tool: 'hand', selection: [] }).open, false);
  assert.equal(panelFor({ tool: 'eraser', selection: [] }).open, false);
});

test('a selected shape opens the panel and becomes its target', () => {
  const panel = panelFor({ tool: 'select', selection: ['s1'], shapes: [shape('s1'), shape('s2')] });
  assert.equal(panel.open, true);
  assert.deepEqual(panel.targets, ['s1']);
});

test('every selected shape is a target, so one press restyles them all', () => {
  const panel = panelFor({ tool: 'select', selection: ['s1', 's2'], shapes: [shape('s1'), shape('s2'), shape('s3')] });
  assert.deepEqual(panel.targets, ['s1', 's2']);
});

test('connectors are styleable too', () => {
  const panel = panelFor({ tool: 'select', selection: ['l1'], links: [{ id: 'l1' }] });
  assert.deepEqual(panel.targets, ['l1']);
});

test('selecting a block or sticky styles nothing, so the panel stays shut', () => {
  assert.equal(panelFor({ tool: 'select', selection: ['block-1'] }).open, false);
  assert.equal(panelFor({ tool: 'select', selection: ['n1'], items: [sticky('n1')] }).open, false);
});

test('text shows levels; ink shows widths', () => {
  assert.equal(panelFor({ tool: 'text', selection: [] }).text, true);
  assert.equal(panelFor({ tool: 'select', selection: ['t1'], items: [text('t1')] }).text, true);
  assert.equal(panelFor({ tool: 'pen', selection: [] }).text, false);
  assert.equal(panelFor({ tool: 'select', selection: ['s1'], shapes: [shape('s1')] }).text, false);
});

// A mixed pick has no single control that fits both, so it falls back to ink.
test('text mixed with a shape falls back to the ink controls', () => {
  const panel = panelFor({ tool: 'select', selection: ['t1', 's1'], items: [text('t1')], shapes: [shape('s1')] });
  assert.equal(panel.open, true);
  assert.equal(panel.text, false);
  assert.deepEqual(panel.targets, ['s1', 't1']);
});

test('a level renders its size and weight', () => {
  assert.deepEqual(textStyle({ kind: 'text', level: 'h1' }), { fontSize: 32, fontWeight: 600 });
  assert.deepEqual(textStyle({ kind: 'text', level: 'body' }), { fontSize: 14, fontWeight: 400 });
});

// Text placed before levels existed carries a raw size off the old width picker.
test('text with no level keeps rendering its old size', () => {
  assert.deepEqual(textStyle({ kind: 'text', size: 24 }), { fontSize: 24 });
  assert.deepEqual(textStyle({ kind: 'text' }), { fontSize: 14 });
  assert.deepEqual(textStyle({ kind: 'text', level: 'h9', size: 18 }), { fontSize: 18 });
});

// A line has no inside. Offering fill for it would be a press that does nothing.
test('fill shows for closed shapes only', () => {
  assert.equal(panelFor({ tool: 'rect', selection: [] }).fill, true);
  assert.equal(panelFor({ tool: 'star', selection: [] }).fill, true);
  assert.equal(panelFor({ tool: 'line', selection: [] }).fill, false);
  assert.equal(panelFor({ tool: 'arrow', selection: [] }).fill, false);
  assert.equal(panelFor({ tool: 'pen', selection: [] }).fill, false);
});

test('fill needs every selected shape to be closed, not just one', () => {
  const shapes = [shape('a', 'rect'), shape('b', 'ellipse'), shape('c', 'line')];
  assert.equal(panelFor({ tool: 'select', selection: ['a', 'b'], shapes }).fill, true);
  assert.equal(panelFor({ tool: 'select', selection: ['a', 'c'], shapes }).fill, false);
});

test('corners are a rectangle idea only', () => {
  assert.equal(panelFor({ tool: 'rect', selection: [] }).corners, true);
  assert.equal(panelFor({ tool: 'ellipse', selection: [] }).corners, false);
  const shapes = [shape('a', 'rect'), shape('b', 'ellipse')];
  assert.equal(panelFor({ tool: 'select', selection: ['a'], shapes }).corners, true);
  assert.equal(panelFor({ tool: 'select', selection: ['a', 'b'], shapes }).corners, false);
});

test('layer buttons need something selected - an armed tool has nothing to reorder', () => {
  assert.equal(panelFor({ tool: 'rect', selection: [] }).order, false);
  assert.equal(panelFor({ tool: 'select', selection: ['a'], shapes: [shape('a')] }).order, true);
});

test('dash reads the old boolean as dashed', () => {
  assert.equal(dashStyle(true), 'dashed');
  assert.equal(dashStyle(false), 'solid');
  assert.equal(dashStyle(undefined), 'solid');
  assert.equal(dashStyle('dotted'), 'dotted');
  assert.equal(dashStyle('nonsense'), 'solid');
});

test('dashArray scales with stroke width and leaves solid undefined', () => {
  assert.equal(dashArray('solid', 2), undefined);
  assert.equal(dashArray(true, 2), '6 5');
  assert.equal(dashArray('dashed', 4), '12 10');
  assert.equal(dashArray('dotted', 3), '0 6'); // zero-length dashes + round caps = pips
});

test('reorder moves a selection to either end of paint order', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(reorder(list, ['a'], true).map(e => e.id), ['b', 'c', 'a']);
  assert.deepEqual(reorder(list, ['c'], false).map(e => e.id), ['c', 'a', 'b']);
});

test('reorder keeps a multi-selection in its own order and leaves the rest alone', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(reorder(list, ['a', 'c'], true).map(e => e.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(reorder(list, ['b', 'd'], false).map(e => e.id), ['b', 'd', 'a', 'c']);
});

test('reorder returns the same list when nothing selected is in it', () => {
  const list = [{ id: 'a' }];
  assert.equal(reorder(list, ['zz'], true), list);
});

test('the levels run big to small so the panel reads like Notion', () => {
  assert.deepEqual(TEXT_LEVELS.map(entry => entry.id), ['h1', 'h2', 'h3', 'body']);
  const sizes = TEXT_LEVELS.map(entry => entry.size);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});
