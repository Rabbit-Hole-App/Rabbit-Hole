// WP6 compact Study header and PDF row (owner brief 2026-10-24, C:/s/spec/focus-study/wp6-brief.md), against the LOCAL keyless
// stack only (fresh browser profile, local D1). A 3-page PDF context document with a long name (pages 1 and 3 have text, page 2
// is a drawing only, a scanned page) is pinned from its card's own menu.
// Fixed layout: viewport 1800 x 1000, the right panel open; desktop Study width is the divider at 40 (its default), narrow is the
// divider at 25 (Home; under the 400 px fold, the pane width is logged). Chrome is measured from the top of the pinned-reference pane
// ([data-study-pane]) to the top of the first PDF page (the page canvas, its scroller at the top); the PDF viewport is the
// page scroller's height. Both, with the pane's size, go to <shots>/study-chrome.json, and the pane's screenshot at each width
// to <shots>/study-chrome-desktop.png and study-chrome-narrow.png.
// STUDY_CHROME_MEASURE_ONLY=1 (the coordinator's run on the base commit, for the before numbers): steps 1 and 2 only, the numbers
// logged and written, no assertion of the 80-88 px target or of the new controls (the base commit has neither).
// No model is called: every model-capable non-GET route is aborted and counted (none may happen). Owner rule 2026-10-21: Claude
// does not run browser checks; CI runs this one (runner fork).
// Prints `ok <label>` per step, ids, sizes and counts only (no cookies, no secrets), then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [STUDY_CHROME_MEASURE_ONLY=1] node e2e/study-compact-header-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chatRouteAnswer } from './dev-cp.mjs';

const MEASURE_ONLY = process.env.STUDY_CHROME_MEASURE_ONLY === '1';
const total = MEASURE_ONLY ? 2 : 10; // the number of check() steps that run below; keep it equal
const TARGET = [80, 88];
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('study-compact-header-check runs against the local stack only');
// In CI the shots go beside the run's logs (run-part.sh passes <out>/<check>-shots), which the job uploads.
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../study-compact-header-shots` : 'study-compact-header-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `compact-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...init.headers } })).json();

