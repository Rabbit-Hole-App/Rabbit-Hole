import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Every option in the canvas + menu (dev only) on the parallel clone: each one
// inserts a card that renders without a page error, the canvas survives, and
// Video plays its clip. The extra animations and Pipeline builder are gone.
// No model calls (nothing is generated). Prints no secrets.
// usage: node e2e/canvas-block-menu.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `block-menu-${Date.now()}`.slice(0, 32);
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'block-menu-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
let errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.getByRole('toolbar').first().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

const plus = page.getByRole('button', { name: 'Insert lesson block' });
const menu = page.getByRole('menu', { name: 'Lesson blocks' });
await plus.click();
const labels = await menu.getByRole('menuitem').allInnerTexts();
await plus.click();
const gone = ['Animation: pinned axis', 'Animation: residual', 'Animation: sigmoid', 'Pipeline builder'];
check('the + menu keeps one Animation and drops the other three and Pipeline builder', labels.includes('Animation') && gone.every(label => !labels.includes(label)), `${labels.length} options`);

for (const label of labels) {
  errors = [];
  const before = await page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.dataset.blockId));
  await plus.click();
  await menu.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForTimeout(2500);
  const added = (await page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.dataset.blockId))).filter(id => !before.includes(id));
  const alive = await page.getByRole('menubar', { name: 'Canvas menu' }).count() === 1;
  const card = added.length ? page.locator(`[data-block-id="${added[0]}"]`) : null;
  const height = card ? (await card.boundingBox())?.height || 0 : 0;
  let detail = `${added.length ? `${Math.round(height)}px tall` : 'no card'}${errors.length ? `; ${errors.join(' | ')}` : ''}`;
  // A card that renders but says a service is missing is not working either.
  const unconfigured = card ? /not configured/i.test(await card.innerText()) : false;
  if (unconfigured) detail += '; says a service is not configured';
  let ok = added.length === 1 && alive && errors.length === 0 && height > 40 && !unconfigured;
  if (label === 'Video' && card) {
    const video = card.locator('video');
    const playable = await video.evaluate(node => new Promise(resolve => {
      if (node.readyState >= 1) return resolve(true);
      node.addEventListener('loadedmetadata', () => resolve(true), { once: true });
      node.addEventListener('error', () => resolve(false), { once: true });
      setTimeout(() => resolve(node.readyState >= 1), 15000);
    })).catch(() => false);
    ok = ok && playable;
    detail += playable ? '; the clip loads' : '; the clip does not load';
  }
  if (SHOTS && card) await card.screenshot({ path: `${SHOTS}/block-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` }).catch(() => {});
  check(`+ ${label}`, ok, detail);
}

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
