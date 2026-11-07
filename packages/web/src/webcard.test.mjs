// The webpage card (WebpageCard.jsx, webcard.js; C:/s/spec/day-1021/webcard-brief.md and webcard-interface.md): text-layer
// alignment, highlight versioning, scroll lock, Refresh that keeps the approved capture, Ask that only fills the composer, and no AI
// call from scroll, lock, select, highlight, Copy or Ask. WebpageCard.jsx is bundled with esbuild and rendered with react-dom/server
// (as answer-footer.test.mjs does); clicks need a browser (lane D's e2e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { applyResult, askText, captureViewport, cardScale, cardState, clampScroll, highlightBody, highlightSource, highlightView, keyScroll, magnifyAt, runStyle, runsByTile, startPending, wheelScroll, CONTENT_ZOOM } from './webcard.js';
import { textAnchor, toViewport } from './pdf-anchor.js';
import { selectionRef } from './selection-ref.js';
import { highlightAnchor } from '../../control-plane/src/pdf-excerpts.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const capture = { lineage: 'wc_0123456789abcdef01234567', manifestId: 'fs_aaaaaaaaaaaaaaaaaaaaaaaa', sha256: 'a'.repeat(64), capturedAt: 1, finalUrl: 'https://example.com/a', width: 1280, height: 3000, truncated: { height: false, bytes: false, text: false } };
const fileRef = { source: { id: capture.manifestId, rev: capture.sha256 }, bundle: [{ role: 'tile', index: 0, source: { id: 'fs_t0', rev: 'r' } }] };
const card = (over = {}) => ({ id: 'b1', type: 'webpage', url: 'https://example.com/a', title: 'Example Domain', capture, fileRef, pending: null, failure: null, scrollTop: 0, scrollLocked: false, ...over });

test('text layer alignment: a run lands at its capture box, stretched to its width, whatever the card scale', () => {
  const run = { text: 'Hello world', x: 40, y: 1500, w: 220, h: 20 };
  // measure: natural width at a font height (here 10 px per character per 20 px of height).
  const style = runStyle(run, (text, height) => text.length * height / 2);
  assert.deepEqual(style, { left: 40, top: 1500, fontHeight: 20, scaleX: 220 / 110 });
  // CSS multiplies every capture pixel by the card scale (index.css .textLayer --total-scale-factor), so the run's box on screen
  // is its capture box times the scale - the same factor the tiles are drawn at.
  for (const width of [640, 400, 1280]) {
    const s = cardScale(width, 1280);
    assert.equal(style.left * s, run.x * width / 1280);
    assert.equal(style.fontHeight * s * style.scaleX * (110 / 20), run.w * s, 'drawn width = run width at this scale');
  }
  assert.equal(runStyle({ ...run, text: '' }, () => 0).scaleX, 1);
  // A highlight's rects are capture pixels: the identity viewport turns them into fractions of the page column.
  const [box] = toViewport({ rects: [[40, 1500, 260, 1520]] }, captureViewport({ width: 1280, height: 3000 }));
  assert.deepEqual(box, { left: 40 / 1280, top: 0.5, width: 220 / 1280, height: 20 / 3000 });
});

