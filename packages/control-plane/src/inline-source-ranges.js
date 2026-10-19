import { fileContext } from './file-context.js';
import { ownerRow } from './learn-boards.js';
import { FILE_SOURCE, fileRange } from '../../web/src/file-chat-ref.js';

const error = (message, status = 400) => Response.json({ error: message, code: 'source_range_unavailable' }, { status, headers: { 'Cache-Control': 'no-store' } });

// Explicit immutable page references only. Never enumerate attached context or
// send a whole PDF in place of an unavailable extracted page.
export async function inlineSourceRanges(req, env, { request, access, board = 'main' }, { loadBoard = ownerRow, read = fileContext } = {}) {
  const ranges = request?.context?.sourceRanges;
  if (ranges === undefined) return { blocks: [], readings: [] };
  if (request?.kind !== 'selection' || request.mode !== 'explain' || request.textRange
    || !Array.isArray(request.targetIds) || !request.targetIds.length
    || !Array.isArray(ranges) || !ranges.length || ranges.length > 4
    || typeof board !== 'string' || !/^[A-Za-z0-9 _.-]{1,100}$/.test(board)
    || board !== (request.context.sourceBoard ?? 'main')) return error('Choose one to four explicit PDF pages in Explain on the frozen board.');
  const keys = new Set();
  for (const entry of ranges) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['targetId', 'sourceId', 'range'].includes(key))
      || typeof entry.targetId !== 'string' || !request.targetIds.includes(entry.targetId)
      || typeof entry.sourceId !== 'string' || !FILE_SOURCE.test(entry.sourceId)
      || !entry.range || Object.keys(entry.range).length !== 1 || !Number.isSafeInteger(entry.range.page) || entry.range.page < 1) return error('Use an exact selected file revision and page number.');
    const key = JSON.stringify([entry.sourceId, entry.range.page]);
    if (keys.has(key)) return error('Select each source page once.');
    keys.add(key);
  }
  let row, state;
  try {
    row = await loadBoard(env, access, access.name, board);
    state = JSON.parse(row?.state_json || 'null');
  } catch { return error('The selected source board is unavailable.', 409); }
  if (!row || !Array.isArray(state?.blocks)) return error('Save the selected source on this board before reading its pages.', 409);
  const refs = [];
  for (const entry of ranges) {
    const found = state.blocks.filter(block => block.id === entry.targetId);
    const block = found.length === 1 ? found[0] : null, ref = block?.fileRef;
    if (!ref || ref.family !== 'pdf' || `file:${ref.source?.id}@${ref.source?.rev}` !== entry.sourceId) return error('The selected PDF source changed or is unavailable.', 409);
    refs.push({ kind: 'file', sourceId: entry.sourceId, range: fileRange(entry.range), name: String(ref.meta?.name || 'Selected PDF').slice(0, 120) });
  }
  let result;
  try { result = await read(req, env, refs, { row }); }
  catch { return error('The selected extracted pages could not be read.', 409); }
  const readings = refs.map((ref, index) => ({ targetId: ranges[index].targetId, sourceId: ref.sourceId, range: ref.range,
    coverage: result.coverage.get(`${ref.sourceId}|${JSON.stringify(ref.range)}`) || 'unavailable' }));
  if (readings.some(value => !['extracted', 'partial'].includes(value.coverage)) || !result.blocks.length)
    return error('One or more selected PDF pages have no accessible extracted text. No whole document was sent.', 409);
  return { blocks: result.blocks.map(text => ({ type: 'text', text })), readings };
}
