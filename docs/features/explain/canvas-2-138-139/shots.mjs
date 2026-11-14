// Real-board evidence for releases 138 (CV-6 opening camera, CV-7 Fit canvas) and 139 (CV-3 dragged card keeps its place). Local keyless stack on 127.0.0.1:8998 only (never production, never 8878). No model call.
// Board = the read-only export board-export-canvas-bcb7f9f6-postwrite-v60.json imported into FRESH canvases; its markdown file is uploaded as a new source (same bytes as lesson 04's docs/en.md).
// Derived fixtures of that export (stated in the output JSON):
//   cv6: every block moved by dx +4000 / dy +5000 (all cards off the opening column view; items removed), so the board opens on empty space.
//   cv7: the export's own blocks, and its text item moved far outside the cards (x -6000, y -4000), then Shift+1 (Fit canvas).
//   cv3: three column cards (offsets zeroed), the third dragged 420 px right, then the second deleted: does the dragged card stay?
// Usage: node shots.mjs <label: base|r138|r139> <worktree-with-the-stack>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire('C:/s/explain-134/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8998', phase = process.argv[2], W = process.argv[3], OUT = 'C:/s/spec/canvas-2-evidence/shots';
if (!phase || !W) { console.error('usage: node shots.mjs <label> <worktree>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(`${W}/packages/control-plane/.dev.vars`, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionBody = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `real-${run}@example.com`, secret, handle: `real_${run}` }) })).json();
const session = sessionBody.session ?? sessionBody.token ?? sessionBody.cookie;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } }); let body = null; try { body = await r.json(); } catch { /* none */ } return { status: r.status, body }; };
const exported = JSON.parse(readFileSync('C:/s/spec/film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json', 'utf8'));
const bytes = execFileSync('git', ['show', 'e7db050e64bde3be17a9381476f748da26d85692:phases/02-ml-fundamentals/04-decision-trees/docs/en.md'], { cwd: 'C:/s/curriculum/ai-engineering-from-scratch', maxBuffer: 8 * 1024 * 1024 });

async function makeCanvas(label, edit) {
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `${label} ${phase} ${run}` }) })).body;
  const made = await api('/api/learn/files', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', name: 'en.md', type: '', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), family: 'markdown' }) });
  let source = made.body?.source;
  if (made.body?.upload) { const sent = await fetch(`${BASE}${made.body.upload.url}`, { method: 'PUT', headers: { cookie: `small_session=${session}` }, body: bytes }); source = (await sent.json()).source; }
  if (!source?.id) throw new Error('file source not created ' + made.status);
  const state = JSON.parse(JSON.stringify(exported.state));
  for (const block of state.blocks) if (block.type === 'file' && block.kind === 'markdown') block.fileRef = { ...(typeof block.fileRef === 'object' ? block.fileRef : {}), v: 1, source: { id: source.id, rev: source.rev }, family: 'markdown' };
  edit(state);
  const put = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state }) });
  if (put.status !== 200) throw new Error('board PUT ' + put.status);
  return { canvas, state };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const measures = { phase, worktree: W, fixtures: {
  cv6: 'all blocks dx +4000, dy +5000; items removed',
  cv7: 'export blocks unchanged; its text item moved to x -6000, y -4000',
  cv3: 'three column cards A 12b2f014, B 90f74975, C 5be887a2 with offsets zeroed; the camera panned down 700, C dragged 420 px right, then B (above C) deleted: C is anchored, so it should stay',
} };
const view = (page) => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const rects = [...document.querySelectorAll('[data-block-id]')].map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.blockId.slice(0, 8), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const visible = rects.filter(r => r.x < vw && r.x + r.w > 0 && r.y < vh && r.y + r.h > 0 && r.w > 0 && r.h > 0);
  return { viewport: { w: vw, h: vh }, blocks: rects.length, blocksVisible: visible.length, visibleIds: visible.map(r => r.id), widest: Math.max(0, ...rects.map(r => r.w)), card90f7: rects.find(r => r.id === '90f74975') || null, md: rects.find(r => r.id === '8c56b678') || null };
});
const open = async (canvas, accept = false) => {
  const page = await context.newPage();
  if (accept) page.on('dialog', d => d.accept());
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id]').first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(5000);
  return page;
};

