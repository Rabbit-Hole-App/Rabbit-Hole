// Home has no ask (docs/features/home-ask.md; owner, 2026-10-22: "Remove the composer completely from Home, Library and Explore"),
// in the browser, against the LOCAL stack only. It used to type seven questions into the Home composer and prove which answered
// in place and which started a Rabbit Hole; with the composer gone it proves there is nothing to type into, that no ask, home-ask
// or canvas creation is made by visiting or using the pages, and that Start a rabbit hole still opens its dialog. No model call:
// the answer routes are scripted. Every canvas creation (POST /api/canvases) is refused and counted.
//   PRACTICE_BASE=http://127.0.0.1:8788 SMALL_CP=http://127.0.0.1:8790 node e2e/home-ask-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.PRACTICE_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('home-ask-check runs against the local stack only');
const OUT = process.argv[2] || 'home-ask-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.PRACTICE_EMAIL || 'owner@example.com', secret }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const asked = [], created = [], oldAgent = [];
await page.route('**/api/learn/home-ask', async route => {
  const { message } = route.request().postDataJSON();
  asked.push(message);
  const library = /canvases do i have|where did i learn/i.test(message);
  await route.fulfill({ json: { answer: library ? 'You have **karpathy/nanoGPT**.' : `A short answer to: ${message}`, references: library ? [{ name: 'repo-nanogpt', kind: 'project', title: 'karpathy/nanoGPT' }] : [], offer_rabbit_hole: !library } });
});
await page.route('**/api/canvases', route => { if (route.request().method() === 'POST') { created.push(route.request().postDataJSON()); return route.abort(); } return route.continue(); });
await page.route(/\/api\/ask(\?|$)/, route => { if (route.request().method() === 'POST') { oldAgent.push(route.request().url()); return route.abort(); } return route.continue(); });

const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

const results = [];
for (const path of ['/apps', '/library', '/explore']) {
  await page.goto(`${BASE}${path}`); await page.waitForTimeout(3000);
  const composers = await page.locator('[data-agent-bar], main textarea, main [data-chat-composer]').count();
  assert.equal(composers, 0, `${path}: a composer shows`);
  await page.keyboard.press('Control+j'); await page.keyboard.press('Control+o');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'), false, `${path}: a shortcut focused a text area`);
  results.push([path, 'no composer']);
  await shot(`${results.length}-no-composer`);
}
// Start a rabbit hole is the creation path: it opens its dialog and creates nothing by itself.
await page.goto(`${BASE}/apps`); await page.waitForTimeout(3000);
await page.getByRole('button', { name: 'Start a rabbit hole' }).first().click();
await page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true }).waitFor({ timeout: 10000 });
assert.equal(created.length, 0, 'opening Start creates nothing');
await shot('4-start-dialog');
assert.deepEqual(asked, [], 'no Home ask is made');
assert.deepEqual(oldAgent, [], 'the old apps agent is never asked');
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, results, created: created.map(c => c.title) }));
await browser.close();
