// The Focus controller contract (docs/features/focus-study.md): presentation state only, one saved navigation, a clean
// exit, a working frame from the measured pane, no Focus control without an adapter, and Escape left to inner owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor, exitNavigation, focusAdapters, focusFrame, focusReducer, focusSnapshot, frameInWorld, isFocusEligible, registerFocusAdapter, shouldExitOnEscape } from './focus-controller.js';

const NAV = { owner: 'store', view: { x: 10, y: 20, z: 0.5 }, selection: ['a'], scroll: [] };

test('focusFrame: 16 px inset on desktop, 12 px on a narrow pane, never negative', () => {
  assert.deepEqual(focusFrame({ pane: { left: 0, top: 48, width: 1000, height: 700 } }), { left: 16, top: 64, width: 968, height: 668 });
  assert.deepEqual(focusFrame({ pane: { left: 0, top: 0, width: 400, height: 700 } }), { left: 12, top: 12, width: 376, height: 676 });
  assert.deepEqual(focusFrame({ pane: { left: 0, top: 0, width: 1000, height: 700 }, narrow: true, inset: 8 }), { left: 8, top: 8, width: 984, height: 684 });
  assert.deepEqual(focusFrame({ pane: { left: 0, top: 0, width: 10, height: 10 }, narrow: false }), { left: 16, top: 16, width: 0, height: 0 });
  assert.equal(focusFrame({}), null);
});

test('frameInWorld: the screen frame in world units, counter-scaled to keep text at its normal size', () => {
  assert.deepEqual(frameInWorld({ left: 116, top: 64, width: 800, height: 600 }, { x: 100, y: 0, z: 0.5 }), { x: 32, y: 128, width: 800, height: 600, scale: 2 });
  assert.equal(frameInWorld({ left: 0, top: 0, width: 1, height: 1 }, { x: 0, y: 0, z: 0 }), null);
});

test('reducer: enter keeps only navigation, never geometry; a second enter keeps the first saved navigation', () => {
  const frame = { left: 16, top: 16, width: 900, height: 600 };
  let s = focusReducer(null, { type: 'enter', id: 'nb1', kind: 'notebook', saved: { ...NAV, w: 999, cardLayout: { mode: 'full' } }, frame });
  assert.deepEqual(s, { id: 'nb1', kind: 'notebook', saved: NAV, frame });
  assert.equal(focusReducer(s, { type: 'enter', id: 'nb1', kind: 'notebook', saved: { ...NAV, view: { x: 0, y: 0, z: 1 } } }), s, 'entering the same card again changes nothing');
  const other = focusReducer(s, { type: 'enter', id: 'pdf1', kind: 'pdf', saved: { ...NAV, view: { x: 0, y: 0, z: 1 } }, frame });
  assert.equal(other.id, 'pdf1');
  assert.deepEqual(other.saved, NAV, 'Back to canvas returns to where Focus began');
  assert.equal(focusReducer(null, { type: 'enter', id: '', kind: 'pdf' }), null);
  assert.equal(focusReducer(null, { type: 'enter', id: 'x' }), null, 'no kind, no Focus');
  s = focusReducer(s, { type: 'unknown' });
  assert.equal(s.id, 'nb1');
});

test('reducer: workspace-changed recomputes the frame only; exit and content-gone end Focus cleanly', () => {
  const s = focusReducer(null, { type: 'enter', id: 'nb1', kind: 'notebook', saved: NAV, frame: { left: 16, top: 16, width: 900, height: 600 } });
  assert.equal(focusReducer(s, { type: 'workspace-changed', frame: { left: 16, top: 16, width: 900, height: 600 } }), s, 'same frame, same state');
  const moved = focusReducer(s, { type: 'workspace-changed', frame: { left: 316, top: 16, width: 600, height: 600 } });
  assert.deepEqual([moved.id, moved.saved, moved.frame.left], ['nb1', NAV, 316]);
  assert.equal(focusReducer(null, { type: 'workspace-changed', frame: { left: 0, top: 0, width: 1, height: 1 } }), null);
  assert.equal(focusReducer(s, { type: 'exit' }), null);
  assert.equal(focusReducer(s, { type: 'content-gone', id: 'nb1' }), null);
  assert.equal(focusReducer(s, { type: 'content-gone', id: 'other' }), s, 'another card going away keeps Focus');
  assert.equal(focusReducer(s, { type: 'content-gone' }), null);
});

