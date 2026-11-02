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
    import { installUsageAnalytics, track } from '${web}src/usage-analytics.js';
    startAppAnalytics();
    window.__analytics = installUsageAnalytics(window, {});
    window.__track = track;`) }],
  build: { write: false, minify: false, rolldownOptions: { input: { app: 'usage-analytics-app', landing: `${web}src/landing/analytics.js` }, output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name].js' } } } });
const files = new Map([bundled].flat().flatMap(result => result.output).map(file => [file.fileName, file.code]));
assert.ok(files.has('app.js') && files.has('landing.js'), 'both entries bundled');
assert.ok([...files.values()].some(code => code.includes(TOKEN)), 'the configuration reached the bundle through VITE_*');
if (process.env.BUNDLE_ONLY) { console.log(`bundled ${[...files.keys()].join(', ')}`); process.exit(0); }

const LANDING = new Set(['/pricing', '/sign-in']);
let me = null, blocked = false;
const requests = [], strays = [], pageErrors = [], deliveries = new Map();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === HOST) {
    const body = JSON.parse(route.request().postData() || '{}');
    for (const event of body.batch || []) deliveries.set(event.uuid, (deliveries.get(event.uuid) || 0) + 1);
    if (blocked) return route.abort();
    requests.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"status":"Ok"}' });
  }
  if (url.origin !== ORIGIN) { strays.push(url.href); return route.abort(); }
  if (url.pathname.startsWith('/static/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: files.get(url.pathname.slice(8)) || '' });
  if (url.pathname === '/api/me') return me ? route.fulfill({ json: { email: 'person@example.test', org: 'o', user_id: me.id, ...(me.internal ? { analytics_internal: true } : {}) } }) : route.fulfill({ status: 401, json: { error: 'sign in' } });
  if (url.pathname === '/api/poll') return route.fulfill({ json: { stage: 'rendering' } });
  return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><title>t</title><body style="height:4000px"><script type="module" src="/static/${LANDING.has(url.pathname) ? 'landing' : 'app'}.js"></script></body>` });
});
const T0 = Date.UTC(2026, 10, 2, 20);
await context.clock.install({ time: T0 });
await context.clock.pauseAt(T0 + 1000);
context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));

const total = 11;
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

try {
  const page = await context.newPage();
  let anon;

  await check('anonymous: a public page is one sanitized pageview, the referrer only its origin, nothing about an account', async () => {
    await page.goto(`${ORIGIN}/pricing?utm=private-query#magic-token`, { referer: 'https://news.example/item?id=private-query' });
    await until(async () => { await flushTimer(); return named('$pageview').length === 1; }, 'the first pageview');
    const { properties, ...rest } = named('$pageview')[0];
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
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`${results.length}/${total} checks passed`);
if (results.length !== total) process.exit(1);
