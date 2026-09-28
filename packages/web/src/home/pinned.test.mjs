import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinnedApps, RAIL_W, readPinned, secClosedInit, sidebarEdge, togglePin } from './pinned.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('pins are an ordered, flat list per workspace and person (T02 §2)', () => {
  const s = store();
  assert.deepEqual(readPinned(s, 'gmail-com', 'a@gmail.com'), []);
  togglePin(s, 'gmail-com', 'a@gmail.com', 'repo-1');
  assert.deepEqual(togglePin(s, 'gmail-com', 'a@gmail.com', 'canvas-1a2b3c4d'), ['repo-1', 'canvas-1a2b3c4d']);
  assert.equal(s.getItem('small.pinned:gmail-com:a@gmail.com'), '["repo-1","canvas-1a2b3c4d"]');
  assert.deepEqual(readPinned(s, 'w-team', 'a@gmail.com'), []);
  assert.deepEqual(readPinned(s, 'gmail-com', 'b@gmail.com'), []);
});

test('pinning again unpins and keeps the rest in order', () => {
  const s = store({ 'small.pinned:gmail-com:a@gmail.com': '["a","b","c"]' });
  assert.deepEqual(togglePin(s, 'gmail-com', 'a@gmail.com', 'b'), ['a', 'c']);
  assert.deepEqual(readPinned(s, 'gmail-com', 'a@gmail.com'), ['a', 'c']);
});

test('junk or blocked storage reads as no pins and never throws', () => {
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '{' }), 'o', 'e'), []);
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '{"a":1}' }), 'o', 'e'), []);
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '["a",3,null]' }), 'o', 'e'), ['a']);
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.deepEqual(readPinned(blocked, 'o', 'e'), []);
  assert.deepEqual(togglePin(blocked, 'o', 'e', 'a'), ['a']);
});

test('every change is announced once, so the sidebar re-reads whoever pinned', () => {
  const seen = [];
  globalThis.window = new EventTarget();
  try {
    window.addEventListener('small:pinned', () => seen.push('pinned'));
    togglePin(store(), 'o', 'e', 'a');
  } finally { delete globalThis.window; }
  assert.deepEqual(seen, ['pinned']);
});

test('pinned rows follow pin order; slugs missing from the catalog drop out at render', () => {
  const catalog = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  assert.deepEqual(pinnedApps(['c', 'gone', 'a'], catalog).map((x) => x.name), ['c', 'a']);
  assert.deepEqual(pinnedApps([], catalog), []);
});

test('new preview users start with the APPS sections collapsed; a stored choice wins; live keeps today', () => {
  assert.deepEqual(secClosedInit(null, false), {});
  assert.deepEqual(secClosedInit(null, true), { apps: true, shared: true, private: true });
  assert.deepEqual(secClosedInit('{"apps":false}', true), { apps: false });
  assert.deepEqual(secClosedInit('{"shared":true}', false), { shared: true });
});

test('the Agent Bar edge: live collapsed is 0, preview collapsed is the icon rail, expanded is the width', () => {
  assert.equal(RAIL_W, 52);
  assert.equal(sidebarEdge(true, 260, false), 0);
  assert.equal(sidebarEdge(true, 260, true), 52);
  assert.equal(sidebarEdge(false, 300, true), 300);
  assert.equal(sidebarEdge(false, 300, false), 300);
});
