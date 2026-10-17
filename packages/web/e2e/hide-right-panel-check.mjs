// Hide right panel (docs/features/hide-right-panel.md) and the companion column's Context view (owner decision 1A, 2026-10-15),
// against the LOCAL stack only: local D1 and a fresh browser profile. No model is called: every model-capable request is aborted
// and counted, and none may happen. Prints no secrets.
// Covers: one navigation row (Chat, Find, Contents, Comments, Links) and no Chat | Sources switch; Context opens in the companion
// column LEFT of Chat with Chat still visible; hide/reopen from Chat (the
// draft stays), from Context without a reader and with a PDF open (the same reader, document and page come back), keyboard
// activation, tooltip and aria-pressed; hiding while an uploaded PDF is still being placed (its completion never reopens the
// panel); repeated tab switches and hide/show cycles (no stuck panel, no resize handle or overlay left, the canvas reclaims the
// panel's width and gets it back, saved card positions unchanged); below lg one column at a time (the viewer in Chat's place,
// Back to chat, the draft kept); a stroke drawn and the panel hidden or shown within the canvas's 400 ms save, kept in this
// browser and on the server.
// Usage: BASE=http://127.0.0.1:8921 SMALL_CP=http://127.0.0.1:8923 VARS=<cp .dev.vars> OUT=<dir> node e2e/hide-right-panel-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8921';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8923';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('hide-right-panel-check runs against the local stack only');
const OUT = process.env.OUT || new URL('./shots/hide-right-panel', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `hrp-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// A 3-page PDF (Helvetica "PAGE n"), uploaded as the canvas's context document, and dropped once more as an uploaded paper.
function makePdf(n) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i = 0; i < n; i++) {
    const stream = `0 g BT /F1 72 Tf 60 400 Td (PAGE ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const PDF = makePdf(3), DOC_NAME = 'panel-notes.pdf', LATE_NAME = 'late-reader.pdf', DROP_NAME = 'late-upload.pdf';

const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Hide right panel ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error('the canvas was not created');
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([PDF], { type: 'application/pdf' }), DOC_NAME);
const uploaded = await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json();
if (!/^ctx:[0-9a-f]{12}$/.test(uploaded.document?.id || '')) throw Error('the context document was not stored');
const lateForm = new FormData();
lateForm.append('app', canvas.name);
lateForm.append('file', new Blob([makePdf(2)], { type: 'application/pdf' }), LATE_NAME);
const late = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: lateForm, headers: { cookie } })).json()).document;
if (!/^ctx:[0-9a-f]{12}$/.test(late?.id || '')) throw Error('the second context document was not stored');
const LATE_HEX = late.id.slice('ctx:'.length);
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const BLOCKS = [{ id: 'c-a', type: 'explanation', dx: 0, dy: 0, title: 'Card A: tides', body: 'The moon pulls the near ocean more than the Earth.' }];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, value]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); } catch { /* a sandboxed frame has no storage */ } }, [INK, STATE]);
const sent = [], errors = [];
const MODEL = /^\/api\/(ask$|learn\/(ask$|artifact|assess|grade|home-ask|image|inline\/(generate|route)|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore))/;
let holdUpload = null, holdLate = null;
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  // The canvas asks for Professor Next Steps by itself; it is aborted and not counted (nothing here sends a turn).
  if (url.pathname === '/api/learn/tutor/next-steps') return route.abort();
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { sent.push(url.pathname); return route.abort(); }
  if (url.pathname === '/api/learn/paper' && request.method() === 'POST' && holdUpload) await holdUpload;
  if (request.method() === 'GET' && url.pathname.startsWith('/api/learn/context/') && url.pathname.includes(LATE_HEX) && holdLate) await holdLate;
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
const results = [];
const check = async (label, fn) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) { results.push({ label, ok: false, error: String(error?.message || error).split('\n')[0].slice(0, 300) }); console.log(`FAIL ${label} - ${results.at(-1).error}`); await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const waitFor = async (test, ms = 8000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const PANEL = 'aside[aria-label="Learn agent chat"]';
const toggle = () => page.locator('button[aria-label="Hide the right panel"], button[aria-label="Show the right panel"]').first();
const pane = () => page.locator('[data-chat-pane]');
const field = () => pane().locator('[data-chat-composer] textarea').first();
// On-screen width: the element's box clipped by the side panel (aside) holding it - a collapsed panel slides to 0 and clips its
// content, which keeps its own width inside.
const width = selector => page.evaluate(s => {
  const e = document.querySelector(s); if (!e) return 0;
  const r = e.getBoundingClientRect(), a = e.closest('aside')?.getBoundingClientRect() ?? r;
  return Math.max(0, Math.min(r.right, a.right) - Math.max(r.left, a.left));
}, selector);
const surfaceWidth = () => width('[data-canvas-surface]');
const sourcesWidth = () => width('[data-sources-pane]');
// Hidden: the panel slid to 0, its resize handle gone, the Sources surface 0 wide, the toggle says Show and is not pressed.
const assertHidden = async () => {
  await waitFor(async () => (await width(PANEL)) < 1, 5000, `the panel is still ${Math.round(await width(PANEL))}px wide`);
  assert.equal(await sourcesWidth() < 1, true, `Sources is still ${Math.round(await sourcesWidth())}px wide on screen`);
  assert.equal(await page.locator('[role="separator"][aria-label="Resize Learn panel"], [role="separator"][aria-label="Resize viewer"]').count(), 0, 'no resize handle left');
  assert.equal(await toggle().getAttribute('aria-label'), 'Show the right panel');
  assert.equal(await toggle().getAttribute('title'), 'Show the right panel');
  assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
};
const hide = async () => { await toggle().click(); await assertHidden(); };
// Reopen with the keyboard (Enter on the focused toggle): the panel comes back and the toggle says Hide.
const reopen = async () => {
  await toggle().focus();
  await page.keyboard.press('Enter');
  await waitFor(async () => (await width(PANEL)) > 300, 5000, 'the panel did not reopen');
  assert.equal(await toggle().getAttribute('aria-label'), 'Hide the right panel');
  assert.equal(await toggle().getAttribute('aria-pressed'), 'true');
};
const activeTab = () => page.evaluate(() => document.querySelector('[data-panel-tab][aria-selected="true"]')?.dataset.panelTab ?? null);
const activeView = () => page.evaluate(() => document.querySelector('[data-companion-view][aria-pressed="true"]')?.dataset.companionView ?? null);
// The companion and Chat side by side: both on screen, the companion's right edge at Chat's left edge.
const besideChat = async () => {
  const boxes = () => page.evaluate(() => ['aside[data-companion]', 'aside[aria-label="Learn agent chat"]'].map(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { left: r.left, right: r.right, width: r.width }; }));
  // The columns slide open over 320 ms: measure once both have settled.
  await waitFor(async () => (await boxes()).every(box => box?.width > 300), 5000).catch(() => {});
  const [viewer, chat] = await boxes();
  assert.ok(viewer?.width > 300 && chat?.width > 300, `both columns show: viewer ${Math.round(viewer?.width)}, Chat ${Math.round(chat?.width)}`);
  assert.ok(Math.abs(viewer.right - chat.left) < 2, 'the viewer sits immediately LEFT of Chat');
  assert.ok(await field().isVisible(), 'the Chat composer stays visible');
};
// Opens Context from the Chat header's one Context / Files / Graph control (owner brief 2026-10-16 items 3-4; the composer's
// Open Context shortcut is gone), then its Context tab - in both layouts.
const openContext = async () => {
  if (await page.locator('[data-panel-companion]').getAttribute('aria-pressed') !== 'true') await page.locator('[data-panel-companion]').click();
  await page.locator('[data-companion-view="context"]').click();
  await waitFor(async () => (await sourcesWidth()) > 50, 5000, 'Context / Sources did not open');
};
const blocksSaved = () => page.evaluate(key => JSON.stringify((JSON.parse(localStorage.getItem(key) || 'null')?.blocks || []).map(b => [b.id, b.x, b.y, b.w, b.h, b.dx, b.dy])), INK);

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="c-a"]').waitFor({ timeout: 60000 });
await pane().waitFor({ state: 'visible', timeout: 30000 });
await frames();
// The canvas width once the layout has settled (the panel, the gutters and the rail mount over the first moments).
const stableWidth = async () => { let last = await surfaceWidth(), since = Date.now(); return waitFor(async () => { const now = await surfaceWidth(); if (Math.abs(now - last) > 0.5) { last = now; since = Date.now(); } return Date.now() - since > 600 && last; }, 15000, 'the canvas width kept changing'); };
let openWidth = await stableWidth();

