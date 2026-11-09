// E2 interaction layer of the delivered Explanation card (docs/features/explain.md section 4 and 5, EXP-05-C01..C06, EXP-12-C06): LearningBlockBody's
// ExplanationBody rendered with react-dom into linkedom after an esbuild bundle, the same mount pattern as explanation-card.test.mjs. The canvas host
// (explanation-host.js) and the Chat workspace are fakes that record their calls: these checks prove WIRING (what is captured, what is sent, what is saved,
// what is omitted), not the Chat, the generation, the board or the layout. Selection ranges are plain objects over the rendered nodes (linkedom has no
// Selection); real selection, focus, hover reveal and positioning are the owner's browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { contentRevision, fieldText, quotedNote, withConsumed, withHighlight } from './explanation-interactions.js';
import { runsOf } from './learn-rich-text.js';

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

const BODY = 'A decision tree makes a prediction by asking simple questions. Each answer leads down a branch until you reach a leaf.\n\nWhen a tree learns, it looks for questions that put similar cases together.';
const MORE = 'A leaf is where a branch ends.\n\nA second tree here.';
const base = { id: 'card-1', type: 'explanation', dx: 0, dy: 0, title: 'Why trees', body: BODY, more: [{ label: 'Leaves', text: MORE }] };
const cpStart = (text, needle, nth = 0) => { let at = -1; for (let i = 0; i <= nth; i += 1) at = text.indexOf(needle, at + 1); return Array.from(text.slice(0, at)).length; };
// A card with the E2 envelope, built the way the server would: revision of the final text, anchors resolved against the canonical display text.
async function envelope(over = {}) {
  const block = { ...base, ...over };
  const revision = await contentRevision(block), body = fieldText(block, 'body');
  const term = (id, label, field, occurrence, definition) => {
    const text = fieldText(block, field), start = cpStart(text, label, occurrence);
    return { id, label, definition, anchor: { field, quote: label, occurrence, start, end: start + Array.from(label).length } };
  };
  return { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision,
    questions: [{ id: 'q-1', text: 'How does a tree choose its first question?' }, { id: 'q-2', text: 'What happens when a tree gets too deep?' }, { id: 'q-3', text: 'Why do the paths make rectangles?' }],
    terms: [term('t-1', 'decision tree', 'body', 0, 'A way to make a prediction by following questions.'), term('t-2', 'leaf', 'body', 0, 'Where a branch ends.'), term('t-3', 'tree', 'body', 1, 'Second tree, learning.')] }, _body: body };
}

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
let root = null;
async function mount(block, { host = null, chat = null, readOnly = false, onChange = () => {}, onChangeQuiet = () => {} } = {}) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  const body = B.createElement(B.LearningBlockBody, { block, onChange, onChangeQuiet, onFile() {}, appName: 'demo', selected: true, readOnly, onExpandHeight() {} });
  const withHost = B.createElement(B.ExplanationHost.Provider, { value: host }, body);
  await B.act(async () => root.render(chat ? B.createElement(B.ChatWorkspace.Provider, { value: chat }, withHost) : withHost));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); });
const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const fire = (target, type, init = {}) => B.act(async () => { target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), init)); });
const click = target => fire(target, 'click');
const textNodes = el => { const out = []; const walk = n => { for (const c of n.childNodes) { if (c.nodeType === 3) out.push(c); else walk(c); } }; walk(el); return out; };
const toasts = [];
window.addEventListener('small:toast', event => toasts.push(event.detail));

test('a card without the envelope is exactly what it was: no field wrapper, no pill, no suggestions, no follow-up, no listener-driven toolbar', async () => {
  await mount(base, { host: { ask: async () => true, dig() {}, note: () => 'n' } });
  assert.equal($('[data-explanation-field]'), null, 'not even a wrapper');
  assert.equal($('[data-term-id]'), null);
  assert.equal($('[data-explanation-suggestions]'), null, 'no blank row');
  assert.equal($('[data-follow-up-toggle]'), null);
  assert.equal($('[data-explanation-selection-toolbar]'), null);
  // The envelope present but the switch never produced questions or terms (an author with no terms): no empty list either.
  const empty = await envelope();
  await mount({ ...empty, interactions: { ...empty.interactions, questions: [], terms: [] } }, { host: { ask: async () => true } });
  assert.equal($('[data-explanation-suggestions]'), null);
  assert.equal($('[data-term-id]'), null);
});

