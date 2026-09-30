// Canvas utilities (the tools and the overview minimap) never cover canvas
// content, checked on a DEPLOYED board.
// Desktop (the review viewport, 1720 x 1100): the widest card is panned hard
// right; the toolbar and the overview sit wholly outside the canvas surface -
// collapsed by default at this width, and still outside once opened - and at
// points along the card's visible right edge the element on top is the card.
// A wheel over empty gutter space pans the canvas; the tools still work; zoom
// stays 100%. Wide screen (2200 x 1200): the overview is open by default and
// outside the canvas. Phone (390 x 844): the canvas has a real working height,
// the tools are a scrolling strip below it, the overview opens below the strip
// (not over the card), the zoom controls sit clear of the composer (a tap on the
// "Ask about" input reaches the input) and of the canvas, and the table of
// contents is reachable by scrolling.
//
// Usage: node e2e/canvas-toolbar-check.mjs <deployed-base> <board> <outDir>
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';
import { DEV_CP } from './dev-cp.mjs';

const [, , base, board, OUT] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/canvas-toolbar-check.mjs <deployed-base> <board> <outDir>');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-toolbar-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');
const cards = BOARDS[board]().filter(block => block.scene);
const failures = [];
const fail = message => { failures.push(message); console.log(`  ✗ ${message}`); };
const browser = await chromium.launch();
const results = {};

// Surface, gutter, toolbar and overview rectangles, straight from the DOM.
const geometry = page => page.evaluate(() => {
  const box = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  return {
    surface: box(document.querySelector('[data-canvas-surface]')),
    gutter: box(document.querySelector('[data-tool-gutter]')),
    toolbar: box(document.querySelector('[role="toolbar"][aria-label="Canvas tools"]')),
    overview: box(document.querySelector('[aria-label="Canvas overview"]')?.parentElement),
    zoom: document.querySelector('[title="Reset zoom"]')?.textContent?.trim(),
  };
});
const disjoint = (a, b) => !a || !b || a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
const round = box => box && Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));

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
const cardLocator = (canvas, block) => canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: block.title }).first();

// Push a card until its right edge runs `past` px beyond the surface's right edge.
async function pushRight(page, card, past) {
  for (let i = 0; i < 20; i += 1) {
    const g = await geometry(page), box = await card.boundingBox();
    const dx = box.x + box.width - (g.surface.right + past);
    if (Math.abs(dx) < 4) return;
    await page.mouse.move(g.surface.x + 40, g.surface.y + g.surface.h / 2);
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(80);
  }
}
// Probe points along the surface's right edge, level with the card: the card must be on top.
async function probeEdge(page, card, title, label) {
  const g = await geometry(page), box = await card.boundingBox();
  let probes = 0, onCard = 0;
  for (const x of [g.surface.right - 2, g.surface.right - 30, g.surface.right - 60]) {
    for (const f of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      const y = Math.max(g.surface.y + 4, Math.min(g.surface.bottom - 4, box.y + box.height * f));
      probes += 1;
      const hit = await page.evaluate(([px, py, t]) => {
        const el = document.elementFromPoint(px, py);
        return { card: !!el?.closest('[data-block-id]')?.textContent?.includes(t), utility: !!el?.closest('[role="toolbar"],[data-tool-gutter]') };
      }, [x, y, title]);
      if (hit.utility) fail(`${label}: a canvas utility is on top at (${Math.round(x)}, ${Math.round(y)})`);
      if (hit.card) onCard += 1;
    }
  }
  if (onCard < probes * 0.8) fail(`${label}: only ${onCard}/${probes} edge probes landed on the card`);
  return { probes, onCard };
}

