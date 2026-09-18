import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelFor, textStyle, TEXT_LEVELS } from './learn-style-panel.js';

const shape = id => ({ id, kind: 'rect' });
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

test('the levels run big to small so the panel reads like Notion', () => {
  assert.deepEqual(TEXT_LEVELS.map(entry => entry.id), ['h1', 'h2', 'h3', 'body']);
  const sizes = TEXT_LEVELS.map(entry => entry.size);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});
