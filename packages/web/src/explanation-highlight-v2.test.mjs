// E2 selection toolbar on a v2 Explanation card (EXP-13 layout): Highlight, Create note and Ctrl+K must leave the card drawing as it was.
// LearningBlockBody mounted ONCE with react-dom in linkedom and re-rendered in place with what it saved, as the canvas does (the other card tests remount).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { contentRevision, fieldText } from './explanation-interactions.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
// linkedom has no document.oninput and its input has no `type`: without both, React does not treat the field as a text input and never fires onChange.
document.oninput = null;
if (!('type' in window.HTMLInputElement.prototype)) Object.defineProperty(window.HTMLInputElement.prototype, 'type', { configurable: true, get() { return this.getAttribute('type') || 'text'; } });
window.Element.prototype.getBoundingClientRect ||= () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
globalThis.MERMAID_STUB = { fail: false, rendered: [] };

const dir = mkdtempSync(join(tmpdir(), 'explanation-interactions-')), outfile = join(dir, 'explanation.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { ExplanationHost } from './explanation-host.js'; export { ChatWorkspace } from './chat-workspace.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
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

// A v2 card (EXP-13): prose with maths, a traced flow diagram, prose, a ready picture, prose; the E2 envelope built the way the server builds it.
const FLOW = { version: 1, diagram: { kind: 'flow', title: 'Is the room colder?', highlightPath: ['a', 'b', 'd'], nodes: [{ id: 'a', label: 'Hot coffee', role: 'process' }, { id: 'b', label: 'Room colder?', role: 'decision' }, { id: 'c', label: 'Heat flows in', role: 'outcome' }, { id: 'd', label: 'Heat flows out', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'No' }, { from: 'b', to: 'd', label: 'Yes' }] } };
const PICTURE = { version: 1, id: 'cup', prompt: 'A steaming cup, flat illustration', alt: 'A steaming cup', caption: 'Steam leaves the cup.' };
const V2_BODY = `Heat leaves the cup in proportion to the temperature gap, so $Q_{out}$ is large at first and the gap shrinks to $0$.\n\n\`\`\`rh-diagram\n${JSON.stringify(FLOW)}\n\`\`\`\n\nThe hot cup sheds heat fastest while the gap is $1$ or more.\n\n\`\`\`rh-illustration\n${JSON.stringify(PICTURE)}\n\`\`\`\n\nLater the curve flattens near room temperature.`;
const cpStart = (text, needle) => Array.from(text.slice(0, text.indexOf(needle))).length;
async function v2Card() {
  const block = { id: 'card-v2', type: 'explanation', dx: 0, dy: 0, w: 440, h: 520, title: 'Why coffee cools fastest at first', depth: 'standard', body: V2_BODY,
    figures: { cup: { status: 'ready', src: '/lesson-assets/cup.png', alt: 'A steaming cup', caption: 'Steam leaves the cup.' } } };
  const revision = await contentRevision(block), text = fieldText(block, 'body'), start = cpStart(text, 'temperature gap');
  return { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision,
    questions: [{ id: 'q-1', text: 'Why does the gap matter?' }, { id: 'q-2', text: 'What is Newton cooling?' }, { id: 'q-3', text: 'When does it stop?' }],
    terms: [{ id: 't-1', label: 'temperature gap', definition: 'The difference between the coffee and the room.', anchor: { field: 'body', quote: 'temperature gap', occurrence: 0, start, end: start + 'temperature gap'.length } }] } };
}

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
let root = null, errors = [];
const realError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); };
test.after(async () => { console.error = realError; if (root) await B.act(async () => root.unmount()); });
// The canvas keeps ONE mounted card and re-renders it with the saved block (AdaptiveCanvas changeBlock -> setBlocks): render in place, never remount.
let current = null, saved = [];
const draw = (block, { readOnly = false } = {}) => B.act(async () => root.render(B.createElement(B.ExplanationHost.Provider, { value: host }, B.createElement(B.ChatWorkspace.Provider, { value: chat },
  B.createElement(B.LearningBlockBody, { block, readOnly, onChange: next => { saved.push(next); current = next; }, onChangeQuiet: next => { saved.push(next); current = next; }, onFile() {}, appName: 'demo', selected: true, onExpandHeight() {} })))));
