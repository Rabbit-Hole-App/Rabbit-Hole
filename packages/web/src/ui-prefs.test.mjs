// Device interface preferences (Settings > Appearance & input, owner brief L11): read, applied to <html>, saved, and a
// refused save reported while the change still holds in the page. The browser run is e2e/settings-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyUiPrefs, readUiPrefs, saveUiPref, sendKeyLabel, uiPrefs, UI_PREF_DEFAULTS, modKeyLabel } from './ui-prefs.js';

const memory = (initial = {}) => { const data = new Map(Object.entries(initial)); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data }; };
const root = () => { const attrs = new Map(); return { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), attrs }; };

test('missing, unreadable or odd values read as the defaults', () => {
  assert.deepEqual(readUiPrefs(memory()), UI_PREF_DEFAULTS);
  assert.deepEqual(readUiPrefs(memory({ 'rh.ui-prefs': '{nope' })), UI_PREF_DEFAULTS);
  assert.deepEqual(readUiPrefs(memory({ 'rh.ui-prefs': JSON.stringify({ textSize: 'huge', reduceMotion: 'yes', chatSend: 'shift' }) })), UI_PREF_DEFAULTS);
  assert.deepEqual(readUiPrefs(null), UI_PREF_DEFAULTS);
  assert.deepEqual(readUiPrefs(memory({ 'rh.ui-prefs': JSON.stringify({ textSize: 'larger', reduceMotion: true, chatSend: 'mod' }) })), { ...UI_PREF_DEFAULTS, textSize: 'larger', reduceMotion: true, chatSend: 'mod' });
});

test('applying sets the attributes index.css reads, and defaults leave none', () => {
  const html = root();
  applyUiPrefs({ textSize: 'large', reduceMotion: true, chatSend: 'mod' }, html);
  assert.deepEqual([...html.attrs], [['data-text-size', 'large'], ['data-reduce-motion', '']]);
  applyUiPrefs(UI_PREF_DEFAULTS, html);
  assert.equal(html.attrs.size, 0);
});

test('a save applies at once and survives a fresh read (a reload)', () => {
  const storage = memory(), html = root();
  saveUiPref('textSize', 'larger', { storage, root: html });
  saveUiPref('chatSend', 'mod', { storage, root: html });
  assert.equal(html.attrs.get('data-text-size'), 'larger');
  assert.deepEqual(readUiPrefs(storage), { ...UI_PREF_DEFAULTS, textSize: 'larger', reduceMotion: false, chatSend: 'mod' });
  assert.throws(() => saveUiPref('textSize', 'enormous', { storage, root: html }), /Unknown textSize/);
});

test('a refused save throws a clear message, but the change holds in this page until a reload', () => {
  const html = root();
  const blocked = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveUiPref('reduceMotion', true, { storage: blocked, root: html }), /Not saved: .* It applies until you reload\./);
  assert.equal(html.attrs.has('data-reduce-motion'), true);
  assert.equal(uiPrefs(blocked).reduceMotion, true);
  // The next successful save clears the held value.
  saveUiPref('reduceMotion', false, { storage: memory(), root: html });
  assert.equal(uiPrefs(blocked).reduceMotion, false);
});

// Owner brief 2026-10-21 item 3: View > Minimap, Rabbit Hole Map and Curious are all on until the learner turns one off; each
// choice is saved on its own, survives a reload, and an odd saved value is the default (on), never an error.
test('the View menu widgets default on and remember each choice on its own', () => {
  assert.deepEqual([UI_PREF_DEFAULTS.minimap, UI_PREF_DEFAULTS.holeMap, UI_PREF_DEFAULTS.curious], [true, true, true]);
  assert.deepEqual(readUiPrefs(memory({ 'rh.ui-prefs': JSON.stringify({ minimap: 'no', holeMap: 0, curious: null }) })), UI_PREF_DEFAULTS);
  const storage = memory(), html = root();
  saveUiPref('holeMap', false, { storage, root: html });
  assert.deepEqual(readUiPrefs(storage), { ...UI_PREF_DEFAULTS, holeMap: false });
  saveUiPref('curious', false, { storage, root: html });
  saveUiPref('holeMap', true, { storage, root: html });
  assert.deepEqual(readUiPrefs(storage), { ...UI_PREF_DEFAULTS, curious: false });
  saveUiPref('minimap', false, { storage, root: html });
  assert.deepEqual([readUiPrefs(storage).minimap, readUiPrefs(storage).holeMap, readUiPrefs(storage).curious], [false, true, false]);
  assert.equal(html.attrs.size, 0, 'widget choices put nothing on <html>');
  assert.throws(() => saveUiPref('curious', 'off', { storage, root: html }), /Unknown curious/);
});

test('the send key is named for the platform', () => {
  assert.equal(modKeyLabel('MacIntel'), '⌘');
  assert.equal(modKeyLabel('Win32'), 'Ctrl');
  assert.equal(sendKeyLabel('enter'), 'Enter');
  assert.match(sendKeyLabel('mod'), /^(Ctrl|⌘)\+Enter$/);
});

test('text size scales chrome tokens only: the canvas world puts authored content back at 1', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(css, /html\[data-text-size\] \[data-canvas-world\] \{ --ui-text: 1; \}/);
  assert.match(css, /html\[data-text-size\],\nhtml\[data-text-size\] \[data-canvas-world\] \{\n  --text-xs: calc\(0\.75rem \* var\(--ui-text, 1\)\);/);
  assert.match(css, /html\[data-reduce-motion\] :not\(:where\(\[data-canvas-world\], \[data-canvas-world\] \*\)\)/);
  assert.match(readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8'), /<div ref=\{worldRef\} data-canvas-world /);
  assert.match(readFileSync(new URL('./main.jsx', import.meta.url), 'utf8'), /applyUiPrefs\(\); \/\/ text size and reduced motion/);
});

test('View > Comments is remembered like the other View switches; the card menu Full content is one checkable row (owner, 2026-10-21)', async () => {
  const { readFileSync } = await import('node:fs');
  const { readUiPrefs: read } = await import('./ui-prefs.js');
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(read(storage).comments, true);
  storage.setItem('rh.ui-prefs', JSON.stringify({ comments: false }));
  assert.equal(read(storage).comments, false);
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /data-card-layout-toggle role=\"menuitemcheckbox\" aria-checked=\{supportsCardLayout\(block\) && block\.cardLayout\?\.mode === 'full'\}/);
  assert.doesNotMatch(canvas, /data-card-layout-menu|role="menuitemradio"/);
});
