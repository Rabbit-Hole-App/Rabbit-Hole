// Card thumbnails (docs/features/card-thumbnails.md): the region a snapshot shows, when a snapshot is taken, what a chosen
// picture may be, the addresses cards load, and the card layout the owner asked for (picture right, one card per row,
// every card one size).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHROME, COVER_LIMIT, REPOSITORY_CARDS, THUMBNAIL, canvasPictures, redactRepositoryCards, UNSELECTED, bumpThumbnail, canvasThumbnail, cardThumbnail, coverProblem, ownThumbnail, publishedThumbnail, subscribeThumbnails, thumbnailBumps, thumbnailRegion, thumbnailScheduler } from './card-thumbnail.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the region is the content made 2:1: wide content centred, a tall column keeps its top, never past 2x zoom', () => {
  assert.equal(THUMBNAIL.width / THUMBNAIL.height, 2);
  assert.equal(thumbnailRegion([]), null, 'an empty canvas has no snapshot');
  assert.equal(thumbnailRegion([{ x: 0, y: 0, w: NaN, h: 1 }]), null);
  // Wide: 2000 x 400 of content (2048 x 448 with the margin) -> 2048 x 1024, centred vertically.
  assert.deepEqual(thumbnailRegion([{ x: 0, y: 0, w: 1000, h: 400 }, { x: 1000, y: 0, w: 1000, h: 400 }]), { x: -24, y: -312, w: 2048, h: 1024 });
  // Tall: one 560-wide column 3000 high keeps its top, widened by half again (912 x 456).
  const tall = thumbnailRegion([{ x: 100, y: 50, w: 560, h: 3000 }]);
  assert.deepEqual(tall, { x: 76 + (608 - 912) / 2, y: 26, w: 912, h: 456 });
  // Nearly 2:1: the whole card, centred.
  const card = thumbnailRegion([{ x: 0, y: 0, w: 552, h: 252 }]);
  assert.deepEqual([card.w, card.h, card.y], [600, 300, -24]);
  // A small sticky note never fills the picture at more than 2x.
  assert.deepEqual(thumbnailRegion([{ x: 0, y: 0, w: 100, h: 60 }]), { x: -150, y: -70, w: 400, h: 200 });
});

// Fake timers: run() fires only when the test says so.
const clock = () => {
  let at = 0, next = null;
  return {
    now: () => at,
    timers: { setTimeout: (fn, ms) => (next = { fn, due: at + ms }), clearTimeout: t => { if (t === next) next = null; } },
    async tick(ms) { at += ms; if (next && next.due <= at) { const { fn } = next; next = null; await fn(); } },
    get pending() { return next && next.due - at; },
  };
};

test('a snapshot per pause in saving, never per keystroke; at most one per 30 s; only changed content', async () => {
  const c = clock(), sent = [];
  let frame = 0;
  const s = thumbnailScheduler({ capture: async () => `shot-${++frame}`, upload: async blob => { sent.push(blob); }, now: c.now, timers: c.timers });
  s.saved('a'); await c.tick(1000); s.saved('ab'); await c.tick(1000); s.saved('abc');
  await c.tick(3999);
  assert.deepEqual(sent, [], 'still typing: nothing drawn');
  await c.tick(1);
  assert.deepEqual(sent, ['shot-1'], 'one snapshot after the 4 s pause, of the latest content');
  s.saved('abc'); await c.tick(4000);
  assert.deepEqual(sent, ['shot-1'], 'the same content again: nothing');
  s.saved('abcd'); await c.tick(4000);
  assert.deepEqual(sent, ['shot-1'], 'within 30 s of the last: waits');
  assert.equal(c.pending, 22000);
  await c.tick(22000);
  assert.deepEqual(sent, ['shot-1', 'shot-2']);
  s.stop(); s.saved('x'); s.stop(); await c.tick(60000);
  assert.deepEqual(sent, ['shot-1', 'shot-2'], 'stopped when the canvas closes');
});

