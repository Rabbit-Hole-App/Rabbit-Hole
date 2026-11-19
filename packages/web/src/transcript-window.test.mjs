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
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
const dir = mkdtempSync(join(tmpdir(), 'transcript-window-')), outfile = join(dir, 'w.cjs');
await esbuild.build({
  stdin: { contents: "export { default as TranscriptWindow } from './TranscriptWindow.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client'; export { openTranscript, updateTranscript, closeTranscript } from './audio-playing.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) { // Md.jsx pulls in mermaid and shiki, which the window never draws
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg></svg>" }; } };' }));
    build.onLoad({ filter: /^shiki$/, namespace: 'stub' }, () => ({ contents: 'export async function codeToHtml() { throw new Error("no shiki in node"); }' }));
  } }],
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
  assert.match(region.className, /\bleft-full\b/); assert.match(region.className, /\btop-0\b/); assert.match(region.className, /\bml-3\b/); assert.match(region.className, /\bw-72\b/); assert.doesNotMatch(region.className, /max-h/, "the height is the text block's own, not the card's");
  assert.match(text.className, /\boverflow-y-auto\b/); assert.match(text.className, /\bshrink-0\b/);
  const px = Number.parseInt(text.style.height, 10);
  assert.ok(text.style.height.endsWith('px') && px >= 160 && px <= 360, `an explicit height in 160..360 px: ${text.style.height}`);
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

const BS = String.fromCharCode(92); // a backslash, for LaTeX commands
test('equations are typeset by the app inline renderer: KaTeX markup for a revealed span, none for an unspoken one, source text for invalid LaTeX', async () => {
  const text = `Decay is $e^{-1}$ per step. Then $${BS}frac{1}{N}$ follows. Last $${BS}frac{1}{$ is broken.`;
  await B.act(async () => B.openTranscript('b', text));
  await B.act(async () => B.updateTranscript('b', 20, 100));
  let shown = $('[data-transcript-text]');
  assert.ok(shown.querySelector('.katex'), 'the first equation is typeset');
  assert.ok(shown.querySelector('[data-chat-math="inline"]'), 'by the same inline renderer as the follow-up strips (MathText)');
  assert.equal(shown.querySelectorAll('.katex').length, 1, 'the later equations are not shown yet');
  assert.doesNotMatch(shown.innerHTML, /frac/, 'an unspoken equation is not in the DOM, not even as source');
  assert.doesNotMatch(shown.textContent, /\$/, 'no dollar signs: the equation is typeset, not printed');
  await B.act(async () => B.updateTranscript('b', 100, 100));
  shown = $('[data-transcript-text]');
  assert.equal(shown.querySelectorAll('.katex').length, 2, 'both valid equations at the end');
  assert.equal(shown.querySelectorAll('.katex-error').length, 1, 'the invalid one is KaTeX failure (throwOnError false), its source text kept');
  assert.match(shown.textContent, /Last/);
  await B.act(async () => B.closeTranscript('b'));
});

test('invalid LaTeX stays as its source text (no error box), an unclosed dollar is plain text, and KaTeX output takes the canvas ink', async () => {
  await B.act(async () => B.openTranscript('b', `Bad $${BS}frac{1}{$ here, and a lone $5 stays.`));
  await B.act(async () => B.updateTranscript('b', 10, 10));
  const shown = $('[data-transcript-text]');
  assert.match(shown.textContent, /Bad .*frac\{1\}\{ here, and a lone \$5 stays\./, 'the invalid equation shows as its source, the lone dollar as text');
  assert.equal(shown.querySelectorAll('.katex').length, 0);
  assert.match(shown.className, /text-\[var\(--learn-canvas-ink\)\]/, 'KaTeX output inherits this colour: its root rule sets none');
  assert.match(shown.className, /\[&_\.katex-error\]:!text-\[var\(--learn-canvas-ink\)\]/, "and KaTeX's failure span, which pins its own red inline, is overridden to the same ink");
  const css = readFileSync(new URL('../../../node_modules/katex/dist/katex.min.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css.match(/\.katex\{[^}]*\}/)?.[0] || '', /[^-]color:/, "katex's own root rule sets no colour");
  await B.act(async () => B.closeTranscript('b'));
});

test('auto-scroll: follows the newest text, ignores its own smooth scroll, stops after a deliberate scroll up, resumes at the bottom and on a new run', async () => {
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} says something.`).join(' ');
  await B.act(async () => B.openTranscript('b', long));
  const element = $('[data-transcript-text]'), state = { top: 0, height: 1000, scrolls: [] };
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => state.height });
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(element, 'scrollTop', { configurable: true, get: () => state.top, set: v => { state.top = v; } });
  element.scrollTo = ({ top, behavior }) => { state.scrolls.push([top, behavior]); state.top = top; };
  const scroll = top => B.act(async () => { state.top = top; element.dispatchEvent(new window.Event('scroll')); });
  const grow = (t, height) => B.act(async () => { state.height = height; B.updateTranscript('b', t, 100); });
  await grow(10, 1000);
  assert.deepEqual(state.scrolls.at(-1), [800, 'smooth'], 'follows to the very bottom, with the short smooth scroll');
  await scroll(400); // the browser's own smooth scroll still moving: not the learner
  await grow(20, 1200);
  assert.deepEqual(state.scrolls.at(-1), [1000, 'smooth'], 'still following');
  await new Promise(resolve => setTimeout(resolve, 450)); // our scroll has settled
  await scroll(300); // the learner scrolls up by hand
  const before = state.scrolls.length;
  await grow(30, 1400);
  assert.equal(state.scrolls.length, before, 'not pulled back down while they read');
  assert.equal(state.top, 300);
  await scroll(1200); // and back to the bottom (1400 - 200)
  await grow(40, 1600);
  assert.deepEqual(state.scrolls.at(-1), [1400, 'smooth'], 'following again');
  await new Promise(resolve => setTimeout(resolve, 450));
  await scroll(0);
  await grow(0, 200); // a replay starts empty (nothing to scroll)
  await grow(5, 1000);
  assert.deepEqual(state.scrolls.at(-1), [800, 'smooth'], 'a new run follows again');
  await B.act(async () => B.closeTranscript('b'));
});
