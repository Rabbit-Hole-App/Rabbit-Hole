// Canvas utilities never cover canvas content (docs/features/learn-canvas-blocks.md), on the restored
// shell (2026-09-30): the tools in the left gutter with the Rabbit Hole navigator at its top (UI-17), Home in the top-left
// corner, and the bottom strip (owner, 2026-10-08): the minimap lower left directly above the zoom row, one group on one
// left edge, on the canvas, clear of the Chat pane at its right (owner brief 2026-10-13 sections 2 and 4: the composer is the
// Chat pane's, no canvas dock). The strip floats (owner, 2026-10-08: "in the canvas above the chat composer you are
// cutting the canvas too much"): the canvas runs to the bottom under it, the empty strip passes the pointer to the canvas,
// and zoom to fit frames every card clear of it. Chrome may float over the canvas but never hides what the learner cannot
// reach, so the edge probes stop above the strip. UI-19 (owner, 2026-10-21): the tools stay one vertical column left of the
// canvas at every width, there is no separate Show/Hide overview button, and the one minimap is the bottom strip's.
// Owner decision 2026-10-22 (supersedes the reserved tools gutter and header row): the drawing surface fills the workspace
// from the page's left edge and the top of the header to the right panel; the tools column, the navigator and the header
// float over it. Only their controls take the pointer and nothing is clipped along an invisible band: a card under the
// tools column or the header row is drawn and answers the pointer beside the controls.
// Desktop (the review viewport, 1720 x 1100): the widest card is panned hard right, then hard left; the
// card is on top all along each canvas edge wherever no floating control stands, the tools sit at the canvas's left edge
// below the header, the minimap stays on the canvas, clear of the Chat pane. A wheel over the tools column's empty part pans the canvas;
// the tools still work; zoom stays 100%. Wide screen (2200 x 1200): the same shell. Phone (390 x 844):
// the canvas has a real working height, the tools are the same vertical column left of it (scrolling its last control into
// view), no overview toggle, the minimap above the zoom row clear of the tools and the composer, the zoom controls sit clear
// of the Chat pane's composer (a tap on its
// field reaches the field; the Chat side of the Chat/Sources switch when the phone shows one) and of the canvas, and the
// table of contents is reachable.
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

