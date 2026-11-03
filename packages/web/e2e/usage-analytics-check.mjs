// Usage analytics switched on, in a real browser (docs/features/usage-analytics.md "Verification"). CI builds carry no PostHog token, so this
// bundles the real entries in memory (analytics-config.js startAppAnalytics and landing/analytics.js, configured through VITE_* as a release is)
// and serves them by route interception. The batch endpoint is a stub on an .invalid host: no event can reach PostHog, and no stack is needed.
// Drives anonymous, sign-in, navigation, reload, account change, logout, active/idle/hidden, two tabs and a blocked endpoint, on a fake clock, and
// asserts what leaves the page. Playwright emulates focus, so hidden and unfocused are set on the document here, not made by a real window.
// BUNDLE_ONLY=1 stops after bundling (no browser).
// Usage: node e2e/usage-analytics-check.mjs
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ORIGIN = 'https://rh-analytics.test', HOST = 'https://analytics-stub.invalid';
const TOKEN = 'phc_usageanalyticscheckonlynotarealtoken0000000';
const A = 'a'.repeat(32), B = 'b'.repeat(32);
const SECRETS = ['secret-canvas', 'private-query', 'magic-token', 'person@example.test', '.rabbithole.invalid'];
Object.assign(process.env, { VITE_POSTHOG_TOKEN: TOKEN, VITE_POSTHOG_HOST: HOST, VITE_ANALYTICS_ENV: 'ci' });

const web = fileURLToPath(new URL('..', import.meta.url)).replaceAll('\\', '/');
const APP = '\0usage-analytics-app';
const bundled = await build({ configFile: false, root: web, logLevel: 'error',
  plugins: [{ name: 'usage-analytics-app', resolveId: id => (id === 'usage-analytics-app' ? APP : null), load: id => (id !== APP ? null : `
    import { startAppAnalytics } from '${web}src/analytics-config.js';
    import { currentAnalytics, track } from '${web}src/usage-analytics.js';
    startAppAnalytics();
    Object.defineProperty(window, '__analytics', { get: currentAnalytics });
    window.__track = track;`) }],
  build: { write: false, minify: false, rolldownOptions: { input: { app: 'usage-analytics-app', landing: `${web}src/landing/analytics.js` }, output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].js' } } } });
const files = new Map([bundled].flat().flatMap(result => result.output).map(file => [file.fileName, file.code ?? String(file.source)]));
const styles = [...files.keys()].filter(name => name.endsWith('.css')).map(name => `<link rel="stylesheet" href="/static/${name}">`).join('');
assert.ok(files.has('app.js') && files.has('landing.js'), 'both entries bundled');
assert.ok([...files.values()].some(code => code.includes(TOKEN)), 'the configuration reached the bundle through VITE_*');
if (process.env.BUNDLE_ONLY) { console.log(`bundled ${[...files.keys()].join(', ')}`); process.exit(0); }

const LANDING = new Set(['/pricing', '/sign-in']);
let me = null, blocked = false, meCalls = 0;
const requests = [], strays = [], pageErrors = [], deliveries = new Map();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const respond = route => {
  const url = new URL(route.request().url());
  if (url.origin === HOST) {
    const body = JSON.parse(route.request().postData() || '{}');
    for (const event of body.batch || []) deliveries.set(event.uuid, (deliveries.get(event.uuid) || 0) + 1);
    if (blocked) return route.abort();
    requests.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"status":"Ok"}' });
  }
  if (url.origin !== ORIGIN) { strays.push(url.href); return route.abort(); }
  if (url.pathname.startsWith('/static/')) return route.fulfill({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(url.pathname.slice(8)) || '' });
  if (url.pathname === '/api/me') meCalls++;
  if (url.pathname === '/api/me') return me ? route.fulfill({ json: { email: 'person@example.test', org: 'o', user_id: me.id, ...(me.internal ? { analytics_internal: true } : {}) } }) : route.fulfill({ status: 401, json: { error: 'sign in' } });
  if (url.pathname === '/api/poll') return route.fulfill({ json: { stage: 'rendering' } });
  return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>t</title>${styles}<body style="height:4000px"><a href="/privacy#technical" data-analytics-preferences>Analytics preferences</a><script type="module" src="/static/${LANDING.has(url.pathname) ? 'landing' : 'app'}.js"></script></body>` });
};
await context.route('**/*', respond);
const T0 = Date.UTC(2026, 10, 2, 20);
await context.clock.install({ time: T0 });
await context.clock.pauseAt(T0 + 1000);
context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));

const total = 21;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; for (;;) { const value = await fn(); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${label}; sent ${JSON.stringify(sent().map(e => [e.event, e.properties.distinct_id?.slice(0, 4), e.properties.active_seconds]))}`); await new Promise(resolve => setTimeout(resolve, 50)); } };
const sent = () => [...new Map(requests.flatMap(r => r.batch).map(e => [e.uuid, e])).values()];
const named = name => sent().filter(e => e.event === name);
const run = ms => context.clock.runFor(ms);
const flushTimer = () => run(5100);
const activeOf = id => named('rh_active_time').filter(e => e.properties.distinct_id === id).reduce((sum, e) => sum + e.properties.active_seconds, 0);
const hidden = (page, on) => page.evaluate(value => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, on);
const pagehide = page => page.evaluate(() => window.__analytics.hide());
const appReady = page => until(() => page.evaluate(() => !!window.__analytics), 'the app entry ran');
const pathsOf = () => named('$pageview').map(e => e.properties.$pathname);
// Consent: what proves collection is off, not merely that a banner moved.
const BANNER = '[data-analytics-banner]';
const stored = page => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('rh_ph_')));
const consentCookie = page => page.evaluate(() => document.cookie.includes('rh_analytics_consent=accepted'));
const choose = (page, choice) => page.locator(`[data-analytics-choose="${choice}"]`).evaluate(button => button.click());
const assertOff = async (page, label) => {
  await run(30_000);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(requests.length, 0, `${label}: no /batch/ request`);
  assert.deepEqual(await stored(page), [], `${label}: no identifier in storage`);
  assert.equal(await consentCookie(page), false, `${label}: nothing for the server's sign-in event`);
};

