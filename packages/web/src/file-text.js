// Text files on the canvas (docs/features/canvas-file-imports.md, lane 2): bytes in, decoded text out, or a visible reason.
// Pure, so the unit tests read real fixtures with it. Structure decides, not the extension: a byte order mark names UTF-8 or
// UTF-16, otherwise the bytes must decode as strict UTF-8 (or, when the caller asks, Windows-1252); NUL bytes or many control
// characters mean a binary file, which is never shown as text whatever its name says.
const BOMS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be' },
];
// The encodings a text card offers when strict UTF-8 fails (the "supported encoding choice" of the spec).
export const TEXT_ENCODINGS = ['utf-8', 'windows-1252', 'utf-16le', 'utf-16be'];

const startsWith = (bytes, prefix) => prefix.every((b, i) => bytes[i] === b);

// The first bytes look binary: a NUL, or more than 1 in 10 bytes a control character other than tab, CR, LF, FF.
// UTF-16 text is full of NULs, so callers check a UTF-16 byte order mark first.
export function looksBinary(bytes, sample = 8192) {
  const n = Math.min(bytes.length, sample);
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12) control++;
  }
  return n > 0 && control / n > 0.1;
}

// decodeText(bytes, { name, encoding }) -> { text, encoding, bom, newline } or throws Error(visible line).
// encoding: a choice from TEXT_ENCODINGS the learner made after a failed decode; otherwise detected.
export function decodeText(input, { name = 'That file', encoding = null } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bom = BOMS.find(entry => startsWith(bytes, entry.bytes));
  const chosen = encoding || bom?.encoding || 'utf-8';
  const utf16 = chosen.startsWith('utf-16');
  if (!utf16 && looksBinary(bom ? bytes.subarray(bom.bytes.length) : bytes)) {
    throw Error(`${name} looks like a binary file, not text. Add it as a File attachment to keep it as it is.`);
  }
  let text;
  try {
    // ignoreBOM: false strips a matching byte order mark, so the text starts at its first character.
    text = new TextDecoder(chosen, { fatal: !encoding || chosen === 'utf-8' || utf16 }).decode(bytes);
  } catch {
    throw Object.assign(Error(`${name} is not valid ${chosen.toUpperCase()} text. Choose its encoding, or add it as a File attachment.`), { code: 'encoding' });
  }
  if (utf16 && /\u0000/.test(text)) throw Error(`${name} looks like a binary file, not text. Add it as a File attachment to keep it as it is.`);
  return { text, encoding: chosen, bom: !!bom, newline: newlineOf(text) };
}

// The file's line ending, said on the card so a CRLF file is not mistaken for a changed one.
export function newlineOf(text) {
  const sample = text.slice(0, 65536);
  const crlf = (sample.match(/\r\n/g) || []).length;
  const lf = (sample.match(/\n/g) || []).length - crlf;
  const cr = (sample.match(/\r(?!\n)/g) || []).length;
  if (!crlf && !lf && !cr) return 'none';
  if (crlf && !lf && !cr) return 'crlf';
  if (lf && !crlf && !cr) return 'lf';
  if (cr && !crlf && !lf) return 'cr';
  return 'mixed';
}

// Bounded loading: a text card draws its text in chunks of CHUNK characters, cut at a line end when one is near, up to
// PREVIEW_CHARS in all; the rest stays in the stored original (Download) and the card says how much is shown.
export const CHUNK = 64 * 1024;
export const PREVIEW_CHARS = 2 * 1024 * 1024;
export function textChunks(text, limit = PREVIEW_CHARS, size = CHUNK) {
  const end = Math.min(text.length, limit);
  const chunks = [];
  for (let at = 0; at < end;) {
    let to = Math.min(end, at + size);
    if (to < end) { const line = text.lastIndexOf('\n', to); if (line > at + size / 2) to = line + 1; }
    chunks.push(text.slice(at, to));
    at = to;
  }
  return { chunks, shown: end, total: text.length, truncated: end < text.length };
}

// What a chat question about a text card reads: the start of the text, bounded, and how much of it that is.
export const EXCERPT_CHARS = 6000;
export function textExcerpt(text, limit = EXCERPT_CHARS) {
  const cut = text.length > limit;
  return { text: cut ? text.slice(0, limit) : text, coverage: cut ? 'partial' : 'extracted', note: cut ? `first ${limit.toLocaleString('en-US')} of ${text.length.toLocaleString('en-US')} characters` : '' };
}

// A JSON file is a notebook only by its structure (nbformat 4 with a cells array), never by its extension alone.
export function isNotebookJson(text) {
  try {
    const value = JSON.parse(text);
    return !!value && typeof value === 'object' && value.nbformat === 4 && Array.isArray(value.cells);
  } catch { return false; }
}
