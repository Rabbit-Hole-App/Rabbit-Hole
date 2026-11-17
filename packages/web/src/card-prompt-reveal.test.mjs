// The Prompt control (owner brief 2026-10-23; moved by the owner on 2026-11-17 from each card's header into the card's hover action pill, SelectionActions.jsx, as its last action,
// drawn only for a card that has a stored prompt): clicking it opens a
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
  stdin: { contents: "export { PromptControl, placePrompt } from './CardPrompt.jsx'; export { HoverActions, SelectionActionsHost, SelectionActionsProvider } from './SelectionActions.jsx'; export { GenerationIndicator } from './ChatOutputs.jsx'; export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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
const mountCard = (props = { text: 'a 100 mm cube' }, children = null) => mount(B.createElement('div', { id: 'card', 'data-block': '', tabIndex: 0, onPointerDown: () => { reached.select++; }, onDoubleClick: () => { reached.open++; } }, B.createElement(B.PromptControl, { active: true, anchor: () => card(), ...props }), children));
const button = () => query('[data-card-prompt-button]');
const dialog = () => query('[data-card-prompt]');
const LONG = Array.from({ length: 60 }, (_, i) => `line ${i}: dimension ${i} mm, fillet <${i}> & "chamfer"`).join('\n');

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

// A browser cannot focus a visibility:hidden element (focus() does nothing), and the popover is hidden until it is placed: focusing it
// before then left Escape going to the Prompt control, so the popover stayed open (primary-button-contrast-check, fast-e2e 2026-10-23).
test('the opened popover is given focus only once it is visible, so Escape from the keyboard reaches it', async () => {
  const seen = [], original = window.HTMLElement.prototype.focus;
  window.HTMLElement.prototype.focus = function (...args) { if (this.hasAttribute('data-card-prompt')) seen.push(/visibility:\s*hidden/.test(this.getAttribute('style') || '')); return original.apply(this, args); };
  try {
    await mountCard({ text: 'a 100 mm cube', selected: true });
    await click(button());
    assert.ok(seen.length > 0, 'the popover takes focus when it opens');
    assert.ok(seen.every(hidden => !hidden), 'never while it is still visibility:hidden');
  } finally { window.HTMLElement.prototype.focus = original; }
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

// The card header (owner 2026-11-17): no card draws a Prompt control in its own header any more, with or without a stored prompt; the generic "course" pill stays gone (owner correction 2026-10-23).
// A real source badge (tutor, learner, PDF) stays as it was. Rendered through the real bodies.
const FAMILIES = {
  explanation: { block: { type: 'explanation', title: 'Why softmax', body: 'It normalises.', promptUsed: '/explain softmax' }, badge: null },
  table: { block: { type: 'table', title: 'Sigmoid vs tanh', columns: ['a', 'b'], rows: [['1', '2']], promptUsed: 'make a table' }, badge: null },
  challenge: { block: { type: 'challenge', title: 'Try', prompt: 'Explain it.', promptUsed: 'make a challenge' }, badge: null },
  quiz: { block: { type: 'quiz', question: 'Q?', options: [{ key: 'a', text: 'A', correct: true }, { key: 'b', text: 'B' }], promptUsed: '/quiz' }, badge: 'tutor' },
  flashcards: { block: { type: 'flashcards', title: 'Cards', cards: [{ front: 'a', back: 'b' }], promptUsed: '/flashcards' }, badge: 'tutor' },
};
const badgeOf = text => [...document.querySelectorAll('span')].find(span => span.textContent === text && /rounded-full bg-ink px-2 py-px/.test(span.className));
for (const [name, { block, badge }] of Object.entries(FAMILIES)) {
  test(`${name}: no "course" pill and no Prompt control in the card's header, even with a stored prompt${badge ? `; the ${badge} badge stays` : ''}`, async () => {
    await mount(B.createElement('div', { id: 'card', 'data-block': '', tabIndex: 0, className: 'group' },
      B.createElement(B.LearningBlockBody, { block, onChange() {}, onFile() {}, appName: 'app', selected: true })));
    assert.equal(badgeOf('course'), undefined, 'the course pill is removed');
    assert.doesNotMatch(card().textContent, /course/i, 'and so is the word');
    if (badge) assert.match(badgeOf(badge).className, /group-hover:opacity-100/, `the ${badge} badge is unchanged`);
    await fire(card(), 'pointerenter');
    await fire(card(), 'focusin');
    assert.equal(button(), null, 'hover or focus draws no Prompt in the header');
    assert.doesNotMatch(card().textContent, /Prompt/);
  });
}

// The Prompt action of the card's hover pill: the real SelectionActions rendering, with the canvas's promptOf standing in.
const WORDS = 'make a card about softmax';
const withPill = (ctx, pill, id = 'c1') => mount(B.createElement('div', { id: 'card', 'data-block': '', tabIndex: 0, onPointerDown: () => { reached.select++; }, onDoubleClick: () => { reached.open++; } },
  B.createElement(B.SelectionActionsProvider, { sole: 'c1', onAddToChat() {}, onQuickEdit() {}, promptOf: card => (card === 'c1' ? WORDS : undefined), ...ctx },
    pill === 'hover' ? B.createElement(B.HoverActions, { id, select() {}, joined: true }) : B.createElement(B.SelectionActionsHost, { id, joined: true }))));
const action = () => query('[data-card-prompt-button]');

test('the pill draws Prompt as its last action, after Quick Edit, in the siblings\' look (icon and label, no shortcut), and only for a card that has a stored prompt', async () => {
  await withPill({});
  const names = [...query('[data-selection-bar]').children].map(node => node.getAttribute('aria-label') || node.textContent);
  assert.deepEqual(names.map(name => name.replace(/Ctrl.*/, '')), ['Add to chat', 'Quick Edit', 'Prompt'], 'Prompt follows Quick Edit and is last');
  assert.equal(action().textContent, 'Prompt');
  assert.ok(action().querySelector('svg'), 'an icon, like its siblings');
  assert.equal(action().querySelector('kbd'), null, 'no shortcut');
  assert.equal(action().getAttribute('aria-haspopup'), 'dialog');
  assert.equal(action().getAttribute('aria-expanded'), 'false');
  assert.equal(action().className, query('[data-quick-edit]').className, 'the same classes as Quick Edit: one look');
  await withPill({}, 'selected', 'c2');
  assert.equal(query('[data-selection-bar]'), null, 'another card is not the selection: no host');
  await withPill({ sole: 'c2' }, 'hover', 'c1');
  assert.equal(action()?.textContent, 'Prompt', 'a hovered card shows it in the very same pill');
  await withPill({ promptOf: () => undefined });
  assert.ok(query('[data-quick-edit]'));
  assert.equal(action(), null, 'no stored prompt: no control, no empty slot');
  await withPill({ promptOf: () => '' });
  assert.equal(action(), null);
  await withPill({ promptOf: null });
  assert.equal(action(), null);
  await withPill({ onAddToChat: null, onQuickEdit: null });
  assert.equal(action(), null, 'where its siblings are absent (a view-only board) it is absent too');
});

test('clicking Prompt opens the popover and copies the words at that moment: Copied, one copy per opening, none on closing; the button is pressed while it is open; Escape closes', async () => {
  copied.length = 0;
  await withPill({});
  await click(action());
  await settle();
  assert.equal(dialog()?.querySelector('[data-card-prompt-text]').textContent, WORDS);
  assert.deepEqual(copied, [WORDS], 'copied once, on opening, with no second press on Copy');
  assert.equal(query('[data-card-prompt-status]').textContent, 'Copied');
  assert.equal(action().getAttribute('aria-expanded'), 'true');
  assert.ok(action().className.split(' ').includes('bg-hover'), 'pressed while open');
  await click(action());
  await settle();
  assert.equal(dialog(), null);
  assert.deepEqual(copied, [WORDS], 'closing copies nothing');
  assert.ok(!action().className.split(' ').includes('bg-hover'));
  await click(action());
  await settle();
  assert.deepEqual(copied, [WORDS, WORDS], 'opening again copies again');
  await click(query('[data-card-prompt-copy]'));
  await settle();
  assert.deepEqual(copied, [WORDS, WORDS, WORDS], 'the Copy button still copies again');
  await escape(dialog());
  assert.equal(dialog(), null, 'Escape closes');
  copied.length = 0;
});

test('a failed copy on opening says Copy failed in the danger colour and writes nothing; the popover still opens', async () => {
  copied.length = 0; clipboardFails = true;
  await withPill({});
  await click(action());
  await settle();
  clipboardFails = false;
  assert.ok(dialog(), 'it opens');
  assert.equal(query('[data-card-prompt-status]').textContent, 'Copy failed');
  assert.match(query('[data-card-prompt-status]').className, /text-danger/);
  assert.deepEqual(copied, []);
});

test('pressing Prompt in a hovered card\'s pill only opens the words: it never selects or opens the card, never runs Add to chat or Quick Edit, and reaches no network', async () => {
  requests.length = 0; reached.select = 0; reached.open = 0;
  const calls = [];
  await withPill({ sole: 'c2', onAddToChat: () => calls.push('chat'), onQuickEdit: () => calls.push('edit') }, 'hover', 'c1');
  await fire(action(), 'pointerdown');
  await click(action());
  await settle();
  assert.ok(dialog());
  assert.equal(reached.select, 0, 'the card saw no press');
  assert.equal(reached.open, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(requests, []);
});

test('the Prompt popover of the pill sits beside the card from the pill\'s bottom edge, so it never covers the pill', async () => {
  const rects = { card: { left: 100, right: 400, top: 40, bottom: 340, width: 300, height: 300 }, button: { left: 200, right: 270, top: 4, bottom: 36, width: 70, height: 32 }, popup: { left: 0, top: 0, right: 288, bottom: 120, width: 288, height: 120 } };
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'card' ? rects.card : this.hasAttribute('data-card-prompt-button') ? rects.button : this.hasAttribute('data-card-prompt') ? rects.popup : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  try {
    await withPill({});
    await click(action());
    assert.equal(dialog().getAttribute('data-card-prompt-side'), 'right');
    assert.equal(dialog().style.left, '408px', 'beside the card (the nearest data-block)');
    assert.equal(dialog().style.top, '36px', 'from the pill\'s bottom edge down');
  } finally { window.HTMLElement.prototype.getBoundingClientRect = original; }
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

test('the old header Prompt is gone everywhere: no CardPrompt, CardPromptControl, PromptSlot or hidePrompt; the pill reads the stored promptUsed of the card', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  for (const file of ['CardPrompt.jsx', 'ChatOutputs.jsx', 'AdaptiveCanvas.jsx', 'LearningBlocks.jsx', 'Animation3DCard.jsx', 'SelectionActions.jsx']) {
    const text = read(file);
    assert.doesNotMatch(text, /CardPromptControl|PromptSlot|hidePrompt|<CardPrompt |import CardPrompt|PromptReveal|Show prompt|data-card-prompt-(show|hide|chat|host)/, file);
  }
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /promptOf=\{id => blocksRef\.current\.find\(block => block\.id === id\)\?\.promptUsed\}/, 'the pill reads the stored prompt of the block, the words the card was made from');
  assert.match(read('SelectionActions.jsx'), /\(ctx\.onAddToChat \|\| ctx\.onQuickEdit\) && prompt && <PromptControl text=\{prompt\} action=\{actionClass\(joined\)\} \/>/, 'only with a prompt, and only where Add to chat or Quick Edit are');
});
