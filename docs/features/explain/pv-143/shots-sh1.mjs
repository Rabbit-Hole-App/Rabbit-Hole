// SH-1 evidence (release 143): the shared page header, top left. Local keyless stack on 127.0.0.1:8998 only (never production, never 8878). No model call.
// Fixture DERIVED from the v60 export: two of its text items on an otherwise empty board, shared as a public view link; opened signed out (a public guest) in light and dark, wide and phone width.
// Usage: node shots-sh1.mjs <label: before|after> <worktree-with-the-stack>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('C:/s/explain-134/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8998', phase = process.argv[2], W = process.argv[3], OUT = 'C:/s/spec/pv-143-evidence/shots-sh1';
if (!phase || !W) { console.error('usage: node shots-sh1.mjs <label> <worktree>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(`${W}/packages/control-plane/.dev.vars`, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionBody = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `sh-${run}@example.com`, secret, handle: `sh_${run}` }) })).json();
const session = sessionBody.session ?? sessionBody.token ?? sessionBody.cookie;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } }); let body = null; try { body = await r.json(); } catch { /* none */ } return { status: r.status, body }; };
const exported = JSON.parse(readFileSync('C:/s/spec/film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json', 'utf8'));
const state = { strokes: [], links: [], blocks: [], shapes: [], groups: [], areas: [], exchanges: [], items: [{ ...exported.state.items[0], x: 120, y: 160 }] };
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Why attention heads route information between distant tokens' }) })).body;
const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state }) });
const link = `${BASE}/b/${shared.body.sharing.view}`;
const browser = await chromium.launch();
const measures = { phase, worktree: W, fixture: 'one text item of the v60 export on an otherwise empty board, public view link, signed out' };
for (const [theme, size, name] of [['light', { width: 1440, height: 900 }, 'light-wide'], ['dark', { width: 1440, height: 900 }, 'dark-wide'], ['light', { width: 390, height: 844 }, 'light-phone'], ['dark', { width: 390, height: 844 }, 'dark-phone']]) {
  const context = await browser.newContext({ viewport: size });
  await context.addInitScript(t => localStorage.setItem('small.theme', t), theme);
  const page = await context.newPage();
  await page.goto(link);
  await page.locator('[data-shared-title]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  measures[name] = await page.evaluate(async () => {
    const loadedBefore = document.fonts.check('500 20px "Space Grotesk"'); const loadedFaces = (await document.fonts.load('500 20px "Space Grotesk"')).map(f => ({ family: f.family, weight: f.weight, status: f.status }));
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
    const brand = document.querySelector('[data-canvas-header] [data-shared-brand]'), span = brand?.querySelector('span');
    const s = span ? getComputedStyle(span) : null;
    const header = document.querySelector('[data-canvas-header]');
    const kids = [...header.querySelectorAll('button, a, [data-shared-title]')].filter(n => n.getClientRects().length && n !== brand && !brand.contains(n)).map(n => r(n));
    const overlap = kids.some(k => { const b = r(brand); return b.x < k.x + k.w - 0.5 && k.x < b.right - 0.5 && b.y < k.y + k.h - 0.5 && k.y < b.y + b.h - 0.5; });
    return { dark: document.documentElement.classList.contains('dark'), brand: r(brand), centre: r(document.querySelector('[data-header-center]')), title: r(document.querySelector('[data-shared-title]')), text: brand?.innerText.trim() || null, images: brand?.querySelectorAll('img').length ?? null,
      family: s?.fontFamily || null, weight: s?.fontWeight || null, size: s?.fontSize || null, spacing: s?.letterSpacing || null, colour: s?.color || null,
      spaceGroteskLoaded: document.fonts.check('500 20px "Space Grotesk"'), loadedBefore, loadedFaces, interVariableLoaded: document.fonts.check('500 20px "Inter Variable"'), brandOverlapsAHeaderControl: overlap, headerHeight: r(header).h };
  });
  await page.screenshot({ path: `${OUT}/sh1-${name}-${phase}.png`, clip: { x: 0, y: 0, width: size.width, height: size.width > 600 ? 130 : 180 } });
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/measures-sh1-${phase}.json`, JSON.stringify(measures, null, 2));
console.log(JSON.stringify(measures));
