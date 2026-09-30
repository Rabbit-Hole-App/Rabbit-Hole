// T12: verify the DEPLOYED review board in a clean browser context - loaded
// client build, seed version, four cards, real interactions, composer
// request path, stale-storage safety - and capture the handoff screenshots.
// Usage: node e2e/t12-deployed-check.mjs https://small-cp-dev-small-deploy.tryrabbithole.workers.dev
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

const base = process.argv[2];
if (!base) throw new Error('pass the deployed base URL');
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-t12-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');

// Loaded-build identity: the shipped index.html names its hashed bundle; the
// page must actually be RUNNING that bundle, so we read both the served HTML
// and the script the loaded page executed.
const html = await (await fetch(`${base}/`, { headers: { 'User-Agent': 'small-t12-check' } })).text();
const servedBundle = html.match(/\/static\/[^"]+\.js/)?.[0];
if (!servedBundle) throw new Error('no bundle reference in served index.html');
const localIndex = 'dist-dev/index.html';
const localBundle = existsSync(new URL(`../${localIndex}`, import.meta.url))
  ? readFileSync(new URL(`../${localIndex}`, import.meta.url), 'utf8').match(/\/static\/[^"]+\.js/)?.[0]
  : null;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 4400 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
const learnRequests = [];
page.on('request', request => { if (request.url().includes('/api/learn/ask')) learnRequests.push(JSON.parse(request.postData() || '{}')); });

// T12.5 first: a browser carrying OLD review storage must not hide the new
// seed - plant junk under a previous seed-version key before first visit.
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const anyKey = Object.keys(localStorage).find(k => k.startsWith('small.adaptive-canvas:'));
  if (!anyKey) return;
  const prefix = anyKey.split(':').slice(0, 4).join(':');
  localStorage.setItem(`${prefix}:interactive-app-review:s7`, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'stale-junk', type: 'heading', dx: 0, dy: 0, text: 'STALE OLD SEED', level: 1 }] }));
});

const boardUrl = `${base}/apps/repo-06745f10-nanogpt?tab=learn&board=interactive-app-review`;
await page.goto(boardUrl);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
const loadedBundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/')));
console.log('served bundle:', servedBundle, '| loaded:', loadedBundle, '| local dist-dev:', localBundle ?? '(no local build read)');
if (loadedBundle !== servedBundle) throw new Error('loaded page is not running the served bundle');
if (localBundle && loadedBundle !== localBundle) throw new Error(`deployed bundle ${loadedBundle} differs from the local build ${localBundle} - stale deploy`);

await page.getByText('query: river').waitFor({ timeout: 30000 });
const cards = await canvas.locator('[data-block-id]:not([data-chat-block])').count();
if (cards !== 4) throw new Error(`expected 4 cards, found ${cards}`);
if (await page.getByText('STALE OLD SEED').count()) throw new Error('old seed-version storage leaked into the new board');
let seedKey = null;
for (let attempt = 0; attempt < 15 && !seedKey; attempt += 1) {
  await page.waitForTimeout(400); // the board blob write is debounced
  seedKey = await page.evaluate(() => Object.keys(localStorage).find(k => /:interactive-app-review:s8$/.test(k)));
}
if (!seedKey) throw new Error('seed-version-8 storage key missing');
console.log('board: 4 cards, seed s8, stale s7 storage ignored');

