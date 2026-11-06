// The learner notice in Settings, Privacy & security (telemetry brief Task 12, owner decision N2 of the Tutor cleanup, P3) against
// the LOCAL stack only. The Tutor evidence route (/api/telemetry/tutor) and its events are gone; this checks what a browser can
// show without a model: the notice names only what analytics still record, and sits in the pane that explains sign-in.
// No model request is made.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/tutor-telemetry-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-telemetry-check runs against the local stack only');
const email = `tutortel-${Date.now().toString(36)}@example.com`;
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();

const total = 2;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.goto(`${BASE}/apps`);
const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
await page.waitForFunction(() => window.fetch.clientTelemetryHook === true, null, { timeout: 60000 });
// The hook is installed before React renders; the Shell's `small:settings` listener (Sidebar.jsx) registers only when the sidebar
// mounts, and an earlier event is dropped, not queued. Wait for the signed-in sidebar first, as rabbit-hole-check.mjs does.
await page.locator('aside').getByText(email, { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 });

await check('Settings, Privacy & security tells the learner what analytics record, scoped to analytics, naming no Tutor event, with no ellipsis', async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'privacy' } })));
  const notice = dialog.locator('[data-learning-analytics-notice]');
  await notice.waitFor({ timeout: 15000 });
  const text = await notice.innerText();
  assert.match(text, /internal account and canvas identifiers/);
  assert.equal(/Tutor action|reason code|which suggestions were shown|claims were in each state/.test(text), false, 'no Tutor event is described: none is recorded');
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