test('a due snapshot waits while the learner pans, scrolls or types, and is drawn 1.5 s into the pause', async () => {
  // fast-e2e 39749160898: the capture inside a pan was a 514 ms frame at 10 webpage cards and a 1.2 s stall at 20.
  const c = clock(), sent = [];
  let input = -Infinity;
  const s = thumbnailScheduler({ capture: async () => 'shot', upload: async blob => { sent.push(blob); }, active: () => input, now: c.now, timers: c.timers });
  s.saved('a');
  for (let i = 0; i < 8; i += 1) { await c.tick(500); input = c.now(); } // panning from 0 to 4 s, past the 4 s delay
  await c.tick(1000);
  assert.deepEqual(sent, [], 'not while panning, nor 1 s into the pause');
  assert.equal(c.pending, 500);
  await c.tick(500);
  assert.deepEqual(sent, ['shot'], 'drawn once the pause reaches 1.5 s');
});

test('an empty canvas sends nothing and counts as done; a failed upload is tried again on the next save', async () => {
  const c = clock(), sent = [];
  let fail = true, empty = true;
  const s = thumbnailScheduler({ capture: async () => (empty ? null : 'shot'), upload: async blob => { if (fail) throw new Error('offline'); sent.push(blob); }, now: c.now, timers: c.timers });
  s.saved('none yet'); await c.tick(4000);
  assert.equal(c.pending, null, 'nothing to draw: done');
  empty = false; s.saved('a'); await c.tick(4000);
  assert.deepEqual(sent, []);
  fail = false; s.saved('a'); await c.tick(4000);
  assert.deepEqual(sent, ['shot'], 'the same content, not yet sent, goes on the next save');
});

test('leaving the canvas draws its last change at once, past the 4 s pause and the 30 s gap (owner follow-up 5)', async () => {
  const c = clock(), sent = [];
  let frame = 0;
  const s = thumbnailScheduler({ capture: async () => `shot-${++frame}`, upload: async blob => { sent.push(blob); }, now: c.now, timers: c.timers });
  s.saved('a'); await c.tick(4000);
  assert.deepEqual(sent, ['shot-1']);
  s.saved('ab'); await c.tick(1000);
  await s.flush();
  assert.deepEqual(sent, ['shot-1', 'shot-2'], 'a saved change 5 s after the last snapshot: drawn on leave, not lost');
  assert.equal(c.pending, null, 'nothing left waiting');
  await s.flush();
  assert.deepEqual(sent, ['shot-1', 'shot-2'], 'nothing new: no second snapshot');
  await s.flush('abc');
  assert.deepEqual(sent, ['shot-1', 'shot-2', 'shot-3'], 'a change whose save is still waiting: drawn as it will save');
  const fresh = thumbnailScheduler({ capture: async () => 'shot', upload: async blob => { sent.push(blob); }, now: c.now, timers: c.timers });
  await fresh.flush();
  assert.equal(sent.length, 3, 'a canvas opened and left unchanged sends nothing');
});

test('a new picture re-renders the cards already on the page (Home, the Library)', () => {
  let heard = 0;
  const before = thumbnailBumps(), off = subscribeThumbnails(() => { heard += 1; });
  bumpThumbnail('canvas-0000000c');
  assert.equal(heard, 1);
  assert.notEqual(thumbnailBumps(), before, 'useSyncExternalStore sees a new value');
  off(); bumpThumbnail('canvas-0000000c');
  assert.equal(heard, 1, 'unsubscribed');
  for (const file of ['./Home.jsx', './LibraryViews.jsx']) assert.match(read(file), /useSyncExternalStore\(subscribeThumbnails, thumbnailBumps\)/, file);
  assert.match(read('./LearnPage.jsx'), /useLayoutEffect\(\(\) => \(\) => leaveThumb\.current\(\), \[\]\)/, 'flushed while the canvas is still in the page');
  const learn = read('./LearnPage.jsx');
  assert.ok(learn.includes("canvasThumbnail({\n      name,\n      capture: () => canvasApi.current?.thumbnail?.() ?? null,\n      put: blob => api(`${boardPath}/thumbnail`"), 'each canvas page uploads under its own name and board');
  // A switch from A to B is a new page (so A's layout cleanup flushes A): canvases are keyed by name.
  assert.match(read('./RepositoryPage.jsx'), /<CanvasLearn key=\{picked\.name\}/);
  assert.match(read('./SharePage.jsx'), /<CanvasPage key=\{JSON\.stringify\(\[app\.email, app\.org, app\.name\]\)\}/);
});

