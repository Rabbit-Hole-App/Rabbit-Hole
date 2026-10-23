// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md "Preservation rules the checks assert"), against the
// LOCAL keyless stack only (fresh browser profile, local D1). The notebook card's site is a stub served here for the notebook
// origin: a page that counts its loads, holds an unsaved textarea and a ticking counter, and answers rh-notebook/1 init with
// loaded. A reload of the iframe would reset all three, so they prove the frame never moved to another parent.
// No model is called: every model-capable non-GET route is aborted and counted (none may happen); board saves are counted and a
// layout action may make none. Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one (runner fork).
// Prints `ok <label>` per step, ids and counts only (no cookies, no secrets), then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/pinned-study-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { closeMenus, menubar, openMenu } from './canvas-menu-helpers.mjs';

const total = 16; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('pinned-study-check runs against the local stack only');
// In CI the shots go beside the run's logs (PERSIST is <out>/stack/local there), which the job uploads.
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../pinned-study-shots` : 'pinned-study-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pinned-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const LONG = Array.from({ length: 60 }, (_, n) => `Line ${n + 1}: the moon pulls the near ocean more than the Earth.`).join('\n');
const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, cells: [{ id: 'a', cell_type: 'code', source: 'x = 1', metadata: {}, execution_count: null, outputs: [] }] } };
// One PDF context document and its card, for the Context reader's Pin for study (step 8b).
function onePagePdf() {
  const NL = String.fromCharCode(10), stream = 'BT /F1 48 Tf 60 400 Td (Pinned page) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', `<< /Length ${stream.length} >>${NL}stream${NL}${stream}${NL}endstream`];
  let out = `%PDF-1.4${NL}`;
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj${NL}${body}${NL}endobj${NL}`; return at; });
  const xref = out.length;
  out += `xref${NL}0 ${objects.length + 1}${NL}0000000000 65535 f ${NL}${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n ${NL}`).join('')}trailer${NL}<< /Size ${objects.length + 1} /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`;
  return Buffer.from(out, 'latin1');
}
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Pinned study ${run}` }) });
const form = new FormData();
form.append('app', canvas.name);
form.append('file', new Blob([onePagePdf()], { type: 'application/pdf' }), 'pinned.pdf');
const doc = (await (await fetch(`${BASE}/api/learn/context`, { method: 'POST', body: form, headers: { cookie: `small_session=${session}` } })).json()).document;
if (!doc?.id) throw Error('the context document was not stored');
const BLOCKS = [
  { id: 'pdf1', type: 'pdf', assetKey: `doc:${doc.id}`, label: 'pinned.pdf', dx: 0, dy: 0 },
  { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: 'The moon pulls the near ocean more than the Earth, so the water bulges toward it.' },
  { id: 'qz', type: 'quiz', dx: 0, dy: 0, question: 'How many tidal bulges?', options: [{ key: 'A', text: 'Two', correct: true }, { key: 'B', text: 'One' }], why: 'One faces the moon.' },
  NOTEBOOK,
];
const ITEMS = [{ id: 'st1', kind: 'sticky', x: 1060, y: 140, text: LONG, color: 'yellow' }, { id: 'st2', kind: 'sticky', x: 1060, y: 520, text: 'Spring tides', color: 'blue' }];
const STATE = { strokes: [], shapes: [], items: ITEMS, links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;
const STUDY = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:study`;

// The stub notebook site: one load per document, an unsaved field, a counter that only a reload resets.
const STUB = `<!doctype html><html><body><textarea id="draft" aria-label="Unsaved cell"></textarea><span id="tick">0</span><script>
window.__born = Math.random(); let n = 0; setInterval(() => { document.getElementById('tick').textContent = String(++n); }, 100);
addEventListener('message', event => { if (event.data && event.data.protocol === 'rh-notebook/1' && event.data.type === 'init') parent.postMessage({ protocol: 'rh-notebook/1', type: 'loaded' }, '*'); });
</script></body></html>`;
const loads = [], model = [], saves = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  // The page also warms the notebook site in a hidden frame of its own (learn-notebook.js, workspace=warmup): served, not counted.
  if (url.origin !== BASE && url.pathname.endsWith('/lab/index.html')) { if (url.searchParams.get('workspace') !== 'warmup') loads.push(url.search); return route.fulfill({ status: 200, contentType: 'text/html', body: STUB }); }
  if (url.origin !== BASE) return route.abort();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  // A save of the board itself (PUT /api/learn/boards/<canvas>/<board>); its first thumbnail after opening is a picture, not a save.
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
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });
const pane = () => page.locator('[data-study-pane]');
const frameEl = () => page.frameLocator('[data-notebook-frame]');
const menu = () => page.locator('[data-canvas-menu]');
const zoom = () => page.locator('[data-zoom] button[title="Reset zoom"]').innerText();
const selectedIds = () => page.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const draft = () => page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
const box = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && (r.width || r.height) ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
// The notebook frame as it is now: the same element (a mark set on it once), its document (set at its load) and its fields.
const MARK = 'pinned-study-mark';
const frameState = async () => ({
  element: await page.evaluate(mark => document.querySelector('[data-notebook-frame]')?.__mark === mark, MARK),
  born: await frameEl().locator('body').evaluate(() => window.__born),
  draft: await frameEl().locator('#draft').inputValue(),
  tick: Number(await frameEl().locator('#tick').innerText()),
  loads: loads.length,
});
let first = null;
const sameFrame = async label => {
  const now = await frameState();
  assert.equal(now.element, true, `${label}: the notebook iframe is the same element`);
  assert.equal(now.born, first.born, `${label}: the notebook document was never reloaded`);
  assert.equal(now.draft, first.draft, `${label}: the unsaved value is still there`);
  assert.equal(now.loads, first.loads, `${label}: the notebook site loaded once (${first.loads} -> ${now.loads})`);
  assert.ok(now.tick >= first.tick, `${label}: the counter kept running (${first.tick} -> ${now.tick})`);
};
const geometry = () => page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key) || '{}'); return JSON.stringify([(board.blocks || []).map(b => [b.id, b.dx, b.dy, b.w, b.h]), (board.items || []).map(i => [i.id, i.x, i.y, i.w, i.h])]); }, INK);
// Board saves settle after the seeded board's first sync; then a layout action may add none (a quiet window, then the count).
const settle = async () => { let last = -1, still = 0; while (still < 30) { if (saves.length === last) still++; else { last = saves.length; still = 0; } await page.waitForTimeout(100); } };
const quiet = async (label, before) => { await page.waitForTimeout(2000); assert.deepEqual([model.length, saves.length], before, `${label}: model ${model.join()} saves ${saves.slice(before[1]).join()}`); };
const counts = () => [model.length, saves.length];
const view = async label => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitemradio', { name: label, exact: true }).first().click(); await closeMenus(page); };
const viewChecked = async () => { const panel = await openMenu(page, 'View'); const out = await panel.locator(':scope > [role="menuitemradio"], :scope [role="menuitemradio"]').evaluateAll(rows => rows.filter(row => !row.closest('[role="menu"] [role="menu"]')).map(row => [row.textContent.trim(), row.getAttribute('aria-checked')])); await closeMenus(page); return out.filter(([name]) => name === 'Canvas' || name === 'Study'); };
const work = option => page.locator(`[data-study-work-option="${option}"]`);
// Canvas objects are pressed with the mouse at a point on screen, never through locator.click: its scroll-into-view scrolls the
// canvas surface (overflow hidden), which slides the whole world under a camera that never moved. An object off screen is first
// brought into view with View > Fit canvas.
const visiblePart = selector => page.evaluate(sel => {
  const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[aria-label="Lesson canvas"]')?.getBoundingClientRect();
  if (!r || !f) return null;
  const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
  return right - left > 8 && bottom - top > 8 ? { x: r.left, y: r.top, left, right, top, bottom } : null;
}, selector);
const fitCanvas = async () => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitem', { name: 'Fit canvas', exact: true }).click(); await closeMenus(page); };
const press = async (selector, { button = 'left', x = null, y = null, double = false } = {}) => {
  let at = await visiblePart(selector);
  if (!at) { await fitCanvas(); await until(async () => !!(at = await visiblePart(selector)), `${selector} is on screen`); }
  const px = x == null ? (at.left + at.right) / 2 : Math.min(at.right - 2, Math.max(at.left + 2, at.x + x));
  const py = y == null ? (at.top + at.bottom) / 2 : Math.min(at.bottom - 2, Math.max(at.top + 2, at.y + y));
  if (double) await page.mouse.dblclick(px, py); else await page.mouse.click(px, py, { button });
};
const surfaceScroll = () => page.evaluate(() => { const s = document.querySelector('[data-canvas-surface]'); return s ? [s.scrollLeft, s.scrollTop] : null; });
// The Notebook / Canvas row has its own strip: it covers no card, the notebook, the toolbar, the minimap or the zoom, and the
// canvas starts below it.
const switchClear = async label => {
  const clash = await page.evaluate(() => {
    const row = document.querySelector('[data-study-work]')?.getBoundingClientRect(), frame = document.querySelector('[aria-label="Lesson canvas"]')?.getBoundingClientRect();
    if (!row || !frame) return 'no row or no canvas';
    const hit = r => r.width && r.height && r.left < row.right - 0.5 && r.right > row.left + 0.5 && r.top < row.bottom - 0.5 && r.bottom > row.top + 0.5;
    const over = [...document.querySelectorAll('[data-block-id], [data-item-id], [data-notebook-frame], [data-canvas-surface] [role="toolbar"], [data-canvas-minimap], [data-zoom]')]
      .filter(node => hit(node.getBoundingClientRect())).map(node => node.dataset.blockId || node.dataset.itemId || node.getAttribute('role') || [...node.attributes].map(a => a.name).find(n => n.startsWith('data-')) || node.tagName);
    if (over.length) return `the row covers ${over.join(', ')}`;
    return frame.top >= row.bottom - 1 ? null : `the canvas starts at ${frame.top}, above the row's bottom ${row.bottom}`;
  });
  assert.equal(clash, null, `${label}: ${clash}`);
};

