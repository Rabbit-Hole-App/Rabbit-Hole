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
    "export { default as SourcesPane } from './SourcesPane.jsx';",
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
  // Owner brief 2026-10-16 item 4: the blue Upload first, no Sources or Materials heading.
  assert.match(pane, /^Upload No sources yet/);
  assert.match(pane, /No sources yet/);
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
  assert.match(hook, /const remove = useCallback\(async doc => \{ await removeContextDoc\(canvas, doc\.id\); dispatch\(\{ type: 'detach', ref: docRef\(doc\) \}\); \}, \[canvas\]\);/);
});

// pdf-materials-refinement.md sections 1-5: four row actions in order, each naming its own row's document; no document action in
// the header; Upload always a visible button; Remove from Materials confirmed and scoped; a failure kept on the row.
test('Materials rows: canvas context, Add to canvas, this chat, then Remove from Materials, each on its own row', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  const order = ['context', 'canvas', 'chat', 'remove'].map(action => source.indexOf(`data-material-action="${action}"`));
  assert.ok(order.every(at => at > 0) && order.every((at, i) => !i || at > order[i - 1]), `the four actions in order (${order})`);
  assert.match(source, /<div data-material-row data-source-id=\{ref\.sourceId\} className="@container/, 'one row per material, named by its own source id');
  assert.match(source, /<span data-material-name title=\{name\} className=\{`min-w-0 truncate/, 'a long name truncates, with the full name as its tooltip');
  assert.match(source, /data-material-actions className="flex shrink-0 items-center gap-1 pb-1 pl-7 @\[22rem\]:pr-1 @\[22rem\]:pb-0 @\[22rem\]:pl-0"/, 'narrow rows put the actions on a second line');
  // Canvas context: the canvas-level flag of this row's document, pressed state exposed; never this chat's attachment.
  assert.match(source, /data-material-action="context" aria-pressed=\{onCanvas\}[^]*?context\.canvasContext\(doc, !onCanvas\)[^]*?aria-label=\{`\$\{onCanvas \? 'Detach' : 'Attach'\} \$\{name\} \$\{onCanvas \? 'from' : 'to'\} canvas context`\}/);
  // Add to canvas: this row's ref, PDFs only.
  assert.match(source, /const canAdd = ready && !!pdfKeyOfRef\(ref\) && \(ref\.kind !== 'doc' \|\| doc\?\.kind === 'pdf'\);/);
  assert.match(source, /data-material-action="canvas" onClick=\{act\(\(\) => addToCanvas\(ref\)\)\}\s+aria-label=\{`Add \$\{name\} to canvas`\}/);
  assert.match(source, /const addToCanvas = ref => window\.dispatchEvent\(new CustomEvent\('small:pdf-to-canvas', \{ detail: \{ sourceId: ref\.sourceId, kind: ref\.kind, name: ref\.name \} \}\)\);/);
  // This chat: the conversation's attachment, pressed state exposed.
  assert.match(source, /data-material-action="chat" aria-pressed=\{!!item\.attached\}\s+onClick=\{act\(\(\) => \(item\.attached \? context\.detach\(item\.ref\) : context\.attach\(item\.ref\)\)\)\}\s+aria-label=\{item\.attached \? `Remove \$\{name\} from this chat` : `Attach \$\{name\} to this chat`\}/);
  // Remove from Materials: set apart, asks first, scoped, a failure kept on the row.
  assert.match(source, /<span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line" \/>\s+<button type="button" data-material-action="remove" onClick=\{act\(\(\) => setRemoving\(item\)\)\}/);
  assert.match(source, /aria-label=\{`Remove \$\{name\} from Materials`\} title=\{`Remove \$\{name\} from Materials`\}/);
  assert.match(source, /<div data-material-remove-confirm className="fixed inset-0 z-50">\s+<ConfirmDialog title="Remove from Materials\?" confirmLabel="Remove from Materials"/);
  assert.match(source, /is removed from Materials and from future AI requests\. Canvas cards and pages that use it keep working, earlier messages stay as they are, and the file is not deleted\./);
  assert.match(source, /onConfirm=\{\(\) => remove\(removing\)\} onCancel=\{\(\) => setRemoving\(null\)\}/);
  assert.match(source, /if \(active\?\.sourceId === item\.ref\.sourceId && !active\.range\) sources\.close\(\);/, 'a removed document open in the reader is put down');
  assert.match(source, /catch \(error\) \{ setRows\(state => \(\{ \.\.\.state, \[key\]: \{ error: `Could not/, 'a failure keeps the row and names why');
  assert.match(source, /\{row\.error && <p role="alert" data-material-error/);
  // Every row action stops there; the header keeps no document action; Upload is a visible button.
  assert.match(source, /const act = work => event => \{ event\.stopPropagation\(\); work\(\); \};/);
  assert.equal((source.match(/onClick=\{act\(/g) || []).length, 6, 'context, canvas, chat, remove, retry and dismiss all go through act');
  assert.doesNotMatch(source, /data-source-add-canvas|Attach to this chat<\/MenuItem>|Detach from this chat/);
  assert.match(source, /<Button variant="action" size="sm" data-materials-upload onClick=\{\(\) => picker\.current\?\.click\(\)\}>\s+<Upload size=\{14\} aria-hidden \/> Upload/);
  assert.doesNotMatch(source, /data-sources-close/, 'one Close: the companion column header closes the viewer (PanelHeader.jsx CompanionHeader)');
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

// Dark mode re-pins --color-white to white inside any class naming bg-accent (index.css): a resting row action never names it.
test('a resting Materials row action keeps its dark surface', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  const base = source.match(/const ROW_ACTION = '([^']+)'/)[1], rest = source.match(/: '(border-line bg-white[^']+)'/)[1];
  assert.doesNotMatch(`${base} ${rest}`, /bg-accent/);
  assert.match(source, /const rowAction = \(pressed = false\) => `\$\{ROW_ACTION\} \$\{pressed \? 'border-accent\/40 bg-accent\/10 text-accent hover:bg-accent\/20' : 'border-line bg-white/);
});