test('orange term pills mark only the anchored occurrences, never every equal word, and add no text', async () => {
  const card = await envelope();
  await mount(card, { host: { ask: async () => true, dig() {} } });
  const flow = $('[data-explanation-flow]');
  const pills = $$('[data-term-id]');
  assert.deepEqual(pills.map(p => [p.getAttribute('data-term-id'), p.textContent]), [['t-1', 'decision tree'], ['t-2', 'leaf'], ['t-3', 'tree']]);
  // Owner 2026-11-08: no solid fill; the Claude orange token on the text and a thin outline, never a hex. Hover only tints faintly.
  assert.ok(pills.every(p => /\btext-claude-deep\b/.test(p.className) && /\bborder-claude\/50\b/.test(p.className)), 'the Claude orange token, never a hex');
  assert.ok(pills.every(p => !/(^|\s)bg-claude(\s|$)|text-black/.test(p.className)), 'no solid fill, no black text on it');
  // "tree" occurs three times in the body ("decision tree", "a tree learns"); only the anchored second whole-word occurrence is a pill.
  const bodyField = $('[data-explanation-field="body"]');
  assert.equal([...bodyField.textContent.matchAll(/\btree\b/g)].length, 2);
  const third = pills.find(p => p.getAttribute('data-term-id') === 't-3');
  assert.match(third.previousSibling.data, /When a $/, 'the pill is the "tree" of "When a tree learns", not the one inside "decision tree"');
  assert.equal(bodyField.textContent.replace(/\s+/g, ''), 'A decision tree makes a prediction by asking simple questions. Each answer leads down a branch until you reach a leaf. When a tree learns, it looks for questions that put similar cases together.'.replace(/\s+/g, ''), 'decoration adds and removes no text');
  assert.ok(flow.contains(pills[0]));
  const first = pills[0];
  assert.equal(first.getAttribute('role'), 'button');
  assert.equal(first.getAttribute('tabindex'), '0');
  assert.equal(first.getAttribute('aria-expanded'), 'false');
  assert.equal($('[data-term-note]'), null, 'no definition until a pill is activated');
});

test('a pill opens ONLY its definition with Dig Rabbit Hole; Dig passes the exact term, card id and revision; Escape closes and returns focus', async () => {
  const card = await envelope();
  const digs = [];
  await mount(card, { host: { ask: async () => true, dig: request => digs.push(request) } });
  const [decision, leaf] = $$('[data-term-first]');
  let focused = null;
  decision.focus = () => { focused = decision; };
  await click(decision);
  const note = $('[data-term-note]');
  assert.ok(note, 'the definition');
  assert.equal($$('[data-term-note]').length, 1, 'only the relevant definition');
  assert.match(note.textContent, /decision tree/);
  assert.match(note.textContent, /A way to make a prediction by following questions\./);
  assert.equal(decision.getAttribute('aria-expanded'), 'true');
  assert.match(note.className, /select-text/, 'definition text stays selectable');
  assert.doesNotMatch(note.textContent, /Where a branch ends/);
  // Another pill replaces it.
  await click(leaf);
  assert.equal($$('[data-term-note]').length, 1);
  assert.match($('[data-term-note]').textContent, /Where a branch ends\./);
  await click($('[data-dig-rabbit-hole]'));
  assert.deepEqual(digs.map(({ id, term, termId, revision }) => ({ id, term, termId, revision })), [{ id: 'card-1', term: 'leaf', termId: 't-2', revision: card.interactions.contentRevision }]);
  assert.equal($('[data-term-note]'), null, 'closed after digging');
  // Keyboard: Enter opens, Escape closes and the pill takes the focus back.
  await fire(decision, 'keydown', { key: 'Enter' });
  assert.ok($('[data-term-note]'), 'Enter activates');
  await fire(document, 'keydown', { key: 'Escape' });
  assert.equal($('[data-term-note]'), null);
  assert.equal(focused, decision, 'focus returns to the pill');
  await fire(decision, 'keydown', { key: ' ' });
  assert.ok($('[data-term-note]'), 'Space activates');
  // A press outside dismisses without moving focus.
  focused = null;
  await fire(document.body, 'pointerdown');
  assert.equal($('[data-term-note]'), null);
  assert.equal(focused, null);
});

test('a pill press never reaches the card (no drag, no select)', async () => {
  const card = await envelope();
  await mount(card, { host: { ask: async () => true } });
  let reached = 0;
  document.body.addEventListener('pointerdown', () => { reached += 1; });
  await fire($('[data-term-first]'), 'pointerdown');
  assert.equal(reached, 0);
  await fire($('[data-explanation-field="body"] p'), 'pointerdown');
  assert.equal(reached, 1, 'ordinary text still selects the card');
});

test('a card edited after authoring (another revision) shows no pills and no suggestions; its saved terms are not moved onto the new text', async () => {
  const card = await envelope();
  await mount({ ...card, body: BODY.replace('leaf', 'leaf node') }, { host: { ask: async () => true } });
  assert.equal($('[data-term-id]'), null);
  assert.equal($('[data-explanation-suggestions]'), null);
  assert.ok($('[data-follow-up-toggle]'), 'the follow-up conversation is not tied to the old text');
});

