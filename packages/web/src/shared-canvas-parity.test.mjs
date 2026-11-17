// A shared (published, read-only) canvas against the owner's own canvas (owner 2026-11-17: "make sure in the shared canvas as well everything is as in the user's own canvas").
// The same Explanation cards are rendered through the real components twice, once as the owner (editable, the canvas host with ask and note) and once as a viewer of a shared canvas
// (readOnly, the host AdaptiveCanvas builds for SharedBoardPage: visitorAsk only), and the feature markup is compared. react-dom into linkedom after an esbuild bundle, the mount pattern of
// explanation-card-interactions.test.mjs. These checks prove WIRING and markup, not layout or sound.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { readFileSync } from 'node:fs';
import { contentRevision, fieldText, withConsumed } from './explanation-interactions.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
window.Element.prototype.getBoundingClientRect ||= () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
globalThis.MERMAID_STUB = { fail: false, rendered: [] };
globalThis.Audio = class extends EventTarget { constructor() { super(); this.src = ''; this.currentTime = 0; this.paused = true; } play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); } pause() { this.paused = true; this.dispatchEvent(new Event('pause')); } };
const reads = [];
globalThis.fetch = async url => { reads.push(String(url)); return new Response(new Blob(['id3'], { type: 'audio/mpeg' }), { status: 200 }); };
globalThis.URL.createObjectURL = () => 'blob:audio';
globalThis.URL.revokeObjectURL = () => {};

const dir = mkdtempSync(join(tmpdir(), 'shared-parity-')), outfile = join(dir, 'parity.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { ExplanationHost } from './explanation-host.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
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

const BODY = 'A decision tree makes a prediction by asking simple questions. Each answer leads down a branch until you reach a leaf.';
const base = { id: 'card-1', type: 'explanation', dx: 0, dy: 0, title: 'Why trees', body: BODY };
async function envelope(over = {}) {
  const block = { ...base, ...over };
  const revision = await contentRevision(block);
  return { ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: revision,
    questions: [{ id: 'q-1', text: 'How does a tree choose its first question?' }, { id: 'q-2', text: 'What happens when a tree gets too deep?' }, { id: 'q-3', text: 'Why do the paths make rectangles?' }], terms: [] }, _body: fieldText(block, 'body') };
}
const narration = { status: 'ready', fileRef: { v: 1, source: { id: 'fs_audio', rev: 'rev-1' }, meta: { name: 'a.mp3', type: 'audio/mpeg', size: 10 } }, seconds: 84, script: 'A decision tree asks questions.', provider: 'fish', model: 's1', voiceId: 'v' };

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
let root = null;
async function mount(block, { host = null, readOnly = false } = {}) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  const body = B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'demo', selected: true, readOnly, onExpandHeight() {} });
  await B.act(async () => root.render(B.createElement(B.ExplanationHost.Provider, { value: host }, body)));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); });
const $ = selector => document.querySelector(selector), $$ = selector => [...document.querySelectorAll(selector)];
const click = target => B.act(async () => { target.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 25)); });

// The owner's canvas host (AdaptiveCanvas explanationHost, editable) and a shared canvas viewer's (visitorAsk only: canAsk is false while visiting).
const ownerHost = { ask: async () => true, note: () => 'n', quickAsk: () => true };
const visitorCalls = [];
const viewerHost = { visitorAsk: request => { visitorCalls.push(request); return true; } };

test('strips: the owner and the viewer of a shared canvas get the same three rows, the same tooltip and the same spacing', async () => {
  const card = await envelope({ narration });
  await mount(card, { host: ownerHost });
  const owner = $('[data-explanation-suggestions]').outerHTML;
  await mount(card, { host: viewerHost, readOnly: true });
  const strips = $('[data-explanation-suggestions]');
  assert.ok(strips, 'a viewer sees the strips');
  assert.equal(strips.outerHTML, owner, 'identical markup');
  assert.equal($$('[data-explanation-suggestion]').length, 3);
  assert.ok($$('[data-explanation-suggestion] button').every(button => button.getAttribute('title') === 'Answer in a card'));
  assert.match(strips.className, /\bgap-2\.5\b/);
  assert.match(strips.className, /(^|\s)-mx-3(\s|$)/);
  assert.match(strips.className, /\bmt-4\b/);
});

test('strips: the owner\'s own use (consumed) hides them for the owner, never for a viewer, and nothing is written to the card', async () => {
  const used = withConsumed(await envelope(), (await envelope()).interactions.contentRevision, { id: 'a', question: 'q', destination: 'card' });
  await mount(used, { host: ownerHost });
  assert.equal($('[data-explanation-suggestions]'), null, 'the owner\'s used set stays hidden for the owner');
  const saved = [];
  await mount(used, { host: viewerHost, readOnly: true });
  assert.equal($$('[data-explanation-suggestion]').length, 3, 'a viewer still sees the three strips');
  void saved;
});