test('a selection over the scrolled, zoomed card anchors in capture pixels (textAnchor with the capture viewport)', () => {
  // The column is drawn at scale 0.5, scrolled 1000 capture px (translateY -500) and zoomed 2x by the canvas: its client box
  // starts at y = (100 - 500) * 2 and is 1280 * 0.5 * 2 wide. A run at capture y 1500 shows at client y 100 + (1500 - 1000) * 0.5 * 2.
  const z = 2, s = 0.5, left = 30, top = (100 - 1000 * s) * z;
  const column = { getBoundingClientRect: () => ({ left, top, width: 1280 * s * z, height: 3000 * s * z }) };
  const text = { nodeType: 3, data: 'Hello world' };
  const clientRect = { left: left + 40 * s * z, top: top + 1500 * s * z, right: left + 260 * s * z, bottom: top + 1520 * s * z, width: 220 * s * z, height: 20 * s * z };
  const layer = {
    contains: node => node === text,
    textContent: 'Before\nHello world\nAfter',
    ownerDocument: {
      createTreeWalker: () => { let done = false; return { nextNode: () => (done ? null : (done = true, text)) }; },
      createRange: () => ({ setStart() {}, setEnd() {}, getClientRects: () => [clientRect], toString: () => 'Before\n' }),
    },
  };
  const range = { collapsed: false, startContainer: text, endContainer: text, startOffset: 0, endOffset: 11, intersectsNode: node => node === text, toString: () => 'Hello world' };
  globalThis.NodeFilter ||= { SHOW_TEXT: 4 };
  const found = textAnchor(range, layer, captureViewport({ width: 1280, height: 3000 }), column);
  assert.equal(found.exact, 'Hello world');
  found.rects[0].forEach((value, i) => assert.ok(Math.abs(value - [40, 1500, 260, 1520][i]) < 1e-9, `rect ${found.rects[0]}`));
  assert.deepEqual(found.quote, { exact: 'Hello world', prefix: 'Before\n', suffix: '\nAfter' });
});

test('runs belong to the tile the capture names, else the one their middle falls in', () => {
  const tiles = [{ index: 0, y: 0, h: 1400 }, { index: 1, y: 1400, h: 1400 }, { index: 2, y: 2320, h: 680 }];
  const runs = [{ text: 'a', x: 0, y: 10, w: 5, h: 10, tile: 0 }, { text: 'b', x: 0, y: 1395, w: 5, h: 20, tile: 0 }, { text: 'c', x: 0, y: 2900, w: 5, h: 10 }];
  assert.deepEqual(runsByTile(runs, tiles).map(list => list.map(run => run.text)), [['a', 'b'], [], ['c']]);
});

test('the wheel scrolls the page inside its bounds, sideways only once the content is zoomed in', () => {
  const at = { top: 100, deltaY: 120, zoom: 2, scale: 0.5, pageWidth: 1280, pageHeight: 3000, viewHeight: 1200 };
  assert.deepEqual(wheelScroll(at), { top: 100 + 120 / 2 / 0.5, left: 0 });
  assert.equal(wheelScroll({ ...at, deltaY: -9999 }).top, 0, 'held at the top');
  assert.equal(wheelScroll({ ...at, deltaY: 99999 }).top, 1800, 'held at the bottom');
  assert.equal(wheelScroll({ ...at, deltaX: 500 }).left, 0, 'the whole width shows: no sideways scroll');
  assert.deepEqual(wheelScroll({ ...at, deltaX: 100, viewWidth: 640 }), { top: 220, left: 100 }, 'zoomed in: the wheel also scrolls sideways');
  assert.equal(wheelScroll({ ...at, deltaX: 99999, viewWidth: 640 }).left, 640, 'held at the right edge');
  assert.equal(clampScroll(NaN, 3000, 1200), 0);
  assert.equal(clampScroll(50, 400, 1200), 0, 'a page shorter than the card does not scroll');
  assert.equal(keyScroll('End', 0, 1200, 3000), 1800);
  assert.equal(keyScroll('Home', 900, 1200, 3000), 0);
  assert.equal(keyScroll('a', 0, 1200, 3000), null);
});

