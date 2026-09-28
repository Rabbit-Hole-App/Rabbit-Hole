// The Sidebar's device-local lists (T02 §2). Pinned is an ordered, flat list of slugs per
// workspace and person: a canvas is never nested under its project.
const keyOf = (org, email) => `small.pinned:${org}:${email}`;

export function readPinned(storage, org, email) {
  try {
    const list = JSON.parse(storage.getItem(keyOf(org, email)) || '[]');
    return Array.isArray(list) ? list.filter((slug) => typeof slug === 'string') : [];
  } catch { return []; }
}

export function togglePin(storage, org, email, slug) {
  const list = readPinned(storage, org, email);
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
  try { storage.setItem(keyOf(org, email), JSON.stringify(next)); } catch { /* blocked storage: the pin is not kept */ }
  // One event, so the sidebar re-reads whoever pinned (row menu or the Agent Bar's pin command).
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('small:pinned'));
  return next;
}

// Rows in pin order. A slug missing from the catalog drops out here but stays stored,
// so a catalog that is still loading never loses a pin.
export const pinnedApps = (slugs, catalog) => slugs.map((slug) => catalog.find((a) => a.name === slug)).filter(Boolean);

// small.secClosed: new preview users start with Apps, Shared and Private collapsed (T02 §2);
// a stored choice always wins; the live build keeps today's open default.
export const secClosedInit = (stored, preview) => JSON.parse(stored || (preview ? '{"apps":true,"shared":true,"private":true}' : '{}'));

// The Agent Bar's left edge (--sidebar-w). A collapsed preview sidebar keeps its icon rail;
// the live build collapses to nothing, as today.
export const RAIL_W = 52;
export const sidebarEdge = (collapsed, width, preview) => (collapsed ? (preview ? RAIL_W : 0) : width);
