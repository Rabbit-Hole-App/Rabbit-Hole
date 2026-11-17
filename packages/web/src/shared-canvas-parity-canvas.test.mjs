// A shared canvas against the owner's own canvas, at the CANVAS level (owner 2026-11-17: "make sure in the shared canvas as well everything is as in the user's own canvas"): the real AdaptiveCanvas is
// rendered through react-dom into linkedom as the owner (editable), as a read-only viewer (readOnly: the owner opening their own link), and as a visitor's local copy (SharedBoardPage's two prop sets, a
// guest and a signed-in viewer), with the same board, and the feature markup is compared: the green playing frame, the transcript window, the minimap mark, the audio pill, the saved-colour arrow, the
// card's action pill and the strips. These checks prove WIRING and markup, not layout, sound or the browser (linkedom measures nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { contentRevision } from './explanation-interactions.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ||= globalThis.localStorage;
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0); globalThis.cancelAnimationFrame = id => clearTimeout(id);
window.Element.prototype.getBoundingClientRect ||= () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
window.location = { pathname: '/b/tok', search: '', href: 'http://127.0.0.1/b/tok', origin: 'http://127.0.0.1', hash: '' }; window.history = { replaceState() {}, pushState() {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' }); window.getComputedStyle = globalThis.getComputedStyle;
globalThis.CSS = { escape: s => String(s) };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); window.matchMedia = globalThis.matchMedia;
globalThis.fetch = async () => new Response('{}', { status: 200 });
globalThis.Audio = class extends EventTarget { play() { return Promise.resolve(); } pause() {} };
globalThis.MERMAID_STUB = { fail: false, rendered: [] };

const dir = mkdtempSync(join(tmpdir(), 'shared-parity-canvas-')), outfile = join(dir, 'canvas.cjs');
await esbuild.build({
  stdin: { contents: "export { default as AdaptiveCanvas } from './AdaptiveCanvas.jsx'; export { setPlayingCard, openTranscript, updateTranscript } from './audio-playing.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  define: { 'import.meta.env': '{}' }, bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki|mathlive)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /^mathlive$/, namespace: 'stub' }, () => ({ contents: 'export class MathfieldElement {} export const convertLatexToMarkup = s => s; export default {};' }));
    build.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg></svg>" }; } };' }));
    build.onLoad({ filter: /^shiki$/, namespace: 'stub' }, () => ({ contents: 'export async function codeToHtml() { throw new Error("no shiki in node"); }' }));
  } }],
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const withQuestions = async block => ({ ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: await contentRevision(block), terms: [],
  questions: [{ id: 'q-1', text: 'How does a tree choose its first question?' }, { id: 'q-2', text: 'What happens when a tree gets too deep?' }, { id: 'q-3', text: 'Why do the paths make rectangles?' }] } });
const narration = { status: 'ready', fileRef: { v: 1, source: { id: 'fs', rev: 'r' }, meta: {} }, seconds: 84, script: 'A tree asks questions.' };
const PARENT = { id: 'c1', type: 'explanation', dx: 0, dy: 0, title: 'Why trees', body: 'A decision tree makes a prediction by asking simple questions.', promptUsed: 'Explain how decision trees work', narration };
const CHILD = { id: 'c2', type: 'explanation', dx: 0, dy: 400, title: 'Child', body: 'A child card.', parentCard: { id: 'c1', color: '#3A7E69', revision: 'rv', actionId: 'a1' } };
const MODES = {
  owner: { onSave() {} },
  readOnly: { readOnly: true, permissions: { role: 'owner', shared: true } },
  guestCopy: { localCopy: true, onSave() {}, permissions: { role: 'guest', shared: true } },
  viewerCopy: { localCopy: true, onSave() {}, permissions: { role: 'viewer', shared: true } },
};
const q = selector => document.querySelector(selector), all = selector => [...document.querySelectorAll(selector)];
let root = null;
const api = { current: null };
async function show(mode, extra = {}) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  const blocks = [await withQuestions(PARENT), CHILD];
  await B.act(async () => root.render(B.createElement(B.AdaptiveCanvas, { exchanges: [], onMove() {}, apiRef: api, boardState: { blocks, links: [] }, appName: 'demo', ...MODES[mode], ...extra })));
  await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
}
// The canvas's own select command (apiRef.select), the one the page's outline and /dive use: it selects whatever the mode.
const press = async id => { await B.act(async () => { api.current.select(id); }); await B.act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); }); };
test.after(async () => { if (root) await B.act(async () => root.unmount()); });