await check('one navigation row: Chat, Find, Contents, Comments, Links, each named and titled; no Chat | Sources switch', async () => {
  const tabs = await page.locator('[data-panel-header] [data-panel-tab]').evaluateAll(list => list.map(b => ({ id: b.dataset.panelTab, label: b.getAttribute('aria-label'), title: b.getAttribute('title') })));
  assert.deepEqual(tabs.map(t => t.id), ['chat', 'find', 'toc', 'comments', 'links'], 'the tab order');
  assert.ok(tabs.every(t => t.label && t.title), 'every tab has a tooltip and an accessible name');
  assert.equal(tabs.at(-1).label, 'Links');
  assert.equal(await page.locator('[data-panel-header]').count(), 1, 'one navigation row');
  assert.equal(await page.locator('[data-pane-switch]').count(), 0, 'no Chat | Sources switch');
});

await check('hide and reopen from Chat: the panel goes, the canvas takes its width, the conversation and draft come back', async () => {
  await field().fill('a draft I have not sent');
  openWidth = await stableWidth();
  await hide();
  await waitFor(async () => (await surfaceWidth()) > openWidth + 300, 5000, `the canvas did not reclaim the width (${Math.round(await surfaceWidth())} vs ${Math.round(openWidth)})`);
  await shot('01-hidden-from-chat');
  await reopen();
  assert.equal(await activeTab(), 'chat');
  assert.equal(await field().inputValue(), 'a draft I have not sent', 'the draft survives');
  await waitFor(async () => Math.abs((await surfaceWidth()) - openWidth) < 2, 5000, 'the canvas width did not come back').catch(async e => { throw Error(`${e.message}: ${Math.round(await surfaceWidth())} vs ${Math.round(openWidth)}, panel ${Math.round(await width(PANEL))}`); });
});

