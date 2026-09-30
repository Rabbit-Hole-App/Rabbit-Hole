import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Whatever the learner adds must land where they are looking. Every add path
// (Insert menu, / commands, paste, a chat answer added from the sheet) is run
// from three cameras - as opened, scrolled down past the cards, panned
// sideways - and the new card must be on screen above the dock and the open
// chat sheet. Model calls are stubbed.
// Parallel clone only; a pasted image uploads to the dev Learn media bucket.
// usage: node e2e/canvas-landing-sweep.mjs [only-action]
const BASE = process.env.BASE || 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const RUN = Date.now();
const ONLY = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'landing-sweep' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'landing-sweep' } })).json();
const PREFIX = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:`;
const SEED = ['Softmax', 'Attention', 'Layer norm'].map((title, i) => ({ id: `seed-${i}`, type: 'explanation', dx: 0, dy: 0, title, body: 'A card already on the board. '.repeat(6), more: [] }));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([prefix, blocks]) => {
  const board = new URLSearchParams(location.search).get('board');
  if (board && !localStorage.getItem(`${prefix}${board}:s0`)) localStorage.setItem(`${prefix}${board}:s0`, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks }));
}, [PREFIX, SEED]);
await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `event: chunk\ndata: ${JSON.stringify({ text: 'Hi! What would you like to learn?' })}\n\nevent: done\ndata: {}\n\n` }));
await context.route('**/api/learn/artifact', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'Stubbed explanation', body: 'Made by the stub, not a model.', more: [] }, repaired: false }) }));

const menu = label => async page => {
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'Insert' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
};
const type = text => async page => {
  const composer = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])').first();
  await composer.click();
  await composer.fill(text);
  await page.waitForTimeout(300);
  await composer.press('Enter');
};
const pasteImage = async (page, empty) => {
  await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
    canvas.getContext('2d').fillRect(0, 0, 160, 100);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.press('Control+v');
};
const ACTIONS = {
  'Insert → Section': menu('Section'),
  'Insert → Text box': menu('Text box'),
  'Insert → Sticky note': menu('Sticky note'),
  'Insert → Divider line': menu('Divider line'),
  'Insert → Notebook': menu('Notebook'),
  '/whiteboard': type('/whiteboard Attention'),
  '/explain (stubbed)': type('/explain softmax'),
  'paste an image': pasteImage,
  'chat answer → Add to canvas (stubbed)': async page => {
    await type('hi')(page);
    await page.locator('[data-chat-sheet] [data-add-to-canvas]').last().click();
  },
};
const CAMERAS = {
  'as opened': async () => {},
  'scrolled down': async (page, empty) => { await page.mouse.move(empty.x, empty.y); await page.mouse.wheel(0, 1400); },
  'panned sideways': async (page, empty) => { await page.mouse.move(empty.x, empty.y); await page.mouse.wheel(1100, 0); },
};
// Cards and notes carry ids; a divider has none, so it is keyed by where it sits.
const ids = page => page.evaluate(() => [...document.querySelectorAll('[data-block-id], [data-item-id], [data-section]')].map(node => node.dataset.blockId || node.dataset.itemId || `divider:${node.style.left},${node.style.top}`));
const boxOf = (page, key) => page.evaluate(key => {
  const node = [...document.querySelectorAll('[data-block-id], [data-item-id], [data-section]')].find(entry => (entry.dataset.blockId || entry.dataset.itemId || `divider:${entry.style.left},${entry.style.top}`) === key);
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}, key);

let index = 0;
for (const [action, run] of Object.entries(ACTIONS)) {
  if (ONLY && !action.includes(ONLY)) continue;
  for (const [camera, move] of Object.entries(CAMERAS)) {
    const page = await context.newPage();
    await page.goto(`${BASE}/apps/${APP}?tab=learn&board=landing-${RUN}-${index++}`);
    await page.locator('[data-block-id="seed-2"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(700);
    const surface = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
    const dock = await page.locator('[data-learn-dock] [data-chat-composer]').first().boundingBox();
    const seen = { top: surface.y, bottom: dock.y - 8, left: surface.x + 90, right: surface.x + surface.width - 10 };
    const empty = { x: surface.x + 240, y: surface.y + 180 };
    await move(page, empty);
    await page.waitForTimeout(500);
    const before = new Set(await ids(page));
    await run(page, empty);
    let added = [];
    for (let i = 0; i < 40 && !added.length; i++) { await page.waitForTimeout(250); added = (await ids(page)).filter(id => !before.has(id)); }
    await page.waitForTimeout(1500);
    const name = `${action}, ${camera}`;
    if (!added.length) { check(name, false, 'nothing was added'); await page.close(); continue; }
    const sheetTop = await page.evaluate(() => { const box = document.querySelector('[data-chat-sheet]')?.getBoundingClientRect(); return box?.height ? box.top : null; });
    if (sheetTop !== null) seen.bottom = Math.min(seen.bottom, sheetTop - 8);
    const box = await boxOf(page, added[0]);
    const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const vertical = overlap(box.y, box.y + box.height, seen.top, seen.bottom) / Math.min(box.height, seen.bottom - seen.top);
    const horizontal = overlap(box.x, box.x + box.width, seen.left, seen.right) / Math.min(box.width, seen.right - seen.left);
    check(name, vertical > 0.6 && horizontal > 0.6, `box ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}; visible ${Math.round(horizontal * 100)}% across, ${Math.round(vertical * 100)}% down`);
    await page.close();
  }
}

await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