test('playing: the green frame, the transcript window, the minimap mark, the pill and the saved-colour arrow are the owner\'s, for every kind of viewer', async () => {
  const seen = {};
  for (const mode of Object.keys(MODES)) {
    await show(mode);
    await B.act(async () => { B.setPlayingCard('c1'); B.openTranscript('c1', 'A tree asks questions.'); B.updateTranscript('c1', 2, 4); });
    seen[mode] = { frame: q('[data-block-id="c1"]')?.getAttribute('data-audio-playing'), transcript: q('[data-card-transcript]')?.textContent, mark: !!q('[data-minimap-playing]'), minimap: !!q('[data-canvas-minimap]'),
      pill: q('[data-explanation-audio]')?.outerHTML, arrow: q('[data-card-arrow]')?.outerHTML, minimize: !!q('[data-explanation-open]') };
    await B.act(async () => { B.setPlayingCard(null); });
  }
  assert.equal(seen.owner.frame, 'true');
  assert.ok(seen.owner.transcript.includes('Transcript'));
  assert.ok(seen.owner.mark && seen.owner.minimap && seen.owner.pill);
  assert.match(seen.owner.arrow, /data-arrow-kind="ask"/);
  assert.doesNotMatch(seen.owner.arrow, /data-arrow-draw/, 'drawn in only while a card is being made, never for a card that is already on the board');
  for (const mode of ['readOnly', 'guestCopy', 'viewerCopy']) assert.deepEqual(seen[mode], seen.owner, `${mode} matches the owner`);
  assert.equal(seen.owner.minimize, false, 'no minimize or expand');
});

test('the card\'s action pill: a viewer keeps Prompt, alone; Add to chat is the owner\'s (a viewer\'s selection arms the Chat pill by itself, and the right-click row stays)', async () => {
  const pill = async mode => { await show(mode); await press('c1'); return { chat: all('[data-add-to-chat]').length, quick: all('[data-quick-edit]').length, prompt: all('[data-card-prompt-button]').length }; };
  assert.deepEqual(await pill('owner'), { chat: 1, quick: 0, prompt: 1 }, 'no Quick Edit here: this canvas is given no inline editor');
  for (const mode of ['readOnly', 'guestCopy', 'viewerCopy']) assert.deepEqual(await pill(mode), { chat: 0, quick: 0, prompt: 1 }, mode);
});

test('strips on the canvas: signed out a click goes to the page\'s sign-in with the question and the card; signed in it is Ask in Chat (the card armed, the question in the composer, nothing sent)', async () => {
  const calls = [], armed = [], drafts = [];
  window.addEventListener('small:ask-focus', event => drafts.push(event.detail?.text));
  const hooks = { onSuggestSignIn: (question, card) => { calls.push({ question, card }); return true; }, onAskTarget: target => { if (target) armed.push(target.id); } };
  await show('guestCopy', hooks);
  assert.equal(all('[data-explanation-suggestion]').length, 3, 'a guest sees the three strips');
  await B.act(async () => { q('[data-explanation-suggestion="q-2"] button').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].question, 'What happens when a tree gets too deep?');
  assert.equal(calls[0].card.id, 'c1');
  assert.equal(calls[0].card.title, 'Why trees');
  assert.ok(calls[0].card.kind, 'the pill\'s kind rides along');
  assert.equal(drafts.length, 0, 'signed out: nothing reaches the composer');
  calls.length = 0;
  await show('viewerCopy', hooks);
  assert.equal(all('[data-explanation-suggestion]').length, 3, 'a signed-in viewer sees them too');
  await B.act(async () => { q('[data-explanation-suggestion="q-3"] button').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); });
  assert.equal(calls.length, 0, 'signed in: no sign-in');
  assert.ok(armed.includes('c1'), 'the card is the composer\'s pill');
  assert.deepEqual(drafts, ['Why do the paths make rectangles?'], 'the question is in the composer, unsent');
  await show('owner');
  assert.equal(all('[data-explanation-suggestion]').length, 0, 'the owner\'s own canvas without a chat workspace draws none, as before (its host has no ask here)');
  await show('guestCopy');
  assert.equal(all('[data-explanation-suggestion]').length, 0, 'a page without the sign-in hook (an embed, a member canvas) draws none');
});
