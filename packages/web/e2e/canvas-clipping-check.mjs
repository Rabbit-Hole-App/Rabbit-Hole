// Canvas clipping beside the side panels (docs/features/canvas-clipping.md), against the LOCAL stack only: local D1, a fresh
// browser profile, no model call (model-capable routes are aborted and counted; none may happen).
// The failure it pins: with Chat and Sources open on a 1536 px laptop, the Rabbit Holes Map kept its own 92 px full-height
// column, so the canvas surface (overflow hidden) ended 92 px before the panel - a blank strip - and cut the PDF card's right
// side; Add to chat opening Chat narrowed the canvas and left the selected card cut.
// Covered: both panels open (no blank strip, the map still shown in the tools gutter, the selected PDF card and its reader
// whole); Chat dragged wider; Add to chat opening a hidden Chat keeps the selected card in view (a PDF card, then a Notebook
// card); zoom 64%, 100% and 156% (the canvas still runs to the panel); Sources closed (the map back in its own column, top
// right); every saved card position and size unchanged by all of it.
// Prints `ok <label>` per check; exits 1 on any failure. Evidence (screenshots, results.json) goes to OUT.
// Usage: BASE=http://127.0.0.1:8881 SMALL_CP=http://127.0.0.1:8883 VARS=<cp .dev.vars> OUT=<dir> node e2e/canvas-clipping-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8881';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8883';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-clipping-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/canvas-clipping', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `clip-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// A 4-page PDF (Helvetica text, a correct xref), uploaded as the canvas's context document.
function makePdf(n) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i = 0; i < n; i++) {
    const stream = `0 0 1 rg 0 700 612 40 re f 0 g BT /F1 72 Tf 60 396 Td (PAGE ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(4), NAME = 'clip-fixture.pdf';
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Clip ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error('the canvas was not created');
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([PDF], { type: 'application/pdf' }), NAME);
const uploaded = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json();
if (!/^ctx:[0-9a-f]{12}$/.test(uploaded.document?.id || '')) throw Error('the context document was not stored');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
const browser = await chromium.launch();
// 1536 x 864: a common laptop (1920 at 125%), where Chat and Sources together leave the canvas row about 712 px.
const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
// Sources is now the right panel's Context tab (docs/features/hide-right-panel.md), so the 712 px canvas row that Chat (420) and
// Sources (400) side by side used to leave is set up as one 820 px right panel; the last step resets it to its 420 px default.
await context.addInitScript(() => { try { if (location.pathname.startsWith('/apps/')) localStorage.setItem('rh.chat.width', '820'); } catch { /* a sandboxed frame */ } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { refused.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const results = [], facts = {};
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}`);
    await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const settle = () => page.waitForTimeout(700); // the side panels slide their width over 320 ms

