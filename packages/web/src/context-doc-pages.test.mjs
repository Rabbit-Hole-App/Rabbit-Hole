// PDF-02: the page text of a PDF of any length, read in the browser with the real pdf.js from PDFs generated in code
// (99, 100, 101 and 312 pages), and the browser's limits pinned to the server's (control-plane pdf-pages.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPageTexts, processing, currentProcessing, PDF_UPLOAD_LIMIT, PDF_PAGE_MAX, PAGE_TEXT_CHARS, CUT_MARK } from './context-doc-pages.js';
import * as server from '../../control-plane/src/pdf-pages.js';
import { longPdf, DEEP_PAGE, DEEP_WORDS } from '../e2e/long-pdf-fixture.mjs';

const tasks = [];
const open = bytes => { const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }); tasks.push(task); return task.promise; };
test.after(() => Promise.all(tasks.map(task => task.destroy())));

test('the browser and the server keep the same PDF limits', () => {
  assert.deepEqual([PDF_UPLOAD_LIMIT, PDF_PAGE_MAX, PAGE_TEXT_CHARS, CUT_MARK], [server.PDF_UPLOAD_LIMIT, server.PDF_PAGE_MAX, server.PAGE_TEXT_CHARS, server.CUT_MARK]);
});

for (const total of [99, 100, 101, 312]) {
  test(`a ${total}-page PDF: every page's text is read, in order, none dropped`, async () => {
    const pdf = await open(longPdf(total, { [DEEP_PAGE]: DEEP_WORDS }));
    const seen = [];
    const pages = await readPageTexts(pdf, { onPage: (done, of) => seen.push([done, of]) });
    assert.equal(pages.length, total);
    pages.forEach((text, i) => assert.match(text, new RegExp(`^Page ${i + 1} of ${total}\\s+Marker p${i + 1}\\b`), `page ${i + 1}`));
    assert.deepEqual(seen.at(-1), [total, total]);
    assert.equal(seen.length, total, 'progress after every page');
    if (total >= DEEP_PAGE) assert.match(pages[DEEP_PAGE - 1], new RegExp(DEEP_WORDS));
    assert.equal(server.readPageTexts(JSON.stringify(pages)).pages.length, total, 'the server takes what the browser read');

  });
}

test('reading stops with a message naming the time limit, and refuses past 2,000 pages before reading', async () => {
  const pdf = await open(longPdf(3));
  await assert.rejects(readPageTexts(pdf, { seconds: -1 }), /^Error: Reading the pages stopped after -1 seconds, at page 1 of 3\.$/);

  await assert.rejects(readPageTexts({ numPages: 2001, getPage: () => assert.fail('no page is read') }), /That PDF has 2,001 pages\. A PDF can have at most 2,000 pages\./);
});

test('a page longer than 20,000 characters is cut and marked, never dropped; a page without text stays an empty entry', async () => {
  const long = 'x'.repeat(PAGE_TEXT_CHARS + 50);
  const page = text => ({ getTextContent: async () => ({ items: text ? [{ str: text, hasEOL: false }] : [] }), cleanup() {} });
  const pages = await readPageTexts({ numPages: 3, getPage: async n => page(n === 2 ? long : n === 3 ? '' : 'one') });
  assert.equal(pages.length, 3);
  assert.equal(pages[1], `${'x'.repeat(PAGE_TEXT_CHARS)}\n${CUT_MARK}`);
  assert.equal(pages[2], '');
  assert.equal(server.readPageTexts(pages).pages.length, 3, 'the cut page fits the server limit');
});

test('processing: one document at a time, each listed for its canvas until it settles', async () => {
  let release;
  const first = processing('canvas-0a1b2c3d', 'long.pdf', null, async progress => { progress(1, 312); await new Promise(r => { release = r; }); return 'a'; });
  const second = processing('canvas-0a1b2c3d', 'retry.pdf', 'ctx:0123456789ab', async () => 'b');
  await new Promise(r => setTimeout(r, 0));
  const listed = currentProcessing('canvas-0a1b2c3d');
  assert.deepEqual(listed.map(({ name, done, total, id }) => ({ name, done, total, id })), [{ name: 'long.pdf', done: 1, total: 312, id: undefined }, { name: 'retry.pdf', done: 0, total: null, id: 'ctx:0123456789ab' }]);
  assert.deepEqual(currentProcessing('canvas-ffffffff'), [], 'another canvas lists none');
  release();
  assert.deepEqual([await first, await second], ['a', 'b']);
  assert.deepEqual(currentProcessing('canvas-0a1b2c3d'), []);
  await assert.rejects(processing('canvas-0a1b2c3d', 'bad.pdf', null, async () => { throw new Error('nope'); }), /nope/);
  assert.deepEqual(currentProcessing('canvas-0a1b2c3d'), [], 'a failed job is removed too');
});
