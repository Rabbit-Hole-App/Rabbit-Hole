import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchIndex, updateSearchIndex, querySearchIndex } from './canvas-search-index.js';
import { createSearchContentRegistry } from './canvas-search-content.js';
const index = (board, extra = {}) => updateSearchIndex(createSearchIndex(), { scopeKey: 'one', board, ...extra });
const query = (value, text = '', filter = 'all', extra = {}) => querySearchIndex(value, { query: text, filter, ...extra });

// Owner UI brief 2026-10-20 section 7: the former Links tab in Search - links and backlinks are results under Links, in All
// and its counts, matched by canvas and card titles; an unavailable target keeps no title and is never matched by one.
test('links and backlinks are Links results, counted in All, matched by canvas and card titles', () => {
  const links = { from: [{ target: 't', title: 'Graph basics', href: '/apps/canvas-1', unavailable: false, refs: [{ id: 'r1', object: 'a1', objectTitle: 'Recursion' }] }, { target: 'x', unavailable: true, refs: [{ id: 'r2', object: 'a1', objectTitle: 'Recursion' }] }],
    to: [{ source: 's', title: 'Trees', href: '/apps/canvas-2', refs: [{ id: 'r3', object: 'b1', objectTitle: '', href: '/apps/canvas-2?card=b1' }] }] };
  const value = index({ blocks: [{ id: 'a1', type: 'text', title: 'Recursion', text: 'body' }] }, { links });
  const all = query(value);
  assert.equal(all.counts.links, 3); assert.equal(all.counts.all, 4);
  assert.deepEqual(query(value, '', 'links').results.map(r => [r.title, r.link.direction, r.link.href]), [['Graph basics', 'from', '/apps/canvas-1'], ['Unavailable canvas', 'from', null], ['Trees', 'to', '/apps/canvas-2']]);
  assert.deepEqual(query(value, 'graph').results.map(r => r.id), ['link:from:t']);
  assert.equal(query(value, 'unavailable').results.length, 0, 'an unavailable target is not matched by a label it does not have');
  assert.equal(query(value, '', 'links').results[2].link.cards[0].title, 'Untitled card');
  assert.equal(query(index({ blocks: [] })).counts.links, 0, 'no links supplied (a shared view), no Links results');
});
test('literal phrase matching keeps code punctuation and counts every occurrence once per object', () => {
  const value = index({ blocks: [{ id: 'b', type: 'snippet', title: 'Example', code: 'a.b(x) + a.b(x)\nsrc/a.js' }] });
  const result = query(value, 'A.B(x)');
  assert.equal(result.results.length, 1); assert.equal(result.totalOccurrences, 2);
  assert.equal(query(value, 'src/a.js', 'code').results.length, 1);
  assert.equal(query(value, 'a.b[x]').results.length, 0);
});
test('title matches rank first, stable order follows, and title is not counted twice as body', () => {
  const value = index({ blocks: [{ id: 'body', type: 'text', text: 'needle' }, { id: 'title', type: 'text', title: 'Needle', text: 'other' }, { id: 'next', type: 'text', text: 'needle' }] });
  assert.deepEqual(query(value, 'needle').results.map(r => r.objectId), ['title', 'body', 'next']);
  assert.equal(query(value, 'needle').totalOccurrences, 3);
});
test('empty browsing classifies text, code, references and real Rabbit Holes without global inheritance', () => {
  const value = index({ blocks: [{ id: 'b', type: 'text', text: 'https://example.com' }, { id: 'ref', type: 'text', text: 'own', sources: [{ kind: 'web', title: 'Reference', url: 'https://example.com' }] }], items: [{ id: 't', kind: 'text', text: 'free' }, { id: 'c', kind: 'text', mode: 'code', text: 'code' }], sources: [{ title: 'global' }] }, { children: [{ name: 'child', title: 'Actual child', origin_block_id: 'b' }] });
  assert.equal(query(value, '', 'references').results.length, 1);
  assert.equal(query(value, '', 'rabbit-holes').results[0].objectId, 'b');
  assert.equal(query(value, '', 'text').results.some(r => r.objectId === 't'), true);
  assert.equal(query(value, '', 'code').results[0].objectId, 'c');
  assert.equal(query(value, 'global').results.length, 0);
});
test('unbudgeted live content includes late objects, shape labels, equations, notebook and hidden document blocks', () => {
  const blocks = Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, type: 'text', text: i === 119 ? 'late needle' : 'x'.repeat(100) }));
  blocks.push({ id: 'nb', type: 'notebook', ipynb: { cells: [{ id: 'cell', cell_type: 'code', source: ['stored ', 'needle'] }] } });
  const value = index({ blocks, shapes: [{ id: 's', text: 'shape needle' }], items: [{ id: 'e', kind: 'equation', latex: '\\frac{needle}{2}' }], doc: { blocks: [{ id: 'doc-a', type: 'paragraph', content: [{ type: 'text', text: 'hidden needle' }], children: [{ id: 'doc-b', type: 'paragraph', content: [{ type: 'text', text: 'nested needle' }] }] }] } });
  assert.equal(query(value, 'needle').results.length, 6);
  assert.equal(query(value, 'nested').results[0].target.docBlockId, 'doc-b');
  assert.equal(query(value, 'stored').results[0].location.cell, 'cell');
});
test('references dedup per object and permission denials never expose stale source names', () => {
  const value = index({ blocks: [{ id: 'b', type: 'text', text: 'needle', refs: [{ id: 'r', target: 'target' }] }, { id: 'private', type: 'repo-code', redacted: true, title: 'Secret title', source: { kind: 'repository', path: 'secret.py' } }] }, { references: { b: [{ id: 'r', target: 'target', title: 'needle reference' }, { id: 'gone', unavailable: true, title: 'Secret reference' }] } });
  assert.equal(query(value, 'needle').results.length, 1);
  assert.equal(query(value, 'secret').results.length, 0);
  assert.equal(query(value, '', 'references').results[0].references.length, 2);
});
test('only registered current source text is searchable, with source coverage and real locations', () => {
  const board = { blocks: [{ id: 'file', type: 'file', kind: 'document', label: 'report.docx', fileRef: { source: { id: 'source', rev: 'rev' }, status: { context: 'extracted' } } }] };
  const metadata = index(board);
  assert.equal(query(metadata, 'unread').results.length, 0);
  assert.equal(query(metadata).results[0].availability.status, 'partial');
  const loaded = index(board, { loadedContent: new Map([['file', { status: 'partial', sourceKey: 'source@rev', complete: false, limited: 'first 3 pages', units: [{ loc: { page: 3 }, text: 'needle in source' }] }]]) });
  const hit = query(loaded, 'needle').results[0];
  assert.equal(hit.match.kind, 'source'); assert.deepEqual(hit.location, { page: 3 });
  assert.equal(hit.availability.limited, 'first 3 pages');
});
test('incremental updates reuse unaffected entries and remove deleted content; canvas scopes reset', () => {
  const b = { id: 'b', type: 'text', text: 'before' }, unchanged = { id: 'same', type: 'text', text: 'steady' };
  const first = index({ blocks: [b, unchanged] });
  const second = updateSearchIndex(first, { scopeKey: 'one', board: { blocks: [{ ...b, text: 'after' }, unchanged] } });
  assert.equal(first.entries.get('object:same'), second.entries.get('object:same'));
  assert.equal(query(second, 'before').results.length, 0); assert.equal(query(second, 'after').results.length, 1);
  const third = updateSearchIndex(second, { scopeKey: 'two', board: { blocks: [] } });
  assert.equal(query(third).results.length, 0);
});
test('comments default to open and return thread anchor separately from card', () => {
  const value = index({ blocks: [{ id: 'b', type: 'text', text: 'hello' }] }, { comments: [{ id: 't', objectId: 'b', text: 'open needle', anchor: { x: 1, y: 2 } }, { id: 'done', text: 'resolved needle', resolved: true }] });
  assert.equal(query(value, 'needle', 'comments').results.length, 1);
  assert.equal(query(value, 'needle', 'comments', { includeResolved: true }).results.length, 2);
  assert.deepEqual(query(value, 'open').results[0].target.anchor, { x: 1, y: 2 });
});
test('registry isolates scopes and stale cleanup cannot erase a replacement registration', () => {
  const a = createSearchContentRegistry(), b = createSearchContentRegistry();
  let calls = 0; a.subscribe(() => calls++);
  const old = a.register('x', { sourceKey: 'old', status: 'ready', units: [{ text: 'secret' }] });
  const current = a.register('x', { sourceKey: 'new', status: 'unavailable' });
  old(); assert.equal(a.getSnapshot().get('x').status, 'unavailable');
  assert.equal(b.getSnapshot().size, 0);
  current(); assert.equal(a.getSnapshot().size, 0); assert.equal(calls, 3);
});

