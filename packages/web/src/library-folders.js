// Library folders (docs/features/library-folders.md, owner 2026-10-09): flat folders in your own Library. Pure, so the rules
// are tested without a browser; LibraryFolders.jsx renders them and App.jsx reads ?d=<folder id> (library-filter.js).

// The canvas's six swatches (AdaptiveCanvas COLORS), the comment pins' palette; the server refuses any other.
export const FOLDER_COLORS = [
  { id: '#37352f', label: 'Ink' },
  { id: '#2383e2', label: 'Blue' },
  { id: '#b42318', label: 'Red' },
  { id: '#1a7f37', label: 'Green' },
  { id: '#f59e0b', label: 'Amber' },
  { id: '#7c3aed', label: 'Purple' },
];
export const NAME_MAX = 60;
// The ink swatch follows the theme, as the canvas's default ink does (AdaptiveCanvas inkAware): near-black on a dark page
// would vanish.
export const folderInk = (color) => (color === '#37352f' ? 'var(--color-ink)' : color);
// A new folder takes the next swatch, starting at blue, so side-by-side folders differ until someone picks.
export const nextColor = (folders) => FOLDER_COLORS[(folders.length + 1) % FOLDER_COLORS.length].id;
// A card dragged onto a folder carries its name under this type; nothing else on the page sets it.
export const DRAG_TYPE = 'application/x-rabbit-hole-library-item';

// What the Library shows: inside a folder, its items; at the top, the items in no folder. A search at the top looks
// everywhere, so a filed card is never lost to it.
export function inView(apps, items, folderId, searching) {
  if (folderId) return apps.filter((a) => items[a.name] === folderId);
  return searching ? apps : apps.filter((a) => !items[a.name]);
}

// "N items": what each folder holds that the Library lists, so a trashed or archived item (kept for Restore) is not counted.
export function folderCounts(apps, items) {
  const counts = {};
  for (const a of apps) if (items[a.name]) counts[items[a.name]] = (counts[items[a.name]] || 0) + 1;
  return counts;
}
export const itemsLabel = (n) => `${n} ${n === 1 ? 'item' : 'items'}`;
export const deleteCopy = (name, n) => ({
  title: `Delete folder '${name}'?`,
  body: n === 0 ? 'It is empty; nothing is deleted.' : `Its ${itemsLabel(n)} ${n === 1 ? 'goes' : 'go'} back to Library; nothing is deleted.`,
});
// A typed name as the server keeps it (control-plane library-folders.js folderName), or null when it would refuse it.
export const cleanName = (value) => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name && name.length <= NAME_MAX ? name : null;
};
