// The creator-analytics collector (publication-analytics.js) on a fake window: nothing before consent, and withdrawal sends nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, isActive, publicationAnalytics, resourceOf } from './publication-analytics.js';
import { CONSENT_KEY, setConsent } from './analytics-consent.js';

const origin = 'https://digrabbithole.com';
test('the source comes from the arrival; a referrer never leaves, and only an approved campaign is sent', () => {
  const of = (referrer, search = '') => classifySource({ referrer, origin, search });
  assert.deepEqual(of('https://www.linkedin.com/feed/?x=1'), { source: 'linkedin' });
  assert.deepEqual(of('https://lnkd.in/abc'), { source: 'linkedin' });
  assert.deepEqual(of('', '?utm_source=LinkedIn&utm_campaign=LinkedIn-Launch'), { source: 'linkedin', campaign: 'linkedin-launch' });
  assert.deepEqual(of(`${origin}/explore?q=x`), { source: 'explore' });
  assert.deepEqual(of(`${origin}/library?view=stars`), { source: 'stars' });
  assert.deepEqual(of(`${origin}/@ana?tab=stars`), { source: 'stars' });
  assert.deepEqual(of(`${origin}/@ana`), { source: 'creator_profile' });
  assert.deepEqual(of(`${origin}/library`), { source: 'direct' });
  assert.deepEqual(of('https://jane.example.com/a/b?secret=1'), { source: 'other_referrer' }, 'the category only, never the host');
  assert.deepEqual(of(''), { source: 'direct' });
  assert.deepEqual(of('not a url'), { source: 'direct' });
  for (const tag of ['jane.doe', 'jane@example.com', 'has%20space']) assert.deepEqual(of('', `?utm_campaign=${tag}`), { source: 'direct' }, tag);
});
test('active: visible and an activity signal within 60 seconds; hidden or idle is not', () => {
  assert.equal(isActive({ visible: true, now: 59_999, lastActivity: 0 }), true);
  assert.equal(isActive({ visible: true, now: 60_000, lastActivity: 0 }), false, 'the threshold');
  assert.equal(isActive({ visible: false, now: 1, lastActivity: 0 }), false, 'a background tab');
});
test('a resource key matches the server boardSources key', () => {
  assert.equal(resourceOf({ type: 'video', videoId: 'abc' }), 'video:abc');
  assert.equal(resourceOf({ type: 'paper', paper: { id: '1706.03762' } }), 'paper:1706.03762');
  assert.equal(resourceOf({ type: 'wiki', title: 'Softmax' }), 'wiki:Softmax');
  assert.equal(resourceOf({ type: 'explanation' }), null);
});

// A window shaped as much as the collector and the consent module read. localStorage may be shared, as between two tabs of one browser.
function storage(entries = []) {
  const held = new Map(entries);
  return { getItem: k => held.get(k) ?? null, setItem: (k, v) => held.set(k, String(v)), removeItem: k => held.delete(k), key: i => [...held.keys()][i] ?? null, get length() { return held.size; }, held };
}
function fakeWindow({ local = storage(), navigator = {}, fetch } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  Object.assign(doc, { referrer: '', visibilityState: 'visible', cookie: '', querySelectorAll: () => [] });
  const sent = { fetches: [], beacons: [], aborted: 0 };
  Object.assign(win, {
    document: doc, localStorage: local, sessionStorage: storage(), location: { origin, search: '', protocol: 'https:' }, Blob,
    navigator: { ...navigator, sendBeacon: (url, blob) => { sent.beacons.push(blob); return true; } },
    fetch: fetch || (async (url, init) => { sent.fetches.push(JSON.parse(init.body)); init.signal?.addEventListener('abort', () => { sent.aborted += 1; }); return new Response('{"accepted":1}', { status: 200 }); }),
  });
  win.sent = sent;
  return win;
}
const typesOf = list => list.flatMap(batch => batch.events.map(e => e.type));
const analyticsKeys = win => [...win.localStorage.held.keys(), ...win.sessionStorage.held.keys()].filter(k => /^(rh-visitor-id|rh-pub:|rh-own-board:|rh_ph_)/.test(k));
const open = (win, t) => { const handle = publicationAnalytics({ token: 'token-1', blocks: [], win }); t.after(() => handle.stop()); return handle; };
const settle = () => new Promise(done => setTimeout(done, 5));

