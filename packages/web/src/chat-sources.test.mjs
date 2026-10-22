// The Chat's Sources readers (sub-lane A4b; brief section 6, 13.1, 13.2; contract A2, A5): which existing reader shows a
// ContextRef, the refs LearnPage's openers build, the back stack and the per-source reading position, as pure code. The
// readers themselves render in the browser (e2e is Home's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeRef, codeSource, paperRef, positionStore, pushSource, readerFor, wikiRef } from './chat-sources.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('each ref kind maps to an existing reader, and anything without one maps to null', () => {
  assert.equal(readerFor({ sourceId: 'doc:ctx:0123456789ab', kind: 'doc', range: { page: 3 } }), 'doc');
  assert.equal(readerFor({ sourceId: 'code:owner/repo@abc123:src/x.py', kind: 'code', range: { path: 'src/x.py', start: 10, end: 42 } }), 'code');
  assert.equal(readerFor({ sourceId: 'paper:2401.01234', kind: 'web' }), 'paper');
  assert.equal(readerFor({ sourceId: 'paper:upload:0123456789ab', kind: 'web' }), 'paper');
  assert.equal(readerFor({ sourceId: 'wiki:Logistic_regression', kind: 'web' }), 'wiki');
  assert.equal(readerFor({ sourceId: 'card:shape:a', kind: 'card', text: 'The sigmoid maps a score to (0, 1).' }), 'text');
  assert.equal(readerFor({ sourceId: 'group:shape:a', kind: 'group', range: { cardIds: ['shape:a'] }, text: 'two cards' }), 'text');
  // Never a promised viewer: canvas content without its text, images and media by shape id, and unknown shapes say so.
  assert.equal(readerFor({ sourceId: 'card:shape:a', kind: 'card' }), null);
  assert.equal(readerFor({ sourceId: 'image:shape:b', kind: 'image' }), null);
  assert.equal(readerFor({ sourceId: 'media:shape:c', kind: 'media', range: { startSec: 12 } }), null);
  assert.equal(readerFor({ sourceId: 'web:https://example.com', kind: 'web' }), null);
  assert.equal(readerFor({ sourceId: 'code:no-commit-or-path', kind: 'code' }), null);
  assert.equal(readerFor({ sourceId: 'x', kind: 'video' }), null);
  assert.equal(readerFor(null), null);
});

test('a code ref names repo, commit and path in its sourceId, and its range wins for the lines', () => {
  assert.deepEqual(codeSource({ sourceId: 'code:owner/repo@abc123:src/x.py', kind: 'code', version: 'abc123', range: { path: 'src/x.py', start: 10, end: 42 } }),
    { repo: 'owner/repo', commit: 'abc123', path: 'src/x.py', start: 10, end: 42 });
  assert.deepEqual(codeSource({ sourceId: 'code:@:a/b.py', kind: 'code', version: 'def456', range: null }), { repo: '', commit: 'def456', path: 'a/b.py', start: 0, end: 0 });
  assert.deepEqual(codeSource({ sourceId: 'code:r@c:a.py', kind: 'code', range: { path: 'a.py', start: 7 } }), { repo: 'r', commit: 'c', path: 'a.py', start: 7, end: 7 });
  assert.equal(codeSource({ sourceId: 'doc:ctx:1', kind: 'code' }), null);
});

test('the openers build contract refs that round-trip through the reader mapping', () => {
  const code = codeRef({ repo: 'owner/repo', commit: 'abc123', path: 'src/model/head.py', start: 12, end: 4 });
  assert.deepEqual(code, { sourceId: 'code:owner/repo@abc123:src/model/head.py', kind: 'code', name: 'head.py', version: 'abc123', range: { path: 'src/model/head.py', start: 12, end: 12 } });
  assert.equal(readerFor(code), 'code');
  assert.deepEqual(codeSource(code), { repo: 'owner/repo', commit: 'abc123', path: 'src/model/head.py', start: 12, end: 12 });
  assert.equal(codeRef({ path: 'a.py' }).range, null, 'no line: the whole file');
  assert.deepEqual(paperRef({ id: '2401.01234', title: 'A paper', page: 3 }), { sourceId: 'paper:2401.01234', kind: 'web', name: 'A paper', version: '2401.01234', range: { page: 3 } });
  assert.deepEqual(paperRef({ id: 'upload:0123456789ab' }).range, { page: 1 });
  assert.equal(paperRef({ id: '1' }).name, 'arXiv 1');
  assert.deepEqual(wikiRef({ title: 'Logistic_regression' }), { sourceId: 'wiki:Logistic_regression', kind: 'web', name: 'Logistic regression', version: '', range: null });
  assert.equal(wikiRef({ title: 'x'.repeat(300) }).name.length, 120, 'names stay within the contract');
});

