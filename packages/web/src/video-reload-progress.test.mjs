// A Motion video card reloaded while its job runs (bug under task 733e996d: a reload reset the progress bar to zero). The card
// reconnects to the job it saved (its placement id, a list GET, never a start), says Restoring progress (no bar, no 0%) until the
// server's first answer, then shows the elapsed time since the job started on the server (LearnVideos list startedAt). Rendered
// through the real VideoBody with react-dom into linkedom after an esbuild bundle (as card-prompt-reveal.test.mjs does); the video
// route is a fake here. The reload in a browser is checked by e2e/motion-command-check.mjs (MOCKED reload mid-job).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
window.innerWidth = 1000; window.innerHeight = 700;
window.location = { origin: 'http://localhost', pathname: '/', search: '', href: 'http://localhost/' }; // the clip's asset URL is absolute
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node' } });

// The fake video route: every request recorded; a list GET waits until the test answers it.
const requests = [];
let answers = [];
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), method: init.method || 'GET', body: init.body || '' });
  const body = await new Promise(resolve => answers.push(resolve));
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const dir = mkdtempSync(join(tmpdir(), 'video-reload-')), outfile = join(dir, 'video.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement, act, useState } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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
// The card as the board holds it: its changes are kept, as the canvas keeps them.
function Host({ initial }) {
  const [block, setBlock] = B.useState(initial);
  return B.createElement('div', { id: 'card' }, B.createElement(B.LearningBlockBody, { block, onChange: setBlock, onFile() {}, appName: 'app', selected: true }));
}
async function mount(block) {
  if (root) await B.act(async () => root.unmount());
  requests.length = 0; answers = [];
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  await B.act(async () => root.render(B.createElement(Host, { initial: block })));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); });
const answer = async body => { const next = answers.shift(); assert.ok(next, 'the card asked the server'); await B.act(async () => next(body)); await settle(); };
const text = () => document.getElementById('card').textContent;
const bar = () => document.querySelector('[data-progress]');
const starts = () => requests.filter(r => r.method !== 'GET');
const KEY = 'a'.repeat(64);
// A /motion card saved while its job ran: its placement id and the press's request id are on the card; confirmedStart was dropped.
const SAVED = { id: 'v1', type: 'video', mode: 'generate', title: 'Softmax', status: 'generating', placementId: 'p1', operation: { op: 'motion_request', request: '/motion 15s explain softmax', location: { concept: null }, request_id: 'press-1' } };

test('reloaded mid-job: Restoring progress (no bar, no 0%) until the first answer, then the time since the server started the job; only a list GET', async () => {
  await mount(SAVED);
  assert.match(text(), /Restoring progress/);
  assert.doesNotMatch(text(), /Restoring progress(\.\.\.|…)/, 'no ellipsis (standing UI rule)');
  assert.equal(bar(), null, 'no progress bar before the server answers');
  assert.doesNotMatch(text(), /\b0s elapsed|\b0%/, 'never 0 while the status is fetched');
  assert.deepEqual(requests.map(r => [r.method, new URL(r.url, 'http://x').pathname]), [['GET', '/api/learn/video']], 'the reload reads its job; it starts nothing');
  await answer({ videos: [{ id: 'p1', key: KEY, status: 'generating', startedAt: Date.now() - 300_000 }] });
  assert.doesNotMatch(text(), /Restoring progress/);
  assert.match(text(), /Planning, reviewing and rendering · 30\ds elapsed/, 'the server start time, not the page load');
  assert.equal(bar()?.style.width, '33%', '300 s of the expected 900 s');
  assert.deepEqual(starts(), [], 'no start, no stop, no recovery request');
});

test('an answer without a start time shows the stage words with no bar or percent', async () => {
  await mount(SAVED);
  await answer({ videos: [{ id: 'p1', key: KEY, status: 'generating' }] });
  assert.match(text(), /Planning, reviewing and rendering/);
  assert.doesNotMatch(text(), /Restoring progress|elapsed/);
  assert.equal(bar(), null);
});

test('a job that finished while the page was away shows its video on the first answer, with no start', async () => {
  await mount(SAVED);
  await answer({ videos: [{ id: 'p1', key: KEY, status: 'ready', motion: { title: 'Softmax in 15 s', duration_seconds: 15 } }] });
  const video = document.querySelector('video[data-lesson-video]');
  assert.ok(video, 'the ready video is shown');
  assert.match(video.getAttribute('src'), new RegExp(`asset=${KEY}`));
  assert.doesNotMatch(text(), /Restoring progress|elapsed/);
  assert.deepEqual(starts(), []);
});

test('a replayed mount of the saved card (a second reload) issues no job-creating request', async () => {
  for (let i = 0; i < 2; i++) {
    await mount(SAVED);
    await answer({ videos: [{ id: 'p1', key: KEY, status: 'generating', startedAt: Date.now() - 60_000 }] });
    assert.deepEqual(starts(), [], `mount ${i + 1}: no POST`);
    assert.equal(requests.length, 1, 'one list GET');
  }
});