for (const [label, make] of [
  ['before any choice', () => fakeWindow()],
  ['after rejecting', () => fakeWindow({ local: storage([[CONSENT_KEY, 'rejected']]) })],
  ['under Global Privacy Control, even with a saved acceptance', () => fakeWindow({ local: storage([[CONSENT_KEY, 'accepted']]), navigator: { globalPrivacyControl: true } })],
  ['under Do Not Track, even with a saved acceptance', () => fakeWindow({ local: storage([[CONSENT_KEY, 'accepted']]), navigator: { doNotTrack: '1' } })],
]) test(`${label}: no identifier, no storage, nothing sent`, async t => {
  const win = make();
  const handle = open(win, t);
  handle.observe({ blocks: [{ type: 'quiz', id: 'z', choice: 'a' }] });
  handle.stepsShown('s', [{ id: 'x' }]);
  await settle();
  win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(analyticsKeys(win), []);
  assert.deepEqual([win.sent.fetches, win.sent.beacons], [[], []]);
});

test('accepting on this page starts it; rejecting right after discards it and sends nothing more', async t => {
  const win = fakeWindow();
  open(win, t);
  setConsent(win, 'accepted');
  await settle();
  assert.deepEqual(typesOf(win.sent.fetches), ['open']);
  assert.match(win.sent.fetches[0].visitor_id, /^[0-9a-f-]{36}$/);
  assert.match(win.document.cookie, /rh_analytics_consent=accepted/, 'the server has its signal');
  assert.ok(analyticsKeys(win).length >= 2);
  setConsent(win, 'rejected');
  win.dispatchEvent(new Event('pagehide'));
  await settle();
  assert.deepEqual(analyticsKeys(win), [], 'rh-visitor-id and rh-pub:* are gone');
  assert.deepEqual([win.sent.fetches.length, win.sent.beacons.length], [1, 0]);
});

test('withdrawal from another tab: queued events are discarded, the in-flight request is aborted, no retry and no beacon; other storage stays', async t => {
  const local = storage([[CONSENT_KEY, 'accepted'], ['rh_session_draft', 'keep me']]);
  let release;
  const calls = [];
  const win = fakeWindow({ local, fetch: (url, init) => { calls.push(init); return new Promise((_, reject) => { release = reject; init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }); } });
  const handle = open(win, t);
  handle.stepsShown('set-1', [{ id: 'ns_00000000.1' }]);
  assert.equal(calls.length, 1, 'the open is on its way');
  // The other tab withdrew: localStorage changed, then this tab hears about it.
  local.removeItem(CONSENT_KEY);
  win.dispatchEvent(Object.assign(new Event('storage'), { key: CONSENT_KEY }));
  await settle();
  assert.equal(calls[0].signal.aborted, true);
  handle.stepsShown('set-2', [{ id: 'ns_00000000.2' }]);
  win.dispatchEvent(new Event('pagehide'));
  win.document.visibilityState = 'hidden';
  win.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(calls.length, 1, 'no retry');
  assert.deepEqual(win.sent.beacons, [], 'no final beacon');
  assert.deepEqual(analyticsKeys(win), []);
  assert.equal(local.getItem('rh_session_draft'), 'keep me', 'only analytics storage is cleared');
  void release;
});

test('a withdrawal whose storage event has not arrived yet still sends nothing: consent is read again before each send', async t => {
  const local = storage([[CONSENT_KEY, 'accepted']]);
  const win = fakeWindow({ local });
  open(win, t);
  await settle();
  local.removeItem(CONSENT_KEY);
  win.dispatchEvent(new Event('pagehide'));
  await settle();
  assert.deepEqual(win.sent.beacons, []);
});

test('leaving with consent sends the last batch as a beacon once; the server dropping an own visit ends collection for this board on this browser', async t => {
  const win = fakeWindow({ local: storage([[CONSENT_KEY, 'accepted']]) });
  const handle = publicationAnalytics({ token: 'token-1', blocks: [], win });
  await settle();
  handle.stepsShown('s', [{ id: 'ns_00000000.1' }]);
  handle.stop();
  assert.equal(win.sent.beacons.length, 1);
  handle.stop();
  assert.equal(win.sent.beacons.length, 1);
  const mine = fakeWindow({ local: storage([[CONSENT_KEY, 'accepted']]), fetch: async () => new Response('{"accepted":0,"dropped":"own_visit"}', { status: 200 }) });
  open(mine, t);
  await settle();
  assert.equal(mine.localStorage.getItem('rh-own-board:token-1'), '1');
  const again = fakeWindow({ local: mine.localStorage });
  open(again, t);
  await settle();
  assert.deepEqual([again.sent.fetches, again.localStorage.getItem('rh-visitor-id') === mine.localStorage.getItem('rh-visitor-id')], [[], true]);
});
