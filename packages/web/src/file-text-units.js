// The extracted-text derivative of a source (docs/features/canvas-file-imports.md, kind `text`, application/json), which chat
// citations read: { v: 1, units: [{ loc, text }], complete, limited? }. One unit per natural location, so an answer can cite
// it: a line block of at most LINES_PER_UNIT lines ({ start, end }, 1-based inclusive), a CSV/TSV row range ({ rows: [a, b] }),
// a sheet range ({ sheet, cells: 'A1:E100' }), a notebook cell ({ cell }), a slide ({ slide }), a page ({ page }). Pure; the
// card's parse result goes in. `complete` is false when anything was left out, and `limited` says what.
import { columnName } from './file-table.js';
import { cellText } from './file-workbook.js';

export const LINES_PER_UNIT = 200;
export const ROWS_PER_UNIT = 100;
// The whole derivative's text bound (the converter's text cap, canvas-file-converter.md 1.6).
export const MAX_TEXT_CHARS = 4 * 1024 * 1024;

const n = value => Number(value).toLocaleString('en-US');
// Units are added until the character bound; the first that would pass it ends the list.
function bounded(units, limit) {
  const out = [];
  let used = 0;
  for (const unit of units) {
    if (used + unit.text.length > limit) return { units: out, cut: true };
    out.push(unit); used += unit.text.length;
  }
  return { units: out, cut: false };
}
const body = (units, complete, limited) => ({ v: 1, units, complete, ...(limited ? { limited } : {}) });

// Text, Markdown and code: blocks of LINES_PER_UNIT lines, numbered as the file's own lines (CRLF, LF and CR all end a line).
export function lineUnits(text, { limit = MAX_TEXT_CHARS, lines: per = LINES_PER_UNIT } = {}) {
  const lines = String(text).split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const units = [];
  for (let at = 0; at < lines.length; at += per) units.push({ loc: { start: at + 1, end: Math.min(lines.length, at + per) }, text: lines.slice(at, at + per).join('\n') });
  const { units: kept, cut } = bounded(units, limit);
  return body(kept, !cut, cut ? `lines 1-${kept.at(-1)?.loc.end ?? 0} of ${n(lines.length)}` : null);
}

const rowText = row => row.map(value => cellText(value).replace(/[\t\r\n]+/g, ' ')).join('\t');
// CSV/TSV (file-table.js parseDelimited): row ranges, 1-based with the header as row 1, tab-separated cells.
export function tableUnits({ rows, totalRows, totalCols, cols }, { limit = MAX_TEXT_CHARS, per = ROWS_PER_UNIT } = {}) {
  const units = [];
  for (let at = 0; at < rows.length; at += per) units.push({ loc: { rows: [at + 1, Math.min(rows.length, at + per)] }, text: rows.slice(at, at + per).map(rowText).join('\n') });
  const { units: kept, cut } = bounded(units, limit);
  const last = kept.at(-1)?.loc.rows[1] ?? 0;
  const narrow = totalCols > cols;
  const complete = !cut && last >= totalRows && !narrow;
  return body(kept, complete, complete ? null : `rows 1-${n(last)} of ${n(totalRows)}${narrow ? `, columns A-${columnName(cols - 1)} of ${n(totalCols)}` : ''}`);
}

// A workbook (file-workbook.js readWorkbook): per sheet, ranges of ROWS_PER_UNIT rows as A1 ranges. Formula cells give the
// cached value the file saved, with the formula after it (=C2*2 -> "25 [=C2*2]"), so nothing reads as recalculated here.
export function workbookUnits({ sheets }, { limit = MAX_TEXT_CHARS, per = ROWS_PER_UNIT } = {}) {
  const units = [], gaps = [];
  for (const sheet of sheets) {
    if (sheet.skipped || !sheet.rows?.length) continue;
    const last = columnName(Math.max(0, sheet.cols - 1));
    for (let at = 0; at < sheet.rows.length; at += per) {
      const rows = sheet.rows.slice(at, at + per);
      const text = rows.map(row => row.map(value => (typeof value === 'object' && value?.f ? `${value.v} [${value.f}]` : cellText(value)).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
      units.push({ loc: { sheet: sheet.name, cells: `A${at + 1}:${last}${at + rows.length}` }, text });
    }
    if (sheet.truncatedRows || sheet.truncatedCols) gaps.push(`sheet ${sheet.name}: rows 1-${n(sheet.rows.length)} of ${n(sheet.totalRows)}${sheet.truncatedCols ? `, columns A-${last} of ${n(sheet.totalCols)}` : ''}`);
  }
  const skipped = sheets.filter(sheet => sheet.skipped).map(sheet => sheet.name);
  if (skipped.length) gaps.push(`sheets not read: ${skipped.join(', ')}`);
  const { units: kept, cut } = bounded(units, limit);
  if (cut) gaps.push(`text bound reached after ${kept.length} ranges`);
  return body(kept, !gaps.length, gaps.join('; ') || null);
}

// A presentation (file-office.js readPresentation): one unit per slide, by the deck's own slide number; speaker notes are
// labelled as notes, a hidden slide says so.
export function slideUnits({ slides, count, truncated }, { limit = MAX_TEXT_CHARS } = {}) {
  const units = slides.map(slide => ({ loc: { slide: slide.number }, text: [slide.hidden ? '[Hidden slide]' : '', slide.text, slide.notes ? `Speaker notes: ${slide.notes}` : ''].filter(Boolean).join('\n') }));
  const { units: kept, cut } = bounded(units, limit);
  const complete = !cut && !truncated;
  return body(kept, complete, complete ? null : `slides 1-${kept.at(-1)?.loc.slide ?? 0} of ${n(count)}`);
}

// A Word document (file-docx.js readDocx): its extracted text in line blocks (a .docx has no fixed pages without layout);
// what the preview could not convert rides in `limited`.
export function documentUnits({ text, truncated, skippedImages = 0 }, options = {}) {
  const lines = lineUnits(text, options);
  const gaps = [lines.limited, truncated ? 'the document is longer than the preview' : '', skippedImages ? `${skippedImages} image${skippedImages === 1 ? '' : 's'} not read` : ''].filter(Boolean);
  return body(lines.units, !gaps.length, gaps.join('; ') || null);
}

// A notebook (nbformat 4, learn-file-import.js parseNotebook): one unit per cell, by its id (or its 1-based position when it
// has none). Code cells carry their source and their text outputs; an output the card does not show is named, not dropped.
export function notebookUnits(ipynb, { limit = MAX_TEXT_CHARS } = {}) {
  const units = (ipynb?.cells || []).map((cell, index) => {
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
    const outputs = (cell.outputs || []).map(output => {
      if (output?.output_type === 'stream') return [].concat(output.text ?? '').join('');
      if (output?.output_type === 'error') return `${output.ename}: ${output.evalue}`;
      const text = output?.data?.['text/plain'];
      if (text != null) return [].concat(text).join('');
      return output?.data ? `[output not read: ${Object.keys(output.data).join(', ')}]` : '';
    }).filter(Boolean);
    return { loc: { cell: cell.id || String(index + 1) }, text: [`[${cell.cell_type} cell]`, source, ...(outputs.length ? ['Output:', ...outputs] : [])].join('\n') };
  });
  const { units: kept, cut } = bounded(units, limit);
  return body(kept, !cut, cut ? `cells 1-${kept.length} of ${units.length}` : null);
}
