import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWindow, searchKeyIndex, searchEmptyMessage, searchLocation } from './canvas-search-panel.js';
import { createRequire } from 'node:module';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'canvas-search-panel-')), outfile = join(dir, 'panel.cjs');
await esbuild.build({ stdin: { contents: "export { default as Panel } from './CanvasSearchPanel.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' }, bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
const B = createRequire(import.meta.url)(outfile);
unlinkSync(outfile); rmdirSync(dir);
const render = props => B.renderToStaticMarkup(B.createElement(B.Panel, { canvasKey: 'canvas-a', ...props }));

test('large grid renders only viewport and overscan, preserving full scroll extent', () => {
  const view = searchWindow({ count: 10000, width: 420, height: 600, scrollTop: 10000, rows: false });
  assert.equal(view.columns, 2);
  assert.ok(view.end - view.start < 20);
  assert.ok(view.start > 0);
  assert.equal(view.totalHeight, Math.ceil(10000 / 2) * view.rowHeight);
  assert.ok(view.start * view.rowHeight / 2 <= 10000);
});
test('narrow panels and text lists remain one column; stale scroll clamps after filtering', () => {
  assert.equal(searchWindow({ count: 20, width: 280, height: 400 }).columns, 1);
  assert.equal(searchWindow({ count: 20, width: 700, height: 400, rows: true }).columns, 1);
  const view = searchWindow({ count: 1, width: 420, height: 600, scrollTop: 10000 });
  assert.equal(view.start, 0); assert.equal(view.end, 1); assert.equal(view.scrollTop, 0);
});
test('keyboard traverses visual grid and clamps without skipping final odd result', () => {
  assert.equal(searchKeyIndex('ArrowDown', 0, 5, 2), 2);
  assert.equal(searchKeyIndex('ArrowDown', 3, 5, 2), 4);
  assert.equal(searchKeyIndex('ArrowLeft', 0, 5, 2), 0);
  assert.equal(searchKeyIndex('End', 0, 5, 2), 4);
  assert.equal(searchKeyIndex('Home', 4, 5, 2), 0);
  assert.equal(searchKeyIndex('ArrowDown', 0, 0, 2), -1);
  assert.equal(searchKeyIndex('Enter', 0, 5, 2), null);
});
test('empty states never mislabel loading or failed retrieval as no results', () => {
  assert.match(searchEmptyMessage('loading', 'term', 'cards'), /Loading/);
  assert.match(searchEmptyMessage('error', 'term', 'cards'), /could not/);
  assert.match(searchEmptyMessage('partial', 'term', 'cards'), /available content/);
  assert.match(searchEmptyMessage('ready', '', 'rabbit-holes'), /Rabbit Holes/);
  assert.equal(searchEmptyMessage('ready', 'term', 'all'), 'No matches on this canvas.');
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
  assert.equal((html.match(/data-search-filter=/g) || []).length, 7);
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
