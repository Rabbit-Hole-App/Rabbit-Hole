// Focus adapters for PDF, explanation, table, note, image, page and video (docs/features/focus-study.md section 5; owner brief
// C:/s/spec/focus-study/brief.md 3.2 to 3.4 and 6.2), against the LOCAL keyless stack only (fresh browser profile, local D1).
// For each supported kind: the selected card shows its labelled Focus control; entering fills the working pane in place
// (the card's own element, data-focus-host) and Back to canvas puts the card, the camera and the saved geometry back. The PDF
// (a paper card, pdf.js) fits its page to the reader's width, is not shrunk to fit vertically and keeps its page; the image
// keeps its aspect ratio, uncropped; the explanation and the note read in a capped column that scrolls inside. An unsupported
// kind (a quiz) shows no Focus control; a CAD card shows Focus CAD model (its 3D tools under Focus: focus-cad-check.mjs). No model is called: every model-capable non-GET route is aborted and counted (none may happen); board saves
// (PUT /api/learn/boards/...) are counted and entering or leaving Focus may make none. Owner rule 2026-10-21: Claude does not
// run browser checks; CI runs this one.
// Prints `ok <label>` per step, ids and counts only (no cookies, no secrets), then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/focus-adapters-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const total = 9; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('focus-adapters-check runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../focus-adapters-shots` : 'focus-adapters-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `focus-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

