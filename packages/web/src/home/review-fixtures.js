// REVIEW FIXTURES - Rabbit Hole preview build only (user, 2026-09-28). Made-up cards so the
// source-owner check, fork provenance and fork counts can be judged in a real grid before the
// backend model exists. They live only in this browser's render: never sent to an API, never in
// any database, off unless a preview URL carries ?fixtures=1, and never read by the live build
// (fixturesOn returns false there, and only preview-only pages import this module).
// Field names mirror the future contract: source_owner_verified, forked_from_resource_id,
// forked_from_creator, fork_count (from real fork relationships, not views or copies).
import { useEffect, useState } from 'react';

export const FIXTURES_KEY = 'small.preview:review-fixtures';

export function fixturesOn(storage, search, preview) {
  if (!preview) return false;
  const q = new URLSearchParams(search).get('fixtures');
  try {
    if (q === '1') storage.setItem(FIXTURES_KEY, '1');
    if (q === '0') storage.removeItem(FIXTURES_KEY);
    return storage.getItem(FIXTURES_KEY) === '1';
  } catch { return q === '1'; }
}

// The fixture data, fetched only when on. Vite replaces import.meta.env.VITE_COACHING_DEV with a
// literal, so in the live build this branch is dead and the data chunk is never built.
export function useFixtures(on) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (on && import.meta.env.VITE_COACHING_DEV === 'true') import('./review-fixtures-data.js').then(setData);
  }, [on]);
  return on ? data : null;
}

// WP6 checkpoint 2: the Map's decision, question and session fixtures (map-memory-data.js), behind the
// same switch and literal guard. Memory for this repository, or null (fixtures off, or none for it).
export function useMapMemory(on, repo) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (on && import.meta.env.VITE_COACHING_DEV === 'true') import('./map-memory-data.js').then((m) => setData(m.MEMORY));
  }, [on]);
  return on && data ? data[(repo || '').toLowerCase()] || null : null;
}