const notes = [], asked = [], explores = [];
const host = { ask: async request => { if (request.destination === 'explore') explores.push(request); return true; }, note: request => { notes.push(request); return 'note-1'; }, quickAsk: () => { asked.push(1); return true; } };
const chat = { addToChat: ref => { added.push(ref); }, ask() {}, composer: { focus() {}, prepare() {} } };
async function mountInPlace(block) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  current = block; saved = []; errors = [];
  await draw(block); await settle();
}
const $ = selector => document.querySelector(selector);
const click = target => B.act(async () => { target.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
const textNodes = el => { const out = []; const walk = n => { for (const c of n.childNodes) { if (c.nodeType === 3) out.push(c); else if (!c.matches?.('[data-chat-math],[data-tutor-diagram]')) walk(c); } }; walk(el); return out; };
const select = (startContainer, startOffset, endContainer, endOffset, text) => {
  const range = { startContainer, startOffset, endContainer, endOffset, getBoundingClientRect: () => ({ left: 5, top: 5, right: 50, bottom: 20, width: 45, height: 15 }) };
  window.getSelection = () => ({ rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => text, removeAllRanges() { window.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '' }); } });
  return B.act(async () => { document.dispatchEvent(new window.Event('selectionchange')); await new Promise(resolve => setTimeout(resolve, 25)); });
};
// The card as drawn: title row, the SVG diagram with its traced path, typeset maths, the picture, the pill; and never the plain-words fallback.
const assertDrawn = label => {
  assert.deepEqual(errors.filter(e => /explanation_card|removeChild|insertBefore|NotFoundError/i.test(e)), [], `${label}: no render error`);
  assert.ok($('[data-explanation-head]'), `${label}: the title row`);
  assert.ok($('svg[data-tutor-diagram="flow"]'), `${label}: the diagram is drawn`);
  assert.doesNotMatch($('#app').textContent, /rh-diagram|"nodes"|\$Q_\{out\}\$|\$0\$|\$1\$/, `${label}: no raw Markdown`);
  assert.ok($('[data-explanation-field="body"] .katex'), `${label}: maths typeset`);
  assert.ok($('[data-figure-id="cup"]'), `${label}: the picture`);
  assert.ok($('[data-term-id="t-1"]'), `${label}: the pill`);
};
const firstSentence = () => textNodes($('[data-explanation-field="body"] p'));

test('Highlight on a v2 card (diagram, maths, picture) adds only the mark: the saved block keeps everything and the card keeps drawing', async () => {
  const card = await v2Card();
  await mountInPlace(card);
  assertDrawn('before');
  const nodes = firstSentence(); // "Heat leaves the cup in proportion to the ", "temperature gap" (pill), ", so ", ...
  await select(nodes[0], 0, nodes[0], 'Heat leaves the cup'.length, 'Heat leaves the cup');
  await click($('[data-explanation-selection-toolbar] [aria-label="Highlight"]'));
  assert.equal(saved.length, 1);
  const next = saved[0];
  for (const key of Object.keys(card)) assert.deepEqual(next[key], card[key], `the saved block keeps ${key}`);
  assert.deepEqual(next.highlights.map(h => h.segments.map(s => s.quote)), [['Heat leaves the cup']]);
  await draw(next); await settle(); // the canvas re-renders the same card with the saved block
  assertDrawn('after Highlight');
  assert.equal([...document.querySelectorAll('[data-highlight-ids]')].map(n => n.textContent).join(''), 'Heat leaves the cup');
  // A second highlight later in the body, past the diagram and the maths.
  const later = textNodes($('[data-explanation-field="body"]')).find(n => n.data.includes('sheds heat fastest'));
  await select(later, later.data.indexOf('sheds'), later, later.data.indexOf('sheds') + 'sheds heat'.length, 'sheds heat');
  await click($('[data-explanation-selection-toolbar] [aria-label="Highlight"]'));
  await draw(current); await settle();
  assertDrawn('after a second Highlight');
  assert.equal(current.highlights.length, 2);
});

