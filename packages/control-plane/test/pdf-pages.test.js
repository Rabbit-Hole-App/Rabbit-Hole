// PDF-02: PDFs of 99, 100, 101 and 312 pages through the real handlers (contextDocsFetch, contextDocumentBlocks,
// putUploadedPaper, readLearnSource, the Tutor's page check). The PDFs are generated in code, their page text is read by the
// browser's own reader (web context-doc-pages.js on the real pdf.js), and the blocks asserted are exactly what a model
// request would carry: no model is called. A PDF past 100 pages never rides whole; the pages a question needs do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { contextDocsFetch, contextDocumentBlocks } from '../src/learn-context-docs.js';
import { putUploadedPaper, paperIdentity } from '../src/learn-paper.js';
import { readLearnSource, validateLearnContext } from '../src/learn-ask-context.js';
import { validPageContext } from '../src/learn-tutor-routes.js';
import { SEND_CHARS, selectPages, namedPages, readPageTexts as serverPages } from '../src/pdf-pages.js';
import { readPageTexts } from '../../web/src/context-doc-pages.js';
import { longPdf, DEEP_PAGE, DEEP_WORDS } from '../../web/e2e/long-pdf-fixture.mjs';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../learn-migrations/0003-canvas-context-documents.sql', import.meta.url), 'utf8');
const tasks = [];
test.after(() => Promise.all(tasks.map(task => task.destroy())));
const fixtures = new Map();
// { bytes, pages }: the generated PDF and the page text the browser reads from it.
async function pdfOf(total) {
  if (!fixtures.has(total)) {
    const bytes = longPdf(total, { [DEEP_PAGE]: DEEP_WORDS });
    const task = getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true }); tasks.push(task);
    fixtures.set(total, { bytes, pages: await readPageTexts(await task.promise) });
  }
  return fixtures.get(total);
}

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema); sqlite.exec(migration);
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => stmt.run(...args) }; } };
  const objects = new Map(), reads = [];
  const toBytes = body => (typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body));
  const media = {
    put: async (key, body, { customMetadata } = {}) => { objects.set(key, { bytes: toBytes(body), customMetadata }); },
    get: async key => { reads.push(key); const o = objects.get(key); return o ? { body: o.bytes, size: o.bytes.length, customMetadata: o.customMetadata, arrayBuffer: async () => o.bytes.slice().buffer } : null; },
    delete: async key => { objects.delete(key); },
  };
  const env = { LEARN_DB: db, LEARN_MEDIA: media, DB: { prepare() { throw Error('live D1 touched'); } }, RUNS: { put() { throw Error('live R2 touched'); } } };
  const canvas = { org: 'team', name: 'canvas-0a1b2c3d', email: 'owner@test' };
  const deps = { authorize: async (req, _env, name) => (name === canvas.name ? canvas : Response.json({ error: 'Not your canvas' }, { status: 404 })) };
  const call = async (method, path, { body, form } = {}) => {
    const init = { method };
    if (form) { const f = new FormData(); for (const [k, v] of Object.entries(form)) f.append(k, v); init.body = f; }
    if (body) { init.body = JSON.stringify(body); init.headers = { 'content-type': 'application/json' }; }
    const res = await contextDocsFetch(new Request(`https://dev.test${path}`, init), env, deps);
    return { status: res.status, body: await res.json() };
  };
  const upload = (name, bytes, extra = {}) => call('POST', '/api/learn/context', { form: { app: canvas.name, file: new File([bytes], name), ...extra } });
  return { env, canvas, call, upload, objects, reads };
}
const pdfBlocks = blocks => blocks.filter(b => b.source?.media_type === 'application/pdf');
const pageNumbers = block => [...block.source.data.matchAll(/^--- Page (\d+) ---$/gm)].map(m => Number(m[1]));

