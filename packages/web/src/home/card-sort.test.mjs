import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLORE_SORTS, LIBRARY_SORTS, readLibrarySort, saveLibrarySort, sortCards } from './card-sort.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const rows = [
  { kind: 'canvas', name: 'canvas-0000000a', title: 'beta', created_at: '2026-10-01 00:00:00', updated_at: '2026-10-05 00:00:00.000', fork_count: 2 },
  { kind: 'canvas', name: 'canvas-0000000b', title: 'Alpha', created_at: '2026-10-03 00:00:00', updated_at: '2026-10-03 00:00:00', fork_count: 2 },
  { kind: 'repository', name: 'repo-0000000c', repo: 'karpathy/gamma', created_at: '2026-10-02 00:00:00' },
  { kind: 'canvas', name: 'canvas-0000000d', title: 'Alpha', created_at: '2026-10-03 00:00:00', updated_at: '2026-10-03 00:00:00', fork_count: 0 },
];
const names = (sort) => sortCards(rows, sort).map((r) => r.name.slice(-1));

// Owner 2026-10-06 §18: Last updated (default), Created, Name, Most forked; never Most forked by default.
test('Library sorts: last updated, created, name, most forked - each ending on the canonical name', () => {
  assert.deepEqual(LIBRARY_SORTS.map((s) => s.label), ['Last updated', 'Created', 'Name', 'Most forked']);
  assert.deepEqual(names('updated'), ['a', 'b', 'd', 'c'], 'a project with no updated_at falls back to created_at; a tie goes to the name');
  assert.deepEqual(names('created'), ['b', 'd', 'c', 'a']);
  assert.deepEqual(names('name'), ['b', 'd', 'a', 'c'], 'case-insensitive; a project by its short repository name');
  assert.deepEqual(names('forks'), ['a', 'b', 'd', 'c'], 'a fork tie goes to the last update; no count counts as 0');
  assert.deepEqual(names('nonsense'), names('updated'));
  assert.deepEqual(rows.map((r) => r.name.slice(-1)), ['a', 'b', 'c', 'd'], 'the list itself is never reordered');
});

test('the Library choice is this viewer\'s, kept in this browser, and blocked storage only forgets', () => {
  const s = store();
  assert.equal(readLibrarySort(s, 'o', 'ana@x'), 'updated');
  saveLibrarySort(s, 'o', 'ana@x', 'name');
  assert.equal(readLibrarySort(s, 'o', 'ana@x'), 'name');
  assert.equal(readLibrarySort(s, 'o', 'ben@x'), 'updated', 'another viewer keeps the default');
  assert.equal(readLibrarySort(store({ 'small.library-sort:o:ana@x': 'trending' }), 'o', 'ana@x'), 'updated');
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.equal(readLibrarySort(blocked, 'o', 'ana@x'), 'updated');
  assert.doesNotThrow(() => saveLibrarySort(blocked, 'o', 'ana@x', 'name'));
});

// Owner §17: Explore's order is the server's (learn-boards.js EXPLORE_SORTS), these ids, Newest first - no Trending.
test('Explore offers Newest, Recently updated and Most forked, by the server\'s ids', () => {
  assert.deepEqual(EXPLORE_SORTS.map((s) => [s.id, s.label]), [['newest', 'Newest'], ['updated', 'Recently updated'], ['forks', 'Most forked']]);
});
