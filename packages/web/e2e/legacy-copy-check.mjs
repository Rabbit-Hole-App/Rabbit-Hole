// The retired CLI/BYOC copy is unreachable in a Rabbit Hole build (owner 2026-10-26; CLAUDE.md "Retired areas"): the Library's
// 'No apps yet - small deploy ships the first one' empty state (App.jsx), the Sidebar's '+ New > App' how-to-ship dialog and
// Settings' Developer tab (Sidebar.jsx). A brand-new user has no apps, which is exactly when the legacy empty state would show.
// Against the LOCAL stack only: local D1, a fresh browser profile, every model route aborted. Prints no secrets.
// Not covered here: run.jsx's 'Deploy this job with small deploy' needs a legacy hosting:'aws' app row, which Rabbit Hole cannot create.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/legacy-copy-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { usageFeature } from '../../control-plane/src/learn-usage.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('legacy-copy-check runs against the local stack only');
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `legacy-${run}@example.com`, secret, handle: `legacy_${run}` }) })).json()).session;
assert.ok(session, 'no test session');

// Every phrase the legacy surfaces print (App.jsx, Sidebar.jsx, run.jsx). One match anywhere on a page fails it.
const LEGACY = /small deploy|small login|npm i -g|Install the CLI|Get the CLI|CLI for hosted Small|private CLI|from your terminal|No apps yet|Deploy this job with/i;
const modelRoute = (method, path) => /^\/api\/ask(\/|$)/.test(path) || !!usageFeature(method, path);
const browser = await chromium.launch();
const errors = [];
const fresh = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/api/**', (route) => (modelRoute(route.request().method(), new URL(route.request().url()).pathname) ? route.abort() : route.fallback()));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
};
const open = async (page, path) => { await page.goto(`${BASE}${path}`); await page.locator('[data-account-menu]').waitFor({ timeout: 60000 }); await page.waitForTimeout(1500); };
const clean = async (page, label) => { const hit = (await page.locator('body').innerText()).match(LEGACY); assert.equal(hit, null, `${label} shows legacy copy "${hit?.[0]}"`); };
const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); } catch (error) { failures.push(label); console.log(`FAIL ${label}: ${error.message.split('\n').slice(0, 6).join(' / ')}`); }
};

await check('1 an empty Library (All and the Apps type) shows no CLI empty state, and the sidebar has no + New menu with its App dialog', async () => {
  const page = await fresh();
  for (const path of ['/apps', '/apps?type=apps']) {
    await open(page, path);
    assert.ok(await page.locator('[data-sidebar]').count(), `${path}: the sidebar did not render, so the check would be vacuous`);
    await clean(page, path);
    assert.equal(await page.getByRole('button', { name: 'New', exact: true }).count(), 0, `${path}: the legacy + New menu is back`);
    assert.equal(await page.getByText('New app', { exact: true }).count(), 0, `${path}: the New app dialog is open`);
  }
  await page.context().close();
});

await check('2 Settings opened on the retired Developer tab (small:settings event and ?settings=developer) shows only the learning panes', async () => {
  const dialog = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
  const tabs = (page) => dialog(page).getByRole('navigation', { name: 'Settings sections' }).getByRole('button').allInnerTexts();
  let page = await fresh();
  await open(page, '/apps');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'developer' } })));
  await dialog(page).waitFor({ timeout: 10000 });
  const byEvent = (await tabs(page)).map((n) => n.trim());
  assert.ok(!byEvent.includes('Developer'), `the event opened a Developer tab: ${byEvent}`);
  await clean(page, 'Settings (event)');
  await page.context().close();
  page = await fresh();
  await open(page, '/apps?settings=developer');
  await dialog(page).waitFor({ timeout: 10000 });
  assert.deepEqual((await tabs(page)).map((n) => n.trim()), byEvent, 'the deep link opened different panes');
  await clean(page, 'Settings (?settings=developer)');
  await page.context().close();
});

await browser.close();
const fatal = errors.filter((e) => !/ResizeObserver/.test(e));
if (fatal.length) { console.log(`page errors:\n${fatal.join('\n')}`); process.exitCode = 1; }
const total = 2;
console.log(`${results.length}/${total} legacy-copy checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
if (results.length !== total) process.exitCode = 1;
