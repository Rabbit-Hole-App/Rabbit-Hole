// Verifies the adaptive React canvas on the dev deployment: asking from the
// dock creates a movable chat card (blue question + streamed agent answer),
// the right toolbar draws ink and drops stickies, and the zoom pill zooms.
// Run: node e2e/chat-block-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.zeroshothq.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('SMALL_TEST_BYPASS missing from .env');
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-chat-block-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const failures = [];
const check = async (label, fn) => { try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} — ${e.message.split('\n')[0]}`); } };

await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await check('canvas mounts', () => canvas.waitFor({ timeout: 30000 }));
await check('toolbar strip visible', () => page.locator('[aria-label="Canvas tools"]').waitFor({ timeout: 10000 }));
await check('zoom controls visible', () => page.locator('[aria-label="Zoom controls"]').waitFor({ timeout: 5000 }));

const dock = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').first();
await check('dock composer present', () => dock.waitFor({ timeout: 10000 }));
await dock.fill('Explain me sigmoid');
await dock.press('Enter');

await check('question bubble on canvas', () => canvas.locator('[data-chat-block]').getByText('Explain me sigmoid', { exact: true }).waitFor({ timeout: 15000 }));
await check('answer streams into block', () => canvas.locator('[data-chat-block]').getByText(/sigmoid/i).nth(1).waitFor({ timeout: 90000 }));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'e2e/shots/chat-block.png', fullPage: false });

// movable: drag the card and confirm it translated. The streamed card can be
// taller than the canvas with its top panned off-screen — grab a visible point.
const block = canvas.locator('[data-chat-block]').first();
await check('block is movable', async () => {
  const before = await block.boundingBox();
  const cbox = await canvas.boundingBox();
  if (!before || !cbox) throw new Error('no bounding box');
  const gx = before.x + 40;
  const gy = Math.min(Math.max(before.y + 16, cbox.y + 60), cbox.y + cbox.height - 100);
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 160, gy + 60, { steps: 12 });
  await page.mouse.up();
  const after = await block.boundingBox();
  if (!after || Math.abs(after.x - before.x) < 80) throw new Error(`did not move (dx=${after ? after.x - before.x : 'gone'})`);
});

// resizable: drag the corner handle, width grows
await check('chat block resizes', async () => {
  const before = await block.boundingBox();
  const handle = block.locator('[aria-label="Resize chat block"]');
  await handle.hover({ force: true });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 150, hb.y + 40, { steps: 8 });
  await page.mouse.up();
  const after = await block.boundingBox();
  if (after.width - before.width < 80) throw new Error(`width ${before.width} -> ${after.width}`);
});

// pen: draw a stroke on empty space
await check('pen draws a stroke', async () => {
  await page.locator('[aria-label="Pen"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 10 });
  await page.mouse.up();
  const paths = await canvas.locator('svg path').count();
  if (!paths) throw new Error('no stroke path');
});

// ctrl+z: the stroke just drawn disappears
await check('ctrl+z undoes the stroke', async () => {
  const before = await canvas.locator('svg path').count();
  await page.keyboard.press('Control+z');
  const after = await canvas.locator('svg path').count();
  if (after !== before - 1) throw new Error(`paths ${before} -> ${after}`);
});

// sticky: place one and type into it. Left edge is clear of the dragged card,
// the blur click stays away from the toolbar strip and zoom pill.
await check('sticky note placed', async () => {
  await page.locator('[aria-label="Sticky note"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 60, box.y + 100);
  await page.keyboard.type('ID = index, row = meaning');
  await page.mouse.click(box.x + 260, box.y + box.height - 30);
  await canvas.getByText('ID = index, row = meaning').waitFor({ timeout: 5000 });
});

// shape: drag out a rectangle on empty space
await check('rectangle draws', async () => {
  await page.locator('[aria-label="Rectangle"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width - 260, box.y + 380);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 120, box.y + 470, { steps: 8 });
  await page.mouse.up();
  if (!(await canvas.locator('svg rect').count())) throw new Error('no rect');
});

// del key: select the sticky, delete it
await check('Del removes selected sticky', async () => {
  const sticky = canvas.getByText('ID = index, row = meaning');
  await sticky.click();
  await page.keyboard.press('Delete');
  if (await sticky.count()) throw new Error('sticky still present');
});

// zoom: out then reset
await check('zoom pill works', async () => {
  await page.locator('[title="Zoom out"]').click();
  await page.locator('[aria-label="Zoom controls"]').getByText('80%').waitFor({ timeout: 5000 });
  await page.locator('[title="Reset zoom"]').click();
  await page.locator('[aria-label="Zoom controls"]').getByText('100%').waitFor({ timeout: 5000 });
});
// persistence: blocks and shapes survive a reload
await check('blocks survive reload', async () => {
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.locator('[data-chat-block]').getByText('Explain me sigmoid', { exact: true }).waitFor({ timeout: 20000 });
  if (!(await canvas.locator('svg rect').count())) throw new Error('shape lost');
});

// node select + Del: the chat block deletes
await check('Del removes selected block', async () => {
  const count = await canvas.locator('[data-chat-block]').count();
  await canvas.locator('[data-chat-block]').first().click();
  await page.keyboard.press('Delete');
  if ((await canvas.locator('[data-chat-block]').count()) !== count - 1) throw new Error('block not deleted');
});

await page.waitForTimeout(400);
await page.screenshot({ path: 'e2e/shots/chat-block-moved.png', fullPage: false });

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