// A two-page PDF with text, 300 x 200 pt pages (aspect 1.5), served for the paper card.
function twoPagePdf() {
  const NL = String.fromCharCode(10);
  const page = words => { const stream = `BT /F1 14 Tf 20 150 Td (${words}) Tj ET`; return `<< /Length ${stream.length} >>${NL}stream${NL}${stream}${NL}endstream`; };
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>', page('First page of the paper'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>', page('Second page of the paper'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = `%PDF-1.4${NL}`;
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj${NL}${body}${NL}endobj${NL}`; return at; });
  const xref = out.length;
  out += `xref${NL}0 ${objects.length + 1}${NL}0000000000 65535 f ${NL}${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n ${NL}`).join('')}trailer${NL}<< /Size ${objects.length + 1} /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`;
  return Buffer.from(out, 'latin1');
}
const PDF = twoPagePdf();
// A 320 x 180 picture (16:9) as a data URL: no request.
const PICTURE = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#2383e2"/><circle cx="160" cy="90" r="60" fill="#ffffff"/></svg>').toString('base64')}`;
const LONG = Array.from({ length: 40 }, (_, n) => `Paragraph ${n + 1}: the moon pulls the near ocean more than the Earth, so the water bulges toward it.`).join('\n\n');
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Adapters check ${run}` }) });
const BLOCKS = [
  { id: 'p1', type: 'paper', dx: 0, dy: 0, title: 'Focus paper', paper: { id: `upload:focus-${run}`, title: 'Focus paper', page: 1 } },
  { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: LONG },
  { id: 'tb', type: 'table', dx: 0, dy: 0, title: 'Tides', columns: ['Place', 'High', 'Low'], rows: [['Dover', '6.1 m', '0.8 m'], ['Brest', '7.0 m', '1.2 m']] },
  { id: 'im', type: 'image', dx: 0, dy: 0, mode: 'search', title: 'A blue square', src: PICTURE, alt: 'A white circle on blue', caption: 'A test picture.' },
  { id: 'sl', type: 'slide', dx: 0, dy: 0, number: 1, label: 'deck.pdf', assetKey: `missing-slide-${run}` },
  { id: 'vd', type: 'video', dx: 0, dy: 0, mode: 'generate', title: 'Motion clip', src: '', status: 'idle', caption: 'Not generated.',
    operation: { op: 'generate_video', id: 'focus-clip', prompt: 'A prism', purpose: 'physical_process', duration: 4, aspectRatio: '16:9' } },
  { id: 'cad', type: 'cad', dx: 0, dy: 0, jobId: 'job-focus', modelId: 'm', revisionId: null, status: 'failed', title: 'Failed plate', units: 'mm', w: 460, h: 300, briefSummary: 'Fixture.' },
  { id: 'qz', type: 'quiz', dx: 0, dy: 0, question: 'How many tidal bulges?', options: [{ key: 'A', text: 'Two', correct: true }, { key: 'B', text: 'One' }], why: 'One faces the moon.' },
];
const ITEMS = [{ id: 'st1', kind: 'sticky', x: 1060, y: 140, w: 240, text: LONG, color: 'yellow' }];
const STATE = { strokes: [], shapes: [], items: ITEMS, links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const model = [], saves = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course|video|cad))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  if (url.pathname === '/api/learn/paper') return route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /^\/api\/learn\/boards\/[^/]+\/[^/]+$/.test(url.pathname)) saves.push(url.pathname);
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, seed]) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed)); } catch { /* a sandboxed frame */ } }, [INK, STATE]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); await back().catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });
const NOTES = new Set(ITEMS.map(item => item.id));
const card = id => (NOTES.has(id) ? `[data-item-id="${id}"]` : `[data-block-id="${id}"]`);
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const rect = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const geometry = () => page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key) || '{}'); return JSON.stringify([(board.blocks || []).map(b => [b.id, b.dx, b.dy, b.w, b.h, b.cardLayout || null]), (board.items || []).map(i => [i.id, i.x, i.y, i.w, i.h])]); }, INK);
// Board saves settle after the seeded board's first sync; then entering or leaving Focus may add none.
const settle = async () => { let last = -1, still = 0; while (still < 30) { if (saves.length === last) still++; else { last = saves.length; still = 0; } await page.waitForTimeout(100); } };
const quiet = async (label, before) => { await page.waitForTimeout(2000); assert.deepEqual([model.length, saves.length], before, `${label}: model ${model.join()} saves ${saves.slice(before[1]).join()}`); };
const counts = () => [model.length, saves.length];
const focused = id => page.evaluate(sel => document.querySelector(sel)?.hasAttribute('data-focus-host') ?? null, card(id));
// Canvas objects are pressed with the mouse at a point that hits them (never locator.click, whose scroll-into-view slides the
// clipped canvas surface). An object off screen is first brought into view by reveal() below.
const visiblePart = selector => page.evaluate(sel => {
  const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect();
  if (!r || !f) return null;
  const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
  return right - left > 8 && bottom - top > 8 ? { left, right, top, bottom } : null;
}, selector);
// An object off screen is brought to the middle of the canvas by the wheel over an empty point of it (a plain wheel pans the
// board at the learner's zoom). Not View > Fit canvas: this board's long note fits only at about 27 %, where a 24 px strip is
// under the 8 px visiblePart needs (CI a000ac08 steps 3 to 7).
const reveal = async selector => {
  for (let i = 0; i < 5 && !(await visiblePart(selector)); i++) {
    const move = await page.evaluate(sel => {
      const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[data-canvas-surface]')?.getBoundingClientRect();
      if (!r || !f) return null;
      for (let gy = 2; gy < 18; gy++) for (let gx = 2; gx < 18; gx++) {
        const x = f.left + f.width * gx / 20, y = f.top + f.height * gy / 20, hit = document.elementFromPoint(x, y);
        if (hit?.closest('[data-canvas-surface]') && !hit.closest('[data-block-id],[data-item-id],[data-scroll],[data-canvas-bottom] *,button,a,input,textarea,[role="toolbar"],[role="menu"],[data-zoom],[data-canvas-minimap]'))
          return { x, y, dx: Math.round(r.left + r.width / 2 - (f.left + f.width / 2)), dy: Math.round(r.top + Math.min(r.height, 24) / 2 - (f.top + f.height / 2)) };
      }
      return null;
    }, selector);
    assert.ok(move, `${selector}: no empty point of the canvas to pan from`);
    await page.mouse.move(move.x, move.y);
    await page.mouse.wheel(move.dx, move.dy);
    await page.waitForTimeout(200);
  }
};
// Selects a card by its drag strip (the 24 px grip at its top) and a note by its middle, the presses a learner makes.
const select = async id => {
  const target = NOTES.has(id) ? card(id) : `${card(id)} [data-drag-handle]`;
  let at = await visiblePart(target);
  if (!at) { await reveal(target); at = await visiblePart(target); }
  assert.ok(at, `${id} is on screen`);
  await page.mouse.click((at.left + at.right) / 2, (at.top + at.bottom) / 2);
  if (!NOTES.has(id)) await until(async () => (await page.getAttribute(card(id), 'aria-current')) === 'true', `${id} is selected`);
};
const focusButton = name => page.getByRole('button', { name, exact: true });
// A control on or over the canvas is pressed with the mouse at its centre, after checking that the centre hits it (never
// locator.click, whose scroll-into-view would slide the clipped surface under the camera).
const tap = async (locator, what) => {
  await locator.waitFor({ timeout: 5000 });
  const at = await locator.boundingBox();
  assert.ok(at, `${what} has a box`);
  const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];
  const hit = await locator.evaluate((node, [px, py]) => { const top = document.elementFromPoint(px, py); return !!top && (node === top || node.contains(top)) ? null : (top ? `${top.tagName} ${[...top.attributes].map(a => a.name).filter(n => n.startsWith('data-')).join(' ')}` : 'nothing'); }, [x, y]);
  assert.equal(hit, null, `${what} is covered at (${Math.round(x)}, ${Math.round(y)}) by ${hit}`);
  await page.mouse.click(x, y);
};
const back = async () => { if (await page.locator('[data-focus-host]').count()) { await tap(page.getByRole('button', { name: 'Back to canvas', exact: true }), 'Back to canvas'); await until(async () => !(await page.locator('[data-focus-host]').count()), 'Focus ended'); } };
// The focused card lies inside the canvas surface (the working pane) and is clearly larger than before (a long note, taller
// than the pane on the canvas, is compared by its width).
const inPane = async (id, before, label, by = 'area') => {
  const [box, pane] = [await rect(card(id)), await rect('[data-canvas-surface]')];
  assert.ok(box.left >= pane.left - 1 && box.top >= pane.top - 1 && box.right <= pane.right + 1 && box.bottom <= pane.bottom + 1, `${label}: the card ${JSON.stringify(box)} lies in the pane ${JSON.stringify(pane)}`);
  assert.ok(by === 'width' ? box.width > before.width * 1.5 : box.width * box.height > before.width * before.height * 1.2, `${label}: the card grew (${Math.round(before.width)}x${Math.round(before.height)} -> ${Math.round(box.width)}x${Math.round(box.height)})`);
  return box;
};
// Enter Focus with the card's own control, run `during`, leave with Back to canvas: the same element, its box, the camera and
// the saved geometry come back, and neither step saved the board or called a model.
const roundTrip = async (id, name, during) => {
  await select(id);
  await settle();
  const element = await page.evaluate(sel => { const node = document.querySelector(sel); node.__focusMark = 'kept'; return !!node; }, card(id));
  assert.ok(element, `${id} is on the canvas`);
  const [before, geo, prior] = [await rect(card(id)), await geometry(), counts()];
  await tap(focusButton(name), name);
  await until(async () => (await focused(id)) === true, `${name} focused ${id}`);
  await page.waitForTimeout(300);
  await during(before);
  await shot(`${id}-focused`);
  await back();
  await page.waitForTimeout(300);
  const after = await rect(card(id));
  for (const key of ['left', 'top', 'width', 'height']) assert.ok(Math.abs(after[key] - before[key]) <= 2, `${id}: ${key} back to ${Math.round(before[key])} (now ${Math.round(after[key])})`);
  assert.equal(await page.evaluate(sel => document.querySelector(sel)?.__focusMark, card(id)), 'kept', `${id}: the same element throughout (never remounted)`);
  assert.equal(await geometry(), geo, `${id}: the saved geometry is unchanged`);
  await quiet(`${id} Focus and Back to canvas`, prior);
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator(card('p1')).waitFor({ timeout: 60000 });
await page.locator(`${card('p1')} canvas[aria-label="Paper PDF page"]`).waitFor({ timeout: 30000 });
await settle();

await check('1 Each supported kind, selected, shows its own labelled Focus control (a CAD card too, container Focus); a quiz shows none', async () => {
  for (const [id, name] of [['p1', 'Focus PDF'], ['ex', 'Focus explanation'], ['tb', 'Focus table'], ['st1', 'Focus note'], ['im', 'Focus image'], ['sl', 'Focus page'], ['vd', 'Focus video'], ['cad', 'Focus CAD model']]) {
    await select(id);
    await focusButton(name).waitFor({ timeout: 5000 });
    assert.ok(await focusButton(name).isVisible(), `${id}: ${name}`);
    // Scoped to the selection actions: the canvas header's board-name button (this board is named Focus adapters <run>) is no Focus control.
    const names = await page.locator('[data-selection-bar]').getByRole('button', { name: /^Focus / }).evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => node.getAttribute('aria-label') || node.textContent.trim()));
    assert.deepEqual([...new Set(names)], [name], `${id}: only its own Focus control (${names.join(', ')})`);
  }
  for (const id of ['qz']) {
    await select(id);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-selection-bar]').getByRole('button', { name: /^Focus / }).count(), 0, `no Focus control on ${id}`);
  }
});

await check('2 PDF: the paper turned to page 2 first (an edit, saved), then Focus PDF fits that page to the reader width, unshrunk, with its page and zoom controls', async () => {
  await select('p1');
  await tap(page.locator(card('p1')).getByRole('button', { name: 'Next paper page', exact: true }), 'Next paper page');
  await until(async () => (await page.locator(card('p1')).innerText()).includes('page 2 of 2'), 'the paper is on page 2');
  await roundTrip('p1', 'Focus PDF', async before => {
    await inPane('p1', before, 'PDF');
    const fit = await page.evaluate(sel => {
      const sheet = document.querySelector(`${sel} canvas[aria-label="Paper PDF page"]`), scroller = sheet.parentElement.parentElement;
      const r = sheet.getBoundingClientRect();
      return { page: r.width, height: r.height, reader: scroller.getBoundingClientRect().width, inner: scroller.clientWidth, css: sheet.clientWidth };
    }, card('p1'));
    assert.ok(Math.abs(fit.css - fit.inner) <= 2, `the page is the reader's width (${fit.css} of ${fit.inner})`);
    assert.ok(Math.abs(fit.height * 1.5 - fit.page) <= fit.page * 0.02, `the page keeps its 1.5 aspect, sized by width, not shrunk to the height (${Math.round(fit.page)}x${Math.round(fit.height)})`);
    const text = await page.locator(card('p1')).innerText();
    assert.ok(text.includes('page 2 of 2'), 'still page 2 while focused');
    for (const control of ['Previous paper page', 'Next paper page', 'Zoom out paper', 'Zoom in paper']) assert.ok(await page.locator(card('p1')).getByRole('button', { name: control, exact: true }).isVisible(), control);
    assert.equal(await page.locator(card('p1')).getByLabel('Paper zoom').innerText(), '100%');
  });
  assert.ok((await page.locator(card('p1')).innerText()).includes('page 2 of 2'), 'page 2 after Back to canvas');
});

