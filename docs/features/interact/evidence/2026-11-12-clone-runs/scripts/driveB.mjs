// Owner-authorised (2026-11-12) Playwright, dev clone only. Stage B: open the existing canvas, press the failed card's Retry (render again, no model call), wait for ready, screenshot.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [OUT, app, boardId, jobId, cardId] = process.argv.slice(2);
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const get = async p => { const r = await fetch(BASE + p, { headers: { ...UA, cookie: `small_session=${session}` } }); return r.json().catch(() => null); };
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${app}`);
const card = page.locator(`[data-block-id="${cardId}"]`);
await card.waitFor({ timeout: 90000 });
await page.screenshot({ path: `${OUT}/b0-failed-card.png` });
const retry = card.locator('[data-explain-retry]');
await retry.waitFor({ timeout: 30000 });
await retry.click();
console.log('retry clicked at', new Date().toISOString());
const sleep = ms => new Promise(r => setTimeout(r, ms)); const t0 = Date.now(); let job;
while (Date.now() - t0 < 900000) { job = (await get(`/api/learn/explain/jobs/${jobId}?board=${boardId}`))?.job; console.log(new Date().toISOString(), job?.stage, job?.attempt, job?.stopReason || ''); if (job?.terminal) break; await sleep(8000); }
console.log('job end', JSON.stringify({ stage: job?.stage, stop: job?.stopReason, failure: job?.failure?.message?.slice(0, 200) }));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/b1-after-retry.png` });
await browser.close();