test('suggestions: three questions; Ask here and Ask in a new card per row; send captures card, revision and question; cleared once, after admission', async () => {
  const card = await envelope();
  const calls = [], saved = [];
  let admit = null;
  const host = { ask: (request, { onAdmitted }) => { calls.push(request); return new Promise(resolve => { admit = () => { onAdmitted(); resolve(undefined); }; }); } };
  await mount(card, { host, onChangeQuiet: next => saved.push(next) });
  const rows = $$('[data-explanation-suggestion]');
  assert.deepEqual(rows.map(row => row.textContent), card.interactions.questions.map(q => q.text));
  assert.deepEqual([...rows[0].querySelectorAll('button')].map(b => b.getAttribute('aria-label')), ['Ask here', 'Ask in a new card']);
  assert.ok(before($('[data-explanation-flow] [data-explanation-field]'), $('[data-explanation-suggestions]')), 'below the reading');
  const [here, branch] = rows[1].querySelectorAll('button');
  await click(here);
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], actionId: typeof calls[0].actionId }, { id: 'card-1', revision: card.interactions.contentRevision, question: 'What happens when a tree gets too deep?', destination: 'here', actionId: 'string' });
  assert.equal(saved.length, 0, 'not consumed before admission');
  assert.ok($$('[data-explanation-suggestion] button').every(b => b.disabled), 'the actions are disabled while the send waits');
  assert.equal(here.getAttribute('aria-busy'), 'true');
  // A double click, or the other action, cannot send a second one.
  await click(here); await click(branch); await click(rows[0].querySelector('button'));
  assert.equal(calls.length, 1, 'one send');
  await B.act(async () => admit());
  await settle();
  assert.equal(saved.length, 1, 'consumed once, at admission');
  assert.deepEqual(saved[0].interactionState, { contentRevision: card.interactions.contentRevision, consumed: true, action: { id: calls[0].actionId, question: calls[0].question, destination: 'here' } });
  assert.equal(saved[0].id, 'card-1');
  // The saved card reloads with no suggestions and no empty row.
  await mount(saved[0], { host });
  assert.equal($('[data-explanation-suggestions]'), null);
  assert.ok($('[data-term-id]'), 'terms are unaffected');
});

const before = (a, b) => !!(a.compareDocumentPosition(b) & 4);

test('Ask in a new card sends the written action; a refusal before admission keeps the questions and the buttons work again', async () => {
  const card = await envelope();
  const calls = [], saved = [];
  toasts.length = 0;
  await mount(card, { host: { ask: async request => { calls.push(request); return false; } }, onChangeQuiet: next => saved.push(next) });
  const [, branch] = $$('[data-explanation-suggestion]')[0].querySelectorAll('button');
  await click(branch);
  await settle();
  assert.deepEqual(calls.map(c => [c.destination, c.question]), [['card', 'How does a tree choose its first question?']]);
  assert.equal(saved.length, 0, 'nothing consumed');
  assert.equal($$('[data-explanation-suggestion]').length, 3, 'the three questions stay');
  assert.ok($$('[data-explanation-suggestion] button').every(b => !b.disabled), 'and can be pressed again');
  assert.equal(toasts.at(-1)?.tone, 'error', 'the failure is said with toast()');
  await click(branch);
  await settle();
  assert.equal(calls.length, 2);
});

test('a late admission after the text changed does not consume the new revision\'s questions', async () => {
  const card = await envelope();
  const saved = [];
  let admit = null;
  const host = { ask: (request, { onAdmitted }) => new Promise(resolve => { admit = () => { onAdmitted(); resolve(undefined); }; }) };
  await mount(card, { host, onChangeQuiet: next => saved.push(next) });
  await click($$('[data-explanation-suggestion]')[0].querySelector('button'));
  // The learner edits the card while the send is still waiting: another revision.
  const edited = { ...card, body: `${BODY} More.` };
  await B.act(async () => root.render(B.createElement(B.ExplanationHost.Provider, { value: host }, B.createElement(B.LearningBlockBody, { block: edited, onChange() {}, onChangeQuiet: next => saved.push(next), onFile() {}, appName: 'demo', selected: true, onExpandHeight() {} }))));
  await settle();
  await B.act(async () => admit());
  await settle();
  assert.equal(saved.length, 0, 'the captured revision is not the card\'s revision any more');
});

