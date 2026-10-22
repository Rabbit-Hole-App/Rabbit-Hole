import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWindow, searchKeyIndex, searchEmptyMessage, searchLocation, searchRowHeight, markRuns, lineRuns, ROW, searchFilterGroups, searchFilterLabel } from './canvas-search-panel.js';
import { createRequire } from 'node:module';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'canvas-search-panel-')), outfile = join(dir, 'panel.cjs');
await esbuild.build({ stdin: { contents: "export { default as Panel, SearchFilterRows } from './CanvasSearchPanel.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
const B = createRequire(import.meta.url)(outfile);
unlinkSync(outfile); rmdirSync(dir);
const render = props => B.renderToStaticMarkup(B.createElement(B.Panel, { canvasKey: 'canvas-a', ...props }));

// UI-12 (owner brief 2026-10-21 message 21 item 1): compact one-column rows, each as tall as its own layout.
test('a large list renders only viewport and overscan, preserving full scroll extent', () => {
  const heights = Array.from({ length: 10000 }, (_, i) => (i % 3 ? ROW.base : ROW.base + ROW.actions));
  const view = searchWindow({ heights, height: 600, scrollTop: 10000 });
  assert.ok(view.end - view.start < 20);
  assert.ok(view.start > 0);
  assert.equal(view.totalHeight, heights.reduce((sum, h) => sum + h, 0));
  assert.ok(view.offsets[view.start] <= 10000 && view.offsets[view.end - 1] + heights[view.end - 1] >= 10600);
});
test('stale scroll clamps after filtering', () => {
  const view = searchWindow({ heights: [ROW.base], height: 600, scrollTop: 10000 });
  assert.equal(view.start, 0); assert.equal(view.end, 1); assert.equal(view.scrollTop, 0);
});
test('keyboard steps through the list and clamps at both ends', () => {
  assert.equal(searchKeyIndex('ArrowDown', 0, 5), 1);
  assert.equal(searchKeyIndex('ArrowDown', 4, 5), 4);
  assert.equal(searchKeyIndex('ArrowUp', 0, 5), 0);
  assert.equal(searchKeyIndex('End', 0, 5), 4);
  assert.equal(searchKeyIndex('Home', 4, 5), 0);
  assert.equal(searchKeyIndex('ArrowDown', 0, 0), -1);
  assert.equal(searchKeyIndex('Enter', 0, 5), null);
});
test('empty states never mislabel loading or failed retrieval as no results', () => {
  assert.match(searchEmptyMessage('loading', 'term', ['video']), /Loading/);
  assert.match(searchEmptyMessage('error', 'term', ['video']), /could not/);
  assert.match(searchEmptyMessage('partial', 'term', ['video']), /available content/);
  assert.match(searchEmptyMessage('ready', '', ['rabbit-holes']), /Rabbit Holes/);
  assert.equal(searchEmptyMessage('ready', '', ['links']), 'No links to or from this canvas yet.');
  assert.equal(searchEmptyMessage('ready', '', ['pdf', 'video']), 'Nothing on this canvas matches these filters yet.');
  assert.equal(searchEmptyMessage('ready', '', []), 'No searchable objects on this canvas yet.');
  assert.equal(searchEmptyMessage('ready', 'term', []), 'No matches on this canvas.');
});
test('document and file locations are disclosed without inventing canvas placement', () => {
  assert.equal(searchLocation({ blockId: 'bn-1' }), 'Document');
  assert.equal(searchLocation({ page: 3 }), 'Page 3');
  assert.equal(searchLocation({ sheet: 'Budget', cells: 'A1:B2' }), 'Budget · A1:B2');
});

test('render bounds a large result set and preserves original target identity', () => {
  const html = render({ results: Array.from({ length: 10000 }, (_, index) => ({ id: `card:${index}`, objectId: `object-${index}`, title: `Object ${index}`, kind: 'card' })) });
  assert.ok((html.match(/data-search-result=/g) || []).length < 20);
  assert.match(html, /data-search-result="card:0"/);
  assert.match(html, /data-find-match="object-0"/);
  assert.match(html, /aria-setsize="10000"/);
  assert.equal((html.match(/data-search-filter-button/g) || []).length, 1, 'one Filter button, no chip row');
  assert.match(html, />Filter</); assert.match(render({ filters: ['video', 'pdf'] }), />Filter \(2\)</);
});
// The Filter dropdown (owner 2026-10-22): grouped checkbox rows with counts; content types and sources only where they have
// results (or are picked), Other always; Links only where the page shows links; References and Links explain themselves.
test('the Filter dropdown lists grouped checkbox rows with counts, a Clear row and the References and Links tooltips', () => {
  const counts = { all: 4, video: 2, youtube: 1, text: 1 };
  const groups = searchFilterGroups(counts, ['pdf'], false);
  assert.deepEqual(groups.map(group => [group.title, group.items.map(item => `${item.label} ${item.count}${item.checked ? ' checked' : ''}`)]), [
    ['Content types', ['Video 2', 'PDF 0 checked']], ['Sources', ['YouTube 1']], ['Other', ['Text 1', 'Comments 0', 'References 0', 'Rabbit Holes 0']]]);
  assert.ok(searchFilterGroups(counts, [], true).at(-1).items.some(item => item.id === 'links'), 'a page with links lists Links');
  assert.equal(searchFilterLabel([]), 'Filter'); assert.equal(searchFilterLabel(['a', 'b']), 'Filter (2)');
  const rows = picked => B.renderToStaticMarkup(B.createElement(B.SearchFilterRows, { groups: searchFilterGroups(counts, picked, true), filters: picked }));
  const html = rows(['video']);
  assert.match(html, /role="menu" aria-label="Search filters"/);
  assert.match(html, /role="menuitemcheckbox" aria-checked="true" data-search-filter="video"/);
  assert.match(html, /role="menuitemcheckbox" aria-checked="false" data-search-filter="youtube"/);
  assert.match(html, /data-search-filter="references" title="Cards on this canvas that cite a source" aria-describedby="search-filter-hint-references"/);
  assert.match(html, /id="search-filter-hint-references" hidden="">Cards on this canvas that cite a source</);
  assert.match(html, /data-search-filter="links" title="Other canvases this one links to or from" aria-describedby="search-filter-hint-links"/);
  assert.match(html, /id="search-filter-hint-links" hidden="">Other canvases this one links to or from</);
  assert.doesNotMatch(html, /data-search-filter-clear[^>]*disabled/, 'Clear is live with a pick');
  assert.match(rows([]), /data-search-filter-clear="true" disabled=""/, 'Clear is greyed out with nothing picked');
  assert.doesNotMatch(html, /\.\.\.|…/);
});
// Owner UI brief 2026-10-20 section 7: the former Links tab's results - a canvas title, its direction and count, its cards.
test('link results name their canvas and cards, open in a new tab, and an unavailable target exposes nothing', () => {
  const html = render({ showLinks: true, filters: ['links'], results: [
    { id: 'link:from:t', kind: 'link', title: 'Graph basics', location: 'Linked from this canvas', link: { direction: 'from', href: '/apps/canvas-1', cards: [{ id: 'r1', object: 'a1', title: 'Recursion' }] } },
    { id: 'link:to:s', kind: 'link', title: 'Trees', location: 'Links here (backlink)', link: { direction: 'to', href: '/apps/canvas-2', cards: [{ id: 'r2', object: 'b1', title: 'Depth', href: '/apps/canvas-2?card=b1' }] } },
    { id: 'link:from:x', kind: 'link', title: 'Unavailable canvas', location: 'Linked from this canvas', link: { direction: 'from', unavailable: true, href: null, cards: [{ id: 'r3', object: 'a2', title: 'Origin' }] } }] });
  assert.match(html, /Graph basics/); assert.match(html, /Linked from this canvas · 1 reference/);
  assert.match(html, /data-links-origin="a1"/); assert.match(html, /href="\/apps\/canvas-2\?card=b1" data-links-backlink="b1"/);
  assert.match(html, /aria-label="Open Graph basics in new tab"/); assert.match(html, /aria-label="Open Depth in new tab"/);
  assert.doesNotMatch(html, /aria-label="Open Unavailable canvas in new tab"/);
  assert.match(html, /data-search-result="link:from:x" data-links-direction="from" data-unavailable="true"/);
});
test('unavailable source metadata is never displayed; explicit source and child actions are separate', () => {
  const html = render({ results: [{ id: 'card:a', objectId: 'a', title: 'Card', kind: 'card', references: [{ id: 'private', unavailable: true }, { id: 'paper', title: 'Known paper', kind: 'paper' }], rabbitHoles: [{ name: 'child-a', title: 'Existing child' }] }] });
  assert.match(html, /Source unavailable/);
  assert.match(html, /Open Known paper/);
  assert.match(html, /Open Rabbit Hole/);
  assert.equal((html.match(/<button/g) || []).length, (html.match(/<\/button>/g) || []).length);
  assert.doesNotMatch(html, /<iframe|<video|<canvas/);
});
test('loading has no false empty result claim; errors expose retry and zero arrows are disabled', () => {
  const loading = render({ status: { state: 'loading' } });
  assert.doesNotMatch(loading, /No matches|No searchable/);
  assert.match(loading, /aria-label="Next match" disabled/);
  assert.match(render({ status: { state: 'error' }, onRetry() {} }), />Retry<\/button>/);
  assert.match(render({ status: { state: 'partial' }, onRetry() {} }), />Retry<\/button>/);
  assert.match(loading, />0 results</);
});

// UI-12: no large empty tile. A row is as tall as what it shows - a picture or text row, a code row by its excerpt lines, the
// availability line and the action row only when present - and the rendered layout fits that height.
test('row heights follow the compact layout', () => {
  assert.equal(searchRowHeight({ id: 'a', kind: 'card' }), ROW.base);
  assert.equal(searchRowHeight({ id: 'a', preview: { kind: 'picture' } }), ROW.base);
  assert.equal(searchRowHeight({ id: 'a', preview: { kind: 'code', lines: [{ n: 1, text: 'x' }, { n: 2, text: 'y' }, { n: 3, text: 'z' }] } }), ROW.base - ROW.snippet + ROW.code + 3 * ROW.line);
  assert.equal(searchRowHeight({ id: 'a', preview: { kind: 'code', lines: [] } }), ROW.base, 'code with no loaded text falls back to the text row');
  assert.equal(searchRowHeight({ id: 'a', references: [{ id: 'r' }], availability: { status: 'partial', message: 'Only the file name' } }), ROW.base + ROW.notice + ROW.actions);
  assert.equal(searchRowHeight({ id: 'l', kind: 'link', link: { cards: [] } }), ROW.base + ROW.actions);
});
test('code marks keep their colour runs and mark every occurrence', () => {
  const runs = [{ t: 'opt', color: '#111', dark: '#eee' }, { t: 'imizer.step()' }];
  const pieces = markRuns(runs, 'MIZER');
  assert.equal(pieces.map(piece => piece.t).join(''), 'optimizer.step()');
  assert.deepEqual(pieces.filter(piece => piece.hit).map(piece => piece.t), ['mizer']);
  assert.equal(pieces[0].color, '#111');
  assert.deepEqual(markRuns([{ t: 'a.b a.b' }], 'a.b').filter(piece => piece.hit).length, 2);
  assert.deepEqual(markRuns([{ t: 'plain' }], ''), [{ t: 'plain', hit: false }]);
  assert.deepEqual(lineRuns([{ t: 'a' }, { t: '\n' }, { t: 'b' }]), [[{ t: 'a' }], [{ t: 'b' }]]);
});
test('rows render compact previews: a picture slot with an informative fallback, a numbered code excerpt, a plain text row', () => {
  const html = render({ results: [
    { id: 'object:img', objectId: 'img', title: 'Diagram', kind: 'card', preview: { kind: 'picture', label: 'Image' }, snippet: { hit: 'Diagram' } },
    { id: 'object:code', objectId: 'code', title: 'train.py', kind: 'card', categories: ['cards', 'code'], preview: { kind: 'code', language: 'python', path: 'src/train.py', lines: [{ n: 41, text: 'loss.backward()' }, { n: 42, text: 'optimizer.step()' }] }, snippet: { before: 'loss.backward()\n', hit: 'optimizer', after: '.step()' } },
    { id: 'object:text', objectId: 'text', title: 'Notes', kind: 'card', preview: { kind: 'text' }, snippet: { before: 'a ', hit: 'needle', after: ' b' } }] });
  assert.match(html, /data-search-result="object:img" data-search-layout="picture"/);
  assert.match(html, /data-search-preview="fallback"[^>]*>.*Image/);
  assert.match(html, /data-search-result="object:code" data-search-layout="code"/);
  assert.match(html, /<pre data-search-code="true" data-code-colors="true"/);
  assert.match(html, /data-search-code-line="41"/);
  assert.match(html, /src\/train\.py · Lines 41–42/);
  assert.match(html, /<mark class="rounded-sm bg-\[#ddd6fe\] text-\[#37352f\]">optimizer<\/mark>/);
  assert.match(html, /data-search-result="object:text" data-search-layout="text"/);
  assert.equal((html.match(/data-search-preview=/g) || []).length, 1, 'only the picture row has a thumbnail slot');
  assert.doesNotMatch(html, /aspect-square|<img|<iframe|<video|<canvas/);
});
// UI-13 (owner brief 2026-10-21 message 21 item 2): cards and available linked canvases drag onto the canvas; a linked canvas
// also has the standard Add to canvas (inverse) button where this viewer may insert, the keyboard and touch way.
test('placeable results are draggable and a linked canvas offers Add to canvas only where insertion is allowed', () => {
  const results = [
    { id: 'object:a', objectId: 'a', title: 'Card', kind: 'card' },
    { id: 'comment:c', objectId: 'a', title: 'Comment', kind: 'comment' },
    { id: 'link:from:t', kind: 'link', title: 'Graphs', target: { kind: 'link', id: 't' }, link: { direction: 'from', href: '/apps/g', cards: [] } },
    { id: 'link:from:x', kind: 'link', title: 'Unavailable canvas', target: { kind: 'link', id: 'x' }, link: { direction: 'from', unavailable: true, href: null, cards: [] } }];
  const html = render({ showLinks: true, results, onAddToCanvas() {} });
  assert.match(html, /data-find-match="a" data-search-index="0" draggable="true" data-search-drag="object"/);
  assert.match(html, /data-search-index="1" draggable="false"/);
  assert.match(html, /data-search-index="2" draggable="true" data-search-drag="link"/);
  assert.match(html, /data-search-index="3" draggable="false"/);
  assert.equal((html.match(/data-search-add/g) || []).length, 1, 'only the available link');
  assert.match(html, /class="[^"]*bg-ink text-surface[^"]*"[^>]*data-search-add|data-search-add[^>]*class="[^"]*bg-ink text-surface/);
  assert.match(html, />Add to canvas<\/button>/);
  assert.doesNotMatch(render({ showLinks: true, results }), /data-search-add/, 'a view-only page has no Add to canvas');
});
