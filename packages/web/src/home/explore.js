// Explore preview (T02 §11): demo data only, and never a mutating API. What the viewer
// changes stays in this browser under the small.preview: namespace.
export const BANNER = 'Demo data — changes stay in this preview';
export const SAVED_KEY = 'small.preview:explore-saved';
export const DEMO = [
  { id: 'attention', title: 'Attention from scratch', kind: 'Project', blurb: 'From tokens to logits in a small transformer.' },
  { id: 'btree', title: 'Why B-trees stay shallow', kind: 'Canvas', blurb: 'Fan-out, splits, and the height of a tree.' },
  { id: 'fourier', title: 'Reading a Fourier transform', kind: 'Canvas', blurb: 'What each frequency bin is telling you.' },
];

export function readSaved(storage) {
  try {
    const list = JSON.parse(storage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => DEMO.some((d) => d.id === id)) : [];
  } catch { return []; }
}

export function toggleSaved(storage, id) {
  const list = readSaved(storage);
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  try { storage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* the preview forgets on reload */ }
  return next;
}
