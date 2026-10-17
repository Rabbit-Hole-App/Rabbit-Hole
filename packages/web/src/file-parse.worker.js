// The worker that parses lane 2's files off the canvas thread (file-parse.js starts it on the first workbook, table,
// document or presentation a canvas shows). One request, one answer: { id, result } or { id, error, code }.
import { parseFile, transferables } from './file-parse-core.js';

self.onmessage = async ({ data: { id, kind, bytes, options } }) => {
  try {
    const result = await parseFile(kind, bytes, options);
    self.postMessage({ id, result }, transferables(result));
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error), code: error?.code || null });
  }
};
