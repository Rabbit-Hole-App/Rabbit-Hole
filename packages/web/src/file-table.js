// CSV and TSV on the canvas (docs/features/canvas-file-imports.md, lane 2). Pure: text in, a bounded table out. Every value
// stays the exact text of its field, so an identifier such as 00123 is never turned into a number and nothing is reformatted.
// RFC 4180 quoting: a quoted field may hold the delimiter, doubled quotes and line breaks; CRLF, LF and CR all end a record.

export const DELIMITERS = [',', '\t', ';', '|'];
export const DELIMITER_NAMES = { ',': 'Comma', '\t': 'Tab', ';': 'Semicolon', '|': 'Pipe' };
// The table card's preview bound: at most PREVIEW_ROWS rows and PREVIEW_COLS columns are kept; the card says how many exist.
export const PREVIEW_ROWS = 10000;
export const PREVIEW_COLS = 200;
const CR = '\r', LF = '\n', QUOTE = '"';

// The delimiter: for .tsv a tab; otherwise the candidate that splits the first lines (outside quotes) into the most
// consistent number of fields greater than one. Ties keep the order of DELIMITERS (comma first).
export function detectDelimiter(text, name = '') {
  if (/\.tsv$/i.test(name)) return '\t';
  const sample = text.slice(0, 32768);
  let best = ',', bestScore = 0;
  for (const delimiter of DELIMITERS) {
    const counts = [];
    let quoted = false, count = 0;
    for (let i = 0; i < sample.length && counts.length < 20; i++) {
      const c = sample[i];
      if (c === QUOTE) quoted = !quoted;
      else if (!quoted && c === delimiter) count++;
      else if (!quoted && (c === LF || c === CR)) { if (c === CR && sample[i + 1] === LF) i++; counts.push(count); count = 0; }
    }
    if (count) counts.push(count);
    const lines = counts.filter(n => n > 0);
    if (!lines.length) continue;
    const often = n => lines.filter(m => m === n).length;
    const mode = [...lines].sort((a, b) => often(b) - often(a))[0];
    const score = (counts.filter(n => n === mode).length / counts.length) * (mode + 1);
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

// parseDelimited(text, { delimiter, maxRows, maxCols }) -> { rows, totalRows, cols, totalCols, truncatedRows, truncatedCols }
// rows: the first maxRows records (header row included) as arrays of strings, each at most maxCols long. totalRows counts
// every record; totalCols is the widest record. A trailing line break does not make an empty last record.
export function parseDelimited(text, { delimiter = ',', maxRows = PREVIEW_ROWS, maxCols = PREVIEW_COLS } = {}) {
  const rows = [];
  const n = text.length;
  let totalRows = 0, totalCols = 0, row = [], width = 0, field = '', quoted = false, started = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const endField = () => { if (width < maxCols) row.push(field); width++; field = ''; started = false; };
  const endRow = () => {
    endField();
    totalCols = Math.max(totalCols, width);
    if (totalRows < maxRows) rows.push(row);
    totalRows++;
    row = []; width = 0;
  };
  while (i < n) {
    if (quoted) {
      const close = text.indexOf(QUOTE, i);
      if (close < 0) { field += text.slice(i); i = n; break; }
      field += text.slice(i, close);
      if (text[close + 1] === QUOTE) { field += QUOTE; i = close + 2; } else { quoted = false; i = close + 1; }
      continue;
    }
    const c = text[i];
    if (c === QUOTE && !started) { quoted = true; started = true; i++; continue; }
    if (c === delimiter) { endField(); i++; continue; }
    if (c === CR || c === LF) { endRow(); i += c === CR && text[i + 1] === LF ? 2 : 1; continue; }
    // An unquoted run up to the next delimiter, quote or line end, taken in one slice; a stray quote inside it is text.
    let j = i + 1;
    while (j < n) { const d = text[j]; if (d === delimiter || d === LF || d === CR || d === QUOTE) break; j++; }
    if (text[j] === QUOTE) j++;
    field += text.slice(i, j); started = true; i = j;
  }
  if (started || width) endRow();
  return { rows, totalRows, cols: Math.min(totalCols, maxCols), totalCols, truncatedRows: totalRows > rows.length, truncatedCols: totalCols > maxCols };
}

// A1 column letters for a 0-based index: 0 -> A, 25 -> Z, 26 -> AA. Citations name cells this way.
export function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// A sheet name in a range: quoted when it holds anything but letters, digits and underscores ('Q1 sales'!A1).
export const quoteSheet = name => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${String(name).replace(/'/g, "''")}'`);

// What a chat question about a table reads: the header and the first rows as tab-separated text, bounded by characters,
// with the rows and columns it covers (1-based, header row 1), so an answer can cite A1:F50 or rows 1-50.
export const EXCERPT_CHARS = 6000;
export function tableExcerpt({ rows, totalRows, totalCols }, { limit = EXCERPT_CHARS, sheet = null } = {}) {
  const lines = [];
  let used = 0, count = 0;
  for (const row of rows) {
    const line = row.map(value => String(value ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t');
    if (used + line.length + 1 > limit && count) break;
    lines.push(line); used += line.length + 1; count++;
  }
  const cols = rows.slice(0, count).reduce((most, row) => Math.max(most, row.length), 0);
  const range = count && cols ? `A1:${columnName(cols - 1)}${count}` : '';
  const whole = count >= totalRows && cols >= totalCols;
  return {
    text: lines.join('\n'),
    range: sheet && range ? `${quoteSheet(sheet)}!${range}` : range,
    rows: [1, count],
    coverage: whole ? 'extracted' : 'partial',
    note: whole ? '' : `rows 1-${count} of ${totalRows.toLocaleString('en-US')}, columns A-${columnName(Math.max(0, cols - 1))} of ${totalCols.toLocaleString('en-US')}`,
  };
}