// Surface, gutter, toolbar and minimap rectangles, straight from the DOM.
const geometry = page => page.evaluate(() => {
  const box = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  return {
    surface: box(document.querySelector('[data-canvas-surface]')),
    gutter: box(document.querySelector('[data-tool-gutter]')),
    // Owner decision 2026-10-22: the tools column and the header float over the surface and take no pointer themselves.
    gutterPointer: document.querySelector('[data-tool-gutter]') ? getComputedStyle(document.querySelector('[data-tool-gutter]')).pointerEvents : null,
    header: box(document.querySelector('[data-canvas-header]')),
    frame: box(document.querySelector('[aria-label="Lesson canvas"]')),
    toolbar: box(document.querySelector('[role="toolbar"][aria-label="Canvas tools"]')),
    // UI-19: one minimap on the page, the bottom strip's; none in the tools' gutter.
    minimaps: document.querySelectorAll('[aria-label="Canvas overview"]').length,
    gutterMinimap: !!document.querySelector('[data-tool-gutter] [aria-label="Canvas overview"]'),
    minimap: (() => { const r = document.querySelector('[data-canvas-minimap] [aria-label="Canvas overview"]')?.getBoundingClientRect(); return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null; })(),
    navigator: box(document.querySelector('[data-dive-navigator]')),
    composer: box(document.querySelector('[data-chat-pane] [data-chat-composer]')),
    pane: box(document.querySelector('[data-chat-pane]')),
    hooks: box(document.querySelector('[data-hooks-slot] section[data-next-steps]')),
    home: box(document.querySelector('[data-learn-home]')),
    zoom: document.querySelector('[title="Reset zoom"]')?.textContent?.trim(),
    zoomRow: box(document.querySelector('[data-zoom]')),
    strip: box(document.querySelector('[data-canvas-bottom]')),
    stack: box(document.querySelector('[data-zoom-stack]')),
    minimapFrame: box(document.querySelector('[data-canvas-minimap] > div')),
  };
});
// Owner brief 2026-10-16 item 8 (aligned-minimap mockup): the minimap frame and the zoom row are one group, one outer width -
// both edges aligned - with an 8px gap, at any zoom label.
const aligned = (g, where) => {
  const m = g.minimapFrame, z = g.zoomRow;
  if (!m || !z) return fail(`${where}: no minimap frame or zoom row`);
  const gap = z.y - m.bottom;
  if (Math.abs(m.x - z.x) > 1 || Math.abs(m.right - z.right) > 1 || Math.abs(gap - 8) > 1.5) fail(`${where}: the minimap ${JSON.stringify(round(m))} and the zoom row ${JSON.stringify(round(z))} (zoom ${g.zoom}) are not one aligned group: left ${Math.round(m.x - z.x)}, right ${Math.round(m.right - z.right)}, gap ${Math.round(gap)}`);
  else console.log(`${where}: minimap and zoom aligned, ${Math.round(m.w)}px wide, gap ${Math.round(gap)}px, zoom ${g.zoom}`);
};
const utilities = '[role="toolbar"],[data-tool-gutter],[data-dive-gutter],[data-dive-navigator],[data-canvas-minimap]';
// The floating controls' own rectangles (owner decision 2026-10-22): they may stand over content, so a probe inside one is
// not a probe; everywhere else the content must answer.
const CONTROLS = '[role="toolbar"][aria-label="Canvas tools"],[data-dive-navigator],[data-canvas-header] > *';
const controlRects = page => page.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height).map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom })), CONTROLS);
const inside = (rects, x, y, pad = 2) => rects.some(r => x >= r.x - pad && x <= r.right + pad && y >= r.y - pad && y <= r.bottom + pad);
// The tools: a vertical column at the canvas's left edge, below the floating header, the column itself pointer-transparent.
const toolsFloat = (g, where) => {
  if (!g.toolbar || !g.gutter) return fail(`${where}: no tools column`);
  if (!(g.toolbar.x - g.surface.x <= 12 && g.toolbar.x >= g.surface.x - 0.5)) fail(`${where}: the tools ${JSON.stringify(round(g.toolbar))} are not at the canvas's left edge ${JSON.stringify(round(g.surface))}`);
  if (!(g.toolbar.h > g.toolbar.w)) fail(`${where}: the tools ${JSON.stringify(round(g.toolbar))} are not a vertical column`);
  if (g.header && !(g.toolbar.y >= g.header.bottom - 0.5 && g.gutter.y >= g.header.bottom - 0.5)) fail(`${where}: the tools column ${JSON.stringify(round(g.gutter))} starts above the header's bottom ${Math.round(g.header.bottom)}`);
  if (g.gutterPointer !== 'none') fail(`${where}: the tools column takes the pointer (${g.gutterPointer}): an invisible band beside the toolbar`);
};
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
    // Wheel over bare canvas: a graph card zooms its own graph and never pans the canvas (repo-graph Release 2), so the
    // point keeps off the card being pushed.
    // Clear of the floating toolbar (owner decision 2026-10-22): a wheel over the toolbar is the toolbar's.
    const x = Math.max(g.surface.x, g.toolbar?.right ?? g.surface.x) + 40, mid = g.surface.y + g.surface.h / 2;
    const onCard = x >= box.x && x <= box.x + box.width && mid >= box.y && mid <= box.y + box.height;
    const y = !onCard ? mid : box.y - 20 > g.surface.y + 10 ? box.y - 20 : Math.min(box.y + box.height + 20, g.surface.y + g.surface.h - 10);
    await page.mouse.move(x, y);
    await page.mouse.wheel(dx, 0);
    await page.waitForTimeout(80);
  }
}
// Probe points along the surface's right edge, level with the card: the card must be on top.
// `title`: text the card shows, or { id } for a card known by its block id (a restricted repository card shows no title).
async function probeEdge(page, card, title, label, side = 'right') {
  const g = await geometry(page), box = await card.boundingBox(), controls = await controlRects(page);
  let probes = 0, onCard = 0;
  const xs = side === 'right' ? [g.surface.right - 2, g.surface.right - 30, g.surface.right - 60] : [g.surface.x + 2, g.surface.x + 30, g.surface.x + 60];
  for (const x of xs) {
    for (const f of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      // Above the floating strip: under it is reached by panning, not a card the probe must find on top.
      const y = Math.max(g.surface.y + 4, Math.min(Math.min(g.surface.bottom, g.strip?.y ?? Infinity) - 4, box.y + box.height * f));
      // Owner decision 2026-10-22: the canvas runs under the floating controls; a point on a control's own box is the control's.
      if (inside(controls, x, y)) continue;
      probes += 1;
      const hit = await page.evaluate(([px, py, t, u]) => {
        const el = document.elementFromPoint(px, py), block = el?.closest('[data-block-id]');
        return { card: t?.id ? block?.dataset.blockId === t.id : !!block?.textContent?.includes(t), utility: !!el?.closest(u) };
      }, [x, y, title, utilities]);
      if (hit.utility) fail(`${label}: a canvas utility is on top at (${Math.round(x)}, ${Math.round(y)})`);
      if (hit.card) onCard += 1;
    }
  }
  if (probes < 5 || onCard < probes * 0.8) fail(`${label}: only ${onCard}/${probes} edge probes landed on the card`);
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
  // The shell (owner decision 2026-10-22, superseding the gutter): the surface fills the workspace from its left edge and the
  // header's top; the tools float at its left edge below the header with the navigator at the top of their column (UI-17:
  // no column of its own), the Chat pane right of the canvas, the minimap above the zoom row, on the canvas.
  if (!g.frame || !(Math.abs(g.surface.x - g.frame.x) <= 0.5) || !g.header || !(g.surface.y <= g.header.y + 0.5)) fail(`desktop: the canvas ${JSON.stringify(round(g.surface))} does not fill the workspace ${JSON.stringify(round(g.frame))} under the header ${JSON.stringify(round(g.header))}`);
  toolsFloat(g, 'desktop');
  if (g.navigator && !(g.navigator.x >= g.gutter.x - 0.5 && g.navigator.right <= g.gutter.right + 0.5 && g.navigator.y >= g.header.bottom - 0.5 && g.navigator.y < g.gutter.y + 120)) fail(`desktop: the navigator ${JSON.stringify(round(g.navigator))} is not at the top of the tools column ${JSON.stringify(round(g.gutter))}, below the header`);
  if (!g.pane || g.pane.x < g.surface.right - 0.5 || (g.navigator && g.pane.x < g.navigator.right - 0.5)) fail(`desktop: the Chat pane ${JSON.stringify(round(g.pane))} is not right of the canvas and the navigator`);
  if (!g.minimap) fail('desktop: no minimap in the lower left');
  else {
    if (!(g.surface.bottom >= g.strip.bottom - 2)) fail(`desktop: the canvas ${JSON.stringify(round(g.surface))} stops above the strip ${JSON.stringify(round(g.strip))}`);
    if (!disjoint(g.minimap, g.pane) || g.minimap.right > g.surface.right) fail('desktop: the minimap is not on the canvas, clear of the Chat pane');
    if (!(g.minimap.bottom <= g.zoomRow.y + 0.5) || Math.abs(g.minimap.x - g.zoomRow.x) > 1.5 || g.zoomRow.y - g.minimap.bottom > 12) fail(`desktop: the minimap ${JSON.stringify(round(g.minimap))} is not directly above the zoom row ${JSON.stringify(round(g.zoomRow))} on its left edge`);
    if (g.minimap.w < 150) fail(`desktop: the minimap is only ${Math.round(g.minimap.w)}px wide`);
    aligned(g, 'desktop');
  }
  if (g.gutterMinimap || g.minimaps !== 1) fail(`desktop: ${g.minimaps} minimap(s)${g.gutterMinimap ? ', one in the tools\' gutter' : ''}; the one minimap is the bottom strip's (UI-19)`);
  if (await page.getByRole('button', { name: /^(Show|Hide) overview$/ }).count()) fail('desktop: a separate Show/Hide overview button is back; View > Minimap owns the minimap (UI-19)');
  {
    const at = await page.evaluate(([gx, gy]) => {
      const r = document.querySelector('[title="Reset zoom"]').getBoundingClientRect();
      return { gap: !!document.elementFromPoint(gx, gy)?.closest('[data-canvas-surface]'), reset: !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[title="Reset zoom"]') };
    }, [(g.stack.right + Math.min(g.surface.right, g.hooks?.x ?? Infinity)) / 2, g.zoomRow.y + g.zoomRow.h / 2]);
    if (!at.gap) fail('desktop: the empty strip between the zoom stack and the hooks does not reach the canvas');
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

  // Owner decision 2026-10-22: the tools column is no band. Its empty part is the canvas itself (never the column), and a
  // wheel there pans the canvas.
  const empty = await page.evaluate(() => {
    const gutter = document.querySelector('[data-tool-gutter]'), r = gutter.getBoundingClientRect();
    let band = null, spot = null;
    for (let y = r.top + 8; y < r.bottom - 8; y += 8) for (let x = r.left + 4; x < r.right - 4; x += 8) {
      const el = document.elementFromPoint(x, y);
      if (el === gutter) band = band || { x, y };
      if (!spot && el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[role="toolbar"],[data-gutter-top] > *')) spot = { x, y };
    }
    return { band, spot };
  });
  if (empty.band) fail(`desktop: the tools column itself takes the pointer at ${JSON.stringify(round(empty.band))}: an invisible band`);
  if (!empty.spot) fail('desktop: no empty canvas inside the tools column found to wheel over');
  else {
    const before = (await card.boundingBox()).y;
    await page.mouse.move(empty.spot.x, empty.spot.y);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(200);
    const moved = before - (await card.boundingBox()).y;
    if (Math.abs(moved - 240) > 4) fail(`desktop: wheel over the tools column's empty part moved the canvas ${Math.round(moved)}px, expected 240`);
    results.gutterWheel = { at: round(empty.spot), moved: Math.round(moved) };
  }
  // Owner decision 2026-10-22: nothing is clipped at the old gutter or header boundary. The card, panned so its top left runs
  // under the header row and the tools column, is drawn there and answers the pointer beside the controls.
  {
    g = await geometry(page); box = await card.boundingBox();
    // A wheel over bare canvas (a card's scrolling body keeps its own wheel).
    const bare = await page.evaluate(() => {
      const r = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
      for (let y = r.top + 60; y < r.bottom - 60; y += 20) for (let x = r.left + 100; x < r.right - 20; x += 20) {
        const el = document.elementFromPoint(x, y);
        if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[role="toolbar"],[data-canvas-bottom] > * > *,[data-dive-navigator]')) return { x, y };
      }
      return null;
    });
    if (!bare) fail('desktop: no bare canvas to wheel over');
    else await page.mouse.move(bare.x, bare.y);
    await page.mouse.wheel(Math.round(box.x - (g.surface.x - 40)), Math.round(box.y - (g.surface.y + 8)));
    await page.waitForTimeout(250);
    g = await geometry(page); box = await card.boundingBox();
    const controls = await controlRects(page);
    const bands = { header: [], tools: [] };
    for (let x = g.surface.x + 4; x < Math.min(box.x + box.width, g.surface.right) - 4; x += 24) bands.header.push([x, g.header.y + Math.min(12, g.header.h / 2)], [x, g.header.bottom - 4]);
    for (let y = g.header.bottom + 4; y < Math.min(box.y + box.height, g.strip?.y ?? Infinity) - 4; y += 24) bands.tools.push([g.surface.x + 4, y], [g.gutter.x + g.gutter.w / 2, y], [g.gutter.right - 4, y]);
    for (const [name, points] of Object.entries(bands)) {
      let probed = 0, drawn = 0;
      const missed = [];
      for (const [x, y] of points) {
        if (x < box.x + 2 || x > box.x + box.width - 2 || y < box.y + 2 || y > box.y + box.height - 2 || inside(controls, x, y, 4)) continue;
        probed += 1;
        // The element that took the point is named, so a miss says what covers the card there.
        const hit = await page.evaluate(([px, py, t]) => { const el = document.elementFromPoint(px, py); return el?.closest('[data-block-id]')?.textContent?.includes(t) ? null : `${el?.tagName?.toLowerCase()}${[...(el?.attributes || [])].filter(a => a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label').map(a => `[${a.name}=${a.value}]`).join('')} in ${el?.closest('[data-gutter-top],[data-tool-gutter],[data-canvas-header],[data-canvas-bottom]')?.outerHTML?.slice(0, 60) ?? 'the page'}`; }, [x, y, widest.block.title]);
        if (hit) missed.push(`(${Math.round(x)},${Math.round(y)}) ${hit}`); else drawn += 1;
      }
      if (!probed || drawn < probed) fail(`desktop: under the ${name} ${name === 'header' ? 'row' : 'column'} only ${drawn}/${probed} points beside the controls reach the card ${JSON.stringify(round(box))}; not the card at ${missed.join('; ')}`);
      results[`${name}Band`] = { probed, drawn };
    }
    await page.screenshot({ path: `${OUT}/desktop-card-under-header-and-tools.png` });
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
    const under = await page.evaluate(chrome => [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => [el.getAttribute('data-block-id'), el.getBoundingClientRect()])
      .filter(([, r]) => r.width && chrome.some(c => c && r.right > c.x && c.right > r.x && r.bottom > c.y && c.bottom > r.y)).map(([id, r]) => `${id} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`), [fit.stack, fit.hooks]);
    // Owner decision 2026-10-22: the fit keeps clear of the floating toolbar, navigator and header controls' own rectangles.
    const top = await page.evaluate(([chrome]) => [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => [el.getAttribute('data-block-id'), el.getBoundingClientRect()])
      .filter(([, r]) => r.width && chrome.some(c => r.right > c.x && c.right > r.x && r.bottom > c.y && c.bottom > r.y)).map(([id, r]) => `${id} ${Math.round(r.x)},${Math.round(r.y)}`), [await controlRects(page)]);
    if (top.length) fail(`desktop: after zoom to fit, card(s) under the toolbar, navigator or header controls: ${top.join('; ')}`);
    const scale = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('[data-canvas-surface] div[style*="scale("]')?.style.transform || '')?.[1] || 1));
    console.log(`desktop: zoom to fit at ${Math.round(scale * 100)}%, stack ${JSON.stringify(round(fit.stack))}, hooks ${JSON.stringify(round(fit.hooks))}`);
    // The fit's zoom floor is 20% (frame in AdaptiveCanvas.jsx): a board taller than the room above the chrome even there
    // (the depth ladder) starts at the room's top and pans out from under the chrome.
    const first = await page.evaluate(() => Math.min(...[...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => el.getBoundingClientRect().top)));
    if (scale > 0.2001 && under.length) fail(`desktop: after zoom to fit, card(s) under the minimap and zoom or the hooks: ${under.join('; ')}`);
    if (scale <= 0.2001 && first > (fit.header?.bottom ?? fit.surface.y) + 49) fail(`desktop: at the 20% floor the fit does not start at the top, below the header (${Math.round(first)})`);
    aligned(fit, 'desktop, after zoom to fit');
    // A longer zoom label: zoom in to 3 digits; the group keeps one width.
    for (let i = 0; i < 12 && Number.parseInt((await geometry(page)).zoom, 10) < 100; i++) await page.locator('[data-zoom] [title="Zoom in"]').click();
    aligned(await geometry(page), 'desktop, zoomed in');
  }
  results.desktop = { card: widest.block.title, cardWidth: Math.round(widest.width), zoom: g.zoom, right, left: opened, penArmed: armed === 'true' };
  console.log(`desktop: "${widest.block.title}" (${Math.round(widest.width)}px) pushed past both edges; tools floating at the left edge with the navigator above them, minimap lower left above the zoom row (right ${right.onCard}/${right.probes}, left ${opened.onCard}/${opened.probes} edge probes on the card; header band ${results.headerBand?.drawn}/${results.headerBand?.probed}, tools band ${results.toolsBand?.drawn}/${results.toolsBand?.probed}); tools-column wheel moved ${results.gutterWheel?.moved}px; pen arms; zoom ${g.zoom}`);
  await context.close();
}

