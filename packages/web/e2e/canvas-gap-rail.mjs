import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The gap rail and free dragging on the parallel clone: every gap between
// things on the canvas - cards, shapes, notes - shows [-] [+] [...] when the
// pointer is on blank canvas left of the content; [+] pushes everything below
// down; cards drag anywhere, overlapping. No model calls. Prints no secrets.
// usage: node e2e/canvas-gap-rail.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `gap-rail-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-gap-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-gap-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const card = (id, title) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body: 'A short body so the card has some height.', more: [] });
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SEED = {
  strokes: [], links: [],
  blocks: [card('t1', 'First card'), card('t2', 'Second card')],
  shapes: [{ id: 'r', kind: 'rect', x1: 40, y1: 620, x2: 260, y2: 720, ...style, text: 'Below' }],
  items: [{ id: 'n', kind: 'sticky', x: 320, y: 640, text: 'note', color: '#37352f', opacity: 1 }],
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1300 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify(seed));
}, [KEY, SEED]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-block-id="t2"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

// hover blank canvas left of the content, level with the gap between the
// second card and the shape below it
const second = await page.locator('[data-block-id="t2"]').boundingBox();
const shape = await page.locator('[data-shape-id="r"] rect').first().boundingBox();
const leftOfContent = Math.min(second.x, shape.x) - 60;
await page.mouse.move(leftOfContent, (second.y + second.height + shape.y) / 2, { steps: 5 });
const push = page.getByRole('button', { name: /^Push everything below down/ });
check('a gap between a card and a shape shows the rail', await push.waitFor({ timeout: 3000 }).then(() => true, () => false));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/gap-rail.png` });

const before = await board();
await push.click();
await page.waitForTimeout(700);
let after = await board();
const moved = (id, key) => after[key].find(entry => entry.id === id);
const was = (id, key) => before[key].find(entry => entry.id === id);
check('[+] pushes the shape and the note below down, and leaves the cards above',
  moved('r', 'shapes').y1 - was('r', 'shapes').y1 === 120 && moved('n', 'items').y - was('n', 'items').y === 120
  && moved('t1', 'blocks').dy === 0 && moved('t2', 'blocks').dy === 0,
  `shape ${moved('r', 'shapes').y1 - was('r', 'shapes').y1}, note ${moved('n', 'items').y - was('n', 'items').y}`);
await page.getByRole('button', { name: /^Pull everything below up/ }).click();
await page.waitForTimeout(700);
after = await board();
check('[-] pulls them back up', moved('r', 'shapes').y1 === was('r', 'shapes').y1 && moved('n', 'items').y === was('n', 'items').y);

// a card drags past its neighbour and may overlap it
await page.mouse.move(leftOfContent - 200, 50); // away from the rail
const first = await page.locator('[data-block-id="t1"] [data-drag-handle]').boundingBox();
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(first.x + first.width / 2 + 40, first.y + first.height / 2 + 260, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(700);
const dragged = (await board()).blocks.find(block => block.id === 't1');
check('a card drags past its neighbour, overlapping it', dragged.dy > 200, `dy ${dragged.dy}`);

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
