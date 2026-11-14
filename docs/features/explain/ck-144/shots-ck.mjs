// CK evidence (release 144): Ctrl+K Explain selection. Local keyless stack on 127.0.0.1:8998 only (never production, never 8878). No paid model call.
// Board DERIVED from the v60 export (board-export-canvas-bcb7f9f6-postwrite-v60.json): three of its explanation cards in the column (offsets zeroed), no file card.
// The passage is opened through the Markdown bulb's own window event (rh:explain-passage, what FileDocMarkdown dispatches), with the rect of a real passage inside the second card: the preset path of the owner's screenshot.
// Usage: node shots-ck.mjs <label: before|after> <worktree-with-the-stack>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('C:/s/explain-134/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8998', phase = process.argv[2], W = process.argv[3], OUT = 'C:/s/spec/ck-144-evidence/shots';
if (!phase || !W) { console.error('usage: node shots-ck.mjs <label> <worktree>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(`${W}/packages/control-plane/.dev.vars`, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionBody = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ck-${run}@example.com`, secret, handle: `ck_${run}` }) })).json();
const session = sessionBody.session ?? sessionBody.token ?? sessionBody.cookie;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } }); let body = null; try { body = await r.json(); } catch { /* none */ } return { status: r.status, body }; };
const exported = JSON.parse(readFileSync('C:/s/spec/film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json', 'utf8'));
const keep = ['12b2f014', '90f74975', '5be887a2'];
const state = JSON.parse(JSON.stringify(exported.state));
state.blocks = state.blocks.filter(b => keep.some(k => b.id.startsWith(k))).sort((a, b) => keep.findIndex(k => a.id.startsWith(k)) - keep.findIndex(k => b.id.startsWith(k)));
for (const b of state.blocks) { b.dx = 0; b.dy = 0; delete b.at; }
state.items = []; state.links = []; state.groups = []; state.areas = []; state.exchanges = [];
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `ck ${phase} ${run}` }) })).body;
const put = await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state }) });
if (put.status !== 200) throw new Error('board PUT ' + put.status);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id]').first().waitFor({ timeout: 90000 });
await page.waitForTimeout(4000);
const measures = { phase, worktree: W, fixture: 'three explanation cards of the v60 export in the column, offsets zeroed; the passage is "Gini impurity" in the second card' };
const rects = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-block-id]')].map(el => { const r = el.getBoundingClientRect(); return [el.dataset.blockId.slice(0, 8), { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }]; })));
measures.cardsBefore = await rects();
// the passage: a real text range inside the second card
const found = await page.evaluate(() => {
  const card = [...document.querySelectorAll('[data-block-id]')].find(el => el.dataset.blockId.startsWith('90f74975'));
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent.indexOf('Gini impurity');
    if (at < 0) continue;
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 'Gini impurity'.length);
    const b = range.getBoundingClientRect();
    if (b.width > 0) return { cardId: card.dataset.blockId, text: 'Gini impurity', rect: { left: b.left, top: b.top, width: b.width, height: b.height } };
  }
  return null;
});
if (!found) throw new Error('passage not found');
measures.passage = found.rect;
await page.evaluate(detail => window.dispatchEvent(new CustomEvent('rh:explain-passage', { detail })), { sourceRef: `ref-${run}`, text: found.text, cardId: found.cardId, rect: found.rect });
await page.locator('[data-inline-ai]').waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
const win = await page.evaluate(() => {
  const w = document.querySelector('[data-inline-ai]').getBoundingClientRect(), s = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect() || null;
  const chip = document.querySelector('[data-inline-ai] [data-inline-chip]'), box = document.querySelector('[data-inline-ai] [data-inline-prompt]');
  return { window: { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.width), h: Math.round(w.height) }, surface: s && { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height) }, innerWidth, innerHeight,
    chip: chip ? { text: chip.innerText.trim(), title: chip.getAttribute('title') } : null, promptValue: box ? box.value : null, label: document.querySelector('[data-inline-mode-label]')?.innerText.trim() || null };
});
measures.opened = win;
// where the passage is now (the camera may have glided), measured from the live card text
measures.passageNow = await page.evaluate(() => {
  const card = [...document.querySelectorAll('[data-block-id]')].find(el => el.dataset.blockId.startsWith('90f74975'));
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent.indexOf('Gini impurity'); if (at < 0) continue;
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + 13);
    const b = range.getBoundingClientRect(); if (b.width > 0) return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }
  return null;
});
await page.screenshot({ path: `${OUT}/ck-${phase}-1-window.png` });
// Enter: with an empty box (after) the passage is explained; before, the box holds the passage and Enter asks the router and previews
await page.locator('[data-inline-ai] [data-inline-prompt]').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(8000);
measures.afterEnter = await page.evaluate(() => ({ windowOpen: !!document.querySelector('[data-inline-ai]'), accept: document.querySelectorAll('[data-inline-accept]').length, reject: document.querySelectorAll('[data-inline-reject]').length,
  previewText: document.querySelector('[data-inline-ai] [data-inline-preview]')?.innerText.slice(0, 120) || null, slots: [...document.querySelectorAll('[data-slot-id]')].map(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
  surface: (() => { const s = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect(); return s && { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height) }; })() }));
measures.cardsAfter = await rects();
await page.screenshot({ path: `${OUT}/ck-${phase}-2-after-enter.png` });
await browser.close();
writeFileSync(`${OUT}/measures-ck-${phase}.json`, JSON.stringify(measures, null, 2));
console.log(JSON.stringify(measures));