const only = process.env.ONLY || '';
// CV-6
if (!only || only === 'cv6') {
  const { canvas } = await makeCanvas('cv6 off-column board', state => { for (const b of state.blocks) { b.dx = (b.dx || 0) + 4000; b.dy = (b.dy || 0) + 5000; } state.items = []; });
  const page = await open(canvas);
  measures.cv6 = await view(page);
  await page.screenshot({ path: `${OUT}/cv6-${phase}-open.png` });
  await page.close();
}
// CV-7
if (!only || only === 'cv7') {
  const { canvas } = await makeCanvas('cv7 far item board', state => { for (const item of state.items) { item.x = -6000; item.y = -4000; } });
  const page = await open(canvas);
  measures.cv7open = await view(page);
  await page.mouse.click(1650, 1020); await page.waitForTimeout(300);
  await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(1500);
  measures.cv7fit = await view(page);
  await page.screenshot({ path: `${OUT}/cv7-${phase}-fit.png` });
  await page.close();
}
// CV-3
if (!only || only === 'cv3') {
  const keep = ['12b2f014', '90f74975', '5be887a2'];
  const { canvas } = await makeCanvas('cv3 arranged board', state => {
    state.blocks = state.blocks.filter(b => keep.some(k => b.id.startsWith(k)));
    state.blocks.sort((a, b) => keep.findIndex(k => a.id.startsWith(k)) - keep.findIndex(k => b.id.startsWith(k)));
    for (const b of state.blocks) { b.dx = 0; b.dy = 0; delete b.at; }
    state.items = []; state.links = []; state.groups = []; state.areas = [];
  });
  const page = await open(canvas, true);
  const box = key => page.evaluate(k => { const el = [...document.querySelectorAll('[data-block-id]')].find(e => e.dataset.blockId.startsWith(k)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, key);
  const all = async () => ({ A: await box('12b2f014'), B: await box('90f74975'), C: await box('5be887a2') });
  measures.cv3 = { open: await all() };
  await page.screenshot({ path: `${OUT}/cv3-${phase}-1-open.png` });
  const pan = async dy => { await page.mouse.move(850, 500); await page.mouse.wheel(0, dy); await page.waitForTimeout(600); };
  await pan(700);
  measures.cv3.afterPan = await all();
  const c = measures.cv3.afterPan.C;
  const grab = { x: c.x + 24, y: c.y + 10 };
  await page.mouse.move(grab.x, grab.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(grab.x + 420 * i / 12, grab.y);
  await page.mouse.up(); await page.waitForTimeout(1200);
  measures.cv3.afterDrag = await all();
  await page.screenshot({ path: `${OUT}/cv3-${phase}-2-dragged.png` });
  const bb = measures.cv3.afterDrag.B;
  await page.mouse.click(bb.x + 24, bb.y + 10); await page.waitForTimeout(500);
  measures.cv3.selectedBeforeDelete = await page.evaluate(() => [...document.querySelectorAll('[data-block-id][aria-current="true"]')].map(el => el.dataset.blockId.slice(0, 8)));
  await page.keyboard.press('Delete'); await page.waitForTimeout(1800);
  measures.cv3.afterDeleteB = await all();
  await page.screenshot({ path: `${OUT}/cv3-${phase}-3-after-delete.png` });
  await page.close();
}
await browser.close();
writeFileSync(`${OUT}/measures-${phase}${only ? '-' + only : ''}.json`, JSON.stringify(measures, null, 2));
console.log(JSON.stringify(measures));