test('the back stack replaces the source on top, pushes another, and keeps at most 50', () => {
  const a = { sourceId: 'paper:1', range: { page: 1 } }, a2 = { sourceId: 'paper:1', range: { page: 4 } }, b = { sourceId: 'wiki:B' };
  assert.deepEqual(pushSource([], a), [a]);
  assert.deepEqual(pushSource([a], a2), [a2], 'another page of the same paper is not a back step');
  assert.deepEqual(pushSource([a], b), [a, b]);
  let stack = [];
  for (let i = 0; i < 60; i++) stack = pushSource(stack, { sourceId: `wiki:${i}` });
  assert.equal(stack.length, 50);
  assert.equal(stack[0].sourceId, 'wiki:10');
});

test('reading positions merge per source, survive switching away, and a citation with a range lands at its range', () => {
  const store = positionStore();
  store.set('paper:1', { page: 5 });
  store.set('paper:1', { scrollTop: 300 });
  store.set('wiki:B', { section: 2 });
  assert.deepEqual(store.get('paper:1'), { page: 5, scrollTop: 300 });
  store.opened({ sourceId: 'paper:1', range: null });
  assert.deepEqual(store.get('paper:1'), { page: 5, scrollTop: 300 }, 'reopening from the list keeps the place');
  store.opened({ sourceId: 'paper:1', range: { page: 2 } });
  assert.equal(store.get('paper:1'), undefined, 'a citation is an instruction to go to its page');
  assert.deepEqual(store.get('wiki:B'), { section: 2 }, 'other sources keep theirs');
});

test('a citation open (an excerpt\'s Open source) forgets the place but keeps the reader zoom (R4 audit gap 6)', () => {
  const store = positionStore();
  store.set('doc:ctx:0123456789ab', { page: 5, scrollTop: 300, zoom: 2 });
  store.opened({ sourceId: 'doc:ctx:0123456789ab', range: { page: 3, excerpt: { id: 'pdfx_1' } } });
  assert.deepEqual(store.get('doc:ctx:0123456789ab'), { zoom: 2 }, 'the zoom stays; page and scroll come from the citation');
  store.set('doc:ctx:0123456789ab', { page: 3 });
  store.opened({ sourceId: 'doc:ctx:0123456789ab', range: { page: 1 } });
  assert.deepEqual(store.get('doc:ctx:0123456789ab'), { zoom: 2 }, 'and again on the next citation');
  store.set('paper:1', { page: 4 });
  store.opened({ sourceId: 'paper:1', range: { page: 2 } });
  assert.equal(store.get('paper:1'), undefined, 'a source never zoomed keeps no entry');
});

test('on the Learn Chat a reader never replaces the transcript and sending never closes it; elsewhere nothing changes (13.1, 13.2)', () => {
  const ask = read('./ask.jsx'), page = read('./LearnPage.jsx');
  assert.match(ask, /if \(chat\) contentPanel = null;\n\s*else if \(repository && filePeek\) contentPanel = <RepositorySource/);
  assert.match(ask, /const setFilePeek = peek => \(chat && peek \? chat\.openSource\(codeRef\(/, 'a cited file opens in the Sources pane');
  assert.match(ask, /if \(contentPanel\) \{ setFilePeek\(null\); onCloseContentPanel\?\.\(\); setView\('chat'\); \}/, 'the old close stays for other surfaces');
  for (const opener of ['chat.openSource(wikiRef(', 'chatWorkspace.current.openSource(paperRef(paper))', 'chatWorkspace.current.openSource(paperRef({ id: stored.id', 'chatWorkspace.current.openSource(codeRef(']) assert.ok(page.includes(opener), opener);
});