test('a read-only viewer sees the definitions but none of the edit-only controls: no suggestions, no follow-up, Highlight and Create note greyed', async () => {
  const card = await envelope();
  await mount(card, { host: { ask: async () => true, dig() {}, note: () => 'n' }, readOnly: true });
  assert.ok($('[data-term-id]'));
  assert.equal($('[data-explanation-suggestions]'), null);
  assert.equal($('[data-follow-up-toggle]'), null);
});

test('the bottom + opens Ask a follow-up with the round send inside; outside press closes it and keeps the words; sending uses the same conversation and clears once admitted', async () => {
  const card = await envelope();
  const calls = [];
  let outcome = false;
  await mount(card, { host: { ask: async (request, { onAdmitted }) => { calls.push(request); if (outcome) onAdmitted(); return outcome; } } });
  const toggle = $('[data-follow-up-toggle]');
  assert.equal(toggle.getAttribute('aria-label'), 'Ask a follow-up');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal($('[data-follow-up]'), null);
  await click(toggle);
  const form = $('[data-follow-up]'), input = form.querySelector('input'), send = form.querySelector('[data-follow-up-send]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(input.getAttribute('placeholder'), 'Ask a follow-up', 'no ellipsis');
  assert.ok(send.disabled, 'nothing to send yet');
  await B.act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, 'Why does the gini matter?'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  assert.ok(!send.disabled);
  // Outside press dismisses; the unsent words come back.
  await fire(document.body, 'pointerdown');
  assert.equal($('[data-follow-up]'), null);
  await click(toggle);
  assert.equal($('[data-follow-up] input').value, 'Why does the gini matter?');
  // A refused send keeps the field and the words.
  await fire($('[data-follow-up]'), 'submit');
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], actionId: typeof calls[0].actionId }, { id: 'card-1', revision: card.interactions.contentRevision, question: 'Why does the gini matter?', destination: 'here', actionId: 'string' });
  assert.ok($('[data-follow-up]'), 'still open after a refusal');
  assert.equal($('[data-follow-up] input').value, 'Why does the gini matter?');
  outcome = true;
  await fire($('[data-follow-up]'), 'submit');
  await settle();
  assert.equal(calls.length, 2);
  assert.equal($('[data-follow-up]'), null, 'closed once admitted');
  await click(toggle);
  assert.equal($('[data-follow-up] input').value, '', 'and the words went with it');
  // The follow-up never consumes the suggestions.
  assert.equal($$('[data-explanation-suggestion]').length, 3);
});

// ---- selection toolbar ----
const selection = (startContainer, startOffset, endContainer, endOffset, text) => {
  const range = { startContainer, startOffset, endContainer, endOffset, getBoundingClientRect: () => ({ left: 5, top: 5, right: 50, bottom: 20, width: 45, height: 15 }) };
  window.getSelection = () => ({ rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => text, removeAllRanges() { window.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '' }); } });
  return B.act(async () => { document.dispatchEvent(new window.Event('selectionchange')); await new Promise(resolve => setTimeout(resolve, 25)); });
};

test('selecting text offers exactly Ask in chat, Highlight, Create note in that order; Ask in chat prepares a draft and never sends', async () => {
  const card = await envelope();
  const added = [], sent = [];
  const chat = { addToChat: ref => { added.push(ref); }, ask: turn => { sent.push(turn); }, composer: { focus() {} } };
  await mount(card, { host: { ask: async () => true, note: () => 'n' }, chat });
  const body = $('[data-explanation-field="body"]');
  const parts = textNodes(body.querySelector('p')); // "A ", "decision tree" (the pill), " makes a prediction ... a ", "leaf" (a pill), "."
  await selection(parts[0], 0, parts[2], ' makes a prediction'.length, 'A decision tree makes a prediction');
  const bar = $('[data-explanation-selection-toolbar]');
  assert.ok(bar, 'the toolbar');
  assert.deepEqual([...bar.querySelectorAll('button')].map(b => b.getAttribute('aria-label')), ['Ask in chat', 'Highlight', 'Create note'], 'no Explain action on this surface');
  await click(bar.querySelector('[aria-label="Ask in chat"]'));
  assert.equal(added.length, 1);
  assert.equal(added[0].range.quote, 'A decision tree makes a prediction', 'the exact text, across the pill');
  assert.equal(added[0].sourceId, 'card:card-1');
  assert.equal(sent.length, 0, 'waits for the learner\'s Send');
  assert.equal($('[data-explanation-selection-toolbar]'), null, 'the toolbar closes');
});

