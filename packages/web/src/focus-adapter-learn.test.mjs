// Learn mode's Focus adapters (focus-adapter-learn.js, learn-mode-spec.md §5): which card each claims, and the box it is drawn in.
import test from 'node:test';
import assert from 'node:assert/strict';
import './focus-adapters.js';
import { adapterFor } from './focus-controller.js';
import { naturalBox } from './focus-adapter-learn.js';
import { WIDE_MAX } from './focus-host.js';

test('code, diagrams and graphs have a Focus adapter everywhere', () => {
  for (const [type, label] of [['repo-code', 'Focus code'], ['snippet', 'Focus code'], ['flow', 'Focus diagram'], ['mermaid', 'Focus diagram'], ['graph', 'Focus graph'], ['plot', 'Focus graph']])
    assert.equal(adapterFor({ id: type, type })?.label, label, type);
});

test('any other card is claimed only in Learn mode, and never ahead of its own adapter', () => {
  assert.equal(adapterFor({ id: 'q', type: 'quiz' }), null, 'no Focus control outside Learn mode');
  assert.equal(adapterFor({ id: 'q', type: 'quiz' }, { learning: true })?.kind, 'natural');
  assert.equal(adapterFor({ id: 'n', type: 'notebook' }, { learning: true })?.kind, 'notebook');
  assert.equal(adapterFor({ id: 'e', type: 'explanation' }, { learning: true })?.label, 'Focus explanation');
  assert.equal(adapterFor({ id: 's', kind: 'shape' }, { learning: true }), null, 'a drawn canvas item is not a card');
});

test('naturalBox: centred, top-aligned, never wider or taller than the pane', () => {
  const frame = { left: 16, top: 20, width: 1000, height: 600 };
  assert.deepEqual(naturalBox(frame, { w: 640, h: 300 }), { left: 196, top: 20, width: 640, height: 300 });
  assert.deepEqual(naturalBox(frame, { w: 640, h: 900 }), { left: 196, top: 20, width: 640, height: 600 }, 'a tall card is cut to the pane and scrolls');
  assert.deepEqual(naturalBox(frame, { w: 640, h: 300 }, { maxWidth: WIDE_MAX }), { left: 16, top: 20, width: 1000, height: 300 }, 'pane-wide up to WIDE_MAX');
  assert.equal(naturalBox({ ...frame, width: 400 }, { w: 640, h: 300 }).width, 400);
});
