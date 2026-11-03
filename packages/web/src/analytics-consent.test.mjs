import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, getRandomValues } from 'node:crypto';
import { CONSENT_EVENT, CONSENT_KEY, allowed, clearAnalyticsStorage, consentOf, configured, setConsent } from './analytics-consent.js';
import { createAnalytics, currentAnalytics, installUsageAnalytics, resetUsageAnalyticsForTests, track } from './usage-analytics.js';

const CONFIG = { token: 'phc_testtoken0000000000000000000000000000000000', host: 'https://us.i.posthog.com', env: 'production' };
const ME = 'dda2350771a4066e3080c605ba092e0a';
const random = { randomUUID, getRandomValues: a => getRandomValues(a) };

// One browser's shared storage and cookie jar; every read is logged, to prove nothing reads an identifier before acceptance.
function browser(seed = {}) {
  const data = new Map(Object.entries(seed)), reads = [];
  const localStorage = {
    getItem: k => { reads.push(k); return data.has(k) ? data.get(k) : null; }, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k),
    get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
  };
  const cookies = [];
  const tab = (pathname = '/apps', navigator = {}) => {
    const target = new EventTarget(), sent = [], signals = [];
    const doc = new EventTarget();
    doc.visibilityState = 'visible'; doc.referrer = ''; doc.hasFocus = () => true;
    Object.defineProperty(doc, 'cookie', { set: value => cookies.push(value), get: () => cookies.at(-1) || '' });
    Object.assign(target, { localStorage, document: doc, navigator, crypto: random, location: { origin: 'https://digrabbithole.com', host: 'digrabbithole.com', pathname, protocol: 'https:' },
      setInterval: () => 1, clearInterval() {},
      fetch: async (url, init) => { signals.push(init.signal); sent.push(JSON.parse(init.body)); if (target.hold) await target.hold; return { status: 200 }; } });
    return { target, sent, signals, events: () => sent.flatMap(b => b.batch) };
  };
  return { data, reads, cookies, tab, analyticsKeys: () => [...data.keys()].filter(k => k.startsWith('rh_ph_')) };
}
const withdraw = target => setConsent(target, 'rejected');
test.afterEach(() => resetUsageAnalyticsForTests());

test('first visit: no choice means nothing is created, read, queued or sent, and pre-consent activity is never uploaded later', async () => {
  const b = browser({ 'learn-draft': 'keep' }), t = b.tab();
  const a = installUsageAnalytics(t.target, CONFIG, { account: true });
  assert.equal(a.enabled, false);
  assert.equal(track('rh_tutor_used'), false);
  t.target.dispatchEvent(new Event('pointerdown'));
  t.target.dispatchEvent(new Event('pagehide'));
  await a.flush();
  assert.deepEqual(t.sent, []);
  assert.deepEqual(b.analyticsKeys(), []);
  assert.ok(!b.reads.some(k => k.startsWith('rh_ph_')), `read ${b.reads}`);
  // Acceptance starts from now: only this page's view, nothing from before it.
  setConsent(t.target, 'accepted');
  assert.equal(consentOf(t.target), 'accepted');
  assert.match(b.cookies.at(-1), /^rh_analytics_consent=accepted; Path=\/; SameSite=Lax; Max-Age=31536000; Secure$/);
  await currentAnalytics().flush();
  assert.deepEqual(t.events().map(e => e.event), ['$pageview']);
  assert.equal(b.data.get('learn-draft'), 'keep');
});

test('rejection is remembered across a reload, keeps the app\'s own storage, and collects nothing', async () => {
  const b = browser({ 'learn-draft': 'keep', small_workspace: 'w' }), t = b.tab();
  installUsageAnalytics(t.target, CONFIG);
  withdraw(t.target);
  assert.equal(b.data.get(CONSENT_KEY), 'rejected');
  resetUsageAnalyticsForTests();
  const reload = b.tab();
  const a = installUsageAnalytics(reload.target, CONFIG, { account: true });
  assert.equal(a.enabled, false);
  assert.equal(track('rh_canvas_opened'), false);
  await a.flush();
  assert.deepEqual(reload.sent, []);
  assert.deepEqual(b.analyticsKeys(), []);
  assert.deepEqual([b.data.get('learn-draft'), b.data.get('small_workspace')], ['keep', 'w']);
  assert.match(b.cookies.at(-1), /Max-Age=0/, 'the cookie the server reads is gone');
});

test('acceptance is remembered across a reload, under the same identifier', async () => {
  const b = browser(), t = b.tab();
  installUsageAnalytics(t.target, CONFIG);
  setConsent(t.target, 'accepted');
  await currentAnalytics().flush();
  resetUsageAnalyticsForTests();
  const reload = b.tab();
  assert.equal(installUsageAnalytics(reload.target, CONFIG).enabled, true);
  await currentAnalytics().flush();
  assert.equal(reload.events()[0].properties.distinct_id, t.events()[0].properties.distinct_id);
});

