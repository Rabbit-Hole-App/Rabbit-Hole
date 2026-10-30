// REVIEW-CTX-REFRESH-01 (Add context, owner brief 2026-10-29): a context web page's text is replaced in place by Refresh. The
// reader reads it at its capture revision (docUrl ...&rev=), so an open reader shows the new revision when it arrives, a reopened
// one never reuses a cached older copy, and a Refresh that did not pass (no new revision) leaves the text on show. SourceReader is
// rendered with react-dom into linkedom (as card-prompt-reveal.test.mjs does); every read is answered here.
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
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
const TEXT = { r1: 'Web page: Rivers\n\nThe first revision.', r2: 'Web page: Rivers\n\nThe refreshed revision.' };
const reads = [];
globalThis.fetch = async url => {
  reads.push(String(url));
  const rev = new URL(String(url), 'http://local').searchParams.get('rev');
  return new Response(TEXT[rev] ?? 'unknown', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

const dir = mkdtempSync(join(tmpdir(), 'source-reader-')), outfile = join(dir, 'reader.cjs');
await esbuild.build({
  stdin: { contents: "export { default as SourceReader } from './SourceReader.jsx'; export { docUrl } from './chat-context.js'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const ref = { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Rivers', version: '', range: null };
const shown = () => document.querySelector('[data-source-text-view]')?.textContent || '';

test('docUrl names the capture revision when there is one, and only then', () => {
  assert.equal(B.docUrl('canvas-0a1b2c3d', 'ctx:0123456789ab'), '/api/learn/context/ctx%3A0123456789ab?app=canvas-0a1b2c3d');
  assert.equal(B.docUrl('canvas-0a1b2c3d', 'ctx:0123456789ab', 'ab12'), '/api/learn/context/ctx%3A0123456789ab?app=canvas-0a1b2c3d&rev=ab12');
});

test('an open reader shows the new revision after Refresh; a failed Refresh keeps the text; a reopened reader reads the current revision', async () => {
  const root = B.createRoot(document.getElementById('app'));
  const render = revision => B.act(async () => root.render(B.createElement(B.SourceReader, { sourceRef: ref, revision, position: undefined, onPosition() {} })));
  await render('r1');
  await settle();
  assert.match(shown(), /The first revision\./);
  assert.deepEqual(reads.map(u => new URL(u, 'http://local').searchParams.get('rev')), ['r1']);
  // A Refresh that did not pass links nothing: the list keeps revision r1, so the reader neither reads again nor changes.
  await render('r1');
  await settle();
  assert.equal(reads.length, 1);
  assert.match(shown(), /The first revision\./);
  // A passed Refresh: the list answers with revision r2 and the open reader reads and shows it, with no reopen.
  await render('r2');
  await settle();
  assert.match(shown(), /The refreshed revision\./);
  assert.equal(new URL(reads.at(-1), 'http://local').searchParams.get('rev'), 'r2', 'a new address, never a cached r1 copy');
  // Reopened (Back to Files, then the title): it reads the current revision again.
  await B.act(async () => root.unmount());
  const again = B.createRoot(document.getElementById('app'));
  await B.act(async () => again.render(B.createElement(B.SourceReader, { sourceRef: ref, revision: 'r2', position: undefined, onPosition() {} })));
  await settle();
  assert.match(shown(), /The refreshed revision\./);
  await B.act(async () => again.unmount());
});
