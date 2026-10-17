// The parsers behind lane 2's cards, one entry point for the worker (file-parse.worker.js) and the main-thread fallback.
// Each library loads only when its format is opened: SheetJS CE for workbooks and presentations (its CFB reads the ZIP),
// mammoth for Word documents. Results are plain data, structured-clone safe; image bytes are transferable.
import { decodeText } from './file-text.js';
import { detectDelimiter, parseDelimited } from './file-table.js';

export async function parseFile(kind, bytes, options = {}) {
  if (kind === 'table') {
    const { text, encoding } = decodeText(bytes, { name: options.name, encoding: options.encoding || null });
    const delimiter = options.delimiter || detectDelimiter(text, options.name || '');
    return { ...parseDelimited(text, { delimiter, maxRows: options.maxRows, maxCols: options.maxCols }), delimiter, encoding };
  }
  if (kind === 'workbook') {
    const [XLSX, { readWorkbook }] = await Promise.all([import('xlsx'), import('./file-workbook.js')]);
    return readWorkbook(XLSX, bytes, options);
  }
  if (kind === 'presentation') {
    const [XLSX, { readPresentation }] = await Promise.all([import('xlsx'), import('./file-office.js')]);
    return readPresentation(XLSX.CFB, bytes, options);
  }
  if (kind === 'document') {
    const [mammoth, { readDocx }] = await Promise.all([import('mammoth'), import('./file-docx.js')]);
    return readDocx(mammoth.default || mammoth, bytes, options);
  }
  throw Error(`Unknown file kind ${kind}`);
}

// What a result can hand over without a copy: the document's image bytes.
export const transferables = result => (result?.images || []).map(image => image.bytes.buffer);
