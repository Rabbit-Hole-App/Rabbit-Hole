// The transcript window (TranscriptWindow.jsx) mounted with react-dom into linkedom after an esbuild bundle (the pattern of explanation-audio.test.mjs). WIRING and markup, not pixels:
// the owner sees the real window beside a card on 8878.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
const dir = mkdtempSync(join(tmpdir(), 'transcript-window-')), outfile = join(dir, 'w.cjs');
await esbuild.build({
  stdin: { contents: "export { default as TranscriptWindow } from './TranscriptWindow.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client'; export { openTranscript, updateTranscript, closeTranscript } from './audio-playing.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const SCRIPT = 'The sigmoid squashes any score. It passes through one half at zero.';
const root = B.createRoot(document.getElementById('app'));
const $ = selector => document.querySelector(selector);
await B.act(async () => root.render(B.createElement('div', null, B.createElement(B.TranscriptWindow, { id: 'a' }), B.createElement(B.TranscriptWindow, { id: 'b' }))));
test.after(async () => { B.closeTranscript('a'); await B.act(async () => root.unmount()); });

test('nothing is drawn until a script is playing, and a card without one never gets a window', async () => {
  assert.equal($('[data-card-transcript]'), null);
  await B.act(async () => B.openTranscript('a', '   '));
  assert.equal($('[data-card-transcript]'), null);
});

test('it is a region named Transcript, for the owning card only, and shows only the words spoken so far', async () => {
  await B.act(async () => B.openTranscript('a', SCRIPT));
  assert.equal(document.querySelectorAll('[data-card-transcript]').length, 1);
  const region = $('[data-card-transcript]');
  assert.equal(region.getAttribute('role'), 'region');
  assert.equal(region.getAttribute('aria-label'), 'Transcript');
  assert.equal($('[data-transcript-text]').textContent, '', 'at t = 0 nothing has been said');
  await B.act(async () => B.updateTranscript('a', 20, 80));
  const shown = $('[data-transcript-text]').textContent;
  assert.ok(shown.length > 0 && shown.length < SCRIPT.length && SCRIPT.startsWith(shown), shown);
  assert.doesNotMatch(region.textContent, /half at zero/, 'unspoken words are not in the DOM');
  assert.equal($('[data-transcript-text]').getAttribute('aria-live'), 'off', 'never announced word by word');
  await B.act(async () => B.updateTranscript('a', 80, 80));
  assert.equal($('[data-transcript-text]').textContent, SCRIPT, 'at the end the full text stays');
});

test('transparent: no fill, border, shadow or blur; canvas ink; only the text and the close button take the pointer', () => {
  const region = $('[data-card-transcript]'), text = $('[data-transcript-text]'), close = $('button[title="Close transcript"]');
  const classes = [...document.querySelectorAll('[data-card-transcript], [data-card-transcript] *')].map(e => e.getAttribute('class') || '').join(' ');
  assert.doesNotMatch(classes, /(?<![\w:-])(bg-(?!transparent)\S+|border(?!-0)\S*|shadow\S*|backdrop-\S+|blur\S*|ring\S*)/, classes);
  assert.match(region.className, /\bpointer-events-none\b/);
  assert.match(region.className, /\bleft-full\b/); assert.match(region.className, /\btop-0\b/); assert.match(region.className, /\bml-3\b/); assert.match(region.className, /\bw-72\b/); assert.match(region.className, /\bmax-h-full\b/);
  assert.match(text.className, /\bpointer-events-auto\b/); assert.match(close.className, /\bpointer-events-auto\b/);
  assert.match(text.className, /var\(--learn-canvas-ink\)/); assert.match(text.className, /text-\[13px\]/); assert.match(text.className, /leading-snug/);
  assert.ok(text.hasAttribute('data-scroll'), 'the canvas leaves a scrollable region to scroll itself');
  assert.equal(close.getAttribute('aria-label'), 'Close transcript');
  assert.equal(close.getAttribute('type'), 'button');
});

test('a press or a wheel on the text never reaches the card or the canvas', async () => {
  const seen = [];
  document.body.addEventListener('pointerdown', () => seen.push('pointerdown'));
  document.body.addEventListener('wheel', () => seen.push('wheel'));
  const text = $('[data-transcript-text]');
  text.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  text.dispatchEvent(new window.Event('wheel', { bubbles: true }));
  assert.deepEqual(seen, [], 'both are stopped at the text');
});

test('the close button hides the window and a new play opens it again', async () => {
  await B.act(async () => $('button[title="Close transcript"]').dispatchEvent(new window.Event('click', { bubbles: true })));
  assert.equal($('[data-card-transcript]'), null);
  await B.act(async () => B.openTranscript('a', SCRIPT));
  assert.ok($('[data-card-transcript]'));
});

test('another card starting moves the window to it', async () => {
  await B.act(async () => B.openTranscript('b', 'Other words here.'));
  assert.equal(document.querySelectorAll('[data-card-transcript]').length, 1);
  await B.act(async () => B.updateTranscript('b', 10, 10));
  assert.equal($('[data-transcript-text]').textContent, 'Other words here.');
});

test('the card mounts it once in the canvas node, and the open card rises above its neighbours', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8'), css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  assert.equal(canvas.match(/<TranscriptWindow id=\{id\} \/>/g).length, 1);
  assert.match(css, /\[data-block\]:has\(> \[data-card-transcript\]\)[^{]*\{ z-index: 6; \}/);
});
