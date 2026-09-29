import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// View > Slash commands on the parallel clone: choosing a command shows the
// real card it makes (the canvas's own card component), inert, and chat-only
// commands say they add no card. No model calls, nothing generated.
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
const expect = { graph: '.dcg-container, canvas', quiz: 'button', diagram: '.react-flow__node', animate: 'button', explain: 'p', notebook: 'iframe', walkthrough: 'svg, button', code: 'pre, code' };
for (const [command, ready] of Object.entries(expect)) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const card = sheet.locator('[data-slash-card]');
  await card.waitFor({ timeout: 15000 });
  const drawn = await card.locator(ready).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  const inert = await card.evaluate(node => node.inert === true);
  await page.waitForTimeout(800);
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
  ok(`/${command} shows its real card (${await card.getAttribute('data-slash-card')}), inert`, drawn && inert);
}
await sheet.locator('[data-slash-help="deeper"]').click();
ok('/deeper says it answers in chat and adds no card', await sheet.locator('[data-slash-card]').count() === 0 && await sheet.getByText('answers in the chat').count() === 1);
await sheet.locator('[data-slash-help="diagram"]').click();
await sheet.getByRole('tab', { name: 'Mermaid diagram' }).click();
ok('a command with several cards switches between them', await sheet.locator('[data-slash-card="mermaid"]').count() === 1);
ok('no page errors and no paid request', errors.length === 0 && paid.length === 0, `${errors.join(' | ')} ${paid.join(' ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