import { currentCardSource } from './card-source.js';
import { searchSourceRecord } from './canvas-search-content.js';
test('source identity changes suppress old ready content before React effects run', () => {
  const old = { identity: 'owner:old', status: 'ready', lines: [{ n: 1, text: 'private' }] };
  assert.equal(currentCardSource(old, 'owner:old', true), old);
  assert.deepEqual(currentCardSource(old, 'viewer:new', true), { status: 'loading' });
  assert.deepEqual(currentCardSource(old, 'redacted', false), { status: 'unavailable' });
});
test('source records drop denied/error text and name bounded coverage honestly', () => {
  assert.equal(searchSourceRecord({ status: 'unavailable', units: [{ text: 'secret' }] }).units.length, 0);
  assert.equal(searchSourceRecord({ status: 'failed', units: [{ text: 'secret' }] }).status, 'error');
  const record = searchSourceRecord({ status: 'ready', units: [{ text: 'one' }, { text: 'x'.repeat(4 * 1024 * 1024) }] });
  assert.equal(record.status, 'partial'); assert.equal(record.units.length, 1); assert.match(record.limited, /limit/);
});

test('PDF pages and paper cards qualify through structured identity, never arbitrary prose', () => {
  const value = index({ blocks: [{ id: 'pdf', type: 'pdf', assetKey: 'pdf:upload:abcdefabcdef', label: 'Report' }, { id: 'page', type: 'slide', pdf: 'doc:123', number: 7, label: 'Report page' }, { id: 'paper', type: 'paper', title: 'Research', paper: { id: '2501.12345', page: 4 } }] });
  assert.equal(query(value, '', 'references').results.length, 3);
  assert.equal(query(value, 'page 7', 'references').results[0].objectId, 'page');
  assert.equal(query(value, 'page 4', 'references').results[0].objectId, 'paper');
});
test('an empty native document does not create a phantom search result', () => {
  assert.equal(query(index({ doc: { blocks: [{ id: 'empty', type: 'paragraph', content: [] }] } })).results.length, 0);
});