test('Highlight saves the range on the card with code-point offsets and the revision; it restores after reload, across a pill, and a stale one is omitted but kept', async () => {
  const card = await envelope();
  const changes = [];
  await mount(card, { host: { ask: async () => true, note: () => 'n' }, chat: { addToChat() {} }, onChange: next => changes.push(next) });
  const body = $('[data-explanation-field="body"]'), nodes = textNodes(body.querySelector('p'));
  await selection(nodes[0], 0, nodes[2], ' makes a prediction'.length, 'A decision tree makes a prediction');
  await click($('[data-explanation-selection-toolbar] [aria-label="Highlight"]'));
  assert.equal(changes.length, 1);
  const [saved] = changes[0].highlights;
  assert.equal(saved.contentRevision, card.interactions.contentRevision);
  assert.deepEqual(saved.segments.map(({ field, start, end, quote }) => ({ field, start, end, quote })), [{ field: 'body', start: 0, end: Array.from('A decision tree makes a prediction').length, quote: 'A decision tree makes a prediction' }]);
  assert.ok(saved.segments[0].prefix === '' && saved.segments[0].suffix.startsWith(' by asking'));
  assert.equal(changes[0].interactions, card.interactions, 'the server envelope is never rewritten');
  // Reload from the saved board: the highlight wraps the same words, the pill inside it keeps its own marker.
  await mount(changes[0], { host: { ask: async () => true } });
  const marks = $$('[data-highlight-ids]');
  assert.ok(marks.length >= 2);
  assert.equal(marks.map(m => m.textContent).join(''), 'A decision tree makes a prediction');
  assert.ok(marks.some(m => m.hasAttribute('data-term-id')), 'the pill is inside the highlight');
  assert.ok($('[data-term-first]'), 'still a pill');
  // The text was edited: the old highlight is omitted from the text, its record stays in the card.
  const edited = { ...changes[0], body: BODY.replace('simple', 'plain') };
  await mount(edited, { host: { ask: async () => true } });
  assert.equal($('[data-highlight-ids]'), null);
  assert.equal(edited.highlights.length, 1);
  // Same card, highlight made by a helper: shape check against the pure module.
  assert.deepEqual(withHighlight(card, saved.id, saved.segments, saved.contentRevision).highlights[0].id, saved.id);
});

test('Create note hands over the exact captured quote; a read-only viewer\'s Highlight and Create note stay, greyed with their names', async () => {
  const card = await envelope();
  const notes = [];
  await mount(card, { host: { ask: async () => true, note: request => { notes.push(request); return 'note-1'; } }, chat: { addToChat() {} } });
  const body = $('[data-explanation-field="body"]'), nodes = textNodes(body.querySelector('p'));
  await selection(nodes[2], 1, nodes[2], ' makes a prediction'.length, 'makes a prediction');
  await click($('[data-explanation-selection-toolbar] [aria-label="Create note"]'));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, 'card-1');
  assert.equal(notes[0].quote, 'makes a prediction');
  assert.equal(notes[0].segments[0].contentRevision, card.interactions.contentRevision);
  await mount(card, { host: { ask: async () => true, note: () => 'n' }, chat: { addToChat() {} }, readOnly: true });
  const lone = textNodes($('[data-explanation-field="body"] p'));
  await selection(lone[2], 1, lone[2], 10, 'makes a pr');
  const buttons = [...$('[data-explanation-selection-toolbar]').querySelectorAll('button')];
  assert.deepEqual(buttons.map(b => [b.getAttribute('aria-label'), b.disabled]), [['Ask in chat', false], ['Highlight', true], ['Create note', true]]);
});

test('repeated text in two sections: a selection in the section is anchored to that section\'s field and offsets', async () => {
  const card = await envelope();
  const changes = [];
  await mount(card, { host: { ask: async () => true, note: () => 'n' }, chat: { addToChat() {} }, onChange: next => changes.push(next) });
  await click($('[data-explain-more]'));
  await settle();
  const section = $('[data-explanation-field="more[0].text"]');
  assert.ok(section, 'the opened section is its own field');
  const sentence = textNodes(section.querySelectorAll('p')[1])[0]; // "A second tree here."
  await selection(sentence, 'A second '.length, sentence, 'A second tree'.length, 'tree');
  await click($('[data-explanation-selection-toolbar] [aria-label="Highlight"]'));
  const [segment] = changes[0].highlights[0].segments;
  assert.equal(segment.field, 'more[0].text');
  assert.equal(segment.quote, 'tree');
  assert.equal(segment.start, cpStart(fieldText(card, 'more[0].text'), 'tree', 0));
  assert.equal(segment.prefix.endsWith('A second '), true);
});

test('selecting a suggested question offers nothing: the questions are controls, not words of the card', async () => {
  const card = await envelope();
  await mount(card, { host: { ask: async () => true }, chat: { addToChat() {} } });
  const question = textNodes($('[data-explanation-suggestion]'))[0];
  await selection(question, 0, question, 5, 'How d');
  assert.equal($('[data-explanation-selection-toolbar]'), null);
});