test('states: capturing, stopped after a reload, screening, hidden with Retry, refusals with Remove, truncated', () => {
  const first = startPending(card({ capture: undefined, fileRef: undefined }), 5);
  assert.equal(cardState(first, { asked: true }).notice.text, 'Capturing the page');
  assert.equal(cardState(first, { asked: true }).waiting, true);
  // A reload loses the request: the card says so and offers Retry, it never captures again by itself.
  assert.deepEqual(pick(cardState(first).notice), { status: 'stopped', retry: true, remove: false });
  const screening = applyResult(first, { status: 'screening', manifestId: 'fs_1', lineage: 'wc_1' });
  assert.equal(cardState(screening).notice.text, 'Checking the page');
  const hidden = applyResult(screening, { status: 'inconclusive', reason: 'The check timed out.', manifestId: 'fs_1' });
  assert.deepEqual(pick(cardState(hidden).notice), { status: 'inconclusive', retry: true, remove: false });
  assert.equal(cardState(applyResult(first, { status: 'error', reason: 'Save this board first.' })).notice.text, 'The capture failed');
  for (const [status, text] of [['blocked', 'Hidden'], ['login_required', 'Login required'], ['unavailable', 'Unavailable']]) {
    const state = cardState(applyResult(first, { status, reason: 'why' }));
    assert.deepEqual({ text: state.notice.text, remove: state.notice.remove, shown: state.shown }, { text, remove: true, shown: null });
  }
  assert.equal(cardState(card()).truncated, false);
  assert.equal(cardState(card({ capture: { ...capture, truncated: { height: true } } })).truncated, true);
  // No UI copy carries an ellipsis.
  assert.doesNotMatch(read('webcard.js') + read('WebpageCard.jsx'), /…|\.\.\.'|\.\.\.</);
});
const pick = notice => ({ status: notice.status, retry: !!notice.retry, remove: !!notice.remove });

test('Refresh: a failed or unscreened attempt leaves the approved capture, its fileRef and scroll on show; only ready replaces them', () => {
  const shown = card({ scrollTop: 800 });
  const refreshing = startPending(shown, 9);
  assert.equal(refreshing.pending.lineage, capture.lineage, 'a Refresh keeps the highlight namespace');
  for (const result of [{ status: 'screening', manifestId: 'fs_2' }, { status: 'inconclusive', manifestId: 'fs_2' }, { status: 'error' }, { status: 'blocked', reason: 'Explicit content' }, { status: 'unavailable' }]) {
    const next = applyResult(refreshing, result);
    assert.equal(next.capture, capture); assert.equal(next.fileRef, fileRef); assert.equal(next.scrollTop, 800);
    const state = cardState(next);
    assert.equal(state.shown, capture);
    assert.equal(state.notice.refresh, true);
    assert.equal(state.notice.remove, false, 'a failed Refresh never offers to remove the card');
  }
  const fresh = { ...capture, manifestId: 'fs_bbbbbbbbbbbbbbbbbbbbbbbb', sha256: 'b'.repeat(64) }, freshRef = { source: { id: fresh.manifestId, rev: fresh.sha256 }, bundle: [] };
  const done = applyResult(refreshing, { status: 'ready', title: 'New title', capture: fresh, fileRef: freshRef });
  assert.deepEqual([done.capture, done.fileRef, done.pending, done.failure, done.scrollTop, done.title], [fresh, freshRef, null, null, 0, 'New title']);
  assert.equal(cardState(done).notice, null);
});

test('highlights: shown only on their own capture version, earlier versions counted and never re-attached', () => {
  const answer = { sha256: capture.sha256, highlights: [{ id: 'pdfh_1' }], changed: 2 };
  assert.deepEqual(highlightView(answer, capture.sha256), { current: [{ id: 'pdfh_1' }], earlier: 2 });
  // The route answered for another version than the one on show: nothing is drawn on this text.
  assert.deepEqual(highlightView(answer, 'b'.repeat(64)), { current: [], earlier: 3 });
  assert.deepEqual(highlightView(null, capture.sha256), { current: [], earlier: 0 });
  const source = highlightSource('demo', capture);
  assert.deepEqual(source, { app: 'demo', key: `web:${capture.lineage}`, manifest: capture.manifestId });
  assert.equal(highlightSource('demo', null), null);
  // The PUT body is one the existing highlights route accepts as it stands (page 1, no rotation, capture-pixel rects).
  const body = highlightBody(source, capture, { rects: [[40, 1500, 260, 1520]], quote: { exact: 'Hello world', prefix: 'Before\n', suffix: '\nAfter' } });
  assert.equal(body.sha256, capture.sha256);
  assert.deepEqual(highlightAnchor(body), { kind: 'text', page: { index: 1, label: null }, rects: [[40, 1500, 260, 1520]], rotate: 0, view: [0, 0, 1280, 3000], quote: body.quote });
});

test('Ask about selection: one card ref with the passage, title, URL and capture; it opens Chat and sends nothing', () => {
  const block = card(), exact = 'Hello world';
  const text = askText(block, exact);
  assert.equal(text, `Selected text from the webpage "Example Domain" (https://example.com/a), capture ${capture.manifestId} version ${'a'.repeat(12)}:\nHello world`);
  const ref = selectionRef({ ids: [block.id], kind: 'card', name: block.title, content: text, quote: exact, text: () => text });
  assert.deepEqual({ sourceId: ref.sourceId, kind: ref.kind, range: ref.range, name: ref.name, text: ref.text }, { sourceId: 'card:b1', kind: 'card', range: { quote: exact }, name: 'Example Domain', text });
  // The card hands the ref to the workspace's addToChat (chat-workspace.jsx: opens Chat in Ask, attaches, focuses; never sends).
  const src = read('WebpageCard.jsx');
  assert.match(src, /chat\.addToChat\(selectionRef\(\{ ids: \[block\.id\], kind: 'card'/);
  assert.doesNotMatch(src, /\.send\(|registerSender|\.ask\(|regenerate/);
  const workspace = read('chat-workspace.jsx').match(/const addToChat = useCallback\(\(ref, options\) => \{([^}]*)\}/)[1];
  assert.match(workspace, /panels\.openChat\(\); thread\.setMode\('ask'\); context\.attach\(ref\); composer\.focus\(\);/);
  assert.doesNotMatch(workspace, /send|ask\(/);
});

test('zero AI calls: scroll, lock, select, highlight, Copy and Ask reach only the highlights route; the card has no other network path', async () => {
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async (url, init = {}) => { calls.push(`${init.method || 'GET'} ${String(url).split('?')[0]}`); return new Response(JSON.stringify({ highlight: { id: 'pdfh_x' }, sha256: capture.sha256, highlights: [], changed: 0 }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const { listHighlights, putHighlight, newId } = await import('./pdf-highlights.js');
    // Scroll and lock are pure (no request); a highlight is one PUT; reload lists them; Ask and Copy make no request.
    wheelScroll({ top: 0, deltaY: 100, pageHeight: 3000, viewHeight: 600 });
    magnifyAt({ magnify: 1, factor: 2, at: [10, 10], top: 0, left: 0, scale: 0.5, page: { width: 1280, height: 3000 }, view: [640, 400] });
    keyScroll('PageDown', 0, 600, 3000);
    const source = highlightSource('demo', capture);
    await putHighlight(newId('pdfh'), highlightBody(source, capture, { rects: [[0, 0, 10, 10]], quote: { exact: 'x', prefix: '', suffix: '' } }));
    await listHighlights(source);
    selectionRef({ ids: ['b1'], kind: 'card', name: 'n', content: 't', quote: 'x', text: () => 't' });
  } finally { globalThis.fetch = saved; }
  assert.deepEqual(calls.map(call => call.replace(/pdfh_[0-9a-f]+/, 'pdfh_ID')), ['PUT /api/learn/pdf-highlights/pdfh_ID', 'GET /api/learn/pdf-highlights']);
  // The card itself calls no fetch and names no route: its requests are the capture module's (capture, Retry, status poll and the
  // capture's files) and the highlights client's - none of them a model route.
  const card = read('WebpageCard.jsx');
  assert.doesNotMatch(card, /fetch\(|\/api\//);
  const imports = [...card.matchAll(/from '\.\/([^']+)'/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['chat-workspace.jsx', 'content-gestures.js', 'file-source-client.js', 'pdf-anchor.js', 'pdf-highlights.js', 'selection-ref.js', 'selection-toolbar.jsx', 'ui.jsx', 'webcard-api.js', 'webcard.js']);
  const routes = [...read('webcard-api.js').matchAll(/`(\/api\/[^`$?]+)/g)].map(match => match[1]);
  assert.deepEqual(routes, ['/api/learn/webpages/', '/api/learn/webpages/', '/api/learn/files/']);
  assert.match(read('webcard-api.js'), /result\('\/api\/learn\/webpages', \{ method: 'POST'/);
});

// ---- rendered (static markup: no effects run, so no request is made)
const dir = mkdtempSync(join(tmpdir(), 'webcard-')), outfile = join(dir, 'card.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as WebpageCard } from './WebpageCard.jsx'; export { setFileScope } from './file-source-client.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const render = (block, props = {}) => B.renderToStaticMarkup(B.createElement(B.WebpageCard, { block, appName: 'demo', onChange: () => {}, onChangeQuiet: () => {}, onRemove: () => {}, ...props }));

test('rendered: title, a source link that opens a new tab without opener or referrer, one lock, Refresh for the owner', () => {
  B.setFileScope({ app: 'demo', board: 'main' });
  const html = render(card());
  assert.match(html, /<h3[^>]*>Example Domain<\/h3>/);
  for (const link of html.match(/<a [^>]*>/g)) { assert.match(link, /href="https:\/\/example\.com\/a"/); assert.match(link, /target="_blank"/); assert.match(link, /rel="noopener noreferrer"/); }
  assert.equal(html.match(/data-webcard-lock/g).length, 1);
  assert.match(html, /aria-label="Lock scrolling" aria-pressed="false"/);
  assert.match(render(card({ scrollLocked: true })), /aria-label="Unlock scrolling" aria-pressed="true"/);
  // block.locked is the canvas's card lock (Arrange > Lock, read-only card), a different thing: it never locks scrolling
  // (fast-e2e 39745217786: sharing the field made the scroll lock disable itself and hide Refresh).
  assert.match(render(card({ locked: true })), /aria-label="Lock scrolling" aria-pressed="false"/);
  // Unlocked, the frame is a scroll area (the canvas leaves its wheel alone); locked, it is not.
  assert.match(html, /data-webcard-frame="true" data-scroll=""/);
  assert.doesNotMatch(render(card({ scrollLocked: true })), /data-webcard-frame="true" data-scroll/);
  // The page scrolls by a transform of the tile column, never an inner scroller (html-to-image keeps transforms).
  assert.match(html, /data-webcard-column="true" class="relative" style="width:[^"]*;height:[^"]*;transform:translateX\([^)]*\) translateY\(/);
  assert.match(html, /aria-label="Refresh"/);
  // While a Refresh is checked, Refresh keeps its name, greyed, with no explanation.
  const busy = render(card({ pending: { manifestId: 'fs_2', lineage: capture.lineage, status: 'screening', reason: null, startedAt: 1 } }));
  assert.match(busy, /<button[^>]*aria-label="Refresh" title="Refresh" disabled=""/);
  assert.match(busy, /Checking the page/);
  assert.match(busy, /data-webcard-frame/, 'the approved capture stays on show while the Refresh runs');
  B.setFileScope({ share: 'tok' });
  assert.doesNotMatch(render(card()), /aria-label="Refresh"/, 'a share viewer never refreshes');
  B.setFileScope(null);
});

test('rendered: a refused first capture offers Remove; a hidden one Retry; a failed Refresh keeps the page with Retry', () => {
  B.setFileScope({ app: 'demo', board: 'main' });
  const none = { capture: undefined, fileRef: undefined };
  const blocked = render(card({ ...none, failure: { status: 'blocked', reason: 'Explicit content' } }));
  assert.match(blocked, /Hidden\. Explicit content/); assert.match(blocked, />Remove<\/button>/); assert.doesNotMatch(blocked, /data-webcard-frame/);
  assert.match(render(card({ ...none, failure: { status: 'login_required', reason: null } })), /Login required/);
  const hidden = render(card({ ...none, pending: { manifestId: 'fs_1', status: 'inconclusive', reason: null, startedAt: 1 } }));
  assert.match(hidden, /Hidden: the check could not finish/); assert.match(hidden, />Retry<\/button>/);
  const refresh = render(card({ pending: { manifestId: 'fs_2', status: 'error', reason: null, startedAt: 1 } }));
  assert.match(refresh, /Refresh: Hidden: the check could not finish/); assert.match(refresh, />Retry<\/button>/); assert.match(refresh, /data-webcard-frame/);
  assert.doesNotMatch(refresh, />Remove</);
  assert.match(render(card({ capture: { ...capture, truncated: { text: true } } })), /data-webcard-truncated[^>]*>Truncated</);
  B.setFileScope(null);
});

test('a capture file that 404s right after a version passed is retried (a stale board save can drop its index); other refusals are not', async () => {
  const { captureFile } = await import('./webcard-api.js');
  const replies = [404, 404, 200], seen = [];
  const fetchImpl = async url => { seen.push(url); const status = replies.shift(); return { ok: status === 200, status, json: async () => ({ v: 1 }) }; };
  assert.deepEqual(await captureFile('fs_1', { fetchImpl, wait: 0 }), { v: 1 });
  assert.equal(seen.length, 3);
  const refused = async status => { let n = 0; await assert.rejects(captureFile('fs_2', { fetchImpl: async () => { n += 1; return { ok: false, status }; }, wait: 0 }), /not available/); return n; };
  assert.equal(await refused(403), 1, 'a 403 is not retried');
  assert.equal(await refused(404), 5, 'a 404 is tried 5 times, then the card says so');
});

test('rendered loading: a spinner beside Capturing and Checking, a skeleton while no page shows; still under reduced motion; gone once it ends', () => {
  B.setFileScope({ app: 'demo', board: 'main' });
  const none = { capture: undefined, fileRef: undefined };
  const spinner = /<svg[^>]*class="[^"]*animate-spin[^"]*motion-reduce:animate-none"[^>]*data-webcard-spinner="true"/;
  // A first capture after a reload says it stopped (Retry), with no spinner; one this page asked for is capturing.
  const first = render(card({ ...none, pending: { manifestId: 'fs_1', status: 'screening', reason: null, startedAt: 1 } }));
  assert.match(first, spinner); assert.match(first, /Checking the page/);
  assert.match(first, /data-webcard-skeleton="true"/); assert.match(first, /motion-safe:animate-pulse/);
  assert.doesNotMatch(first, /…|\.\.\./, 'no ellipsis');
  // A Refresh keeps the page on show, with the small indicator above it.
  const refresh = render(card({ pending: { manifestId: null, status: 'capturing', reason: null, startedAt: 1 } }));
  const refreshing = render(card({ pending: { manifestId: 'fs_2', status: 'screening', reason: null, startedAt: 1 } }));
  for (const html of [refresh, refreshing]) { assert.match(html, /data-webcard-frame/); assert.doesNotMatch(html, /data-webcard-skeleton/); }
  assert.match(refreshing, spinner);
  // Stopped (the request was lost), failed, hidden, and the page itself: no spinner, no skeleton.
  for (const html of [refresh, render(card({ ...none, pending: { manifestId: null, status: 'capturing', reason: null, startedAt: 1 } })), render(card({ ...none, failure: { status: 'unavailable', reason: null } })), render(card({ ...none, pending: { manifestId: 'fs_1', status: 'inconclusive', reason: null, startedAt: 1 } })), render(card())]) {
    assert.doesNotMatch(html, /data-webcard-spinner|data-webcard-skeleton/);
  }
  B.setFileScope(null);
});

test('content zoom keeps the point under the cursor and holds at its limits', () => {
  const base = { at: [320, 200], top: 200, left: 0, scale: 0.5, page: { width: 1280, height: 3000 }, view: [640, 400] };
  const z = magnifyAt({ ...base, magnify: 1, factor: 2 });
  assert.equal(z.magnify, 2);
  assert.deepEqual([z.left + 320 / (0.5 * 2), z.top + 200 / (0.5 * 2)], [640, 600], 'the cursor still points at capture (640, 600)');
  assert.equal(magnifyAt({ ...base, magnify: 3, factor: 10 }).magnify, CONTENT_ZOOM.max);
  assert.deepEqual(magnifyAt({ ...base, magnify: 1, factor: 0.5 }), { magnify: 1, top: 200, left: 0 }, 'below the card width nothing changes');
});
