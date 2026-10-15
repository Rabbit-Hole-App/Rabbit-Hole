// A PDF on the canvas and where it came from (docs/features/pdf-to-canvas.md). The source key rides on the block (a PDF
// card's assetKey, a page's pdf): pdf:<paper id> is an uploaded paper (/api/learn/paper, paper_context), doc:<id> a canvas
// context document (/api/learn/context/<id>, a doc ContextRef). The two id kinds use different routes; only this file
// tells them apart.
export function pdfSource(key) {
  const value = String(key || '');
  if (value.startsWith('doc:') && value.length > 4) return { kind: 'doc', id: value.slice(4) };
  if (value.startsWith('pdf:') && value.length > 4) return { kind: 'paper', id: value.slice(4) };
  return null;
}

// The source key of a Sources pane ref that can go on the canvas: a context document, or an uploaded paper. null for anything
// else (an arXiv paper was never uploaded; a .txt or .md is no PDF, which the caller checks).
export function pdfKeyOfRef(ref) {
  const id = String(ref?.sourceId || '');
  if (ref?.kind === 'doc' && id.startsWith('doc:') && id.length > 4) return id;
  if (/^paper:upload:[0-9a-f]{12}$/.test(id)) return `pdf:${id.slice('paper:'.length)}`;
  return null;
}

// Where the stored bytes are read: the context route for a document, the paper route for an upload. `home`, a copied card or
// page's own canvas (its block's home): the server reads that canvas's upload, as this learner only (learn-paper.js
// paperIdentity). A context document needs none; the server finds this learner's own document by its id.
export const paperBytesUrl = (app, id, home = null) => `/api/learn/paper?app=${encodeURIComponent(app)}&id=${encodeURIComponent(id)}${home && home !== app ? `&home=${encodeURIComponent(home)}` : ''}`;
export function pdfBytesUrl(app, key, home = null) {
  const source = pdfSource(key);
  if (!source) return null;
  return source.kind === 'doc' ? `/api/learn/context/${encodeURIComponent(source.id)}?app=${encodeURIComponent(app)}` : paperBytesUrl(app, source.id, home);
}

// The chip for one page (Add to chat, and what a question about it sends), of either source: a context document's ref at that
// page, or an uploaded paper's at that page, with its home canvas when it has one. null for anything that is not a page.
export function pageRef(block) {
  const source = pdfSource(block?.pdf);
  if (!source || !Number.isInteger(block.number)) return null;
  const name = String(block.label || (source.kind === 'doc' ? 'Document' : 'PDF')).slice(0, 120);
  return source.kind === 'doc'
    ? { sourceId: `doc:${source.id}`, kind: 'doc', name, version: '', range: { page: block.number } }
    : { sourceId: `paper:${source.id}`, kind: 'web', name, version: '', range: { page: block.number }, ...(block.home ? { home: block.home } : {}) };
}

// The one chat-context identity of a PDF on the canvas (pdf-materials-refinement.md section 6): a page is its pageRef, a whole
// PDF card its document's ref with no range - the same ref Sources and the canvas-level context attach, so a selection, an Add to
// chat and the canvas's own attachment of one PDF are one entry. Never the filename or the card: two PDFs of one name stay two.
// null for anything else (an arXiv paper card, a PDF with no stored source).
export function pdfRef(block) {
  if (block?.type === 'slide') return pageRef(block);
  const source = block?.type === 'pdf' ? pdfSource(block.assetKey) : null;
  if (!source) return null;
  const name = String(block.label || (source.kind === 'doc' ? 'Document' : 'PDF')).slice(0, 120);
  return source.kind === 'doc'
    ? { sourceId: `doc:${source.id}`, kind: 'doc', name, version: '', range: null }
    : { sourceId: `paper:${source.id}`, kind: 'web', name, version: '', range: null, ...(block.home ? { home: block.home } : {}) };
}

// A page chip in the composer: a context document's or an uploaded paper's ref at one page (pageRef).
const pageChip = ref => Number.isInteger(ref?.range?.page) && (ref.kind === 'doc' || (ref.kind === 'web' && /^paper:upload:/.test(ref.sourceId)));
// A whole uploaded paper (pdfRef of its card): never read by a turn, as only a page is (turnPaper).
const wholePaper = ref => ref?.kind === 'web' && !ref.range && /^paper:upload:/.test(ref.sourceId);

// The uploaded-paper page a turn reads (paper_context): the selected page, else the first uploaded-paper page attached in the
// composer, so a page chip still asks about its page after the selection is cleared. One per turn, as the reader holds one
// paper; a context document's pages all ride as their refs. null when the turn has none.
export function turnPaper(target, refs = []) {
  if (target?.paper) return target.paper;
  const ref = refs.find(entry => pageChip(entry) && entry.kind === 'web');
  return ref ? { id: ref.sourceId.slice('paper:'.length), page: ref.range.page, ...(ref.home ? { home: ref.home } : {}) } : null;
}

// An uploaded-paper chip this turn sends as a label only: its PDF is not the one the turn reads (readId, the paper_context id: the
// selected page's, the open reader's, else turnPaper's). The server tells the model the same (chat-modes.js chatContext).
export const labelOnlyChip = (ref, readId) => (pageChip(ref) || wholePaper(ref)) && ref.kind === 'web' && ref.sourceId !== `paper:${readId}`;

// The one page a journey Tutor turn sends (page_context, learn-tutor-routes.js): a turn about exactly one PDF page, the
// selected page or one page chip. null for none, or for several, which stay on /api/learn/ask, the route that sends them all
// (chat-route.js pageTurn).
const pageOf = ref => (ref.kind === 'doc'
  ? { doc: { id: ref.sourceId.slice('doc:'.length), page: ref.range.page } }
  : { paper: { id: ref.sourceId.slice('paper:'.length), page: ref.range.page, ...(ref.home ? { home: ref.home } : {}) } });
export function tutorPage(target, refs = []) {
  const pages = [];
  const add = page => { if (!pages.some(seen => JSON.stringify(seen) === JSON.stringify(page))) pages.push(page); };
  if (target?.paper) add({ paper: target.paper });
  else if (target?.docPage) add(pageOf(target.docPage));
  for (const ref of refs) if (pageChip(ref)) add(pageOf(ref));
  return pages.length === 1 && (pages[0].doc || /^upload:[0-9a-f]{12}$/.test(pages[0].paper.id)) ? pages[0] : null;
}

// Whether a turn is about a PDF page: a selected page, or a page chip in the composer (pdf-to-canvas.md, chat-route.js).
export const turnHasPage = (target, refs = []) => !!(target?.paper || target?.docPage || refs.some(pageChip));

// The dialog's From/To: inclusive 1-based page positions, 1 ≤ from ≤ to ≤ total. { from, to, count } or { error }.
export function pageRange(from, to, total) {
  const a = Number(from), b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || String(from).trim() === '' || String(to).trim() === '') return { error: 'Enter whole page numbers.' };
  if (a < 1 || b > total) return { error: `Pages run from 1 to ${total}.` };
  if (a > b) return { error: 'From must not be after To.' };
  return { from: a, to: b, count: b - a + 1 };
}