for (const total of [99, 100, 101, 312]) {
  test(`context document: a ${total}-page PDF is accepted whole, listed with its pages, and a question reads it within the model's 100-page limit`, async t => {
    const { env, canvas, upload, call } = fixture(t);
    const { bytes, pages } = await pdfOf(total);
    const res = await upload(`book-${total}.pdf`, bytes, { pages: JSON.stringify(pages) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const long = total > 100;
    assert.deepEqual((({ pages: p, status, reads, noText, error, attached }) => ({ p, status, reads, noText, error, attached }))(res.body.document),
      { p: total, status: 'ready', reads: long ? 'pages' : 'whole', noText: 0, error: null, attached: true });
    assert.deepEqual((await call('GET', `/api/learn/context?app=${canvas.name}`)).body.documents.map(d => [d.pages, d.status]), [[total, 'ready']], 'a reload lists the same');
    const blocks = await contextDocumentBlocks(env, canvas, null, { query: 'Where does sedimentation build the river delta?' });
    if (!long) {
      assert.equal(pdfBlocks(blocks).length, 1, 'up to 100 pages the PDF itself rides, as before');
      return;
    }
    assert.equal(pdfBlocks(blocks).length, 0, 'a PDF past 100 pages is never sent whole');
    const [doc] = blocks;
    assert.equal(doc.source.media_type, 'text/plain');
    assert.ok(doc.source.data.length < SEND_CHARS + 2000, 'bounded per question');
    const sent = pageNumbers(doc);
    assert.ok(sent.length > 1 && sent.length < total, `some pages, not all: ${sent.length}`);
    assert.match(doc.source.data, new RegExp(`^book-${total}\\.pdf: a ${total}-page PDF\\. Only the extracted text of pages .* of ${total} is included here`));
    assert.match(doc.source.data, new RegExp(`the other ${total - sent.length} pages were not sent`), 'never a silent loss: it says what was left out');
    if (total >= DEEP_PAGE) {
      assert.equal(sent[0] === DEEP_PAGE || sent.includes(DEEP_PAGE), true, `page ${DEEP_PAGE} matches the question`);
      assert.match(doc.source.data, new RegExp(`--- Page ${DEEP_PAGE} ---\\nPage ${DEEP_PAGE} of ${total}\\s+Marker p${DEEP_PAGE}\\s+${DEEP_WORDS}`));
    }
    // A chip at one page (chat-modes.js pageDocIds) reads that page and its neighbours first, past page 100.
    const id = res.body.document.id;
    const atPage = await contextDocumentBlocks(env, canvas, new Set([id]), { pages: new Map([[id, total]]), query: 'what is this?' });
    assert.deepEqual(pageNumbers(atPage[0]).filter(p => p >= total - 1), [total - 1, total]);
    assert.match(atPage[0].source.data, new RegExp(`--- Page ${total} ---\\nPage ${total} of ${total}`));
    // Every page stays reachable for the reader: the bytes route returns the whole PDF.
    const raw = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${encodeURIComponent(id)}?app=${canvas.name}`), env, { authorize: async () => canvas });
    assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), bytes);
  });
}

test('a long PDF without its page text is listed failed with a reason, says so to the model, and Retry makes it ready', async t => {
  const { env, canvas, upload, call } = fixture(t);
  const { bytes, pages } = await pdfOf(312);
  const failed = await upload('book.pdf', bytes, { page_count: '312', pages_error: 'Reading the pages stopped after 120 seconds, at page 200 of 312.' });
  assert.equal(failed.status, 200);
  assert.deepEqual([failed.body.document.status, failed.body.document.pages, failed.body.document.error], ['failed', 312, { code: 'pages_failed', message: 'Reading the pages stopped after 120 seconds, at page 200 of 312.' }]);
  const unread = await contextDocumentBlocks(env, canvas);
  assert.equal(pdfBlocks(unread).length, 0, 'still never sent whole');
  assert.match(unread.at(-1).text, /Attached PDFs whose pages have not been read yet .*: book\.pdf\. You have not seen them/);
  const id = failed.body.document.id;
  assert.equal((await call('PUT', `/api/learn/context/${id}/pages`, { body: { app: canvas.name, pages: 'nope' } })).status, 400);
  assert.match((await call('PUT', `/api/learn/context/${id}/pages`, { body: { app: canvas.name, pages: Array(2001).fill('') } })).body.error, /at most 2,000 pages/);
  assert.equal((await call('PUT', `/api/learn/context/${id}/pages`, { body: { app: 'canvas-ffffffff', pages } })).status, 404, 'only the owner');
  assert.equal((await call('PATCH', `/api/learn/context/${id}/pages`, { body: { app: canvas.name, attached: true } })).status, 405);
  const nul = await contextDocsFetch(new Request(`https://dev.test/api/learn/context/${id}/pages?app=${canvas.name}`, { method: 'PUT', body: 'null' }), env, { authorize: async () => canvas });
  assert.equal(nul.status, 400, 'a null body is refused, not a 500');
  const retried = await call('PUT', `/api/learn/context/${id}/pages`, { body: { app: canvas.name, pages } });
  assert.equal(retried.status, 200);
  assert.deepEqual([retried.body.document.status, retried.body.document.pages, retried.body.document.error], ['ready', 312, null]);
  assert.match((await contextDocumentBlocks(env, canvas, null, { query: 'sedimentation' }))[0].source.data, new RegExp(DEEP_WORDS));
  // A PDF from before PDF-02 (no page text) over 5 MB: failed pages_unread until Retry; a small one reads whole as before.
  const big = new Uint8Array(6 * 1024 * 1024).fill(32); big.set(bytes.subarray(0, 5));
  const legacy = (await upload('legacy.pdf', big)).body.document;
  assert.deepEqual([legacy.status, legacy.reads, legacy.error.code], ['failed', 'pages', 'pages_unread']);
  const small = (await upload('small.pdf', (await pdfOf(99)).bytes)).body.document;
  assert.deepEqual([small.status, small.reads, small.pages], ['ready', 'whole', null]);
  const text = (await upload('notes.md', new TextEncoder().encode('# notes'))).body.document;
  assert.deepEqual([text.status, text.reads, text.pages, text.error], ['ready', null, null, null]);
  assert.equal((await call('PUT', `/api/learn/context/${text.id}/pages`, { body: { app: canvas.name, pages: ['x'] } })).status, 400, 'only a PDF has pages');
});

test('limits name the real limit: 25 MB, 2,000 pages, page text size', async t => {
  const { upload } = fixture(t);
  const huge = new Uint8Array(25 * 1024 * 1024 + 1).fill(32); huge.set(new TextEncoder().encode('%PDF-'));
  assert.match((await upload('huge.pdf', huge)).body.error, /^That PDF is larger than 25 MB$/);
  const { bytes } = await pdfOf(101);
  assert.match((await upload('b.pdf', bytes, { pages: JSON.stringify(['x'.repeat(30000)]) })).body.error, /longer than 20,000 characters/);
  assert.match((await upload('b.pdf', bytes, { pages: '{' })).body.error, /not valid JSON/);
  assert.deepEqual(serverPages(Array(2000).fill('')).pages.length, 2000);
});

test('a long PDF counts toward the switched-on budget at what one question sends, not its file size', async t => {
  const { upload } = fixture(t);
  const { bytes, pages } = await pdfOf(312);
  const big = new Uint8Array(20 * 1024 * 1024).fill(32); big.set(bytes); // 20 MB: past the 15 MB a whole set may weigh
  const doc = (await upload('scan-heavy.pdf', big, { pages: JSON.stringify(pages) })).body.document;
  assert.deepEqual([doc.reads, doc.attached], ['pages', true]);
});

test('uploaded paper (PDF to canvas): a 312-page paper is stored with its pages; a question about page 250 reads that page, not the file', async t => {
  const { env } = fixture(t);
  const app = { org: 'team', name: 'canvas-0a1b2c3d', email: 'owner@test' };
  const { bytes, pages } = await pdfOf(312);
  const stored = await putUploadedPaper(env, paperIdentity(app), new File([bytes], 'Textbook.pdf'), JSON.stringify(pages));
  assert.equal(stored.pages, 312);
  const extraBlocks = [], papers = [];
  const read = { uploadedPaperAsDocument: (await import('../src/learn-paper.js')).uploadedPaperAsDocument, readArxivPaper: () => assert.fail('no arXiv') };
  const source = await readLearnSource(env, { message: 'What does this page say about deltas?', paper_context: { id: stored.id, page: DEEP_PAGE } }, app, { extraBlocks, papers, articles: [], foundVideos: [] }, read);
  assert.equal(source.paper.page, DEEP_PAGE);
  assert.equal(pdfBlocks(extraBlocks).length, 0, 'never the whole 312-page file');
  const sent = pageNumbers(extraBlocks[0]);
  assert.ok([DEEP_PAGE - 1, DEEP_PAGE, DEEP_PAGE + 1].every(p => sent.includes(p)) && sent.length < 312, `the page and its neighbours: ${sent}`);
  assert.match(extraBlocks[0].source.data, new RegExp(`the page the learner is on \\(page ${DEEP_PAGE}\\)`));
  // Up to 100 pages the PDF itself rides, as before.
  const short = await putUploadedPaper(env, paperIdentity(app), new File([(await pdfOf(100)).bytes], 'Short.pdf'), JSON.stringify((await pdfOf(100)).pages));
  const blocks = [];
  await readLearnSource(env, { message: 'hi', paper_context: { id: short.id, page: 100 } }, app, { extraBlocks: blocks, papers: [], articles: [], foundVideos: [] }, read);
  assert.equal(pdfBlocks(blocks).length, 1);
  // A long PDF over 5 MB cannot be stored without its pages (an older page): refused with the fix.
  const big = new Uint8Array(6 * 1024 * 1024).fill(32); big.set(bytes.subarray(0, 5));
  await assert.rejects(putUploadedPaper(env, paperIdentity(app), new File([big], 'Big.pdf')), /Reload the page and upload this PDF again/);
  // A short PDF over 5 MB reads by page, decided by its stored size: never base64'd whole.
  const heavy = new Uint8Array(6 * 1024 * 1024).fill(32); heavy.set((await pdfOf(99)).bytes);
  const stout = await putUploadedPaper(env, paperIdentity(app), new File([heavy], 'Heavy.pdf'), JSON.stringify((await pdfOf(99)).pages));
  const got = await read.uploadedPaperAsDocument(env, paperIdentity(app), stout.id, { page: 50 });
  assert.equal(got.document.source.media_type, 'text/plain', 'over 5 MB it reads by page');
});

test('page numbers past 100 are valid wherever a page is named; past 2,000 they are not', () => {
  assert.deepEqual(validPageContext({ paper: { id: 'upload:0123456789ab', page: 312 } }), { kind: 'paper', id: 'upload:0123456789ab', page: 312 });
  assert.throws(() => validPageContext({ paper: { id: 'upload:0123456789ab', page: 2001 } }));
  assert.deepEqual(namedPages('see pages 101-103 and p. 7, page 900', 312), [101, 102, 103, 7]);
  // An arXiv paper is still read whole by the model, so its pages stay within the model's 100.
  assert.throws(() => validateLearnContext({ message: 'q', paper_context: { id: '1506.02640v5', page: 101 } }, 'learn'), /Invalid Learn paper context/);
  assert.doesNotThrow(() => validateLearnContext({ message: 'q', paper_context: { id: 'upload:0123456789ab', page: 312 } }, 'learn'));
});

test('selectPages: the learner\'s page first, then named pages, then word matches, within the budget, in page order', () => {
  const pages = Array.from({ length: 312 }, (_, i) => `Page ${i + 1} filler words ${'lorem '.repeat(200)}`);
  pages[200] += ' entropy entropy'; pages[40] += ' entropy';
  const chosen = selectPages(pages, { query: 'what is entropy? see page 150', page: 120 });
  for (const p of [119, 120, 121, 150, 201, 41]) assert.ok(chosen.pages.includes(p), `page ${p}`);
  assert.deepEqual(chosen.pages, [...chosen.pages].sort((a, b) => a - b));
  assert.ok(chosen.pages.reduce((n, p) => n + pages[p - 1].length, 0) <= SEND_CHARS);
  const one = selectPages(['y'.repeat(SEND_CHARS * 2)], {});
  assert.deepEqual(one, { pages: [1], cut: [1] }, 'a single page longer than the budget is cut, not dropped');
});
