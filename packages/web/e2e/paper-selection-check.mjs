// Verifies the paper region flow on the dev canvas: insert the paper block,
// arm "Ask selection", drag a red box over a figure, ask, and confirm the
// answer node appears, links to the paper, and the region stays marked.
// Run: node e2e/paper-selection-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.zeroshothq.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('SMALL_TEST_BYPASS missing from .env');
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-paper-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const failures = [];
const check = async (label, fn) => { try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} — ${e.message.split('\n')[0]}`); } };

await page.addInitScript(() => { try { for (const key of Object.keys(localStorage)) if (key.startsWith('small.adaptive-canvas:')) localStorage.removeItem(key); } catch {} });
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.locator('[aria-label="Insert lesson block"]').click();
await page.getByRole('menuitem', { name: 'Paper' }).click();
const paper = canvas.locator('[data-block-id]').last();
await check('paper page renders', () => paper.locator('canvas').waitFor({ timeout: 90000 }));

// page 3 of "Attention Is All You Need" carries the architecture figure
await check('navigates to the figure page', async () => {
  await paper.getByRole('button', { name: 'Next paper page' }).click();
  await page.waitForTimeout(1200);
  await paper.getByRole('button', { name: 'Next paper page' }).click();
  await page.waitForTimeout(2000);
});

await check('one control row only', async () => {
  const rows = await paper.locator('header').count();
  if (rows !== 1) throw new Error(`${rows} header rows`);
  await paper.getByRole('button', { name: 'Zoom in paper' }).waitFor({ timeout: 3000 });
  await paper.getByRole('button', { name: 'Next paper page' }).waitFor({ timeout: 3000 });
});

await check('Ask selection pill arms the picker', async () => {
  await paper.locator('[data-drag-handle]').click();
  await page.getByRole('button', { name: 'Ask selection' }).click();
  await paper.locator('[aria-label="Select paper region"]').waitFor({ timeout: 5000 });
});

await check('dragging marks a red region', async () => {
  const box = await paper.locator('[aria-label="Select paper region"]').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.42, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const stroke = await paper.locator('[aria-label="Select paper region"] rect').getAttribute('stroke');
  if (stroke !== '#dc2626') throw new Error(`region not marked (${stroke})`);
});

await check('composer shows the selection thumbnail', async () => {
  const chip = page.locator('[data-canvas-target]');
  await chip.waitFor({ timeout: 5000 });
  if (!(await chip.locator('img').count())) throw new Error('no thumbnail in the chip');
});

const dock = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').first();
await dock.fill('what does this diagram show?');
await dock.press('Enter');
await check('answer arrives without a bounds error', async () => {
  const node = canvas.locator('[data-chat-block]').filter({ hasText: 'what does this diagram show?' });
  await node.waitFor({ timeout: 20000 });
  await page.waitForTimeout(25000);
  const text = await node.innerText();
  if (/Invalid paper selection bounds/i.test(text)) throw new Error('server rejected the selection');
  if (/✗/.test(text)) throw new Error(`error in answer: ${text.split('✗')[1]?.slice(0, 80)}`);
  if (text.replace('what does this diagram show?', '').trim().length < 40) throw new Error('no answer text');
});

await check('red region survives the ask', async () => {
  const stroke = await paper.locator('[aria-label="Select paper region"] rect').getAttribute('stroke');
  if (stroke !== '#dc2626') throw new Error('region cleared after asking');
});

await check('answer node links to the paper block', async () => {
  if (!(await canvas.locator('[data-connection]').count())) throw new Error('no connector drawn');
});

await page.screenshot({ path: 'e2e/shots/paper-selection.png', fullPage: false });
await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