// Toggling the panel never loses canvas work (owner, 2026-10-16): a stroke drawn and the panel hidden at once, inside the
// canvas's 400 ms save, is in this browser's copy and on the server; the same for one drawn and the panel shown.
await check('a stroke drawn and the panel hidden, then shown, within 400 ms: each kept in this browser and on the server', async () => {
  const kept = () => page.evaluate(key => (JSON.parse(localStorage.getItem(key) || 'null')?.strokes || []).length, INK);
  const saved = async () => ((await api(`/api/learn/boards/${canvas.name}/main`)).state?.strokes || []).length;
  for (const [what, done] of [['hidden', () => assertHidden()], ['shown', () => waitFor(async () => (await width(PANEL)) > 300, 5000, 'the panel did not reopen')]]) {
    const before = await kept();
    await page.getByRole('button', { name: 'Pen', exact: true }).click();
    const frame = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
    const x = frame.x + frame.width * 0.55, y = frame.y + frame.height * (what === 'hidden' ? 0.7 : 0.8);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y + 20, { steps: 8 }); await page.mouse.up();
    const drawn = Date.now();
    await toggle().click();
    const after = Date.now() - drawn;
    assert.ok(after < 400, `the panel was ${what} ${after} ms after the stroke, inside the 400 ms save`);
    await done();
    await page.keyboard.press('Escape');
    await waitFor(async () => (await kept()) === before + 1, 10000, `the stroke drawn as the panel was ${what} is not in this browser's copy (${await kept()} vs ${before})`);
    await waitFor(async () => (await saved()) === before + 1, 15000, `the stroke drawn as the panel was ${what} is not on the server (${await saved()} vs ${before})`);
  }
});

await check('hide and reopen from Context without an open reader: Context opens beside Chat, both come back, Materials listed', async () => {
  await openContext();
  assert.equal(await activeView(), 'context');
  assert.equal(await page.locator('[data-panel-companion]').getAttribute('aria-pressed'), 'true', 'the Context, Files and Graph control in the Chat header shows it pressed');
  assert.equal(await page.locator('[data-companion-view="context"]').getAttribute('aria-pressed'), 'true', 'on its Context tab');
  await besideChat();
  await shot('02-context-materials');
  await hide();
  await reopen();
  await waitFor(async () => (await sourcesWidth()) > 50, 5000, 'Context did not come back');
  await besideChat();
  assert.ok(await page.locator('[data-sources-pane]').getByText(DOC_NAME).first().isVisible(), 'the Materials list shows the document');
});