test('comment summary and complete messages are not counted twice', () => {
  const value = index({}, { comments: [{ id: 'thread', text: 'needle', messages: [{ text: 'needle' }, { text: 'another needle' }] }] });
  assert.equal(query(value, 'needle').totalOccurrences, 2);
});
test('a denied resolved canvas reference removes stale metadata from the index', () => {
  const value = index({ blocks: [{ id: 'ref', type: 'canvas-ref', refs: [{ id: 'ref-id', target: 'elsewhere' }], title: 'Private old title' }] }, { references: { ref: [{ target: 'elsewhere', unavailable: true }] } });
  assert.equal(query(value, 'Private').results.length, 0);
  assert.equal(query(value).results[0].references[0].title, undefined);
});
test('large live board reuses unchanged entries while one edited object updates', t => {
  const blocks = Array.from({ length: 5000 }, (_, i) => ({ id: `large-${i}`, type: 'text', title: `Card ${i}`, text: `unique ${i} ${'body '.repeat(60)}` }));
  const begin = performance.now(); const first = index({ blocks }); const initialMs = performance.now() - begin;
  const edited = [...blocks]; edited[2499] = { ...edited[2499], text: 'fresh edit needle' };
  const change = performance.now(); const second = updateSearchIndex(first, { scopeKey: 'one', board: { blocks: edited } }); const updateMs = performance.now() - change;
  assert.equal(query(second, 'fresh edit needle').results[0].objectId, 'large-2499');
  assert.equal([...second.entries].filter(([id, entry]) => first.entries.get(id) === entry).length, 4999);
  t.diagnostic(`5000 objects: initial ${initialMs.toFixed(1)}ms, single edit ${updateMs.toFixed(1)}ms`);
});

