// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md "Validation plan"): the REAL notebook (Jupyter
// on the isolated notebook origin, Python in the browser) keeps running through every layout switch. Modelled on
// ctrlk-notebook-check.mjs: the actual app on the local integration stack or the named dev clone, the real notebook site, no
// model call (every model-capable non-GET route is aborted and counted; none may happen). Runner windows-only: it runs in
// the full gate, not in fast-e2e. Owner rule 2026-10-21: Claude does not run browser checks.
// Asserts: the same iframe element and no second load; a cell started before the switches is still running across them and
// its output arrives in the same document; a variable set before the switches is still defined (no kernel restart); an
// unsaved cell edit survives; no cell is rerun.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<named> (or VARS=<cp .dev.vars>)
//        [NOTEBOOK_ORIGIN=<the notebook site the build points at>] node e2e/pinned-study-kernel-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { closeMenus, openMenu } from './canvas-menu-helpers.mjs';

const total = 7; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const approvedDev = new Set(['https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']);
for (const origin of [BASE, CP]) assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || approvedDev.has(origin) || /^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev$/.test(origin), 'Only a dev clone or the local integration stack is allowed');
const secret = process.env.TEST_BYPASS_SECRET || (readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set named TEST_BYPASS_SECRET or VARS');
const SHOTS = process.argv[2] || 'pinned-study-kernel-shots';
mkdirSync(SHOTS, { recursive: true });
const run = Date.now().toString(36);
const SLEEP = 25; // seconds the running cell takes: longer than every switch below
const cells = [
  { id: 'a', cell_type: 'code', source: "marker = 'kept'", metadata: {}, execution_count: null, outputs: [] },
  { id: 'b', cell_type: 'code', source: `import asyncio\nawait asyncio.sleep(${SLEEP})\nprint('slept', ${SLEEP})`, metadata: {}, execution_count: null, outputs: [] },
  { id: 'c', cell_type: 'code', source: 'print(marker)', metadata: {}, execution_count: null, outputs: [] },
  { id: 'd', cell_type: 'code', source: '', metadata: {}, execution_count: null, outputs: [] },
];
const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, cells } };
const BLOCKS = [{ id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Async sleep', body: 'await pauses this cell; the kernel keeps running it.' }, NOTEBOOK];

let session, canvas, browser, page;
const api = async (path, method = 'GET', body) => { const r = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); assert.ok(r.ok, `${method} ${path}: ${r.status}`); return r.json(); };
const model = [], errors = [], results = [], failures = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page?.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms = 60000) => { const end = Date.now() + ms; for (;;) { if (await fn().catch(() => false)) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(200); } };
const frame = () => page.frameLocator('[data-notebook-frame]');
const cell = n => frame().locator('.jp-CodeCell').nth(n);
const prompt = n => cell(n).locator('.jp-InputPrompt').first().innerText().then(text => text.trim());
const output = n => cell(n).locator('.jp-OutputArea').first().innerText().then(text => text.trim());
const runCell = async n => { await cell(n).locator('.cm-content').first().click(); await page.keyboard.press('Shift+Enter'); };
const MARK = 'pinned-study-kernel';
// The same iframe element, and no load of it since the mark (a load listener counts them).
const sameFrame = async label => {
  const state = await page.evaluate(mark => { const node = document.querySelector('[data-notebook-frame]'); return { same: node?.__mark === mark, loads: node?.__loads ?? null, count: document.querySelectorAll('[data-notebook-frame]').length }; }, MARK);
  assert.deepEqual(state, { same: true, loads: 0, count: 1 }, `${label}: one notebook iframe, the same element, never reloaded`);
};
const view = async label => { const panel = await openMenu(page, 'View'); await panel.getByRole('menuitemradio', { name: label, exact: true }).first().click(); await closeMenus(page); };
const work = option => page.locator(`[data-study-work-option="${option}"]`);
// A canvas card is pressed with the mouse where it shows (locator.click's scroll-into-view would scroll the clipped canvas
// surface); off screen, View > Fit canvas brings it in first.
const shownPart = selector => page.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(), f = document.querySelector('[aria-label="Lesson canvas"]')?.getBoundingClientRect(); if (!r || !f) return null; const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom); return right - left > 8 && bottom - top > 8 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null; }, selector);
const press = async (selector, button = 'left') => {
  let at = await shownPart(selector);
  if (!at) { const panel = await openMenu(page, 'View'); await panel.locator('[data-menu-item="Fit canvas"]').click(); /* its accessible name carries the Shift 1 hint */ await closeMenus(page); await until(async () => !!(at = await shownPart(selector)), `${selector} is on screen`, 10000); }
  // The centre may sit under the minimap, the zoom, the tools or the selection bar: the press must hit the card itself.
  const hit = await page.evaluate(([sel, wx, wy]) => {
    const node = document.querySelector(sel), r = node.getBoundingClientRect(), f = document.querySelector('[aria-label="Lesson canvas"]').getBoundingClientRect();
    const left = Math.max(r.left, f.left), right = Math.min(r.right, f.right), top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom);
    const on = (a, b) => { const over = document.elementFromPoint(a, b); return !!over && node.contains(over); };
    if (on(wx, wy)) return { x: wx, y: wy };
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) { const a = left + 2 + (right - left - 4) * j / 12, b = top + 2 + (bottom - top - 4) * i / 12; if (on(a, b)) return { x: a, y: b }; }
    return null;
  }, [selector, at.x, at.y]);
  assert.ok(hit, `${selector} is covered where it shows`);
  await page.mouse.click(hit.x, hit.y, { button });
};