const where = id => page.evaluate(sel => { const round = r => r && [r.left, r.top, r.right, r.bottom].map(Math.round), surface = document.querySelector('[data-canvas-surface]'); return { card: round(document.querySelector(sel)?.getBoundingClientRect()), frame: round(document.querySelector('[aria-label="Lesson canvas"]')?.getBoundingClientRect()), zoom: document.querySelector('[data-zoom] button[title="Reset zoom"]')?.textContent || null, surfaceScroll: surface ? [surface.scrollLeft, surface.scrollTop] : null }; }, `[data-block-id="${id}"]`);
const inView = async id => { const { card, frame } = await where(id); return !!card && !!frame && card[2] > frame[0] && card[0] < frame[2] && card[3] > frame[1] && card[1] < frame[3]; };
// A card brought into the working pane, or a failure that says where the card and the pane were.
const shown = async (id, what) => { try { await until(() => inView(id), what); } catch { throw Error(`${what}: ${JSON.stringify(await where(id))}`); } };

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 });
await page.locator('[data-notebook-frame]').waitFor({ timeout: 30000 });
await until(async () => loads.length === 1, 'the stub notebook loaded');
await page.evaluate(mark => { document.querySelector('[data-notebook-frame]').__mark = mark; }, MARK);
await frameEl().locator('#draft').fill('unsaved 42');
await draft().fill('my unsent question');
first = await frameState();
await settle();

