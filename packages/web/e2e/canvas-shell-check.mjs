// The Learn canvas shell at every Rabbit Hole depth, against the LOCAL stack only (see dive-check.mjs):
// Home top left, tools left, navigator top right, minimap lower right, composer at the
// bottom, no app rail - none of them over the canvas, the minimap clear of the composer - at the
// root, a child and a grandchild, and still usable after zooming and panning.
// Usage: node e2e/canvas-shell-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:8788';
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
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const slash = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(150); await composer().press('Enter'); await page.waitForTimeout(800); };
const persisted = () => page.waitForFunction(() => /^\/apps\/canvas-[a-f0-9]{8}$/.test(location.pathname) && !location.search.includes('hole='), null, { timeout: 15000 });

async function checkShell(label) {
  const g = await page.evaluate(() => {
    const box = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null; };
    return {
      surface: box('[data-canvas-surface]'), tools: box('[data-tool-gutter]'), toolbar: box('[role="toolbar"][aria-label="Canvas tools"]'),
      home: box('[data-learn-home]'), nav: box('[data-dive-navigator]'), navGutter: box('[data-dive-gutter]'),
      minimap: box('[aria-label="Canvas overview"]'), composer: box('[data-canvas-composer]'), rail: box('[data-shell-sidebar]'),
    };
  });
  for (const key of ['surface', 'toolbar', 'home', 'nav', 'minimap', 'composer']) assert.ok(g[key], `${label}: ${key} is on screen`);
  const apart = (a, b) => a.right <= b.x + 0.5 || b.right <= a.x + 0.5 || a.bottom <= b.y + 0.5 || b.bottom <= a.y + 0.5;
  assert.equal(g.rail, null, `${label}: no app rail`);
  assert.ok(g.toolbar.right <= g.surface.x + 0.5, `${label}: tools left of the canvas, never over cards`);
  assert.ok(g.home.x < 24 && g.home.y < 24 && g.home.right <= g.surface.x + 0.5, `${label}: Home in the top-left corner, off the canvas`);
  assert.equal(await page.getByRole('button', { name: 'Open sidebar' }).count(), 0, `${label}: no Open sidebar button in Learn`);
  assert.ok(g.nav.x >= g.surface.right - 0.5 && g.nav.y < g.surface.y + 120, `${label}: navigator top right, beside the canvas`);
  assert.ok(g.minimap.y >= g.surface.bottom - 0.5 && g.minimap.x >= g.composer.right, `${label}: minimap lower right, below the canvas and clear of the composer`);
  for (const [a, b] of [['home', 'toolbar'], ['nav', 'minimap'], ['minimap', 'composer'], ['toolbar', 'composer']]) assert.ok(apart(g[a], g[b]), `${label}: ${a} and ${b} do not overlap`);
  return g;
}

// Zoomed and panned, every control still answers; Shift 0 brings 100% back.
async function stillUsable(label) {
  await page.getByTitle('Zoom in').click(); await page.getByTitle('Zoom in').click();
  const s = await page.locator('[data-canvas-surface]').boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await page.mouse.wheel(300, 600); await page.waitForTimeout(300);
  await checkShell(`${label} (zoomed, panned)`);
  await page.mouse.click(s.x + 20, s.y + s.height - 20); await page.keyboard.press('Shift+Digit0'); await page.waitForTimeout(300);
  assert.equal((await page.getByTitle('Reset zoom').innerText()).trim(), '100%', `${label}: Shift 0 resets the view`);
}

await page.goto(`${BASE}/apps/${root.name}?board=nanogpt-deep-dive`); await settle();
await checkShell('root'); await stillUsable('root');
await page.screenshot({ path: `${OUT}/shell-1-root.png` });

await slash('/dive explain softmax'); await page.waitForFunction(() => location.search.includes('hole=')); await settle();
await checkShell('pending child');
await slash('/whiteboard Softmax sketch'); await persisted(); await page.waitForTimeout(600);
await checkShell('child'); await stillUsable('child');
await page.screenshot({ path: `${OUT}/shell-2-child.png` });

await slash('/dive numerical stability'); await page.waitForFunction(() => location.search.includes('hole=')); await settle();
await slash('/whiteboard Stability sketch'); await persisted(); await page.waitForTimeout(600);
await checkShell('grandchild'); await stillUsable('grandchild');
assert.equal(await page.locator('[data-dive-navigator] [data-dive-level]').count(), 3, 'root, child, grandchild in the navigator');
await page.screenshot({ path: `${OUT}/shell-3-grandchild.png` });

// Ctrl+K stays split: a selected card dives, none opens Search.
await page.keyboard.press('Escape'); await page.mouse.click(700, 500); await page.keyboard.press('Control+k'); await page.waitForTimeout(500);
assert.equal(new URL(page.url()).searchParams.get('hole'), null, 'Ctrl+K with no card does not dive');
await page.keyboard.press('Escape');

// Home: from the grandchild, the Home page - not the parent hole.
await page.locator('[data-learn-home]').click();
await page.waitForFunction(() => location.pathname === '/apps', null, { timeout: 15000 });

await browser.close();
if (errors.length) { console.log('page errors:', errors); process.exit(1); }
console.log('canvas shell ok at root, child and grandchild;', `${BASE}/apps/${root.name}?board=nanogpt-deep-dive`);