await check('3 Image: Focus image shows the whole picture at its own aspect ratio, uncropped, larger than before', async () => {
  await roundTrip('im', 'Focus image', async before => {
    await inPane('im', before, 'image');
    const picture = await page.evaluate(sel => { const img = [...document.querySelectorAll(`${sel} img`)].find(node => !node.closest('[data-photo-result]')); const r = img.getBoundingClientRect(), host = img.closest('[data-block-id]').getBoundingClientRect(); return { w: r.width, h: r.height, natural: img.naturalWidth / img.naturalHeight, inside: r.left >= host.left - 1 && r.right <= host.right + 1 && r.top >= host.top - 1 && r.bottom <= host.bottom + 1 }; }, card('im'));
    assert.ok(Math.abs(picture.w / picture.h - picture.natural) <= picture.natural * 0.01, `aspect ${picture.w / picture.h} against ${picture.natural}`);
    assert.ok(picture.inside, 'the whole picture is inside the card');
    const pane = await rect('[data-canvas-surface]'), box = await rect(card('im'));
    assert.ok(box.width >= pane.width * 0.3 || box.height >= pane.height * 0.6, 'the picture takes the pane in one direction');
  });
});

await check('4 Explanation: Focus explanation reads in a column at most 760 px wide that scrolls inside the card', async () => {
  await roundTrip('ex', 'Focus explanation', async before => {
    const box = await inPane('ex', before, 'explanation');
    assert.ok(box.width <= 762, `a readable column (${Math.round(box.width)} px)`);
    const scroll = await page.evaluate(sel => { const body = document.querySelector(`${sel} > [data-scroll]`); return { scrolls: body.scrollHeight > body.clientHeight + 1, overflow: getComputedStyle(body).overflowY, size: getComputedStyle(body.querySelector('p') || body).fontSize }; }, card('ex'));
    assert.ok(scroll.scrolls && ['auto', 'scroll'].includes(scroll.overflow), `the long body scrolls inside (${JSON.stringify(scroll)})`);
  });
});

