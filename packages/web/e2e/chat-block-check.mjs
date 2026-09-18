// Verifies the adaptive-canvas chat block on the dev deployment: asking from
// the dock creates a movable chat-block shape on the tldraw canvas with the
// question (blue) and the streamed agent answer. Run: node e2e/chat-block-check.mjs
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
await check('canvas mounts', () => page.locator('[aria-label="Lesson canvas"] .tl-canvas').waitFor({ timeout: 30000 }));
await check('toolbar visible', () => page.locator('.tlui-toolbar').first().waitFor({ timeout: 10000 }));
await check('zoom controls visible', () => page.locator('[data-testid="minimap.zoom-out"], .tlui-navigation-panel, [title*="Zoom"]').first().waitFor({ timeout: 10000 }));

const dock = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').first();
await check('dock composer present', () => dock.waitFor({ timeout: 10000 }));
await dock.fill('Explain me sigmoid');
await dock.press('Enter');

await check('question bubble on canvas', () => page.locator('.tl-canvas').getByText('Explain me sigmoid', { exact: true }).waitFor({ timeout: 15000 }));
await check('answer streams into block', () => page.locator('.tl-canvas').getByText(/sigmoid/i).nth(1).waitFor({ timeout: 90000 }));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'e2e/shots/chat-block.png', fullPage: false });

// movable: drag the block by its card and confirm the shape translated
const block = page.locator('.tl-canvas').getByText('Explain me sigmoid', { exact: true }).first();
await check('block is movable', async () => {
  const before = await block.boundingBox();
  if (!before) throw new Error('no bounding box');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 60, { steps: 12 });
  await page.mouse.up();
  const after = await block.boundingBox();
  if (!after || Math.abs(after.x - before.x) < 80) throw new Error(`did not move (dx=${after ? after.x - before.x : 'gone'})`);
});
await page.screenshot({ path: 'e2e/shots/chat-block-moved.png', fullPage: false });

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
