// Canvas context documents (docs/features/canvas-context-docs.md), browser side: the header the Files panel and the
// composer's Context list show, rendered once on the server from an esbuild bundle (as learn-next-steps-ui.test.mjs does),
// and the browser's switched-on limit pinned to the server's so the two cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { ATTACHED_LIMIT as SERVER_LIMIT } from '../../control-plane/src/learn-context-docs.js';

const dir = mkdtempSync(join(tmpdir(), 'context-docs-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: ["export { default as ContextDocs } from './ContextDocs.jsx';", "export { ATTACHED_LIMIT, EVENT, addContextUrl, listSync, removeContextDoc } from './context-docs.js';", "export { webpageCard, sameWebpageCard } from './webcard.js';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  external: ['./learn-paper-figures.js'], // the PDF page counter, dynamically imported on upload only
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

test('context docs: ten on at once, the same limit as the server', () => {
  assert.equal(B.ATTACHED_LIMIT, 10);
  assert.equal(B.ATTACHED_LIMIT, SERVER_LIMIT);
});

test('context docs: the header reads "Context · N of 10 on"', () => {
  const docs = [{ id: 'ctx:000000000001', name: 'Attention.pdf', kind: 'pdf', size: 2 * 1024 * 1024, attached: true }];
  const html = B.renderToStaticMarkup(B.createElement(B.ContextDocs, { context: { docs, busy: false, upload() {}, toggle() {}, remove() {}, on: 4 } }));
  const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Context · 4 of 10 on/);
});

// UI-26 section 4: Remove from context used to need a refresh. The DELETE's own answer (the list after the removal) now reaches
// every mounted list through the event, a second press shares the one request, and a list read sent before the removal landed
// can never apply after it (it would bring the removed row back).
test('a removal: one DELETE for a double press, its answer in the event, an older read never resurrects the row', async () => {
  const app = 'canvas-0123abcd', id = 'ctx:0123456789ab', after = { documents: [], removed: [id] };
  const calls = [], events = [];
  let answer;
  Object.assign(globalThis, {
    window: new EventTarget(), localStorage: { getItem: () => '' },
    fetch: (url, init) => { calls.push(`${init.method} ${url}`); return new Promise(resolve => { answer = () => resolve(new Response(JSON.stringify(after), { status: 200 })); }); },
  });
  window.addEventListener(B.EVENT, event => events.push(event.detail));
  const first = B.removeContextDoc(app, id), second = B.removeContextDoc(app, id);
  assert.equal(first, second, 'the second press waits on the first request');
  assert.deepEqual(calls, [`DELETE /api/learn/context/${encodeURIComponent(id)}?app=${app}`], 'one DELETE');
  answer();
  assert.deepEqual(await first, after);
  assert.deepEqual(events, [{ app, data: after }], 'every list of the canvas gets the answer itself, no re-read needed');
  B.removeContextDoc(app, id);
  assert.equal(calls.length, 2, 'once settled, a later removal is a new request');

  // Reads and changes in any order: a read sent before the change landed is dropped, a read sent after it applies.
  const sync = B.listSync();
  const before = sync.issue();   // a list read in flight (the document still listed)
  sync.settle();                 // the DELETE's answer applies
  assert.equal(sync.accept(before), false, 'the older read cannot bring the row back');
  const later = sync.issue();
  assert.equal(sync.accept(later), true, 'a read sent after the removal applies');
  const a = sync.issue(), b = sync.issue();
  assert.equal(sync.accept(b), true);
  assert.equal(sync.accept(a), false, 'reordered reads: the newer one wins');
});

test('useContextDocs applies answers by canvas and by number, and never re-reads over a change it was handed', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./context-docs.js', import.meta.url), 'utf8');
  assert.match(source, /if \(forApp !== current\.current\) return;/, 'an answer for another canvas never shows here');
  assert.match(source, /const n = sync\.current\.issue\(\);\r?\n\s+request\('GET', [^\n]+\.then\(data => \{ if \(sync\.current\.accept\(n\)\) apply\(app, data\); \}\)/);
  assert.match(source, /if \(!event\.detail\.data\) return read\(\);\r?\n\s+sync\.current\.settle\(\);\r?\n\s+apply\(app, event\.detail\.data\);/);
  assert.match(source, /const docs = list\.app === app \? list\.docs : \[\], removed = list\.app === app \? list\.removed : \[\];/);
});

// Add context with a web address (owner brief 2026-10-29): an ordinary page is captured for the canvas's Context (context: true,
// on no board) and its approved capture linked; a double submit captures once; a page still being checked is polled; a refusal
// throws its reason and links nothing; arXiv, Wikipedia and YouTube keep their note; only https is added. Refresh names its
// document and lineage. Every request is answered here: nothing is captured, screened or sent to a model.
test('addContextUrl: capture for Context, poll, link; one capture for a double submit; the reason on a refusal; notes for special links', async () => {
  const app = 'canvas-0123abcd', manifest = `fs_${'a'.repeat(24)}`, doc = { id: 'ctx:0123456789ab', name: 'Rivers', kind: 'webpage' };
  const calls = [], events = [];
  let capture = { status: 'screening', manifestId: manifest, reason: null };
  Object.assign(globalThis, {
    window: new EventTarget(), localStorage: { getItem: () => '' },
    fetch: async (url, init = {}) => {
      calls.push([init.method || 'GET', String(url), init.body ? JSON.parse(init.body) : null]);
      const answer = String(url).startsWith('/api/learn/webpages/') ? { status: 'ready', manifestId: manifest } : url === '/api/learn/webpages' ? capture
        : { document: doc, documents: [doc] };
      return new Response(JSON.stringify(answer), { status: 200 });
    },
  });
  window.addEventListener(B.EVENT, event => events.push(event.detail));
  const wait = async () => {};
  const first = B.addContextUrl(app, 'https://example.com/rivers', { wait }), second = B.addContextUrl(app, 'https://example.com/rivers', { wait });
  assert.equal(first, second, 'a double submit waits on the one capture');
  assert.deepEqual(await first, doc);
  assert.deepEqual(calls, [
    ['POST', '/api/learn/webpages', { app, context: true, url: 'https://example.com/rivers' }],
    ['GET', `/api/learn/webpages/${manifest}?app=${app}&context=1`, null],
    ['POST', '/api/learn/context/link', { app, manifest }],
  ], 'captured for Context (no board), polled while checked, then linked; never a second capture');
  assert.deepEqual(events, [{ app, data: { document: doc, documents: [doc] } }], 'every list of the canvas gets the new row');

  calls.length = 0;
  capture = { status: 'login_required', reason: 'This page needs a sign-in, so it cannot be captured.' };
  await assert.rejects(B.addContextUrl(app, 'https://example.com/private', { wait }), /needs a sign-in/);
  assert.deepEqual(calls.map(c => c[1]), ['/api/learn/webpages'], 'a refusal links nothing');
  capture = { status: 'blocked', reason: 'Hidden: this page did not pass content screening.' };
  await assert.rejects(B.addContextUrl(app, 'https://example.com/hidden', { wait }), /did not pass content screening/);

  calls.length = 0;
  capture = { status: 'ready', manifestId: manifest };
  await B.addContextUrl(app, 'https://example.com/rivers', { id: doc.id, lineage: `wc_${'1'.repeat(24)}`, wait });
  assert.deepEqual(calls.map(c => c[2]), [{ app, context: true, url: 'https://example.com/rivers', lineage: `wc_${'1'.repeat(24)}` }, { app, manifest, id: doc.id }], 'Refresh: same lineage, its document');

  calls.length = 0;
  await B.addContextUrl(app, 'https://arxiv.org/abs/1706.03762', { wait });
  assert.deepEqual(calls, [['POST', '/api/learn/context/link', { app, url: 'https://arxiv.org/abs/1706.03762' }]], 'arXiv keeps its note: no capture');
  await assert.rejects(B.addContextUrl(app, 'http://example.com/plain', { wait }), /https:\/\//);
  await assert.rejects(B.addContextUrl(app, 'not a link at all', { wait }), /one link at a time/);
  assert.equal(calls.length, 1, 'nothing sent for a refused address');
});

test('Add to canvas from a Context web page: the card of its saved capture, the same page revealed by lineage', () => {
  const capture = { lineage: `wc_${'1'.repeat(24)}`, manifestId: `fs_${'a'.repeat(24)}`, sha256: 'x' }, fileRef = { v: 1, source: { id: capture.manifestId, rev: 'x' }, family: 'webpage' };
  const card = B.webpageCard({ status: 'ready', title: 'Rivers', capture, fileRef }, 'https://example.com/rivers');
  assert.deepEqual(card, { type: 'webpage', url: 'https://example.com/rivers', title: 'Rivers', capture, fileRef, pending: null, failure: null, scrollTop: 0, scrollLocked: false });
  assert.equal(B.sameWebpageCard(capture.lineage)({ type: 'webpage', capture: { ...capture, manifestId: 'refreshed' } }), true, 'a refreshed card of that page counts');
  assert.equal(B.sameWebpageCard(capture.lineage)({ type: 'webpage', capture: { lineage: 'other' } }), false);
  assert.equal(B.sameWebpageCard(null)({ type: 'webpage', pending: { lineage: null } }), false);
});
