// Landing sign-in and signed-in identity on the LOCAL integrated stack (docs/features/dive-v1.md "Run it locally"):
// the app on 8788 (dev worker + barrier) and the control plane on its own origin, SMALL_CP (8790).
// 1. Landing / and /sign-in render, passwordless; ?error= shows the contract message.
// 2. The sign-in buttons and form call the Landing contract routes (/auth/<provider>/start?next=, /auth/email/start).
//    On the app origin the P0-B barrier answers them 403 - recorded, not a failure here.
// 3. On the control plane origin the mock GitHub sign-in runs end to end; /auth/session shows a display label.
// 4. With that session the app never renders a *.rabbithole.invalid principal (Home, workspace menu, Settings).
// Usage: node e2e/landing-auth-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const APP = 'http://127.0.0.1:8788', CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
const OUT = process.argv[2] || 'landing-auth-shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const shot = async (page, name) => { await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const results = {};

// ---- 1-2: Landing on the app origin ----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${APP}/`); await page.waitForLoadState('networkidle');
  await shot(page, 'l1-landing');
  await page.goto(`${APP}/sign-in?next=%2Fapps%2Fcanvas-0a1b2c3d`); await page.waitForSelector('.auth-form');
  assert.equal(await page.locator('input[type="password"]').count(), 0, 'no password field');
  assert.equal(await page.locator('a[href="/forgot-password"]').count(), 0, 'no password links');
  await shot(page, 'l2-sign-in');
  const provider = page.waitForRequest(request => request.url().includes('/auth/github/start'));
  const providerAnswer = page.waitForResponse(response => response.url().includes('/auth/github/start'));
  await page.getByRole('button', { name: 'GitHub' }).click();
  const started = new URL((await provider).url());
  assert.equal(started.pathname, '/auth/github/start'); assert.equal(started.searchParams.get('next'), '/apps/canvas-0a1b2c3d');
  results.providerOnApp = (await providerAnswer).status();
  await page.goto(`${APP}/sign-in?next=%2Fapps`); await page.waitForSelector('.auth-form');
  await page.fill('#email', 'ada@example.com');
  const posted = page.waitForRequest(request => request.url().endsWith('/auth/email/start') && request.method() === 'POST');
  const answered = page.waitForResponse(response => response.url().endsWith('/auth/email/start'));
  await page.getByRole('button', { name: 'Continue with email' }).click();
  assert.deepEqual(JSON.parse((await posted).postData()), { email: 'ada@example.com', next: '/apps' });
  results.emailOnApp = (await answered).status();
  await page.locator('.auth-status:not([hidden])').waitFor();
  results.emailOnAppMessage = await page.locator('.auth-status').innerText();
  await shot(page, 'l3-sign-in-email-on-app-origin');
  await page.goto(`${APP}/sign-in?error=cancelled`); await page.waitForSelector('.auth-form');
  assert.equal(await page.locator('.auth-status').innerText(), 'Sign-in was cancelled.');
  await shot(page, 'l4-sign-in-error');
  await context.close();
}

// ---- 3: the mock GitHub sign-in on the control plane origin ----
const cp = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const cpPage = await cp.newPage();
await cpPage.goto(`${CP}/auth/github/start?next=%2Fapps`);
await cpPage.waitForLoadState('networkidle');
await shot(cpPage, 'l5-mock-provider');
await cpPage.getByPlaceholder('provider user id').fill(`octo-${Date.now()}`); // a GitHub account with no public email
await cpPage.locator('form button, form input[type="submit"]').first().click();
await cpPage.waitForLoadState('networkidle');
const session = (await cp.cookies()).find(cookie => cookie.name === 'small_session'); // Secure, so not listed for an http URL
assert.ok(session, 'the mock GitHub sign-in set a session');
const display = await cpPage.evaluate(async () => (await fetch('/auth/session')).json());
assert.equal(display.signedIn, true); assert.equal(display.provider, 'github');
assert.doesNotMatch(JSON.stringify(display), /rabbithole\.invalid/, '/auth/session never returns the principal');
const principal = await cpPage.evaluate(async () => (await (await fetch('/api/apps')).json()).email);
results.principal = principal; results.display = display.display;
await cp.close();

// ---- 4: the app with that session never renders the principal ----
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session.value, url: APP }]);
  const page = await context.newPage();
  const clean = async label => assert.doesNotMatch(await page.locator('body').innerText(), /rabbithole[.-]invalid/i, `${label}: a principal is rendered`);
  await page.goto(`${APP}/apps`); await page.waitForTimeout(2500);
  await clean('Home'); await shot(page, 'l6-home-oauth-user');
  const workspace = page.locator('button').filter({ hasText: /Personal/ }).first();
  if (await workspace.count()) { await workspace.click(); await page.waitForTimeout(400); await clean('workspace menu'); await shot(page, 'l7-workspace-menu'); }
  const settings = page.getByText('Settings', { exact: true }).first(); // in the workspace menu
  if (await settings.count()) {
    await settings.click(); await page.waitForTimeout(800); await clean('Settings'); await shot(page, 'l8-settings');
    const identity = page.getByRole('button', { name: /Identity/ }).first();
    if (await identity.count()) { await identity.click(); await page.waitForTimeout(500); await clean('Settings identity'); await shot(page, 'l9-settings-identity'); }
  }
  results.appChecked = true;
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2).replace(/"principal": "[^"]*"/, match => match.includes('rabbithole.invalid') ? '"principal": "<internal *.rabbithole.invalid principal>"' : match));