test('withdrawal stops collection: queued and accrued data is dropped, a send in flight is aborted, no retry, identifiers removed, other storage kept', async () => {
  const b = browser({ [CONSENT_KEY]: 'accepted', 'learn-draft': 'keep' }), t = b.tab();
  const a = installUsageAnalytics(t.target, CONFIG);
  a.identify(ME);
  let release; t.target.hold = new Promise(resolve => { release = resolve; });
  const inFlight = a.flush();
  await Promise.resolve();
  assert.equal(t.signals.length, 1);
  a.track('rh_tutor_used');          // queued, not yet sent
  a.input();                         // and time accruing
  assert.ok(b.analyticsKeys().length > 0);
  withdraw(t.target);
  assert.equal(t.signals[0].aborted, true, 'the send in flight is aborted');
  assert.equal(currentAnalytics(), null);
  release(); await inFlight;
  const sends = t.sent.length;
  await a.flush(); a.hide(); a.tick(); a.track('rh_tutor_used');
  t.target.dispatchEvent(new Event('pagehide'));
  await a.flush();
  assert.equal(t.sent.length, sends, 'nothing more is sent');
  assert.equal(a.stats().queued, 0);
  assert.deepEqual(b.analyticsKeys(), []);
  assert.equal(b.data.get('learn-draft'), 'keep');
  assert.match(b.cookies.at(-1), /Max-Age=0/);
});

test('another open tab: a withdrawal there stops this tab at once, even before its storage event, and its identifiers stay gone', async () => {
  const b = browser({ [CONSENT_KEY]: 'accepted' });
  const here = b.tab(), there = b.tab('/library');
  const a = installUsageAnalytics(here.target, CONFIG);
  const other = createAnalytics(there.target, { ...CONFIG, random, schedule: () => 0 });
  a.track('rh_tutor_used');
  withdraw(there.target);            // no event has reached this tab yet
  assert.equal(a.track('rh_tutor_used'), false);
  await a.flush(); await other.flush();
  assert.deepEqual(here.sent, []);
  here.target.dispatchEvent(Object.assign(new Event('storage'), { key: CONSENT_KEY }));
  assert.equal(currentAnalytics(), null);
  assert.deepEqual(b.analyticsKeys(), []);
  // Accepting in the other tab starts this one, with no reload.
  b.data.set(CONSENT_KEY, 'accepted');
  here.target.dispatchEvent(Object.assign(new Event('storage'), { key: CONSENT_KEY }));
  assert.equal(currentAnalytics()?.enabled, true);
});

test('Do Not Track and Global Privacy Control stay effective over a saved acceptance; missing or unreadable consent stays off', async () => {
  for (const navigator of [{ globalPrivacyControl: true }, { doNotTrack: '1' }]) {
    const b = browser({ [CONSENT_KEY]: 'accepted' }), t = b.tab('/apps', navigator);
    const a = installUsageAnalytics(t.target, CONFIG, { account: true });
    assert.equal(a.enabled, false);
    await a.flush();
    assert.deepEqual(t.sent, []);
    assert.deepEqual(b.analyticsKeys(), []);
    assert.match(b.cookies.at(-1), /Max-Age=0/, 'and the server is told nothing');
    assert.equal(allowed(t.target, CONFIG), false);
    resetUsageAnalyticsForTests();
  }
  const broken = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, navigator: {} };
  assert.equal(consentOf(broken), null);
  assert.equal(consentOf({ get localStorage() { throw new Error('denied'); }, navigator: {} }), null);
  assert.equal(consentOf({ localStorage: { getItem: () => 'maybe' } }), null);
  setConsent(broken, 'accepted');
  assert.equal(allowed(broken, CONFIG), false);
  clearAnalyticsStorage(broken);
  assert.equal(configured({}), false);
  assert.equal(configured({ token: 'phx_personal', host: CONFIG.host }), false);
  assert.equal(createAnalytics({ ...broken, location: {} }, { ...CONFIG, random }).enabled, false);
});

test('sign-out while accepted keeps the choice and clears only the account', async () => {
  const b = browser({ [CONSENT_KEY]: 'accepted' }), t = b.tab();
  const a = installUsageAnalytics(t.target, CONFIG);
  a.identify(ME);
  a.signedOut();
  assert.equal(b.data.get(CONSENT_KEY), 'accepted');
  assert.equal(b.data.has('rh_ph_account'), false);
  assert.notEqual(a.stats().distinct, ME);
  t.target.dispatchEvent(new Event(CONSENT_EVENT));
  assert.equal(currentAnalytics(), a, 'an event without a change does not restart it');
});
