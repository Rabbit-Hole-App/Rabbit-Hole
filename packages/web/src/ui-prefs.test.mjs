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
  assert.deepEqual(readUiPrefs(memory({ 'rh.ui-prefs': JSON.stringify({ textSize: 'larger', reduceMotion: true, chatSend: 'mod' }) })), { textSize: 'larger', reduceMotion: true, chatSend: 'mod' });
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
  assert.deepEqual(readUiPrefs(storage), { textSize: 'larger', reduceMotion: false, chatSend: 'mod' });
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
