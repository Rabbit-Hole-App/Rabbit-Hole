// One screenshot per card at its default state (what a learner sees first,
// sources collapsed), from a DEPLOYED board, split into batches of a fixed
// size in board order - one folder per batch, files numbered within it - so
// a reviewer can take them a few at a time.
//
// Usage: node e2e/card-batches.mjs <deployed-base> <board> <outPrefix> [perBatch=6] [version=1]
//   writes <outPrefix>-batch1-v<version>/, <outPrefix>-batch2-v<version>/, ...
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';
import { DEV_CP } from './dev-cp.mjs';

const [, , base, board, prefix, per = '6', version = '1'] = process.argv;
if (!base || !board || !prefix) throw new Error('usage: node e2e/card-batches.mjs <deployed-base> <board> <outPrefix> [perBatch] [version]');
const cards = BOARDS[board]().filter(block => block.scene);
const size = Number(per);
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-card-batches' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 2400 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.getByText(cards[0].title).first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));
const name = title => title.toLowerCase().replace(/ · /, ' ').replace(/:.*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (let b = 0; b * size < cards.length; b += 1) {
  const dir = `${prefix}-batch${b + 1}-v${version}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const index = [`# ${board} — batch ${b + 1}`, '', `Deployed: ${base} · bundle \`${bundle}\` · each card at its default state, sources collapsed.`, ''];
  for (const [i, block] of cards.slice(b * size, (b + 1) * size).entries()) {
    const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: block.title }).first();
    await reveal(page, canvas, card);
    await page.waitForTimeout(300);
    const file = `${i + 1}-${name(block.title)}.png`;
    await card.screenshot({ path: `${dir}/${file}` });
    index.push(`${i + 1}. \`${file}\` — ${block.title}`);
    console.log(`${dir}/${file}`);
  }
  writeFileSync(`${dir}/INDEX.md`, `${index.join('\n')}\n`);
}
await browser.close();
