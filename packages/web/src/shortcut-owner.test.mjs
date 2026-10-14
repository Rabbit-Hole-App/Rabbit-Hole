// The shortcut owner (owner brief 2026-10-13: Quick Edit on Ctrl/Cmd+K, Add to Chat on Ctrl/Cmd+L, Search moved to
// Ctrl/Cmd+Shift+F): one module decides who takes each chord, so one keypress never opens two interfaces. The rendered
// behaviour is e2e/canvas-shell-check.mjs (Search) and e2e/canvas-editing-check.mjs (the bar and its keys).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addToChatAllowed, chordLabel, chordOf, claimChord, fieldKind, quickEditAllowed, routeShortcut } from './shortcut-owner.js';

const press = (key, extra = {}) => { const event = { key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, stopped: false, ...extra }; event.preventDefault = () => { event.defaultPrevented = true; }; event.stopImmediatePropagation = () => { event.stopped = true; }; return event; };
const field = (tagName, extra = {}) => ({ nodeType: 1, tagName, isContentEditable: false, closest: selector => (extra.inside || []).some(part => selector.includes(part)) ? {} : null, ...extra });

test('the chords: Ctrl or Cmd with K, L, or Shift+F - and nothing else', () => {
  assert.equal(chordOf(press('k')), 'quick-edit');
  assert.equal(chordOf(press('K', { ctrlKey: false, metaKey: true })), 'quick-edit');
  assert.equal(chordOf(press('l')), 'add-to-chat');
  assert.equal(chordOf(press('F', { shiftKey: true })), 'search');
  // Plain L is the laser; Ctrl+Shift+L locks the selection; Ctrl+F and Ctrl+Shift+K are the browser's and the page's.
  assert.equal(chordOf(press('l', { ctrlKey: false })), null);
  assert.equal(chordOf(press('L', { shiftKey: true })), null);
  assert.equal(chordOf(press('f')), null);
  assert.equal(chordOf(press('K', { shiftKey: true })), null);
  assert.equal(chordOf(press('k', { altKey: true })), null);
  assert.equal(chordOf(press('k', { isComposing: true })), null);
  assert.equal(chordOf(press('k', { keyCode: 229 })), null);
});

test('the shortcut labels: Ctrl on Windows and Linux, Cmd on a Mac', () => {
  assert.equal(chordLabel('add-to-chat', false), 'Ctrl+L');
  assert.equal(chordLabel('quick-edit', true), 'Cmd+K');
  assert.equal(chordLabel('search', false), 'Ctrl+Shift+F');
  assert.equal(chordLabel('search', true), 'Cmd+Shift+F');
});

test('where the focus is: a dialog, a code editor or embedded page, a text field, or the page itself', () => {
  assert.equal(fieldKind(null), null);
  assert.equal(fieldKind(field('BUTTON')), null);
  assert.equal(fieldKind(field('TEXTAREA')), 'text');
  assert.equal(fieldKind(field('INPUT')), 'text');
  assert.equal(fieldKind(field('DIV', { isContentEditable: true })), 'text');
  assert.equal(fieldKind(field('IFRAME')), 'code');
  assert.equal(fieldKind(field('DIV', { inside: ['.cm-editor'] })), 'code');
  assert.equal(fieldKind(field('INPUT', { inside: ['[role="dialog"]'] })), 'dialog', 'a dialog outranks the field in it');
});

test('Ctrl/Cmd+L adds to chat only with a selection and the focus on the page: it fires, and it does not while typing', () => {
  assert.equal(addToChatAllowed({ hasSelection: true }), true);
  assert.equal(addToChatAllowed({ hasSelection: false }), false, 'no selection: the browser keeps its Ctrl+L');
  assert.equal(addToChatAllowed({ hasSelection: true, field: 'text' }), false, 'typing in a field, the composer or a text editor');
  assert.equal(addToChatAllowed({ hasSelection: true, field: 'dialog' }), false);
  assert.equal(addToChatAllowed({ hasSelection: true, field: 'code' }), false);
  assert.equal(addToChatAllowed({ hasSelection: true, inlineOpen: true }), false);
  assert.equal(addToChatAllowed({ hasSelection: true, presenting: true }), false);
  assert.equal(addToChatAllowed({ hasSelection: true, readOnly: true }), false);
});

test('Ctrl/Cmd+K is Quick Edit wherever the canvas has the focus, with or without a selection; a foreign field keeps it', () => {
  assert.equal(quickEditAllowed({}), true);
  assert.equal(quickEditAllowed({ field: 'text' }), false, 'the composer');
  assert.equal(quickEditAllowed({ field: 'dialog' }), false);
  assert.equal(quickEditAllowed({ field: 'text', ownField: true }), true, 'the canvas\'s own open text editor');
  assert.equal(quickEditAllowed({ field: 'dialog', ownField: true }), true, 'the inline editor itself');
});

test('one keypress, one owner: the highest priority claimant takes it and the rest never see it', () => {
  const seen = [];
  const release = [
    claimChord('quick-edit', 'dive', 5, () => { seen.push('dive'); return true; }),
    claimChord('quick-edit', 'canvas', 10, (event, where) => { seen.push(`canvas:${where}`); return where !== 'text'; }),
    claimChord('search', 'search', 10, (event, where) => { seen.push(`search:${where}`); return !where; }),
  ];
  const k = press('k');
  assert.equal(routeShortcut(k, null), 'canvas');
  assert.deepEqual(seen, ['canvas:null']);
  assert.ok(k.defaultPrevented && k.stopped, 'the key ends at its owner');
  seen.length = 0;
  // Ctrl+K from a text field: the canvas declines, Dive (next in line) is offered it - never Search, which is not its chord.
  assert.equal(routeShortcut(press('k'), 'text'), 'dive');
  assert.deepEqual(seen, ['canvas:text', 'dive']);
  seen.length = 0;
  const found = press('F', { shiftKey: true });
  assert.equal(routeShortcut(found, null), 'search');
  assert.deepEqual(seen, ['search:null']);
  // Ctrl+K never reaches Search, and Ctrl+Shift+F never reaches the canvas.
  assert.ok(!seen.some(entry => entry.startsWith('canvas')));
  seen.length = 0;
  assert.equal(routeShortcut(press('f', { shiftKey: true }), 'dialog'), null, 'a dialog keeps Ctrl+Shift+F');
  release.forEach(stop => stop());
  assert.equal(routeShortcut(press('k'), null), null, 'withdrawn claims take nothing');
});

test('an unclaimed or foreign chord is left alone: the event is not touched', () => {
  const event = press('x');
  assert.equal(routeShortcut(event, null), null);
  assert.ok(!event.defaultPrevented && !event.stopped);
  const shifted = press('L', { shiftKey: true });
  assert.equal(routeShortcut(shifted, null), null, 'Ctrl+Shift+L stays the lock command');
  assert.ok(!shifted.defaultPrevented);
});
