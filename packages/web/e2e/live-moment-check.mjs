// Live end-to-end: the tutor on the deployed clone finds a real YouTube
// moment (Exa + InnerTube + the real model), the card lands with a window,
// Keep writes the real D1 row, and a repeat ask exercises the warm path.
// Everything is real; expect minutes, not seconds. Not committed to CI.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

const base = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const app = 'repo-06745f10-nanogpt';
// Fresh boards each run, so a card left from an earlier run cannot pass the check.
const run = Date.now().toString(36);
const board = `live-moment-${run}-a`;
const secret = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'live-moment-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) { console.log('FAIL: no test session'); process.exit(1); }

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1760, height: 1100 } });
await ctx.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
page.on('response', r => { if (r.url().includes('/api/learn/') || r.url().includes('/api/repositories/')) console.log('HTTP', r.status(), new URL(r.url()).pathname); });
const feedbackResponses = [];
page.on('response', async response => {
  if (response.url().includes('/api/learn/moment-feedback')) {
    feedbackResponses.push({ status: response.status(), body: await response.json().catch(() => null) });
  }
});

await page.goto(`${base}/apps/${app}?tab=learn&board=${board}`);
await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 40000 });
await page.waitForTimeout(2000);
const canvas = page.locator('[aria-label="Lesson canvas"]');
const composer = page.getByPlaceholder(/Ask about/).first();

const ask = async question => {
  const before = Date.now();
  await composer.fill(question);
  await page.keyboard.press('Enter');
  try { await canvas.locator('iframe[src*="youtube-nocookie.com"]').first().waitFor({ timeout: 180000 }); }
  catch (error) {
    await page.screenshot({ path: 'e2e/shots/live-moment-stuck.png' });
    console.log('no card; canvas text:', (await canvas.innerText().catch(() => '')).slice(0, 500).replace(/\s+/g, ' '));
    throw error;
  }
  return Math.round((Date.now() - before) / 1000);
};

// --- cold: real discovery, captions, model choice ---
const coldSeconds = await ask('Find a YouTube video moment that visually explains backpropagation and show me exactly that moment.');
const card = canvas.locator('iframe[src*="youtube-nocookie.com"]').first();
const src = await card.getAttribute('src');
console.log(`cold answer: card in ${coldSeconds}s, embed ${src}`);
ok('the tutor put a real video card on the canvas', !!src);
ok('the moment rides the embed as a window', /start=\d+/.test(src || ''), src);

// --- keep: the verdict writes a real log row ---
await page.waitForTimeout(2000);
const verdict = canvas.getByText('Did this moment help?');
ok('the card asks for a verdict (a real momentId came back)', (await verdict.count()) === 1);
if (await verdict.count()) {
  await canvas.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.waitForTimeout(3000);
  const graded = feedbackResponses.at(-1);
  ok('Keep landed in the real learn_moments row', graded?.status === 200 && graded?.body?.updated === true, JSON.stringify(graded));
}
await page.screenshot({ path: 'e2e/shots/live-moment-cold.png' });

// --- warm: give the queue consumer time to index, then re-ask ---
console.log('waiting 75s for the queue consumer to index the candidates...');
await page.waitForTimeout(75000);
await page.goto(`${base}/apps/${app}?tab=learn&board=live-moment-${run}-b`);
await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 40000 });
await page.waitForTimeout(2000);
const warmSeconds = await ask('Show me the video moment where backpropagation is explained visually.');
const warmSrc = await page.locator('[aria-label="Lesson canvas"] iframe[src*="youtube-nocookie.com"]').first().getAttribute('src');
console.log(`repeat answer: card in ${warmSeconds}s, embed ${warmSrc}`);
ok('the repeat ask lands a card too', !!warmSrc);
console.log(`timing: cold ${coldSeconds}s vs repeat ${warmSeconds}s${warmSeconds < coldSeconds ? ' - faster, consistent with warm' : ' - not faster; check whether indexing finished'}`);

await page.screenshot({ path: 'e2e/shots/live-moment-warm.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