await check('hide and reopen from Context with a PDF open: the same reader, document and page come back; Chat keeps its draft', async () => {
  await page.locator('[data-sources-pane] section button[aria-expanded]').filter({ hasText: DOC_NAME }).first().click();
  const reader = page.locator('[data-sources-pane] [data-source-reader]').first(); // SourcesPane's wrapper; SourceReader inside carries the same attribute
  await reader.waitFor({ state: 'visible', timeout: 10000 });
  // The reader's DOM node is tagged: the same node after the reopen means the reader (its document, page and scroll) was kept.
  await reader.evaluate(node => { node.dataset.hrpTag = 'kept'; });
  const title = (await page.locator('[data-sources-header] h2').innerText()).trim();
  assert.equal(title, DOC_NAME, 'the reader shows the document');
  await hide();
  await shot('03-hidden-from-context');
  await reopen();
  await waitFor(async () => (await sourcesWidth()) > 50, 5000, 'Context did not come back');
  assert.equal(await page.locator('[data-sources-pane] [data-source-reader][data-hrp-tag="kept"]').count(), 1, 'the same reader node, not a reload');
  assert.equal((await page.locator('[data-sources-header] h2').innerText()).trim(), DOC_NAME, 'the same document');
  await shot('04-reopened-context');
  await besideChat();
  assert.equal(await field().inputValue(), 'a draft I have not sent', 'Chat kept its draft beside Context');
  await page.locator('[data-panel-tab="find"]').click();
  await page.locator('[data-panel-tab="chat"]').click();
  assert.equal(await page.locator('[data-sources-pane] [data-source-reader][data-hrp-tag="kept"]').count(), 1, 'switching Chat tabs keeps the reader');
});

await check('hiding while a PDF is loading in the Context reader: the late load does not reopen the panel, and reopening shows it', async () => {
  let release;
  holdLate = new Promise(resolve => { release = resolve; });
  // Settled into a value either way, so a step that fails first never leaves this wait to crash the run.
  const bytes = page.waitForResponse(response => response.url().includes(LATE_HEX) && response.request().method() === 'GET', { timeout: 30000 }).catch(error => error);
  await page.locator('[data-companion-view="context"]').click();
  await page.locator('[data-sources-pane] section button[aria-expanded]').filter({ hasText: LATE_NAME }).first().click();
  await hide();
  release();
  holdLate = null;
  const loaded = await bytes;
  if (loaded instanceof Error) throw loaded;
  await frames();
  await assertHidden();
  await shot('05a-still-hidden-after-reader-load');
  await reopen();
  assert.equal(await activeView(), 'context', 'reopening restores Context');
  await besideChat();
  await waitFor(async () => (await page.locator('[data-sources-header] h2').innerText()).trim() === LATE_NAME, 8000, 'the late document is not the one shown');
});

