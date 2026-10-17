// Workbooks on the canvas (.xlsx, .xls; docs/features/canvas-file-imports.md, lane 2), read with SheetJS CE (passed in, so this
// module stays pure and the library loads only when a workbook is opened). Values are the text the saved file shows (its own
// number format applied), so 00123 stays 00123; a formula keeps its text beside the value the saving program cached, and is
// never recalculated here. Macros (bookVBA) and external links are not read or followed. Sheets read at most maxRows rows.
import { PREVIEW_COLS, PREVIEW_ROWS, columnName } from './file-table.js';

// Structure, not the name: an .xlsx is a ZIP (PK\3\4), an .xls an OLE compound file (D0 CF 11 E0) or, rarely, a BIFF stream.
export const isZip = b => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
export const isOle = b => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

// A cell as the card keeps it: a string for plain text or a value with nothing more to say, else
// { v: shown text, t: type, f?: formula text, cached?: false when the formula has no saved result, raw?: the stored value }.
function cellOf(cell) {
  if (!cell) return '';
  const shown = cell.w ?? (cell.v == null ? '' : String(cell.v));
  const formula = cell.f ? `=${cell.f}` : null;
  if (!formula && cell.t === 's') return shown;
  const out = { v: shown, t: cell.t };
  if (formula) { out.f = formula; if (cell.v == null || cell.t === 'z') out.cached = false; }
  if (cell.t === 'n' && cell.v != null && String(cell.v) !== shown) out.raw = String(cell.v);
  if (cell.t === 'e') out.error = true;
  return !formula && !out.raw && !out.error && cell.t !== 'b' ? shown : out;
}

// readWorkbook(XLSX, bytes, { maxRows, maxCols, sheets }) -> { format, sheets: [{ name, hidden, rows, totalRows, totalCols,
// cols, truncatedRows, truncatedCols, formulas }] }. sheets: names to read in full (default all); others list only their names.
export function readWorkbook(XLSX, input, { maxRows = PREVIEW_ROWS, maxCols = PREVIEW_COLS, sheets: wanted = null, name = 'That workbook' } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isZip(bytes) && !isOle(bytes)) throw Error(`${name} is not an Excel workbook (.xlsx or .xls). Add it as a File attachment to keep it as it is.`);
  let book;
  try {
    book = XLSX.read(bytes, { type: 'array', dense: true, cellFormula: true, cellText: true, cellDates: false, cellStyles: false, bookVBA: false, sheetRows: maxRows, WTF: false });
  } catch (error) {
    const reason = /password|encrypt/i.test(error?.message || '') ? 'it is password-protected' : 'it could not be read';
    throw Error(`${name}: ${reason}. Add it as a File attachment to keep it as it is.`);
  }
  if (!book?.SheetNames?.length) throw Error(`${name}: no sheets were found. Add it as a File attachment to keep it as it is.`);
  const format = isZip(bytes) ? 'xlsx' : 'xls';
  const hiddenOf = index => !!book.Workbook?.Sheets?.[index]?.Hidden;
  return {
    format,
    sheets: book.SheetNames.map((sheetName, index) => {
      const sheet = book.Sheets[sheetName];
      if (wanted && !wanted.includes(sheetName)) return { name: sheetName, hidden: hiddenOf(index), skipped: true };
      const ref = sheet?.['!fullref'] || sheet?.['!ref'];
      if (!ref) return { name: sheetName, hidden: hiddenOf(index), rows: [], totalRows: 0, totalCols: 0, cols: 0, truncatedRows: false, truncatedCols: false, formulas: 0 };
      const full = XLSX.utils.decode_range(ref), read = XLSX.utils.decode_range(sheet['!ref'] || ref);
      const data = sheet['!data'] || [];
      const totalRows = full.e.r + 1, totalCols = full.e.c + 1;
      const cols = Math.min(totalCols, maxCols), lastRow = Math.min(read.e.r + 1, maxRows);
      const rows = [];
      let formulas = 0;
      for (let r = 0; r < lastRow; r++) {
        const source = data[r] || [];
        const row = [];
        for (let c = 0; c < cols; c++) { const value = cellOf(source[c]); if (typeof value === 'object' && value.f) formulas++; row.push(value); }
        while (row.length && row[row.length - 1] === '') row.pop();
        rows.push(row);
      }
      return { name: sheetName, hidden: hiddenOf(index), rows, totalRows, totalCols, cols, truncatedRows: totalRows > rows.length, truncatedCols: totalCols > cols, formulas };
    }),
  };
}

// The text of a cell for a table view or an excerpt.
export const cellText = value => (typeof value === 'string' ? value : value?.v ?? '');
// A1 address of a cell (0-based row and column).
export const cellAddress = (row, col) => `${columnName(col)}${row + 1}`;
// What a selected cell says about itself: its address, the value shown, and for a formula its text and whether the value is
// the saved file's cached result. Nothing here recalculates.
export function describeCell(value, row, col) {
  const address = cellAddress(row, col);
  if (typeof value === 'string' || !value) return { address, value: cellText(value), kind: value === '' || value == null ? 'empty' : 'text' };
  if (value.f) return { address, value: value.v, formula: value.f, kind: value.cached === false ? 'formula-no-cache' : 'formula' };
  return { address, value: value.v, raw: value.raw, kind: value.error ? 'error' : value.t === 'n' ? 'number' : value.t === 'b' ? 'boolean' : 'value' };
}
