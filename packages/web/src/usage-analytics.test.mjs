import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, getRandomValues } from 'node:crypto';
import { ATTEMPTS, IDLE_MS, INPUT_EVENTS, SESSION_IDLE_MS, personMark, TICK_MS, createAnalytics, pagePath, referrerOf, sanitize, uuidv7, optedOut } from './usage-analytics.js';

const active = tab => tab.events().filter(e => e.event === 'rh_active_time').map(e => [e.properties.distinct_id, e.properties.active_seconds]);
const TOKEN = 'phc_testtoken0000000000000000000000000000000000';
const HOST = 'https://us.i.posthog.com';
// These tests are about what happens once accepted; analytics-consent.test.mjs covers the choice itself.
const acceptedStorage = (data = new Map([['rh_analytics_consent', 'accepted']])) => ({ getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null });
const ME = 'dda2350771a4066e3080c605ba092e0a', OTHER = 'edf6bd0c9cd0dcdcb7ef4c9f2c49f337';
const random = { randomUUID, getRandomValues: a => getRandomValues(a) };

// One browser: tabs share localStorage, each has its own document, location and transport log.
function browser() {
  const data = new Map([['rh_analytics_consent', 'accepted']]);
  const localStorage = acceptedStorage(data);
  const clock = { t: Date.UTC(2026, 10, 2, 20) };
  const tab = (pathname = '/', { referrer = '', userAgent = 'Mozilla/5.0 Chrome/140.0' } = {}) => {
    const sent = [];
    const doc = { visibilityState: 'visible', focused: true, referrer, hasFocus() { return this.focused; } };
    const target = { localStorage, document: doc, navigator: { userAgent }, location: { origin: 'https://digrabbithole.com', host: 'digrabbithole.com', pathname } };
    const a = createAnalytics(target, { token: TOKEN, host: HOST, env: 'production', random, now: () => clock.t, schedule: () => 0,
      send: async body => { sent.push(JSON.parse(body)); return 200; } });
    return { a, target, doc, sent, events: () => sent.flatMap(b => b.batch) };
  };
  return { tab, clock, data };
}

