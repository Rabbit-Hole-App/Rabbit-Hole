// How many 3D/splat viewers hold a live WebGL renderer at once, and which one is interactive (file-imports Lane 4).
// A board with many models stays usable: at most MAX_LIVE viewers render; the least recently used one that is not being
// interacted with gives its slot up (it shows its poster) when another needs one. Only one viewer is interactive at a
// time: entering one ends the other. Pure module state; the card components call it.
export const MAX_LIVE = 3;

const live = new Map(); // id -> { used, release }
let clock = 0, active = null; // active: { id, exit }

// Ask for a renderer slot. `release` is called if the slot is taken back later. Returns true when granted.
export function claimViewer(id, release) {
  if (live.has(id)) { live.get(id).used = ++clock; return true; }
  if (live.size >= MAX_LIVE) {
    const victim = [...live.entries()].filter(([key]) => key !== active?.id).sort((a, b) => a[1].used - b[1].used)[0];
    if (!victim) return false;
    live.delete(victim[0]); victim[1].release();
  }
  live.set(id, { used: ++clock, release });
  return true;
}
export function releaseViewer(id) { live.delete(id); if (active?.id === id) active = null; }
export const isLive = id => live.has(id);
export const liveCount = () => live.size;

// The one interactive viewer. `exit` ends a previous one's interaction.
export function activateViewer(id, exit) {
  if (active && active.id !== id) active.exit();
  active = { id, exit };
  if (live.has(id)) live.get(id).used = ++clock;
}
export function deactivateViewer(id) { if (active?.id === id) active = null; }
export const activeViewer = () => active?.id ?? null;

// Tests only.
export function resetViewers() { live.clear(); active = null; clock = 0; }