await check('1 View lists Canvas and Study as radios (Canvas checked); View > Study with no pin shows Choose a reference with only this canvas\'s Explanation and notes, no model call, no board save', async () => {
  const before = counts();
  assert.deepEqual(await viewChecked(), [['Canvas', 'true'], ['Study', 'false']]);
  await view('Study');
  await pane().waitFor({ timeout: 10000 });
  await page.getByText('Choose a reference', { exact: true }).waitFor();
  const choices = await page.locator('[data-study-choice]').evaluateAll(rows => rows.map(row => row.getAttribute('data-study-choice')));
  assert.deepEqual(choices.sort(), ['ex', 'pdf1', 'st1', 'st2'], `eligible only: ${choices.join()}`);
  assert.deepEqual(await viewChecked(), [['Canvas', 'false'], ['Study', 'true']]);
  await sameFrame('Canvas -> Study');
  await shot('01-choose-a-reference');
  await quiet('View > Study', before);
});

await check('2 choosing the Explanation pins it: Pinned reference shows its title and type beside the working canvas; cards keep their ids and geometry', async () => {
  const before = counts(), shape = await geometry();
  await page.locator('[data-study-choice="ex"]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'ex', 'the Explanation is pinned');
  assert.match(await page.locator('[data-study-title]').innerText(), /Why tides rise/);
  await page.locator('[data-study-explanation]').getByText('The moon pulls the near ocean', { exact: false }).first().waitFor();
  const ref = await box('[data-study-pane]'), frame = await box('[aria-label="Lesson canvas"]');
  assert.ok(Math.abs(frame.x - ref.right) <= 2, `the canvas starts at the pane's edge: ${ref.right} / ${frame.x}`);
  await switchClear('wide');
  assert.equal(await page.locator('[data-block-id="ex"]').count(), 1, 'the source card stays on the canvas');
  assert.equal(await geometry(), shape, 'no card moved, resized or changed id');
  await sameFrame('pin');
  await shot('02-pinned-explanation');
  await quiet('pin', before);
});

await check('3 Notebook frames the existing notebook card in the same canvas; Canvas restores the zoom and selection the learner left', async () => {
  await press('[data-block-id="ex"]');
  await until(async () => (await selectedIds()).join() === 'ex', 'ex selected');
  assert.deepEqual(await surfaceScroll(), [0, 0], 'the canvas surface is not scrolled');
  await settle();
  const before = counts(), z = await zoom(), shape = await geometry();
  await work('notebook').click();
  await until(async () => (await page.locator('[data-study-work]').getAttribute('data-study-work')) === 'notebook', 'Notebook is the work');
  await shown('nb', 'the notebook card is in the working pane');
  assert.equal(await page.locator('[data-notebook-frame]').count(), 1, 'one notebook, never a second host');
  await sameFrame('Canvas -> Notebook');
  await shot('03-notebook');
  await work('canvas').click();
  await until(async () => (await zoom()) === z, `the zoom came back to ${z}`);
  await until(async () => (await selectedIds()).join() === 'ex', 'the selection came back');
  assert.equal(await geometry(), shape, 'no card moved');
  await sameFrame('Notebook -> Canvas');
  await quiet('Notebook / Canvas', before);
});

await check('4 Study -> Canvas hides only the pane (the pin stays); Canvas -> Study restores it; Chat draft, mode and visibility are unchanged', async () => {
  const before = counts();
  const mode = await page.locator('[data-chat-pane] [data-chat-mode]').first().getAttribute('data-chat-mode').catch(() => null);
  await view('Canvas');
  await pane().waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await page.evaluate(() => document.querySelector('[aria-label="Lesson canvas"]').style.marginLeft), '', 'the canvas fills the space again');
  await sameFrame('Study -> Canvas');
  await view('Study');
  await until(async () => (await pane().getAttribute('data-pin').catch(() => null)) === 'ex', 'the same pin is back');
  await sameFrame('Canvas -> Study again');
  assert.equal(await draft().inputValue(), 'my unsent question', 'the Chat draft is unchanged');
  assert.ok(await page.locator('[data-chat-pane]').isVisible(), 'Chat stays shown');
  assert.equal(await page.locator('[data-chat-pane] [data-chat-mode]').first().getAttribute('data-chat-mode').catch(() => null), mode, 'the Chat mode is unchanged');
  await quiet('Canvas / Study', before);
});

