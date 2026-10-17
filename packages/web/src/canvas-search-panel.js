export const SEARCH_FILTERS = [['all', 'All'], ['cards', 'Cards'], ['text', 'Text'], ['comments', 'Comments'], ['references', 'References'], ['code', 'Code'], ['rabbit-holes', 'Rabbit Holes']];

// Fixed-height rows make scroll work proportional to the viewport, not board size.
export function searchWindow({ count, width = 320, height = 400, scrollTop = 0, rows = false }) {
  const columns = !rows && width >= 340 ? 2 : 1;
  const rowHeight = rows ? 164 : Math.floor((width - (columns - 1) * 8) / columns) + 164;
  const totalHeight = Math.ceil(count / columns) * rowHeight;
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - height)));
  const start = Math.max(0, Math.floor(top / rowHeight) - 2) * columns;
  const end = Math.min(count, (Math.ceil((top + height) / rowHeight) + 2) * columns);
  return { columns, rowHeight, totalHeight, start, end, scrollTop: top };
}
export function searchKeyIndex(key, index, count, columns) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return null;
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return Math.max(0, Math.min(count - 1, index + ({ ArrowDown: columns, ArrowUp: -columns, ArrowLeft: -1, ArrowRight: 1 }[key])));
}
export function searchEmptyMessage(state, query, filter) {
  if (state === 'loading') return 'Loading searchable content…';
  if (state === 'error') return 'Some content could not be loaded. Try again.';
  if (state === 'partial') return 'No matches in the available content.';
  if (query.trim()) return 'No matches on this canvas.';
  const label = SEARCH_FILTERS.find(([id]) => id === filter)?.[1] || 'objects';
  return filter === 'all' ? 'No searchable objects on this canvas yet.' : `No ${label} on this canvas yet.`;
}
export function searchLocation(location) {
  if (!location) return '';
  if (typeof location === 'string') return location;
  if (location.blockId) return 'Document';
  if (location.page != null) return `Page ${location.page}`;
  if (location.slide != null) return `Slide ${location.slide}`;
  return [location.sheet, location.cells || location.rows || location.cell].filter(Boolean).join(' · ');
}