// --- repository cards (repo-graph Release 2): a code card and a graph card, pushed past each edge, stay on top of the canvas
// edge and under no utility. LOCAL only: the canvas and its board are made here. The cards point at a repository this user
// did not import and that is not confirmed public, so the server sends them as restricted placeholders, place and kind only,
// no title (owner R3 decision, 2026-10-16, rel-a.md A3 item 2); they keep their full-size frames, which is what this check
// measures, so the probes know each card by its block id.
if (local) {
  const post = async (path, method, body) => (await fetch(`${base}${path}`, { method, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const repoCanvas = await post('/api/canvases', 'POST', { title: 'Toolbar check repository cards' });
  const repository = { app: 'repo-0badc0de-toolbar-probe', repo: 'acme/toolbar-probe', commit: 'c'.repeat(40) };
  const blocks = [
    { id: 'rc1', type: 'repo-code', dx: 0, dy: 0, title: 'toolbar_probe.py', language: 'python', source: { kind: 'repository', ...repository, path: 'toolbar_probe.py' } },
    { id: 'rg1', type: 'repo-graph', dx: 0, dy: 0, title: 'acme/toolbar-probe graph', repository, scope: 'whole', nodeIds: [], camera: null, w: 560, h: 520 },
  ];
  await post(`/api/learn/boards/${repoCanvas.name}/main`, 'PUT', { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks } });
  const context = await browser.newContext({ viewport: { width: 1720, height: 1100 } });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage();
  await page.goto(`${base}/apps/${repoCanvas.name}`);
  const canvas = page.locator('[aria-label="Lesson canvas"]');
  await canvas.waitFor({ timeout: 30000 });
  results.repositoryCards = {};
  for (const [kind, selector, title] of [['code', '[data-code-card]', { id: 'rc1' }], ['graph', '[data-graph-card]', { id: 'rg1' }]]) {
    const card = canvas.locator('[data-block-id]').filter({ has: page.locator(selector) }).first();
    if (!(await card.waitFor({ timeout: 20000 }).then(() => true, () => false))) { fail(`repository cards: no ${kind} card drawn`); continue; }
    await reveal(page, canvas, card);
    await pushRight(page, card, 120);
    let box = await card.boundingBox(), g = await geometry(page);
    if (!(box.x + box.width > g.surface.right + 60)) fail(`repository cards: the ${kind} card was not panned past the right edge (${JSON.stringify(round(box))})`);
    toolsFloat(g, `repository cards, beside the ${kind} card`);
    const right = await probeEdge(page, card, title, `repository ${kind} card, right edge`);
    await page.screenshot({ path: `${OUT}/repository-${kind}-card-right-edge.png` });
    await pushRight(page, card, 120, 'left');
    box = await card.boundingBox(); g = await geometry(page);
    if (!(box.x < g.surface.x - 60)) fail(`repository cards: the ${kind} card was not panned past the left edge (${JSON.stringify(round(box))})`);
    const left = await probeEdge(page, card, title, `repository ${kind} card, left edge`, 'left');
    await page.screenshot({ path: `${OUT}/repository-${kind}-card-left-edge.png` });
    if (g.zoom !== '100%') fail(`repository cards: zoom is ${g.zoom} after panning the ${kind} card, not 100%`);
    results.repositoryCards[kind] = { width: Math.round(box.width), right, left };
    console.log(`repository ${kind} card (${Math.round(box.width)}px): past both edges, on top at the canvas edge (right ${right.onCard}/${right.probes}, left ${left.onCard}/${left.probes}), zoom ${g.zoom}`);
  }
  await context.close();
}

// --- wide screen: the same shell ---
{
  const { context, page } = await open({ width: 2200, height: 1200 });
  const g = await geometry(page);
  if (!g.minimap || !(g.surface.bottom >= g.strip.bottom - 2) || g.minimap.right > g.surface.right || !disjoint(g.minimap, g.pane) || !(g.minimap.bottom <= g.zoomRow.y + 0.5)) fail('wide: the canvas stops above the strip, or no minimap in the lower left above the zoom row, clear of the Chat pane');
  if (!g.pane || g.pane.x < g.surface.right - 0.5) fail('wide: the Chat pane is not right of the canvas');
  aligned(g, 'wide');
  // Owner decision 2026-10-22: the tools and navigator float over the canvas's left edge, below the header.
  toolsFloat(g, 'wide');
  if (g.navigator && !(g.navigator.x >= g.gutter.x - 0.5 && g.navigator.right <= g.gutter.right + 0.5 && g.navigator.y >= g.header.bottom - 0.5)) fail(`wide: the navigator ${JSON.stringify(round(g.navigator))} is not in the tools column below the header`);
  results.wide = { surface: round(g.surface), minimap: round(g.minimap), toolbar: round(g.toolbar), navigator: round(g.navigator) };
  console.log('wide: tools floating at the left edge with the navigator above them, minimap lower left above the zoom row');
  await context.close();
}

// --- phone ---
{
  const { context, page, canvas } = await open({ width: 390, height: 844 });
  let g = await geometry(page);
  if (g.surface.h < 0.45 * 844) fail(`phone: the canvas is only ${Math.round(g.surface.h)}px tall`);
  // UI-19: the same vertical tools column as on desktop, never a strip above or below it; since the owner decision of
  // 2026-10-22 it floats over the canvas's left edge, below the header, and the canvas starts at the page's left edge.
  toolsFloat(g, 'phone');
  if (!g.frame || Math.abs(g.surface.x - g.frame.x) > 0.5) fail(`phone: the canvas ${JSON.stringify(round(g.surface))} does not start at the workspace's left edge ${JSON.stringify(round(g.frame))}`);
  if (!(g.surface.bottom >= g.strip.bottom - 2)) fail(`phone: the canvas ${JSON.stringify(round(g.surface))} stops above the strip ${JSON.stringify(round(g.strip))}`);
  if (g.toolbar.x < 0 || g.toolbar.right > 390 || g.toolbar.y < 0 || g.toolbar.bottom > 844) fail('phone: the tools column runs off screen');
  if (await page.getByRole('button', { name: /^(Show|Hide) overview$/ }).count()) fail('phone: a separate Show/Hide overview button is back; View > Minimap owns the minimap (UI-19)');
  // The one minimap: lower left of the canvas, directly above the zoom row, clear of the tools column.
  if (!g.minimap || g.gutterMinimap || g.minimaps !== 1) fail(`phone: not one minimap in the bottom strip (${g.minimaps}${g.gutterMinimap ? ', one in the tools\' gutter' : ''})`);
  else {
    if (!(g.minimap.bottom <= g.zoomRow.y + 0.5) || Math.abs(g.minimap.x - g.zoomRow.x) > 1.5 || g.zoomRow.y - g.minimap.bottom > 12) fail(`phone: the minimap ${JSON.stringify(round(g.minimap))} is not directly above the zoom row ${JSON.stringify(round(g.zoomRow))} on its left edge`);
    if (!disjoint(g.minimap, g.toolbar)) fail(`phone: the minimap ${JSON.stringify(round(g.minimap))} overlaps the tools ${JSON.stringify(round(g.toolbar))}`);
    if (g.minimap.x < 0 || g.minimap.right > 390) fail('phone: the minimap runs off screen');
    aligned(g, 'phone');
  }
  // The zoom row floats over the canvas now; the empty strip right of it passes the pointer to the canvas (measured before
  // the scroll to the Chat pane below).
  const through = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-canvas-surface]'), [(g.zoomRow.right + g.surface.right) / 2, g.zoomRow.y + g.zoomRow.h / 2]);
  // The zoom controls never sit on the composer, now the Chat pane's (the panel's Chat tab, docs/features/hide-right-panel.md):
  // the field's centre reaches the field.
  const chatTab = page.locator('[data-panel-tab="chat"]').first();
  if (await chatTab.count() && await chatTab.getAttribute('aria-selected') !== 'true') await chatTab.click();
  const FIELD = '[data-chat-pane] [data-chat-composer] textarea';
  await page.locator(FIELD).scrollIntoViewIfNeeded();
  const dock = await page.evaluate(FIELD => {
    const box = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const input = document.querySelector(FIELD), r = input.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { zoom: box(document.querySelector('[aria-label="Zoom controls"]')), minimap: box(document.querySelector('[data-canvas-minimap] [aria-label="Canvas overview"]')), form: box(input.closest('form')), surface: box(document.querySelector('[data-canvas-surface]')), onInput: !!hit && input.contains(hit), hit: hit?.closest('[aria-label]')?.getAttribute('aria-label') || hit?.tagName };
  }, FIELD);
  if (!dock.zoom || !dock.form) fail('phone: the zoom controls or the composer are missing');
  if (!disjoint(dock.zoom, dock.form)) fail(`phone: the zoom controls ${JSON.stringify(round(dock.zoom))} overlap the composer ${JSON.stringify(round(dock.form))}`);
  if (!dock.minimap || !disjoint(dock.minimap, dock.form)) fail(`phone: the minimap ${JSON.stringify(round(dock.minimap))} is missing or overlaps the composer ${JSON.stringify(round(dock.form))}`);
  if (!dock.onInput) fail(`phone: a tap on the composer input lands on ${dock.hit}, not the input`);
  if (!through) fail('phone: the empty strip beside the zoom row does not reach the canvas');
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const armed = await page.getByRole('button', { name: 'Pen', exact: true }).getAttribute('aria-pressed');
  if (armed !== 'true') fail('phone: the pen tool did not arm');
  await page.getByRole('button', { name: 'Select and move', exact: true }).click();
  // The column scrolls (vertically, capped at the last whole control) when it does not fit; either way its last control,
  // Style, comes wholly into view inside the column and the screen.
  const strip = page.locator('[role="toolbar"][aria-label="Canvas tools"]');
  const scrollable = await strip.evaluate(el => el.scrollHeight > el.clientHeight);
  await strip.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const styleBox = await strip.locator('[aria-label="Style"]').boundingBox(), column = await strip.boundingBox();
  if (!styleBox || !column || styleBox.y < column.y - 0.5 || styleBox.y + styleBox.height > column.y + column.height + 0.5 || styleBox.y + styleBox.height > 844) fail('phone: the tools column does not bring its last control into view');
  await strip.evaluate(el => { el.scrollTop = 0; });
  await reveal(page, canvas, cardLocator(canvas, cards[0]));
  g = await geometry(page);
  await page.screenshot({ path: `${OUT}/phone-canvas-tools-column.png` });
  const workingHeight = Math.round(g.surface.h);
  // The right panel starts closed (Learn, 2026-09-28); opened, it stacks under the canvas on a phone.
  const showPanel = page.getByRole('button', { name: 'Show the right panel' }).first();
  if (await showPanel.count()) { await showPanel.click(); await page.waitForTimeout(500); }
  // The Table of contents tab's block, heading and outline (a8a674ad, docs/features/panel-header.md, owner 2026-10-07): the
  // first list in the panel is now Find's hidden results, and a board with no headings has an empty outline. Chat is the
  // panel's default tab now (owner brief 2026-10-13 section 3): the contents are one tab away, in the panel header.
  await page.locator('aside[aria-label="Learn agent chat"] [data-panel-tab="toc"]').click();
  const toc = page.locator('aside[aria-label="Learn agent chat"] [data-toc]');
  await toc.scrollIntoViewIfNeeded();
  const tocVisible = await toc.isVisible();
  if (!tocVisible) fail('phone: the table of contents cannot be scrolled into view');
  results.phone = { surface: round((await geometry(page)).surface), workingHeight, toolbar: round(g.toolbar), minimap: round(g.minimap), zoomControls: round(dock.zoom), composer: round(dock.form), composerTappable: dock.onInput, penArmed: armed === 'true', toolbarScrolls: scrollable, tocReachable: tocVisible };
  console.log(`phone: canvas ${workingHeight}px tall, tools a vertical column floating at its left edge (${scrollable ? 'scrolling' : 'fits'}), no overview toggle, one minimap above the zoom row, zoom controls and minimap clear of the composer, table of contents reachable`);
  await context.close();
}

await browser.close();
results.failures = failures;
writeFileSync(`${OUT}/toolbar-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${failures.length} failure(s) -> ${OUT}`);
if (failures.length) process.exit(1);
