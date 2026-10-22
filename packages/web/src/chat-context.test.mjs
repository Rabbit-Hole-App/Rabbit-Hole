// The Chat workspace's one context collection (chat-context.js, contract A2/A5) and its two views: the chips under the
// composer (ContextChips.jsx) and the Sources pane (SourcesPane.jsx). Bundled once with esbuild, as context-docs.test.mjs
// does, because the module imports the JSX component kit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'chat-context-')), outfile = join(dir, 'chat-context.cjs');
await esbuild.build({
  stdin: { contents: [
    "export * from './chat-context.js';",
    "export { default as ContextChips } from './ContextChips.jsx';",
    "export { default as SourcesPane, ContextUpload, docMeta, docNote } from './SourcesPane.jsx';",
    "export { ChatWorkspaceProvider } from './chat-workspace.jsx';",
    "export { createElement } from 'react';",
    "export { renderToStaticMarkup } from 'react-dom/server';",
  ].join('\n'), resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  external: ['./learn-paper-figures.js'], // the PDF page counter, dynamically imported on upload only
});
const require = createRequire(import.meta.url);
const C = require(outfile);
rmSync(dir, { recursive: true, force: true });

const doc = { id: 'ctx:0123456789ab', name: 'Attention.pdf', kind: 'pdf', size: 2048, attached: false, created_at: '2026-10-13 22:00:00' };
const card = { sourceId: 'card:shape:a', kind: 'card', name: 'Softmax', version: 'h1', range: null };
const page3 = { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Attention.pdf', version: '2026-10-13 22:00:00', range: { page: 3, quote: 'scaled dot' } };

test('a context doc becomes a doc:<id> ref whose version is its created_at', () => {
  assert.deepEqual(C.docRef(doc), { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Attention.pdf', version: '2026-10-13 22:00:00', range: null });
});

test('sameRef: the same source and range, whatever the key order; another range is another ref', () => {
  assert.ok(C.sameRef(page3, { ...page3, range: { quote: 'scaled dot', page: 3 } }));
  assert.ok(!C.sameRef(page3, { ...page3, range: { page: 4, quote: 'scaled dot' } }));
  assert.ok(!C.sameRef(page3, C.docRef(doc)));
  assert.ok(C.sameRef(card, { ...card, range: undefined }));
  assert.equal(C.refKey(page3), C.refKey({ ...page3, range: { quote: 'scaled dot', page: 3 } }));
});

test('attached: restore replaces, New chat restores none, attach de-duplicates and stops at 20, detach removes one ref', () => {
  const restored = C.attachedReducer([card], { type: 'restore', refs: [page3, null, { name: 'no id' }] });
  assert.deepEqual(restored, [page3]);
  assert.deepEqual(C.attachedReducer(restored, { type: 'restore', refs: [] }), []);
  assert.deepEqual(C.attachedReducer(restored, { type: 'restore', refs: undefined }), []);
  const twice = C.attachedReducer(C.attachedReducer([], { type: 'attach', ref: card }), { type: 'attach', ref: { ...card } });
  assert.deepEqual(twice, [card]);
  const both = C.attachedReducer([page3], { type: 'attach', ref: C.docRef(doc) });
  assert.equal(both.length, 2, 'a page of a doc and the whole doc are two refs');
  assert.deepEqual(C.attachedReducer(both, { type: 'detach', ref: page3 }), [C.docRef(doc)]);
  const full = Array.from({ length: C.MAX_REFS }, (_, i) => ({ ...card, sourceId: `card:shape:${i}` }));
  assert.equal(C.attachedReducer(full, { type: 'attach', ref: card }), full);
});

test('New chat starts from the canvas docs switched on, each offered once; a restored thread keeps its own refs', () => {
  const on = { ...doc, attached: true }, off = { ...doc, id: 'ctx:ffffffffffff', name: 'off.md', kind: 'text', attached: false };
  const offered = new Set();
  // New chat: the previous thread's card and passage are gone, the switched-on doc arrives, the switched-off one does not.
  let refs = C.attachedReducer([card, page3], { type: 'restore', refs: [] });
  const seed = docs => { for (const ref of C.canvasDocRefs(docs, offered)) { offered.add(ref.sourceId); refs = C.attachedReducer(refs, { type: 'attach', ref }); } };
  seed([on, off]);
  assert.deepEqual(refs, [C.docRef(on)]);
  // Detached for this conversation, it stays detached when the list re-reads.
  refs = C.attachedReducer(refs, { type: 'detach', ref: C.docRef(on) });
  seed([on, off]);
  assert.deepEqual(refs, []);
  // A doc switched on in the Files panel during the new chat still arrives.
  seed([on, { ...off, attached: true }]);
  assert.deepEqual(refs.map(ref => ref.sourceId), ['doc:ctx:ffffffffffff']);
  // A restored thread: exactly its own refs, whatever the canvas has switched on.
  assert.deepEqual(C.attachedReducer(refs, { type: 'restore', refs: [card] }), [card]);
  assert.deepEqual(C.canvasDocRefs([on], new Set(['doc:ctx:0123456789ab'])), []);
});

test('docUrl reads one context doc of this canvas', () => {
  assert.equal(C.docUrl('canvas-0123abcd', 'ctx:0123456789ab'), '/api/learn/context/ctx%3A0123456789ab?app=canvas-0123abcd');
});

test('the collection: uploads first, then the canvas docs, then every other attached ref, each once', () => {
  const upload = { id: 'upload:1', ref: { sourceId: 'upload:1', kind: 'doc', name: 'notes.md', version: '', range: null }, state: 'uploading' };
  const items = C.contextItems([doc], [card, C.docRef(doc), page3, { ...card }], [upload]);
  assert.deepEqual(items.map(item => [item.ref.sourceId, item.state, item.attached]), [
    ['upload:1', 'uploading', false],
    ['doc:ctx:0123456789ab', 'ready', true],
    ['card:shape:a', 'ready', true],
    ['doc:ctx:0123456789ab', 'ready', true],
  ]);
  assert.equal(items[1].doc, doc, 'a doc ref carries its row, so the reader knows PDF from text');
  assert.equal(items[3].doc, doc, 'so does a passage of it');
  assert.equal(items[2].doc, undefined);
  const notAttached = C.contextItems([doc], []);
  assert.equal(notAttached[0].attached, false, 'the canvas-level switch on a doc is not the conversation attaching it');
});

test('range labels', () => {
  assert.equal(C.rangeLabel(null), '');
  assert.equal(C.rangeLabel({ page: 3, quote: 'x' }), 'p. 3');
  assert.equal(C.rangeLabel({ path: 'src/x.py', start: 10, end: 42 }), 'L10-42');
  assert.equal(C.rangeLabel({ path: 'src/x.py', start: 7, end: 7 }), 'L7');
  assert.equal(C.rangeLabel({ startSec: 12, endSec: 40 }), '0:12-0:40');
  assert.equal(C.rangeLabel({ startSec: 65 }), '1:05');
  assert.equal(C.rangeLabel({ cardIds: ['shape:a', 'shape:b', 'shape:c'] }), '3 cards');
  assert.equal(C.rangeLabel({ cardIds: ['shape:a'] }), '1 card');
  assert.equal(C.rangeLabel({ quote: 'short' }), '“short”');
  assert.equal(C.rangeLabel({ quote: 'a passage that runs well past the label' }), '“a passage that runs well…”');
});

test('Open externally: wiki, arXiv and GitHub addresses; nothing for uploads and canvas objects', () => {
  assert.equal(C.externalUrl({ sourceId: 'wiki:Neural network', range: null }), 'https://en.wikipedia.org/wiki/Neural%20network');
  assert.equal(C.externalUrl({ sourceId: 'paper:1706.03762', range: { page: 3 } }), 'https://arxiv.org/abs/1706.03762#page=3');
  assert.equal(C.externalUrl({ sourceId: 'paper:upload:abc', range: null }), null);
  assert.equal(C.externalUrl({ sourceId: 'code:acme/repo@0a1b2c:src/x.py', range: { path: 'src/x.py', start: 10, end: 42 } }), 'https://github.com/acme/repo/blob/0a1b2c/src/x.py#L10-L42');
  assert.equal(C.externalUrl(page3), null);
  assert.equal(C.externalUrl(card), null);
});

test('Sources sections: the active source opens on its own item, else on its source, else first and unattached', () => {
  const items = C.contextItems([doc], [card]);
  assert.ok(C.paneSections(items, null).every(section => !section.active));
  const onCard = C.paneSections(items, { ...card });
  assert.deepEqual(onCard.map(section => section.active), [false, true]);
  const onPage = C.paneSections(items, page3);
  assert.equal(onPage.length, 2);
  assert.equal(onPage[0].active, true);
  assert.equal(onPage[0].ref, page3, 'the doc section reads at the cited page');
  const cited = { sourceId: 'paper:1706.03762', kind: 'web', name: 'Attention Is All You Need', version: 'v7', range: null };
  const onPaper = C.paneSections(items, cited);
  assert.equal(onPaper.length, 3);
  assert.deepEqual([onPaper[0].active, onPaper[0].item.attached], [true, false], 'viewing never attaches');
  assert.equal(new Set(onPaper.map(section => section.key)).size, 3);
});

test('Ask about this adds the range to the chat and nothing else', () => {
  const calls = [];
  C.askAboutThis({ addToChat: ref => calls.push(ref) }, page3);
  assert.deepEqual(calls, [page3]);
});

const text = html => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
test('chips and pane: nothing outside a Learn canvas; This canvas first; an empty Sources pane says how to add one', () => {
  assert.equal(C.renderToStaticMarkup(C.createElement(C.ContextChips)), '');
  assert.equal(C.renderToStaticMarkup(C.createElement(C.SourcesPane)), '');
  const inCanvas = node => C.renderToStaticMarkup(C.createElement(C.ChatWorkspaceProvider, { canvas: 'canvas-0123abcd' }, C.createElement(node)));
  assert.match(inCanvas(C.ContextChips), /^<div data-context-chips="true"><ul aria-label="Context for this chat"[^>]*><li data-canvas-context="true"/);
  assert.equal(text(inCanvas(C.ContextChips)), 'This canvas');
  const pane = text(inCanvas(C.SourcesPane));
  // UI-26: no Sources or Materials heading, and Upload sits in the Context header (ContextUpload), never between the files.
  assert.match(pane, /^No sources yet/);
  assert.doesNotMatch(pane, /\d+ files?\b/, 'no count in an empty list');
  assert.equal(text(inCanvas(C.ContextUpload)), 'Upload');
  assert.equal(C.renderToStaticMarkup(C.createElement(C.ContextUpload)), '', 'no Upload outside a Learn canvas');
});

// materials-remove.md: Remove from Materials. A whole-document chip of a removed document is stale (it would keep
// sending it); a ref at one of its pages is not (a PDF page on the canvas still asks about that page); nothing else is touched.
test('a removed context document: its whole-document chip is stale, a page of it and everything else stay', () => {
  const removed = [doc.id];
  assert.equal(C.staleRef(C.docRef(doc), removed), true);
  assert.equal(C.staleRef(page3, removed), false, 'a page ref stays');
  assert.equal(C.staleRef(card, removed), false);
  assert.equal(C.staleRef(C.docRef({ ...doc, id: 'ctx:ffffffffffff' }), removed), false, 'another document stays');
  assert.equal(C.staleRef(C.docRef(doc), []), false);
  // Every conversation, open or restored, lets go of its stale chips; the removal itself drops the open chat's chip at once.
  const { readFileSync } = require('node:fs');
  const hook = readFileSync(new URL('./chat-context.js', import.meta.url), 'utf8');
  assert.match(hook, /for \(const ref of attached\) if \(staleRef\(ref, removed\)\) dispatch\(\{ type: 'detach', ref \}\);\r?\n  \}, \[removed, attached\]\);/);
  // UI-26: the chip goes at once, but only in the conversation that asked; any other drops it by the removed ids above.
  assert.match(hook, /await removeContextDoc\(canvas, doc\.id\);\r?\n      if \(key\.current === startedIn\) dispatch\(\{ type: 'detach', ref \}\);/);
});

// UI-26 section 4: a document whose removal is in flight reads removing (its row pending, no second press); others do not.
test('contextItems marks only the document being removed', () => {
  const other = { ...doc, id: 'ctx:ffffffffffff', name: 'Other.pdf' };
  const items = C.contextItems([doc, other], [C.docRef(doc)], [], [doc.id]);
  assert.deepEqual(items.map(item => [item.ref.sourceId, !!item.removing, item.attached]), [[`doc:${doc.id}`, true, true], [`doc:${other.id}`, false, false]]);
  assert.equal(C.contextItems([doc], [], []).some(item => item.removing), false, 'nothing pending by default');
});

// UI-26 (owner brief 2026-10-22 sections 1-4): the Context list and the reader replace each other; each row is its icon, name
// and metadata, then Use in this chat (a labelled checkbox) and File options (a popover: the full name, Include in new chats,
// Add to canvas, Remove from context with a short confirmation). Add to canvas is a neutral labelled button, never inverse.
test('Context rows: Use in this chat, then File options with the full name, Include in new chats, Add to canvas and Remove from context', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  assert.match(source, /<li key=\{key\} data-material-row data-source-id=\{ref\.sourceId\}/, 'one row per file, named by its own source id');
  assert.match(source, /<span data-material-name title=\{name\} className=\{`min-w-0 truncate/, 'a long name truncates, with the full name as its tooltip');
  assert.match(source, /data-material-actions className="flex shrink-0 items-center gap-1 pb-1 pl-7 @\[30rem\]:pb-0 @\[30rem\]:pl-0"/, 'narrow rows put the actions on their own line');
  // Use in this chat: the conversation's attachment, a labelled checkbox.
  assert.match(source, /<input type="checkbox" data-material-action="chat" checked=\{!!item\.attached\} disabled=\{disabled\} onChange=\{onChange\}\s+aria-label=\{`Use \$\{name\} in this chat`\} className=\{BOX\} \/>Use in this chat/);
  assert.match(source, /const toggleChat = item => \{ if \(!item\.attached\) return context\.attach\(item\.ref\); context\.detach\(item\.ref\); onSwitchOff\?\.\(item\.ref\); \};/);
  // File options: the visible label, a popover beside its button (ui.jsx Menu: bounds, outside press, Escape back to the button).
  assert.match(source, /<button type="button" \{\.\.\.m\.buttonProps\} aria-haspopup="dialog" data-material-action="more" disabled=\{pending\}\s+aria-label=\{`File options for \$\{name\}`\}/);
  assert.match(source, /<MoreHorizontal size=\{13\} aria-hidden \/>\}File options\r?\n/);
  assert.match(source, /<Menu portal anchor=\{m\.button\.current\} open onClose=\{m\.onClose\} style=\{style\} className="w-72">/);
  assert.match(source, /setAbove\(r\.bottom \+ 4 \+ h > window\.innerHeight - 8 && r\.top - 4 - h >= 8 \? h : null\);/, 'above its button when there is no room below');
  const order = ['data-material-menu-name', 'data-material-action="context"', 'data-material-action="canvas"', 'data-material-action="remove"'].map(at => source.indexOf(at));
  assert.ok(order.every(at => at > 0) && order.every((at, i) => !i || at > order[i - 1]), `the popover: name, new chats, Add to canvas, Remove (${order})`);
  // Include in new chats: the canvas default, its own setting apart from this chat.
  assert.match(source, /data-material-action="context" checked=\{onCanvas\} disabled=\{pending\} onChange=\{\(\) => onContext\(!onCanvas\)\}/);
  assert.match(source, />Include in new chats<\/span>\s+<span data-material-menu-note [^>]*>New chats on this canvas start with this file\. Your current chat stays unchanged\.<\/span>/);
  assert.match(source, /onContext=\{on => run\(item, 'context', \(\) => context\.canvasContext\(item\.doc, on\)\)\}/);
  // Add to canvas: this row's PDF (or imported file), a neutral button in the reader, a popover item in the list.
  assert.match(source, /if \(ready && !!pdfKeyOfRef\(ref\) && \(ref\.kind !== 'doc' \|\| doc\?\.kind === 'pdf'\)\) return \(\) => addToCanvas\(ref\);/);
  assert.match(source, /const addToCanvas = ref => window\.dispatchEvent\(new CustomEvent\('small:pdf-to-canvas', \{ detail: \{ sourceId: ref\.sourceId, kind: ref\.kind, name: ref\.name \} \}\)\);/);
  assert.match(source, /<Button variant="secondary" size="sm" data-material-action="canvas"/);
  assert.doesNotMatch(source, /variant="inverse"/, 'no competing inverse Add to canvas');
  // Remove from context: clearly labelled, a short confirmation, pending while it runs, an actionable error on failure.
  assert.match(source, /data-material-action="remove" disabled=\{pending\} onClick=\{\(\) => setConfirming\(true\)\} className="text-danger! [^"]*">Remove from context<\/MenuItem>/);
  assert.match(source, /<Button size="sm" variant="danger" data-material-remove-yes disabled=\{pending\} onClick=\{onRemove\}>/);
  assert.match(source, /Remove from context\? New requests stop reading it\. Canvas cards that use it keep working\./);
  assert.match(source, /Could not remove \$\{item\.ref\.name\} from context: \$\{error\.message\}\. Try again from File options\./);
  assert.match(source, /if \(rows\[key\]\?\.busy\) return;/, 'one action at a time per row');
  // Success: back to Files when its reader is open, only on the canvas that asked.
  assert.match(source, /const now = live\.current;\r?\n\s+if \(now\?\.canvas !== canvas\) return;\r?\n\s+if \(now\.sources\.active\?\.sourceId === item\.ref\.sourceId\) now\.sources\.close\(\);/);
  // The reader replaces the list, with Back to Files and the title once.
  assert.match(source, /if \(reading\) \{/);
  assert.match(source, /<ArrowLeft size=\{15\} aria-hidden \/>Back to Files<\/button>/);
  assert.match(source, /<h2 data-context-title /);
  assert.match(source, /\{!item\.attached && <span data-not-attached [^>]*>Not attached<\/span>\}/, 'a preview not used in this chat says so');
  assert.match(source, /<p data-context-count aria-live="polite" [^>]*>\{fileCount\(sections\.length\)\}<\/p>/);
  assert.doesNotMatch(source, /data-sources-close|from Materials/, 'one Close (CompanionHeader); the old Materials wording is gone');
  const paper = readFileSync(new URL('./LearnPaper.jsx', import.meta.url), 'utf8');
  assert.match(paper, /\{!companion && <h3 className="truncate text-sm font-medium">\{paper\.title\}<\/h3>\}/, 'the Context reader shows no second title');
  assert.match(paper, /<div role="group" aria-label="Pages"[^]*?<div role="group" aria-label="Zoom"/, 'pages and zoom each one group');
});

// pdf-materials-refinement.md section 1: the row's canvas context switch and this chat are separate - switching a document on
// for the canvas marks it offered first, so a new conversation that follows the canvas's documents does not also attach it.
test('the canvas context switch never attaches the document to this chat', () => {
  const { readFileSync } = require('node:fs');
  const hook = readFileSync(new URL('./chat-context.js', import.meta.url), 'utf8');
  assert.match(hook, /const canvasContext = useCallback\(async \(doc, on\) => \{ offered\.current\.add\(`doc:\$\{doc\.id\}`\); await toggleContextDoc\(canvas, doc\.id, on\); \}, \[canvas\]\);/);
  const offered = new Set(['doc:ctx:0123456789ab']);
  assert.deepEqual(C.canvasDocRefs([{ ...doc, attached: true }], offered), [], 'switched on but already offered: not attached');
  const docs = readFileSync(new URL('./context-docs.js', import.meta.url), 'utf8');
  assert.match(docs, /export async function toggleContextDoc\(app, id, attached\) \{\r?\n  const data = await request\('PATCH', `\/api\/learn\/context\/\$\{encodeURIComponent\(id\)\}`, \{ app, attached \}\);/);
});

// Dark mode re-pins --color-white to white inside any class naming bg-accent (index.css): the row controls name neither, and
// carry no surface of their own (neutral rows on the panel's own surface, both themes).
test('Context row controls keep the panel surface in both themes', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  for (const name of ['CHECK', 'OPTIONS', 'BOX']) assert.doesNotMatch(source.match(new RegExp(`const ${name} = '([^']+)'`))[1], /bg-accent|bg-white|bg-ink/, name);
});

// PDF-02 status on a Context row (contract-pdf-status.md): pages in the metadata; a long PDF's reading and its pages without
// text as a note; a legacy row (no new fields) reads as before.
test('Context row metadata: pages, how a long PDF is read, pages without text; legacy rows unchanged', () => {
  const day = new Date('2026-10-13T22:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  assert.equal(C.docMeta({ ...doc, pages: 312, size: 2_400_000 }), `PDF · 312 pages · 2.4 MB · ${day}`);
  assert.equal(C.docMeta({ ...doc, pages: 1 }), `PDF · 1 page · 2 KB · ${day}`);
  assert.equal(C.docMeta(doc), `PDF · 2 KB · ${day}`, 'a legacy row has no page count');
  assert.equal(C.docNote({ ...doc, reads: 'pages', noText: 3 }), 'Questions read the relevant pages · 3 pages without text');
  assert.equal(C.docNote({ ...doc, reads: 'whole', noText: 0 }), '');
  assert.equal(C.docNote(doc), '');
});

// PDF-02 states on a Context row (contract-pdf-status.md sections 2-3): a failed document shows the server's message and a
// labelled Retry that reads its pages again in this browser (retryContextDoc); while this tab reads pages the row says how far.
test('Context rows: Retry on a failed PDF, and the page-reading progress on its row', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  assert.match(source, /const jobs = useContextProcessing\(chat\?\.canvas\);/);
  assert.match(source, /const readingLabel = job => \(job\?\.total \? `Reading pages \$\{job\.done\} of \$\{job\.total\}` : ''\);/);
  assert.match(source, /const job = item\.doc \? jobs\.find\(entry => entry\.id === item\.doc\.id\) : busy \? jobs\.find\(entry => !entry\.id && entry\.name === name\) : null;/);
  assert.match(source, /\{ready && item\.doc\?\.status === 'failed' && <Button variant="secondary" size="sm" data-material-action="retry" disabled=\{reading \|\| pending\}\s+onClick=\{\(\) => run\(item, 'retry', \(\) => retryContextDoc\(chat\.canvas, item\.doc\.id, name\)\)\}/);
  assert.match(source, /\{item\.doc\?\.status === 'failed' && !reading && <p role="alert" data-material-doc-error [^>]*>\{item\.doc\.error\?\.message \|\| 'This file could not be read\.'\}<\/p>\}/);
  assert.match(source, /`Could not read the pages of \$\{item\.ref\.name\}: \$\{error\.message\}`/);
});
