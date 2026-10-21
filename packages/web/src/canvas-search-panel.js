export const SEARCH_FILTERS = [['all', 'All'], ['cards', 'Cards'], ['text', 'Text'], ['comments', 'Comments'], ['references', 'References'], ['links', 'Links'], ['code', 'Code'], ['rabbit-holes', 'Rabbit Holes']];

// Compact preview rows (UI-12, owner brief 2026-10-21 message 21 item 1): one column, each row as tall as its layout - a text
// or picture row, a code row by its excerpt's lines, plus the action row when it has one. Heights are fixed per result, so
// the virtual window stays proportional to the viewport, not the board.
export const ROW = { base: 92, line: 16, code: 14, snippet: 34, notice: 12, actions: 38 };
export function searchRowHeight(result) {
  const lines = result.preview?.kind === 'code' ? result.preview.lines?.length || 0 : 0;
  const actions = !!(result.link || result.references?.length || result.rabbitHoles?.length);
  const notice = result.availability?.status !== 'ready' && !!result.availability?.message;
  return ROW.base + (lines ? lines * ROW.line + ROW.code - ROW.snippet : 0) + (notice ? ROW.notice : 0) + (actions ? ROW.actions : 0);
}
export function searchWindow({ heights, height = 400, scrollTop = 0 }) {
  const offsets = new Array(heights.length);
  let total = 0;
  for (let i = 0; i < heights.length; i++) { offsets[i] = total; total += heights[i]; }
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, total - height)));
  // The first row ending below the top, and the first starting below the bottom; two rows of overscan either side.
  const find = y => { let lo = 0, hi = heights.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid] + heights[mid] <= y) lo = mid + 1; else hi = mid; } return lo; };
  const start = Math.max(0, find(top) - 2), end = Math.min(heights.length, find(top + height) + 3);
  return { offsets, totalHeight: total, start, end, scrollTop: top };
}
export function searchKeyIndex(key, index, count) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return null;
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return Math.max(0, Math.min(count - 1, index + (key === 'ArrowDown' ? 1 : -1)));
}
// The matched text in a line as pieces ({ t, color, dark, hit }), keeping each colour run: every case-insensitive
// occurrence of the hit is marked, as the snippet marks its match.
export function markRuns(runs, hit) {
  const line = runs.map(run => run.t).join(''), ranges = [];
  const needle = String(hit || '').toLowerCase(), hay = line.toLowerCase();
  for (let at = needle ? hay.indexOf(needle) : -1; at >= 0; at = hay.indexOf(needle, at + needle.length)) ranges.push([at, at + needle.length]);
  const pieces = [];
  let offset = 0;
  for (const run of runs) {
    const cuts = new Set([0, run.t.length]);
    for (const [a, b] of ranges) for (const edge of [a - offset, b - offset]) if (edge > 0 && edge < run.t.length) cuts.add(edge);
    const sorted = [...cuts].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++) {
      const text = run.t.slice(sorted[i - 1], sorted[i]), at = offset + sorted[i - 1];
      if (text) pieces.push({ ...run, t: text, hit: ranges.some(([a, b]) => at >= a && at < b) });
    }
    offset += run.t.length;
  }
  return pieces;
}
// shiki's runs (code-lang.js colorRuns) split back into lines, as CodeCard splits them; null while plain.
export function lineRuns(runs) {
  if (!runs) return null;
  const out = [[]];
  for (const run of runs) run.t === '\n' ? out.push([]) : out[out.length - 1].push(run);
  return out;
}
export function searchEmptyMessage(state, query, filter) {
  if (state === 'loading') return 'Loading searchable content…';
  if (state === 'error') return 'Some content could not be loaded. Try again.';
  if (state === 'partial') return 'No matches in the available content.';
  if (query.trim()) return 'No matches on this canvas.';
  if (filter === 'links') return 'No links to or from this canvas yet.';
  const label = SEARCH_FILTERS.find(([id]) => id === filter)?.[1] || 'objects';
  return filter === 'all' ? 'No searchable objects on this canvas yet.' : `No ${label} on this canvas yet.`;
}
export function searchLocation(location) {
  if (!location) return '';
  if (typeof location === 'string') return location;
  if (location.blockId) return 'Document';
  if (location.page != null) return `Page ${location.page}`;
  if (location.slide != null) return `Slide ${location.slide}`;
  if (location.start != null) return `${location.path ? `${location.path} ? ` : ''}Line ${location.start}${location.end > location.start ? `?${location.end}` : ''}`;
  if (location.path) return location.path;
  return [location.sheet, location.cells || location.rows || location.cell].filter(Boolean).join(' · ');
}
