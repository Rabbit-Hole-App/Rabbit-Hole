// Owner-authorised (2026-11-12, B) Playwright, dev clone only. On the run-10 canvas: screenshot the interactive card as it re-renders now, send the written /explain,
// press Generate on its proposal if one appears, wait for the written card (a tutor diagram), screenshot both cards.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [OUT, app, interactCardId] = process.argv.slice(2);
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const PROMPT = '/explain Why does a ball thrown straight up still accelerate at the top? Include a flow diagram.';
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)));
page.on('request', r => { if (/\/api\//.test(r.url()) && r.method() === 'POST') console.log(new Date().toISOString(), 'REQ POST', r.url().replace(BASE, '').slice(0, 100)); });
page.on('response', async r => { if (/\/api\/learn\/(explanation|explain)/.test(r.url()) && r.request().method() === 'POST') console.log('RES', r.status(), r.url().replace(BASE, '').slice(0, 80), (await r.text().catch(() => '')).slice(0, 220)); });
await page.goto(`${BASE}/apps/${app}`);
await page.locator(`[data-block-id="${interactCardId}"]`).waitFor({ timeout: 90000 });
await page.waitForTimeout(5000);
await page.locator(`[data-block-id="${interactCardId}"]`).screenshot({ path: `${OUT}/s1-interactive-card-now.png` });
console.log('interactive card shot');
await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 90000 });
const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
await box.click(); await box.fill(PROMPT); await page.waitForTimeout(200); await box.press('Enter');
console.log('sent', new Date().toISOString());
await page.waitForTimeout(8000); await page.screenshot({ path: `${OUT}/w1-after-send.png` });
for (let i = 0; i < 3; i += 1) {
  const gen = page.locator('[data-proposal-generate]').last();
  if (await gen.count() && await gen.isEnabled().catch(() => false)) { console.log('proposal card; clicking Generate'); await gen.evaluate(el => el.click()).catch(e => console.log('gen click', String(e).slice(0, 80))); break; }
  await page.waitForTimeout(5000);
}
const t0 = Date.now(); let diag = 0;
while (Date.now() - t0 < 480000) {
  await page.waitForTimeout(8000);
  diag = await page.locator('[data-tutor-diagram]').count();
  console.log(new Date().toISOString(), 'blocks', await page.locator('[data-block-id]').count(), 'diagrams', diag);
  if (diag) break;
}
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/w2-canvas-after-written.png` });
const written = page.locator('[data-block-id]').filter({ has: page.locator('[data-tutor-diagram]') }).first();
if (await written.count()) { await written.screenshot({ path: `${OUT}/s2-written-card.png` }); console.log('written card shot'); }
await browser.close();