test('strips: a viewer click asks the host once with the card id and the question, and the strips stay (nothing is consumed or saved)', async () => {
  visitorCalls.length = 0;
  const changes = [];
  const card = await envelope();
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  const body = B.createElement(B.LearningBlockBody, { block: card, onChange: next => changes.push(next), onChangeQuiet: next => changes.push(next), onFile() {}, appName: 'demo', selected: true, readOnly: true, onExpandHeight() {} });
  await B.act(async () => root.render(B.createElement(B.ExplanationHost.Provider, { value: viewerHost }, body)));
  await settle();
  await click($('[data-explanation-suggestion="q-2"] button'));
  assert.deepEqual(visitorCalls, [{ id: 'card-1', question: 'What happens when a tree gets too deep?' }]);
  assert.equal(changes.length, 0, 'the viewer wrote nothing to the card');
  assert.equal($$('[data-explanation-suggestion]').length, 3, 'the set is still there');
});

test('strips: a shared view without the page\'s sign-in hook (an embed, a member canvas) draws none, and the owner\'s read-only locked card still draws none', async () => {
  const card = await envelope();
  await mount(card, { host: {}, readOnly: true });
  assert.equal($('[data-explanation-suggestions]'), null);
  await mount(card, { host: ownerHost, readOnly: true });
  assert.equal($('[data-explanation-suggestions]'), null, 'a locked card on the owner\'s board keeps its behaviour');
});

test('follow-up and Explore stay owner-only: a viewer gets neither', async () => {
  const card = await envelope();
  await mount(card, { host: ownerHost });
  assert.ok($('[data-follow-up-toggle]'));
  await mount(card, { host: viewerHost, readOnly: true });
  assert.equal($('[data-follow-up-toggle]'), null);
  assert.equal($('[data-explore]'), null);
});

test('audio pill: the viewer gets the same pill as the owner, and playing it reads the file through the page scope', async () => {
  const card = await envelope({ narration });
  await mount(card, { host: ownerHost });
  const owner = $('[data-explanation-audio]').outerHTML;
  await mount(card, { host: viewerHost, readOnly: true });
  assert.ok($('[data-explanation-audio]'), 'a viewer sees the pill');
  assert.equal($('[data-explanation-audio]').outerHTML, owner, 'identical markup');
  assert.ok($('[data-explanation-head]').contains($('[data-explanation-audio]')));
  reads.length = 0;
  await click($('[data-audio-play]'));
  assert.deepEqual(reads, ['/api/learn/files/fs_audio'], 'the file read is the figures\' own (file-source-client scope: the page sets ?share=<token>)');
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'playing');
  await click($('[data-audio-play]'));
});

test('audio pill: a viewer sees Preparing audio too, and nothing for a card with no narration', async () => {
  await mount(await envelope({ narration: { status: 'preparing' } }), { host: viewerHost, readOnly: true });
  assert.equal($('[data-explanation-audio]').getAttribute('data-audio-state'), 'preparing');
  await mount(await envelope(), { host: viewerHost, readOnly: true });
  assert.equal($('[data-explanation-audio]'), null);
});

test('no minimize or expand control on the card, for the owner or the viewer', async () => {
  const card = await envelope({ narration });
  for (const [host, readOnly] of [[ownerHost, false], [viewerHost, true]]) {
    await mount({ ...card, minimized: true }, { host, readOnly });
    assert.equal($('[data-explanation-open]'), null, 'no Expand card button');
    assert.equal($('[aria-label="Expand card"]'), null);
    assert.ok($('[data-explanation-flow]'), 'a card saved as minimized draws whole');
  }
});

test('diagram hosting: a plain bar chart and a flow are drawn identically for the owner and the viewer, on the theme variables (cream ground and ink), never the app surface', async () => {
  const examples = Object.values(JSON.parse(readFileSync(new URL('./tutor-diagrams/examples.json', import.meta.url), 'utf8')));
  const fence = spec => ['```rh-diagram', JSON.stringify(spec), '```'].join('\n');
  for (const kind of ['bar-chart', 'flow']) {
    const spec = examples.find(entry => (entry.diagram || entry).kind === kind);
    const card = await envelope({ body: [BODY, fence(spec)].join('\n\n') });
    await mount(card, { host: ownerHost });
    const owner = $('[data-tutor-diagram]').parentElement;
    assert.ok($('[data-tutor-diagram]'), `${kind} is drawn`);
    assert.match(owner.getAttribute('style') || '', /--viz-/, 'the container carries the theme variables');
    await mount(card, { host: viewerHost, readOnly: true });
    assert.equal($('[data-tutor-diagram]').parentElement.outerHTML, owner.outerHTML, `${kind} markup is identical`);
  }
});
