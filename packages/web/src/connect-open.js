// A canvas Start just opened on a newly connected repository opens the right panel on Chat once (owner 2026-11-19 09:00), so the Tutor's
// "Reading <name>" and then its opening are in view. In memory only: a later visit or a reload is not a connect, so it never opens it again.
export const CONNECTED_EVENT = 'rh-canvas-connected';
const pending = new Set();
export function markConnected(slug) {
  if (!slug) return;
  pending.add(slug);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CONNECTED_EVENT, { detail: slug }));
}
// -> true once for a slug marked by markConnected, false afterwards and for any other slug.
export const takeConnected = slug => pending.delete(slug);
