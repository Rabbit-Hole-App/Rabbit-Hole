import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELOAD_KEY, RELOAD_WINDOW, reloadOnce } from './chunk-reload.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('a stale chunk reloads the page once; a second failure within the window does not, so it can never loop', () => {
  const s = store();
  assert.equal(reloadOnce(s, 1_000_000), true);
  assert.equal(s.getItem(RELOAD_KEY), '1000000');
  assert.equal(reloadOnce(s, 1_000_000 + 5_000), false); // the reload did not help: show the error instead
  assert.equal(reloadOnce(s, 1_000_000 + RELOAD_WINDOW - 1), false);
  assert.equal(reloadOnce(s, 1_000_000 + RELOAD_WINDOW), true); // a later deploy may reload once again
});

test('without usable session storage it never reloads', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(reloadOnce(broken, 1), false);
  assert.equal(reloadOnce(null, 1), false);
  const readOnly = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(reloadOnce(readOnly, 1), false);
});
