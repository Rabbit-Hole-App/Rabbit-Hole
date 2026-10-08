// The Rabbit Hole sidebar's small rules (docs/features/sidebar-polish.md).
import { recentItems } from './home/continue.js';

// Recent is a launcher, not a second list (owner, 2026-10-06): the top two (owner, 2026-10-08), no View all, and a pinned
// item shows under Pinned only.
export const recentLaunch = (recent, catalog, pins) => recentItems(recent.filter((slug) => !pins.includes(slug)), catalog).slice(0, 2);

// Expanded or collapsed is this browser's UI preference (brief §14), never the account's or a canvas's.
// Storage that throws (blocked site data) reads as the default and keeps nothing.
const local = () => localStorage;
export function readSidebar(storage = local) {
  try {
    const s = storage();
    return { collapsed: s.getItem('small.sidebar') === 'closed', width: +s.getItem('small.sidebarW') || 260 };
  } catch { return { collapsed: false, width: 260 }; }
}
export function saveSidebar(key, value, storage = local) {
  try { storage().setItem(key, String(value)); } catch { /* blocked storage: not kept */ }
}
