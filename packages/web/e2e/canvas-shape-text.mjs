import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Acceptance for text inside canvas shapes on the parallel clone: double-click
// a closed shape to type in its middle, pick a level from the H1-to-text
// ladder, resize the shape, reload. No model calls. Prints no secrets.
// usage: node e2e/canvas-shape-text.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `canvas-shape-text-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-shape-text-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-shape-text-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SHAPES = [
  { id: 'rect-1', kind: 'rect', x1: -420, y1: 40, x2: -140, y2: 200, ...style },
  { id: 'ellipse-1', kind: 'ellipse', x1: -420, y1: 260, x2: -140, y2: 420, ...style, fill: '#2383e2' },
  { id: 'line-1', kind: 'line', x1: -420, y1: 480, x2: -140, y2: 520, ...style },
];

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1300 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, shapes]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes, items: [], links: [], blocks: [] }));
}, [KEY, SHAPES]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const shapeOf = async id => (await board()).shapes.find(shape => shape.id === id);
const inside = (inner, outer) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
const rect = page.locator('[data-shape-id="rect-1"]');
await rect.waitFor({ timeout: 60000 });
const empty = async () => { const box = await page.locator('[aria-label="Lesson canvas"]').boundingBox(); await page.mouse.click(box.x + box.width - 420, box.y + box.height - 200); };

// double-click → type in the middle
const outline = await rect.locator('rect').first().boundingBox();
await page.mouse.dblclick(outline.x + outline.width / 2, outline.y + outline.height / 2);
const editor = rect.locator('[data-shape-text]');
await editor.waitFor({ timeout: 5000 });
check('double-click opens an editor in the shape', await editor.evaluate(node => node === document.activeElement));
await page.keyboard.type('Softmax');
await page.keyboard.press('Enter');
await page.keyboard.type('turns scores into probabilities');

// the same ladder as text boxes
const pill = page.getByRole('group', { name: 'Text level' });
check('the H1-to-text ladder shows while editing', (await pill.getByRole('button').allInnerTexts()).join(',') === 'H1,H2,H3,H4,Text');
await pill.getByRole('button', { name: 'H2' }).click();
check('choosing a level keeps the editor open', await editor.evaluate(node => node === document.activeElement));
await empty();
await page.waitForTimeout(700);
let saved = await shapeOf('rect-1');
check('text and level are saved on the shape', saved.text === 'Softmax\nturns scores into probabilities' && saved.level === 'h2', JSON.stringify({ text: saved.text, level: saved.level }));
const textBox = await editor.boundingBox();
const centre = { x: textBox.x + textBox.width / 2, y: textBox.y + textBox.height / 2 };
check('text sits in the middle of the shape', inside(textBox, outline) && Math.abs(centre.x - (outline.x + outline.width / 2)) < 3 && Math.abs(centre.y - (outline.y + outline.height / 2)) < 3);
check('text is drawn at H2 size', await editor.evaluate(node => getComputedStyle(node).fontSize) === '24px');

// resize from a corner handle; the text reflows inside
await rect.locator('rect').first().click();
const corner = rect.locator('circle').nth(2);
const c = await corner.boundingBox();
await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
await page.mouse.down();
await page.mouse.move(c.x - 80, c.y + 90, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(600);
saved = await shapeOf('rect-1');
const resized = await rect.locator('rect').first().boundingBox();
const reflowed = await editor.boundingBox();
check('the shape still resizes', saved.x2 < -140 && saved.y2 > 200, `x2 ${saved.x2} y2 ${saved.y2}`);
check('text stays inside the resized shape', inside(reflowed, resized));

// a second shape kind, and a line does not take text
const ellipse = page.locator('[data-shape-id="ellipse-1"]');
const e = await ellipse.locator('ellipse').first().boundingBox();
await page.mouse.dblclick(e.x + e.width / 2, e.y + e.height / 2);
await page.keyboard.type('Normalise');
await empty();
await page.waitForTimeout(600);
check('ellipses take text too', (await shapeOf('ellipse-1')).text === 'Normalise');
const line = page.locator('[data-shape-id="line-1"]');
const l = await line.locator('line').first().boundingBox();
await page.mouse.dblclick(l.x + l.width / 2, l.y + l.height / 2);
check('lines do not open an editor', await line.locator('[data-shape-text]').count() === 0);
await page.keyboard.press('Escape');

// it survives a reload
await page.waitForTimeout(600);
await page.reload();
await rect.waitFor({ timeout: 60000 });
check('shape text survives a reload', (await rect.locator('[data-shape-text]').innerText()).includes('turns scores into probabilities'));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/shape-text.png` });

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