// ---------------------------------------------------------------- the PDF: text, a drawing only (no text layer words), text
function makePdf() {
  const pages = ['BT /F1 28 Tf 60 700 Td (Compact study page one. The moon pulls the near ocean.) Tj ET', '0.2 0.4 0.8 rg 72 200 468 400 re f', 'BT /F1 28 Tf 60 700 Td (Compact study page three.) Tj ET'];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  pages.forEach((stream, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const NAME = 'A long reading list file about tides, the moon and the near ocean bulge, chapter one, with every figure.pdf';
const catalog = await api('/api/apps');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Compact study ${run}` }) });
if (!/^canvas-[a-f0-9]{8}$/.test(canvas.name || '')) throw Error(`the canvas was not created: ${JSON.stringify(canvas).slice(0, 200)}`);
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([makePdf()], { type: 'application/pdf' }), NAME);
const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie } })).json()).document;
if (!/^ctx:[0-9a-f]{12}$/.test(doc?.id || '')) throw Error('the context document was not stored');
const KEY = `doc:${doc.id}`;
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const SEED = { strokes: [], shapes: [], links: [], groups: [], areas: [], exchanges: [], items: [], blocks: [{ id: 'compact-pdf', type: 'pdf', assetKey: KEY, label: NAME, dx: 0, dy: 0 }] };

// ---------------------------------------------------------------- routes
const model = [], errors = [];
let sourceGone = false; // the document's bytes route answers 404 (a revoked or deleted source)
let conflict = false; // a highlight save answers 409 (the document changed since it was selected)
let hold = null; // { promise }: the document's bytes GET waits (the reader is loading)
const DOC_PATH = `/api/learn/context/${encodeURIComponent(doc.id)}`;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (url.origin !== BASE) return route.abort();
  if (url.pathname === DOC_PATH && sourceGone && ['GET', 'HEAD'].includes(method)) return route.fulfill({ status: 404, json: { error: 'not found' } });
  if (url.pathname === DOC_PATH && hold && method === 'GET') await hold.promise;
  if (conflict && method === 'PUT' && url.pathname.startsWith('/api/learn/pdf-highlights/')) return route.fulfill({ status: 409, json: { error: 'This document changed.' } });
  if (url.pathname === '/api/learn/chat/route' && method === 'POST') { let body = {}; try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; } return route.fulfill({ json: chatRouteAnswer(body) }); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && MODEL.test(url.pathname)) { model.push(`${method} ${url.pathname}`); return route.abort(); }
  return route.fallback();
};

const VIEWPORT = { width: 1800, height: 1000 };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, SEED]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(typeof what === 'function' ? await what() : what); await page.waitForTimeout(100); } };
const pane = () => page.locator('[data-study-pane]');
const reader = () => pane().locator('section[aria-label="Paper reader"]');
const divider = () => page.getByRole('separator', { name: 'Resize pinned reference' });
const chips = () => page.locator('[data-chat-pane] [data-context-chip]').evaluateAll(items => items.map(item => item.getAttribute('data-ref-key')));
// The page is drawn: its canvas has a size and its text layer is finished (pdf.js appends .endOfContent, also on a page with no words).
const drawn = () => page.evaluate(() => {
  const s = document.querySelector('[data-study-pane] section[aria-label="Paper reader"]'), c = s?.querySelector('[aria-label="Paper PDF page"]'), l = s?.querySelector('[aria-label="Paper page text"]');
  return !!c && c.width > 0 && c.getBoundingClientRect().height > 0 && !!l?.querySelector('.endOfContent');
});
const setSplit = async value => {
  await divider().focus();
  await page.keyboard.press('Home');
  for (let at = 25; at < value; at += 5) await page.keyboard.press('ArrowRight');
  await until(async () => Number(await divider().getAttribute('aria-valuenow')) === value, `the divider is at ${value}`);
  await page.waitForTimeout(300); // the pane's ResizeObserver and the reader's own layout settle
};
// Chrome above the page: the pane's top to the page canvas's top, with the page scroller at its top; and the scroller's height.
const measure = async label => {
  const m = await page.evaluate(() => {
    const p = document.querySelector('[data-study-pane]'), c = p?.querySelector('section[aria-label="Paper reader"] [aria-label="Paper PDF page"]'), scroller = c?.closest('.overflow-auto');
    if (!p || !c || !scroller) return null;
    scroller.scrollTop = 0;
    const pr = p.getBoundingClientRect(), cr = c.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
    return { paneWidth: Math.round(pr.width), paneHeight: Math.round(pr.height), chrome: Math.round((cr.top - pr.top) * 10) / 10, pdfViewport: Math.round(sr.height), pageTop: Math.round(cr.top), paneTop: Math.round(pr.top) };
  });
  assert.ok(m, `${label}: no pane, page or page scroller`);
  m.split = Number(await divider().getAttribute('aria-valuenow'));
  console.log(`measure ${label}: viewport ${VIEWPORT.width}x${VIEWPORT.height} divider ${m.split} pane ${m.paneWidth}x${m.paneHeight} chrome ${m.chrome}px pdf viewport ${m.pdfViewport}px`);
  return m;
};
const measured = { mode: MEASURE_ONLY ? 'measure-only' : 'assert', sha: process.env.GITHUB_SHA || null, viewport: VIEWPORT, target: TARGET };
const save = () => writeFileSync(`${SHOTS}/study-chrome.json`, JSON.stringify(measured, null, 2));
const inTarget = (m, label) => assert.ok(m.chrome >= TARGET[0] && m.chrome <= TARGET[1], `${label}: ${m.chrome}px of chrome above the page, not within ${TARGET.join('-')} px`);
// The header row and the PDF row: every visible control, its box, whether its centre hits it (nothing covers it) and whether it
// lies inside the pane. A row is one line: every control inside the row's own box.
const rows = () => page.evaluate(() => {
  const p = document.querySelector('[data-study-pane]').getBoundingClientRect();
  const read = row => {
    if (!row) return null;
    const box = row.getBoundingClientRect();
    const controls = [...row.querySelectorAll('button, a[href]')].map(el => [el, el.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height > 0).map(([el, r]) => {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { name: (el.getAttribute('aria-label') || el.textContent).trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, reachable: !!hit && el.contains(hit),
        inside: r.left >= p.left - 0.5 && r.right <= p.right + 0.5, inRow: r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 };
    });
    return { height: Math.round(box.height), controls };
  };
  return { header: read(document.querySelector('[data-study-header]')), pdf: read(document.querySelector('[data-study-pane] section[aria-label="Paper reader"] > header')) };
});
const tidy = async (label, want, missing = []) => {
  const now = await rows();
  for (const [row, height] of [['header', 42], ['pdf', 40]]) {
    const r = now[row];
    assert.ok(r, `${label}: no ${row} row`);
    assert.ok(Math.abs(r.height - height) <= 1, `${label}: the ${row} row is ${r.height}px, not ${height}`);
    for (const c of r.controls) assert.ok(c.reachable && c.inside && c.inRow, `${label}: ${c.name} ${JSON.stringify(c)}`);
    for (let i = 0; i < r.controls.length; i++) for (let j = i + 1; j < r.controls.length; j++) {
      const a = r.controls[i], b = r.controls[j];
      const over = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      assert.ok(!over, `${label}: ${a.name} overlaps ${b.name}`);
    }
  }
  const names = [...now.header.controls, ...now.pdf.controls].map(c => c.name);
  for (const name of want) assert.ok(names.includes(name), `${label}: ${name} is in the rows (${names.join(', ')})`);
  for (const name of missing) assert.ok(!names.includes(name), `${label}: ${name} is folded away`);
  return now;
};
const ALWAYS = ['Add to chat', 'Reference options', 'Previous paper page', 'Next paper page', 'Zoom out paper', 'Zoom in paper'];
const openOptions = async () => {
  await page.locator('[data-study-options]').click();
  const dialog = page.getByRole('dialog', { name: 'Reference options' });
  await dialog.waitFor({ timeout: 5000 });
  return dialog;
};
const pageCount = () => reader().locator('[data-pdf-page-count]').innerText();
// Select page 1's sentence (a DOM range and the pointer-up a drag ends with): the reader's selection toolbar evaluates it.
const selectSentence = () => until(() => page.evaluate(() => {
  const layer = document.querySelector('[data-study-pane] section[aria-label="Paper reader"] [aria-label="Paper page text"]');
  const node = [...layer.querySelectorAll('span')].map(s => s.firstChild).find(t => t?.nodeType === 3 && t.data.includes('moon'));
  if (!node) return false;
  const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, node.data.length);
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const r = range.getBoundingClientRect(), init = { bubbles: true, cancelable: true, button: 0, clientX: r.right - 1, clientY: r.top + r.height / 2 };
  node.parentElement.dispatchEvent(new PointerEvent('pointerup', init)); node.parentElement.dispatchEvent(new MouseEvent('mouseup', init));
  return true;
}), 'the page text is selectable', 10000);
const turnTo = async n => {
  for (let i = 0; i < 4 && !(await pageCount()).startsWith(`${n} /`); i++) {
    const now = Number((await pageCount()).split(' ')[0]);
    await reader().getByRole('button', { name: now < n ? 'Next paper page' : 'Previous paper page', exact: true }).click();
    await until(async () => (await pageCount()).startsWith(`${now < n ? now + 1 : now - 1} /`), 'the page turned');
  }
  await until(drawn, `page ${n} is drawn`);
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
await page.locator('[data-block-id="compact-pdf"]').first().waitFor({ timeout: 30000 });
// Pin the PDF card from its own menu (Pin for study), which opens the reader in the pane.
await page.locator('[data-block-id="compact-pdf"] [data-drag-zone]').last().click({ button: 'right', position: { x: 30, y: 10 } });
await page.locator('[data-canvas-menu]').waitFor();
await page.locator('[data-canvas-menu] [data-menu-pin-study]').click();
await pane().waitFor({ timeout: 30000 });
await until(drawn, 'the pinned PDF is drawn', 30000);

await check(`1 desktop Study width (divider 40): chrome above the first page within ${TARGET.join('-')} px, the PDF viewport measured; one header row and one PDF row, every control reachable, none overlapping`, async () => {
  await setSplit(40);
  const m = measured.desktop = await measure('desktop');
  save();
  await pane().screenshot({ path: `${SHOTS}/study-chrome-desktop.png` });
  if (MEASURE_ONLY) return;
  inTarget(m, 'desktop');
  await tidy('desktop', [...ALWAYS, 'Rotate page', 'Select region', 'Open original PDF'], ['More PDF tools']);
  const title = await page.locator('[data-study-title]').evaluate(el => ({ text: el.textContent, title: el.title, cut: el.scrollWidth > el.clientWidth, overflow: getComputedStyle(el).textOverflow }));
  assert.deepEqual([title.text, title.title], [NAME, NAME], 'the full name is the text and the tooltip');
  assert.ok(title.cut && title.overflow === 'ellipsis', `the long name is one line, cut with an ellipsis: ${JSON.stringify(title)}`);
  assert.equal(await pane().getByText('Pinned reference', { exact: true }).count(), 0, 'no Pinned reference row');
  assert.equal(await pane().getAttribute('aria-label'), 'Pinned reference', 'the pane keeps its name');
});

await check(`2 narrow Study width (divider 25): chrome within ${TARGET.join('-')} px; Rotate page and Open original PDF fold into More PDF tools; pages, zoom and Reference options stay in the row`, async () => {
  await setSplit(25);
  const m = measured.narrow = await measure('narrow');
  save();
  await pane().screenshot({ path: `${SHOTS}/study-chrome-narrow.png` });
  if (MEASURE_ONLY) return;
  inTarget(m, 'narrow');
  assert.ok(m.paneWidth < 400, `the narrow pane is under the 400 px fold (${m.paneWidth})`);
  await tidy('narrow', [...ALWAYS, 'More PDF tools'], ['Rotate page', 'Open original PDF', 'Select region']);
  assert.ok(m.pdfViewport >= measured.desktop.pdfViewport - 1, 'no row came back at the narrow width');
});

if (!MEASURE_ONLY) {
  await check('3 Reference options hold Change reference, Locate on canvas, Unpin and the details (full name, PDF, Your upload, Version verification unavailable); Escape closes and returns the focus; keyboard opens on its first row', async () => {
    await setSplit(40);
    let dialog = await openOptions();
    for (const name of ['Change reference', 'Locate on canvas', 'Unpin']) assert.ok(await dialog.getByRole('button', { name, exact: true }).isEnabled(), `${name} is in the options and enabled`);
    const details = dialog.getByRole('group', { name: 'Source details' });
    const text = (await details.innerText()).replace(/\s+/g, ' ');
    for (const part of [NAME, 'PDF', 'Your upload', 'Version verification unavailable']) assert.ok(text.includes(part), `the details say ${part}: ${text}`);
    assert.equal(await page.locator('[data-study-pane] [data-study-version]').count(), 0, 'the version is no permanent row in the pane');
    await page.screenshot({ path: `${SHOTS}/3-reference-options.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-study-options')), true, 'Escape returns the focus to Reference options');
    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog', { name: 'Reference options' });
    await dialog.waitFor({ timeout: 5000 });
    await until(() => page.evaluate(() => document.activeElement?.hasAttribute('data-study-change')), 'the keyboard lands on Change reference');
    // Change reference from the options shows the chooser; again hides it, the pin unchanged.
    await page.keyboard.press('Enter');
    await page.locator('[data-study-choose]').waitFor({ timeout: 5000 });
    dialog = await openOptions();
    await dialog.getByRole('button', { name: 'Change reference', exact: true }).click();
    await page.locator('[data-study-choose]').waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await pane().getAttribute('data-pin'), 'compact-pdf');
    await until(drawn, 'the reader is back');
  });

  await check('4 a scanned page (narrow): no banner; Select region stays in the row with an information button that opens and closes by click and by keyboard; chrome stays in the target', async () => {
    await setSplit(25);
    await turnTo(2);
    const info = reader().locator('[data-pdf-no-text]');
    await info.waitFor({ timeout: 10000 });
    assert.equal(await pane().getByText('This page has no selectable text', { exact: false }).count(), 0, 'no permanent banner or sentence');
    const select = reader().getByRole('button', { name: 'Select region', exact: true });
    assert.ok(await select.isVisible() && await select.isEnabled(), 'Select region is offered in the row');
    await tidy('scanned narrow', [...ALWAYS, 'Select region', 'About this page', 'More PDF tools']);
    inTarget(measured.scanned = await measure('scanned narrow'), 'scanned narrow');
    save();
    await info.click();
    const note = reader().locator('[data-pdf-no-text-info]');
    await note.waitFor({ timeout: 3000 });
    assert.match(await note.innerText(), /no selectable text[^]*Select region/);
    assert.equal(await info.getAttribute('aria-expanded'), 'true');
    await pane().screenshot({ path: `${SHOTS}/4-scanned-info.png` });
    await info.click();
    await note.waitFor({ state: 'detached', timeout: 3000 });
    await info.focus();
    await page.keyboard.press('Enter');
    await note.waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await note.waitFor({ state: 'detached', timeout: 3000 });
    await page.keyboard.press('Space');
    await note.waitFor({ timeout: 3000 });
    await page.keyboard.press('Space');
    await note.waitFor({ state: 'detached', timeout: 3000 });
    await select.click();
    await reader().locator('[data-pdf-region-mode]').waitFor({ timeout: 5000 });
    await select.click();
    await reader().locator('[data-pdf-region-mode]').waitFor({ state: 'detached', timeout: 5000 });
  });

  await check('5 narrow, a text page: More PDF tools lists Rotate page, Select region and Open original PDF; Rotate page from it turns the page', async () => {
    await turnTo(3);
    await reader().locator('[data-pdf-more]').click();
    const menu = page.getByRole('menu', { name: 'More PDF tools' });
    await menu.waitFor({ timeout: 5000 });
    const items = (await menu.getByRole('menuitem').allInnerTexts()).map(s => s.trim());
    assert.deepEqual(items, ['Rotate page', 'Select region', 'Open original PDF']);
    const turn = () => reader().locator('[aria-label="Paper page text"]').evaluate(el => Number(el.dataset.mainRotation ?? -1));
    const before = await turn();
    await menu.getByRole('menuitem', { name: 'Rotate page', exact: true }).click();
    await until(async () => (await turn()) === (before + 90) % 360 && await drawn(), 'Rotate page from the menu turned the page');
    for (let i = 0; i < 3; i++) {
      await reader().locator('[data-pdf-more]').click();
      await page.getByRole('menu', { name: 'More PDF tools' }).getByRole('menuitem', { name: 'Rotate page', exact: true }).click();
      await until(drawn, 'the turn is drawn');
    }
    await until(async () => (await turn()) === before, 'back to the first turn');
  });

  await check('6 page, zoom and rotation survive the layout changes (divider narrow, wide, desktop; the options opened); the reader is never remounted', async () => {
    await setSplit(40);
    await page.evaluate(() => { const s = document.querySelector('[data-study-pane] section[aria-label="Paper reader"]'); s.setAttribute('data-wp6-mark', 'kept'); s.__wp6 = 'kept'; s.querySelector('[aria-label="Paper PDF page"]').__wp6 = 'kept'; });
    await reader().getByRole('button', { name: 'Zoom in paper', exact: true }).click();
    await reader().getByRole('button', { name: 'Rotate page', exact: true }).click();
    const state = () => page.evaluate(() => {
      const s = document.querySelector('[data-study-pane] section[aria-label="Paper reader"]');
      return { mark: s?.getAttribute('data-wp6-mark') ?? null, same: s?.__wp6 === 'kept', canvas: s?.querySelector('[aria-label="Paper PDF page"]')?.__wp6 === 'kept',
        count: s?.querySelector('[data-pdf-page-count]')?.textContent, zoom: s?.querySelector('[aria-label="Paper zoom"]')?.textContent, turn: Number(s?.querySelector('[aria-label="Paper page text"]')?.dataset.mainRotation ?? -1) };
    });
    await until(async () => { const s = await state(); return s.zoom === '125%' && s.turn === 90 && await drawn(); }, async () => `the page is not drawn zoomed and turned: ${JSON.stringify(await state())}`);
    const before = await state();
    assert.deepEqual([before.count, before.zoom, before.turn], ['3 / 3', '125%', 90], `the reader is set: ${JSON.stringify(before)}`);
    for (const split of [25, 65, 40]) {
      await setSplit(split);
      assert.deepEqual(await state(), before, `divider ${split}: the same reader, page, zoom and turn`);
    }
    await openOptions();
    await page.keyboard.press('Escape');
    assert.deepEqual(await state(), before, 'after Reference options');
    await reader().getByRole('button', { name: 'Zoom out paper', exact: true }).click();
    for (let i = 0; i < 3; i++) { await reader().getByRole('button', { name: 'Rotate page', exact: true }).click(); await until(drawn, 'the turn is drawn'); }
  });

  await check('7 Add to chat attaches the pinned reference at the reader\'s page with nothing selected, and the selected excerpt when text is selected', async () => {
    await turnTo(1);
    const baseline = await chips();
    await page.locator('[data-study-attach]').click();
    await until(async () => (await chips()).includes(`${KEY}|${JSON.stringify({ page: 1 })}`), async () => `no page chip: ${JSON.stringify(await chips())}`, 8000);
    const afterPage = await chips();
    // Select the words on page 1 (a DOM range and the pointer-up a drag ends with), then the header's Add to chat.
    await selectSentence();
    await page.locator('[data-pdf-selection-toolbar]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-study-attach]').click();
    await until(async () => (await chips()).some(key => String(key).startsWith('excerpt:')), async () => `no excerpt chip: ${JSON.stringify(await chips())}`, 8000);
    const added = (await chips()).filter(key => !afterPage.includes(key));
    assert.ok(added.length === 1 && added[0].startsWith('excerpt:'), `one excerpt chip, no second page chip: ${JSON.stringify(added)}`);
    assert.ok(baseline.length < afterPage.length, 'the first press added the page chip');
    await page.evaluate(() => getSelection().removeAllRanges());
  });

  await check('8 failures stay in view outside the options: a refused attachment (Reference unavailable) and a changed-document highlight notice', async () => {
    const outside = selector => page.locator(selector).first().evaluate(el => ({ visible: el.getBoundingClientRect().height > 0, inPane: !!el.closest('[data-study-pane]'), inMenu: !!el.closest('[role="dialog"], [role="menu"]') }));
    sourceGone = true;
    await page.locator('[data-study-attach]').click();
    await page.locator('[data-study-attach-refused]').waitFor({ timeout: 8000 });
    assert.deepEqual(await outside('[data-study-attach-refused]'), { visible: true, inPane: true, inMenu: false });
    assert.equal((await page.locator('[data-study-attach-refused]').innerText()).trim(), 'Reference unavailable');
    sourceGone = false;
    conflict = true;
    await selectSentence();
    await page.locator('[data-pdf-selection-toolbar]').getByRole('button', { name: 'Highlight', exact: true }).click();
    await page.locator('[data-study-pane] [data-pdf-notice]').getByText('This document changed', { exact: false }).waitFor({ timeout: 8000 });
    assert.deepEqual(await outside('[data-study-pane] [data-pdf-notice]'), { visible: true, inPane: true, inMenu: false });
    await pane().screenshot({ path: `${SHOTS}/8-failures.png` });
    conflict = false;
    await page.locator('[data-study-pane] [data-pdf-notice]').getByRole('button', { name: 'Dismiss', exact: true }).click();
  });

  await check('9 loading keeps the one header row; an unreadable source shows Reference unavailable with Choose another reference and Unpin in the pane, not in the options', async () => {
    let release;
    hold = { promise: new Promise(resolve => { release = resolve; }) };
    await page.reload();
    await page.locator('[data-study-header] [data-study-title]').waitFor({ timeout: 60000 });
    await pane().getByText(/^Opening /).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('[data-study-header] [data-study-title]').innerText(), NAME);
    assert.ok(Math.abs((await rows()).header.height - 42) <= 1, 'the header is one row while loading');
    release();
    hold = null;
    await until(drawn, 'the reader drew the page after loading', 30000);
    sourceGone = true;
    await page.reload();
    const gone = page.locator('[data-study-unavailable]');
    await gone.getByText('Reference unavailable', { exact: true }).waitFor({ timeout: 60000 });
    for (const name of ['Choose another reference', 'Unpin']) assert.ok(await gone.getByRole('button', { name, exact: true }).isVisible(), `${name} is in view`);
    assert.equal(await gone.evaluate(el => !!el.closest('[role="dialog"], [role="menu"]')), false, 'not inside the options');
    assert.ok(await page.locator('[data-study-options]').isVisible(), 'Reference options stay in the header');
    await pane().screenshot({ path: `${SHOTS}/9-unavailable.png` });
    sourceGone = false;
    await page.reload();
    await until(drawn, 'the reader is back once the source is readable', 60000);
  });

  await check('10 no model-capable request, no page error', async () => {
    assert.deepEqual(model, [], `model-capable routes: ${model.join(', ')}`);
    assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
  });
}

save();
await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