await check('5 the divider is a labelled separator: keyboard Arrow, Home and End resize the pane and the canvas follows; the notebook is untouched', async () => {
  const before = counts(), divider = page.getByRole('separator', { name: 'Resize pinned reference' });
  assert.equal(await divider.getAttribute('aria-valuenow'), '40');
  const width = (await box('[data-study-pane]')).w;
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await until(async () => (await divider.getAttribute('aria-valuenow')) === '45', 'Arrow Right widens by 5');
  await until(async () => (await box('[data-study-pane]')).w > width + 10, 'the pane widened');
  await page.keyboard.press('End');
  await until(async () => (await divider.getAttribute('aria-valuenow')) === '65', 'End is the widest');
  await page.keyboard.press('Home');
  await until(async () => (await divider.getAttribute('aria-valuenow')) === '25', 'Home is the narrowest');
  await page.keyboard.press('End'); await page.keyboard.press('Home');
  for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowRight');
  await until(async () => (await divider.getAttribute('aria-valuenow')) === '40', 'back to 40');
  const ref = await box('[data-study-pane]'), frame = await box('[aria-label="Lesson canvas"]');
  assert.ok(Math.abs(frame.x - ref.right) <= 2, 'the canvas follows the divider');
  const handle = await box('[data-study-divider]');
  await page.mouse.move(handle.x + handle.w / 2, handle.y + handle.h / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + handle.h / 2, { steps: 4 });
  await page.mouse.up();
  await until(async () => Number(await divider.getAttribute('aria-valuenow')) > 40, 'a drag widens the pane');
  await sameFrame('divider');
  await quiet('divider', before);
});

