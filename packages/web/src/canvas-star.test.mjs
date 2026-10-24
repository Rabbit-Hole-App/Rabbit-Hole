// The client star action (canvas-star.js): desired state, one request at a time per canvas, the confirmed state after a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { starLabel, starNumber, starSignInUrl, starStore } from './canvas-star.js';

// A server that answers when told to, so a test controls the order in which answers arrive.
function fakeApi(start = { starred: false, count: 0 }) {
  const server = { ...start }, calls = [], waiting = [];
  return {
    calls,
    api: {
      send: (token, starred) => new Promise((resolve, reject) => {
        calls.push(starred);
        waiting.push(() => {
          if (server.fail) return reject(Object.assign(new Error('Could not save'), { status: 500 }));
          if (starred !== server.starred) server.count += starred ? 1 : -1;
          server.starred = starred;
          resolve({ starred_by_me: starred, star_count: server.count });
        });
      }),
      read: async () => ({ starred_by_me: server.starred, star_count: server.count }),
    },
    server,
    answer: async () => { waiting.shift()(); await new Promise(resolve => setImmediate(resolve)); },
  };
}

test('a press asks for the opposite state and shows the server\'s count only once it answers', async () => {
  const f = fakeApi({ starred: false, count: 4 });
  const store = starStore('tok', { starred: false, count: 4 }, f.api);
  const done = store.set(true);
  assert.deepEqual([store.get().saving, store.get().desired, store.get().starred, store.get().count], [true, true, false, 4], 'pending: asked for, not yet confirmed');
  await f.answer(); await done;
  assert.deepEqual([store.get().saving, store.get().starred, store.get().count], [false, true, 5]);
  assert.deepEqual(f.calls, [true]);
});

test('presses while a request is in flight collapse to the last wish and are answered in order', async () => {
  const f = fakeApi({ starred: false, count: 0 });
  const store = starStore('tok', { starred: false, count: 0 }, f.api);
  const first = store.set(true);
  store.set(false); store.set(true); store.set(false); // four presses, one in flight
  await f.answer(); // star answered; the last wish (unstar) is sent next
  assert.deepEqual(f.calls, [true, false]);
  assert.equal(store.get().starred, true, 'the older answer is shown only until the newer one arrives');
  assert.equal(store.get().desired, false);
  await f.answer(); await first;
  assert.deepEqual([store.get().starred, store.get().count, store.get().saving], [false, 0, false]);
});

test('presses that cancel out send nothing more', async () => {
  const f = fakeApi();
  const store = starStore('tok', { starred: false, count: 0 }, f.api);
  const run = store.set(true);
  store.set(false); store.set(true);
  await f.answer(); await run;
  assert.deepEqual(f.calls, [true]);
  assert.equal(store.get().starred, true);
});

test('a failure restores the confirmed state and reports the error once', async () => {
  const f = fakeApi({ starred: true, count: 3 });
  const store = starStore('tok', { starred: true, count: 3 }, f.api);
  f.server.fail = true;
  const run = store.set(false);
  store.set(false); // joins the run in flight
  await f.answer(); await run;
  const state = store.get();
  assert.deepEqual([state.starred, state.desired, state.count, state.saving, state.error?.message], [true, true, 3, false, 'Could not save']);
  f.server.fail = false;
  const retry = store.set(false); // retry is just pressing again
  assert.equal(store.get().error, null);
  await f.answer(); await retry;
  assert.deepEqual([store.get().starred, store.get().count], [false, 2]);
});

test('refresh shows another tab\'s change, but never over a save in flight', async () => {
  const f = fakeApi({ starred: false, count: 1 });
  const store = starStore('tok', { starred: false, count: 1 }, f.api);
  f.server.starred = true; f.server.count = 7; // another tab starred, and others did too
  await store.refresh();
  assert.deepEqual([store.get().starred, store.get().desired, store.get().count], [true, true, 7]);
  const run = store.set(false);
  await store.refresh(); // ignored: the save will bring the newest answer
  assert.equal(store.get().saving, true);
  await f.answer(); await run;
  assert.deepEqual([store.get().starred, store.get().count], [false, 6]);
  f.api.read = async () => { throw new Error('offline'); };
  await store.refresh();
  assert.equal(store.get().count, 6, 'a failed read changes nothing');
});

test('a press that changes nothing sends nothing', async () => {
  const f = fakeApi();
  const store = starStore('tok', { starred: true, count: 2 }, f.api);
  await store.set(true);
  assert.deepEqual(f.calls, []);
  assert.equal(store.get().saving, false);
});

test('counts are compact on screen and exact in the name; zero is shown', () => {
  assert.deepEqual([0, 1, 999, 1000, 1234, 12500].map(starNumber), ['0', '1', '999', '1k', '1.2k', '12.5k']);
  assert.deepEqual([0, 1, 1234].map(starLabel), ['0 stars', '1 star', '1,234 stars']);
});

test('signed out, a press goes to sign-in and returns to this canvas with ?star=1, keeping its other parameters', () => {
  assert.equal(starSignInUrl('/e/abc'), `/login?next=${encodeURIComponent('/e/abc?star=1')}`);
  assert.equal(starSignInUrl('/b/abc', '?x=1&star=0'), `/login?next=${encodeURIComponent('/b/abc?x=1&star=1')}`);
});
