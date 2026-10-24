// Tutor evidence telemetry and its learner notice (telemetry brief Task 12; docs/features/telemetry.md "Tutor evidence") against
// the LOCAL stack only. It checks what a browser can show without a model: the learner notice in Settings, Privacy & security, and
// the route's sign-in rule. It does NOT post a real tutor.decision (a Tutor turn needs a model, which the keyless stack refuses),
// so the mapping from real Tutor events, the exclusions and the server's enrichment are covered by unit tests on fixtures only
// (tutor-telemetry.test.mjs, telemetry-tutor-route.test.js). The local stack has no telemetry database, so a signed-in post is
// answered 204. No model request is made.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/tutor-telemetry-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-telemetry-check runs against the local stack only');
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tutortel-${Date.now().toString(36)}@example.com`, secret }) })).json();

const total = 3;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const post = (cookie, body = '{"events":[]}') => fetch(`${BASE}/api/telemetry/tutor`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `small_session=${cookie}` } : {}) }, body });

await check('the Tutor evidence route refuses a caller with no session and answers a signed-in learner where telemetry is not provisioned', async () => {
  assert.equal((await post(null)).status, 401, 'anonymous');
  assert.equal((await post('not-a-session')).status, 401, 'an unknown session');
  const signedIn = await post(session);
  assert.ok([202, 204].includes(signedIn.status), `signed in: ${signedIn.status}`);
  assert.equal((await fetch(`${BASE}/api/telemetry/tutor`, { headers: { cookie: `small_session=${session}` } })).status, 405, 'GET');
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto(`${BASE}/apps`);
const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
await page.waitForFunction(() => window.fetch.clientTelemetryHook === true, null, { timeout: 60000 });

await check('Settings, Privacy & security tells the learner what analytics record, scoped to analytics, with no ellipsis', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'privacy' } })));
  const notice = dialog.locator('[data-learning-analytics-notice]');
  await notice.waitFor({ timeout: 15000 });
  const text = await notice.innerText();
  assert.match(text, /internal account and canvas identifiers/);
  assert.match(text, /whether an assessed answer was met, partly met or not met/);
  assert.match(text, /do not include the text of your messages, questions or answers/);
  assert.match(text, /about analytics only: your canvases, chats and submitted answers are still stored in your account/);
  assert.match(text, /Only the .+ owner can view analytics/);
  assert.equal(/\.\.\.|…/.test(text), false, 'no ellipsis in UI text');
  assert.equal(/never stores|stores no (conversation|chat)|nothing is stored/i.test(text), false, 'no claim that the product stores no conversations');
});

await check('the notice sits in the pane that already explains sign-in, which still shows its own content', async () => {
  const pane = dialog.locator('[data-settings-pane="privacy"]');
  const text = await pane.innerText();
  assert.match(text, /Sign-in/);
  assert.match(text, /Learning analytics/);
  assert.match(text, /Log out/);
});

assert.deepEqual(pageErrors, [], 'no page errors');
console.log(`${results.length}/${total} checks passed`);
await browser.close();
if (results.length !== total) process.exit(1);
