// Focus chrome (docs/features/focus-study.md section 2, owner brief 2026-10-24 sections 2.1, 2.4 and 6.2), against the LOCAL keyless
// stack only (fresh browser profile, local D1). Needs a registered adapter: the notebook card's (WP3, focus-adapter-notebook.js),
// so it fails on a branch without one (step 1 says so). The notebook card's site is a stub served here, as pinned-study-check does.
// Asserts: the card toolbar's Focus button and the right-click Focus row produce the same state; Back to canvas and Escape each
// end Focus and put back the camera and the selection; a card no adapter claims shows neither control; entering and leaving Focus
// make no board save (no PUT of the board), change no saved geometry and call no model.
// Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one (runner fork).
// Prints `ok <label>` per step, ids and counts only (no cookies, no secrets), then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/focus-chrome-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const total = 6; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('focus-chrome-check runs against the local stack only');
const SHOTS = process.argv[2] || (process.env.PERSIST ? `${process.env.PERSIST}/../../focus-chrome-shots` : 'focus-chrome-shots');
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `focus-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const NOTEBOOK = { id: 'nb', type: 'notebook', notebook_id: crypto.randomUUID(), dx: 0, dy: 0, language: 'python', active_path: 'notebook.ipynb', ipynb_path: 'notebook.ipynb', files: ['notebook.ipynb'],
  ipynb: { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' } }, cells: [{ id: 'a', cell_type: 'code', source: 'x = 1', metadata: {}, execution_count: null, outputs: [] }] } };
const BLOCKS = [{ id: 'hd', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Tides' }, NOTEBOOK, { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'Why tides rise', body: 'The moon pulls the near ocean more than the Earth.' }];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Focus chrome ${run}` }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const STUB = `<!doctype html><html><body><textarea id="draft" aria-label="Unsaved cell"></textarea><script>
addEventListener('message', event => { if (event.data && event.data.protocol === 'rh-notebook/1' && event.data.type === 'init') parent.postMessage({ protocol: 'rh-notebook/1', type: 'loaded' }, '*'); });
</script></body></html>`;
const model = [], saves = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && url.pathname.endsWith('/lab/index.html')) return route.fulfill({ status: 200, contentType: 'text/html', body: STUB });
  if (url.origin !== BASE) return route.abort();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  // A save of the board itself (PUT /api/learn/boards/<canvas>/<board>): Focus may make none.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /^\/api\/learn\/boards\/[^/]+\/[^/]+$/.test(url.pathname)) saves.push(`${request.method()} ${url.pathname}`);
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const settle = async () => { let last = -1, still = 0; while (still < 30) { if (saves.length === last) still++; else { last = saves.length; still = 0; } await page.waitForTimeout(100); } };
const counts = () => [model.length, saves.length];
const quiet = async (label, before) => { await page.waitForTimeout(2000); assert.deepEqual(counts(), before, `${label}: model ${model.join()} saves ${saves.slice(before[1]).join()}`); };
const geometry = () => page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key) || '{}'); return JSON.stringify((board.blocks || []).map(b => [b.id, b.dx, b.dy, b.w, b.h, b.cardLayout || null])); }, INK);
const camera = () => page.evaluate(() => document.querySelector('[data-canvas-world]')?.style.transform || null);
const selectedIds = () => page.$$eval('[data-block-id][aria-current="true"]', nodes => nodes.map(node => node.dataset.blockId));
const frame = () => page.locator('[data-focus-frame]');
const round = r => r && [r.x, r.y, r.width, r.height].map(Math.round);
// What Focus shows: the focused id and kind, the header's and the focused host's boxes, the selection.
const focusNow = () => page.evaluate(() => {
  const f = document.querySelector('[data-focus-frame]'), host = document.querySelector('[data-focus-host]');
  const box = node => { const r = node?.getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height].map(Math.round) : null; };
  return { id: f?.dataset.focusFrame || null, kind: f?.dataset.focusKind || null, header: box(f), host: host?.dataset.blockId || null, hostBox: box(host) };
});
// The notebook's drag strip selects it on a press (a click without movement moves nothing).
const selectNotebook = async () => {
  const strip = await page.locator('[data-block-id="nb"] [data-drag-handle]').boundingBox();
  assert.ok(strip, 'the notebook card is on screen');
  await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height / 2);
  await until(async () => (await selectedIds()).includes('nb'), 'the notebook card is selected');
};

await page.goto(`${BASE}/apps/${canvas.name}`);
await page.locator('[data-block-id="nb"]').waitFor({ timeout: 60000 });
await page.locator('[data-notebook-frame]').waitFor({ timeout: 30000 });
await settle();
const geometry0 = await geometry(), saves0 = saves.length; // the seeded board's first sync is not Focus's
let byButton = null, home = null;

