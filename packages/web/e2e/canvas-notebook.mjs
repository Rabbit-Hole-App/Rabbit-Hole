import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Acceptance for the canvas notebook (docs/features/canvas-notebook.md) on the
// parallel clone. Runs real browser Python; makes no model calls. Prints no secrets.
// usage: node e2e/canvas-notebook.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `canvas-notebook-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-notebook-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-notebook-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const TEACHING = { id: 'teach-1', type: 'explanation', dx: 0, dy: 0, title: 'Softmax turns scores into probabilities', body: 'Exponentiate each score so it is positive, then divide by the sum so the outputs add to one.', more: [] };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1300 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, block]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [block] }));
}, [KEY, TEACHING]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const notebookBlock = async () => (await board()).blocks?.find(block => block.type === 'notebook');

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-block-id="teach-1"]').waitFor({ timeout: 60000 });

// 1. Insert → Notebook
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'Insert' }).click();
await page.getByRole('menuitem', { name: 'Notebook' }).click();
const card = page.locator('[data-block]:has([data-notebook-frame])');
await card.waitFor({ timeout: 30000 });
check('Insert → Notebook creates a notebook card', await card.count() === 1);
await card.getByText('Starting Python…').waitFor({ state: 'detached', timeout: 120000 });
const nb = page.frameLocator('[data-notebook-frame]');

// 2-4. two code cells sharing one kernel
const cells = nb.locator('.jp-Cell');
await cells.nth(0).locator('.cm-content').click();
await page.keyboard.type('x = 10');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('x * 2');
await page.keyboard.press('Shift+Enter');
const out = nb.locator('.jp-OutputArea-output').filter({ hasText: /^\s*20\s*$/ });
await out.waitFor({ timeout: 180000 });
check('cell 2 `x * 2` returns 20 from cell 1 (shared kernel)', await out.count() === 1);

// 5. a Markdown cell, rendered
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.keyboard.press('Enter');
await page.keyboard.type('# Notes on softmax');
await page.keyboard.press('Shift+Enter');
const heading = nb.locator('.jp-MarkdownOutput h1').filter({ hasText: 'Notes on softmax' });
await heading.waitFor({ timeout: 20000 });
check('Markdown cell renders', await heading.count() === 1);
await page.waitForTimeout(1200);
const saved = await notebookBlock();
check('board stores a plain nbformat 4 document', saved?.ipynb?.nbformat === 4 && saved.ipynb.cells.some(cell => cell.cell_type === 'markdown') && !!saved.notebook_id && saved.language === 'python',
  saved ? `${saved.ipynb.cells.length} cells` : 'no block');

// 6. resize with the shared card handle
const before = await card.boundingBox();
await card.hover();
const handle = card.locator('button[title="Resize block"]');
const grip = await handle.boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 160, grip.y + 120, { steps: 8 });
await page.mouse.move(grip.x - 40, grip.y + 140, { steps: 8 }); // back across the iframe
await page.mouse.up();
const after = await card.boundingBox();
await page.waitForTimeout(800);
const sized = await notebookBlock();
check('notebook card resizes and keeps its size', after.height > before.height + 60 && sized.h > 540, `${Math.round(before.width)}×${Math.round(before.height)} → ${Math.round(after.width)}×${Math.round(after.height)}`);
await shot(page, 'notebook-resized');

// 7. pan the canvas with the hand tool; the notebook moves with the world, its content stays
const cellsBefore = await cells.count();
await page.getByRole('button', { name: /^Hand/ }).first().click();
const canvasBox = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
// Empty canvas left of the card: the canvas's bottom edge sits under the
// composer dock, so a drag started there never reaches the canvas.
const from = { x: canvasBox.x + 300, y: canvasBox.y + canvasBox.height / 2 + 150 };
const cardBefore = await card.boundingBox();
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x + 120, from.y - 200, { steps: 10 });
await page.mouse.up();
const cardAfter = await card.boundingBox();
const moved = await notebookBlock();
check('canvas pans without dragging notebook internals', Math.abs(cardAfter.y - cardBefore.y + 200) < 4 && moved.dx === sized.dx && moved.dy === sized.dy && await cells.count() === cellsBefore);
await page.getByRole('button', { name: /^Select/ }).first().click();

// 8-9. reload restores the notebook
await page.waitForTimeout(800);
await page.reload();
const reloaded = page.frameLocator('[data-notebook-frame]');
const reloadedCard = page.locator('[data-block]:has([data-notebook-frame])');
await reloadedCard.waitFor({ timeout: 60000 });
await reloadedCard.getByText('Starting Python…').waitFor({ state: 'detached', timeout: 120000 });
await reloaded.locator('.jp-Cell .cm-content').filter({ hasText: 'x = 10' }).waitFor({ timeout: 30000 }).catch(() => {});
const sources = await reloaded.locator('.jp-Cell .cm-content').allInnerTexts();
check('reload restores cells', sources.some(text => text.includes('x = 10')) && sources.some(text => text.includes('x * 2')), JSON.stringify(sources));
const restoredOut = reloaded.locator('.jp-OutputArea-output').filter({ hasText: /^\s*20\s*$/ });
const restoredHeading = reloaded.locator('.jp-MarkdownOutput h1').filter({ hasText: 'Notes on softmax' });
await restoredOut.waitFor({ timeout: 20000 }).catch(() => {});
await restoredHeading.waitFor({ timeout: 20000 }).catch(() => {});
check('reload restores the output and rendered Markdown', await restoredOut.count() === 1 && await restoredHeading.count() === 1);

// 10. existing card interaction still works: drag the teaching card
const teach = page.locator('[data-block-id="teach-1"]');
const strip = teach.locator('[data-drag-handle]');
const s = await strip.boundingBox();
await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
await page.mouse.down();
await page.mouse.move(s.x + s.width / 2 - 60, s.y + s.height / 2 + 40, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(800);
const teachSaved = (await board()).blocks.find(block => block.id === 'teach-1');
check('teaching card still drags', teachSaved.dx === -60, `dx ${teachSaved.dx} dy ${teachSaved.dy}`);
await shot(page, 'notebook-reloaded');

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
