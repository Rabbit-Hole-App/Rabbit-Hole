import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANNER, DEMO, readSaved, SAVED_KEY, toggleSaved } from './explore.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('fixture state lives only under small.preview: and the banner says so (T02 §11)', () => {
  assert.ok(SAVED_KEY.startsWith('small.preview:'));
  assert.equal(BANNER, 'Demo data — changes stay in this preview');
  // No imports at all, so no API client: the preview cannot reach a mutating endpoint.
  assert.doesNotMatch(readFileSync(new URL('./explore.js', import.meta.url), 'utf8'), /^import /m);
});

test('Save toggles a demo item and survives a reload', () => {
  const s = store();
  assert.deepEqual(toggleSaved(s, DEMO[0].id), [DEMO[0].id]);
  assert.deepEqual(readSaved(s), [DEMO[0].id]);
  assert.deepEqual(toggleSaved(s, DEMO[0].id), []);
});

test('junk, unknown ids or blocked storage read as nothing saved', () => {
  assert.deepEqual(readSaved(store({ [SAVED_KEY]: '{' })), []);
  assert.deepEqual(readSaved(store({ [SAVED_KEY]: '["gone","attention"]' })), ['attention']);
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.deepEqual(toggleSaved(blocked, 'btree'), ['btree']);
});