// Where everything is (viewport px): the surface, the row it sits in, the panels, the map, every card and the PDF card's reader.
let PDF_CARD = null;
const geometry = () => page.evaluate(pdfId => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width || b.height ? { x: b.left, right: b.right, y: b.top, bottom: b.bottom, w: b.width } : null; };
  const surface = document.querySelector('[data-canvas-surface]');
  // One right panel since Sources became its Context tab (docs/features/hide-right-panel.md).
  const panels = [...document.querySelectorAll('aside[aria-label="Learn agent chat"]')].map(r).filter(box => box && box.w > 1);
  const cards = Object.fromEntries([...document.querySelectorAll('[aria-label="Lesson canvas"] [data-canvas-surface] [data-block-id]')].map(el => [el.dataset.blockId, r(el)]));
  const frame = pdfId && document.querySelector(`[aria-label="Lesson canvas"] [data-block-id="${pdfId}"] iframe`);
  return { surface: r(surface), row: r(surface?.parentElement), panelLeft: panels.length ? Math.min(...panels.map(p => p.x)) : innerWidth, panels: panels.length,
    nav: r(document.querySelector('[data-dive-navigator]')), diveGutter: r(document.querySelector('[data-dive-gutter]')), tools: r(document.querySelector('[data-tool-gutter]')), cards, frame: r(frame),
    zoom: document.querySelector('[data-zoom]')?.innerText.match(/\d+%/)?.[0] ?? null };
}, PDF_CARD);
// The canvas runs to the panel: nothing but the row's own 4 px edge between the surface and the first panel, and no
// map column inside the row while panels are open on this laptop.
const noBlankStrip = (g, label) => {
  assert.ok(g.panelLeft - g.surface.right <= 6, `${label}: ${Math.round(g.panelLeft - g.surface.right)} px between the canvas surface (right ${Math.round(g.surface.right)}) and the panel (${Math.round(g.panelLeft)})`);
};
// A card the surface has room for is drawn whole, its reader too. One wider than the canvas (a 640 px Notebook in a 628 px
// canvas) shows its start, and runs on under the panel: that edge is the real one (noBlankStrip), ordinary canvas clipping.
const whole = (g, id, label) => {
  const card = g.cards[id];
  assert.ok(card, `${label}: the card is drawn`);
  if (card.w > g.surface.w - 48) assert.ok(card.x >= g.surface.x - 0.5, `${label}: the card (${Math.round(card.w)} px, wider than the ${Math.round(g.surface.w)} px canvas) shows its start: ${Math.round(card.x)} vs ${Math.round(g.surface.x)}`);
  else assert.ok(card.x >= g.surface.x - 0.5 && card.right <= g.surface.right + 0.5, `${label}: card ${Math.round(card.x)}-${Math.round(card.right)} inside the surface ${Math.round(g.surface.x)}-${Math.round(g.surface.right)}`);
  if (id === PDF_CARD && g.frame) assert.ok(g.frame.x >= card.x - 0.5 && g.frame.right <= card.right + 0.5, `${label}: the PDF reader ${Math.round(g.frame.x)}-${Math.round(g.frame.right)} inside its card`);
};
const saved = async () => ((await page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }, INK))?.blocks || [])
  .map(b => ({ id: b.id, dx: b.dx ?? 0, dy: b.dy ?? 0, w: b.w ?? null, h: b.h ?? null })).sort((a, b) => a.id.localeCompare(b.id));
// A press on the card's drag strip, near its left end (always on screen here), selects it.
// A point of bare canvas (no card, no chrome) to wheel over: a wheel over a card's own content scrolls that instead.
const barePoint = () => page.evaluate(() => {
  const s = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  for (let y = s.top + 60; y < s.bottom - 60; y += 30) for (let x = s.left + 6; x < s.right - 6; x += 30) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[data-canvas-bottom] button,[role="toolbar"],[data-zoom],[data-canvas-minimap],iframe,button')) return { x, y };
  }
  return null;
});
// Pan (wheel, 1:1) until the card's top sits 80 px below the canvas's top, its left edge 24 px in.
const inView = async id => {
  for (let i = 0; i < 4; i += 1) {
    const g = await geometry(), card = g.cards[id];
    const dx = card.x - (g.surface.x + 24), dy = card.y - (g.surface.y + 80);
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    const at = await barePoint();
    if (!at) throw Error('no bare canvas to pan from');
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(250);
  }
};
const select = async id => {
  await inView(id);
  const g = await geometry(), card = g.cards[id];
  await page.mouse.click(Math.max(card.x, g.surface.x) + 30, Math.max(card.y, g.surface.y) + 10);
  await page.locator('[role="toolbar"][aria-label="Selection actions"] [data-add-to-chat]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error(`card ${id} was not selected (no selection bar)`); });
  await page.waitForTimeout(200);
};
const chatOpen = async () => ((await page.locator('aside[aria-label="Learn agent chat"]').boundingBox())?.width || 0) > 1;
const pan = async dx => {
  const at = await barePoint();
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(-dx, 0);
  await page.waitForTimeout(300);
};

// ================================================================ setup: the PDF card (through Sources) and a Notebook card
await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);
// Context (the right panel's Sources tab), then the document's own row action Add to canvas.
await page.locator('[data-panel-tab="context"]').click({ timeout: 5000 });
await page.locator('[data-material-row]').filter({ has: page.locator(`[data-material-name][title="${NAME}"]`) }).first().locator('[data-material-action="canvas"]').click({ timeout: 10000 });
const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]');
await dialog.waitFor({ timeout: 10000 });
await waitFor(async () => (await dialog.locator('[data-pdf-total]').innerText().catch(() => '')).trim() === '4 pages', 20000, 'the dialog did not count 4 pages');
await dialog.locator('[data-pdf-choice="pdf"]').click();
await dialog.locator('button').last().click();
await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 60000 });
await settle();
PDF_CARD = await waitFor(async () => Object.keys((await geometry()).cards)[0], 15000, 'no PDF card');
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'Insert' }).click();
await page.getByRole('menuitem', { name: 'Notebook' }).click();
const NOTE_CARD = await waitFor(async () => Object.keys((await geometry()).cards).find(id => id !== PDF_CARD), 15000, 'no Notebook card');
await settle();
const positions = await saved();
facts.cards = { pdf: PDF_CARD, notebook: NOTE_CARD, saved: positions };