// The upload road's completion (LearnPage openSource with reveal false). Its dialog is modal, so the hide is a programmatic
// click on the header toggle, standing in for a hide that lands before the upload finishes.
await check('hiding while an uploaded PDF is still being placed: its completion does not reopen the panel', async () => {
  await page.locator('[data-companion-close]').click();
  await waitFor(async () => (await sourcesWidth()) < 1, 5000, 'Close viewer did not close the column');
  assert.ok(await field().isVisible(), 'Close viewer leaves Chat open');
  let release;
  holdUpload = new Promise(resolve => { release = resolve; });
  const surface = page.locator('[data-canvas-surface]').first();
  const box = await surface.boundingBox();
  await page.evaluate(([bytes, name, x, y]) => {
    const element = document.querySelector('[aria-label="Lesson canvas"] div.touch-none') || document.querySelector('[data-canvas-surface]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, [[...PDF], DROP_NAME, box.x + box.width * 0.4, box.y + box.height * 0.4]);
  const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]');
  await dialog.waitFor({ timeout: 15000 });
  await waitFor(async () => (await dialog.locator('[data-pdf-total]').innerText()).trim() === '3 pages', 15000, 'the dialog did not count the pages');
  await dialog.locator('[data-pdf-choice="pages"]').click();
  await dialog.locator('[data-pdf-choice="all"]').click();
  const before = await page.locator('[aria-label="Lesson canvas"] [data-slide]').count();
  await dialog.locator('button').last().click();
  await toggle().evaluate(button => button.click());
  await assertHidden();
  release();
  holdUpload = null;
  await page.locator('[data-pdf-add-dialog]').waitFor({ state: 'detached', timeout: 60000 });
  await waitFor(async () => (await page.locator('[aria-label="Lesson canvas"] [data-slide]').count()) >= before + 3, 30000, 'the pages did not land');
  await frames();
  await assertHidden();
  await shot('05-still-hidden-after-upload');
  await reopen();
  assert.equal(await activeTab(), 'chat', 'reopening restores the tab the learner hid, not the late one');
  assert.ok((await sourcesWidth()) < 1, 'and leaves the viewer closed, as it was hidden');
});

await check('repeated tab switches and hide/show cycles: no stuck panel, no handle or overlay, the canvas width comes back, cards unmoved', async () => {
  // The pages just placed may still be writing their sizes: start from a saved state that held for a second.
  let savedBefore = await blocksSaved(), since = Date.now();
  await waitFor(async () => { const now = await blocksSaved(); if (now !== savedBefore) { savedBefore = now; since = Date.now(); } return Date.now() - since > 1000; }, 20000, 'the saved board kept changing');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    // Context in the companion beside every Chat tab (cycle 1), then with the companion closed (cycle 2): hiding takes both columns.
    if (cycle === 0) await openContext(); else await page.locator('[data-companion-close]').click();
    for (const tab of ['find', 'toc', 'links', 'chat']) {
      await page.locator(`[data-panel-tab="${tab}"]`).click();
      assert.equal(await activeTab(), tab);
      // Read whether the viewer is open once the layout has settled: right after the close in cycle 2 the column is still
      // sliding shut (320 ms), and a reading taken then counts a closed viewer as open.
      openWidth = await stableWidth();
      const viewerWas = (await sourcesWidth()) > 50;
      await hide();
      // Where the panel was, the canvas (its surface or its own right gutter) answers the pointer: no invisible overlay left over.
      const hit = await page.evaluate(() => { const x = window.innerWidth - 60, y = window.innerHeight / 2, e = document.elementFromPoint(x, y); return !!e?.closest('[aria-label="Lesson canvas"]') && !e.closest('aside'); });
      assert.ok(hit, `after hiding ${tab}, the panel's area is the canvas`);
      await reopen();
      assert.equal(await activeTab(), tab, `reopening restores ${tab}`);
      await waitFor(async () => ((await sourcesWidth()) > 50) === viewerWas, 5000, `reopening ${viewerWas ? 'did not restore' : 'opened'} the viewer`);
      await waitFor(async () => Math.abs((await surfaceWidth()) - openWidth) < 2, 5000, `the canvas width after ${tab}`).catch(async e => { throw Error(`${e.message}: ${Math.round(await surfaceWidth())} vs ${Math.round(openWidth)}, panel ${Math.round(await width(PANEL))}`); });
    }
  }
  // Arrow keys move along the one row and select as they go.
  const enabled = await page.locator('[data-panel-header] [data-panel-tab]:not([aria-disabled])').evaluateAll(list => list.map(b => b.dataset.panelTab));
  await page.locator('[data-panel-tab="links"]').click();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await activeTab(), enabled[enabled.indexOf('links') - 1], 'ArrowLeft from Links selects the tab before it');
  const savedAfter = await blocksSaved();
  if (savedAfter !== savedBefore) {
    const a = JSON.parse(savedBefore), b = JSON.parse(savedAfter);
    const moved = b.filter(x => JSON.stringify(x) !== JSON.stringify(a.find(y => y[0] === x[0])));
    throw Error(`saved card positions and sizes changed by the hide/show cycles: ${JSON.stringify(moved.slice(0, 3))} was ${JSON.stringify(moved.slice(0, 3).map(x => a.find(y => y[0] === x[0])))}`);
  }
});

// Below lg (owner decision 1A): one column at a time. The viewer shows in Chat's place with Back to chat; Chat stays mounted.
await check('below lg the viewer takes Chat\'s place, Back to chat returns, the draft is kept', async () => {
  await page.locator('[data-panel-tab="chat"]').click();
  await page.setViewportSize({ width: 900, height: 900 });
  await field().waitFor({ state: 'visible', timeout: 5000 });
  await field().fill('a narrow draft');
  await openContext();
  await waitFor(async () => !(await field().isVisible()), 5000, 'Chat still shows beside the viewer below lg');
  assert.ok(await page.locator('[data-companion-back]').isVisible(), 'Back to chat');
  assert.equal(await page.locator('[data-companion-close]').isVisible(), false, 'Back to chat stands in for Close');
  await shot('06-narrow-viewer');
  await page.locator('[data-companion-back]').click();
  await field().waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await field().inputValue(), 'a narrow draft', 'the draft survives');
  assert.ok((await sourcesWidth()) < 1, 'the viewer is put away');
  await shot('07-narrow-back-to-chat');
  await page.setViewportSize({ width: 1600, height: 900 });
});

const failed = results.filter(r => !r.ok);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, model_requests: sent, page_errors: errors }, null, 2));
if (sent.length) { console.log(`FAIL model-capable requests: ${sent.join(', ')}`); failed.push({}); }
if (errors.length) { console.log(`FAIL page errors: ${errors.join(' | ')}`); failed.push({}); }
console.log(failed.length ? `FAILED ${failed.length} of ${results.length}` : `PASS ${results.length} checks`);
await browser.close();
process.exit(failed.length ? 1 : 0);
