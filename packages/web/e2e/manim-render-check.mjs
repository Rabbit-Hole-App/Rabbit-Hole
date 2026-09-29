import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// One real manim render on the parallel clone, end to end: insert the Maths
// animation card, Render asks first, Generate starts the paid job, and the
// rendered clip plays. PAID - run only with the user's explicit yes.
// usage: node e2e/manim-render-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `manim-${Date.now().toString(36)}`;
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'manim-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const posts = [];
page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/learn/video')) posts.push(JSON.parse(request.postData() || '{}')); });
page.on('pageerror', error => console.log('PAGEERROR', error.message.slice(0, 200)));
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: 'Insert lesson block' }).click();
await page.getByRole('menu', { name: 'Lesson blocks' }).getByRole('menuitem', { name: 'Maths animation (paid)', exact: true }).click();
const found = page.locator('[data-block-id]').filter({ has: page.locator('[data-generate-video]') }).last();
await found.waitFor({ timeout: 15000 });
// Pin the card by id: Render swaps its button for the confirmation.
const card = page.locator(`[data-block-id="${await found.getAttribute('data-block-id')}"]`);
await card.locator('[data-generate-video]').click();
ok('Render asks first and posts nothing', await card.locator('[data-paid-confirm]').count() === 1 && posts.length === 0);
await page.screenshot({ path: `${SHOTS}/manim-confirm.png` });
await card.locator('[data-paid-generate]').click();
const started = Date.now();
await page.waitForTimeout(3000);
ok('Generate sends the confirmed job', posts.some(body => body.confirmed === true && body.operation?.op === 'generate_math_animation'));
try {
  await card.locator('video[data-lesson-video]').waitFor({ timeout: 480000 });
  const playable = await card.locator('video[data-lesson-video]').evaluate(node => new Promise(resolve => {
    if (node.readyState >= 1) return resolve(node.duration);
    node.addEventListener('loadedmetadata', () => resolve(node.duration), { once: true });
    node.addEventListener('error', () => resolve(0), { once: true });
    setTimeout(() => resolve(node.readyState >= 1 ? node.duration : 0), 20000);
  }));
  ok('the rendered clip plays', playable > 0, `${Math.round((Date.now() - started) / 1000)}s to render, ${playable?.toFixed?.(1)}s long`);
} catch {
  ok('the rendered clip plays', false, `card says: ${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`);
}
await card.screenshot({ path: `${SHOTS}/manim-rendered.png` }).catch(() => {});
console.log('board', BOARD);
await browser.close();
process.exit(failed ? 1 : 0);
