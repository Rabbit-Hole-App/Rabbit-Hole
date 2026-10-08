// Canvas utilities never cover canvas content (docs/features/learn-canvas-blocks.md), on the restored
// shell (2026-09-30): the tools in the left gutter, the Rabbit Hole navigator in the right gutter, Home in the top-left
// corner, and the bottom strip (owner, 2026-10-08): the minimap lower left directly above the zoom row, one group on one
// left edge, left of the composer. The strip floats (owner, 2026-10-08: "in the canvas above the chat composer you are
// cutting the canvas too much"): the canvas runs to the bottom under it, the empty strip passes the pointer to the canvas,
// and zoom to fit frames every card clear of it. Chrome may float over the canvas but never hides what the learner cannot
// reach, so the edge probes stop above the strip, and on a phone the tools' strip sits above the canvas.
// Desktop (the review viewport, 1720 x 1100): the widest card is panned hard right, then hard left; the
// card is on top all along each canvas edge, the tools, navigator and minimap sit wholly outside the
// canvas surface, the minimap clears the composer. A wheel over empty gutter space pans the canvas;
// the tools still work; zoom stays 100%. Wide screen (2200 x 1200): the same shell. Phone (390 x 844):
// the canvas has a real working height, the tools are a scrolling strip below it, the overview opens
// below the strip (not over the card), the zoom controls sit clear of the composer (a tap on the
// "Ask about" input reaches the input) and of the canvas, and the table of contents is reachable.
//
// It reads and pans only. Against the local stack (127.0.0.1) it signs in with the local control
// plane's secret and makes its own canvas with the board; against a deployed review worker it uses
// the root .env SMALL_TEST_BYPASS and the nanoGPT project board, as before.
// Usage: node e2e/canvas-toolbar-check.mjs <deployed-base> <board> <outDir>
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARDS } from '../src/demo-scenes.js';
import { reveal } from './canvas-reveal.mjs';
import { DEV_CP } from './dev-cp.mjs';

const [, , base, board, OUT] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/canvas-toolbar-check.mjs <base> <board> <outDir>');
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
mkdirSync(OUT, { recursive: true });
// Sessions: the local stack's own control plane with its .dev.vars secret, or - for a deployed review
// worker - only the rabbit-hole dev control plane (DEV_CP, RABBIT_HOLE_DEV_TEST_BYPASS); never production.
const secret = local
  ? readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim()
  : readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const { session } = await (await fetch(`${local ? process.env.SMALL_CP || 'http://127.0.0.1:8790' : DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-toolbar-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from the control plane');
const learnPath = local
  ? `/apps/${(await (await fetch(`${base}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Toolbar check' }) })).json()).name}?board=${board}`
  : `/apps/repo-06745f10-nanogpt?tab=learn&board=${board}`;
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
    // The gutter overview is the phone strip's; the desktop minimap is the bottom strip's.
    overview: box(document.querySelector('[data-tool-gutter] [aria-label="Canvas overview"]')?.parentElement),
    minimap: (() => { const r = document.querySelector('[data-canvas-minimap] [aria-label="Canvas overview"]')?.getBoundingClientRect(); return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null; })(),
    navigator: box(document.querySelector('[data-dive-navigator]')),
    composer: box(document.querySelector('[data-canvas-composer]')),
    home: box(document.querySelector('[data-learn-home]')),
    zoom: document.querySelector('[title="Reset zoom"]')?.textContent?.trim(),
    zoomRow: box(document.querySelector('[data-zoom]')),
    strip: box(document.querySelector('[data-canvas-bottom]')),
    stack: box(document.querySelector('[data-zoom-stack]')),
  };
});
const utilities = '[role="toolbar"],[data-tool-gutter],[data-dive-gutter],[data-dive-navigator],[data-canvas-minimap]';
const disjoint = (a, b) => !a || !b || a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;
const round = box => box && Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage();
  await page.goto(`${base}${learnPath}`);
  const canvas = page.locator('[aria-label="Lesson canvas"]');
  await canvas.waitFor({ timeout: 30000 });
  await page.getByText(cards[0].title).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page, canvas };
}
const cardLocator = (canvas, block) => canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: block.title }).first();

