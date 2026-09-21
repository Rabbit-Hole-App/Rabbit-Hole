// Static App Review Gallery: capture each of the five lesson canvases'
// visualization, plus one explanation block and one quiz block, in both
// themes, for human review. Same recipe as board-check.mjs.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const base = 'https://small-cp-dev.zeroshothq.workers.dev';
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-gallery-shots' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=static-app-review`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
console.log('blocks on board:', await canvas.locator('[data-block-id]').count());

// [title text to match, output slug]
// Matched on each scene's own final note text (typed at the end of its
// timeline), not the scene title - several titles are reused verbatim as
// the sibling explanation block's title, which would otherwise match first.
const animations = [
  ['How one token attends to the tokens before it', 'canvas1-attention'],
  ['each sub-layer only has to learn the change it adds', 'canvas2-transformer-block'],
  ['only the projector is new', 'canvas3-vlm'],
  ['the other two branches were predicted but never happened', 'canvas4-world-model'],
  ['orientation first, implementation second', 'canvas5-codebase'],
];
const extras = [
  ['nanoGPT — Self-Attention', 'canvas1-explanation'],
  ['Why is every score above the diagonal masked out before softmax?', 'canvas1-quiz'],
  ["nanoGPT's CausalSelfAttention (model.py)", 'canvas1-snippet'],
  ['Where the code lives', 'canvas5-table'],
];

async function shootAll(themeSlug) {
  for (const [text, slug] of [...animations, ...extras]) {
    const node = canvas.locator('[data-block-id]').filter({ hasText: text }).first();
    await node.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await node.screenshot({ path: `e2e/shots/gallery-${slug}-${themeSlug}.png` });
    console.log(`captured ${slug} (${themeSlug})`);
  }
}

await shootAll('light');
await page.evaluate(() => document.documentElement.classList.add('dark'));
await page.waitForTimeout(500);
await shootAll('dark');
await browser.close();