test('selection that ends outside the reading flow, or is collapsed, offers nothing', async () => {
  const card = await envelope();
  await mount(card, { host: { ask: async () => true }, chat: { addToChat() {} } });
  const outside = $('[data-explanation-head]');
  const inside = textNodes($('[data-explanation-field="body"] p'))[0];
  await selection(inside, 0, outside, 0, 'x');
  assert.equal($('[data-explanation-selection-toolbar]'), null);
});

// ---- wiring that cannot run under node (AdaptiveCanvas, ask.jsx and LearnSlash.jsx need a browser), pinned by source text as ctrlk-handoff.test.mjs does ----
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('wiring: the canvas provides the host; admission is reported by the Chat stream and by the command dispatcher, never by the promise', () => {
  const canvas = read('AdaptiveCanvas.jsx'), ask = read('ask.jsx'), slash = read('LearnSlash.jsx'), page = read('learn-slash.js'), dive = read('Dive.jsx');
  assert.match(canvas, /<ExplanationHost\.Provider value=\{explanationHost\}>/);
  assert.match(canvas, /dig: \(\{ id, term, revision \}\) => divePortals\.open\(id, term, 'explain_term', \{ label: term, revision \}\)/, 'the existing Rabbit Hole route, titled with the exact term');
  assert.match(canvas, /return taken !== false && admitted;/, 'the promise of a Chat reply settles only when the answer is in; admission is the callback');
  assert.match(canvas, /chatWorkspace\.ask\(\{ line: `\/explain \$\{question\}`, about: \{ selection \}, onAdmitted: told \}\)/, 'Ask in a new card is the written /explain');
  assert.match(canvas, /const canDig = !!\(divePortals\?\.open && !visiting\), canAsk = !!chatWorkspace\?\.ask && !visiting, canNote = !readOnly && !localCopy;/, 'a capability that is absent leaves no function, so the card omits the control');
  assert.match(ask, /if \(r\.ok\) onAdmitted\?\.\(\);\n\s+const reader = r\.body\.getReader\(\);/, 'the stream opened');
  assert.match(ask, /chat\.registerSender\(\(\{ regenerate, prompt, command: asked, about, line, onAdmitted \} = \{\}\) => \{/);
  assert.match(ask, /\.handoff\(line, \{ about: about \?\? null, target: about\?\.selection \?\? null, onAdmitted \}\)/);
  assert.match(slash, /if \(handoff\?\.onAdmitted && !ui\.prompt && ui\.notice\?\.tone !== 'error'\) handoff\.onAdmitted\(\);/);
  assert.match(page, /target\?\.parentLink && target\.id \? \{ parent: \{ id: target\.id, \.\.\.target\.parentLink \} \}/);
  assert.match(dive, /open: \(id, title, via = 'learner_dblclick', term = null\) =>/);
});

test('wiring: Add note and Create note make one note each with no connector (owner 2026-11-08); child cards keep curved bowed links that follow their saved ports', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /const addCardNote = \(id, \{ quote = null, revision = null \} = \{\}\) => \{/);
  assert.match(canvas, /const spot = placeNote\(target, size, \[\.\.\.inlineCanvas\.obstacles\(\[id\]\), \.\.\.placementChrome\(\)\], inlineCanvas\.visibleWorld\(\)\);/, 'beside the parent, clear of everything, nothing moves');
  assert.match(canvas, /kind: 'sticky', x: spot\.x, y: spot\.y, text: '', color, opacity, \.\.\.armedText\('sticky'\), fresh: true, parentCard: /, 'the same sticky insertSticky builds, opened for typing');
  // Owner 2026-11-08: neither note entry draws a connector; Create note (a quote) starts the note's own text with the quote in italics.
  const noteFn = canvas.slice(canvas.indexOf('const addCardNote = '), canvas.indexOf('const openInNotebook = '));
  assert.match(noteFn, /\.\.\.\(quote \? quotedNote\(quote\) : \{\}\) \}\]\);\n\s+setSelection\(\[noteId\]\);/);
  assert.doesNotMatch(noteFn, /setLinks/, 'no connector to the card');
  assert.deepEqual(quotedNote('makes a prediction'), { text: 'makes a prediction\n\n', runs: [{ t: 'makes a prediction', i: true }, { t: '\n\n' }] });
  assert.deepEqual(runsOf({ text: quotedNote('a b').text, runs: quotedNote('a b').runs }), [{ t: 'a b', i: true }, { t: '\n\n' }], 'the canvas text model keeps the italics');
  assert.match(canvas, /addCardNote: id => addCardNote\(id\),/, 'the context menu row');
  assert.match(canvas, /route: 'curved', bow: true, head: true \}\]\)\);/, 'the child card link');
  assert.match(canvas, /const linkId = parent\.actionId \? `explain-child-\$\{parent\.actionId\}` : crypto\.randomUUID\(\);/, 'one link per action');
  assert.match(canvas, /link\.route \|\| 'curved', !!link\.bow\)/, 'the saved link decides the bow; the ports are re-read each render, so drag, resize and reload follow');
  assert.match(canvas, /entry\.kind === 'sticky' && entry\.parentCard\);\n\s+if \(note\) \{ const at = boxesOf\(\[id\]\)\[0\]; return at \? sidePoint\(at, side\) : null; \}/, 'a note is a link end');
  assert.match(canvas, /\{sticky && item\.quote\?\.text && <blockquote data-note-quote /, 'the quote above the editable body');
});

