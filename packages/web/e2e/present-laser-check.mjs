import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// Present mode's laser pointer on the parallel clone: on by default, a red dot
// at the pointer with a fading trail, L and the bar's Laser toggle it; and a
// canvas with no sections shows no Contents rail. No model calls.
// usage: node e2e/present-laser-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'laser-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=laser-${Date.now().toString(36)}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
ok('a canvas with no sections shows no Contents rail', await page.locator('[data-contents-rail]').count() === 0);
// Present needs something on the canvas: add one card.
await page.getByRole('button', { name: 'Insert lesson block' }).click();
await page.getByRole('menu', { name: 'Lesson blocks' }).getByRole('menuitem', { name: 'Explanation', exact: true }).click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Present' }).click();
await page.locator('[data-laser-toggle]').waitFor({ timeout: 10000 });
ok('presenting turns the laser on by default', await page.locator('canvas[data-laser]').count() === 1 && await page.locator('[data-laser-toggle]').getAttribute('aria-pressed') === 'true');
const box = await page.locator('canvas[data-laser]').boundingBox();
for (let i = 0; i <= 12; i++) await page.mouse.move(box.x + 300 + i * 25, box.y + 300 + Math.sin(i / 2) * 40, { steps: 2 });
await page.waitForTimeout(60);
const red = await page.locator('canvas[data-laser]').evaluate((node, at) => {
  const scale = node.width / node.getBoundingClientRect().width;
  const [r, g, b, a] = node.getContext('2d').getImageData(Math.round(at.x * scale), Math.round(at.y * scale), 1, 1).data;
  return { r, g, b, a };
}, { x: 300 + 12 * 25, y: 300 + Math.sin(6) * 40 });
ok('the dot is drawn at the pointer', red.a > 0 && red.r > 200, JSON.stringify(red));
ok('the system cursor is hidden over the canvas', await page.locator('canvas[data-laser]').evaluate(node => node.parentElement.style.cursor === 'none'));
await page.screenshot({ path: `${SHOTS}/present-laser.png` });
await page.keyboard.press('l');
ok('L turns it off, and the cursor comes back', await page.locator('canvas[data-laser]').count() === 0 && await page.locator('[data-laser-toggle]').getAttribute('aria-pressed') === 'false');
await page.locator('[data-laser-toggle]').click();
ok('the Laser button turns it back on', await page.locator('canvas[data-laser]').count() === 1);
await browser.close();
process.exit(failed ? 1 : 0);
