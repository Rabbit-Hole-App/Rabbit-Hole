// Focused probe for the Blender scene and the graph block: prints whatever
// error the UI shows instead of only timing out.
// Run: node e2e/scene-graph-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.tryrabbithole.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const login = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-scene-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.addInitScript(() => { try { for (const key of Object.keys(localStorage)) if (key.startsWith('small.adaptive-canvas:')) localStorage.removeItem(key); } catch {} });
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });

// graph block
await page.locator('[aria-label="Insert lesson block"]').click();
await page.getByRole('menuitem', { name: 'Graph', exact: true }).click();
const graph = canvas.locator('[data-block-id]').last();
try {
  await graph.locator('[data-graph-node]').first().waitFor({ timeout: 15000 });
  console.log(`ok: graph renders (${await graph.locator('[data-node-dot]').count()} nodes)`);
} catch { console.log('FAIL: graph did not render'); }

// blender scene
await page.locator('[aria-label="Insert lesson block"]').click();
await page.getByRole('menuitem', { name: 'Blender scene' }).click();
const scene = canvas.locator('[data-block-id]').last();
await scene.locator('[data-generate-scene]').click();
const started = Date.now();
let done = false;
while (Date.now() - started < 420000) {
  if (await scene.locator('canvas').count()) { console.log(`ok: scene rendered after ${Math.round((Date.now() - started) / 1000)}s`); done = true; break; }
  const text = await scene.innerText();
  const error = text.split('\n').find(line => /could not|error|failed|unexpected|invalid|required/i.test(line));
  if (error) { console.log(`FAIL: scene error — ${error}`); done = true; break; }
  await page.waitForTimeout(5000);
}
if (!done) console.log(`FAIL: scene still pending after 420s — last state: ${(await scene.innerText()).split('\n').slice(-2).join(' | ')}`);
await page.screenshot({ path: 'e2e/shots/scene-graph.png' });
await browser.close();