try {
  const page = await context.newPage();
  let anon;

  await check('first visit: the banner offers both choices and the policy, and nothing is collected, stored or asked before a choice', async () => {
    await page.goto(`${ORIGIN}/pricing`);
    await until(() => page.locator(BANNER).count(), 'the banner');
    assert.equal(await page.locator(BANNER).getAttribute('aria-label'), 'Analytics choice');
    assert.match(await page.locator(BANNER).innerText(), /We use analytics to understand how Rabbit Hole is used and improve it./);
    assert.equal(await page.getByRole('button', { name: 'Accept analytics' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Reject optional' }).count(), 1);
    assert.equal(await page.locator(`${BANNER} a`).getAttribute('href'), '/privacy#technical');
    await page.mouse.click(5, 300);
    await page.mouse.wheel(0, 50);
    await assertOff(page, 'first visit, public page');
    me = { id: A, internal: true };
    await page.goto(`${ORIGIN}/apps`); // signed in, no choice yet
    await until(() => page.locator(BANNER).count(), 'the banner in the app');
    await page.mouse.click(5, 300);
    await assertOff(page, 'first visit, signed in');
    assert.equal(meCalls, 0, 'no account lookup for analytics');
    me = null;
  });

  await check('the banner works by keyboard and on a phone, and blocks nothing behind it', async () => {
    await page.goto(`${ORIGIN}/pricing`);
    await until(() => page.locator(BANNER).count(), 'the banner');
    const focused = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); focused.push(await page.evaluate(() => document.activeElement?.textContent)); }
    assert.ok(focused.includes('Privacy Policy') && focused.includes('Accept analytics') && focused.includes('Reject optional'), focused.join(' | '));
    assert.equal(await page.evaluate(() => { const b = document.querySelector('[data-analytics-banner]'); return getComputedStyle(b).position; }), 'fixed');
    assert.equal(await page.evaluate(() => document.elementFromPoint(5, 5)?.closest('[data-analytics-banner]') ?? null), null, 'the page stays reachable');
    await page.setViewportSize({ width: 360, height: 640 });
    const box = await page.locator(BANNER).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 360 && box.y + box.height <= 640, JSON.stringify(box));
    assert.ok(box.x + box.width > 180, 'not bottom left');
    for (const name of ['Accept analytics', 'Reject optional']) assert.ok((await page.getByRole('button', { name }).boundingBox()).height >= 44, name);
    await page.setViewportSize({ width: 1000, height: 700 });
    assert.equal(await page.locator(BANNER).count(), 1, 'it stays until a choice');
  });

  await check('reject: remembered across a reload and tabs, sign-in and sign-out stay off, and the app\'s own storage is untouched', async () => {
    await page.evaluate(() => localStorage.setItem('learn-draft', 'keep'));
    await page.getByRole('button', { name: 'Reject optional' }).focus();
    await page.keyboard.press('Enter');
    await until(async () => (await page.locator(BANNER).count()) === 0, 'the banner closes');
    await page.reload();
    assert.equal(await page.locator(BANNER).count(), 0, 'remembered');
    await assertOff(page, 'after rejecting');
    me = { id: A, internal: true };
    await page.goto(`${ORIGIN}/apps`);
    await page.mouse.click(5, 300);
    await assertOff(page, 'signed in after rejecting');
    me = null;
    await page.goto(`${ORIGIN}/sign-in`);
    await assertOff(page, 'signed out after rejecting');
    assert.equal(meCalls, 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('learn-draft')), 'keep');
  });

  await check('accept from the preferences link: collection starts at once, by keyboard, with nothing from before the choice', async () => {
    await page.goto(`${ORIGIN}/pricing`);
    await page.locator('[data-analytics-preferences]').focus();
    await page.keyboard.press('Enter');
    await until(() => page.locator(BANNER).count(), 'the preferences link opens the banner');
    assert.equal(await page.getByRole('button', { name: 'Reject optional' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Accept analytics');
    await page.keyboard.press('Enter');
    await until(async () => { await flushTimer(); return named('$pageview').length === 1; }, 'the first pageview after accepting');
    assert.deepEqual(sent().map(e => e.event), ['$pageview'], 'nothing queued before the choice');
    assert.equal(sent()[0].properties.$pathname, '/pricing');
    assert.equal(await consentCookie(page), true);
    assert.equal(await page.locator(BANNER).count(), 0);
  });

  await check('anonymous: a public page is one sanitized pageview, the referrer only its origin, nothing about an account', async () => {
    await page.goto(`${ORIGIN}/pricing?utm=private-query#magic-token`, { referer: 'https://news.example/item?id=private-query' });
    await until(async () => { await flushTimer(); return named('$pageview').length === 2; }, 'the pageview after reloading with a choice');
    const { properties, ...rest } = named('$pageview')[1];
    anon = properties.distinct_id;
    assert.equal(properties.$current_url, `${ORIGIN}/pricing`);
    assert.equal(properties.$referrer, 'https://news.example');
    assert.deepEqual([properties.rh_env, properties.rh_internal, properties.$lib], ['ci', false, 'rh-web']);
    assert.match(properties.$session_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    assert.match(rest.uuid, /^[0-9a-f-]{36}$/);
    assert.equal(requests[0].api_key, TOKEN);
    assert.equal(anon.length, 36);
  });

  await check('the sign-in page keeps an anonymous visitor as one person', async () => {
    await page.goto(`${ORIGIN}/sign-in`);
    await until(async () => { await flushTimer(); return pathsOf().includes('/sign-in'); }, 'the sign-in pageview');
    assert.equal(named('$pageview').at(-1).properties.distinct_id, anon);
  });

  let sessionA;
  await check('sign-in: /api/me identifies users.id once, merges the anonymous visit, and sets both person marks; never the email', async () => {
    me = { id: A, internal: true };
    await page.goto(`${ORIGIN}/apps`);
    await appReady(page);
    await until(async () => { await flushTimer(); return named('$identify').length === 1; }, 'the identify');
    const { properties } = named('$identify')[0];
    assert.deepEqual([properties.distinct_id, properties.$anon_distinct_id], [A, anon]);
    assert.deepEqual(properties.$set, { rh_internal: true, $internal_or_test_user: true });
    sessionA = properties.$session_id;
  });

  await check('navigation and reload: sanitized paths, one identify, the same visit, and a reload is no new account event', async () => {
    await page.evaluate(() => { history.pushState(null, '', '/apps/secret-canvas?q=private-query#magic-token'); dispatchEvent(new PopStateEvent('popstate')); dispatchEvent(new PopStateEvent('popstate')); });
    await until(async () => { await flushTimer(); return pathsOf().includes('/apps/:id'); }, 'the navigation pageview');
    assert.equal(pathsOf().filter(path => path === '/apps/:id').length, 1, 'a popstate that did not move is not a view');
    const view = named('$pageview').at(-1).properties;
    assert.deepEqual([view.distinct_id, view.rh_internal, view.$session_id], [A, true, sessionA]);
    const before = named('$pageview').length;
    await page.reload();
    await appReady(page);
    await until(async () => { await flushTimer(); return named('$pageview').length > before; }, 'the reload pageview');
    await flushTimer();
    assert.equal(named('$identify').length, 1, 'a returning session sends no second identify');
    assert.equal(named('$pageview').at(-1).properties.$session_id, sessionA);
  });

  await check('active time: real input while visible counts exactly, and hiding reports it at once', async () => {
    await page.mouse.click(5, 5);
    await run(40_000);
    await hidden(page, true);
    await until(() => activeOf(A) === 40, '40 active seconds');
    const event = named('rh_active_time').at(-1);
    assert.deepEqual([event.properties.$session_id, event.properties.rh_internal, event.properties.idle_threshold_seconds], [sessionA, true, 60]);
    await run(120_000); // hidden time counts nothing
    await flushTimer();
    assert.equal(activeOf(A), 40);
    await hidden(page, false);
  });

  await check('idle and machine activity: 60 seconds after the last input it stops; polling and a programmatic scroll keep nobody active', async () => {
    await page.mouse.wheel(0, 50);
    await run(5 * 60_000);
    await until(async () => { await flushTimer(); return activeOf(A) === 100; }, 'only the 60 second window');
    await page.evaluate(() => fetch('/api/poll'));
    for (let i = 0; i < 12; i++) { await page.evaluate(y => { window.scrollTo(0, y); fetch('/api/poll'); }, 100 + i * 10); await run(10_000); }
    await pagehide(page);
    await flushTimer();
    assert.equal(activeOf(A), 100);
  });

  await check('account change: time accrued under A stays with A and its session; B starts from a fresh anonymous id and earns nothing from A', async () => {
    await page.mouse.click(5, 5);
    await run(40_000);
    await page.evaluate(id => { window.__analytics.identify(id); }, B);
    me = { id: B };
    await run(15_000); // inside A's input window
    await pagehide(page);
    await until(() => activeOf(A) === 140, 'A keeps its 40 seconds');
    const event = named('rh_active_time').at(-1);
    assert.deepEqual([event.properties.distinct_id, event.properties.$session_id, event.properties.rh_internal], [A, sessionA, true]);
    await until(async () => { await flushTimer(); return named('$identify').some(e => e.properties.distinct_id === B); }, 'the identify for B');
    const identify = named('$identify').find(e => e.properties.distinct_id === B).properties;
    assert.equal(activeOf(B), 0);
    assert.notEqual(identify.$anon_distinct_id, anon);
    assert.notEqual(identify.$session_id, sessionA);
    assert.deepEqual(identify.$set, { rh_internal: false, $internal_or_test_user: false });
  });

  const second = await context.newPage();
  await check('two tabs: one identify between them, and only the focused tab accrues', async () => {
    const identifies = named('$identify').length;
    await second.goto(`${ORIGIN}/apps/secret-canvas`);
    await appReady(second);
    await flushTimer();
    await second.evaluate(() => { document.hasFocus = () => false; });
    await page.mouse.click(5, 5);
    await second.mouse.click(5, 5);
    await run(30_000);
    await pagehide(page); await pagehide(second);
    await until(async () => { await flushTimer(); return activeOf(B) >= 30; }, 'B accrues');
    assert.equal(activeOf(B), 30, 'not 60');
    assert.equal(named('$identify').length, identifies);
  });

  await check('a logout in another tab: this tab reports under the account it accrued in, and later input counts for the new visitor', async () => {
    await run(61_000); // the last step's input window lapses, so the baseline holds
    await pagehide(page);
    await flushTimer();
    const base = activeOf(B);
    await page.mouse.click(5, 5);
    await run(20_000);
    me = null;
    await second.goto(`${ORIGIN}/sign-in`);
    await new Promise(resolve => setTimeout(resolve, 300)); // real time for the storage event; the clock stays where the input left it
    await until(async () => { await flushTimer(); return activeOf(B) === base + 20; }, 'the storage event settles B\'s 20 seconds without a hide');
    await page.mouse.click(5, 5);
    await run(10_000);
    const before = named('rh_active_time').length;
    await pagehide(page);
    await until(async () => { await flushTimer(); return named('rh_active_time').length > before; }, 'the new visitor\'s time');
    const event = named('rh_active_time').at(-1).properties;
    assert.equal(event.active_seconds, 10);
    assert.ok(![A, B].includes(event.distinct_id), 'neither account');
    assert.equal(event.rh_internal, false);
    assert.equal(activeOf(B), base + 20);
  });

  await check('logout here with time accrued: it stays with the account, and the sign-in page leaves the next visitor anonymous', async () => {
    me = { id: A, internal: true };
    await page.reload();
    await appReady(page);
    await until(async () => { await flushTimer(); return named('$identify').filter(e => e.properties.distinct_id === A).length === 2; }, 'A again, from a fresh anonymous id');
    const earlier = activeOf(A);
    await page.mouse.click(5, 5);
    await run(15_000);
    await page.evaluate(() => { window.__analytics.signedOut(); });
    await pagehide(page);
    await until(() => activeOf(A) === earlier + 15, 'A keeps its 15 seconds');
    me = null;
    await page.goto(`${ORIGIN}/sign-in`);
    await until(async () => { await flushTimer(); return ![A, B].includes(named('$pageview').at(-1).properties.distinct_id) && pathsOf().at(-1) === '/sign-in'; }, 'an anonymous sign-in page');
  });

  await check('a blocked endpoint: the page carries on, each event is tried at most 3 times, and nothing private ever left', async () => {
    me = { id: A, internal: true };
    await page.goto(`${ORIGIN}/apps`);
    await appReady(page);
    blocked = true;
    assert.equal(await page.evaluate(() => window.__track('rh_tutor_used', { prompt: 'private-query' })), true);
    for (let i = 0; i < 8; i++) { await run(20_000); await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.ok(Math.max(...deliveries.values()) <= 3, `at most 3 sends per event, saw ${Math.max(...deliveries.values())}`);
    assert.equal(await page.evaluate(() => document.title), 't');
    blocked = false;
    const text = JSON.stringify(requests);
    for (const secret of SECRETS) assert.equal(text.includes(secret), false, secret);
    assert.deepEqual(strays.filter(url => !url.includes('fonts')), [], 'nothing else was contacted');
    assert.ok(requests.every(r => r.api_key === TOKEN));
  });

  await check('withdrawal: pending and accrued data never leaves, in this tab or another open one, identifiers go, and the app\'s storage stays', async () => {
    me = { id: A, internal: true };
    await second.goto(`${ORIGIN}/apps/secret-canvas`);
    await appReady(second);
    await flushTimer();
    await page.mouse.click(5, 300);
    await run(20_000);                                              // time accrued
    await page.evaluate(() => { window.__track('rh_tutor_used'); }); // and an event queued
    const before = requests.length, active = activeOf(A);
    assert.ok((await stored(page)).length > 0);
    await page.locator('[data-analytics-preferences]').evaluate(link => link.click());
    await choose(page, 'rejected');
    await new Promise(resolve => setTimeout(resolve, 300));          // real time for the storage event
    assert.equal(await second.evaluate(() => window.__analytics), null, 'the other tab stopped');
    await second.mouse.click(5, 300);
    await page.mouse.click(5, 300);
    await run(5 * 60_000);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(requests.length, before, 'no /batch/ request after withdrawal');
    assert.equal(activeOf(A), active);
    for (const tab of [page, second]) {
      assert.deepEqual(await stored(tab), []);
      assert.equal(await consentCookie(tab), false);
      assert.equal(await tab.evaluate(() => window.__track('rh_tutor_used')), false);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('learn-draft')), 'keep');
    await page.reload();
    await new Promise(resolve => setTimeout(resolve, 300));
    await run(30_000);
    assert.equal(requests.length, before, 'still off after a reload');
    assert.deepEqual(await stored(page), []);
  });

  await check('a choice in another tab reaches this one: the banner goes and collection starts without a reload', async () => {
    await page.evaluate(() => localStorage.removeItem('rh_analytics_consent')); // a storage event reaches the other tab only
    await until(() => second.locator(BANNER).count(), 'a removed choice brings the banner back');
    const before = requests.length;
    await page.reload();
    await until(() => page.locator(BANNER).count(), 'this tab asks');
    await choose(second, 'accepted');
    await until(async () => (await page.locator(BANNER).count()) === 0, 'this tab\'s banner goes');
    await until(async () => { await flushTimer(); return requests.length > before; }, 'both tabs start');
    assert.ok(await page.evaluate(() => !!window.__analytics));
    assert.equal(await consentCookie(page), true);
  });

  const signal = async (init, label, after) => {
    const other = await browser.newContext();
    try {
      await other.route('**/*', respond);
      await other.addInitScript(init);
      const tab = await other.newPage();
      const before = requests.length;
      me = { id: A, internal: true };
      await tab.goto(`${ORIGIN}/apps`);
      await tab.mouse.click(5, 300);
      await new Promise(resolve => setTimeout(resolve, 5600)); // this context has a real clock: past the flush timer
      assert.equal(requests.length, before, `${label}: no /batch/ request`);
      assert.deepEqual(await tab.evaluate(() => { try { return Object.keys(localStorage).filter(key => key.startsWith('rh_ph_')); } catch { return []; } }), [], `${label}: no identifier`);
      assert.equal(await tab.evaluate(() => document.cookie.includes('rh_analytics_consent=accepted')), false, `${label}: nothing for the server`);
      await after(tab);
    } finally { await other.close(); }
  };
  await check('Global Privacy Control over a saved acceptance: off, and no banner to answer', () => signal(`Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }); localStorage.setItem('rh_analytics_consent', 'accepted');`, 'GPC', async tab => assert.equal(await tab.locator(BANNER).count(), 0)));
  await check('Do Not Track over a saved acceptance: off, and no banner to answer', () => signal(`Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }); localStorage.setItem('rh_analytics_consent', 'accepted');`, 'DNT', async tab => assert.equal(await tab.locator(BANNER).count(), 0)));
  await check('unreadable consent stays off, and choosing with blocked storage collects nothing and does not throw', () => signal(`Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); };`, 'blocked storage', async tab => {
    assert.equal(await tab.locator(BANNER).count(), 1);
    await choose(tab, 'accepted');
    assert.equal(await tab.locator(BANNER).count(), 0, 'the answer closes it for this page');
    assert.equal(await tab.evaluate(() => window.__analytics), null);
  }));
  await check('no page error in any of it', () => assert.deepEqual(pageErrors, []));
} finally {
  await browser.close();
}
console.log(`${results.length}/${total} checks passed`);
if (results.length !== total) process.exit(1);
