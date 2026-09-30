import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// The Learn canvas's feedback button on the parallel clone: lower left, beside
// the zoom controls, never over the composer; Bug / Idea, text, Submit stores
// one report (201) and the button confirms in place. Sends one real report.
// usage: node e2e/feedback-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'feedback-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  await page.goto(`${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=feedback-${Date.now().toString(36)}`);
  const button = page.locator('[data-feedback]');
  await button.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  const boxes = await page.evaluate(() => {
    const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom }; };
    return { button: box(document.querySelector('[data-feedback]')), zoom: box(document.querySelector('[data-zoom]')), composer: box(document.querySelector('[data-learn-dock] [data-chat-composer]')), vw: innerWidth, vh: innerHeight };
  });
  const overlaps = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  ok(`${label}: the button sits lower left, beside the zoom controls, over nothing`, boxes.button.x < boxes.vw / 2 && boxes.button.y > boxes.vh * 0.6 && !overlaps(boxes.button, boxes.zoom) && !overlaps(boxes.button, boxes.composer), JSON.stringify(boxes.button));
  if (label === 'phone') { await context.close(); continue; }
  await button.click();
  const panel = page.locator('[data-feedback-panel]');
  await panel.waitFor();
  await panel.getByRole('radio', { name: 'Suggest a feature' }).click();
  await panel.locator('textarea').fill('Feedback check: the Slash commands sheet could open from the / picker too.');
  await page.screenshot({ path: `${SHOTS}/feedback-panel.png` });
  const [response] = await Promise.all([page.waitForResponse(r => r.url().includes('/api/learn/feedback')), panel.locator('[data-feedback-submit]').click()]);
  ok('Submit stores the report', response.status() === 201, `${response.status()} ${JSON.stringify(await response.json())}`);
  ok('the button confirms in place (no corner toast) and the panel closes', await panel.count() === 0 && (await button.getAttribute('title')) === 'Sent, thank you');
  await page.screenshot({ path: `${SHOTS}/feedback-sent.png` });
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
