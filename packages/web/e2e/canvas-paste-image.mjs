import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Paste an image onto the Learn canvas: copy an image, click the canvas,
// Ctrl+V makes an image card; select it and Delete removes it. The canvas's
// own card copy/paste still works, and the newest copy wins. Parallel clone
// only; uploads go to the dev Learn media bucket. Prints no secrets.
// usage: node e2e/canvas-paste-image.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `paste-image-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-paste-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-paste-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const TEACHING = { id: 'teach-1', type: 'explanation', dx: 0, dy: 0, title: 'Softmax turns scores into probabilities', body: 'Exponentiate each score, then divide by the sum.', more: [] };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, block]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [block] }));
}, [KEY, TEACHING]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const count = async type => ((await board()).blocks || []).filter(block => block.type === type).length;
// A real image on the system clipboard, as a copy from another app leaves it.
const copyImage = () => page.evaluate(async () => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
  const context = canvas.getContext('2d');
  context.fillStyle = '#2563eb'; context.fillRect(0, 0, 160, 100);
  context.fillStyle = '#fff'; context.font = '28px sans-serif'; context.fillText('paste', 40, 60);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
});
const settle = async (type, want) => { for (let i = 0; i < 40 && await count(type) !== want; i++) await page.waitForTimeout(250); return count(type); };

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-block-id="teach-1"]').waitFor({ timeout: 60000 });
const canvasBox = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
const empty = { x: canvasBox.x + 200, y: canvasBox.y + canvasBox.height / 2 };

// 1. copy an image elsewhere, click the canvas, Ctrl+V
await copyImage();
await page.mouse.click(empty.x, empty.y);
await page.keyboard.press('Control+v');
check('Ctrl+V on the canvas makes an image card', await settle('file', 1) === 1);
const image = ((await board()).blocks || []).find(block => block.type === 'file');
check('the card is an image', image?.kind === 'image', image ? `label ${image.label}` : 'none');
const card = page.locator(`[data-block-id="${image?.id}"]`);
await card.locator('img').first().waitFor({ timeout: 20000 }).catch(() => {});
const drawn = await card.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0).catch(() => false);
check('the pasted image is drawn on the card', drawn);
await shot(page, 'pasted');

// 2. the canvas's own copy/paste still works, and a newer card copy beats the older image
await page.locator('[data-block-id="teach-1"]').click({ position: { x: 20, y: 12 } });
await page.keyboard.press('Control+c');
await page.mouse.click(empty.x, empty.y);
await page.keyboard.press('Control+v');
check('copied cards paste, not the older image', await settle('explanation', 2) === 2 && await count('file') === 1);

// 3. a newer image copy beats the older card copy
await copyImage();
await page.mouse.click(empty.x, empty.y);
await page.keyboard.press('Control+v');
check('a newer image copy pastes the image', await settle('file', 2) === 2 && await count('explanation') === 2);

// 4. typing in the composer keeps its own paste
const composer = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])').first();
await composer.click();
await page.keyboard.press('Control+v');
await page.waitForTimeout(1200);
check('paste inside the composer adds no card', await count('file') === 2);
await page.keyboard.press('Escape');

// 5. select the image and press Delete
const firstImage = page.locator(`[data-block-id="${image?.id}"]`);
await firstImage.click({ position: { x: 30, y: 30 } });
await page.keyboard.press('Delete');
await page.waitForTimeout(600);
const left = ((await board()).blocks || []).filter(block => block.type === 'file');
check('select + Delete removes the image card', !left.some(block => block.id === image?.id) && left.length === 1, `${left.length} image card(s) left`);
await shot(page, 'deleted');

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
