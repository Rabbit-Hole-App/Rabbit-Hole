// Lane 2's files on the canvas (docs/features/canvas-file-imports.md): CSV/TSV tables, Excel workbooks, Word documents and
// PowerPoint presentations. Pure: which kind a file is, checked against its first bytes before anything parses it, and the card
// block a confirmed import makes. The block keeps the original under its asset key (cached here, saved with the board, the
// path every dropped file takes) and only compact view state; parsed rows, text and images are never written into the board.
import { looksBinary } from './file-text.js';
import { officeKind } from './file-office.js';
import { FAMILIES, family, formatBytes } from './file-capabilities.js';

const MiB = 1024 * 1024;
// The card sizes the canvas gives each kind (resizable).
export const DOC_CARD = { table: { w: 640, h: 420 }, workbook: { w: 680, h: 460 }, document: { w: 560, h: 560 }, presentation: { w: 640, h: 480 }, text: { w: 520, h: 420 }, markdown: { w: 560, h: 480 } };
export const DOC_KINDS = new Set(Object.keys(DOC_CARD));

// The registry's families this importer takes (route 'doc'), and the card kind each makes. A planned family (the .doc, until
// its converter) is still recognised, so its drop is refused with its own reason rather than the generic one.
const KIND_OF_FAMILY = { delimited: 'table', workbook: 'workbook', word: 'document', 'word-legacy': 'document', presentation: 'presentation' };
const extensionOf = name => { const base = String(name || '').split(/[/\\]/).pop().toLowerCase(); return base.includes('.') ? base.split('.').pop() : ''; };
const familyByExtension = name => FAMILIES.find(f => KIND_OF_FAMILY[f.id] && f.extensions.includes(extensionOf(name))) || null;
export const docKind = name => KIND_OF_FAMILY[familyByExtension(name)?.id] || null;
export const docFormat = name => (familyByExtension(name) ? extensionOf(name) : null);
const limitOf = name => familyByExtension(name)?.limits.bytes || family('word').limits.bytes;

const LABEL = { table: 'table', workbook: 'Excel workbook', document: 'Word document', presentation: 'PowerPoint presentation' };
// Before a parser runs: { kind, format } or { error } (a visible line naming the file). `head` is the file's first bytes
// (at least 8 KiB, or the whole file when shorter) plus, for a ZIP, its last 64 KiB, where the part names are listed.
export function checkDocFile({ name, size }, head) {
  const kind = docKind(name), format = docFormat(name);
  if (!kind) return { error: `${name || 'That file'}: not a table, workbook, Word document or presentation` };
  if (!size) return { error: `${name}: the file is empty` };
  if (size > limitOf(name)) return { error: `${name} is ${(size / MiB).toFixed(1)} MiB; files up to ${formatBytes(limitOf(name))} can be added to a canvas` };
  if (kind === 'table') return looksBinary(head) && !(head[0] === 0xff && head[1] === 0xfe) && !(head[0] === 0xfe && head[1] === 0xff)
    ? { error: `${name} looks like a binary file, not ${format.toUpperCase()} text. Add it as a File attachment to keep it as it is.` }
    : { kind, format };
  const found = officeKind(head);
  const expected = { xlsx: ['xlsx'], xls: ['xls', 'xlsx'], docx: ['docx'], doc: ['doc'], pptx: ['pptx'] }[format];
  if (!expected.includes(found)) {
    const actually = { docx: 'a Word document (.docx)', xlsx: 'an Excel workbook (.xlsx)', pptx: 'a PowerPoint presentation (.pptx)', doc: 'a Word 97-2003 document (.doc)', xls: 'an Excel 97-2003 workbook (.xls)', ppt: 'a PowerPoint 97-2003 presentation (.ppt)', xlsb: 'an Excel binary workbook (.xlsb)' }[found];
    return { error: actually ? `${name} is actually ${actually}; rename it to match, or add it as a File attachment.` : `${name} is not a valid ${LABEL[kind]}. Add it as a File attachment to keep it as it is.` };
  }
  // An .xls that is really an .xlsx reads the same (SheetJS reads both); its card says the real format.
  return { kind, format: found === 'xlsx' ? 'xlsx' : format };
}

