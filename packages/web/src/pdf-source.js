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

// Where the stored bytes are read: the context route for a document, the paper route for an upload.
export function pdfBytesUrl(app, key) {
  const source = pdfSource(key);
  if (!source) return null;
  const canvas = encodeURIComponent(app);
  return source.kind === 'doc'
    ? `/api/learn/context/${encodeURIComponent(source.id)}?app=${canvas}`
    : `/api/learn/paper?app=${canvas}&id=${encodeURIComponent(source.id)}`;
}

// The doc ContextRef for one page of a context document: what a question about that page sends (context_refs). null for an
// uploaded paper, whose page rides as paper_context instead.
export function pageRef(block) {
  const source = pdfSource(block?.pdf);
  if (source?.kind !== 'doc' || !Number.isInteger(block.number)) return null;
  return { sourceId: `doc:${source.id}`, kind: 'doc', name: String(block.label || 'Document').slice(0, 120), version: '', range: { page: block.number } };
}

// The dialog's From/To: inclusive 1-based page positions, 1 ≤ from ≤ to ≤ total. { from, to, count } or { error }.
export function pageRange(from, to, total) {
  const a = Number(from), b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || String(from).trim() === '' || String(to).trim() === '') return { error: 'Enter whole page numbers.' };
  if (a < 1 || b > total) return { error: `Pages run from 1 to ${total}.` };
  if (a > b) return { error: 'From must not be after To.' };
  return { from: a, to: b, count: b - a + 1 };
}
