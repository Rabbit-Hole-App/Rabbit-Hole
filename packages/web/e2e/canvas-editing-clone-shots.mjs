import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Visual review of canvas editing on a session's own dev clone (docs/features/parallel-dev-deploys.md): a fresh test
// canvas, real input from a clean browser, screenshots of the states a reviewer looks at. Model routes are aborted in
// the page, so no paid call can start. Prints no secrets.
// usage: node e2e/canvas-editing-clone-shots.mjs <clone base url> <screenshot dir>
const BASE = process.argv[2], OUT = process.argv[3];
if (!/^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev$/.test(BASE || '')) throw Error('a rabbit-hole-web-dev-<session> clone only');
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const UA = { 'User-Agent': 'canvas-editing-clone-shots' };
const minted = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email: 'canvas-editing-review@example.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json();
if (!minted.session) throw Error(`no test session: ${minted.error || 'refused'}`);
const cookie = `small_session=${minted.session}`;
const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ title: `Canvas editing review ${new Date().toISOString().slice(0, 16)}` }) })).json();
if (!made.name) throw Error(`no canvas: ${made.error || 'refused'}`);

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: minted.session, url: BASE }]);
await context.route(/\/api\/(learn\/(ask|home-ask|image|tutor\/(plan|evaluate|next-steps))|voice|ask\b)/, route => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${BASE}/apps/${made.name}?tab=learn`);
// A new review identity picks a handle once (HandleGate); the same identity keeps it afterwards.
const handle = page.getByRole('textbox').first();
const gate = await Promise.race([page.getByText('Choose your handle').waitFor({ timeout: 20000 }).then(() => true), page.locator('[data-canvas-surface]').waitFor({ timeout: 20000 }).then(() => false)]).catch(() => false);
if (gate) {
  await handle.fill(`ce_review_${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Continue' }).click();
}
const surface = page.locator('[data-canvas-surface]');
await surface.waitFor({ timeout: 60000 }).catch(async error => { await page.screenshot({ path: `${OUT}/00-no-canvas.png` }); console.log('url', page.url()); throw error; });
await page.waitForTimeout(1500);
const box = await surface.boundingBox();
const spot = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });
await page.mouse.click(spot(0.9, 0.1).x, spot(0.9, 0.1).y);
// Formatted text, mid-edit, with the panel open on a selected range.
await page.keyboard.press('t');
await page.mouse.click(spot(0.42, 0.22).x, spot(0.42, 0.22).y);
await page.keyboard.type('Softmax turns scores');
await page.keyboard.press('Enter');
await page.keyboard.type('into probabilities');
for (let i = 0; i < 13; i += 1) await page.keyboard.press('Shift+ArrowLeft');
await page.getByRole('button', { name: 'Bold', exact: true }).click();
await page.getByRole('button', { name: 'Text color #2383e2' }).click();
check('a selected range keeps its selection through the panel', (await page.evaluate(() => getSelection().toString())) === 'probabilities');
await shot('01-text-range-formatting');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
// A shape with its own text colour and size, and an arrow with arrowheads.
await page.keyboard.press('r');
let a = spot(0.42, 0.42), b = spot(0.56, 0.54);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
await page.mouse.dblclick((a.x + b.x) / 2, (a.y + b.y) / 2);
await page.keyboard.type('Logits');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Text color #b42318' }).click();
await page.locator('input[aria-label="Font size"]').fill('24');
await page.locator('input[aria-label="Font size"]').press('Enter');
await shot('02-shape-text-panel');
await page.keyboard.press('Escape');
await page.keyboard.press('a');
a = spot(0.58, 0.48); b = spot(0.72, 0.48);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
await page.getByRole('button', { name: 'Start arrowhead: dot' }).click();
await shot('03-arrowheads');
await page.keyboard.press('Escape');
// Text / Code.
await page.keyboard.press('t');
await page.mouse.click(spot(0.42, 0.68).x, spot(0.42, 0.68).y);
await page.keyboard.type('def softmax(x):');
await page.keyboard.press('Enter');
await page.keyboard.type('    return exp(x) / exp(x).sum()');
await page.keyboard.press('Escape');
await page.locator('[data-item-id] [data-text-mode="code"]').last().click();
await shot('04-text-code');
await page.keyboard.press('Escape');
// Composer hidden, suggestions minimized (no request: the suggestion route is aborted here anyway).
await page.getByRole('button', { name: 'Hide chat composer' }).click();
check('the composer hides and leaves a small Show button', await page.getByRole('button', { name: 'Show chat composer' }).isVisible());
await shot('05-composer-hidden');
await page.getByRole('button', { name: 'Show chat composer' }).click();
// Shortcut sheet.
await page.keyboard.press('?');
await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
await shot('06-shortcut-sheet');
await page.keyboard.press('Escape');
// Phone width.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await shot('07-phone');
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
console.log(`canvas: ${made.name}`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
