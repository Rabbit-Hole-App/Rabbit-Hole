import { test } from 'node:test';
import assert from 'node:assert/strict';

// Follow-up R3 item 3: blocked storage, where reading window.localStorage itself throws, gets an in-memory store for the page.
const load = () => import(`./storage-fallback.js?run=${Math.random()}`);
const blocked = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };

test('a store whose read throws is replaced by one in memory before any other module reads it', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    const session = { getItem: () => null };
    globalThis.window = {};
    Object.defineProperty(globalThis.window, 'localStorage', { configurable: true, get: blocked });
    Object.defineProperty(globalThis.window, 'sessionStorage', { configurable: true, value: session });
    const { blockedStorage } = await load();
    assert.deepEqual(blockedStorage, ['localStorage']);
    assert.equal(window.sessionStorage, session, 'a readable store is left alone');
    const store = window.localStorage;
    assert.equal(store.getItem('small.theme'), null);
    store.setItem('small.theme', 'dark');
    assert.equal(store.getItem('small.theme'), 'dark');
    assert.equal(store.length, 1);
    assert.equal(store.key(0), 'small.theme');
    store.removeItem('small.theme');
    assert.equal(store.getItem('small.theme'), null);
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
  }
});

test('readable storage is never replaced', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    const local = { getItem: () => null }, session = { getItem: () => null };
    globalThis.window = { localStorage: local, sessionStorage: session };
    const { blockedStorage } = await load();
    assert.deepEqual(blockedStorage, []);
    assert.equal(window.localStorage, local);
    assert.equal(window.sessionStorage, session);
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
  }
});
