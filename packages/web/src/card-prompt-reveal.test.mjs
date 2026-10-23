// The prompt reveal (owner brief 2026-10-23): a card's stored prompt is hidden at rest with no reserved space; hovering, focusing
// into or selecting the card shows a small Show prompt button; opening it shows the full words and Copy, and it stays open until
// Hide or Escape. The Chat's generation status uses the same reveal and shows a /cad line as the lowercase cad pill. Rendered
// with react-dom into linkedom after an esbuild bundle (as content-gestures.test.mjs does). Hover, focus and touch selection are
// checked in a browser only by the existing fork-runner checks.
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
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
const copied = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async text => { copied.push(text); } } } });

const dir = mkdtempSync(join(tmpdir(), 'card-prompt-')), outfile = join(dir, 'prompt.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CardPrompt } from './CardPrompt.jsx'; export { GenerationIndicator } from './ChatOutputs.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
let root = null;
async function mount(element) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  await B.act(async () => root.render(element));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); }); // the running status ticks every second
const card = () => document.getElementById('card');
const fire = (target, type) => B.act(async () => { target.dispatchEvent(new window.Event(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave' })); });
const query = selector => document.querySelector(selector);
const click = element => B.act(async () => { element.click(); });
const mountCard = (props = { text: 'a 100 mm cube' }) => mount(B.createElement('div', { id: 'card', tabIndex: 0 }, B.createElement(B.CardPrompt, props)));
const LONG = Array.from({ length: 60 }, (_, i) => `line ${i}: dimension ${i} mm, fillet <${i}> & "chamfer"`).join('\n');

test('at rest nothing is drawn: no prompt, no button, no Copy, no footer', async () => {
  await mountCard({ text: LONG });
  assert.equal(query('[data-card-prompt-show]'), null);
  assert.equal(query('[data-card-prompt]'), null);
  assert.equal(query('[data-card-prompt-copy]'), null);
  assert.equal(card().textContent, '', 'no words and no label');
  const host = query('[data-card-prompt-host]');
  assert.match(host.className, /\babsolute\b/, 'out of the card layout: no reserved height');
  assert.equal(host.children.length, 0);
});

test('hover shows the button and leaving hides it; focusing into the card or selecting it shows it too', async () => {
  await mountCard();
  await fire(card(), 'pointerenter');
  assert.equal(query('[data-card-prompt-show]')?.textContent, 'Show prompt');
  assert.equal(query('[data-card-prompt]'), null, 'the words wait for a click');
  await fire(card(), 'pointerleave');
  assert.equal(query('[data-card-prompt-show]'), null);
  await fire(card(), 'focusin');
  assert.ok(query('[data-card-prompt-show]'), 'keyboard: focus in the card shows it');
  await fire(card(), 'focusout');
  assert.equal(query('[data-card-prompt-show]'), null);
  await mountCard({ text: 'a 100 mm cube', selected: true });
  assert.ok(query('[data-card-prompt-show]'), 'touch: a selected card shows it with no hover');
  assert.equal(query('[data-card-prompt-show]').tagName, 'BUTTON');
});

test('Show prompt reveals the full words and Copy; the pointer leaving does not close it; Hide and Escape do', async () => {
  await mountCard({ text: LONG, selected: true });
  await click(query('[data-card-prompt-show]'));
  assert.equal(query('[data-card-prompt-text]').textContent, LONG, 'complete, not truncated');
  assert.ok(query('[data-card-prompt-copy]') && query('[data-card-prompt-hide]'));
  assert.equal(query('[data-card-prompt-show]'), null);
  await fire(card(), 'pointerleave');
  await fire(card(), 'focusout');
  assert.ok(query('[data-card-prompt-text]'), 'stays open after the pointer leaves');
  await click(query('[data-card-prompt-hide]'));
  assert.equal(query('[data-card-prompt-text]'), null);
  assert.ok(query('[data-card-prompt-show]'), 'Hide gives the button back');
  await click(query('[data-card-prompt-show]'));
  const escape = new window.Event('keydown', { bubbles: true }); escape.key = 'Escape';
  await B.act(async () => { query('[data-card-prompt]').dispatchEvent(escape); });
  assert.equal(query('[data-card-prompt-text]'), null, 'Escape dismisses');
});

test('Copy writes the complete original text', async () => {
  copied.length = 0;
  await mountCard({ text: LONG, selected: true });
  await click(query('[data-card-prompt-show]'));
  await click(query('[data-card-prompt-copy]'));
  await settle();
  assert.deepEqual(copied, [LONG]);
  assert.equal(query('[role="status"]')?.textContent, 'Copied');
});

test('a card with no stored prompt has no control at all', async () => {
  for (const text of [undefined, null, '']) {
    await mountCard({ text, selected: true });
    assert.equal(query('[data-card-prompt-host]'), null);
    assert.equal(query('[data-card-prompt-show]'), null);
  }
});

const entry = (prompt, gen = { active: true, phase: 'running', label: 'Building geometry' }) => ({ key: 'cad-1', prompt, output: { cardId: 'cad-1', startedAt: new Date(Date.now() - 61000).toISOString() }, gen });
const status = () => query('[data-gen-indicator]').textContent;

test('the generation status shows a cad pill, hides the prompt by default and keeps status, elapsed time and Go to card', async () => {
  copied.length = 0;
  await mount(B.createElement(B.GenerationIndicator, { entries: [entry('/cad a 100 mm cube')], ops: {}, onDismiss() {} }));
  assert.match(status(), /Generating on the canvas/);
  assert.match(status(), /Building geometry/);
  assert.match(query('[data-gen-elapsed]').textContent, /^\d+s$/);
  assert.equal(query('[data-gen-open]').textContent, 'Go to card');
  const pill = query('[data-command-pill="cad"]');
  assert.equal(pill.textContent, 'cad');
  assert.equal(pill.getAttribute('aria-label'), 'cad command');
  assert.doesNotMatch(status(), /\/cad|a 100 mm cube/, 'no slash, no prompt at rest');
  await click(query('[data-card-prompt-show]'));
  assert.equal(query('[data-card-prompt-text]').textContent, 'a 100 mm cube');
  assert.doesNotMatch(status().replace('/cad a 100 mm cube', ''), /\/cad/);
  await click(query('[data-card-prompt-copy]'));
  await settle();
  assert.deepEqual(copied, ['/cad a 100 mm cube'], 'Copy keeps the original command line');
  await click(query('[data-card-prompt-hide]'));
  assert.equal(query('[data-card-prompt-text]'), null);
});

test('a status for another command hides its line the same way, without a cad pill', async () => {
  await mount(B.createElement(B.GenerationIndicator, { entries: [entry('/explain softmax')], ops: {}, onDismiss() {} }));
  assert.equal(query('[data-command-pill]'), null);
  assert.doesNotMatch(status(), /softmax/);
  await click(query('[data-card-prompt-show]'));
  assert.equal(query('[data-card-prompt-text]').textContent, '/explain softmax');
});

test('only generated-card prompts use the reveal: CardPrompt is drawn from promptUsed and a chat card question alone', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.deepEqual([...canvas.matchAll(/<CardPrompt text=\{([^}]+)\}/g)].map(match => match[1]), ['exchange.question', 'block.promptUsed']);
  assert.doesNotMatch(canvas, /PROMPT_ROW_H|setPromptHeight/);
});