test('Create note and Ctrl+K on a v2 card leave the card as it is', async () => {
  const card = await v2Card();
  await mountInPlace(card);
  let nodes = firstSentence();
  await select(nodes[0], 0, nodes[0], 'Heat leaves the cup'.length, 'Heat leaves the cup');
  await click($('[data-explanation-selection-toolbar] [aria-label="Ctrl+K"]'));
  assert.equal(asked.length, 1);
  await settle();
  assertDrawn('after Ctrl+K');
  nodes = firstSentence();
  await select(nodes[0], 0, nodes[0], 'Heat leaves the cup'.length, 'Heat leaves the cup');
  await click($('[data-explanation-selection-toolbar] [aria-label="Create note"]'));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].quote, 'Heat leaves the cup');
  await settle();
  if (saved.length) { await draw(current); await settle(); }
  assertDrawn('after Create note');
  assert.equal(saved.every(next => Object.keys(card).every(key => JSON.stringify(next[key]) === JSON.stringify(card[key]))), true, 'nothing it saved changed the card');
});

// Owner 2026-11-08: a saved highlight offers the app's existing Remove highlight (the file and webpage cards' highlight menu).
test('clicking a saved highlight after a reload offers Remove highlight; removing it saves the block without that highlight and nothing else changes', async () => {
  const card = await v2Card();
  const text = fieldText(card, 'body'), start = cpStart(text, 'Heat leaves the cup');
  const segment = { field: 'body', start, end: start + 'Heat leaves the cup'.length, quote: 'Heat leaves the cup', prefix: '', suffix: text.slice(19, 43), contentRevision: card.interactions.contentRevision };
  const reloaded = { ...card, highlights: [{ id: 'h-1', contentRevision: card.interactions.contentRevision, segments: [segment] }] };
  await mountInPlace(reloaded); // as the board loads it
  const mark = $('[data-highlight-ids="h-1"]');
  assert.ok(mark, 'the saved highlight is drawn');
  await click(mark);
  const menu = $('[data-explanation-highlight-menu]');
  assert.ok(menu, 'the highlight menu');
  assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map(b => b.textContent), ['Remove highlight']);
  await click(menu.querySelector('[role="menuitem"]'));
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].highlights, []);
  for (const key of Object.keys(card)) assert.deepEqual(saved[0][key], card[key], `the saved block keeps ${key}`);
  await draw(saved[0]); await settle();
  assertDrawn('after Remove highlight');
  assert.equal($('[data-highlight-ids]'), null);
  assert.equal($('[data-explanation-highlight-menu]'), null, 'the menu closed');
  // A read-only viewer sees the highlight but is offered nothing.
  await mountInPlace(reloaded);
  await draw(reloaded, { readOnly: true }); await settle();
  await click($('[data-highlight-ids="h-1"]'));
  assert.equal($('[data-explanation-highlight-menu]'), null);
});

test('Explore is the app\'s primary blue Button; the + sits clear of the card\'s bottom connector port', async () => {
  await mountInPlace(await v2Card());
  await click($('[data-term-id="t-1"]'));
  const explore = $('[data-explore]');
  assert.ok(explore && explore.textContent === 'Explore' && /\bbg-primary-fill\b/.test(explore.className) && /\btext-white\b/.test(explore.className), 'ui.jsx Button variant="primary"');
  await click(explore);
  assert.equal(explores.length, 1);
  // The port is h-4 (16 px) centred on the bottom edge, so it reaches 8 px below the card; the + must start below it with a gap.
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /data-port=\{side\}[\s\S]{0,200}className=\{`absolute left-1\/2 z-20 h-4 w-4 -translate-x-1\/2[^`]*'-bottom-2'/, 'the port as measured');
  const plus = $('[data-follow-up-toggle]');
  const px = Number(/\bmt-(\d+)\b/.exec(plus.className)[1]) * 4;
  assert.ok(px >= 8 + 8 && /\btop-full\b/.test(plus.className), `the + starts ${px} px below the card, past the port's 8 px and a gap`);
  await click(plus);
  const form = $('[data-follow-up]'), formPx = Number(/\bmt-(\d+)\b/.exec(form.className)[1]) * 4;
  assert.ok(formPx >= px + 28 + 8, 'the field sits under the + (28 px) with a gap');
});
