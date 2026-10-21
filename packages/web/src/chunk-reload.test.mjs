import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELOAD_KEY, RELOAD_WINDOW, chunkGone, draftsPending, editorClosed, editorOpen, editorOpened, failedChunkUrl, moduleLoadFailed, reloadForNewBuild, reloadOnce, retryMayReload, unsavedEdits, updateReloadBlock, workDurable } from './chunk-reload.js';
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

// The CAD viewer's fallback (owner clarification 8): the production failure, in the browser's words.
const PROD = 'Failed to fetch dynamically imported module: https://digrabbithole.com/static/model-loaders-Us51Gwzk.js';

test("a failed dynamic import is recognised in each browser's words; other viewer errors are not", () => {
  for (const message of [PROD, 'Importing a module script failed.', 'error loading dynamically imported module: https://x/static/a.js', 'Unable to preload CSS for /static/a.css'])
    assert.equal(moduleLoadFailed(new TypeError(message)), true, message);
  assert.equal(moduleLoadFailed(PROD), true); // the renderer reports a message string
  for (const message of ['Model download failed (404)', 'Preview exceeds the 20 MB viewer limit.', '']) assert.equal(moduleLoadFailed(message), false);
  assert.equal(moduleLoadFailed(null), false);
});

test("the failed chunk is named only when it is one of this origin's built chunks", () => {
  assert.equal(failedChunkUrl(PROD, 'https://digrabbithole.com'), 'https://digrabbithole.com/static/model-loaders-Us51Gwzk.js');
  assert.equal(failedChunkUrl(PROD, 'https://preview.digrabbithole.com'), null);
  assert.equal(failedChunkUrl('Failed to fetch dynamically imported module: https://digrabbithole.com/api/x.js', 'https://digrabbithole.com'), null);
  assert.equal(failedChunkUrl('Importing a module script failed.', 'https://digrabbithole.com'), null); // Safari names no URL
});

test('a stale build is a 404 for that chunk now; offline, other statuses and no URL are not proof', async () => {
  const calls = [];
  const answer = status => async (url, init) => { calls.push([url, init]); return { status }; };
  assert.equal(await chunkGone('https://x/static/a.js', answer(404)), true);
  assert.deepEqual(calls[0][1], { method: 'HEAD', cache: 'no-store' });
  assert.equal(await chunkGone('https://x/static/a.js', answer(200)), false); // still there: a blip, Retry
  assert.equal(await chunkGone('https://x/static/a.js', answer(503)), false);
  assert.equal(await chunkGone('https://x/static/a.js', async () => { throw new TypeError('Failed to fetch'); }), false);
  assert.equal(await chunkGone(null, answer(404)), false);
});

test('Reload to update is blocked offline, without confirmed durable work, with a typed draft, or with memory-only storage', () => {
  const ok = { online: true, durable: true, drafts: false, storage: store() };
  assert.equal(updateReloadBlock(ok), null);
  assert.equal(updateReloadBlock({ ...ok, online: false }), 'offline');
  assert.equal(updateReloadBlock({ ...ok, durable: false }), 'unsaved');
  assert.equal(updateReloadBlock({ ...ok, drafts: true }), 'draft');
  assert.equal(updateReloadBlock({ ...ok, storage: memoryStorage() }), 'storage');
  assert.equal(updateReloadBlock({ ...ok, storage: null }), 'storage');
  assert.equal(draftsPending([{ value: '' }, { value: '  ' }]), false);
  assert.equal(draftsPending([{ value: '' }, { value: 'Make it 6 mm' }]), true);
});

test('work is durable only when every open editor confirms it; one that cannot say, or throws, blocks the reload', () => {
  assert.equal(workDurable(), true); // no editor open: nothing to lose
  editorOpened('/b/one', () => false, () => true);
  assert.equal(workDurable(), true);
  editorOpened('/b/two', () => false); // nothing unsaved, but no durability answer
  assert.equal(workDurable(), false);
  editorOpened('/b/two', () => false, () => { throw new Error('unreadable'); });
  assert.equal(workDurable(), false);
  editorOpened('/b/two', () => false, () => true);
  assert.equal(workDurable(), true);
  editorClosed('/b/one'); editorClosed('/b/two');
});