test('edit A, switch to B at once, open Home: A shows its latest edit under its own name, B is unchanged (owner follow-up 5)', async () => {
  const c = clock(), puts = [], heard = [];
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const page = { a: 'A v1' }; // what canvas A's DOM holds; capture copies it at the moment it is called
  const gates = [];
  const pageFor = (name, read) => canvasThumbnail({ name, capture: async () => `${name}:${read()}`,
    put: async blob => { const gate = deferred(); gates.push(gate); await gate.promise; puts.push(blob); }, now: c.now, timers: c.timers });
  const off = subscribeThumbnails(() => heard.push(ownThumbnail('canvas-a')));
  const b0 = ownThumbnail('canvas-b');
  const a = pageFor('canvas-a', () => page.a);
  const settle = () => new Promise(r => setTimeout(r, 0));
  a.saved('a1'); const firstRun = c.tick(4000); await settle(); // the delayed snapshot of A v1: drawn, its upload still on its way
  assert.equal(gates.length, 1);
  page.a = 'A v2'; // the latest edit, not yet in any snapshot
  const left = a.flush('a2'); a.stop(); // LearnPage A unmounts: layout cleanup, then the passive stop
  page.a = 'gone'; // A's canvas is out of the page; B's opens
  const b = pageFor('canvas-b', () => 'B');
  assert.equal(c.pending, null, 'A stopped: nothing left on a timer');
  gates[0].resolve(); await firstRun; await settle(); // A v1's upload lands after the switch
  assert.equal(gates.length, 2, 'A v2 goes up after A v1, in order');
  gates[1].resolve(); await left;
  assert.deepEqual(puts, ['canvas-a:A v1', 'canvas-a:A v2'], 'A\'s own pictures, the last one drawn before A left');
  assert.match(ownThumbnail('canvas-a'), /\?v=\d+$/, 'Home loads A\'s new picture');
  assert.ok(heard.length >= 2, 'Home and the Library re-render when it lands');
  assert.equal(ownThumbnail('canvas-b'), b0, 'B unchanged');
  b.stop(); off();
});

test('a chosen picture: PNG, JPEG or WebP, at most 10 MB', () => {
  assert.equal(coverProblem(null), 'Choose an image.');
  assert.equal(coverProblem({ type: 'image/gif', size: 10 }), 'Choose a PNG, JPEG or WebP image.');
  assert.equal(coverProblem({ type: 'image/svg+xml', size: 10 }), 'Choose a PNG, JPEG or WebP image.');
  assert.equal(coverProblem({ type: 'image/jpeg', size: COVER_LIMIT + 1 }), 'Choose an image of at most 10 MB.');
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(coverProblem({ type, size: COVER_LIMIT }), null, type);
});

test('addresses: your own card by its name, a published card by its token; a change gets a new address', () => {
  assert.equal(publishedThumbnail('/e/AbC_dEf-123'), '/api/learn/boards/published/AbC_dEf-123/thumbnail');
  assert.equal(ownThumbnail('canvas-0000000a'), '/api/learn/boards/canvas-0000000a/main/thumbnail');
  bumpThumbnail('canvas-0000000a');
  assert.match(ownThumbnail('canvas-0000000a'), /^\/api\/learn\/boards\/canvas-0000000a\/main\/thumbnail\?v=\d+$/);
  assert.equal(cardThumbnail({ kind: 'repository', name: 'repo-x', canEdit: false }), '/api/learn/boards/repo-x/main/thumbnail', 'a project: your own board of it');
  for (const a of [{ kind: 'canvas', name: 'canvas-0000000b', fixture: true }, { kind: 'canvas', name: 'canvas-0000000b', archived_at: '2026-10-08' },
    { kind: 'canvas', name: 'canvas-0000000b', canEdit: false }, { kind: 'job', name: 'nightly' }]) assert.equal(cardThumbnail(a), null, JSON.stringify(a));
});

