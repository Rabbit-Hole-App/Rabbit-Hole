// Long PDFs (PDF-02, docs/features/canvas-context-docs.md "Long PDFs"): a request to the model reads at most 100 PDF pages,
// so a PDF past 100 pages (or past 5 MB) is never sent whole. The uploading browser extracts each page's text with pdf.js
// (deterministic, no model call) and sends it with the upload; it is stored beside the bytes, and a question sends only the
// pages it needs: the page the learner is on, pages the question names, and the pages whose words best match the question.
// Storage, per stored PDF object key K: K.pages is the JSON array of page texts, K.meta a small JSON
// { total, noText } (or { total, error }) that the lists read. No D1 column: a list reads K.meta for its PDFs.

export const WHOLE_PDF_BYTES = 5 * 1024 * 1024; // the most a whole PDF may weigh to ride a request base64'd (learn-paper.js)
export const WHOLE_PDF_PAGES = 100; // Anthropic reads at most 100 PDF pages per request
export const PDF_UPLOAD_LIMIT = 25 * 1024 * 1024; // what a long PDF may weigh: stored and read by the reader, never sent whole
export const PDF_PAGE_MAX = 2000; // pages the browser reads and the server stores the text of
export const PAGE_TEXT_CHARS = 20000; // per page; the browser cuts a longer page and marks the cut (CUT_MARK)
export const INDEX_TEXT_CHARS = 8 * 1024 * 1024; // all pages of one document
export const SEND_CHARS = 32000; // page text one question sends from one document (about 8k tokens)
export const CUT_MARK = '[page text cut at 20,000 characters]';
const ERROR_CHARS = 300;

const mb = bytes => `${bytes / (1024 * 1024)} MB`;
export const wholeOk = (size, total) => size <= WHOLE_PDF_BYTES && (total == null || total <= WHOLE_PDF_PAGES);

// The browser's page texts (a JSON string from a form field, or the parsed array): { pages } or { error } naming the limit.
export function readPageTexts(value) {
  let pages = value;
  if (typeof value === 'string') { try { pages = JSON.parse(value); } catch { return { error: 'The page text is not valid JSON' }; } }
  if (!Array.isArray(pages) || !pages.length || pages.some(p => typeof p !== 'string')) return { error: 'The page text must be a list of strings, one per page' };
  if (pages.length > PDF_PAGE_MAX) return { error: `That PDF has ${pages.length} pages. A PDF can have at most ${PDF_PAGE_MAX.toLocaleString('en-US')} pages.` };
  if (pages.some(p => p.length > PAGE_TEXT_CHARS + CUT_MARK.length + 2)) return { error: `A page's text is longer than ${PAGE_TEXT_CHARS.toLocaleString('en-US')} characters` };
  if (pages.reduce((n, p) => n + p.length, 0) > INDEX_TEXT_CHARS) return { error: `That PDF has more than ${mb(INDEX_TEXT_CHARS)} of text` };
  return { pages };
}

// The browser's reason it could not read the pages, kept short and printable.
export const pagesError = value => String(value ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, ERROR_CHARS) || 'This browser could not read the pages.';

export async function putPageTexts(media, key, pages) {
  await media.put(`${key}.pages`, JSON.stringify(pages), { httpMetadata: { contentType: 'application/json' } });
  await media.put(`${key}.meta`, JSON.stringify({ total: pages.length, noText: pages.filter(p => !p.trim()).length }), { httpMetadata: { contentType: 'application/json' } });
}
export const putPagesError = (media, key, total, error) =>
  media.put(`${key}.meta`, JSON.stringify({ total: Number.isInteger(total) && total > 0 ? total : null, error: pagesError(error) }), { httpMetadata: { contentType: 'application/json' } });

const readJson = async (media, key) => {
  const object = await media.get(key);
  if (!object) return null;
  try { return JSON.parse(await new Response(object.body).text()); } catch { return null; }
};
export const readPageMeta = (media, key) => readJson(media, `${key}.meta`);
export const readPages = (media, key) => readJson(media, `${key}.pages`);