test('paths, referrers and properties leave sanitized: no ids, tokens, queries, fragments, emails or free text', () => {
  assert.equal(pagePath('/pricing'), '/pricing');
  assert.equal(pagePath('/apps/my-secret-canvas?tab=graph#x'), '/apps/:id');
  assert.equal(pagePath('/b/AbCdEfGhIjKlMnOpQrStUvWx'), '/b/:token');
  assert.equal(pagePath('/c/0b1c2d3e-0000-4000-8000-000000000000'), '/c/:id');
  assert.equal(pagePath('/@ada'), '/:handle');
  assert.equal(pagePath('/auth?token=secret'), '/:id');
  assert.deepEqual(referrerOf('https://news.example/item?id=7&utm=x', 'https://digrabbithole.com'), { $referrer: 'https://news.example', $referring_domain: 'news.example' });
  assert.deepEqual(referrerOf('https://digrabbithole.com/b/AbCdEfGhIjKlMnOpQrStUvWx?x=1', 'https://digrabbithole.com'), { $referrer: 'https://digrabbithole.com/b/:token', $referring_domain: 'digrabbithole.com' });
  assert.deepEqual(referrerOf('', 'https://digrabbithole.com'), { $referrer: '$direct', $referring_domain: '$direct' });
  assert.equal(sanitize('rh_prompt_sent', { text: 'hello' }), null, 'unknown events are dropped');
  assert.deepEqual(sanitize('rh_generation_failed', { feature: 'motion', action_id: 'job-123', reason: 'Provider said: secret prompt', prompt: 'x', email: 'a@b.c' }),
    { feature: 'motion', action_id: sanitize('rh_generation_failed', { action_id: 'job-123' }).action_id });
  assert.match(sanitize('rh_planning_requested', { action_id: 'act-1' }).action_id, /^[0-9a-f]{16}$/);
  assert.match(uuidv7(Date.UTC(2026, 0, 1), random), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(optedOut({ globalPrivacyControl: true }), true);
  assert.equal(optedOut({ doNotTrack: '1' }), true);
  assert.equal(optedOut({}), false);
});

test('anonymous, sign-in, navigation, reload and logout: one person per account, one identify, no merge across accounts', async () => {
  const b = browser();
  const landing = b.tab('/pricing', { referrer: 'https://news.example/item?id=7' });
  landing.a.pageview();
  await landing.a.flush();
  const [view] = landing.events();
  const anon = view.properties.distinct_id;
  assert.equal(view.event, '$pageview');
  assert.equal(view.properties.$current_url, 'https://digrabbithole.com/pricing');
  assert.equal(view.properties.$referrer, 'https://news.example');
  assert.equal(view.properties.rh_internal, false);

  // the app after sign-in: identify once, then navigate
  const app = b.tab('/apps');
  app.a.pageview();
  app.a.identify(ME, { internal: true });
  app.target.location.pathname = '/apps/canvas-one'; app.a.pageview();
  app.a.pageview(); // the same page again (a popstate that did not move) is not another view
  await app.a.flush();
  const appEvents = app.events();
  assert.deepEqual(appEvents.map(e => e.event), ['$pageview', '$identify', '$pageview']);
  assert.equal(appEvents[0].properties.distinct_id, anon, 'the pageview before identify is the same anonymous person');
  assert.deepEqual([appEvents[1].properties.distinct_id, appEvents[1].properties.$anon_distinct_id, appEvents[1].properties.$set.rh_internal], [ME, anon, true]);
  assert.equal(appEvents[2].properties.distinct_id, ME);
  assert.equal(appEvents[2].properties.rh_internal, true);
  assert.equal(appEvents[2].properties.$pathname, '/apps/:id');

  // reload: a new page load views again, and an existing session identifies without a second $identify
  const reload = b.tab('/apps/canvas-one');
  reload.a.pageview();
  reload.a.identify(ME, { internal: true });
  await reload.a.flush();
  assert.deepEqual(reload.events().map(e => e.event), ['$pageview']);
  assert.equal(reload.events()[0].properties.$session_id, appEvents[2].properties.$session_id, 'the same visit');

  // logout lands on the sign-in page, which resets: new anonymous id, new session, internal mark gone
  const signIn = b.tab('/sign-in');
  signIn.a.reset();
  signIn.a.pageview();
  await signIn.a.flush();
  const out = signIn.events()[0].properties;
  assert.notEqual(out.distinct_id, ME);
  assert.notEqual(out.distinct_id, anon);
  assert.notEqual(out.$session_id, appEvents[2].properties.$session_id);
  assert.equal(out.rh_internal, false);

  // a different account signing in on this browser is never merged into the first one
  const second = b.tab('/apps');
  second.a.identify(ME, { internal: true }); // ME again after logout: a fresh anonymous id joins ME
  second.a.identify(OTHER);                  // then another account without a logout in between
  await second.a.flush();
  const [again, other] = second.events();
  assert.equal(again.properties.$anon_distinct_id, out.distinct_id);
  assert.equal(other.properties.distinct_id, OTHER);
  assert.notEqual(other.properties.$anon_distinct_id, out.distinct_id, 'the other account starts from a fresh anonymous id');
  assert.equal(other.properties.rh_internal, false);
  // only users.id is ever an identity
  for (const bad of ['yudhisteer.chin@gmail.com', 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', 'ada', '']) second.a.identify(bad);
  await second.a.flush();
  assert.equal(second.events().length, 2);
});

test('a logout or account change in one tab reaches the other tab; another tab never re-sends an identify', async () => {
  const b = browser();
  const one = b.tab('/apps'), two = b.tab('/apps/x');
  one.a.identify(ME);
  two.a.identify(ME);
  two.a.track('rh_canvas_opened');
  await one.a.flush(); await two.a.flush();
  assert.deepEqual(two.events().map(e => [e.event, e.properties.distinct_id]), [['rh_canvas_opened', ME]]);
  one.a.reset(); // tab one signs out
  two.a.track('rh_canvas_opened');
  await two.a.flush();
  assert.notEqual(two.events().at(-1).properties.distinct_id, ME, 'tab two no longer sends as the signed-out account');
});

test('active time: input within 60 s while visible and focused; idle, hidden and unfocused time and network activity count nothing', async () => {
  const b = browser();
  const t = b.tab('/apps/x');
  const step = ms => { for (let i = 0; i < ms / TICK_MS; i++) { b.clock.t += TICK_MS; t.a.tick(); } };
  t.a.input(); step(30_000);              // 30 s of activity after input
  assert.equal(t.a.stats().activeMs, 30_000);
  step(5 * 60_000);                       // five idle minutes: only the rest of the 60 s window counts
  assert.equal(t.a.stats().activeMs, 0, 'a full minute was reported');
  await t.a.flush();
  assert.deepEqual(t.events().map(e => [e.event, e.properties.active_seconds, e.properties.idle_threshold_seconds]), [['rh_active_time', IDLE_MS / 1000, 60]]);

  t.a.input(); step(10_000);
  t.doc.visibilityState = 'hidden'; await t.a.hide();
  step(10 * 60_000); // background: nothing, even with input events (a hidden page gets none, but polling never counts)
  t.doc.visibilityState = 'visible'; t.a.show();
  assert.equal(t.events().at(-1).properties.active_seconds, 10, 'hiding reports the partial span at once');
  t.doc.focused = false; t.a.input(); step(30_000);
  assert.equal(t.a.stats().activeMs, 0, 'an unfocused window (the other of two side by side) counts nothing');
  t.doc.focused = true;
  b.clock.t += 3 * 3600_000; t.a.input(); t.a.tick(b.clock.t);
  assert.equal(t.a.stats().activeMs, 0, 'a suspended device adds nothing');
});

test('only real input keeps someone active: a programmatic scroll (a streaming answer) is not input', () => {
  assert.deepEqual(INPUT_EVENTS, ['pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove']);
});

// fast-e2e 41524993647: a browser changes visibilityState before visibilitychange fires, so the step in progress was dropped (39 of 40 seconds).
test('hiding or losing focus keeps the step in progress, though the state has already changed; time before focus returned does not count', async () => {
  const b = browser(), t = b.tab('/apps/x');
  t.a.input(); b.clock.t += TICK_MS; t.a.tick(); b.clock.t += 2000;
  t.doc.visibilityState = 'hidden'; await t.a.hide();
  assert.deepEqual(active(t), [[t.a.stats().distinct, 7]]);
  t.doc.visibilityState = 'visible'; t.a.show();
  t.a.input(); b.clock.t += 3000;
  t.doc.focused = false; t.a.blur();
  assert.equal(t.a.stats().activeMs, 3000);
  b.clock.t += TICK_MS; t.a.tick();
  t.doc.focused = true; b.clock.t += TICK_MS; t.a.tick();
  assert.equal(t.a.stats().activeMs, 3000, 'unfocused time is not earned when focus returns');
});

test('two tabs never double-count: only the focused one accrues', () => {
  const b = browser();
  const one = b.tab('/apps/x'), two = b.tab('/apps/y');
  two.doc.focused = false;
  one.a.input(); two.a.input();
  for (let i = 0; i < 6; i++) { b.clock.t += TICK_MS; one.a.tick(); two.a.tick(); }
  assert.equal(one.a.stats().activeMs + two.a.stats().activeMs, 30_000);
});

test('sessions follow PostHog rules: 30 idle minutes start a new $session_id; the identity survives', async () => {
  const b = browser();
  const t = b.tab('/apps');
  t.a.identify(ME); t.a.track('rh_canvas_opened');
  b.clock.t += SESSION_IDLE_MS + 1000;
  t.a.track('rh_canvas_opened');
  await t.a.flush();
  const [, first, second] = t.events();
  assert.notEqual(first.properties.$session_id, second.properties.$session_id);
  assert.equal(second.properties.distinct_id, ME);
});

test('blocked or failing analytics: bounded retries with the same event ids, nothing thrown, the app unaffected', async () => {
  const b = browser();
  const target = { localStorage: acceptedStorage(), document: { visibilityState: 'visible', hasFocus: () => true }, navigator: {}, location: { origin: 'https://digrabbithole.com', pathname: '/apps' } };
  let calls = 0; const bodies = [];
  const a = createAnalytics(target, { token: TOKEN, host: HOST, random, now: () => b.clock.t, schedule: () => 0, send: async body => { calls++; bodies.push(body); throw new TypeError('Failed to fetch'); } });
  a.pageview(); a.identify(ME); a.track('rh_tutor_used');
  for (let i = 0; i < ATTEMPTS + 2; i++) await a.flush();
  assert.equal(calls, ATTEMPTS);
  assert.equal(new Set(bodies).size, 1, 'every retry carries the same events and uuids, so PostHog keeps one');
  assert.equal(a.stats().queued, 0, 'dropped after the last attempt');
  // a refused token stops sending for the page
  const refused = createAnalytics(target, { token: TOKEN, host: HOST, random, now: () => b.clock.t, schedule: () => 0, send: async () => { calls++; return 401; } });
  refused.track('rh_tutor_used'); await refused.flush(); refused.track('rh_tutor_used'); await refused.flush();
  assert.equal(calls, ATTEMPTS + 1);
  // not configured, opted out, or a personal key: every method is a no-op
  for (const config of [{}, { token: 'phx_personal', host: HOST }, { token: TOKEN, host: 'http://us.i.posthog.com' }]) {
    const off = createAnalytics(target, { ...config, send: async () => assert.fail('sent while disabled') });
    off.pageview(); off.identify(ME); assert.equal(off.track('rh_tutor_used'), false); await off.flush();
  }
  const dnt = createAnalytics({ ...target, navigator: { globalPrivacyControl: true } }, { token: TOKEN, host: HOST, send: async () => assert.fail('sent despite GPC') });
  dnt.pageview(); await dnt.flush();
});

test('a finished job seen again after a reload is counted once (once ids are kept per browser)', async () => {
  const b = browser();
  const first = b.tab('/apps/x');
  assert.equal(first.a.track('rh_generation_completed', { feature: 'motion', action_id: 'job-1' }, { once: 'job-1' }), true);
  const reload = b.tab('/apps/x');
  assert.equal(reload.a.track('rh_generation_completed', { feature: 'motion', action_id: 'job-1' }, { once: 'job-1' }), false);
  assert.equal(reload.a.track('rh_generation_failed', { feature: 'motion', action_id: 'job-2' }, { once: 'job-2' }), true);
});

test('no sensitive payload leaves: the whole batch is free of prompts, emails, tokens, queries and principals', async () => {
  const b = browser();
  const t = b.tab('/b/AbCdEfGhIjKlMnOpQrStUvWx', { referrer: 'https://digrabbithole.com/auth?token=magic-secret' });
  t.target.location.search = '?token=magic-secret';
  t.a.pageview();
  t.a.identify(ME);
  t.a.track('rh_generation_failed', { feature: 'explain', action_id: 'job-9', reason: 'model said: the learner asked about X', prompt: 'my private question', email: 'yudhisteer.chin@gmail.com' });
  t.a.track('rh_share_changed', { access: 'https://digrabbithole.com/b/AbCdEfGhIjKlMnOpQrStUvWx' });
  await t.a.flush();
  const text = JSON.stringify(t.sent);
  for (const needle of ['AbCdEfGhIjKlMnOpQrStUvWx', 'magic-secret', 'token=', 'private question', 'learner asked', '@gmail.com', '.rabbithole.invalid', 'phx_', 'job-9'])
    assert.ok(!text.includes(needle), needle);
  assert.ok(text.includes(TOKEN), 'only the public project token');
});

test('signed out: the sign-in page and a 401 from /api/me clear an identified account; an anonymous visitor keeps their id', async () => {
  const { installUsageAnalytics, syncAnalyticsAccount, resetUsageAnalyticsForTests, shareAccess } = await import('./usage-analytics.js');
  const b = browser();
  const anonymous = b.tab('/sign-in');
  anonymous.a.pageview(); anonymous.a.signedOut(); anonymous.a.track('rh_canvas_opened');
  await anonymous.a.flush();
  const [view, after] = anonymous.events();
  assert.equal(after.properties.distinct_id, view.properties.distinct_id, 'the visit before sign-in stays one person');

  // the app: /api/me names the account (and the internal mark the control plane set); a later 401 clears it
  resetUsageAnalyticsForTests();
  const sent = [];
  const target = { localStorage: acceptedStorage(), document: { visibilityState: 'visible', hasFocus: () => true, addEventListener() {} }, navigator: {}, location: { origin: 'https://digrabbithole.com', host: 'digrabbithole.com', pathname: '/apps' },
    crypto: random, addEventListener() {}, setInterval() {}, fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { status: 200 }; } };
  const a = installUsageAnalytics(target, { token: TOKEN, host: HOST, env: 'production' });
  await syncAnalyticsAccount(async () => ({ ok: true, status: 200, json: async () => ({ email: 'user@x.rabbithole.invalid', user_id: ME, analytics_internal: true }) }));
  assert.equal(a.stats().distinct, ME);
  await syncAnalyticsAccount(async () => ({ ok: false, status: 503 })); // an outage is not a logout
  assert.equal(a.stats().distinct, ME);
  await syncAnalyticsAccount(async () => { throw new TypeError('offline'); });
  assert.equal(a.stats().distinct, ME);
  await syncAnalyticsAccount(async () => ({ ok: false, status: 401 }));
  assert.notEqual(a.stats().distinct, ME);
  await a.flush();
  const identify = sent.flatMap(x => x.batch).find(e => e.event === '$identify');
  assert.deepEqual([identify.properties.distinct_id, identify.properties.$set.rh_internal], [ME, true]);
  assert.ok(!JSON.stringify(sent).includes('rabbithole.invalid'), 'the email from /api/me never leaves');
  resetUsageAnalyticsForTests();

  assert.deepEqual([shareAccess(null), shareAccess({ shared: false }), shareAccess({ shared: true, view: true }), shareAccess({ shared: true, public_view: true })], ['private', 'private', 'link', 'public']);
});

// Owner review of a7f9d946f: 40 seconds accrued under account A were emitted under account B after identify(B) and hide().

const accrue = (b, tab, ms) => { tab.a.input(); for (let i = 0; i < ms / TICK_MS; i++) { b.clock.t += TICK_MS; tab.a.tick(); } };

test('accrued time stays with its account and session through identify(B) then hide; B earns nothing from A\'s input', async () => {
  const b = browser(), t = b.tab('/apps');
  t.a.identify(ME, { internal: true }); t.a.track('rh_canvas_opened');
  accrue(b, t, 40_000);
  await t.a.flush();
  const sessionA = t.events().at(-1).properties.$session_id, earnedAt = b.clock.t;
  assert.equal(t.a.stats().activeMs, 40_000);
  t.a.identify(OTHER);
  assert.equal(t.a.stats().activeMs, 0);
  b.clock.t += 20_000; t.a.tick();  // still inside A's 60 s window: nothing for B
  await t.a.hide();
  assert.deepEqual(active(t), [[ME, 40]]);
  const event = t.events().find(e => e.event === 'rh_active_time');
  assert.equal(event.properties.$session_id, sessionA);
  assert.equal(event.properties.rh_internal, true);
  assert.equal(event.timestamp, new Date(earnedAt).toISOString());
  const identify = t.events().find(e => e.event === '$identify' && e.properties.distinct_id === OTHER);
  assert.notEqual(identify.properties.$session_id, sessionA);
  accrue(b, t, 10_000); await t.a.hide();
  assert.deepEqual(active(t), [[ME, 40], [OTHER, 10]], 'B counts from B\'s own input');
});

test('accrued time stays with its account through logout, and the signed-out visitor earns nothing from it', async () => {
  const b = browser(), t = b.tab('/apps');
  t.a.identify(ME);
  accrue(b, t, 25_000);
  t.a.signedOut();
  b.clock.t += 20_000; t.a.tick();
  await t.a.hide();
  assert.deepEqual(active(t), [[ME, 25]]);
});

test('another tab\'s logout or account change: this tab settles under the account it accrued in, with or without the storage event', async () => {
  for (const change of [other => other.a.signedOut(), other => other.a.identify(OTHER)]) for (const notified of [true, false]) {
    const b = browser(), one = b.tab('/apps'), two = b.tab('/apps/x');
    one.a.identify(ME); two.a.identify(ME); two.doc.focused = false;
    one.a.track('rh_canvas_opened');
    accrue(b, one, 30_000);
    await one.a.flush();
    const sessionA = one.events().at(-1).properties.$session_id;
    change(two);
    if (notified) one.a.sync();
    b.clock.t += TICK_MS; one.a.tick(); // A's window is cleared either way
    await one.a.hide();
    assert.deepEqual(active(one), [[ME, notified ? 30 : 35]], 'unnotified, the change is seen at the next step, and at most that step goes to A');
    assert.equal(one.events().find(e => e.event === 'rh_active_time').properties.$session_id, sessionA);
    accrue(b, one, 10_000); await one.a.hide();
    assert.notEqual(active(one).at(-1)[0], ME, 'new input counts for the new identity');
    assert.equal(active(one).at(-1)[1], 10);
  }
});

test('session rollover: time accrued in a session is reported in it, also after 30 hidden-free idle minutes or another tab rolling it', async () => {
  const b = browser(), t = b.tab('/apps');
  t.a.identify(ME); t.a.track('rh_canvas_opened');
  accrue(b, t, 20_000);
  await t.a.flush();
  const first = t.events().at(-1).properties.$session_id;
  b.clock.t += SESSION_IDLE_MS + 1000;
  t.a.input();          // no tick ran (a throttled tab): the return must not carry the old time into the new session
  t.a.track('rh_canvas_opened');
  accrue(b, t, 10_000); await t.a.hide();
  const events = t.events().filter(e => e.event === 'rh_active_time');
  assert.deepEqual(events.map(e => e.properties.active_seconds), [20, 10]);
  assert.equal(events[0].properties.$session_id, first);
  assert.notEqual(events[1].properties.$session_id, first);
  assert.ok(Date.parse(events[0].timestamp) < Date.parse(events[1].timestamp));
  // idle past the window with ticks running: the remainder goes out without waiting for another visit
  const c = browser(), u = c.tab('/apps');
  accrue(c, u, 10_000);
  for (let i = 0; i < 14; i++) { c.clock.t += TICK_MS; u.a.tick(); }
  await u.a.flush();
  assert.deepEqual(u.events().filter(e => e.event === 'rh_active_time').map(e => e.properties.active_seconds), [60]);
});

test('a batch queued under A keeps A when it is sent after the change, however it was queued', async () => {
  const b = browser(), t = b.tab('/apps');
  t.a.identify(ME, { internal: true }); t.a.pageview(); t.a.track('rh_tutor_used');
  t.a.identify(OTHER);
  t.a.track('rh_tutor_used');
  await t.a.flush();
  const tutor = t.events().filter(e => e.event === 'rh_tutor_used').map(e => [e.properties.distinct_id, e.properties.rh_internal]);
  assert.deepEqual(tutor, [[ME, true], [OTHER, false]]);
  assert.deepEqual(t.events().find(e => e.event === '$pageview').properties.distinct_id, ME);
});

test('the internal mark reaches the person property the project\'s test-account cohort reads', async () => {
  assert.deepEqual(personMark(true), { rh_internal: true, $internal_or_test_user: true });
  assert.deepEqual(personMark(false), { rh_internal: false, $internal_or_test_user: false });
  const b = browser(), t = b.tab('/apps');
  t.a.identify(ME, { internal: true });
  t.a.identify(ME, { internal: false }); // a mark removed later reaches the person too
  await t.a.flush();
  assert.equal(t.events()[0].properties.$set.$internal_or_test_user, true);
  assert.deepEqual([t.events()[1].event, t.events()[1].properties.$set.$internal_or_test_user], ['$set', false]);
});
