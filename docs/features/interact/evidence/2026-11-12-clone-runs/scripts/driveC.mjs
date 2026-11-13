// Owner-authorised (2026-11-12) Playwright, dev clone only. Stage C: open the canvas with the ready card, explore its controls, screenshot at rest / mid-play / Top marker / after reload.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [OUT, app, cardId] = process.argv.slice(2);
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1700 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)));
const open = async tag => {
  await page.goto(`${BASE}/apps/${app}`);
  const card = page.locator(`[data-block-id="${cardId}"]`);
  await card.waitFor({ timeout: 90000 });
  await page.waitForTimeout(5000);
  await card.screenshot({ path: `${OUT}/${tag}-card.png` }).catch(e => console.log('card shot', String(e).slice(0, 120)));
  await page.screenshot({ path: `${OUT}/${tag}-page.png` });
  return card;
};
const card = await open('c1-at-rest');
const rangeValue = () => card.locator('input[type=range]').first().inputValue();
const shot = async tag => { await card.screenshot({ path: `${OUT}/${tag}-card.png` }).catch(e => console.log('shot', tag, String(e).slice(0, 100))); await page.screenshot({ path: `${OUT}/${tag}-page.png` }); };
console.log('at rest: range', await rangeValue());
await card.locator('[data-animation-play]').click();
await page.waitForTimeout(2200);
console.log('mid-play: range', await rangeValue(), 'button', await card.locator('[data-animation-play]').innerText());
await shot('c2-mid-play');
await page.waitForTimeout(6500);
console.log('after play: range', await rangeValue(), 'button', await card.locator('[data-animation-play]').innerText());
await shot('c3-ended');
const apex = String(3 / 9.8);
await card.locator('input[type=range]').first().evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, apex);
await page.waitForTimeout(1200);
console.log('scrubbed: range', await rangeValue());
await shot('c4-top-marker');
console.log('card text at top:', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 700));
// after reload
const card2 = await open('c5-after-reload');
await shot('c5-after-reload');
await card2.locator('[data-animation-play]').click();
await page.waitForTimeout(2200);
console.log('after reload play: range', await card2.locator('input[type=range]').first().inputValue());
await shot('c6-after-reload-playing');
await browser.close();
