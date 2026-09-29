import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// View > Slash commands on the parallel clone: choosing a command shows the
// real card it makes (the canvas's own card component) at its canvas size and
// working; paid Generate is off; chat-only commands show an example exchange.
// No model calls, nothing generated.
// usage: node e2e/slash-sheet-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'slash-sheet' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const paid = [];
page.on('request', request => { if (request.method() === 'POST' && /\/api\/learn\/(image|video|scene|tts|artifact)/.test(request.url())) paid.push(request.url()); });
await page.goto(`${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=sheet-${Date.now().toString(36)}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
await page.getByRole('menuitem', { name: 'Slash commands' }).click();
const sheet = page.getByRole('dialog', { name: 'Slash commands' });
await sheet.waitFor();
// The card a command makes: [data-slash-card] and a readiness hint per card type.
const expect = { graph: '.dcg-container, canvas', quiz: 'button', diagram: '.react-flow__node', animate: 'video[data-lesson-video]', explain: 'p', notebook: 'iframe', walkthrough: 'svg, button', code: 'pre, code' };
for (const [command, ready] of Object.entries(expect)) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const card = sheet.locator('[data-slash-card]');
  await card.waitFor({ timeout: 15000 });
  const drawn = await card.locator(ready).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  // The canvas width of that card type (CanvasNode: BLOCK_TYPES width, or 380; notebook 640).
  const widths = { graph: 560, quiz: 380, flow: 560, mathAnimation: 560, explanation: 440, notebook: 640, walkthrough: 420, snippet: 520 };
  const type = await card.getAttribute('data-slash-card');
  const width = Math.round((await card.boundingBox()).width);
  await page.waitForTimeout(800);
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
  ok(`/${command} shows its real card (${type}) at its canvas width`, drawn && width === widths[type], `${width}px`);
}
// Interactive as on the canvas: answering the quiz reveals why; paid Generate is off.
await sheet.locator('[data-slash-help="quiz"]').click();
await sheet.locator('[data-slash-card="quiz"]').getByRole('button').first().click();
ok('the quiz card works: choosing an option answers it', await sheet.locator('[data-slash-card="quiz"]').innerText().then(text => /differentiate|σ|sigma/i.test(text)));
// Generated media shows a finished result: the Manim clip rendered on the clone plays; no Generate card.
await sheet.locator('[data-slash-help="animate"]').click();
const clip = sheet.locator('[data-slash-card] video[data-lesson-video]');
const plays = await clip.waitFor({ timeout: 20000 }).then(() => clip.evaluate(node => new Promise(done => { if (node.readyState >= 1) return done(node.duration); node.addEventListener('loadedmetadata', () => done(node.duration), { once: true }); setTimeout(() => done(0), 15000); }))).catch(() => 0);
ok('/animate shows the finished Manim clip, not a Generate card', plays > 0 && await sheet.locator('[data-slash-card] [data-generate-video]').count() === 0, `${plays}s`);
await sheet.screenshot({ path: `${SHOTS}/sheet-animate.png` });
// Blender and FAL have each produced their sample on the clone (2026-09-29): the finished results show.
await sheet.locator('[data-slash-help="3d"]').click();
ok('/3d shows the finished Blender scene in the 3D viewer', await sheet.locator('[data-slash-card="scene"] canvas').waitFor({ timeout: 20000 }).then(() => true).catch(() => false) && await sheet.locator('[data-slash-card] [data-generate-scene]').count() === 0);
await sheet.screenshot({ path: `${SHOTS}/sheet-3d.png` });
await sheet.locator('[data-slash-help="video"]').click();
ok('/video shows the finished FAL clip', await sheet.locator('[data-slash-card="videoGenerate"] video[data-lesson-video]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
await sheet.locator('[data-slash-help="compare"]').click();
ok('/compare explains the tutor picks one, and shows a real comparison', await sheet.getByText('The tutor picks one:').count() === 1 && await sheet.locator('[data-slash-card="table"]').getByText('Sigmoid vs tanh').count() === 1);
await sheet.screenshot({ path: `${SHOTS}/sheet-compare.png` });
for (const command of ['deeper', 'simplify', 'example', 'research', 'ask', 'teach', 'do', 'source']) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const chat = sheet.locator(`[data-slash-chat="${command}"]`);
  ok(`/${command} shows an example exchange and adds no card`, await sheet.locator('[data-slash-card]').count() === 0 && await chat.locator('.katex, p').count() > 0 && (await chat.innerText()).includes(`/${command}`));
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
}
await sheet.locator('[data-slash-help="diagram"]').click();
await sheet.getByRole('tab', { name: 'Mermaid diagram' }).click();
ok('a command with several cards switches between them', await sheet.locator('[data-slash-card="mermaid"]').count() === 1);
ok('no page errors and no paid request', errors.length === 0 && paid.length === 0, `${errors.join(' | ')} ${paid.join(' ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
