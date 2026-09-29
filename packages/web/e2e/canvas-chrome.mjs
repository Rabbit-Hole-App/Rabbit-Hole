import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The canvas chrome on the parallel clone: with the right panel closed the
// contents rail is a pill the canvas toolbar keeps clear of, and a board of
// shapes alone can be presented. No model calls. Prints no secrets.
// usage: node e2e/canvas-chrome.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `chrome-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-chrome-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-chrome-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, shapes]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes, items: [], links: [], blocks: [] }));
}, [KEY, [{ id: 'a', kind: 'rect', x1: 60, y1: 120, x2: 220, y2: 210, ...style }, { id: 'b', kind: 'ellipse', x1: 360, y1: 320, x2: 520, y2: 410, ...style }]]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-shape-id="a"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1000);

const hide = page.getByRole('button', { name: 'Hide the right panel' });
if (await hide.count()) await hide.click();
const rail = page.locator('[data-contents-rail]');
await rail.waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
const pill = await rail.locator('[aria-hidden="true"]').first().boundingBox();
const tools = await page.getByRole('toolbar', { name: 'Canvas tools' }).boundingBox();
const apart = tools.x + tools.width <= pill.x;
check('with the panel closed the toolbar keeps clear of the contents pill', apart, `toolbar ends ${Math.round(tools.x + tools.width)}, pill starts ${Math.round(pill.x)}`);
check('the contents rail is drawn as a pill', await rail.locator('[aria-hidden="true"]').first().evaluate(node => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(node).borderTopLeftRadius) > 8));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/chrome-rail.png` });

await page.getByRole('button', { name: 'Present' }).click();
const counter = page.getByText('1 / 1 · Whole canvas');
check('a board of shapes alone can be presented', await counter.waitFor({ timeout: 5000 }).then(() => true, () => false));

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
