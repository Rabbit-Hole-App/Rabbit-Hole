import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELOAD_KEY, RELOAD_WINDOW, editorClosed, editorOpen, editorOpened, reloadForNewBuild, reloadOnce, retryMayReload, unsavedEdits } from './chunk-reload.js';
import { memoryStorage } from './storage-fallback.js';

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

// Follow-up R3 item 1: a reload is never automatic offline or with an editor open, and Retry's reload waits for every edit.
test('the automatic reload for a new build: online, no editor open, and once per window', () => {
  assert.equal(reloadForNewBuild({ online: false, editing: false, storage: store(), now: 1 }), false, 'offline: the browser would show its network error page');
  assert.equal(reloadForNewBuild({ online: true, editing: true, storage: store(), now: 1 }), false, 'an open canvas: the feature says so in its place');
  const s = store();
  assert.equal(reloadForNewBuild({ online: true, editing: false, storage: s, now: 1_000_000 }), true);
  assert.equal(reloadForNewBuild({ online: true, editing: false, storage: s, now: 1_000_001 }), false, 'never a loop');
});

test('Retry reloads only online with every edit on the server; an editor whose check throws counts as unsaved', () => {
  assert.equal(retryMayReload({ online: true, unsaved: false }), true);
  assert.equal(retryMayReload({ online: false, unsaved: false }), false);
  assert.equal(retryMayReload({ online: true, unsaved: true }), false);
  assert.equal(editorOpen(), false);
  let pending = true;
  editorOpened('/api/learn/boards/a/main', () => pending);
  assert.equal(editorOpen(), true);
  assert.equal(unsavedEdits(), true);
  pending = false;
  assert.equal(unsavedEdits(), false, 'asked each time, never stale');
  editorOpened('/api/learn/boards/b/main', () => { throw new Error('this browser cannot read its copy'); });
  assert.equal(unsavedEdits(), true);
  editorClosed('/api/learn/boards/b/main');
  editorClosed('/api/learn/boards/a/main');
  assert.equal(editorOpen(), false);
  assert.equal(unsavedEdits(), false);
});

// Offline-recovery brief (owner, 2026-10-16), issue 2, check 3: where the browser blocks sessionStorage the page holds it in
// memory (storage-fallback.js), which starts empty on every load. A chunk failing on every load must not reload every time.
test('check 3: repeated page lifetimes with sessionStorage in memory never reload automatically, so they cannot loop', () => {
  let reloads = 0;
  for (let lifetime = 0, now = 1_000_000; lifetime < 5; lifetime += 1, now += 1_000) {
    if (reloadForNewBuild({ online: true, editing: false, storage: memoryStorage(), now })) reloads += 1;
  }
  assert.equal(reloads, 0);
  assert.equal(reloadOnce(memoryStorage(), 1_000_000), false);
  assert.equal(reloadForNewBuild({ online: true, editing: false, storage: store(), now: 1_000_000 }), true, 'persistent session storage still reloads once');
});