// --- desktop: the review viewport ---
{
  const { context, page, canvas } = await open({ width: 1720, height: 1100 });
  const widths = [];
  for (const block of cards) widths.push({ block, width: (await cardLocator(canvas, block).boundingBox())?.width || 0 });
  const widest = widths.sort((a, b) => b.width - a.width)[0];
  const card = cardLocator(canvas, widest.block);
  await reveal(page, canvas, card);
  await pushRight(page, card, 120);
  let g = await geometry(page);
  let box = await card.boundingBox();
  if (!(box.x + box.width > g.surface.right + 60 && box.y < g.toolbar.bottom && box.y + box.height > g.toolbar.y)) fail(`desktop: the card was not panned under the toolbar's side (${JSON.stringify(round(box))})`);
  if (!disjoint(g.toolbar, g.surface)) fail(`desktop: toolbar ${JSON.stringify(round(g.toolbar))} overlaps the canvas ${JSON.stringify(round(g.surface))}`);
  // The rule, not the viewport: the overview opens by default when the canvas (surface + gutter)
  // is at least 1400px wide. The immersive WP7 Learn shell gives the canvas the full 1720px width.
  const canvasWidth = g.surface.w + g.gutter.w, openByRule = canvasWidth >= 1400;
  if (!!g.overview !== openByRule) fail(`desktop: the overview is ${g.overview ? 'open' : 'collapsed'} by default on a ${Math.round(canvasWidth)}px canvas; the 1400px rule says ${openByRule ? 'open' : 'collapsed'}`);
  if (g.overview) { await page.getByRole('button', { name: 'Hide overview', exact: true }).click(); await page.waitForTimeout(400); await pushRight(page, card, 120); g = await geometry(page); }
  if (!disjoint(g.overview, g.surface)) fail('desktop: the overview overlaps the canvas');
  if (g.zoom !== '100%') fail(`desktop: zoom is ${g.zoom}, not 100%`);
  const collapsed = { surface: round(g.surface), toolbar: round(g.toolbar), ...(await probeEdge(page, card, widest.block.title, 'desktop, overview collapsed')) };

  // Open the overview: it takes gutter space, the canvas narrows, nothing floats over the card.
  await page.getByRole('button', { name: 'Show overview', exact: true }).click();
  await page.waitForTimeout(400);
  await pushRight(page, card, 120);
  g = await geometry(page);
  if (!g.overview) fail('desktop: Show overview did not open it');
  if (!disjoint(g.overview, g.surface)) fail(`desktop: the open overview ${JSON.stringify(round(g.overview))} overlaps the canvas ${JSON.stringify(round(g.surface))}`);
  if (!disjoint(g.toolbar, g.surface)) fail('desktop: with the overview open the toolbar overlaps the canvas');
  const opened = { surface: round(g.surface), overview: round(g.overview), ...(await probeEdge(page, card, widest.block.title, 'desktop, overview open')) };
  await page.screenshot({ path: `${OUT}/desktop-wide-card-toolbar-overview.png`, clip: { x: Math.max(0, g.surface.right - 820), y: g.surface.y, width: Math.min(1100, g.gutter.right + 40 - Math.max(0, g.surface.right - 820)), height: Math.min(1000, g.surface.h) } });

  // Wheel over empty gutter space pans the canvas.
  const empty = await page.evaluate(() => {
    const gutter = document.querySelector('[data-tool-gutter]'), r = gutter.getBoundingClientRect();
    for (let y = r.top + 8; y < r.bottom - 8; y += 8) for (let x = r.left + 4; x < r.right - 4; x += 8) {
      if (document.elementFromPoint(x, y) === gutter) return { x, y };
    }
    return null;
  });
  if (!empty) fail('desktop: no empty gutter space found to wheel over');
  else {
    const before = (await card.boundingBox()).y;
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    const moved = before - (await card.boundingBox()).y;
    if (Math.abs(moved - 240) > 4) fail(`desktop: wheel over the empty gutter moved the canvas ${Math.round(moved)}px, expected 240`);
    results.gutterWheel = { at: round(empty), moved: Math.round(moved) };
  }
  // The tools still work.
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const armed = await page.getByRole('button', { name: 'Pen', exact: true }).getAttribute('aria-pressed');
  await page.getByRole('button', { name: 'Select and move', exact: true }).click();
  if (armed !== 'true') fail('desktop: the pen tool did not arm');
  results.desktop = { card: widest.block.title, cardWidth: Math.round(widest.width), zoom: g.zoom, collapsed, opened, penArmed: armed === 'true' };
  console.log(`desktop: "${widest.block.title}" (${Math.round(widest.width)}px) pushed past the edge; toolbar and overview outside the canvas (collapsed ${collapsed.onCard}/${collapsed.probes}, open ${opened.onCard}/${opened.probes} edge probes on the card); gutter wheel moved ${results.gutterWheel?.moved}px; pen arms; zoom ${g.zoom}`);
  await context.close();
}

// --- wide screen: the overview is open by default, beside the tools ---
{
  const { context, page } = await open({ width: 2200, height: 1200 });
  const g = await geometry(page);
  if (!g.overview) fail(`wide: the overview is not open by default (canvas ${Math.round(g.surface.w + g.gutter.w)}px)`);
  if (!disjoint(g.overview, g.surface) || !disjoint(g.toolbar, g.surface)) fail('wide: a utility overlaps the canvas');
  results.wide = { surface: round(g.surface), overview: round(g.overview), toolbar: round(g.toolbar) };
  console.log(`wide: overview open by default beside the tools, outside the canvas`);
  await context.close();
}