// ================================================================ the run
await check('the right panel open on Context: the canvas runs to the panel (no blank strip), the map is still shown, beside the canvas', async () => {
  const g = await geometry();
  facts.both_open = g;
  assert.equal(g.panels, 1, 'the one right panel is open');
  assert.equal(await page.locator('[data-panel-tab="context"]').getAttribute('aria-selected'), 'true', 'on its Context tab');
  noBlankStrip(g, 'Context open');
  assert.ok(g.nav, 'the Rabbit Holes Map is still on screen');
  assert.ok(g.nav.right <= g.surface.x + 0.5 || g.nav.x >= g.surface.right - 0.5, `the map ${Math.round(g.nav.x)}-${Math.round(g.nav.right)} never sits on the canvas ${Math.round(g.surface.x)}-${Math.round(g.surface.right)}`);
  await shot('01-both-panels-open');
});

await check('the selected PDF card is drawn whole, its reader inside it, with the panel open on Context', async () => {
  await select(PDF_CARD);
  const g = await geometry();
  facts.pdf_selected = { card: g.cards[PDF_CARD], frame: g.frame, surface: g.surface, panelLeft: g.panelLeft };
  noBlankStrip(g, 'selected');
  whole(g, PDF_CARD, 'selected PDF card');
  await shot('02-pdf-card-selected-both-open');
});

await check('Chat dragged 24 px wider: still no blank strip, the selected PDF card still whole', async () => {
  const handle = page.getByRole('separator', { name: 'Resize Learn panel' });
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await settle();
  const g = await geometry();
  facts.chat_wider = { surface: g.surface, panelLeft: g.panelLeft, card: g.cards[PDF_CARD] };
  noBlankStrip(g, 'Chat wider');
  whole(g, PDF_CARD, 'Chat wider');
  await shot('03-chat-resized-wider');
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await settle();
});

for (const [name, id] of [['PDF', () => PDF_CARD], ['Notebook', () => NOTE_CARD]]) {
  await check(`Add to chat (Ctrl+L) on the ${name} card with Chat hidden: Chat opens and the card stays whole in the narrower canvas`, async () => {
    if (await chatOpen()) { await page.locator('aside[aria-label="Learn agent chat"] [data-panel-close]').first().click(); await settle(); }
    assert.equal(await chatOpen(), false, 'Chat is hidden');
    await select(id());
    // Park the card at the right of the wide canvas, so the opening Chat panel would cover where it sits.
    let g = await geometry();
    await pan(g.surface.right - 40 - g.cards[id()].right);
    g = await geometry();
    whole(g, id(), `${name} card parked right, Chat hidden`);
    const parked = g.cards[id()];
    // The selection bar's Add to chat (Ctrl+L): Chat opens with the card as context; nothing is sent.
    await page.locator('[role="toolbar"][aria-label="Selection actions"] [data-add-to-chat]').click();
    await waitFor(chatOpen, 5000, 'Add to chat did not open Chat');
    await settle();
    g = await geometry();
    facts[`add_to_chat_${name}`] = { parked, after: g.cards[id()], surface: g.surface, panelLeft: g.panelLeft };
    noBlankStrip(g, `${name}: Chat opened`);
    whole(g, id(), `${name}: Chat opened`);
    assert.ok(Math.abs(g.cards[id()].w - parked.w) < 1, 'its size on screen is unchanged (the camera moved, not the card)');
    await shot(`04-add-to-chat-${name.toLowerCase()}`);
  });
}