// The first bytes and, for a large file, its last 64 KiB: enough for checkDocFile without reading the whole file.
export async function fileHead(file) {
  const first = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  if (file.size <= 131072) return new Uint8Array(await file.arrayBuffer());
  const last = new Uint8Array(await file.slice(file.size - 65536).arrayBuffer());
  const out = new Uint8Array(first.length + last.length);
  out.set(first); out.set(last, first.length);
  return out;
}

const fileName = name => String(name || 'file').split(/[/\\]/).pop();
const FAMILY_OF_KIND = { table: 'delimited', workbook: 'workbook', presentation: 'presentation', text: 'text', markdown: 'markdown' };
const familyFor = (kind, format) => (kind === 'document' ? (format === 'doc' ? 'word-legacy' : 'word') : FAMILY_OF_KIND[kind]);
// A new card is a fileRef card (canvas-file-imports.md section 3): source null until its upload is stored, the original cached
// in this browser under fileRef.local meanwhile (file-source-client.js startUpload reads it from there, after a reload too).
// It never has a block assetKey, so it is never also a board file. view mirrors the card's own sheet/slide for chat scope.
function base({ name, size, assetKey, type = '', kind, format, view = {} }) {
  const label = fileName(name);
  return {
    id: crypto.randomUUID(), type: 'file', dx: 0, dy: 0, kind, format, label, size,
    fileRef: { v: 1, source: null, family: familyFor(kind, format), meta: { name: label, type, size, title: label.replace(/\.[^.]+$/, '') }, view, local: assetKey, job: null, status: { preview: 'ready', context: 'none' } },
  };
}
// The fileRef view keys a card's view state maps to (file-chat-ref.js fileScope reads slide and sheet).
export const refView = block => ({ ...(block.sheet ? { sheet: block.sheet } : {}), ...(Number.isInteger(block.slide) ? { slide: block.slide } : {}) });
// A view change (sheet tab, slide) on a card, kept on the block and mirrored into its fileRef.
export const withView = (block, patch) => { const next = { ...block, ...patch }; return next.fileRef ? { ...next, fileRef: { ...next.fileRef, view: refView(next) } } : next; };

// docBlock: one card for a file. view: workbook { sheets, sheet }, presentation { slides: [from, to] | null }.
export function docBlock({ name, size, assetKey, type, kind, format, view = {} }) {
  const block = base({ name, size, assetKey, type, kind, format });
  if (kind === 'workbook') { if (view.sheets?.length) block.sheets = view.sheets; if (view.sheet) block.sheet = view.sheet; }
  if (kind === 'presentation' && view.slides) { block.slides = view.slides; block.slide = view.slides[0]; }
  block.fileRef.view = refView(block);
  return block;
}

// The cards a confirmed workbook or presentation choice makes, in input order: one card, or one per sheet / per slide.
export function docBlocks({ name, size, assetKey, type, kind, format }, choice) {
  if (kind === 'workbook' && choice.mode === 'sheets') return choice.sheets.map(sheet => docBlock({ name, size, assetKey, type, kind, format, view: { sheets: [sheet], sheet } }));
  if (kind === 'workbook') return [docBlock({ name, size, assetKey, type, kind, format, view: { sheets: choice.sheets, sheet: choice.sheets[0] } })];
  if (kind === 'presentation' && choice.mode === 'slides') {
    const out = [];
    for (let n = choice.from; n <= choice.to; n++) out.push(docBlock({ name, size, assetKey, type, kind, format, view: { slides: [n, n] } }));
    return out;
  }
  return [docBlock({ name, size, assetKey, type, kind, format })];
}

// Validated From/To for a slide range (inclusive, 1-based): { from, to } or { error }.
export function slideRange(from, to, count) {
  const a = Number(from), b = Number(to);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return { error: 'Enter whole slide numbers.' };
  if (a < 1 || b > count) return { error: `Slides run from 1 to ${count}.` };
  if (a > b) return { error: 'From must not be after To.' };
  if (b - a + 1 > 50) return { error: 'Choose at most 50 slides at a time.' };
  return { from: a, to: b };
}

// Text and Markdown cards (the Add to canvas dialog's Text card and Markdown card choices).
export const textBlock = ({ name, size, assetKey, type = '', kind }) => base({ name, size, assetKey, type, kind, format: kind === 'markdown' ? 'md' : 'txt' });
