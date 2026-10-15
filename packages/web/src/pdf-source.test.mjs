// PDF to canvas (docs/features/pdf-to-canvas.md): the two source kinds stay apart, pages keep their numbers, and the
// dialog's range is inclusive and 1-based.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageRange, pageRef, paperBytesUrl, pdfBytesUrl, pdfKeyOfRef, pdfSource, turnHasPage, turnPaper } from './pdf-source.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a context document and an uploaded paper never share a route', () => {
  assert.deepEqual(pdfSource('doc:ctx:0123456789ab'), { kind: 'doc', id: 'ctx:0123456789ab' });
  assert.deepEqual(pdfSource('pdf:upload:0123456789ab'), { kind: 'paper', id: 'upload:0123456789ab' });
  assert.equal(pdfSource('slide:abc'), null);
  assert.equal(pdfSource(''), null);
  assert.equal(pdfBytesUrl('canvas-0123abcd', 'doc:ctx:0123456789ab'), '/api/learn/context/ctx%3A0123456789ab?app=canvas-0123abcd');
  assert.equal(pdfBytesUrl('canvas-0123abcd', 'pdf:upload:0123456789ab'), '/api/learn/paper?app=canvas-0123abcd&id=upload%3A0123456789ab');
  assert.equal(pdfBytesUrl('canvas-0123abcd', 'slide:abc'), null);
});

test('only an uploaded PDF in Sources can go on the canvas', () => {
  assert.equal(pdfKeyOfRef({ sourceId: 'doc:ctx:0123456789ab', kind: 'doc' }), 'doc:ctx:0123456789ab');
  assert.equal(pdfKeyOfRef({ sourceId: 'paper:upload:0123456789ab', kind: 'web' }), 'pdf:upload:0123456789ab');
  assert.equal(pdfKeyOfRef({ sourceId: 'paper:1706.03762', kind: 'web' }), null, 'an arXiv paper was never uploaded');
  assert.equal(pdfKeyOfRef({ sourceId: 'card:b1', kind: 'card' }), null);
  assert.equal(pdfKeyOfRef(null), null);
});

test('a page of either source is its own PDF at its own page: the chip Add to chat attaches', () => {
  assert.deepEqual(pageRef({ type: 'slide', pdf: 'doc:ctx:0123456789ab', number: 12, label: 'notes.pdf' }),
    { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'notes.pdf', version: '', range: { page: 12 } });
  assert.deepEqual(pageRef({ type: 'slide', pdf: 'pdf:upload:0123456789ab', number: 12, label: 'notes.pdf' }),
    { sourceId: 'paper:upload:0123456789ab', kind: 'web', name: 'notes.pdf', version: '', range: { page: 12 } });
  assert.deepEqual(pageRef({ type: 'slide', pdf: 'pdf:upload:0123456789ab', number: 12, label: 'notes.pdf', home: 'canvas-0a1b2c3d' }).home, 'canvas-0a1b2c3d', 'a copied page names its home canvas');
  assert.equal(pageRef({ type: 'slide', pdf: 'doc:ctx:0123456789ab', label: 'notes.pdf' }), null);
  assert.equal(pageRef({ type: 'note' }), null);
});

// Follow-up 3: the chip asks about its page after the selection is cleared; follow-up 2: a copied page reads its home canvas.
test('the paper page a turn reads: the selected page, else the first uploaded-paper page chip', () => {
  const chip = pageRef({ type: 'slide', pdf: 'pdf:upload:0123456789ab', number: 12, label: 'pages.pdf', home: 'canvas-0a1b2c3d' });
  const doc = pageRef({ type: 'slide', pdf: 'doc:ctx:0123456789ab', number: 3, label: 'notes.pdf' });
  assert.deepEqual(turnPaper(null, [doc, chip]), { id: 'upload:0123456789ab', page: 12, home: 'canvas-0a1b2c3d' });
  assert.deepEqual(turnPaper({ paper: { id: 'upload:ffffffffffff', page: 2 } }, [chip]), { id: 'upload:ffffffffffff', page: 2 }, 'a selected page wins');
  assert.equal(turnPaper(null, [doc, { sourceId: 'paper:1706.03762', kind: 'web', range: { page: 4 } }]), null, 'an arXiv chip is not an upload');
  assert.equal(turnHasPage(null, [chip]), true);
  assert.equal(turnHasPage(null, [doc]), true);
  assert.equal(turnHasPage({ docPage: doc }, []), true);
  assert.equal(turnHasPage(null, [{ sourceId: 'card:b1', kind: 'card', range: null }, { sourceId: 'paper:1706.03762', kind: 'web', range: { page: 4 } }]), false);
  assert.equal(paperBytesUrl('canvas-11112222', 'upload:0123456789ab', 'canvas-0a1b2c3d'), '/api/learn/paper?app=canvas-11112222&id=upload%3A0123456789ab&home=canvas-0a1b2c3d');
  assert.equal(paperBytesUrl('canvas-0a1b2c3d', 'upload:0123456789ab', 'canvas-0a1b2c3d'), '/api/learn/paper?app=canvas-0a1b2c3d&id=upload%3A0123456789ab', 'its own canvas names no home');
  assert.equal(pdfBytesUrl('canvas-11112222', 'pdf:upload:0123456789ab', 'canvas-0a1b2c3d'), '/api/learn/paper?app=canvas-11112222&id=upload%3A0123456789ab&home=canvas-0a1b2c3d');
});

test('From/To is inclusive, 1-based and within the PDF', () => {
  assert.deepEqual(pageRange(12, 16, 40), { from: 12, to: 16, count: 5 });
  assert.deepEqual(pageRange('7', '7', 40), { from: 7, to: 7, count: 1 });
  assert.deepEqual(pageRange(1, 40, 40), { from: 1, to: 40, count: 40 });
  for (const [from, to] of [[0, 3], [3, 41], [9, 8], ['', 4], [2, ''], [1.5, 3], ['a', 3]]) assert.ok(pageRange(from, to, 40).error, `${from}-${to} is refused`);
});

test('both roads share one flow, pages keep their numbers, and nothing is uploaded again', () => {
  const page = read('./LearnPage.jsx'), canvas = read('./AdaptiveCanvas.jsx');
  // One insert for pages, numbered by the PDF, never by position in the set.
  assert.match(canvas, /insertSlides: \(\{ pages, label, pdf, home \}\) => \{/);
  assert.doesNotMatch(canvas, /number: index \+ 1/);
  assert.match(canvas, /number, pdf, \.\.\.\(home \? \{ home \} : \{\}\) \}/);
  // Upload and Sources both go through placePdf; Sources reads stored bytes and posts nothing.
  assert.equal(page.match(/placePdf\(/g).length, 2, 'used by takePdf and by Add to canvas from Sources');
  const fromSources = page.slice(page.indexOf('// Add to canvas from the Sources pane'), page.indexOf("window.addEventListener('small:pdf-to-canvas'"));
  assert.ok(fromSources.length > 200);
  assert.doesNotMatch(fromSources, /method: 'POST'/);
  assert.match(fromSources, /pdfBytesUrl\(/);
});
