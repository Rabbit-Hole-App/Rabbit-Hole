// Real end-to-end Ask-selection -> Explain on canvas against the live dev
// backend through the unminified vite dev server on :5187.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const session = process.env.SMALL_SESSION?.trim() || readFileSync(process.env.SMALL_SESSION_FILE, 'utf8').trim();
const question = process.argv[2] || 'What does this show?';
const browser = await chromium.launch({ args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: 'localhost', path: '/' }]);
const page = await context.newPage();
page.on('pageerror', error => console.log('PAGEERROR:', error.stack?.split('\n').slice(0, 6).join('\n') || error.message));
page.on('console', message => { if (message.type() === 'error') console.log('CONSOLE:', message.text().slice(0, 300)); });

await page.goto('http://localhost:5187/apps');
await page.waitForTimeout(4000);
const row = page.getByText('karpathy/nanoGPT').first();
await row.waitFor({ timeout: 20000 });
await row.click();
await page.waitForTimeout(2500);
const learn = page.getByRole('button', { name: 'Learn' }).first();
if (await learn.isVisible().catch(() => false)) await learn.click();
await page.locator('input[aria-label="Lesson timeline"]').waitFor({ timeout: 30000 });
await page.waitForTimeout(5000); // lesson auto-start settles

// Select the first geo tile with the corner-drag gesture.
const tile = page.locator('.tl-shape[data-shape-type="geo"]').first();
await tile.waitFor({ timeout: 20000 });
const tb = await tile.boundingBox();
await page.getByRole('button', { name: 'Ask about selection' }).click();
await page.locator('svg[aria-label="Drag selection ellipse"]').waitFor();
await page.mouse.move(tb.x - 25, tb.y - 25);
await page.mouse.down();
await page.mouse.move(tb.x + tb.width + 25, tb.y + tb.height + 25, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Ask about:/ }).first().click();
console.log('selection confirmed; marker on canvas:', await page.locator('.tl-shape[data-shape-type="line"]').count());

// Ask in chat and wait for the real model answer.
const composer = page.locator('input[placeholder]').last();
await composer.fill(question);
await composer.press('Enter');
console.log('question sent; waiting for answer...');
const explain = page.getByRole('button', { name: /Explain on canvas/i }).first();
await explain.waitFor({ timeout: 240000 });
console.log('answer arrived; requesting canvas explanation...');
await explain.click();

// Wait for either drawn assistant shapes or a chat error line.
const start = Date.now();
let outcome = 'timeout';
while (Date.now() - start < 300000) {
  const errorLine = await page.locator('text=/✗ /').last().textContent().catch(() => null);
  if (errorLine) { outcome = 'ERROR: ' + errorLine.slice(0, 200); break; }
  if (await page.getByText('Agent explanation · lesson paused', { exact: false }).isVisible().catch(() => false)) { outcome = 'BOARD RENDERED'; break; }
  await page.waitForTimeout(1500);
}
console.log('outcome:', outcome);
if (outcome === 'BOARD RENDERED') {
  await page.waitForTimeout(2500);
  console.log('assistant shapes on canvas:', await page.evaluate(() => document.querySelectorAll('.tl-shape').length));
  console.log('playback controls hidden:', !(await page.getByRole('button', { name: 'Next lesson' }).isVisible().catch(() => false)));
  console.log('Save to notes visible:', await page.getByRole('button', { name: 'Save to notes' }).isVisible().catch(() => false));
  console.log('Resume lesson visible:', await page.getByRole('button', { name: 'Resume lesson' }).isVisible().catch(() => false));
}
await page.screenshot({ path: process.env.SHOT_PATH || 'explain-e2e.png', fullPage: false });
await browser.close();
