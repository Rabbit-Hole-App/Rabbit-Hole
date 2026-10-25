// Centralized browser errors (telemetry brief Task 11; docs/features/telemetry.md "Browser errors") against the LOCAL stack only.
// A synthetic uncaught error and a synthetic failed request are raised in a real page; the check reads the batches the page posts to
// /api/telemetry/client (intercepted and answered 202: the local stack has no telemetry database). It asserts what leaves the page
// (kind, fingerprint, route template, trace id, counts) and what must not (the message text, URLs, cookies), that a repeat is folded
// into a count, that 4xx answers are not reported, and that the owner surfaces are closed to an ordinary signed-in user. No model
// request is made. The server side (validation, dedup, limits, storage) is covered by the control-plane unit tests.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/client-telemetry-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('client-telemetry-check runs against the local stack only');
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `clienttel-${Date.now().toString(36)}@example.com`, secret }) })).json();

const MESSAGE = 'synthetic-private-message-731';
const batches = [], traceHeaders = [], pageErrors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/api/telemetry/client', route => {
  batches.push(JSON.parse(route.request().postData() || '{"events":[]}').events);
  return route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":0,"rejected":0,"deduped":0}' });
});
await context.route('**/api/learn/progress**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic"}' }));
await context.route('**/api/learn/coaching**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"synthetic"}' }));
const page = await context.newPage();
page.on('request', request => { const trace = request.headers()['x-rh-trace']; if (trace) traceHeaders.push({ url: new URL(request.url()).pathname, trace }); });
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto(`${BASE}/apps`);
await page.waitForFunction(() => window.fetch.clientTelemetryHook === true, null, { timeout: 60000 });

const total = 8;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
// Waits for a condition the step asserts (polled, bounded), never a fixed pause.
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; for (;;) { const value = await fn(); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); } };
const flush = async () => { const before = batches.length; await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await until(() => batches.length > before, 'a batch was posted'); return batches.at(-1); };
const sent = () => batches.flat();

await check('API requests carry a trace id header', async () => {
  await page.evaluate(() => fetch('/api/learn/usage').catch(() => {}));
  await until(() => traceHeaders.some(h => h.url === '/api/learn/usage'), 'the trace header');
  assert.match(traceHeaders.find(h => h.url === '/api/learn/usage').trace, /^[0-9a-f]{16}$/);
});

await check('an uncaught error is reported once with a fingerprint and a route template, and the page keeps its limits', async () => {
  await page.evaluate(message => setTimeout(() => { throw new TypeError(message); }, 0), MESSAGE);
  const events = (await flush()).filter(e => e.payload.kind === 'uncaught');
  assert.equal(events.length, 1);
  const [{ payload }] = events;
  assert.match(payload.fingerprint, /^[0-9a-f]{16}$/);
  assert.equal(payload.error_name, 'TypeError');
  assert.match(payload.route, /^\/[A-Za-z0-9_/:.@-]*$/);
  assert.equal(payload.count, 1);
  assert.ok(['chrome', 'edge', 'firefox', 'safari', 'other'].includes(payload.browser));
});

await check('nothing private leaves the page: no message, no URL, no cookie, no token', async () => {
  const text = JSON.stringify(batches);
  for (const secretText of [MESSAGE, 'http://127.0.0.1', 'small_session', session, 'localhost']) assert.equal(text.includes(secretText), false, secretText);
});

await check('a repeated error is folded into a count, not sent again', async () => {
  const before = sent().filter(e => e.payload.kind === 'unhandled_rejection').length;
  // Resolves once the page has dispatched all five rejections; the reporter's own listener was added first, so it has seen them.
  await page.evaluate(() => new Promise(resolve => {
    let seen = 0;
    const count = () => { if (++seen === 5) { window.removeEventListener('unhandledrejection', count); resolve(); } };
    window.addEventListener('unhandledrejection', count);
    for (let i = 0; i < 5; i++) Promise.reject(new RangeError('synthetic-repeat'));
  }));
  await flush();
  const events = sent().filter(e => e.payload.kind === 'unhandled_rejection');
  assert.ok(events.length - before <= 2, 'at most the first and one folded event');
  assert.equal(events.slice(before).reduce((sum, e) => sum + e.payload.count, 0), 5, 'every occurrence is counted once');
});

await check('a failed load carries the failing request trace id, and 4xx answers are not reported', async () => {
  await page.evaluate(async () => { await fetch('/api/learn/coaching?app=x'); await fetch('/api/learn/progress?app=x'); });
  await flush();
  const load = sent().find(e => e.payload.kind === 'load_failed');
  assert.ok(load, 'the 503 on a saved resource is reported as a failed load');
  assert.equal(load.payload.status_code, 503);
  assert.equal(load.payload.route, '/apps', 'the route is the page route template, never the request URL');
  assert.equal(load.trace_id, traceHeaders.find(h => h.url === '/api/learn/progress').trace, 'the event and the request share one trace id');
  assert.equal(sent().some(e => e.payload.status_code === 404), false, 'a 404 is the product speaking');
});

await check('every posted event passes the contract shape the server enforces', async () => {
  for (const event of sent()) {
    assert.equal(event.event_name, 'client.error');
    assert.equal(event.schema_version, 1);
    assert.deepEqual(Object.keys(event.payload).filter(k => !['kind', 'fingerprint', 'route', 'source', 'error_name', 'artifact', 'browser', 'device', 'status_code', 'duration_ms', 'count', 'dropped', 'online'].includes(k)), []);
  }
});

await check('an ordinary signed-in user is refused the owner telemetry API and sees no dashboard data', async () => {
  const get = async path => (await fetch(`${BASE}${path}`, { headers: { cookie: `small_session=${session}` } })).status;
  for (const path of ['/api/owner/telemetry/access', '/api/owner/telemetry/overview', '/api/owner/telemetry/client-errors', '/api/owner/telemetry/support/RH-7QK2-M9XD']) assert.equal(await get(path), 404, path);
  assert.equal((await fetch(`${BASE}/api/owner/telemetry/access`)).status, 404, 'signed out');
  await page.goto(`${BASE}/owner/telemetry`);
  await page.getByText('Not found.').waitFor({ timeout: 30000 });
  assert.equal(await page.getByText('Browser errors').count(), 0);
});

await check('the browser endpoint answers an empty batch where telemetry is not provisioned', async () => {
  const response = await fetch(`${BASE}/api/telemetry/client`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `small_session=${session}` }, body: '{"events":[]}' });
  assert.ok([202, 204].includes(response.status), `status ${response.status}`);
  assert.equal((await fetch(`${BASE}/api/telemetry/client`)).status, 405);
});

assert.deepEqual(pageErrors.filter(message => !message.includes('synthetic')), [], 'no page errors besides the synthetic ones');
console.log(`${results.length}/${total} checks passed`);
await browser.close();
if (results.length !== total) process.exit(1);
