// The owner's telemetry dashboard as the OWNER sees it, against the LOCAL stack only (docs/features/telemetry.md "Owner dashboard and
// access"). integ-local.jsonc sets SUBSCRIPTION_OWNER_EMAIL to the owner address and binds no telemetry database, so this proves the
// state a deployment is in before telemetry is provisioned: the owner is let in (API 200, "Telemetry" in the account menu, the page
// loads) and told that storage is not configured, the Action explorer is reachable, and the other identity (yudhisteer.chin01, never
// the owner) and a signed-out caller get 404 on the API and "Not found." on the page. It does NOT show events, costs or errors: those
// need a bound TELEMETRY_DB, which the local stack must not have (client-telemetry-check.mjs relies on that). Those views are covered by
// the control-plane unit tests on node:sqlite fixtures and, once provisioned, by the dev deployment. No model request is made.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/owner-telemetry-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('owner-telemetry-check runs against the local stack only');
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const OWNER = 'yudhisteer.chin@gmail.com', NOT_OWNER = 'yudhisteer.chin01@gmail.com';
const login = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const [owner, other] = [await login(OWNER), await login(NOT_OWNER)];
assert.ok(owner && other, 'both test sessions');

const total = 4;
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const api = (path, cookie, init = {}) => fetch(`${BASE}/api/owner/telemetry${path}`, { ...init, headers: cookie ? { cookie: `small_session=${cookie}` } : {} });

await check('the owner is let in to the API and told storage is not configured; the other address and a signed-out caller get 404', async () => {
  const access = await api('/access', owner);
  assert.equal(access.status, 200, 'owner access');
  // The local stack's SMALL_ENV is "test", which the environment label falls back to; with no TELEMETRY_DB it is still not configured.
  assert.deepEqual(await access.json(), { owner: true, configured: false, environment: 'test' });
  for (const path of ['/overview', '/health', '/client-errors', '/learning']) {
    const answered = await api(path, owner);
    assert.equal(answered.status, 200, path);
    assert.equal((await answered.json()).configured, false, path);
  }
  assert.equal((await api('/project', owner, { method: 'POST' })).status, 200, 'project');
  for (const path of ['/access', '/overview', '/health', '/client-errors', '/learning']) {
    assert.equal((await api(path, other)).status, 404, `${NOT_OWNER} ${path}`);
    assert.equal((await api(path, null)).status, 404, `signed out ${path}`);
  }
});

const browser = await chromium.launch();
const open = async cookie => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: cookie, url: BASE }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
};
const accountMenu = page => page.locator('aside [data-account-menu]');

await check('the owner finds Telemetry in the account menu and its page says storage is not configured, with the Action explorer', async () => {
  const { context, page, errors } = await open(owner);
  await page.goto(`${BASE}/apps`);
  await accountMenu(page).waitFor({ timeout: 60000 });
  await accountMenu(page).click();
  await page.getByRole('button', { name: 'Telemetry', exact: true }).click();
  await page.waitForURL(`${BASE}/owner/telemetry`, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Telemetry', exact: true }).waitFor({ timeout: 30000 });
  await page.getByText('Telemetry storage is not configured on this deployment.').waitFor({ timeout: 30000 });
  await page.getByRole('heading', { name: 'Action explorer' }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByText('Browser errors').count(), 0, 'no data sections without storage');
  const text = await page.locator('main').innerText();
  assert.equal(/\.\.\.|…/.test(text), false, 'no ellipsis in the page text');
  assert.deepEqual(errors, [], 'no page errors');
  await context.close();
});

await check('the Action explorer answers an unknown action id for the owner without an error', async () => {
  const { context, page, errors } = await open(owner);
  await page.goto(`${BASE}/owner/telemetry`);
  await page.getByRole('heading', { name: 'Action explorer' }).waitFor({ timeout: 60000 });
  await page.getByLabel('Action id or support reference').fill('act-owner-check-unknown');
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await page.getByText('Not found.').waitFor({ timeout: 15000 });
  assert.deepEqual(errors, [], 'no page errors');
  await context.close();
});

await check('the other address sees no Telemetry menu entry and the page says Not found.', async () => {
  const { context, page } = await open(other);
  await page.goto(`${BASE}/apps`);
  await accountMenu(page).waitFor({ timeout: 60000 });
  await accountMenu(page).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 10000 }); // the menu is open
  assert.equal(await page.getByRole('button', { name: 'Telemetry', exact: true }).count(), 0, 'no menu entry');
  await page.goto(`${BASE}/owner/telemetry`);
  await page.getByText('Not found.').waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('heading', { name: 'Action explorer' }).count(), 0);
  await context.close();
});

console.log(`${results.length}/${total} checks passed`);
await browser.close();
if (results.length !== total) process.exit(1);