try {
  const auth = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pinned-kernel-${run}@example.com`, secret }) });
  assert.ok(auth.ok, `session ${auth.status}`);
  session = (await auth.json()).session;
  canvas = await api('/api/canvases', 'POST', { title: `Pinned kernel ${run}` });
  await api(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS } });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === BASE && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="ex"]').waitFor({ timeout: 60000 });
  await page.locator('[data-notebook-frame]').waitFor({ timeout: 60000 });
  if (process.env.NOTEBOOK_ORIGIN) assert.ok((await page.locator('[data-notebook-frame]').getAttribute('src')).startsWith(process.env.NOTEBOOK_ORIGIN), 'the build points at the named notebook site');
  await cell(0).locator('.cm-content').waitFor({ timeout: 180000 });
  await until(async () => (await page.locator('[data-block-id="nb"]').getByRole('button', { name: 'Run all' }).isEnabled()), 'the notebook became ready', 180000);
  await page.evaluate(mark => { const node = document.querySelector('[data-notebook-frame]'); node.__mark = mark; node.__loads = 0; node.addEventListener('load', () => { node.__loads++; }); }, MARK);

  await check('1 the real kernel runs a cell and keeps an unsaved edit before any switch', async () => {
    await runCell(0);
    await until(async () => /\[1\]/.test(await prompt(0)), 'cell a ran once', 150000); // the first run of a cell starts the Python kernel and loads its packages from the CDN: wait for that observable state, not 60 s (CI run on fafeff28 failed here at 149 s while the same check passed in 39 s on 0ea5e3ff)
    await cell(3).locator('.cm-content').first().click();
    await page.keyboard.type('unsaved = 42');
    await until(async () => (await cell(3).locator('.cm-content').first().innerText()).includes('unsaved = 42'), 'the edit is in the cell');
  });

  await check('2 a long cell is started and is running before the layout changes', async () => {
    await runCell(1);
    await until(async () => /\[\*\]/.test(await prompt(1)), 'cell b is running');
  });

  await check('3 Pin for study, Notebook, Canvas, the divider, Study -> Canvas -> Study and the right panel: the same iframe, no reload, the cell still running', async () => {
    await press('[data-block-id="ex"]', 'right');
    await page.locator('[data-canvas-menu] [data-menu-pin-study]').click();
    await page.locator('[data-study-pane][data-pin="ex"]').waitFor({ timeout: 10000 });
    await sameFrame('Canvas -> Study');
    await work('notebook').click();
    await page.locator('[data-study-work="notebook"]').waitFor();
    await sameFrame('Notebook');
    await work('canvas').click();
    await page.locator('[data-study-work="canvas"]').waitFor();
    await sameFrame('Canvas inside Study');
    const divider = page.getByRole('separator', { name: 'Resize pinned reference' });
    await divider.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
    await sameFrame('divider');
    await view('Canvas');
    await page.locator('[data-study-pane]').waitFor({ state: 'detached' });
    await sameFrame('Study -> Canvas');
    await view('Study');
    await page.locator('[data-study-pane][data-pin="ex"]').waitFor();
    await sameFrame('Canvas -> Study again');
    await page.getByRole('button', { name: 'Hide the right panel', exact: true }).click();
    await page.getByRole('button', { name: 'Show the right panel', exact: true }).click();
    await sameFrame('right panel');
    await work('notebook').click();
    assert.match(await prompt(1), /\[\*\]/, 'the cell is still running across every switch');
    await page.screenshot({ path: `${SHOTS}/3-running-in-study.png` });
  });

  await check('4 the running cell\'s output arrives in the same document, once', async () => {
    await until(async () => (await output(1)).includes(`slept ${SLEEP}`), 'the output arrived', (SLEEP + 60) * 1000);
    assert.match(await prompt(1), /\[2\]/, 'cell b ran exactly once, as the second run');
    await sameFrame('output');
  });

  await check('5 the kernel was never restarted: a variable set before the switches is still defined', async () => {
    await runCell(2);
    await until(async () => (await output(2)).includes('kept'), 'marker is still defined');
    assert.match(await prompt(0), /\[1\]/, 'cell a was not rerun');
  });

  await check('6 the unsaved edit and the cell count survive; Unpin leaves the notebook as it is', async () => {
    assert.ok((await cell(3).locator('.cm-content').first().innerText()).includes('unsaved = 42'));
    await page.locator('[data-study-pane]').getByRole('button', { name: 'Unpin', exact: true }).first().click();
    await page.locator('[data-study-pane]').waitFor({ state: 'detached' });
    await sameFrame('unpin');
    assert.equal(await frame().locator('.jp-CodeCell').count(), 4, 'no cell was added or removed');
    assert.ok((await cell(3).locator('.cm-content').first().innerText()).includes('unsaved = 42'));
    await page.screenshot({ path: `${SHOTS}/6-after-unpin.png` });
  });

  await check('7 no model-capable request and no page error', async () => {
    assert.deepEqual(model, []);
    assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
  });
} catch (error) {
  console.log(`FAIL setup: ${String(error.message).split('\n')[0]}`);
  await page?.screenshot({ path: `${SHOTS}/setup-failure.png` }).catch(() => {});
} finally {
  await browser?.close();
}
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