test('accessible card results expose stable cached-poster keys without fetching previews', () => {
  const value = index({ blocks: [{ id: 'visible', type: 'text', text: 'shown' }, { id: 'hidden', type: 'repo-code', redacted: true, title: 'private' }] });
  assert.equal(query(value).results[0].previewKey, 'visible');
  assert.equal(query(value).results.length, 1);
});

test('notebook file names are searchable metadata while only stored notebook cells supply bodies', () => {
  const value = index({ blocks: [{ id: 'n', type: 'notebook', active_path: 'src/helper.py', ipynb_path: 'analysis.ipynb', files: ['analysis.ipynb', 'src/helper.py', 'data.csv'], ipynb: { cells: [{ id: 'c', cell_type: 'code', source: 'stored body' }] } }] });
  for (const name of ['analysis.ipynb', 'src/helper.py', 'data.csv']) assert.equal(query(value, name, 'code').results[0].objectId, 'n');
  assert.equal(query(value, 'src/helper.py').totalOccurrences, 1);
  assert.equal(query(value, 'stored body').results[0].location.path, 'analysis.ipynb');
  assert.equal(query(value).results[0].availability.status, 'partial');
  assert.match(query(value).results[0].availability.message, /workspace file bodies/);
});
test('papers, PDF pages and images state metadata-only limits and never invent OCR content', () => {
  const value = index({ blocks: [{ id: 'p', type: 'paper', title: 'Research', paper: { id: '2501.12345' } }, { id: 'page', type: 'slide', pdf: 'doc:1', number: 1 }, { id: 'image', type: 'image', label: 'Photo', alt: 'Owner supplied caption', src: 'data:image/png;base64,not-searchable-hidden-words' }] });
  assert.equal(query(value).results.every(result => result.availability.status === 'partial'), true);
  assert.equal(query(value, 'Owner supplied caption').results[0].objectId, 'image');
  assert.equal(query(value, 'not-searchable-hidden-words').results.length, 0);
  assert.match(query(value).results.find(result => result.objectId === 'image').availability.message, /OCR/);
});


test('canonical standalone refs array resolves the current title and focuses its own object', () => {
  const value = index({ blocks: [{ id: 'standalone', type: 'canvas-ref', refs: [{ id: 'link', target: 'board-id' }] }] }, { references: { standalone: [{ id: 'link', kind: 'canvas', target: 'board-id', title: 'Resolved target title', href: '/apps/canvas-12345678' }] } });
  const hit = query(value, 'Resolved target title', 'references').results[0];
  assert.equal(hit.title, 'Resolved target title'); assert.equal(hit.objectId, 'standalone');
  assert.equal(hit.target.id, 'standalone'); assert.equal(hit.references.length, 1); assert.equal(hit.occurrenceCount, 1);
});

test('uploaded code preserves original filename after renaming without duplicates or denied metadata', () => {
  const block = { id: 'uploaded', type: 'repo-code', title: 'Renamed analysis', source: { kind: 'upload', name: 'original-analysis.py' } };
  const query = board => querySearchIndex(index(board), { query: 'original-analysis.py' });
  assert.equal(query({ blocks: [block] }).results[0].occurrenceCount, 1);
  assert.equal(query({ blocks: [{ ...block, title: block.source.name }] }).results[0].occurrenceCount, 1);
  assert.equal(query({ blocks: [{ ...block, redacted: true }] }).results.length, 0);
  const denied = index({ blocks: [block] }, { loadedContent: new Map([[block.id, { status: 'unavailable' }]]) });
  assert.equal(querySearchIndex(denied, { query: 'original-analysis.py' }).results.length, 0);
});