test('the card: the picture on the right from md, on top on a phone; one per row; one fixed size; quiet placeholder', () => {
  const card = read('./home/LearningCard.jsx');
  // Owner, 2026-10-22 (card size): the grid reads html[data-card-size] (index.css .card-grid); Large, the unset look, is one per row.
  assert.match(card, /export const CARD_ROWS = 'card-grid grid gap-4'/);
  assert.match(read('./index.css'), /\.card-grid \{ grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, var\(--card-min, 100%\)\), 1fr\)\); \}/);
  // Owner, 2026-10-09: the picture's inset above equals its inset below, and the footer ends on its bottom edge - the text
  // column and the picture are one fixed height from md, the card that plus its padding.
  assert.match(card, /export const CARD_BODY_H = 'md:h-\[190px\]';/);
  assert.match(card, /aspect-\[2\/1\][^`]*md:order-last \$\{CARD_BODY_H\} md:w-\[min\(380px,42%\)\] md:aspect-auto/, 'right of the text from md, the body\'s height, 2:1 where the card is wide');
  assert.match(card, /<div data-card-text className=\{`flex min-h-0 min-w-0 flex-1 flex-col \*:shrink-0 \$\{CARD_BODY_H\} \$\{CARD_TEXT_PHONE\}`\}>/);
  assert.match(card, /<div data-card-body className="flex min-h-0 min-w-0 shrink! flex-col gap-1 overflow-hidden pt-2">/, 'only the description gives way');
  assert.doesNotMatch(card, /CARD_HEIGHT/, 'no fixed card height: the body sets it');
  assert.match(card, /max-md:flex-col/, 'a phone stacks it above the text');
  assert.match(card, /max-md:h-\[196px\]/, 'and the text under it keeps one height');
  assert.match(card, /object-cover/, 'a custom picture is cropped to 2:1');
  assert.match(card, /data-card-thumbnail=\{shown \? 'image' : 'placeholder'\}/);
  assert.doesNotMatch(card, /min-h-\[186px\]/, 'a fixed height, not a floor');
  for (const [file, uses] of [['./Home.jsx', 2], ['./LibraryViews.jsx', 2], ['./home/PublicCards.jsx', 2]]) {
    const src = read(file);
    assert.equal(src.split('className={CARD_ROWS}').length - 1, uses, file);
    assert.doesNotMatch(src, /CARD_GRID/, file);
    assert.match(src, /thumbnail=\{(cardThumbnail|publishedThumbnail)\(/, file);
  }
  // Change cover (owner brief 2026-10-22: renamed from Change thumbnail; Use canvas snapshot moved into its picker as
  // Reset to canvas snapshot): the owner's menu only, and the reset only while a custom cover of yours is up.
  const menu = read('./home/CardMenu.jsx');
  assert.match(menu, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(menu, /cover\?\.name === dialog\.a\.name && cover\.source === 'custom'/);
  assert.match(menu, /<button type="button" data-menu-thumbnail-revert onClick=/);
  assert.match(menu, />Reset to canvas snapshot<\/button>/);
});

// Parallel, 2026-10-08: "the picture must never show canvas chrome", and always in the light theme.
test('the picture leaves out every piece of chrome by the canvas\'s own attributes, undoes selection, and draws light', () => {
  const canvas = read('./AdaptiveCanvas.jsx') + read('./comments/CommentPins.jsx');
  const wanted = ['[data-thumbnail-hide]', '[data-card-open]', '[data-port]', '[data-node-tool]', '[data-sketch-chrome]', '[data-label-handle]', '[data-comment-pins]', '[role="toolbar"]', 'iframe', 'video'];
  for (const selector of wanted) assert.ok(CHROME.split(',').includes(selector), selector);
  for (const attr of CHROME.match(/data-[a-z-]+/g)) assert.ok(canvas.includes(attr), `${attr} is a real attribute of the canvas`);
  // The selected card's pill rows (Explain, Continue, and the selection actions - SelectionActions.jsx hides its own bar), the text ladder
  // and the resize handles had none.
  // A card's Open and its tools are one row (CanvasNode, owner finding 2026-10-23): the row is the chrome, three other rows remain.
  assert.equal(canvas.match(/<div data-thumbnail-hide className="absolute -top-10 right-0 z-30/g).length, 3);
  assert.match(canvas, /<div data-card-chrome-row data-thumbnail-hide /);
  assert.match(read('./SelectionActions.jsx'), /data-selection-bar=\{mode\} data-thumbnail-hide/);
  assert.match(canvas, /aria-label=\{label\} data-keep-focus data-thumbnail-hide/); // the text ladder and the equation's size ladder
  assert.equal(canvas.match(/<button type="button" data-thumbnail-hide aria-label=/g).length, 2);
  assert.equal(canvas.match(/<(rect|circle) (key=\{index\} )?data-thumbnail-hide/g).length, 2, 'a shape\'s outline and handles');
  // A selected card, note, text or sketch loses its ring; a group its accent outline.
  assert.match(UNSELECTED, /\[data-block-id\], \[data-item-id\], \[data-item-id\] \*, \[data-sketch\] \{ --tw-ring-shadow: 0 0 #0000 !important; --tw-ring-offset-shadow: 0 0 #0000 !important; \}/);
  assert.match(UNSELECTED, /\[data-group-box\] \{ border-color: var\(--color-line-strong\) !important; background-color: transparent !important; \}/);
  // Light whatever the owner's theme: a frame with the page's stylesheets and the page's classes minus .dark (api.js).
  const draw = read('./card-thumbnail.js');
  assert.match(read('./api.js'), /document\.documentElement\.classList\.toggle\('dark', dark\)/);
  assert.ok(draw.includes("doc.documentElement.className = document.documentElement.className.replace(/\\bdark\\b/g, '')"), 'the frame drops .dark');
  assert.match(draw, /for \(const el of copy\.querySelectorAll\(CHROME\)\) el\.remove\(\);\n {2}redactRepositoryCards\(copy\);\n {2}const frame = await lightFrame\(\);/, 'stripped and redacted before the copy is attached, so a copied iframe never loads');
  assert.doesNotMatch(read('./AdaptiveCanvas.jsx'), /drawThumbnail\([^)]*backgroundColor/, 'never the page\'s own (dark) background');
});

// repo-graph Release 2: the picture is drawn from the owner's view and shown to anyone a published canvas reaches, so a
// repository card keeps its box and shows only "Repository content": no title, path, code or node label.
test('a repository code or graph card shows only Repository content in the picture', () => {
  assert.equal(REPOSITORY_CARDS, '[data-code-card], [data-graph-card]');
  const card = () => ({ children: ['model.py', 'class GPT(nn.Module):'], ownerDocument: { createTextNode: text => text }, replaceChildren(...kids) { this.children = kids; } });
  const code = card(), graph = card();
  const root = { querySelectorAll: selector => (selector === REPOSITORY_CARDS ? [code, graph] : []) };
  assert.equal(redactRepositoryCards(root), root);
  assert.deepEqual([code.children, graph.children], [['Repository content'], ['Repository content']]);
  assert.match(read('./CodeCard.jsx'), /data-code-card[\s>]/, 'the code card root carries the attribute');
  assert.match(read('./GraphCard.jsx'), /data-graph-card[\s>]/, 'the graph card root carries the attribute');
});

// 2026-10-21: html-to-image decoded each copied <canvas> itself, with no catch on img.decode(); a rejected decode of a paper
// card's PDF page was an unhandled page error (slash-cleanup-check) and a capture that never settled. Each readable canvas
// now reaches it as an <img> with a data URL, which it only clones.
test('canvasPictures: a readable canvas becomes a picture of its laid-out size; an empty or unreadable one stays a canvas', () => {
  const copied = attrs => ({ attributes: attrs, replaced: null, replaceWith(node) { this.replaced = node; } });
  const pdf = copied([{ name: 'class', value: 'block w-full' }, { name: 'width', value: '918' }, { name: 'height', value: '1188' }]);
  const empty = copied([]), tainted = copied([]);
  const live = [
    { toDataURL: () => 'data:image/png;base64,iVBORw0KGgo', offsetWidth: 612, offsetHeight: 792 },
    { toDataURL: () => 'data:,', offsetWidth: 0, offsetHeight: 0 },
    { toDataURL: () => { throw Error('SecurityError: the canvas has been tainted'); }, offsetWidth: 40, offsetHeight: 40 },
  ];
  const doc = { createElement: tag => ({ tag, attrs: {}, style: {}, setAttribute(name, value) { this.attrs[name] = value; } }) };
  canvasPictures({ querySelectorAll: () => [pdf, empty, tainted] }, { querySelectorAll: () => live }, doc);
  assert.equal(pdf.replaced.tag, 'img');
  assert.equal(pdf.replaced.src, 'data:image/png;base64,iVBORw0KGgo', 'a data URL, which html-to-image never decodes itself');
  assert.deepEqual(pdf.replaced.attrs, { class: 'block w-full', width: '918', height: '1188' });
  assert.deepEqual(pdf.replaced.style, { width: '612px', height: '792px', maxWidth: 'none' }, 'the size the canvas was drawn at, not its pixels');
  assert.equal(empty.replaced, null, 'an empty canvas stays as it is');
  assert.equal(tainted.replaced, null, 'a canvas whose pixels cannot be read stays blank');
  assert.match(read('./card-thumbnail.js'), /const copy = node\.cloneNode\(true\);\n\s+canvasPictures\(copy, node\);/, 'drawThumbnail uses it before html-to-image');
});