// How a stored PDF of `size` bytes with this meta is read, for the lists (contract C:/s/spec/pdfctx/contract-pdf-status.md):
// { pages, status, reads, noText, error }. No meta: a PDF from before PDF-02, read whole if it is small enough.
export function pdfStatus(size, meta) {
  const total = Number.isInteger(meta?.total) ? meta.total : null;
  const reads = wholeOk(size, total) ? 'whole' : 'pages';
  const indexed = !!meta && !meta.error;
  const failed = reads === 'pages' && !indexed;
  return {
    pages: total, reads, noText: indexed ? meta.noText || 0 : 0,
    status: failed ? 'failed' : 'ready',
    error: !failed ? null : meta?.error
      ? { code: 'pages_failed', message: meta.error }
      : { code: 'pages_unread', message: 'The pages of this PDF have not been read yet. Retry reads them in this browser.' },
  };
}

const STOP = new Set('the and for are but not you all any can had her was one our out has his how its may new now see two who did get him let say she too use what when where which while with this that from they them then than there these those have into about would could should their your will been were also more most some such only other over very just like does each page pages pdf'.split(' '));
const words = text => (String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(w => !STOP.has(w));
// Pages a question names: "page 250", "p. 12", "pp. 101-103", "pages 7 to 9".
export function namedPages(query, total) {
  const out = [];
  for (const m of String(query || '').matchAll(/\b(?:pages?|pp?\.?)\s*(\d{1,4})(?:\s*(?:-|–|to)\s*(\d{1,4}))?/gi)) {
    const from = Number(m[1]), to = Math.min(Number(m[2] || m[1]), from + 4);
    for (let p = from; p <= to; p++) if (p >= 1 && p <= total) out.push(p);
  }
  return out;
}

// The page numbers (1-based, ascending) one question reads within SEND_CHARS, and the ones cut to fit: the learner's page and
// its neighbours first, then pages the question names, then the best word matches (tf-idf), then the first pages.
export function selectPages(pages, { query = '', page = null } = {}) {
  const total = pages.length;
  const order = [];
  const push = p => { if (Number.isInteger(p) && p >= 1 && p <= total && !order.includes(p)) order.push(p); };
  if (page) [page, page + 1, page - 1].forEach(push);
  namedPages(query, total).forEach(push);
  const terms = [...new Set(words(query))];
  if (terms.length) {
    const tokens = pages.map(words);
    const idf = Object.fromEntries(terms.map(t => [t, Math.log(1 + total / (1 + tokens.filter(ws => ws.includes(t)).length))]));
    const scored = tokens.map((ws, i) => {
      let score = 0;
      for (const t of terms) { const tf = ws.filter(w => w === t).length; if (tf) score += (1 + Math.log(tf)) * idf[t]; }
      return [i + 1, score];
    }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    scored.forEach(([p]) => push(p));
  }
  for (let p = 1; p <= total; p++) push(p);
  const chosen = [], cut = [];
  let left = SEND_CHARS;
  for (const p of order) {
    const length = pages[p - 1].length + 20;
    if (length <= left) { chosen.push(p); left -= length; } else if (!chosen.length) { chosen.push(p); cut.push(p); left = 0; }
    if (left < 200) break;
  }
  return { pages: chosen.sort((a, b) => a - b), cut };
}

const list = ns => ns.join(', ');
// The model block for a long PDF: a text document of the chosen pages, saying exactly what was and was not sent.
export function pagesDocument(title, pages, { query, page } = {}) {
  const total = pages.length;
  const chosen = selectPages(pages, { query, page });
  const empty = chosen.pages.filter(p => !pages[p - 1].trim());
  const head = `${title}: a ${total}-page PDF. Only the extracted text of page${chosen.pages.length === 1 ? '' : 's'} ${list(chosen.pages)} of ${total} is included here, chosen for this question${page ? ` and the page the learner is on (page ${page})` : ''}; the other ${total - chosen.pages.length} pages were not sent. The text was extracted without layout, figures or images. Page numbers are the PDF's own page order, starting at 1. If the question needs a page that is not included, say which page the learner should open or ask about.`
    + (empty.length ? ` Page${empty.length === 1 ? '' : 's'} ${list(empty)} ha${empty.length === 1 ? 's' : 've'} no text layer (scanned or images only), so ${empty.length === 1 ? 'its' : 'their'} words are not available.` : '')
    + (chosen.cut.length ? ` Page ${chosen.cut[0]} is cut to fit.` : '');
  const body = chosen.pages.map(p => `--- Page ${p} ---\n${chosen.cut.includes(p) ? pages[p - 1].slice(0, SEND_CHARS) : pages[p - 1]}`).join('\n\n');
  return { type: 'document', title, source: { type: 'text', media_type: 'text/plain', data: `${head}\n\n${body}` } };
}
