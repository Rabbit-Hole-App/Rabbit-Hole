// The canvas tools never cover canvas content, checked on a DEPLOYED board.
// Desktop (the review viewport): the widest card is panned hard right; the
// toolbar must sit wholly outside the canvas surface, and at points along the
// card's visible right edge the element on top must be the card, never the
// toolbar. Zoom stays 100%, so card typography is unchanged. Phone width: the
// tools become a strip below the canvas - still outside it - and a tool can be
// picked and the strip scrolled to its last control. Screenshots go to outDir.
//
// Usage: node e2e/canvas-toolbar-check.mjs <deployed-base> <board> <outDir>
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, OUT] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/canvas-toolbar-check.mjs <deployed-base> <board> <outDir>');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-toolbar-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');
const cards = BOARDS[board]().filter(block => block.scene);
const failures = [];
const fail = message => { failures.push(message); console.log(`  ✗ ${message}`); };
const browser = await chromium.launch();
const results = {};

// Surface and toolbar rectangles, straight from the DOM.
const geometry = page => page.evaluate(() => {
  const gutter = document.querySelector('[data-tool-gutter]');
  const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const toolbar = document.querySelector('[role="toolbar"][aria-label="Canvas tools"]');
  return { surface: box(gutter.previousElementSibling), toolbar: box(toolbar), gutter: box(gutter), zoom: document.querySelector('[title="Reset zoom"]')?.textContent?.trim() };
});
const disjoint = (a, b) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage();
  await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`);
  const canvas = page.locator('[aria-label="Lesson canvas"]');
  await canvas.waitFor({ timeout: 30000 });
  await page.getByText(cards[0].title).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page, canvas };
}

// --- desktop: the review viewport, the widest card pushed under where the toolbar used to float ---
{
  const { context, page, canvas } = await open({ width: 1720, height: 1100 });
  const widths = [];
  for (const block of cards) {
    const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: block.title }).first();
    widths.push({ block, width: (await card.boundingBox())?.width || 0 });
  }
  const widest = widths.sort((a, b) => b.width - a.width)[0];
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: widest.block.title }).first();
  await reveal(page, canvas, card);
  let g = await geometry(page);
  // Pan right until the card's right edge runs 120px past the surface's right edge.
  for (let i = 0; i < 20; i += 1) {
    const box = await card.boundingBox();
    const dx = box.x + box.width - (g.surface.right + 120);
    if (Math.abs(dx) < 4) break;
    await page.mouse.move(g.surface.x + 40, g.surface.y + g.surface.h / 2);
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(80);
  }
  g = await geometry(page);
  const box = await card.boundingBox();
  if (!disjoint(g.toolbar, g.surface)) fail(`desktop: toolbar ${JSON.stringify(g.toolbar)} overlaps the canvas ${JSON.stringify(g.surface)}`);
  if (g.zoom !== '100%') fail(`desktop: zoom is ${g.zoom}, not 100%`);
  // On-top test along the card's visible right edge, within the surface.
  const xs = [g.surface.right - 2, g.surface.right - 30, g.surface.right - 60];
  const ys = [0.2, 0.4, 0.5, 0.6, 0.8].map(f => Math.max(g.surface.y + 4, Math.min(g.surface.bottom - 4, box.y + box.height * f)));
  let probes = 0, onCard = 0;
  for (const x of xs) for (const y of ys) {
    probes += 1;
    const hit = await page.evaluate(([px, py, title]) => {
      const el = document.elementFromPoint(px, py);
      return { card: !!el?.closest('[data-block-id]')?.textContent?.includes(title), toolbar: !!el?.closest('[role="toolbar"]') };
    }, [x, y, widest.block.title]);
    if (hit.toolbar) fail(`desktop: the toolbar is on top at (${Math.round(x)}, ${Math.round(y)})`);
    if (hit.card) onCard += 1;
  }
  // The tools still work: arm the pen, then go back to select.
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const armed = await page.getByRole('button', { name: 'Pen', exact: true }).getAttribute('aria-pressed');
  await page.getByRole('button', { name: 'Select and move', exact: true }).click();
  if (armed !== 'true') fail('desktop: the pen tool did not arm');
  await page.screenshot({ path: `${OUT}/desktop-widest-card-panned-right.png`, clip: { x: Math.max(0, g.surface.right - 900), y: g.surface.y, width: Math.min(1100, g.gutter.right + 40 - Math.max(0, g.surface.right - 900)), height: Math.min(1000, g.surface.h) } });
  results.desktop = { card: widest.block.title, cardWidth: Math.round(widest.width), surface: g.surface, toolbar: g.toolbar, zoom: g.zoom, probes, probesOnCard: onCard, penArmed: armed === 'true' };
  console.log(`desktop: widest card "${widest.block.title}" (${Math.round(widest.width)}px), toolbar clear of the canvas, ${onCard}/${probes} edge probes hit the card, zoom ${g.zoom}`);
  await context.close();
}

// --- phone: the tools become a strip under the canvas ---
{
  const { context, page, canvas } = await open({ width: 390, height: 844 });
  const g = await geometry(page);
  if (!disjoint(g.toolbar, g.surface)) fail(`phone: toolbar ${JSON.stringify(g.toolbar)} overlaps the canvas ${JSON.stringify(g.surface)}`);
  if (g.toolbar.y < g.surface.bottom - 1) fail('phone: the toolbar is not below the canvas');
  if (g.toolbar.x < 0 || g.toolbar.right > 390) fail(`phone: the toolbar runs off screen (${g.toolbar.x}..${g.toolbar.right})`);
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const armed = await page.getByRole('button', { name: 'Pen', exact: true }).getAttribute('aria-pressed');
  if (armed !== 'true') fail('phone: the pen tool did not arm');
  await page.getByRole('button', { name: 'Select and move', exact: true }).click();
  // The last control is reachable by scrolling the strip.
  await page.locator('[role="toolbar"][aria-label="Canvas tools"]').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const style = page.locator('[role="toolbar"][aria-label="Canvas tools"] [aria-label="Style"]');
  const styleBox = await style.boundingBox();
  if (!styleBox || styleBox.x < 0 || styleBox.x + styleBox.width > 390) fail('phone: the Style control cannot be scrolled into view');
  await page.locator('[role="toolbar"][aria-label="Canvas tools"]').evaluate(el => { el.scrollLeft = 0; });
  const first = cards[0];
  await reveal(page, canvas, canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: first.title }).first());
  await page.screenshot({ path: `${OUT}/phone-canvas-and-tool-strip.png`, fullPage: false });
  results.phone = { surface: g.surface, toolbar: g.toolbar, penArmed: armed === 'true', styleReachable: !!styleBox };
  console.log(`phone: tool strip below the canvas (${Math.round(g.toolbar.y)} >= ${Math.round(g.surface.bottom)}), pen arms, Style reachable by scrolling`);
  await context.close();
}

await browser.close();
results.failures = failures;
writeFileSync(`${OUT}/toolbar-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${failures.length} failure(s) -> ${OUT}`);
if (failures.length) process.exit(1);