// ---- the approved card 07 shape: prose with terms around a real TutorDiagram ----
const FLOW = { version: 1, diagram: { kind: 'flow', title: 'Does it stick?', nodes: [{ id: 'a', label: 'Warm the cup', role: 'process' }, { id: 'b', label: 'Cooler than the room?', role: 'decision' }, { id: 'c', label: 'Heat flows in', role: 'outcome' }, { id: 'd', label: 'Heat flows out', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }, { from: 'b', to: 'd', label: 'No' }] } };

test('a body with a real diagram still aligns: terms before and after the drawing are pills, the drawing is never decorated, a selection starting inside it is refused', async () => {
  const fence = '`'.repeat(3);
  const body = `A decision tree asks questions.\n\n${fence}rh-diagram\n${JSON.stringify(FLOW)}\n${fence}\n\nThe last leaf decides.`;
  const block = { ...base, body, more: [] };
  const revision = await contentRevision(block), text = fieldText(block, 'body');
  const term = (id, label, occurrence) => { const start = cpStart(text, label, occurrence); return { id, label, definition: `${label} means something.`, anchor: { field: 'body', quote: label, occurrence, start, end: start + label.length } }; };
  const card = { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision, questions: [{ id: 'q-1', text: 'A?' }, { id: 'q-2', text: 'B?' }, { id: 'q-3', text: 'C?' }], terms: [term('t-1', 'decision tree', 0), term('t-2', 'leaf', 0)] } };
  await mount(card, { host: { ask: async () => true }, chat: { addToChat() {} } });
  assert.ok($('[data-tutor-diagram]'), 'the drawing is on the card');
  assert.deepEqual($$('[data-term-id]').map(p => p.textContent), ['decision tree', 'leaf'], 'pills before and after the diagram');
  assert.equal($('[data-tutor-diagram] [data-term-id]'), null, 'nothing inside the drawing is decorated');
  const label = $('[data-tutor-diagram] text');
  assert.ok(label, 'the drawing has text to select');
  const trailing = textNodes($$('[data-explanation-field="body"] p').at(-1));
  await selection(label.firstChild, 0, trailing.at(-1), 3, 'x');
  const bar = $('[data-explanation-selection-toolbar]');
  assert.ok(bar, 'the selection still offers Ask in chat and Create note');
  assert.equal(bar.querySelector('[aria-label="Highlight"]').disabled, true, 'but no highlight can start inside a drawing');
});

test('real Markdown renders align with the canonical text: bold, a list, a table, inline and fenced code, a heading, repeated words', async () => {
  const fence = '`'.repeat(3);
  const body = `## Cooling\n\nThe **hot** cup loses heat *fast*, and \`k\` is the rate.\n\n- early: a large gap\n- late: a small gap\n\n| Phase | Gap |\n|---|---|\n| early | large |\n| late | small |\n\n${fence}python\nrate = k * gap\n${fence}\n\nThe gap shrinks, so the rate falls with the gap.`;
  const block = { ...base, body, more: [] };
  const revision = await contentRevision(block), text = fieldText(block, 'body');
  const term = (id, label, occurrence) => { const start = cpStart(text, label, occurrence); return { id, label, definition: `${label}.`, anchor: { field: 'body', quote: label, occurrence, start, end: start + label.length } }; };
  const card = { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision, questions: [{ id: 'q-1', text: 'A?' }, { id: 'q-2', text: 'B?' }, { id: 'q-3', text: 'C?' }],
    terms: [term('t-1', 'hot', 0), term('t-2', 'gap', 3), term('t-3', 'large', 1), term('t-4', 'rate', 2)] } };
  await mount(card, { host: { ask: async () => true } });
  const pills = Object.fromEntries($$('[data-term-id]').map(p => [p.getAttribute('data-term-id'), p]));
  assert.deepEqual(Object.entries(pills).map(([id, p]) => id + ':' + p.textContent).sort(), ['t-1:hot', 't-2:gap', 't-3:large', 't-4:rate']);
  assert.equal(pills['t-1'].parentElement.tagName, 'STRONG', 'a pill inside bold text stays inside the bold element');
  // Whole-word occurrences in reading order: "gap" is in the two list items, the code line, "The gap shrinks" (#3) and "with the gap"; "large" is in the list item (#0) and the table cell (#1).
  assert.match(pills['t-2'].parentElement.textContent, /^The gap shrinks, so the rate falls with the gap\.$/);
  assert.equal(pills['t-3'].parentElement.tagName, 'TD', 'the table cell, not the list item');
  assert.match(pills['t-4'].parentElement.textContent, /^The gap shrinks/, 'rate #2: after "the rate." and the code line');
});

