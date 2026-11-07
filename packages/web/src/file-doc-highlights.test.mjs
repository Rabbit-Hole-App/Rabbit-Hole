import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentHighlights, highlightAt, markdownHighlightBody, markdownHighlightSource, placeHighlights } from './file-doc-highlights.js';
import { locateQuote } from './learn-wiki-highlights.js';

// What textContent gives for a rendered document: blocks run together with no separator.
const DOC = 'Intro\nThe loss is the mean squared error.Notes\nThe loss is the mean squared error.Summary\nThe loss is the mean squared error.';
const SENTENCE = 'The loss is the mean squared error.';
const starts = [...DOC.matchAll(/The loss is the mean squared error\./g)].map(m => m.index);
// What the page stores when the reader selects the n-th occurrence (CONTEXT = 32, as quoteFromRange).
const quoteAt = (text, at, exact = SENTENCE) => ({ exact, prefix: text.slice(Math.max(0, at - 32), at), suffix: text.slice(at + exact.length, at + exact.length + 32) });
const startOf = (text, quote) => locateQuote(text, quote)?.start;

test('three identical sentences: each highlight stays on the occurrence it was made on', () => {
  assert.equal(starts.length, 3);
  starts.forEach(at => assert.equal(startOf(DOC, quoteAt(DOC, at)), at));
});

test('after a reload or re-render (same text, recomputed) the second occurrence is still the second', () => {
  const quote = JSON.parse(JSON.stringify(quoteAt(DOC, starts[1])));
  assert.equal(startOf(`${DOC}`, quote), starts[1]);
  assert.equal(startOf(DOC.split('').join(''), quote), starts[1]);
});

test('the same text appearing before it does not steal the highlight', () => {
  const quote = quoteAt(DOC, starts[1]);
  const longer = `${SENTENCE}\n${SENTENCE}\n${DOC}`; // two more copies in front
  const shift = longer.length - DOC.length;
  assert.equal(startOf(longer, quote), starts[1] + shift);
});

test('Show more: the text after the highlight grows and the quote still finds it', () => {
  const cut = starts[1] + SENTENCE.length + 10; // a first chunk that ends 10 characters after the sentence
  const quote = quoteAt(DOC.slice(0, cut), starts[1]);
  assert.equal(startOf(DOC, quote), starts[1]);
  assert.equal(startOf(DOC.slice(0, cut), quote), starts[1]);
});

test('placed highlights and the click hit test follow the quote', () => {
  const a = { id: 'pdfh_a', quote: quoteAt(DOC, starts[0]) }, b = { id: 'pdfh_b', quote: quoteAt(DOC, starts[1]) }, gone = { id: 'pdfh_c', quote: { exact: 'not in the file', prefix: '', suffix: '' } };
  const placed = placeHighlights(DOC, [a, b, gone]);
  assert.deepEqual(placed.map(p => p.h.id), ['pdfh_a', 'pdfh_b']);
  assert.equal(highlightAt(placed, starts[1] + 4), b);
  assert.equal(highlightAt(placed, starts[2] + 4), null);
});

test('only a stored Markdown card on the owner canvas has a key; the body carries the revision', () => {
  const block = { kind: 'markdown', fileRef: { source: { id: 'fs_0123456789abcdef01234567', rev: 'a'.repeat(64) } } };
  const source = markdownHighlightSource(block, 'canvas-1');
  assert.deepEqual(source, { app: 'canvas-1', key: 'file:fs_0123456789abcdef01234567' });
  const body = markdownHighlightBody(source, block, { exact: 'x', prefix: '', suffix: '' });
  assert.equal(body.sha256, 'a'.repeat(64));
  assert.equal(body.kind, 'text');
  assert.equal(markdownHighlightSource(block, null), null);
  assert.equal(markdownHighlightSource({ ...block, kind: 'text' }, 'canvas-1'), null);
  assert.equal(markdownHighlightSource({ kind: 'markdown', assetKey: 'import:x' }, 'canvas-1'), null);
  assert.equal(markdownHighlightSource({ kind: 'markdown', fileRef: { source: { id: 'fs_0123456789abcdef01234567' } } }, 'canvas-1'), null);
});

test('highlights of another revision are not drawn', () => {
  const answer = { sha256: 'r1', highlights: [{ id: 'h' }], changed: 0 };
  assert.equal(currentHighlights(answer, 'r1').length, 1);
  assert.equal(currentHighlights(answer, 'r2').length, 0);
  assert.equal(currentHighlights(null, 'r1').length, 0);
});
