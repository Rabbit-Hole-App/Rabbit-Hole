// Imported files in chat (docs/features/canvas-file-imports.md sections 3 and 6; owner spec section 9). Pure: no React, no
// network, so the control plane imports it too (chat-modes.js, canvases.js, file-context.js) and both sides read one rule.
//
// One canonical identity per attachment: sourceId `file:<source id>@<sha256 of the original>` (the immutable revision) plus a
// range, the scope inside it. sameRef (sourceId + range) is the one de-duplication rule, so a file card selected and then
// added to chat is one ref. The board never carries the file's text: the server reads a bounded excerpt from the source's
// ready text derivative (file-context.js), and every ref is labelled with what was actually read (COVERAGE).
import { family, formatBytes } from './file-capabilities.js';

export const FILE_SOURCE = /^file:(fs_[0-9a-f]{24})@([0-9a-f]{64})$/;
// What a turn says about a file, to the model and in the UI. Never inferred from a preview rendering.
export const COVERAGE = Object.freeze(['listed', 'extracted', 'partial', 'visually inspected', 'transcribed', 'unavailable', 'omitted']);

const int = (v, min) => Number.isInteger(v) && v >= min;
const num = (v, min) => typeof v === 'number' && Number.isFinite(v) && v >= min;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const pair = v => Array.isArray(v) && v.length === 2 && int(v[0], 1) && int(v[1], v[0]);
const CELLS = /^[A-Z]{1,3}[1-9][0-9]{0,6}(:[A-Z]{1,3}[1-9][0-9]{0,6})?$/;

// A file ref's range: null (the whole source) or exactly one scope shape, rebuilt from known keys so nothing else rides.
// Throws on anything else. page (PDF), slide (PPTX), sheet with an optional A1 range (workbook), rows with optional cols
// (CSV/TSV, 1-based inclusive), start/end lines (text, code), cell (notebook cell id), startSec/endSec (media, only when a
// transcript or frame exists), object (a model part).
export function fileRange(range) {
  if (range == null) return null;
  if (typeof range !== 'object' || Array.isArray(range)) throw Error('range must be an object or null');
  switch (Object.keys(range).sort().join()) {
    case 'page': if (int(range.page, 1)) return { page: range.page }; break;
    case 'slide': if (int(range.slide, 1)) return { slide: range.slide }; break;
    case 'sheet': if (str(range.sheet, 120)) return { sheet: range.sheet }; break;
    case 'cells,sheet': if (str(range.sheet, 120) && CELLS.test(range.cells)) return { sheet: range.sheet, cells: range.cells }; break;
    case 'rows': if (pair(range.rows)) return { rows: [...range.rows] }; break;
    case 'cols,rows': if (pair(range.rows) && pair(range.cols)) return { rows: [...range.rows], cols: [...range.cols] }; break;
    case 'end,start': if (int(range.start, 1) && int(range.end, range.start)) return { start: range.start, end: range.end }; break;
    case 'cell': if (str(range.cell, 120)) return { cell: range.cell }; break;
    case 'startSec': if (num(range.startSec, 0)) return { startSec: range.startSec }; break;
    case 'endSec,startSec': if (num(range.startSec, 0) && num(range.endSec, range.startSec)) return { startSec: range.startSec, endSec: range.endSec }; break;
    case 'object': if (str(range.object, 200)) return { object: range.object }; break;
    default: break;
  }
  throw Error('malformed file range');
}
export const validFileRange = range => { try { fileRange(range); return true; } catch { return false; } };

// The scope a card shows, as a ref range: one page, one slide, one sheet; anything else (several pages, a whole document)
// is the whole source.
export function fileScope(view) {
  if (!view || typeof view !== 'object') return null;
  if (Array.isArray(view.pages) && view.pages.length === 1 && int(view.pages[0], 1)) return { page: view.pages[0] };
  if (int(view.slide, 1)) return { slide: view.slide };
  if (str(view.sheet, 120)) return { sheet: view.sheet };
  return null;
}

// A card's chat identity, or null when it has no stored source revision (an upload not finished, an older card without
// fileRef). The same ref for the selection chip and for Add to chat.
export function fileChatRef(block, range = fileScope(block?.fileRef?.view)) {
  // A generated CAD source is retained for parametric edits, not attached wholesale to ordinary Chat.
  if (block?.type === 'cad') return null;
  const ref = block?.fileRef, id = ref?.source?.id, rev = ref?.source?.rev;
  if (!ref || !FILE_SOURCE.test(`file:${id}@${rev}`)) return null;
  let scope = null;
  try { scope = fileRange(range); } catch { scope = null; }
  const name = String(ref.meta?.name || block.label || family(ref.family)?.label || 'File').slice(0, 120);
  return { sourceId: `file:${id}@${rev}`, kind: 'file', name, version: '', range: scope };
}

// What the card itself says it can give an AI turn (fileRef.status.context, set by the lane that extracted it). A preview,
// a poster or a player never makes a file readable.
export function fileCoverage(fileRef) {
  const context = fileRef?.status?.context;
  if (context === 'extracted') return 'extracted';
  if (context === 'partial') return 'partial';
  if (context === 'unavailable') return 'unavailable';
  return 'listed';
}
const SAYS = {
  listed: 'only its name and type are known to Rabbit Hole; its content has not been extracted, so it is not readable',
  extracted: 'its extracted text can be read when the file is attached to the chat',
  partial: 'part of its content was extracted and can be read when the file is attached to the chat',
  unavailable: 'its content could not be read',
};

// Ctrl+K Edit (owner spec section 9): a file card whose family has no semantic editing path (registry can.edit) takes no Edit,
// so a request can never rewrite or replace it as if its content were text. ids: the target's; board: the live lists.
export function fileEditLocked(ids = [], board = null) {
  const blocks = new Map((board?.blocks || []).map(block => [block.id, block]));
  // A PDF excerpt card (pdf-excerpt.js) is the PDF's own words or picture: Explain only, so nothing rewrites the quotation.
  return ids.some(id => { const block = blocks.get(id), fileRef = block?.fileRef; return !!block?.excerpt || (!!fileRef && !family(fileRef.family)?.can?.edit); });
}
export const FILE_EDIT_LOCKED = 'This file has no editing path yet: Edit would replace it, not change its content. Explain works.';

// The selected-card description (learn-ask-target.js describeCanvasObject) of a file card: its name, type and size, and
// what an AI turn can honestly read of it. Never the file's text: that comes only through its attached ref.
export function describeFileCard(block) {
  const ref = block.fileRef, label = family(ref.family)?.label || 'File';
  const name = String(ref.meta?.name || block.label || label);
  const size = Number.isInteger(ref.meta?.size) ? `, ${formatBytes(ref.meta.size)}` : '';
  return { kind: label, title: name, text: `${label} file on the canvas: ${name}${size}. ${SAYS[fileCoverage(ref)]}.`, material: 'file' };
}
