// R5.03 client part: the learner's drag position of the proposal strip. ponytail: Add to chat for a proposal (a `proposal` ContextRef) is deferred; it breaks the
// generation-review contract test and needs the ask-route patch.

// A position is kept per immutable proposal identity and version until it is decided, so it survives re-renders and polls but never leaks onto the next
// proposal. Screen-space offsets from the default overlay position; moving changes no content, version or request.
export function createDragStore() {
  const offsets = new Map();
  const key = p => `${p.proposalId}:${p.version}`;
  return {
    get: p => offsets.get(key(p)) || { dx: 0, dy: 0 },
    set(p, offset) { offsets.set(key(p), { dx: Math.round(offset.dx), dy: Math.round(offset.dy) }); },
    // Keep only the current proposal's entry.
    prune(p) { for (const k of [...offsets.keys()]) if (!p || k !== key(p)) offsets.delete(k); },
  };
}
// The overlay position with the learner's offset, clamped so it stays inside the surface.
export function dragged(position, offset, surface) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { ...position, left: clamp(position.left + offset.dx, surface.left + 8, surface.left + surface.width - position.width - 8), top: clamp(position.top + offset.dy, surface.top + 8, surface.top + surface.height - 60) };
}