// Unknown board name reports itself instead of a silent blank.
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=no-such-board-xyz`);
await page.getByText('No review board is registered as').waitFor({ timeout: 20000 });
await page.goto(boardUrl);
await canvas.waitFor({ timeout: 30000 });
await page.getByText('query: river').waitFor({ timeout: 30000 });
console.log('unknown board name: visible notice, then back to the review board');

mkdirSync('e2e/shots/t12', { recursive: true });
const blockIds = await canvas.locator('[data-block-id]:not([data-chat-block])').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-block-id')));
const [i01, i02, i03, i04] = blockIds;
const card = id => page.locator(`[data-block-id="${id}"]`);

// --- I01 on the deployed page: query picker + mask toggle (the one query
// control is the INTERACT picker; the tokens in the visual are labels) ---
await card(i01).locator('[data-input-control="queryIndex"][data-input-value="2"]').click();
await page.getByText('query: south').waitFor({ timeout: 5000 });
await card(i01).locator('[data-input-control="maskEnabled"]').click();
await page.waitForTimeout(500);
await card(i01).screenshot({ path: 'e2e/shots/t12/i01-south-mask-off-light.png' });
await card(i01).locator('[data-input-control="maskEnabled"]').click();
await page.waitForTimeout(400);
console.log('I01: query picker + mask toggle live on the deployed page');

// --- I02 ---
await card(i02).locator('[data-scene-item="5"]').first().click();
await page.getByText('Patch 6 of 16 · row 2, column 2').waitFor({ timeout: 5000 });
await card(i02).locator('[data-input-step="patchIndex:next"]').click();
await page.getByText('Patch 7 of 16').waitFor({ timeout: 5000 });
await card(i02).screenshot({ path: 'e2e/shots/t12/i02-patch-7-light.png' });
console.log('I02: click + stepper live');

// --- I03: world-model planner - the action changes the actual rollout, and
// the objective flips which action the planner prefers (same three futures) ---
await card(i03).locator('[data-input-control="action"][data-input-value="1"]').click();
await page.getByText('safe stop').waitFor({ timeout: 5000 });
await card(i03).locator('[data-input-control="goal"][data-input-value="1"]').click();
await card(i03).getByText(/Preferred under .Fastest.*Continue/).waitFor({ timeout: 5000 });
await card(i03).screenshot({ path: 'e2e/shots/t12/i03-fastest-continue-light.png' });
await card(i03).locator('[data-input-control="goal"][data-input-value="0"]').click();
await card(i03).getByText(/Preferred under .Safest.*Brake/).waitFor({ timeout: 5000 });
console.log('I03: action changes the rollout; the goal flips the preferred action');

// --- I04: typed coordinates + a real drag ---
await card(i04).getByLabel('a x').fill('0');
await card(i04).getByLabel('a y').fill('3');
await page.waitForTimeout(300);
const handle = await card(i04).locator('[data-vector-handle="b"]').boundingBox();
await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
await page.mouse.down();
await page.mouse.move(handle.x - 40, handle.y - 30, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
if (!/proj_b\(a\)|zero length/.test(await card(i04).locator('[data-projection]').textContent())) throw new Error('I04 readout missing after drag');
await card(i04).screenshot({ path: 'e2e/shots/t12/i04-light.png' });
console.log('I04: typed coordinates + drag live');

// --- the real composer request path (no stubbing on the deployed page) ---
// no card-level Ask exists anymore - the selection pill is the one surface
if (await page.locator('[data-scene-ask]').count()) throw new Error('a card still renders Ask about this');
if (await canvas.getByText('Ask about this').count()) throw new Error('Ask about this text still present');
await card(i01).click({ position: { x: 20, y: 8 } });
await page.getByRole('button', { name: 'Ask in chat' }).click();
await page.locator('[data-canvas-target]').waitFor({ timeout: 5000 });
const composer = page.locator('[data-chat-composer] input:visible').first();
await composer.fill('why does the mask change the output?');
await composer.press('Enter');
await page.waitForTimeout(4000);
if (!learnRequests.length) throw new Error('no /api/learn/ask request was sent');
const payload = learnRequests[0].message || '';
for (const needle of ['Interactive scene: Attention explorer', 'Experiment inputs (revision', 'Causal mask = On']) {
  if (!payload.includes(needle)) throw new Error(`deployed payload missing "${needle}"`);
}
console.log('composer: real request carries the visible experiment state');

// --- reload: state survives on the deployed board ---
await page.reload();
await canvas.waitFor({ timeout: 30000 });
await page.getByText('query: south').waitFor({ timeout: 30000 });
console.log('reload: state persists');

// --- handoff screenshots, both themes, full board ---
await page.screenshot({ path: 'e2e/shots/t12/board-light.png', fullPage: false });
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.waitForTimeout(700);
await page.screenshot({ path: 'e2e/shots/t12/board-dark.png', fullPage: false });
for (const [index, id] of blockIds.entries()) {
  await page.locator(`[data-block-id="${id}"]`).screenshot({ path: `e2e/shots/t12/card-${index + 1}-dark.png` });
}
await page.evaluate(() => document.documentElement.classList.remove('dark'));
await page.waitForTimeout(500);
for (const [index, id] of blockIds.entries()) {
  await page.locator(`[data-block-id="${id}"]`).screenshot({ path: `e2e/shots/t12/card-${index + 1}-light.png` });
}
console.log(`PASS - deployed board verified at ${boardUrl}`);
console.log(`loaded build bundle: ${loadedBundle}`);
await browser.close();