for (const zoom of ['Zoom out', 'Zoom in']) {
  await check(`${zoom} twice (64% / 156%): the canvas still runs to the panel, and nothing between them cuts a card`, async () => {
    await page.keyboard.press('Shift+Digit0');
    for (let i = 0; i < 2; i += 1) { await page.locator(`[title="${zoom}"]:visible`).first().click(); await page.waitForTimeout(200); }
    await settle();
    const g = await geometry();
    facts[`zoom_${g.zoom}`] = { surface: g.surface, panelLeft: g.panelLeft, cards: g.cards };
    noBlankStrip(g, `zoom ${g.zoom}`);
    // The card's nearest clipping ancestor is the canvas surface itself: no box between the card and the surface clips it.
    const clip = await page.evaluate(id => {
      for (let el = document.querySelector(`[data-canvas-surface] [data-block-id="${id}"]`)?.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflowX !== 'visible' || cs.clipPath !== 'none') return el.hasAttribute('data-canvas-surface') ? 'surface' : `${el.tagName}.${String(el.className).slice(0, 60)}`;
      }
      return null;
    }, PDF_CARD);
    assert.equal(clip, 'surface', `the PDF card's first clipping ancestor is ${clip}`);
    await shot(`05-zoom-${String(g.zoom).replace('%', '')}`);
  });
}

await check('Context closed (back on Chat) and the panel back to its 420 px default: the map is in its own column, top right, beside the canvas', async () => {
  await page.keyboard.press('Shift+Digit0');
  if (await page.locator('[data-sources-close]').isVisible().catch(() => false)) await page.locator('[data-sources-close]').click();
  await page.getByRole('separator', { name: 'Resize Learn panel' }).dblclick();
  await settle();
  const g = await geometry();
  facts.sources_closed = { surface: g.surface, nav: g.nav, diveGutter: g.diveGutter, panelLeft: g.panelLeft };
  assert.equal(g.panels, 1, 'the panel is open on Chat');
  assert.equal(await page.locator('[data-panel-tab="chat"]').getAttribute('aria-selected'), 'true', 'Close on Sources went back to Chat');
  assert.ok(g.diveGutter && g.nav.x >= g.surface.right - 0.5 && g.nav.y < g.surface.y + 120, `the map is top right, beside the canvas: ${JSON.stringify({ nav: g.nav, surface: g.surface })}`);
  await shot('06-sources-closed-map-top-right');
});

await check('every saved card position and size is unchanged by opening, closing, resizing and zooming', async () => {
  assert.deepEqual(await saved(), positions);
});

// The canvas's own background requests (the next-steps hooks) are aborted here, never sent; the check sends none itself.
await check('nothing left the local stack, no page error; every model-capable request was aborted before the server', async () => {
  facts.aborted_model_requests = refused;
  assert.ok(refused.every(entry => /\/api\/learn\/tutor\/next-steps$/.test(entry)), `only the canvas's own next-steps requests were aborted: ${refused.join(', ')}`);
  // The Notebook card's own runtime embed is the only outside host, and it was aborted.
  facts.outside_hosts = [...new Set(outside)];
  assert.ok(facts.outside_hosts.every(host => /notebook/.test(host)), `outside hosts: ${facts.outside_hosts.join(', ')}`);
  assert.deepEqual(errors, [], 'page errors');
});

writeFileSync(`${OUT}/results.json`, JSON.stringify({ canvas: canvas.name, results, facts }, null, 2));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `FAIL ${failed} of ${results.length}` : `PASS ${results.length} checks`);
process.exit(failed ? 1 : 0);
