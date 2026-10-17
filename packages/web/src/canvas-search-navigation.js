import { locateQuote, rangeFromOffsets } from './learn-wiki-highlights.js';

// Read only model snapshots, never the budgeted model context. Camera/selection changes do not invalidate this store.
export function createSearchSnapshotStore(read) {
  let revision = 0, snapshot;
  const listeners = new Set();
  const get = () => snapshot ||= { revision, board: read() };
  return { get, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    changed() { revision++; snapshot = null; for (const listener of listeners) listener(); },
    dispose() { listeners.clear(); snapshot = null; } };
}

// Readable framing: a long card's first viewport, not its whole height. The caller supplies the visible surface after panels.
export function searchCamera(box, view, area) {
  const width = Math.max(1, area.right - area.left - 32), height = Math.max(1, area.bottom - area.top - 32);
  const z = Math.max(.6, Math.min(1, view.z || 1, width / Math.max(1, box.w)));
  const shownWidth = Math.min(box.w * z, width), shownHeight = Math.min(box.h * z, height);
  return { x: area.left + 16 + (width - shownWidth) / 2 - box.x * z,
    y: area.top + 16 + (height - shownHeight) / 2 - box.y * z, z };
}
export function searchQuote(text, quote) {
  const value = typeof quote === 'string' ? { exact: quote } : quote;
  if (!value?.exact) return null;
  return locateQuote(text, { prefix: '', suffix: '', ...value });
}
export function searchRange(root, quote) {
  const span = root && searchQuote(root.textContent || '', quote);
  return span ? rangeFromOffsets(root, span.start, span.end) : null;
}

// Scroll just the card's own overflow containers; native scrollIntoView would also scroll the transformed canvas surface.
export function revealSearchRange(root, range, scale = 1) {
  if (!range) return;
  let node = range.startContainer.parentElement;
  while (node && root.contains(node)) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    const hit = range.getBoundingClientRect();
    if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      if (hit.top < rect.top + 12 || hit.bottom > rect.bottom - 12) node.scrollTop += (hit.top - rect.top - rect.height / 2) / scale;
    }
    if (/auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth) {
      if (hit.left < rect.left + 12 || hit.right > rect.right - 12) node.scrollLeft += (hit.left - rect.left - 12) / scale;
    }
    if (node === root) break;
    node = node.parentElement;
  }
}
export function temporarySearchHighlight(element, range) {
  const animation = element?.animate?.([{ outline: '3px solid #d19a22', outlineOffset: '3px' }, { outline: '3px solid transparent', outlineOffset: '3px' }], { duration: 1800 });
  const registry = globalThis.CSS?.highlights;
  const paint = range && registry && typeof Highlight !== 'undefined' ? new Highlight(range) : null;
  if (paint) registry.set('canvas-search-match', paint);
  const clear = () => { animation?.cancel(); if (paint && registry.get('canvas-search-match') === paint) registry.delete('canvas-search-match'); };
  const timer = setTimeout(clear, 2200);
  return () => { clearTimeout(timer); clear(); };
}