await check('6 Change reference replaces the pin only when chosen; selecting another card never retargets it', async () => {
  const before = counts();
  await press('[data-block-id="qz"]', { x: 20, y: 10 });
  await until(async () => (await selectedIds()).join() === 'qz', 'the quiz is selected');
  assert.equal(await pane().getAttribute('data-pin'), 'ex', 'a selection is not a pin');
  await page.getByRole('button', { name: 'Change reference', exact: true }).click();
  await page.locator('[data-study-choice="st1"]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'st1', 'the sticky note is pinned');
  await page.locator('[data-study-pane] [data-source-text-view]').waitFor();
  await sameFrame('change pin');
  await quiet('change reference', before);
});

await check('7 the reader keeps its scroll through Notebook and Canvas inside Study', async () => {
  const before = counts(), reader = page.locator('[data-study-pane] [data-source-text-view]');
  await reader.evaluate(node => { node.scrollTop = 400; node.dispatchEvent(new Event('scroll')); });
  const at = await reader.evaluate(node => node.scrollTop);
  assert.ok(at > 100, `the note scrolls (${at})`);
  await work('notebook').click();
  await shown('nb', 'the notebook is framed');
  await work('canvas').click();
  await until(async () => (await page.locator('[data-study-work]').getAttribute('data-study-work')) === 'canvas', 'Canvas is the work');
  assert.equal(await reader.evaluate(node => node.scrollTop), at, 'the reader is where it was');
  await sameFrame('reader scroll');
  await quiet('reader scroll', before);
});

await check('8 Pin for study from the right-click menu: on the Explanation, from that card, not on the quiz or the notebook; Locate on canvas reveals the actual pinned card', async () => {
  const before = counts();
  await press('[data-block-id="qz"]', { button: 'right', x: 20, y: 10 }); await menu().waitFor();
  assert.equal(await menu().locator('[data-menu-pin-study]').count(), 0, 'no Pin for study on a quiz');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' });
  await press('[data-block-id="nb"] [data-notebook-header]', { button: 'right', x: 20, y: 8 }); await menu().waitFor();
  assert.equal(await menu().locator('[data-menu-pin-study]').count(), 0, 'no Pin for study on a notebook');
  await page.keyboard.press('Escape'); await menu().waitFor({ state: 'detached' });
  await press('[data-block-id="ex"]', { button: 'right' }); await menu().waitFor();
  await menu().locator('[data-menu-pin-study]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'ex', 'the right-clicked card is pinned');
  await work('notebook').click();
  await shown('nb', 'the notebook is framed');
  await page.getByRole('button', { name: 'Locate on canvas', exact: true }).click();
  await until(async () => (await page.locator('[data-study-work]').getAttribute('data-study-work')) === 'canvas', 'Locate switches the work to Canvas');
  await until(async () => (await selectedIds()).join() === 'ex' && await inView('ex'), 'the pinned card is selected and shown');
  await sameFrame('pin from menu and locate');
  await shot('08-locate');
  await quiet('menu pin and locate', before);
});

await check('8b the Context reader of the PDF offers Pin for study, which pins that same card; the reader opens the PDF in the pane', async () => {
  const before = counts();
  await press('[data-block-id="pdf1"]', { button: 'right', x: 40, y: 40 }); await menu().waitFor();
  await menu().locator('[data-menu-open]').click();
  await page.locator('[data-reader-pin-study]').waitFor({ timeout: 15000 });
  await page.locator('[data-reader-pin-study]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'pdf1', 'the reader pinned its own card');
  await page.locator('[data-study-pane] [data-source-reader]').waitFor({ timeout: 15000 });
  assert.equal((await page.locator('[data-study-version]').innerText()).trim(), 'Version verification unavailable', 'a PDF says its version is not verified');
  await sameFrame('reader pin');
  await press('[data-block-id="ex"]', { button: 'right' }); await menu().waitFor();
  await menu().locator('[data-menu-pin-study]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'ex', 'back to the Explanation');
  assert.deepEqual(model, [], 'no model call');
  void before; // opening the reader may read the document; the board itself is untouched
});

await check('9 opening and closing the right panel resizes the panes from the space left beside it, never the window width; the notebook is untouched', async () => {
  const before = counts(), width = (await box('[data-study-pane]')).w;
  await page.getByRole('button', { name: 'Hide the right panel', exact: true }).click();
  await until(async () => (await box('[data-study-pane]')).w > width + 40, 'the pane takes its share of the wider space');
  await sameFrame('right panel closed');
  await page.getByRole('button', { name: 'Show the right panel', exact: true }).click();
  await until(async () => Math.abs((await box('[data-study-pane]')).w - width) <= 2, 'the pane returns to its width');
  assert.equal(await draft().inputValue(), 'my unsent question', 'the Chat draft survived');
  await sameFrame('right panel open');
  await quiet('right panel', before);
});

await check('10 a narrow space stacks the reference above the work, from the real space beside the right panel', async () => {
  const before = counts();
  await page.setViewportSize({ width: 1060, height: 950 });
  await until(async () => (await pane().getAttribute('data-layout')) === 'stacked', 'stacked when the space beside the panel is narrow');
  const ref = await box('[data-study-pane]'), frame = await box('[aria-label="Lesson canvas"]');
  assert.ok(frame.y >= ref.bottom - 2, `the work sits below the reference: ${ref.bottom} / ${frame.y}`);
  await switchClear('stacked');
  await shot('10-stacked');
  await sameFrame('stacked');
  await page.setViewportSize({ width: 1600, height: 950 });
  await until(async () => (await pane().getAttribute('data-layout')) === 'wide', 'side by side again');
  await sameFrame('wide again');
  await quiet('stacked', before);
});

await check('11 a failed preference save says Not saved, never Saved; the arrangement survives a reload when storage works', async () => {
  const before = counts();
  await page.getByText('Saved on this browser', { exact: true }).waitFor();
  await page.evaluate(() => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (key, value) { if (String(key).endsWith(':study')) throw new DOMException('blocked', 'QuotaExceededError'); return real.call(this, key, value); }; });
  await page.getByRole('separator', { name: 'Resize pinned reference' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.getByText('Not saved: this browser is not allowing Rabbit Hole to store this. It applies until you reload.', { exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('Saved on this browser', { exact: true }).count(), 0, 'never reported as saved');
  await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
  await page.keyboard.press('ArrowRight');
  await page.getByText('Saved on this browser', { exact: true }).waitFor({ timeout: 5000 });
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STUDY);
  assert.equal(stored.pin.cardId, 'ex');
  assert.equal(stored.mode, 'study');
  assert.ok(!JSON.stringify(stored).includes('my unsent question'), 'no Chat state in the arrangement');
  await quiet('storage failure', before);
});

await check('12 a reload restores Study: the same pin, split and working view, saved on this browser', async () => {
  const split = await page.getByRole('separator', { name: 'Resize pinned reference' }).getAttribute('aria-valuenow');
  await page.reload();
  await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 });
  await until(async () => (await pane().getAttribute('data-pin').catch(() => null)) === 'ex', 'the pin came back after a reload');
  assert.equal(await page.getByRole('separator', { name: 'Resize pinned reference' }).getAttribute('aria-valuenow'), split);
  assert.equal(await page.locator('[data-study-work]').getAttribute('data-study-work'), 'canvas');
  assert.deepEqual(await viewChecked(), [['Canvas', 'false'], ['Study', 'true']]);
  await page.getByText('Saved on this browser', { exact: true }).waitFor();
  // The reload is a new page: mark its frame again for the steps after.
  await page.locator('[data-notebook-frame]').waitFor();
  await until(async () => loads.length === 2, 'the reload loads the notebook once');
  await page.evaluate(mark => { document.querySelector('[data-notebook-frame]').__mark = mark; }, MARK);
  await frameEl().locator('#draft').fill('unsaved 42');
  first = await frameState();
  await settle();
});

// Owner 2026-10-23 item 1: Add pinned reference attaches the card as it is now, never the text it had when it was pinned.
await check('12b a pinned note edited after pinning attaches only its edited text', async () => {
  await press('[data-item-id="st2"]', { button: 'right', x: 30, y: 30 }); await menu().waitFor();
  await menu().locator('[data-menu-pin-study]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'st2', 'st2 is pinned');
  await press('[data-item-id="st2"]', { double: true, x: 30, y: 30 });
  const body = page.locator('[data-item-id="st2"] [contenteditable="true"]');
  await body.waitFor({ timeout: 5000 });
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Neap tides');
  await page.keyboard.press('Escape');
  await until(async () => (await page.locator('[data-item-id="st2"]').innerText()).includes('Neap tides'), 'the note is edited');
  await page.locator('[data-study-pane] [data-source-text-view]').getByText('Neap tides').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Add pinned reference', exact: true }).click();
  const chips = () => page.locator('[data-chat-pane] [data-context-chip]').allInnerTexts();
  await until(async () => (await chips()).some(text => text.includes('Neap tides')), 'the edited note is attached');
  assert.ok(!(await chips()).some(text => text.includes('Spring tides')), 'nothing of the text it was pinned with');
  assert.deepEqual(model, [], 'attaching asks no model');
});

await check('13 a pinned card that is deleted shows Reference unavailable with Choose another reference and Unpin; the working pane stays usable', async () => {
  if ((await pane().getAttribute('data-pin')) !== 'st2') {
    await press('[data-item-id="st2"]', { button: 'right', x: 30, y: 30 }); await menu().waitFor();
    await menu().locator('[data-menu-pin-study]').click();
    await until(async () => (await pane().getAttribute('data-pin')) === 'st2', 'st2 is pinned');
  }
  await press('[data-item-id="st2"]', { button: 'right', x: 30, y: 30 }); await menu().waitFor();
  await menu().getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.locator('[data-study-unavailable]').getByText('Reference unavailable', { exact: true }).waitFor({ timeout: 10000 });
  for (const name of ['Choose another reference', 'Unpin']) assert.ok(await page.locator('[data-study-pane]').getByRole('button', { name, exact: true }).first().isVisible(), name);
  assert.ok(await page.getByRole('button', { name: 'Add pinned reference', exact: true }).isDisabled(), 'nothing to attach');
  await work('notebook').click();
  await shown('nb', 'the notebook still works beside an unavailable reference');
  await work('canvas').click();
  await sameFrame('unavailable');
  await page.locator('[data-study-unavailable]').getByRole('button', { name: 'Choose another reference', exact: true }).click();
  await page.locator('[data-study-choice="ex"]').click();
  await until(async () => (await pane().getAttribute('data-pin')) === 'ex', 'another reference chosen');
  await shot('13-recovered');
});

await check('14 Unpin returns to Canvas and clears the pin; the source card and the notebook stay; no model call at any point, no page error', async () => {
  await settle();
  const before = counts();
  await page.locator('[data-study-pane]').getByRole('button', { name: 'Unpin', exact: true }).first().click();
  await pane().waitFor({ state: 'detached', timeout: 10000 });
  assert.deepEqual(await viewChecked(), [['Canvas', 'true'], ['Study', 'false']]);
  assert.equal(await page.locator('[data-block-id="ex"]').count(), 1, 'the source card stays');
  assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STUDY)).pin, null);
  await sameFrame('unpin');
  await quiet('unpin', before);
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
