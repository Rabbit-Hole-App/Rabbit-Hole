// The Learn canvas shell at every Rabbit Hole depth, against the LOCAL stack only (see dive-check.mjs):
// Home top left, tools left, navigator at the top of the tools column (UI-17), no app rail - since the owner decision of 2026-10-22
// all of them float over a drawing surface that fills the workspace (no gutter, no header band) - the one main composer in the
// Chat pane right of the canvas and the navigator (owner brief 2026-10-13 sections 2 and 4: no canvas dock), and the minimap
// lower left of the canvas, clear of the Chat pane and its composer (the floating bottom strip, owner 2026-10-08, as
// canvas-toolbar-check asserts it) - at the
// root, a child and a grandchild, and still usable after zooming and panning.
// Usage: node e2e/canvas-shell-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const OUT = process.argv[2] || 'canvas-shell-shots';
mkdirSync(OUT, { recursive: true });
// Sessions are minted on the control plane's own origin (the app origin's P0-B barrier refuses /test/session):
// the standalone local control plane, SMALL_CP (default http://127.0.0.1:8790).
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention' }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const settle = async () => { try { await page.waitForSelector('[data-tool-gutter]', { timeout: 20000 }); } catch (error) { await page.screenshot({ path: `${OUT}/fail.png` }); console.log('at', page.url()); throw error; } await page.waitForTimeout(1500); };
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const slash = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(150); await composer().press('Enter'); await page.waitForTimeout(800); };
const persisted = () => page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}$/.test(location.pathname) && !location.search.includes('hole='), null, { timeout: 15000 });

async function checkShell(label) {
  const g = await page.evaluate(() => {
    const box = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null; };
    return {
      surface: box('[data-canvas-surface]'), tools: box('[data-tool-gutter]'), toolbar: box('[role="toolbar"][aria-label="Canvas tools"]'), header: box('[data-canvas-header]'),
      frame: box('[aria-label="Lesson canvas"]'), toolsPointer: getComputedStyle(document.querySelector('[data-tool-gutter]')).pointerEvents,
      home: box('[data-learn-home]'), nav: box('[data-dive-navigator]'), navGutter: box('[data-dive-gutter]'),
      minimap: box('[aria-label="Canvas overview"]'), composer: box('[data-chat-pane] [data-chat-composer]'), pane: box('[data-chat-pane]'), panel: box('aside[aria-label="Learn agent chat"]'), rail: box('[data-shell-sidebar]'),
    };
  });
  for (const key of ['surface', 'tools', 'toolbar', 'header', 'frame', 'home', 'nav', 'minimap', 'composer', 'pane', 'panel']) assert.ok(g[key], `${label}: ${key} is on screen`);
  assert.equal(await page.locator('[data-canvas-composer]').count(), 0, `${label}: one main composer, in the Chat pane - no canvas dock`);
  const apart = (a, b) => a.right <= b.x + 0.5 || b.right <= a.x + 0.5 || a.bottom <= b.y + 0.5 || b.bottom <= a.y + 0.5;
  assert.equal(g.rail, null, `${label}: no app rail`);
  // Owner decision 2026-10-22 (supersedes the reserved gutter): the drawing surface fills the workspace - from the page's left
  // edge and from the top of the header, which floats over it - and the tools column floats over its left edge, below the
  // header, taking no pointer itself (only its controls do).
  assert.ok(Math.abs(g.surface.x - g.frame.x) <= 0.5 && g.surface.x <= 0.5, `${label}: the canvas starts at the workspace's left edge: ${JSON.stringify({ surface: g.surface, frame: g.frame })}`);
  assert.ok(g.surface.y <= g.header.y + 0.5, `${label}: the canvas runs up under the floating header: ${JSON.stringify({ surface: g.surface, header: g.header })}`);
  assert.ok(g.toolbar.x - g.surface.x <= 12 && g.toolbar.bottom - g.toolbar.y > g.toolbar.right - g.toolbar.x, `${label}: the tools a vertical column at the canvas's left edge: ${JSON.stringify({ toolbar: g.toolbar, surface: g.surface })}`);
  assert.ok(g.tools.y >= g.header.bottom - 0.5 && g.toolbar.y >= g.header.bottom - 0.5, `${label}: the tools column starts below the header: ${JSON.stringify({ tools: g.tools, header: g.header })}`);
  assert.equal(g.toolsPointer, 'none', `${label}: the tools column takes no pointer of its own (no invisible band)`);
  assert.ok(g.home.x < 24 && g.home.y < 24, `${label}: Home in the top-left corner`);
  assert.equal(await page.getByRole('button', { name: 'Open sidebar' }).count(), 0, `${label}: no Open sidebar button in Learn`);
  // UI-17 (owner, 2026-10-21): the navigator sits at the top of the tools column, never in a column between the canvas and the
  // panel; since the owner decision of 2026-10-22 that column floats over the canvas, below the header.
  assert.equal(g.navGutter, null, `${label}: no navigator column of its own`);
  assert.ok(g.nav.x >= g.tools.x - 0.5 && g.nav.right <= g.tools.right + 0.5 && g.nav.y >= g.header.bottom - 0.5 && g.nav.y < g.tools.y + 120, `${label}: navigator at the top of the tools column, below the header: ${JSON.stringify({ nav: g.nav, tools: g.tools, header: g.header })}`);
  // Measured at the panel's edge: the Chat pane sits inside the panel's border and px-5 padding (21 px in). Owner decision
  // 2026-10-22: the canvas reaches the panel boundary (no 4 px strip).
  assert.ok(g.panel.x >= g.surface.right - 0.5 && g.panel.x - g.surface.right <= 1 && g.pane.x >= g.panel.x, `${label}: the Chat panel right of the canvas, which runs to it: ${JSON.stringify({ panel: g.panel, pane: g.pane, surface: g.surface })}`);
  assert.ok(g.minimap.right <= g.pane.x + 0.5 && g.minimap.x < (g.surface.x + g.surface.right) / 2 && g.minimap.y > (g.surface.y + g.surface.bottom) / 2, `${label}: minimap lower left of the canvas, left of the Chat pane: ${JSON.stringify({ minimap: g.minimap, surface: g.surface, pane: g.pane })}`);
  for (const [a, b] of [['home', 'toolbar'], ['home', 'nav'], ['nav', 'toolbar'], ['nav', 'minimap'], ['minimap', 'composer'], ['toolbar', 'composer'], ['nav', 'composer']]) assert.ok(apart(g[a], g[b]), `${label}: ${a} and ${b} do not overlap`);
  return g;
}