await check('1 The selected notebook shows Focus notebook in its toolbar (32 to 36 px high, at least 44 x 44 to press); a heading shows no Focus control', async () => {
  await selectNotebook();
  const button = page.locator('[data-focus-button]');
  await button.waitFor({ timeout: 5000 }).catch(() => { throw Error('no Focus button on the notebook card: no Focus adapter is registered for notebooks (focus-adapter-notebook.js)'); });
  assert.equal(await button.getAttribute('aria-label'), 'Focus notebook');
  const size = await button.evaluate(node => { const r = node.getBoundingClientRect(), after = getComputedStyle(node, '::after'); return { h: r.height, hitW: r.width + parseFloat(after.left) * -1 + parseFloat(after.right) * -1, hitH: r.height + parseFloat(after.top) * -1 + parseFloat(after.bottom) * -1 }; });
  assert.ok(size.h >= 32 && size.h <= 36, `visual height ${size.h}`);
  assert.ok(size.hitW >= 44 && size.hitH >= 44, `press target ${size.hitW} x ${size.hitH}`);
  // By its drag strip: the heading's text is an editor that keeps its own press (HeadingCard stops it), and its own menu.
  const heading = await page.locator('[data-block-id="hd"] [data-drag-handle]').boundingBox();
  await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2);
  await until(async () => (await selectedIds()).includes('hd'), 'the heading is selected');
  assert.equal(await page.locator('[data-focus-button]').count(), 0, 'no Focus button on the heading');
  await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2, { button: 'right' });
  await page.locator('[data-canvas-menu]').waitFor();
  assert.equal(await page.locator('[data-menu-focus]').count(), 0, 'no Focus row on the heading');
  await page.keyboard.press('Escape');
  await page.locator('[data-canvas-menu]').waitFor({ state: 'detached' });
});

await check('2 The toolbar Focus button enters Focus: the header shows the title and Back to canvas, the notebook host fills the frame, no board save', async () => {
  await selectNotebook();
  home = { camera: await camera(), selection: await selectedIds() };
  const before = counts();
  await page.locator('[data-focus-button]').click();
  await frame().waitFor({ timeout: 5000 });
  byButton = await focusNow();
  assert.equal(byButton.id, 'nb'); assert.equal(byButton.kind, 'notebook'); assert.equal(byButton.host, 'nb');
  await frame().getByRole('button', { name: 'Back to canvas', exact: true }).waitFor();
  assert.ok(byButton.hostBox[1] >= byButton.header[1] + byButton.header[3], 'the host sits below the header');
  assert.ok(Math.abs(byButton.hostBox[2] - byButton.header[2]) <= 2, `the host is as wide as the header (${byButton.hostBox[2]} / ${byButton.header[2]})`);
  await shot('2-focused');
  await quiet('enter', before);
  assert.equal(await geometry(), geometry0, 'no saved geometry changed');
});

await check('3 Back to canvas ends Focus and puts back the camera and the selection; no board save', async () => {
  const before = counts();
  await frame().getByRole('button', { name: 'Back to canvas', exact: true }).click();
  await frame().waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await page.locator('[data-focus-host]').count(), 0);
  assert.equal(await camera(), home.camera, 'the camera is back');
  assert.deepEqual(await selectedIds(), home.selection, 'the selection is back');
  await quiet('exit', before);
  assert.equal(await geometry(), geometry0, 'no saved geometry changed');
});

await check('4 The right-click Focus row produces the same Focus state as the toolbar button', async () => {
  const strip = await page.locator('[data-block-id="nb"] [data-drag-handle]').boundingBox();
  const before = counts();
  await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height / 2, { button: 'right' });
  await page.locator('[data-menu-focus]').click();
  await frame().waitFor({ timeout: 5000 });
  assert.deepEqual(await focusNow(), byButton, 'same id, kind, header and host boxes');
  await quiet('enter from the menu', before);
});

await check('5 Escape ends Focus and puts back the camera and the selection', async () => {
  const before = counts();
  await page.locator('[data-focus-back]').focus();
  await page.keyboard.press('Escape');
  await frame().waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await camera(), home.camera, 'the camera is back');
  assert.deepEqual(await selectedIds(), ['nb'], 'the right-clicked card is selected again');
  await quiet('Escape', before);
});

await check('6 Over every enter and exit: no PUT of the board, no saved geometry change, no model call, no page error', async () => {
  assert.deepEqual(saves.slice(saves0), [], `board saves: ${saves.slice(saves0).join()}`);
  assert.equal(await geometry(), geometry0);
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
