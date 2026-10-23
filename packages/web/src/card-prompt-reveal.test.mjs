// The Prompt control (owner brief 2026-10-23, replacing the Show prompt reveal): a card's stored prompt is hidden at rest; hovering,
// focusing into or (touch) selecting the card draws a small Prompt control in the card's top-right pill slot; clicking it opens a
// popover beside the card with the exact words and Copy, which stays open until an outside press, Escape, Tab away or a wheel or
// resize. The Chat's generation status uses the same control and shows a /cad line as the lowercase cad pill. Rendered with
// react-dom into linkedom after an esbuild bundle (as content-gestures.test.mjs does). Real hover, layout and the canvas zoom are
// checked in a browser only by the existing fork-runner and local-stack checks.
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
window.innerWidth = 1000; window.innerHeight = 700;
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
// Opening or copying must reach no network: any fetch fails the test that made it.
const requests = [];
globalThis.fetch = async url => { requests.push(String(url)); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); };
const copied = [];
let clipboardFails = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async text => { if (clipboardFails) throw Error('denied'); copied.push(text); } } } });

const dir = mkdtempSync(join(tmpdir(), 'card-prompt-')), outfile = join(dir, 'prompt.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CardPrompt, PromptControl, PromptSlot, placePrompt } from './CardPrompt.jsx'; export { GenerationIndicator } from './ChatOutputs.jsx'; export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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
const fire = (target, type, extra = {}) => B.act(async () => { const event = new window.Event(type, { bubbles: !['pointerenter', 'pointerleave'].includes(type) }); Object.assign(event, extra); target.dispatchEvent(event); });
// A touch tap: React reads pointerType from the pointerdown event itself.
const touch = target => fire(target, 'pointerdown', { pointerType: 'touch' });
const query = selector => document.querySelector(selector);
const click = element => B.act(async () => { element.click(); });
const escape = element => fire(element, 'keydown', { key: 'Escape' });
const reached = { select: 0, drag: 0, open: 0 };
const mountCard = (props = { text: 'a 100 mm cube' }, children = null) => mount(B.createElement('div', { id: 'card', 'data-block': '', tabIndex: 0, onPointerDown: () => { reached.select++; }, onDoubleClick: () => { reached.open++; } }, B.createElement(B.CardPrompt, props), children));
const button = () => query('[data-card-prompt-button]');
const dialog = () => query('[data-card-prompt]');
const LONG = Array.from({ length: 60 }, (_, i) => `line ${i}: dimension ${i} mm, fillet <${i}> & "chamfer"`).join('\n');

test('at rest nothing is drawn: no control, no popover, no words, no reserved space', async () => {
  await mountCard({ text: LONG });
  assert.equal(button(), null);
  assert.equal(dialog(), null);
  assert.equal(card().textContent, '', 'no words and no label');
  assert.match(query('[data-card-prompt-host]').className, /\babsolute\b/, 'out of the card layout');
});

test('hover shows Prompt and leaving hides it; focusing into the card or selecting it (touch) shows it too; a touch pointer is not a hover', async () => {
  await mountCard();
  await fire(card(), 'pointerenter');
  assert.equal(button()?.textContent, 'Prompt');
  assert.equal(button().tagName, 'BUTTON');
  assert.equal(dialog(), null, 'the words wait for a click');
  await fire(card(), 'pointerleave');
  assert.equal(button(), null);
  await fire(card(), 'pointerenter', { pointerType: 'touch' });
  assert.equal(button(), null, 'a touch pointer entering is not a hover');
  await fire(card(), 'focusin');
  assert.ok(button(), 'keyboard: focus in the card shows it');
  await fire(card(), 'focusout');
  assert.equal(button(), null);
  await mountCard({ text: 'a 100 mm cube', selected: true });
  assert.ok(button(), 'touch: a selected card shows it with no hover');
});

test('Prompt opens a popover (outside the card, in the body) with the exact words and Copy; the pointer leaving does not close it', async () => {
  await mountCard({ text: LONG, selected: true });
  await click(button());
  assert.ok(dialog(), 'opens');
  assert.equal(dialog().parentNode, document.body, 'portalled out of the zoomed, clipped canvas');
  assert.ok(!card().contains(dialog()));
  assert.equal(dialog().getAttribute('role'), 'dialog');
  assert.equal(query('[data-card-prompt-text]').textContent, LONG, 'complete, not truncated');
  assert.ok(query('[data-card-prompt-text]').hasAttribute('data-scroll'), 'a long prompt scrolls inside, not the canvas');
  assert.equal(query('[data-card-prompt-copy]').textContent, 'Copy');
  assert.equal(button().getAttribute('aria-expanded'), 'true');
  await fire(card(), 'pointerleave');
  await fire(card(), 'focusout');
  assert.ok(dialog(), 'stays open after the pointer leaves and focus moves');
  assert.ok(button(), 'and the control stays drawn while it is open');
});

test('an outside press, Escape, a wheel elsewhere and a second click on Prompt close it; a press inside does not; Escape returns focus to Prompt', async () => {
  await mountCard({ text: 'a 100 mm cube', selected: true });
  await click(button());
  await fire(query('[data-card-prompt-text]'), 'pointerdown');
  await fire(dialog(), 'wheel');
  assert.ok(dialog(), 'a press or wheel inside keeps it');
  await fire(document, 'pointerdown');
  assert.equal(dialog(), null, 'outside press');
  await click(button());
  await fire(document, 'wheel');
  assert.equal(dialog(), null, 'a wheel outside (the canvas pans or zooms) closes it, never leaving it detached');
  await click(button());
  await click(button());
  assert.equal(dialog(), null, 'the control toggles');
  await click(button());
  let refocused = false; // linkedom has no activeElement: its focus() only dispatches the event
  button().addEventListener('focus', () => { refocused = true; });
  await escape(dialog());
  assert.equal(dialog(), null, 'Escape');
  assert.equal(refocused, true, 'focus returns to Prompt');
});

test('opening and a press inside the popover never select, drag or open the card, and reach no network', async () => {
  requests.length = 0; reached.select = 0; reached.open = 0;
  await mountCard({ text: 'a 100 mm cube', selected: true });
  await fire(button(), 'pointerdown');
  await click(button());
  await fire(dialog(), 'pointerdown');
  await fire(dialog(), 'dblclick');
  await click(query('[data-card-prompt-text]'));
  await click(query('[data-card-prompt-copy]'));
  assert.equal(reached.select, 0, 'the card saw no press');
  assert.equal(reached.open, 0, 'the card was not opened');
  assert.deepEqual(requests, [], 'no generation, no chat, no request at all');
  const source = readFileSync(new URL('./CardPrompt.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /chat-workspace|composer|apiFetch|\bapi\(|fetch\(|Put prompt in chat/, 'the control has no path to generation or the Chat');
});

test('Copy writes the complete original text, says Copied, and says so when copying fails', async () => {
  copied.length = 0;
  await mountCard({ text: LONG, selected: true });
  await click(button());
  await click(query('[data-card-prompt-copy]'));
  await settle();
  assert.deepEqual(copied, [LONG]);
  assert.equal(query('[role="status"]')?.textContent, 'Copied');
  clipboardFails = true;
  await click(query('[data-card-prompt-copy]'));
  await settle();
  clipboardFails = false;
  assert.equal(query('[role="status"]')?.textContent, 'Copy failed');
  assert.deepEqual(copied, [LONG], 'a failed copy writes nothing');
});

test('a card with no stored prompt has no control at all', async () => {
  for (const text of [undefined, null, '']) {
    await mountCard({ text, selected: true });
    assert.equal(query('[data-card-prompt-host]'), null);
    assert.equal(button(), null);
  }
});

test('placePrompt: right of the card when it fits, else left, else over the edge kept in the window; clamped vertically', () => {
  const view = { w: 1000, h: 700 }, size = { w: 288, h: 200 };
  assert.deepEqual(B.placePrompt({ left: 100, right: 400, top: 50 }, size, view), { left: 408, top: 50, side: 'right' });
  assert.deepEqual(B.placePrompt({ left: 600, right: 900, top: 50 }, size, view), { left: 304, top: 50, side: 'left' }, 'no room on the right: flips to the left');
  assert.deepEqual(B.placePrompt({ left: 100, right: 940, top: 50 }, size, view), { left: 704, top: 50, side: 'over' }, 'no room either side: kept in the window');
  assert.equal(B.placePrompt({ left: 100, right: 400, top: 650 }, size, view).top, 492, 'clamped to the bottom edge');
  assert.equal(B.placePrompt({ left: 100, right: 400, top: -30 }, size, view).top, 8, 'clamped to the top edge');
  assert.equal(B.placePrompt({ left: 100, right: 400, top: 300 }, { w: 288, h: 900 }, view).top, 8, 'taller than the window: starts at the top');
  assert.equal(B.placePrompt({ left: 100, right: 696, top: 50 }, size, view).left, 704, 'exactly fitting stays on the right');
  assert.equal(B.placePrompt({ left: 400, right: 697, top: 50 }, size, view).side, 'left', 'one pixel short flips');
});

test('the popover is placed beside the card from its measured box', async () => {
  const rects = { card: { left: 100, right: 400, top: 40, bottom: 340, width: 300, height: 300 }, button: { left: 340, right: 390, top: 48, bottom: 65, width: 50, height: 17 }, popup: { left: 0, top: 0, right: 288, bottom: 120, width: 288, height: 120 } };
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'card' ? rects.card : this.hasAttribute('data-card-prompt-button') ? rects.button : this.hasAttribute('data-card-prompt') ? rects.popup : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  try {
    await mountCard({ text: 'a 100 mm cube', selected: true });
    await click(button());
    assert.equal(dialog().getAttribute('data-card-prompt-side'), 'right');
    assert.equal(dialog().style.left, '408px');
    assert.equal(dialog().style.top, '48px', 'aligned with the control');
    rects.card = { ...rects.card, left: 650, right: 950 };
    await click(button()); await click(button());
    assert.equal(dialog().getAttribute('data-card-prompt-side'), 'left', 'near the right edge it flips to the left');
    assert.equal(dialog().style.left, '354px');
  } finally { window.HTMLElement.prototype.getBoundingClientRect = original; }
});

// The top-right slot (owner correction 2026-10-23): the generic "course" pill is gone from every card, with or without a stored prompt.
// A card with a stored prompt gets the Prompt control there (hidden at rest; hover, focus or touch selection draw it). A real source
// badge (tutor, learner, PDF) stays as it was and the control sits beside it, never over it. Rendered through the real bodies.
const FAMILIES = {
  explanation: { block: { type: 'explanation', title: 'Why softmax', body: 'It normalises.' }, badge: null },
  table: { block: { type: 'table', title: 'Sigmoid vs tanh', columns: ['a', 'b'], rows: [['1', '2']] }, badge: null },
  challenge: { block: { type: 'challenge', title: 'Try', prompt: 'Explain it.' }, badge: null },
  quiz: { block: { type: 'quiz', question: 'Q?', options: [{ key: 'a', text: 'A', correct: true }, { key: 'b', text: 'B' }] }, badge: 'tutor' },
  flashcards: { block: { type: 'flashcards', title: 'Cards', cards: [{ front: 'a', back: 'b' }] }, badge: 'tutor' },
};
const badgeOf = text => [...document.querySelectorAll('span')].find(span => span.textContent === text && /rounded-full bg-ink px-2 py-px/.test(span.className));
for (const [name, { block, badge }] of Object.entries(FAMILIES)) {
  test(`${name}: no "course" pill; Prompt in the top-right slot on hover, focus and touch selection${badge ? `; the ${badge} badge stays beside it` : ''}`, async () => {
    const body = B.createElement(B.LearningBlockBody, { block, onChange() {}, onFile() {}, appName: 'app', selected: true });
    const withSlot = (text, selected = false) => mount(B.createElement('div', { id: 'card', 'data-block': '', tabIndex: 0, className: 'group' },
      B.createElement(B.PromptSlot.Provider, { value: text && { text, selected, claim() {} } }, body)));
    for (const text of [null, 'make a card about softmax']) {
      await withSlot(text);
      assert.equal(badgeOf('course'), undefined, 'the course pill is removed');
      assert.doesNotMatch(card().textContent, /course/i, 'and so is the word');
      if (badge) assert.match(badgeOf(badge).className, /group-hover:opacity-100/, `the ${badge} badge is unchanged`);
      await fire(card(), 'pointerenter');
      if (!text) { assert.equal(button(), null, 'no stored prompt: no Prompt control, ever'); continue; }
      assert.equal(button()?.textContent, 'Prompt', 'hover');
      if (badge) assert.ok(!badgeOf(badge).contains(button()), 'beside the badge, never inside or over it');
      await fire(card(), 'pointerleave');
      assert.equal(button(), null, 'hidden at rest, and nothing takes its place');
      assert.doesNotMatch(card().textContent, /course/i);
      await fire(card(), 'focusin');
      assert.ok(button(), 'keyboard focus in the card');
      await fire(card(), 'focusout');
    }
    await withSlot('make a card about softmax', true);
    assert.ok(button(), 'a selected card on touch');
    await click(button());
    assert.equal(query('[data-card-prompt-text]').textContent, 'make a card about softmax');
  });
}

test('the card claims the pill slot so the top-strip fallback is not drawn a second time', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /block\.promptUsed && !slotted && <CardPrompt text=\{block\.promptUsed\}/);
  assert.match(readFileSync(new URL('./LearningBlocks.jsx', import.meta.url), 'utf8'), /useLayoutEffect\(\(\) => \{ slot\?\.claim\(true\)/);
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
  assert.equal(button(), null, 'at rest there is no Prompt control either: it appears on hover, focus or a tap');
  await fire(query('[data-gen-indicator]'), 'pointerover');
  assert.equal(button().textContent, 'Prompt', 'same wording as the cards');
  await click(button());
  assert.equal(query('[data-card-prompt-text]').textContent, 'a 100 mm cube', 'the words after /cad');
  assert.doesNotMatch(status().replace('/cad a 100 mm cube', ''), /\/cad/);
  assert.match(status(), /Generating on the canvas/, 'the status words stay while it is open');
  await click(query('[data-card-prompt-copy]'));
  await settle();
  assert.deepEqual(copied, ['/cad a 100 mm cube'], 'Copy keeps the original command line');
  await escape(dialog());
  assert.equal(dialog(), null);
});

test('a status for another command hides its line the same way, without a cad pill', async () => {
  await mount(B.createElement(B.GenerationIndicator, { entries: [entry('/explain softmax')], ops: {}, onDismiss() {} }));
  assert.equal(query('[data-command-pill]'), null);
  assert.doesNotMatch(status(), /softmax/);
  assert.equal(button(), null, 'no control at rest');
  assert.equal(query('[data-gen-prompt]').children.length, 0, 'and no empty prompt line takes room');
  await fire(query('[data-gen-indicator]'), 'pointerover');
  await click(button());
  assert.equal(query('[data-card-prompt-text]').textContent, '/explain softmax');
});

test('the status shows Prompt on hover, on focus inside the row and after a tap, never at rest; an opened popover survives the pointer leaving; settled states behave the same', async () => {
  for (const gen of [{ active: true, phase: 'running', label: 'Building geometry' }, { active: false, phase: 'done', label: '' }]) {
    await mount(B.createElement(B.GenerationIndicator, { entries: [entry('/cad a 100 mm cube', gen)], ops: {}, onDismiss() {} }));
    const row = query('[data-gen-indicator]');
    assert.ok(query('[data-command-pill="cad"]'), 'the cad pill is always drawn');
    assert.equal(button(), null, 'rest');
    await fire(row, 'pointerover');
    assert.ok(button(), 'hover');
    await fire(row, 'pointerout');
    assert.equal(button(), null, 'leaving hides it');
    await fire(row, 'focusin');
    assert.ok(button(), 'keyboard focus inside the row');
    await fire(row, 'focusout');
    assert.equal(button(), null);
    await touch(row);
    assert.ok(button(), 'a tap on a touch screen');
    await click(button());
    await fire(row, 'pointerout');
    await fire(row, 'focusout');
    assert.ok(dialog(), 'an opened popover stays open when the pointer leaves or focus moves');
    assert.ok(query('[data-command-pill="cad"]') && query('[data-gen-open]'), 'status parts stay visible');
    await touch(row);
    assert.equal(dialog(), null, 'a later tap outside the popover closes it');
  }
});

test('only generated-card prompts use the control: CardPrompt is drawn from promptUsed and a chat card question alone, and the old reveal is gone', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.deepEqual([...canvas.matchAll(/<CardPrompt text=\{([^}]+)\}/g)].map(match => match[1]), ['exchange.question', 'block.promptUsed']);
  assert.doesNotMatch(canvas, /PROMPT_ROW_H|setPromptHeight/);
  for (const file of ['CardPrompt.jsx', 'ChatOutputs.jsx', 'AdaptiveCanvas.jsx']) assert.doesNotMatch(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), /PromptReveal|Show prompt|data-card-prompt-(show|hide|chat)/, file);
});