await check('5 Table: Focus table fills the pane and Back to canvas restores it', async () => {
  await roundTrip('tb', 'Focus table', async before => { await inPane('tb', before, 'table'); });
});

await check('6 Page (a PDF page as a slide): Focus page enters and leaves in place', async () => {
  await roundTrip('sl', 'Focus page', async before => { await inPane('sl', before, 'page'); });
});

await check('7 Video: Focus video enters and leaves in place; Generate is never pressed', async () => {
  await roundTrip('vd', 'Focus video', async before => { await inPane('vd', before, 'video'); });
});

await check('8 Note: Focus note reads the sticky note at its own text size in a column at most 760 px wide, scrolling inside', async () => {
  await roundTrip('st1', 'Focus note', async before => {
    const box = await inPane('st1', before, 'note', 'width');
    assert.ok(box.width <= 762, `a readable column (${Math.round(box.width)} px)`);
    const note = await page.evaluate(sel => { const node = document.querySelector(sel); return { scrolls: node.scrollHeight > node.clientHeight + 1, overflow: getComputedStyle(node).overflowY }; }, card('st1'));
    assert.ok(note.scrolls && ['auto', 'scroll'].includes(note.overflow), `the long note scrolls inside (${JSON.stringify(note)})`);
  });
});

await check('9 No model call at any point, no page error', async () => {
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
