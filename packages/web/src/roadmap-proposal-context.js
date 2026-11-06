// R5.03 client parts: the exact ContextRef a proposal attaches to Chat, and the learner's drag position of the proposal strip.
// The ref carries identity only (sourceId and version); the server reads the description from the actor's own proposal row (roadmap-proposal-context.js),
// so nothing the browser says about the proposal's text is trusted. Attaching never sends and never accepts.
export const proposalContextRef = proposal => (proposal?.id ? { kind: 'proposal', sourceId: `proposal:${proposal.id}`, name: String(proposal.title || 'Proposal').slice(0, 120), version: String(proposal.version), range: null } : null);

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