// Zoomed and panned, every control still answers; Shift 0 brings 100% back.
async function stillUsable(label) {
  await page.getByTitle('Zoom in').click(); await page.getByTitle('Zoom in').click();
  const s = await page.locator('[data-canvas-surface]').boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await page.mouse.wheel(300, 600); await page.waitForTimeout(300);
  await checkShell(`${label} (zoomed, panned)`);
  // The same page point as before the owner decision of 2026-10-22 (the surface now starts 84 px further left, under the tools column).
  await page.mouse.click(s.x + 104, s.y + s.height - 20); await page.keyboard.press('Shift+Digit0'); await page.waitForTimeout(300);
  assert.equal((await page.getByTitle('Reset zoom').innerText()).trim(), '100%', `${label}: Shift 0 resets the view`);
}

await page.goto(`${BASE}/apps/${root.name}?board=nanogpt-deep-dive`); await settle();
await checkShell('root'); await stillUsable('root');
await page.screenshot({ path: `${OUT}/shell-1-root.png` });
// The dock's hide-composer icon (owner, 2026-10-13) went with the dock: the Chat pane's composer is never hidden.

await slash('/dive explain softmax'); await page.waitForFunction(() => location.search.includes('hole=')); await settle();
await checkShell('pending child');
await slash('/whiteboard Softmax sketch'); await persisted(); await page.waitForTimeout(600);
await checkShell('child'); await stillUsable('child');
await page.screenshot({ path: `${OUT}/shell-2-child.png` });

const child = new URL(page.url()).pathname;
await slash('/dive numerical stability'); await page.waitForFunction(() => location.search.includes('hole=')); await settle();
await slash('/whiteboard Stability sketch'); await persisted(); await page.waitForTimeout(600);
await checkShell('grandchild'); await stillUsable('grandchild');
assert.equal(await page.locator('[data-dive-navigator] [data-dive-level]').count(), 3, 'root, child, grandchild in the navigator');
await page.screenshot({ path: `${OUT}/shell-3-grandchild.png` });

// Ctrl+K here, where the canvas has the inline AI editor, is Quick Edit wherever the canvas has the focus (owner brief 2026-10-13): a
// selected card opens that editor, and with nothing selected the key still stays on the canvas - it never opens Search (which moved
// to Ctrl/Cmd+Shift+F, shortcut-owner.js) and never dives. Dive.jsx still dives on Ctrl+K on a canvas without the inline editor.
const search = page.getByPlaceholder('Describe what you are looking for');
await page.keyboard.press('Escape'); await page.mouse.click(700, 500); await page.keyboard.press('Control+k'); await page.waitForTimeout(500);
assert.equal(new URL(page.url()).searchParams.get('hole'), null, 'Ctrl+K with no card does not dive');
assert.equal(await search.count(), 0, 'Ctrl+K with nothing selected does not open Search');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+Shift+F');
await search.waitFor({ timeout: 5000 });
assert.equal(await page.locator('[data-inline-ai]').count(), 0, 'Ctrl+Shift+F opens Search only, never the editor');
await page.keyboard.press('Escape');
assert.equal(await search.count(), 0, 'Escape closes Search');

// The corner is Back (2b0d32ed, owner 2026-10-04): from the grandchild to the child hole, then to the root.
await page.locator('[data-learn-home]').click();
await page.waitForFunction(path => location.pathname === path, child, { timeout: 15000 });
await page.locator('[data-learn-home]').click();
await page.waitForFunction(path => location.pathname === path, `/apps/${root.name}`, { timeout: 15000 });

// The clickable Search keeps working where the app has it (Home's sidebar), and Ctrl+K opens nothing there any more.
await page.goto(`${BASE}/apps`); await page.getByRole('button', { name: 'Search', exact: true }).first().waitFor({ timeout: 30000 });
await page.keyboard.press('Control+k'); await page.waitForTimeout(400);
assert.equal(await search.count(), 0, 'Ctrl+K is no longer Search on Home');
await page.getByRole('button', { name: 'Search', exact: true }).first().click();
await search.waitFor({ timeout: 5000 });
await page.keyboard.press('Escape');
await page.keyboard.press('Control+Shift+F');
await search.waitFor({ timeout: 5000 });

await browser.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
console.log('canvas shell ok at root, child and grandchild;', `${BASE}/apps/${root.name}?board=nanogpt-deep-dive`);
