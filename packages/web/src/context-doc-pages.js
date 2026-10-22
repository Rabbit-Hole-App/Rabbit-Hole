// Long PDFs (PDF-02, docs/features/canvas-context-docs.md "Long PDFs"), browser side: the page text of a PDF, read here with
// pdf.js before it is uploaded (no model call), so a question about a 312-page PDF sends only the pages it needs. The server
// keeps the same limits (control-plane pdf-pages.js; context-doc-pages.test.mjs pins the two). Contract for the Context
// panel: C:/s/spec/pdfctx/contract-pdf-status.md.
import { useSyncExternalStore } from 'react';

export const PDF_UPLOAD_LIMIT = 25 * 1024 * 1024;
export const PDF_PAGE_MAX = 2000;
export const PAGE_TEXT_CHARS = 20000;
export const CUT_MARK = '[page text cut at 20,000 characters]';
export const READ_SECONDS = 120;

// One page's words in reading order: pdf.js text items, a line break where pdf.js ends a line.
const pageText = content => content.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('').trim();

// The text of every page of an open pdf.js document, in order: [string] (an empty string for a page without a text layer).
// onPage(done, total) after each page. A page longer than PAGE_TEXT_CHARS is cut and marked, never dropped. Throws an Error
// naming the limit after READ_SECONDS, or past PDF_PAGE_MAX pages.
export async function readPageTexts(pdf, { onPage = () => {}, seconds = READ_SECONDS } = {}) {
  const total = pdf.numPages;
  if (total > PDF_PAGE_MAX) throw new Error(`That PDF has ${total.toLocaleString('en-US')} pages. A PDF can have at most ${PDF_PAGE_MAX.toLocaleString('en-US')} pages.`);
  const end = Date.now() + seconds * 1000, pages = [];
  for (let n = 1; n <= total; n++) {
    if (Date.now() > end) throw new Error(`Reading the pages stopped after ${seconds} seconds, at page ${n} of ${total}.`);
    const page = await pdf.getPage(n);
    let text = '';
    try { text = pageText(await page.getTextContent()); } finally { page.cleanup(); }
    pages.push(text.length > PAGE_TEXT_CHARS ? `${text.slice(0, PAGE_TEXT_CHARS)}\n${CUT_MARK}` : text);
    onPage(n, total);
  }
  return pages;
}

// What this tab is reading now, per canvas: [{ key, name, done, total, id? }] (contract section 2). One document at a time.
let jobs = [], seq = 0, queue = Promise.resolve();
const listeners = new Set();
const set = next => { jobs = next; listeners.forEach(fn => fn()); };
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const none = [];
const cache = new Map(); // app -> [jobs snapshot, filtered]: a stable array per change, as useSyncExternalStore needs
const forApp = app => {
  const hit = cache.get(app);
  if (hit?.[0] === jobs) return hit[1];
  const mine = jobs.filter(job => job.app === app);
  const value = mine.length ? mine.map(({ app: _app, ...job }) => job) : none;
  cache.set(app, [jobs, value]);
  return value;
};
export const currentProcessing = forApp;
export const useContextProcessing = app => useSyncExternalStore(subscribe, () => forApp(app), () => none);

// Runs work(progress) as this tab's next reading job, shown for `app` as `name` (and `id` on a Retry) until it settles.
export function processing(app, name, id, work) {
  const key = `reading:${++seq}`;
  const update = patch => set(jobs.map(job => (job.key === key ? { ...job, ...patch } : job)));
  set([...jobs, { key, app, name, done: 0, total: null, ...(id ? { id } : {}) }]);
  const run = queue.then(() => work((done, total) => update({ done, total }))).finally(() => set(jobs.filter(job => job.key !== key)));
  queue = run.catch(() => {});
  return run;
}

// Opens a PDF's bytes with pdf.js (loaded on first use, as the reader loads it).
export async function openPdf(bytes) {
  const { getDocument } = await import('./learn-paper-figures.js');
  return getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
}
