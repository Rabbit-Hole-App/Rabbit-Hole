// View > Shortcuts (owner brief 2026-11-02, C:/s/spec/shortcuts/owner-brief-2026-11-02.md): the window draws shortcuts.js, so
// these tests check the list itself, its platform spelling, its search and the window's focus rules. This replaces the test that
// asserted the old sheet's hard-coded Windows strings (Ctrl, 'Cmd on a Mac'), as the brief asks (section 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTIONS, ariaFor, ariaKey, hintFor, keyLabel, keysOf, shortcutRows, shortcutSections } from './shortcuts.js';

const sheet = readFileSync(new URL('./ShortcutsSheet.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const all = (options = {}) => shortcutSections(options).flatMap(section => section.rows);

test('seven sections in order, Quick Edit first (Ctrl+K on Windows, ⌘K on a Mac)', () => {
  assert.deepEqual(SECTIONS, ['Essentials', 'Canvas navigation', 'Selection, editing and arrangement', 'Drawing tools', 'Chat and text editing', 'Presenting and interactive cards', 'Mouse and trackpad']);
  assert.deepEqual(shortcutSections({ mac: false }).map(section => section.title), SECTIONS);
  for (const mac of [false, true]) {
    const first = all({ mac })[0];
    assert.equal(first.id, 'quick-edit');
    assert.deepEqual(first.labels, [mac ? '⌘K' : 'Ctrl+K']);
  }
  const ids = shortcutRows().map(row => row.id);
  assert.equal(new Set(ids).size, ids.length, 'one row per action id');
});

test('the inventory: the owner\'s rows and the four new keys, no Ctrl/Cmd+O', () => {
  const win = Object.fromEntries(all({ mac: false }).map(row => [row.id, row.labels.join(' / ')]));
  const mac = Object.fromEntries(all({ mac: true }).map(row => [row.id, row.labels.join(' / ')]));
  assert.deepEqual(['add-to-chat', 'focus-chat', 'search', 'find', 'shortcuts', 'slash-commands', 'escape'].map(id => win[id]), ['Ctrl+L', 'Ctrl+J', 'Ctrl+Shift+F', '/', '?', 'Shift+S', 'Esc']);
  assert.deepEqual(['add-to-chat', 'focus-chat', 'search', 'sidebar'].map(id => mac[id]), ['⌘L', '⌘J', '⌘Shift+F', '⌘\\']);
  assert.deepEqual(['zoom-in', 'zoom-out', 'zoom-reset', 'fit-canvas', 'fit-selection', 'right-panel', 'grid'].map(id => win[id]), ['Ctrl+Plus', 'Ctrl+Minus', 'Shift+0', 'Shift+1', 'Shift+2', 'Shift+P', 'Shift+G']);
  assert.deepEqual([win['open-card'], mac['open-card'], win.redo, mac.redo, win.delete, mac.delete], ['Enter', 'Return', 'Ctrl+Shift+Z / Ctrl+Y', '⌘Shift+Z', 'Delete / Backspace', 'Delete ⌫']);
  assert.deepEqual([win['copy-style'], mac['copy-style'], win['order-front'], mac['order-back']], ['Ctrl+Alt+C', '⌘Option+C', 'Ctrl+Shift+]', '⌘Shift+[']);
  assert.deepEqual(['tool-select', 'tool-hand', 'tool-rect', 'tool-ellipse', 'tool-arrow', 'tool-line', 'tool-pen', 'tool-text', 'tool-eraser', 'tool-sticky'].map(id => win[id]).join(''), 'VHROALPTEN');
  assert.deepEqual([win['group-pick'], mac['group-pick'], win['drag-duplicate'], mac['drag-duplicate'], win['pointer-zoom'], mac['pointer-zoom'], mac['object-actions']],
    ['Ctrl+click', '⌘click', 'Alt+drag', 'Option+drag', 'Ctrl+scroll', '⌘scroll', 'Right-click / Two-finger click']);
  assert.deepEqual([win['present-next'], win['present-previous'], win.laser, win['present-end']], ['→ / ↓ / Page Down / Space / Enter', '← / ↑ / Page Up', 'L', 'Esc']);
  assert.equal(all().find(row => row.id === 'game').text, 'Shown by each game', 'no universal WASD or arrows for games');
  assert.ok(!all({ mac: false }).some(row => row.labels.some(label => /\+O$/.test(label))) && !all({ mac: true }).some(row => row.labels.some(label => /⌘O$/.test(label))), 'legacy Ctrl/Cmd+O stays out');
  // A Mac never advertises Shift+F10 or the Menu key, which are not verified there (message 2 section 3).
  assert.deepEqual([win['menu-open'], mac['menu-open']], ['Shift+F10 / Menu key', 'Right-click / Two-finger click']);
  assert.ok(all({ mac: true }).every(row => row.labels.every(label => !/Ctrl|Alt\+/.test(label))), 'no Windows-only names on a Mac');
});

test('Chat rows follow the send setting; Ctrl/⌘+Enter stays contextual', () => {
  const rows = sendKey => Object.fromEntries(all({ mac: false, sendKey }).map(row => [row.id, row]));
  assert.deepEqual([rows('enter')['chat-send'].labels, rows('enter')['chat-newline'].labels], [['Enter'], ['Shift+Enter']]);
  const mod = rows('mod');
  assert.deepEqual([mod['chat-send'].labels, mod['chat-newline'].labels, mod['chat-send'].note], [['Ctrl+Enter'], ['Enter'], 'Your setting: Enter adds a new line']);
  assert.deepEqual(all({ mac: true, sendKey: 'mod' }).find(row => row.id === 'chat-send').labels, ['⌘Return']);
  assert.ok(!all().some(row => /generate/i.test(row.label)), 'no global Generate key');
});

test('search: every word must match the label, section, note or the keys as this platform spells them', () => {
  assert.deepEqual(all({ mac: false, query: 'ctrl+k' }).map(row => row.id), ['quick-edit']);
  assert.deepEqual(all({ mac: true, query: '⌘k' }).map(row => row.id), ['quick-edit']);
  assert.deepEqual(all({ query: 'snap grid' }).map(row => row.id), ['grid']);
  assert.ok(all({ query: 'drawing' }).length === 10);
  assert.deepEqual(shortcutSections({ query: 'zzzz' }), []);
  assert.deepEqual(all({ omit: ['slash-commands', 'right-panel'] }).filter(row => ['slash-commands', 'right-panel'].includes(row.id)), []);
});

test('labels and aria-keyshortcuts come from one binding', () => {
  assert.deepEqual([keyLabel('Mod+Shift+F', false), keyLabel('Mod+Shift+F', true), keyLabel('Mod+Alt+V', true), keyLabel('Shift+S', true), keyLabel('Enter', true)], ['Ctrl+Shift+F', '⌘Shift+F', '⌘Option+V', 'Shift+S', 'Return']);
  assert.deepEqual([ariaKey('Mod+K', false), ariaKey('Mod+K', true), ariaKey('Shift+2'), ariaKey(' '), ariaKey('Alt+drag'), ariaKey('ArrowKeys')], ['Control+K', 'Meta+K', 'Shift+2', 'Space', null, null]);
  assert.deepEqual([hintFor('delete', false), ariaFor('delete', false), hintFor('delete', true), ariaFor('delete', true)], ['Delete', 'Delete Backspace', 'Delete ⌫', 'Backspace']);
  assert.deepEqual(keysOf({ keys: { win: ['A'], mac: ['B'] } }, true), ['B']);
  assert.equal(hintFor('no-such-row'), null);
});

test('the window: titled Shortcuts, modal, search focused, Tab kept inside, Esc closes once, focus restored, platform detected', () => {
  assert.match(sheet, /export const TITLE = 'Shortcuts';/);
  assert.match(sheet, /role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" data-shortcuts-sheet/);
  assert.match(sheet, /<Input type="search" autoFocus data-shortcuts-search/);
  assert.match(sheet, /useState\(isMac\)/, 'the platform starts on this computer\'s');
  assert.match(sheet, /role="radiogroup"[^\n]*>\n[^\n]*PLATFORMS\.map/);
  assert.match(sheet, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopImmediatePropagation\(\); latest\.current\(\); return; \}/);
  assert.match(sheet, /window\.addEventListener\('keydown', key, true\)/, 'capture: nothing behind it sees the key first');
  assert.match(sheet, /if \(opener\?\.isConnected && opener !== document\.body\) opener\.focus/);
  assert.match(sheet, /shrink-0 border-b[^\n]*\n/, 'the header and controls stay put while the list scrolls');
  assert.doesNotMatch(sheet, /\.\.\.'|…/, 'no ellipsis');
});
