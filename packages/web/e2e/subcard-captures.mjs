// Clean review captures from a DEPLOYED board: every card at its default
// state, and a paged card once per sub-card (paged from its own header), with
// nothing but the card in the image - no toolbar, overview, selection pill,
// tooltip, hover or focus ring. Before each capture a grid of points over the
// card must hit the card itself (document.elementFromPoint); anything else on
// top fails the run instead of being baked into a review image.
//
// Usage: node e2e/subcard-captures.mjs <deployed-base> <board> <outDir>
//   writes <outDir>/NN-<card>[-part-k].png and <outDir>/captures.json
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, OUT] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/subcard-captures.mjs <deployed-base> <board> <outDir>');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const all = BOARDS[board]();
const cards = all.filter(block => block.scene);
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-subcard-captures' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
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
const slug = title => title.toLowerCase().replace(/:.*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// No selection, hover or focus left on the page, then prove nothing covers the card.
async function settle(card) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  const covered = await card.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hits = [];
    for (let i = 1; i < 10; i += 1) for (let j = 1; j < 10; j += 1) {
      const x = box.left + (box.width * i) / 10, y = box.top + (box.height * j) / 10;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && !element.contains(top)) hits.push(`${top.tagName.toLowerCase()}${top.getAttribute('data-tool-gutter') !== null ? '[data-tool-gutter]' : ''}.${String(top.className).slice(0, 40)} at ${Math.round(x)},${Math.round(y)}`);
    }
    return hits;
  });
  if (covered.length) throw new Error(`something covers the card: ${covered.slice(0, 3).join(' | ')}`);
}

const shots = [];
let order = 0;
for (const block of cards) {
  order += 1;
  const scene = block.scene;
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ has: page.locator('[data-animation-frame]') }).filter({ hasText: block.title }).first();
  await reveal(page, canvas, card);
  const pager = (scene.inputs || []).find(d => d.presentation === 'pager');
  const parts = pager ? scene.exampleData[pager.of] : [null];
  const heading = all.slice(0, all.indexOf(block)).reverse().find(b => b.type === 'heading');
  for (const [k, partName] of parts.entries()) {
    if (k > 0) {
      await card.locator('[data-card-pager] [data-pager-step="next"]').click();
      await page.waitForTimeout(400);
    }
    if (pager) {
      const readout = await card.locator('[data-card-pager] [data-pager-readout]').textContent();
      if (!readout.endsWith(`${k + 1}/${parts.length}`)) throw new Error(`${scene.id}: header reads "${readout}" on sub-card ${k + 1}`);
    }
    await reveal(page, canvas, card);
    await settle(card);
    const file = `${String(order).padStart(2, '0')}-${slug(block.title)}${pager ? `-part-${k + 1}` : ''}.png`;
    await card.screenshot({ path: `${OUT}/${file}` });
    const box = await card.boundingBox();
    shots.push({ file, card: scene.id, title: block.title, heading: heading?.text ?? null, part: pager ? { index: k, of: parts.length, name: partName } : null, w: Math.round(box.width), h: Math.round(box.height) });
    console.log(file);
  }
}
writeFileSync(`${OUT}/captures.json`, JSON.stringify({ base, board, bundle, shots }, null, 2));
console.log(`${shots.length} captures · bundle ${bundle} -> ${OUT}`);
await browser.close();
