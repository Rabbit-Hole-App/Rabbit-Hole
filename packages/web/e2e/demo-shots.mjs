// Capture each authored demo scene at the moment its teaching point lands.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

const base = 'https://small-cp-dev.tryrabbithole.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('RABBIT_HOLE_DEV_TEST_BYPASS missing from .env');
const login = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-demo-shots' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });

// each: menu label, the seconds to sample, output file
const shots = [
  ['Animation: pinned axis', ['3.2', '7.2', '11.6'], 'axis'],
  ['Animation: residual', ['6', '9', '12.6'], 'residual'],
  ['Animation: sigmoid', ['3', '8', '11.6'], 'sigmoid'],
];

for (const [label, times, slug] of shots) {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('input[aria-label="Animation time"]').waitFor({ timeout: 8000 });
  for (const t of times) {
    await node.locator('input[aria-label="Animation time"]').fill(t);
    await page.waitForTimeout(700);
    await node.screenshot({ path: `e2e/shots/demo-${slug}-${t.replace('.', 'p')}.png` });
  }
  console.log(`captured ${slug}`);
}
await browser.close();
