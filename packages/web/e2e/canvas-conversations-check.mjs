// Real dev UI; model transport is stubbed to test thread isolation without API spend.
// Run: node e2e/canvas-conversations-check.mjs
import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { DEV_CP } from './dev-cp.mjs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.tryrabbithole.workers.dev';
const { RABBIT_HOLE_DEV_TEST_BYPASS: secret } = parseEnv(readFileSync(new URL('../../../.env', import.meta.url), 'utf8'));
const login = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`Session failed: ${login.status}`);
const { session } = await login.json();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1650, height: 1100 } });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/learn/ask', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const threadId = body.thread_id || `test-thread-${requests.length}`;
    await route.fulfill({ contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: `Answer to ${body.message}.` })}\n\nevent: done\ndata: ${JSON.stringify({ threadId })}\n\n` });
  });
  await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
  const canvas = page.getByLabel('Lesson canvas', { exact: true });
  const dock = canvas.locator('input[placeholder^="Ask about"]');
  await dock.fill('Alpha topic'); await dock.press('Enter');
  const a = canvas.locator('[data-chat-block]').nth(0);
  await expect(a).toContainText('Answer to Alpha topic.');
  await dock.fill('Beta topic'); await dock.press('Enter');
  const b = canvas.locator('[data-chat-block]').nth(1);
  await expect(b).toContainText('Answer to Beta topic.');
  expect(requests[0].thread_id).toBeNull(); expect(requests[1].thread_id).toBeNull();
  await a.getByRole('button', { name: 'Reply in this block' }).click();
  const inputA = a.locator('[data-block-composer] input[placeholder]');
  await inputA.fill('Alpha follow-up'); await inputA.press('Enter');
  await expect(a).toContainText('Answer to Alpha follow-up.');
  expect(requests[2].canvas_seed).toEqual({ question: 'Alpha topic', answer: 'Answer to Alpha topic.' });
  expect(requests[2].thread_id).toBeNull();
  await a.getByLabel('Close block composer').click();
  await a.getByRole('button', { name: 'Reply in this block' }).last().click();
  await inputA.fill('Alpha again'); await inputA.press('Enter');
  await expect(a).toContainText('Answer to Alpha again.');
  expect(requests[3].thread_id).toBe('test-thread-3'); expect(requests[3].canvas_seed).toBeUndefined();
  await b.getByRole('button', { name: 'Reply in this block' }).click();
  await b.locator('[data-block-composer] input[placeholder]').fill('Beta follow-up');
  await b.locator('[data-block-composer] input[placeholder]').press('Enter');
  await expect(b).toContainText('Answer to Beta follow-up.');
  expect(requests[4].canvas_seed.question).toBe('Beta topic'); expect(requests[4].thread_id).toBeNull();
  await expect(b).not.toContainText('Alpha');
  await a.getByLabel('Close block composer').click(); await b.getByLabel('Close block composer').click();
  console.log('PASS: independent block threads, context, history on reopening, main composer isolation');

  // Zoom out to fit both cards, then move Beta horizontally to expose the link.
  await page.getByTitle('Zoom out', { exact: true }).click();
  const drag = async (locator, dx, dy) => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 }); await page.mouse.up();
  };
  await drag(b.locator('div').first(), 230, -80);
  await page.getByLabel('Color #7c3aed', { exact: true }).click();
  await a.hover();
  const source = a.getByLabel('Connect right', { exact: true }), target = b.getByLabel('Connect left', { exact: true });
  await source.dragTo(target);
  const link = canvas.locator('[data-connection]'); await expect(link).toHaveCount(1);
  await expect(link.locator('path').first()).toHaveAttribute('stroke', '#7c3aed');
  const path = await link.locator('path').first().getAttribute('d');
  await drag(b.getByText('Beta topic', { exact: true }), 60, 25);
  await expect(link.locator('path').first()).not.toHaveAttribute('d', path);
  const before = await b.boundingBox();
  await drag(b.getByLabel('Resize chat block'), 70, 30);
  const after = await b.boundingBox(); expect(after.width).toBeGreaterThan(before.width + 30);
  expect(await b.getByLabel('Resize chat block').locator('svg').count()).toBe(1);
  await page.mouse.move(10, 10);
  await expect(source).toHaveCSS('opacity', '0');
  console.log('PASS: hover ports, colored connection, movement, arrow resize');
  await b.getByRole('button', { name: 'Reply in this block' }).last().click();
  await expect(b.locator('[data-block-composer] input[placeholder]')).toBeFocused();
  await page.screenshot({ path: '../../.small/canvas-conversations-linked.png' });
  await b.getByLabel('Close block composer').click();

  // Cancelled/self connections do not add an edge; undo/redo is not required.
  await a.getByLabel('Connect left').dragTo(a.getByLabel('Connect right'));
  await expect(link).toHaveCount(1);
  await page.mouse.click(15, 200); await page.keyboard.press('Control+z');
  await expect(link).toHaveCount(0);
  console.log('PASS: self-link rejected, connection undo');
  expect(errors).toEqual([]);
  await page.screenshot({ path: '../../.small/canvas-conversations.png' });
} finally { await browser.close(); }