// Owner 2026-11-08 (batch 2a/2b acceptance): a suggested question holding maths ($\alpha$, \(\kappa\)) is typeset like the card's prose, never shown as raw $ text.
test('suggested questions go through the maths renderer: no raw $ or \( in a question that holds maths', async () => {
  const card = await envelope();
  card.interactions.questions[0] = { id: 'q-1', text: 'Why does $\alpha$ grow as the error falls?' };
  card.interactions.questions[1] = { id: 'q-2', text: 'What is \(\kappa\) in the acquisition?' };
  await mount(card, { host: { ask: async () => false } });
  const rows = $$('[data-explanation-suggestion]');
  for (const row of rows.slice(0, 2)) {
    assert.ok(!/\$|\\(|\\)/.test(row.querySelector('span').textContent.replace(/​/g, '')) || row.querySelector('.katex, [data-math], math, mjx-container, annotation'), `maths typeset: ${row.textContent}`);
  }
  assert.ok(rows[0].querySelector('.katex, [data-math], math, annotation, mjx-container') || !rows[0].textContent.includes('$'), 'the first question shows no raw dollar text');
  assert.equal(rows[2].textContent, card.interactions.questions[2].text, 'a question without maths is unchanged');
});

// Owner 2026-11-08: pills and Highlight were dead on every card holding a plot, histogram or graph-layout diagram: the drawing's own text (axis ticks, graph badges) is not the words
// the card's canonical text holds for it, so alignment failed for the whole field. The diagram wrapper now carries those words and they are what align.
test('a card with a plot or a graph-layout diagram still has pills and Highlight (the drawing\'s own ticks and badges are not compared)', async () => {
  const fence = '`'.repeat(3);
  const PLOT = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Loss against probability', x: { label: 'Predicted probability', min: 0, max: 1 }, y: { label: 'Loss', min: 0, max: 5 },
    series: [{ label: 'Loss', kind: 'line', points: [{ x: 0.1, y: 2.3 }, { x: 0.5, y: 0.69 }, { x: 0.9, y: 0.1 }] }] } };
  const GRAPH = { version: 1, diagram: { kind: 'relationship', layout: 'graph', title: 'Cross entropy relationship', nodes: [{ id: 'a', label: 'True distribution' }, { id: 'b', label: 'Model distribution' }, { id: 'c', label: 'Cross entropy' }],
    edges: [{ from: 'a', to: 'c', label: 'is measured against' }, { from: 'b', to: 'c', label: 'is scored by' }] } };
  const body = `A decision tree asks questions.\n\n${fence}rh-diagram\n${JSON.stringify(PLOT)}\n${fence}\n\nThe last leaf decides.\n\n${fence}rh-diagram\n${JSON.stringify(GRAPH)}\n${fence}\n\nThe leaf is the end.`;
  const block = { ...base, body, more: [] };
  const revision = await contentRevision(block), text = fieldText(block, 'body');
  const term = (id, label, occurrence) => { const start = cpStart(text, label, occurrence); return { id, label, definition: `${label} means something.`, anchor: { field: 'body', quote: label, occurrence, start, end: start + label.length } }; };
  const card = { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision, questions: [{ id: 'q-1', text: 'A?' }, { id: 'q-2', text: 'B?' }, { id: 'q-3', text: 'C?' }], terms: [term('t-1', 'decision tree', 0), term('t-2', 'leaf', 0)] } };
  await mount(card, { host: { ask: async () => true, note: () => 'n', dig: () => {} }, chat: { addToChat() {} } });
  assert.equal($$('[data-tutor-diagram]').length, 2, 'both drawings are on the card');
  assert.deepEqual($$('[data-term-id]').map(p => p.textContent), ['decision tree', 'leaf'], 'the pills are drawn around the plot and the graph');
  const paragraphs = $$('[data-explanation-field="body"] p'), last = textNodes(paragraphs.at(-1));
  await selection(last[0], 0, last[0], 4, 'The ');
  assert.equal($('[data-explanation-selection-toolbar] [aria-label="Highlight"]').disabled, false, 'Highlight works on prose after the diagrams');
});