// --- phone ---
{
  const { context, page, canvas } = await open({ width: 390, height: 844 });
  let g = await geometry(page);
  if (g.surface.h < 0.45 * 844) fail(`phone: the canvas is only ${Math.round(g.surface.h)}px tall`);
  if (!disjoint(g.toolbar, g.surface) || g.toolbar.y < g.surface.bottom - 1) fail('phone: the tool strip is not below the canvas');
  if (g.toolbar.x < 0 || g.toolbar.right > 390) fail('phone: the tool strip runs off screen');
  if (g.overview) fail('phone: the overview is open by default');
  // The zoom controls never sit on the composer: the input's centre reaches the input.
  await page.locator('input[placeholder^="Ask about"]').scrollIntoViewIfNeeded();
  const dock = await page.evaluate(() => {
    const box = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const input = document.querySelector('input[placeholder^="Ask about"]'), r = input.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { zoom: box(document.querySelector('[aria-label="Zoom controls"]')), form: box(input.closest('form')), surface: box(document.querySelector('[data-canvas-surface]')), onInput: !!hit && input.contains(hit), hit: hit?.closest('[aria-label]')?.getAttribute('aria-label') || hit?.tagName };
  });
  if (!dock.zoom || !dock.form) fail('phone: the zoom controls or the composer are missing');
  if (!disjoint(dock.zoom, dock.form)) fail(`phone: the zoom controls ${JSON.stringify(round(dock.zoom))} overlap the composer ${JSON.stringify(round(dock.form))}`);
  if (!dock.onInput) fail(`phone: a tap on the composer input lands on ${dock.hit}, not the input`);
  if (!disjoint(dock.zoom, dock.surface)) fail('phone: the zoom controls overlap the canvas');
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const armed = await page.getByRole('button', { name: 'Pen', exact: true }).getAttribute('aria-pressed');
  if (armed !== 'true') fail('phone: the pen tool did not arm');
  await page.getByRole('button', { name: 'Select and move', exact: true }).click();
  const strip = page.locator('[role="toolbar"][aria-label="Canvas tools"]');
  const scrollable = await strip.evaluate(el => el.scrollWidth > el.clientWidth);
  await strip.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const styleBox = await strip.locator('[aria-label="Style"]').boundingBox();
  if (!scrollable || !styleBox || styleBox.x < 0 || styleBox.x + styleBox.width > 390) fail('phone: the strip does not scroll its last control into view');
  await strip.evaluate(el => { el.scrollLeft = 0; });
  await page.getByRole('button', { name: 'Show overview', exact: true }).click();
  await page.waitForTimeout(400);
  g = await geometry(page);
  if (!g.overview) fail('phone: Show overview did not open it');
  if (!disjoint(g.overview, g.surface)) fail('phone: the open overview overlaps the canvas');
  if (g.overview && g.overview.y < g.toolbar.bottom - 1) fail('phone: the open overview is not below the strip');
  await reveal(page, canvas, cardLocator(canvas, cards[0]));
  await page.screenshot({ path: `${OUT}/phone-canvas-strip-overview.png` });
  const heightWithOverview = Math.round(g.surface.h);
  // The right panel starts closed (Learn, 2026-09-28); opened, it stacks under the canvas on a phone.
  const showPanel = page.getByRole('button', { name: 'Show the right panel' }).first();
  if (await showPanel.count()) { await showPanel.click(); await page.waitForTimeout(500); }
  // The panel's outline list is the table of contents (Learn dropped its 'Table of contents' heading on 2026-09-22).
  const toc = page.locator('aside[aria-label="Learn agent chat"] ol').first();
  await toc.scrollIntoViewIfNeeded();
  const tocVisible = await toc.isVisible();
  if (!tocVisible) fail('phone: the table of contents cannot be scrolled into view');
  results.phone = { surface: round((await geometry(page)).surface), heightWithOverview, strip: round(g.toolbar), overview: round(g.overview), zoomControls: round(dock.zoom), composer: round(dock.form), composerTappable: dock.onInput, penArmed: armed === 'true', stripScrolls: scrollable, tocReachable: tocVisible };
  console.log(`phone: canvas ${results.phone.surface.h}px tall (${heightWithOverview}px with the overview open), strip below it scrolls, overview opens below the strip, zoom controls clear of the composer, table of contents reachable`);
  await context.close();
}

await browser.close();
results.failures = failures;
writeFileSync(`${OUT}/toolbar-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${failures.length} failure(s) -> ${OUT}`);
if (failures.length) process.exit(1);
