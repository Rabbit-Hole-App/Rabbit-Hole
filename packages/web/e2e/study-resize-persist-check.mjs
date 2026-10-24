// Resize persistence (task 5b60a856, owner bug: "when I resize a notebook and refresh the page, the size is not saved, the right
// side panel open"), against the LOCAL keyless stack only. In Study with the right panel open the notebook card is resized with
// its corner handle and the page is reloaded at once (inside the canvas's 400 ms save), after a save, and with this browser's copy
// gone (the server's copy, as after a sign-out and sign-in on a clean browser); a second card keeps its own size. The notebook's
// site is a stub that answers rh-notebook/1 init (as pinned-study-check does). No model is called; every model-capable non-GET
// route is aborted and counted. Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one (runner fork).
// Prints `ok <label>` per step, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/study-resize-persist-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { closeMenus, openMenu } from './canvas-menu-helpers.mjs';

const total = 4; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('study-resize-persist-check runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../study-resize-shots` : 'study-resize-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `resize-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, cells: [{ id: 'a', cell_type: 'code', source: 'x = 1', metadata: {}, execution_count: null, outputs: [] }] } };
const BLOCKS = [
  { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: 'The moon pulls the near ocean more than the Earth, so the water bulges toward it.' },
  NOTEBOOK,
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Study resize ${run}` }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const STUB = `<!doctype html><html><body><span id="tick">0</span><script>
addEventListener('message', event => { if (event.data && event.data.protocol === 'rh-notebook/1' && event.data.type === 'init') parent.postMessage({ protocol: 'rh-notebook/1', type: 'loaded' }, '*'); });
</script></body></html>`;
const model = [], saves = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && url.pathname.endsWith('/lab/index.html')) return route.fulfill({ status: 200, contentType: 'text/html', body: STUB });
  if (url.origin !== BASE) return route.abort();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  if (request.method() === 'PUT' && /^\/api\/learn\/boards\/[^/]+\/[^/]+$/.test(url.pathname)) saves.push(url.pathname);
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Seeded once per tab (sessionStorage survives a reload), so a browser copy removed on purpose is not seeded back.
await context.addInitScript(([key, seed]) => { try { if (!sessionStorage.getItem('seeded') && !localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); } } catch { /* a sandboxed frame */ } }, [INK, STATE]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const view = async label => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitemradio', { name: label, exact: true }).first().click(); await closeMenus(page); };
const work = option => page.locator(`[data-study-work-option="${option}"]`);
// A card's width and height on the canvas, in world units: its CSS size (the camera only scales it on screen).
const size = id => page.evaluate(sel => { const node = document.querySelector(sel); return node && { w: Math.round(parseFloat(node.style.width)), h: Math.round(node.offsetHeight) }; }, `[data-block-id="${id}"]`);
const saved = id => page.evaluate(([key, id]) => { const block = (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).find(b => b.id === id); return block && { w: block.w ?? null, h: block.h ?? null }; }, [INK, id]);
// Drag a card's corner handle by (dx, dy) screen pixels with the mouse; the handle is pressed where it is drawn.
const drag = async (id, dx, dy) => {
  const at = await page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, `[data-block-id="${id}"] button[title="Resize block"]`);
  assert.ok(at, `${id} has a corner handle`);
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x + dx / 2, at.y + dy / 2, { steps: 4 }); await page.mouse.move(at.x + dx, at.y + dy, { steps: 4 }); await page.mouse.up();
};
const open = async () => { await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 }); await page.locator('[data-notebook-frame]').waitFor({ timeout: 30000 }); };
const inStudyNotebook = async () => {
  await until(async () => (await page.locator('[data-study-work]').getAttribute('data-study-work').catch(() => null)) === 'notebook', 'Study shows the notebook as the work');
  await until(async () => (await size('nb'))?.w > 0, 'the notebook is drawn');
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await open();
let start = null;

await check('1 Study with the right panel open, Notebook as the work: the notebook card has no stored size until it is resized', async () => {
  assert.ok(await page.getByRole('button', { name: 'Hide the right panel', exact: true }).isVisible(), 'the right panel is open');
  await view('Study');
  await page.locator('[data-study-choice="ex"]').click();
  await page.locator('[data-study-pane]').waitFor({ timeout: 10000 });
  await work('notebook').click();
  await inStudyNotebook();
  assert.deepEqual(await saved('nb'), { w: null, h: null }, 'a card with no stored size loads with its default');
  start = await size('nb');
});

await check('2 resizing the notebook and reloading at once (inside the 400 ms save) keeps its size and Study', async () => {
  await drag('nb', 160, 120);
  const dragged = await size('nb');
  assert.ok(dragged.w > start.w || dragged.h > start.h, `the drag changed the size: ${JSON.stringify(start)} -> ${JSON.stringify(dragged)}`);
  await page.reload(); // no wait: the pending save must still reach this browser (pagehide)
  await open();
  const kept = await saved('nb');
  assert.ok(kept.w >= 280 && kept.w <= 1200 && kept.h >= 140 && kept.h <= 1000, `stored size is inside the limits: ${JSON.stringify(kept)}`);
  assert.ok(kept.w > Math.round(start.w) || kept.h > Math.round(start.h), `the resized size was stored: ${JSON.stringify(kept)}`);
  await inStudyNotebook();
  assert.deepEqual(await size('nb'), { w: kept.w, h: kept.h }, 'the notebook is drawn at its stored size after the reload');
});

await check('3 another card keeps its own size: the notebook is untouched by resizing the Explanation, both survive a reload after the save', async () => {
  const notebook = await saved('nb');
  await work('canvas').click();
  await until(async () => (await page.locator('[data-study-work]').getAttribute('data-study-work')) === 'canvas', 'the Canvas view');
  await page.locator('[data-block-id="ex"]').click({ position: { x: 20, y: 20 } });
  const before = await size('ex');
  await drag('ex', 90, 60);
  await until(async () => { const now = await saved('ex'); return !!now && now.w !== null; }, 'the Explanation size is stored');
  const explanation = await saved('ex');
  assert.notDeepEqual(explanation, notebook, 'the two cards have their own sizes');
  assert.deepEqual(await saved('nb'), notebook, 'the notebook size did not change');
  const puts = saves.length;
  await until(async () => saves.length > puts, 'the board was saved to the server', 20000);
  await page.reload();
  await open();
  assert.deepEqual([await saved('nb'), await saved('ex')], [notebook, explanation]);
  assert.notDeepEqual(await size('ex'), before, 'the Explanation is drawn at its new size');
});

await check('4 with this browser\'s copy gone (a clean browser after sign-in) the server\'s copy brings the sizes back; no model call, no page error', async () => {
  const want = [await saved('nb'), await saved('ex')];
  await until(async () => (await page.getByText('Saved', { exact: true }).count()) > 0 || saves.length > 0, 'a saved board');
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('small.adaptive-canvas:')) localStorage.removeItem(key); });
  await page.reload();
  await open();
  assert.deepEqual([await saved('nb'), await saved('ex')], want, 'the sizes came back from the server\'s copy');
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
