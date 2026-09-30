import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Where a chat card lands: a plain question answers in the chat sheet and
// Add to canvas turns it into a card; Ask in chat on a card answers as a
// linked card. Either way the new card must appear in the middle of what the
// learner is looking at (above the open sheet), and stay there - no jump
// when the answer streams in. Asks are answered by a stub (no model calls).
// Parallel clone only. Prints no secrets.
// usage: node e2e/chat-card-placement.mjs [screenshot dir]
const BASE = process.env.BASE || 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `chat-placement-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'chat-placement-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'chat-placement-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const SEED = ['Softmax', 'Attention', 'Layer norm'].map((title, i) => ({ id: `seed-${i}`, type: 'explanation', dx: 0, dy: 0, title, body: 'A card already on the board. '.repeat(6), more: [] }));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, blocks]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks }));
}, [KEY, SEED]);
const page = await context.newPage();
// The stub answers slowly, in pieces, like the real stream.
await page.route('**/api/learn/ask', async route => {
  const pieces = ['Hi! ', 'What would you like ', 'to learn today?'];
  const body = [`event: progress\ndata: ${JSON.stringify({ stage: 'thinking' })}\n\n`, ...pieces.map(text => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`), `event: done\ndata: {}\n\n`].join('');
  await new Promise(resolve => setTimeout(resolve, 700));
  await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
});

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-block-id="seed-2"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(800);
const surface = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
const dock = await page.locator('[data-learn-dock] [data-chat-composer]').first().boundingBox();
// What the learner sees: the canvas above the dock.
const composer = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])').first();

const sheetTop = () => page.evaluate(() => { const box = document.querySelector('[data-chat-sheet]')?.getBoundingClientRect(); return box?.height ? box.top : null; });
const ask = async (label, text, { addToCanvas = true } = {}) => {
  const answers = await page.locator('[data-chat-sheet] [data-add-to-canvas]').count();
  await composer.click();
  await composer.fill(text);
  await composer.press('Enter');
  if (addToCanvas) {
    const add = page.locator('[data-chat-sheet] [data-add-to-canvas]').nth(answers);
    await add.waitFor({ timeout: 10000 });
    await add.click();
  }
  const card = page.locator('[data-block-id]').filter({ hasText: text }).last();
  await card.waitFor({ timeout: 10000 });
  // One camera move centres the card as it arrives; after that it must hold still.
  await page.waitForTimeout(400);
  const track = [];
  for (let i = 0; i < 16; i++) { const box = await card.boundingBox(); track.push(box && { x: Math.round(box.x + box.width / 2), y: Math.round(box.y), h: Math.round(box.height) }); await page.waitForTimeout(150); }
  await page.waitForTimeout(600);
  // What the learner sees: the canvas above the open sheet, or above the dock.
  const seen = { top: surface.y, bottom: (await sheetTop()) ?? dock.y, left: surface.x, right: surface.x + surface.width };
  const middle = { x: (seen.left + seen.right) / 2, y: (seen.top + seen.bottom) / 2 };
  const box = await card.boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + Math.min(box.height, seen.bottom - seen.top) / 2 };
  const visible = box.y >= seen.top - 1 && box.y + Math.min(box.height, 200) <= seen.bottom;
  const near = Math.abs(centre.x - middle.x) < 120 && Math.abs(centre.y - middle.y) < (seen.bottom - seen.top) / 4;
  const ys = track.filter(Boolean).map(entry => entry.y);
  const jump = Math.max(...ys.slice(1).map((y, i) => Math.abs(y - ys[i])), 0);
  check(`${label}: the new card is in view`, visible, `card top ${Math.round(box.y)}, view ${Math.round(seen.top)}-${Math.round(seen.bottom)}`);
  check(`${label}: the new card sits in the middle of the view`, near, `card centre ${Math.round(centre.x)},${Math.round(centre.y)} vs middle ${Math.round(middle.x)},${Math.round(middle.y)}`);
  check(`${label}: the card does not jump while the answer streams`, jump < 40, `largest step ${Math.round(jump)}px, tops ${ys.join(',')}`);
  await shot(page, label.replace(/\W+/g, '-'));
};
const empty = { x: surface.x + 300, y: surface.y + 300 };

// 1. straight after opening the board
await ask('opened board', 'hi');
// 2. after the learner scrolls down into empty space
await page.mouse.move(empty.x, empty.y);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(500);
await ask('scrolled down', 'hello again');
// 3. after panning sideways
await page.mouse.wheel(700, -300);
await page.waitForTimeout(500);
await ask('panned right', 'one more');
// 4. asking about a selected card: the answer parks under it, in view
await page.getByRole('button', { name: 'Collapse chat' }).click();
await page.locator('[data-block-id="seed-1"]').click({ position: { x: 30, y: 12 } });
await page.locator('[data-block-id="seed-1"]').getByRole('button', { name: 'Ask in chat' }).click();
await ask('asked about a card', 'explain this card', { addToCanvas: false });
const linked = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').links || [], KEY);
check('asked about a card: the answer is linked to it', linked.some(link => link.from === 'seed-1'), `${linked.length} link(s)`);

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