test('exitNavigation: restores camera and selection but never a scroll inside the focused card', () => {
  const node = id => ({ closest: () => ({ getAttribute: () => id }) });
  const inside = { node: node('nb1'), top: 0, left: 0 }, elsewhere = { node: node('note2'), top: 40, left: 0 }, loose = { node: {}, top: 5, left: 0 };
  const s = focusReducer(null, { type: 'enter', id: 'nb1', kind: 'notebook', saved: { ...NAV, scroll: [inside, elsewhere, loose] } });
  assert.deepEqual(exitNavigation(s), { ...NAV, scroll: [elsewhere, loose] });
  assert.equal(exitNavigation(null), null);
  assert.deepEqual(focusSnapshot(s), { id: 'nb1', kind: 'notebook' });
  assert.equal(focusSnapshot(null), null);
});

test('registry: no adapter, no Focus control; an adapter needs every hook and a label without an ellipsis', () => {
  assert.equal(focusAdapters.size, 0, 'WP0 registers no adapter');
  assert.equal(isFocusEligible({ id: 'nb1', type: 'notebook' }), false);
  const hooks = { enter() {}, update() {}, exit() {} };
  assert.throws(() => registerFocusAdapter({ kind: 'notebook', label: 'Focus notebook', ...hooks }));
  assert.throws(() => registerFocusAdapter({ kind: 'notebook', label: 'Focus notebook...', canFocus: () => true, ...hooks }));
  assert.throws(() => registerFocusAdapter({ kind: 'notebook', label: 'Focus notebook…', canFocus: () => true, ...hooks }));
  const notebook = registerFocusAdapter({ kind: 'notebook', label: 'Focus notebook', canFocus: block => block.type === 'notebook', ...hooks });
  try {
    assert.equal(adapterFor({ type: 'notebook' }), notebook);
    assert.equal(isFocusEligible({ type: 'notebook' }), true);
    assert.equal(isFocusEligible({ type: 'pdf' }), false);
    assert.equal(isFocusEligible(null), false);
  } finally { focusAdapters.delete('notebook'); }
});

test('shouldExitOnEscape: only an unclaimed Escape while focusing', () => {
  const key = (target = { tagName: 'DIV' }, extra = {}) => ({ key: 'Escape', defaultPrevented: false, target, ...extra });
  const on = { focusing: true };
  assert.equal(shouldExitOnEscape(key(), on), true);
  assert.equal(shouldExitOnEscape(key(), {}), false, 'not focusing');
  assert.equal(shouldExitOnEscape({ ...key(), key: 'Enter' }, on), false);
  assert.equal(shouldExitOnEscape(key(undefined, { defaultPrevented: true }), on), false, 'an inner handler used it');
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME']) assert.equal(shouldExitOnEscape(key({ tagName }), on), false, tagName);
  assert.equal(shouldExitOnEscape(key({ tagName: 'DIV', isContentEditable: true }), on), false, 'an editor');
  assert.equal(shouldExitOnEscape(key({ tagName: 'DIV', closest: () => ({}) }), on), false, 'inside a menu, dialog, editor or active viewer');
  assert.equal(shouldExitOnEscape(key({ tagName: 'BUTTON', closest: () => null }), on), true);
  for (const open of ['menuOpen', 'dialogOpen', 'gesture', 'viewerActive']) assert.equal(shouldExitOnEscape(key(), { ...on, [open]: true }), false, open);
});
