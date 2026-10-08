import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSidebar, recentLaunch, saveSidebar } from './sidebar-nav.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const blocked = () => { throw new Error('SecurityError'); };

test('Recent: the top two catalog items in recent order, never one that is pinned', () => {
  const catalog = Array.from({ length: 8 }, (_, i) => ({ name: `canvas-${i}` }));
  const recent = ['gone', 'canvas-7', 'canvas-1', 'canvas-2', 'canvas-3', 'canvas-4', 'canvas-5', 'canvas-6'];
  assert.deepEqual(recentLaunch(recent, catalog, []).map((a) => a.name), ['canvas-7', 'canvas-1']);
  assert.deepEqual(recentLaunch(recent, catalog, ['canvas-7', 'canvas-1']).map((a) => a.name), ['canvas-2', 'canvas-3']);
  assert.deepEqual(recentLaunch([], catalog, []), []);
});

test('the collapse preference is remembered per browser; blocked storage reads expanded and does not throw', () => {
  const s = store();
  assert.deepEqual(readSidebar(() => s), { collapsed: false, width: 260 });
  saveSidebar('small.sidebar', 'closed', () => s);
  saveSidebar('small.sidebarW', 272, () => s);
  assert.deepEqual(readSidebar(() => s), { collapsed: true, width: 272 });
  saveSidebar('small.sidebar', 'open', () => s);
  assert.equal(readSidebar(() => s).collapsed, false);
  assert.deepEqual(readSidebar(blocked), { collapsed: false, width: 260 });
  assert.doesNotThrow(() => saveSidebar('small.sidebar', 'closed', blocked));
  assert.deepEqual(readSidebar(() => ({ getItem: blocked })), { collapsed: false, width: 260 });
});
