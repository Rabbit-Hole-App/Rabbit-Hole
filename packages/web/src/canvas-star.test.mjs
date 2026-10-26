// The client star action (canvas-star.js): desired state, one request at a time per canvas, the confirmed state after a failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerStarApi, sharedStarApi, starLabel, starsApi, starNumber, starSignInUrl, starStore, starredTokens, takeStarReturn } from './canvas-star.js';

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

test('a list of cards returns from sign-in with the card\'s own token, read once and dropped from the address', () => {
  const TOKEN = 'AbCdEfGhIjKlMnOp';
  assert.equal(starSignInUrl('/explore', '?tab=x', TOKEN), `/login?next=${encodeURIComponent(`/explore?tab=x&star=${TOKEN}`)}`);
  const win = { location: { pathname: '/@ana', search: `?tab=stars&star=${TOKEN}` }, history: { replaceState: (_s, _t, url) => { win.location.search = url.slice('/@ana'.length); } } };
  assert.equal(takeStarReturn(win), TOKEN);
  assert.equal(win.location.search, '?tab=stars');
  assert.equal(takeStarReturn(win), null, 'the second read finds nothing');
  assert.equal(takeStarReturn({ location: { pathname: '/e/x', search: '?star=1' }, history: {} }), null, 'the shared page\'s ?star=1 is not a card token');
});

test('the card APIs speak the stars routes: desired state with the surface, the owner route by name, the state route by tokens', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push([init.method || 'GET', url, init.body || null]); return Response.json(url.includes('/stars/state') ? { starred: ['AbCdEfGhIjKlMnOp'] } : { starred_by_me: true, star_count: 3 }); };
  await sharedStarApi('card_explore').send('tok', true);
  await sharedStarApi('card_explore').send('tok', false);
  await ownerStarApi('canvas-0123abcd', 'card_library').send(null, true);
  assert.deepEqual(calls.map(([method, url, body]) => [method, url, body]), [
    ['PUT', '/api/learn/boards/shared/tok/star', '{"surface":"card_explore"}'],
    ['DELETE', '/api/learn/boards/shared/tok/star', '{"surface":"card_explore"}'],
    ['PUT', '/api/apps/canvas-0123abcd/star', '{"surface":"card_library"}'],
  ]);
  assert.deepEqual([...await starredTokens(['AbCdEfGhIjKlMnOp', 'other'])], ['AbCdEfGhIjKlMnOp']);
  assert.deepEqual([...await starredTokens([])], [], 'no tokens, no request');
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual([...await starredTokens(['AbCdEfGhIjKlMnOp'])], [], 'a failed read shows nothing starred');
});

test('opening a canvas from a Stars list reports star.opened without waiting, and a failed report changes nothing', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push([init.method, url, init.body, init.keepalive]); return Response.json({ ok: true }); };
  starsApi.opened({ surface: 'personal_stars', id: 'a'.repeat(32) });
  assert.deepEqual(calls, [['POST', '/api/learn/stars/opened', `{"surface":"personal_stars","id":"${'a'.repeat(32)}"}`, true]]);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.doesNotThrow(() => starsApi.opened({ surface: 'profile_stars', token: 't'.repeat(20) }));
  globalThis.fetch = () => { throw new Error('sync failure'); };
  assert.doesNotThrow(() => starsApi.opened({ surface: 'profile_stars', token: 't'.repeat(20) }));
  await new Promise(resolve => setImmediate(resolve)); // the rejected promise is handled, so nothing is left unhandled
});