// Push a card until one edge runs `past` px beyond the surface's edge on that side.
async function pushRight(page, card, past, side = 'right') {
  for (let i = 0; i < 20; i += 1) {
    const g = await geometry(page), box = await card.boundingBox();
    const dx = side === 'right' ? box.x + box.width - (g.surface.right + past) : box.x - (g.surface.x - past);
    if (Math.abs(dx) < 4) return;
    await page.mouse.move(g.surface.x + 40, g.surface.y + g.surface.h / 2);
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(80);
  }
}
// Probe points along the surface's right edge, level with the card: the card must be on top.
async function probeEdge(page, card, title, label, side = 'right') {
  const g = await geometry(page), box = await card.boundingBox();
  let probes = 0, onCard = 0;
  const xs = side === 'right' ? [g.surface.right - 2, g.surface.right - 30, g.surface.right - 60] : [g.surface.x + 2, g.surface.x + 30, g.surface.x + 60];
  for (const x of xs) {
    for (const f of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      // Above the floating strip: under it is reached by panning, not a card the probe must find on top.
      const y = Math.max(g.surface.y + 4, Math.min(Math.min(g.surface.bottom, g.strip?.y ?? Infinity) - 4, box.y + box.height * f));
      probes += 1;
      const hit = await page.evaluate(([px, py, t, u]) => {
        const el = document.elementFromPoint(px, py);
        return { card: !!el?.closest('[data-block-id]')?.textContent?.includes(t), utility: !!el?.closest(u) };
      }, [x, y, title, utilities]);
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
  if (!(box.x + box.width > g.surface.right + 60)) fail(`desktop: the card was not panned past the right edge (${JSON.stringify(round(box))})`);
  // The restored shell: tools left of the canvas, navigator right of it, the minimap below it, above the zoom row, left of the composer.
  if (!(g.toolbar.right <= g.surface.x + 0.5)) fail(`desktop: the tools ${JSON.stringify(round(g.toolbar))} are not in the left gutter`);
  if (!disjoint(g.toolbar, g.surface)) fail(`desktop: toolbar ${JSON.stringify(round(g.toolbar))} overlaps the canvas ${JSON.stringify(round(g.surface))}`);
  if (g.navigator && !(g.navigator.x >= g.surface.right - 0.5)) fail(`desktop: the navigator ${JSON.stringify(round(g.navigator))} is not in the right gutter`);
  if (!g.minimap) fail('desktop: no minimap in the lower left');
  else {
    if (!(g.surface.bottom >= g.strip.bottom - 2 && g.surface.bottom >= g.composer.bottom)) fail(`desktop: the canvas ${JSON.stringify(round(g.surface))} stops above the strip ${JSON.stringify(round(g.strip))}`);
    if (!disjoint(g.minimap, g.composer) || g.minimap.right > g.composer.x) fail('desktop: the minimap does not clear the composer on its left');
    if (!(g.minimap.bottom <= g.zoomRow.y + 0.5) || Math.abs(g.minimap.x - g.zoomRow.x) > 1.5 || g.zoomRow.y - g.minimap.bottom > 12) fail(`desktop: the minimap ${JSON.stringify(round(g.minimap))} is not directly above the zoom row ${JSON.stringify(round(g.zoomRow))} on its left edge`);
    if (g.minimap.w < 150) fail(`desktop: the minimap is only ${Math.round(g.minimap.w)}px wide`);
  }
  if (g.overview) fail('desktop: the gutter overview is open; the desktop minimap is the bottom strip\'s');
  {
    const at = await page.evaluate(([gx, gy]) => {
      const r = document.querySelector('[title="Reset zoom"]').getBoundingClientRect();
      return { gap: !!document.elementFromPoint(gx, gy)?.closest('[data-canvas-surface]'), reset: !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[title="Reset zoom"]') };
    }, [(g.stack.right + g.composer.x) / 2, g.zoomRow.y + g.zoomRow.h / 2]);
    if (!at.gap) fail('desktop: the empty strip between the zoom stack and the composer does not reach the canvas');
    if (!at.reset) fail('desktop: the zoom row does not take the pointer');
  }
  if (!g.home || g.home.x > 24 || g.home.y > 24) fail('desktop: no Home button in the top-left corner');
  if (g.zoom !== '100%') fail(`desktop: zoom is ${g.zoom}, not 100%`);
  const right = { surface: round(g.surface), toolbar: round(g.toolbar), minimap: round(g.minimap), ...(await probeEdge(page, card, widest.block.title, 'desktop, right edge')) };
  await page.screenshot({ path: `${OUT}/desktop-wide-card-right-edge.png` });
  // Hard left: the tools' side.
  await pushRight(page, card, 120, 'left');
  box = await card.boundingBox(); g = await geometry(page);
  if (!(box.x < g.surface.x - 60)) fail(`desktop: the card was not panned past the left edge (${JSON.stringify(round(box))})`);
  const left = { ...(await probeEdge(page, card, widest.block.title, 'desktop, left edge', 'left')) };
  await page.screenshot({ path: `${OUT}/desktop-wide-card-left-edge.png` });
  const opened = left;

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
  // Zoom to fit (the minimap's Back to content) frames every card clear of the floating strip.
  await page.getByRole('button', { name: 'Back to content' }).first().click();
  await page.waitForTimeout(500);
  {
    const fit = await geometry(page);
    const under = await page.evaluate(chrome => [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => el.getBoundingClientRect())
      .filter(r => r.width && chrome.some(c => c && r.right > c.x && c.right > r.x && r.bottom > c.y && c.bottom > r.y)).length, [fit.composer, fit.stack]);
    if (under) fail(`desktop: after zoom to fit, ${under} card(s) under the composer or the minimap and zoom`);
  }
  results.desktop = { card: widest.block.title, cardWidth: Math.round(widest.width), zoom: g.zoom, right, left: opened, penArmed: armed === 'true' };
  console.log(`desktop: "${widest.block.title}" (${Math.round(widest.width)}px) pushed past both edges; tools left, navigator right, minimap lower left above the zoom row, all outside the canvas (right ${right.onCard}/${right.probes}, left ${opened.onCard}/${opened.probes} edge probes on the card); gutter wheel moved ${results.gutterWheel?.moved}px; pen arms; zoom ${g.zoom}`);
  await context.close();
}

// --- wide screen: the same shell ---
{
  const { context, page } = await open({ width: 2200, height: 1200 });
  const g = await geometry(page);
  if (!g.minimap || !(g.surface.bottom >= g.composer.bottom) || g.minimap.right > g.composer.x || !(g.minimap.bottom <= g.zoomRow.y + 0.5)) fail('wide: the canvas stops above the strip, or no minimap in the lower left above the zoom row');
  if (!disjoint(g.toolbar, g.surface) || (g.navigator && !disjoint(g.navigator, g.surface))) fail('wide: a utility overlaps the canvas');
  results.wide = { surface: round(g.surface), minimap: round(g.minimap), toolbar: round(g.toolbar), navigator: round(g.navigator) };
  console.log('wide: tools left, navigator right, minimap lower left above the zoom row, all outside the canvas');
  await context.close();
}

// --- phone ---
{
  const { context, page, canvas } = await open({ width: 390, height: 844 });
  let g = await geometry(page);
  if (g.surface.h < 0.45 * 844) fail(`phone: the canvas is only ${Math.round(g.surface.h)}px tall`);
  if (!disjoint(g.toolbar, g.surface) || g.toolbar.bottom > g.surface.y + 1) fail('phone: the tool strip is not above the canvas');
  if (!(g.surface.bottom >= g.composer.bottom)) fail(`phone: the canvas ${JSON.stringify(round(g.surface))} stops above the composer ${JSON.stringify(round(g.composer))}`);
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
  // The zoom row floats over the canvas now; the empty strip right of it passes the pointer to the canvas.
  const through = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-canvas-surface]'), [(dock.zoom.right + dock.surface.right) / 2, dock.zoom.y + dock.zoom.h / 2]);
  if (!through) fail('phone: the empty strip beside the zoom row does not reach the canvas');
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
