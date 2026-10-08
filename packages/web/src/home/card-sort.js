// The sort choices of the card redesign (owner 2026-10-06 §17-18, docs/features/card-redesign.md). Explore's order is the
// server's (learn-boards.js EXPLORE_SORTS); the Library's is sorted here, over the owner's whole list. Pure.
import { cardModel } from './provenance.js';

export const EXPLORE_SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'forks', label: 'Most forked' },
];
// Most forked is offered, never the default, for a personal Library.
export const LIBRARY_SORTS = [
  { id: 'updated', label: 'Last updated' },
  { id: 'created', label: 'Created' },
  { id: 'name', label: 'Name' },
  { id: 'forks', label: 'Most forked' },
];

// updated_at and created_at share one text form (canvas-metadata.md), so they compare as strings. A project has no
// updated_at and falls back to created_at, as a canvas with no 0009 row does.
const updated = (a) => a.updated_at || a.created_at || '';
const BY = {
  updated: (x, y) => updated(y).localeCompare(updated(x)),
  created: (x, y) => (y.created_at || '').localeCompare(x.created_at || ''),
  name: (x, y) => cardModel(x).title.localeCompare(cardModel(y).title, undefined, { sensitivity: 'base', numeric: true }),
  forks: (x, y) => (y.fork_count || 0) - (x.fork_count || 0) || updated(y).localeCompare(updated(x)),
};
// Every order ends on the canonical name, which is unique, so equal keys never shuffle between renders.
export const sortCards = (list, sort) => [...list].sort((x, y) => (BY[sort] || BY.updated)(x, y) || x.name.localeCompare(y.name));

// Remembered per viewer in this browser only; blocked storage just forgets.
const key = (org, email) => `small.library-sort:${org}:${email}`;
export function readLibrarySort(storage, org, email) {
  try {
    const id = storage.getItem(key(org, email));
    return LIBRARY_SORTS.some((s) => s.id === id) ? id : 'updated';
  } catch { return 'updated'; }
}
export function saveLibrarySort(storage, org, email, id) {
  try { storage.setItem(key(org, email), id); } catch { /* not kept */ }
}

// Explore's two tabs (owner, 2026-10-08): Explainers is the default; the tab rides in the URL (/explore?tab=creators).
export const EXPLORE_TABS = [['explainers', 'Explainers'], ['creators', 'Creators']];
export const exploreTab = (search) => (new URLSearchParams(search).get('tab') === 'creators' ? 'creators' : 'explainers');
