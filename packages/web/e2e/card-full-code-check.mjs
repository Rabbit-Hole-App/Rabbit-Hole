// Full content for the code-like cards (owner 2026-11-04): a Code exercise ('code'), a code file card ('repo-code', an upload here) and a
// notebook, through the actual app. The canvas menu's one "Full content" row turns every line / cell on, the card as tall as its content;
// Scrollable is today's card. The choice is saved on the block (cardLayout) and survives a reload. The code card's old Expand control is
// that row now: a card saved with `expanded: true` opens as Full content, and no card has an Expand button. Cards that are viewers
// (here a heading) get no row. No model calls; every other origin is aborted (the notebook site too, so the notebook card draws its frame).
// BASE=<local app> SMALL_CP=<local CP> VARS=<named vars file> OUT=<evidence dir> node e2e/card-full-code-check.mjs
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:5441', CP = process.env.SMALL_CP || 'http://127.0.0.1:9093';
for (const origin of [BASE, CP]) assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/, 'local stack only');
const OUT = resolve(process.env.OUT || 'e2e/shots/card-full-code'); mkdirSync(OUT, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || (process.env.VARS && readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2'));
assert.ok(secret, 'Set TEST_BYPASS_SECRET or VARS');
const run = Date.now().toString(36), results = [], errors = [], blocked = [];
const until = async (condition, message, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 80)); } throw Error(message); };
const close = (actual, expected, message, tolerance = 2) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const api = async (path, method = 'GET', body, headers = {}, raw = false) => {
  const response = await fetch(BASE + path, { method, headers: { cookie: `small_session=${session}`, ...(raw ? {} : { 'content-type': 'application/json' }), origin: BASE, ...headers }, ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({})); assert.ok(response.ok, `${method} ${path}: ${response.status}`); return data;
};
const minted = await fetch(CP + '/test/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `fullcode-${run}@example.com`, secret }) });
const session = (await minted.json()).session; assert.ok(session);
await api('/api/profile', 'PUT', { handle: `fullcode_${run}` });
const browser = await chromium.launch();
const guard = async context => context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  const model = /^\/api\/(?:ask|repositories\/[^/]+\/(?:ask|learn-course)|learn\/(?:ask|selection|tutor|plan|artifact|assess|grade|home-ask|course|image|media|inline|journey|scene|transcribe|tts|voice|dive|explore))(?:\/|$)/.test(url.pathname);
  if (model && request.method() !== 'GET') { blocked.push(url.pathname); return route.abort(); }
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== BASE) return route.abort();
  return route.continue();
});

// ---------------------------------------------------------------- the three cards, each long enough that Scrollable clips it
const LINES = 120;
const NOTES = Array.from({ length: LINES }, (_, i) => `value_${i} = ${i}  # ${'a long comment that wraps in Full content '.repeat(3)}`).join('\n');
const SETUP = Array.from({ length: 60 }, (_, i) => `step_${i} = ${i}`).join('\n');
const CELLS = Array.from({ length: 30 }, (_, i) => ({ cell_type: 'code', id: `c${i}`.padEnd(8, '0'), metadata: {}, outputs: [{ output_type: 'stream', name: 'stdout', text: `result ${i}\n` }], execution_count: i + 1, source: `x${i} = ${i}\nprint('result ${i}')` }));
const UPLOAD_KEY = `fullcode-${run}`;
const CARDS = {
  'repo-code': { id: 'subject', type: 'repo-code', title: 'notes.py', language: 'python', dx: 0, dy: 0, source: { kind: 'upload', assetKey: UPLOAD_KEY, name: 'notes.py', size: NOTES.length } },
  code: { id: 'subject', type: 'code', title: 'Long exercise', brief: 'A Code exercise with a long Given block.', setup: SETUP, starter: 'def f():\n    ...', checks: 'assert True', hint: 'None.', draft: null, dx: 0, dy: 0 },
  notebook: { id: 'subject', type: 'notebook', notebook_id: crypto.randomUUID(), language: 'python', dx: 0, dy: 0, active_path: 'notebook.ipynb', files: ['notebook.ipynb'], ipynb_path: 'notebook.ipynb',
    ipynb: { cells: CELLS, metadata: { kernelspec: { name: 'python', display_name: 'Python (Pyodide)', language: 'python' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 } },
};
const NEIGHBOR = { id: 'neighbor', type: 'explanation', title: 'Neighbor must stay put', body: 'Unchanged neighbor content.', dx: 40, dy: 0, w: 400, h: 180 };
const board = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks });

async function fixture(blocks) {
  const canvas = await api('/api/canvases', 'POST', { title: `Full code ${run} ${Math.random().toString(36).slice(2, 6)}` });
  const path = `/api/learn/boards/${canvas.name}/main`;
  await api(`${path}/assets/${encodeURIComponent(UPLOAD_KEY)}`, 'PUT', NOTES, { 'content-type': 'text/plain', 'x-asset-kind': 'string' }, true);
  await api(path, 'PUT', { state: board(blocks) });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await guard(context); await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const card = () => page.locator('[data-block-id="subject"]');
  const open = async () => { await page.goto(`${BASE}/apps/${canvas.name}`, { waitUntil: 'domcontentloaded' }); await card().waitFor({ timeout: 60000 }); };
  const saved = async () => (await api(path)).state;
  const mode = () => card().getAttribute('data-card-layout');
  const row = () => page.getByRole('menuitemcheckbox', { name: 'Full content', exact: true });
  const menu = async () => { await card().locator('[data-drag-handle]').first().click({ button: 'right' }); };
  const setLayout = async full => {
    await menu();
    if ((await row().getAttribute('aria-checked')) === String(full)) await page.keyboard.press('Escape'); else await row().click();
    await until(async () => await mode() === (full ? 'full' : 'scrollable'), `mode ${full ? 'full' : 'scrollable'}`);
  };
  const waitSaved = want => until(async () => (await saved()).blocks.find(b => b.id === 'subject').cardLayout?.mode === want, `layout ${want} persisted`);
  const box = () => card().evaluate(e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  const neighbor = () => page.locator('[data-block-id="neighbor"]').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  return { page, context, card, open, saved, mode, setLayout, waitSaved, box, neighbor, row, menu, name: canvas.name };
}
const checks = [];
const check = (name, action) => checks.push({ name, action });

check('repo-code: Full content shows every line and no excerpt note, Scrollable says "Showing 40 of 120", the choice survives a reload, and there is no Expand control', async () => {
  const f = await fixture([CARDS['repo-code'], NEIGHBOR]);
  try {
    await f.open();
    await f.card().locator('[data-code-card][data-status="ready"]').waitFor({ timeout: 30000 });
    const lines = () => f.card().locator('[data-code-line]').count();
    assert.equal(await lines(), 40, 'Scrollable: the preview');
    assert.match((await f.card().locator('[data-code-card-excerpt]').innerText()).trim(), new RegExp(`^Showing 40 of ${LINES} lines\\. Full content shows the rest\\.$`));
    assert.equal(await f.card().locator('[data-code-card-expand]').count(), 0, 'Expand is the Full content row now');
    const before = await f.box(), neighbor = await f.neighbor();
    await f.page.screenshot({ path: resolve(OUT, 'repo-code-scrollable.png') });
    await f.setLayout(true); await f.waitSaved('full');
    await until(async () => await lines() === LINES, 'every line is drawn');
    assert.equal(await f.card().locator('[data-code-card-excerpt]').count(), 0, 'nothing is left out, so no excerpt note');
    const full = await f.box(); assert.ok(full.h > before.h + 500, `the card is as tall as its code: ${before.h} -> ${full.h}`);
    const clipped = await f.card().locator('[data-code-card-code]').evaluate(e => e.scrollHeight - e.clientHeight);
    assert.ok(clipped <= 3, `the code area hides nothing (${clipped}px)`);
    const wrapped = await f.card().locator('[data-code-line="1"] > span').nth(1).evaluate(e => e.scrollWidth - e.clientWidth);
    assert.ok(wrapped <= 3, `a long line wraps instead of running out of the card (${wrapped}px)`);
    const after = await f.neighbor(); for (const key of ['x', 'y', 'w', 'h']) close(after[key], neighbor[key], `neighbor ${key}`);
    await f.page.screenshot({ path: resolve(OUT, 'repo-code-full.png') });
    await f.page.reload({ waitUntil: 'domcontentloaded' }); await f.card().waitFor({ timeout: 60000 });
    await f.card().locator('[data-code-card][data-status="ready"]').waitFor({ timeout: 30000 });
    assert.equal(await f.mode(), 'full', 'Full content survives a reload'); await until(async () => await lines() === LINES, 'every line after a reload');
    await f.setLayout(false); await f.waitSaved('scrollable');
    await until(async () => await lines() === 40, 'back to the preview');
    const back = await f.box(); close(back.w, before.w, 'restored width'); close(back.h, before.h, 'restored height');
  } finally { await f.context.close(); }
});

check('code exercise: Full content shows the whole Given block and exercise, no inner scroll; Scrollable restores; the choice survives a reload', async () => {
  const f = await fixture([CARDS.code, NEIGHBOR]);
  try {
    await f.open();
    const before = await f.box();
    await f.setLayout(true); await f.waitSaved('full');
    const full = await f.box(); assert.ok(full.h > before.h, `the card grows to its content: ${before.h} -> ${full.h}`);
    const hidden = await f.card().evaluate(root => [...root.querySelectorAll('[data-scroll]')].filter(e => e.scrollHeight > e.clientHeight + 3).length);
    assert.equal(hidden, 0, 'no inner area hides content');
    assert.ok(await f.card().getByText('step_59 = 59').isVisible(), 'the last Given line is on screen');
    await f.page.reload({ waitUntil: 'domcontentloaded' }); await f.card().waitFor({ timeout: 60000 });
    assert.equal(await f.mode(), 'full');
    await f.setLayout(false); await f.waitSaved('scrollable');
    const back = await f.box(); close(back.w, before.w, 'restored width'); close(back.h, before.h, 'restored height');
  } finally { await f.context.close(); }
});

check('notebook: Full content makes the card as tall as its 30 cells, Scrollable restores its frame, and the choice survives a reload', async () => {
  const f = await fixture([CARDS.notebook, NEIGHBOR]);
  try {
    await f.open();
    const frame = () => f.card().locator('[data-notebook-frame]').evaluate(e => e.getBoundingClientRect().height);
    const before = await f.box(), frameBefore = await frame();
    await f.setLayout(true); await f.waitSaved('full');
    const full = await f.box(), frameFull = await frame();
    assert.ok(frameFull > 30 * 40, `the frame is tall enough for 30 cells: ${frameBefore} -> ${frameFull}`);
    assert.ok(full.h > before.h + 500, `the card is as tall as the notebook: ${before.h} -> ${full.h}`);
    await f.page.screenshot({ path: resolve(OUT, 'notebook-full.png') });
    await f.page.reload({ waitUntil: 'domcontentloaded' }); await f.card().waitFor({ timeout: 60000 });
    assert.equal(await f.mode(), 'full'); close(await frame(), frameFull, 'frame height after a reload', 3);
    await f.setLayout(false); await f.waitSaved('scrollable');
    const back = await f.box(); close(back.w, before.w, 'restored width'); close(back.h, before.h, 'restored height', 3);
  } finally { await f.context.close(); }
});

check('a code card saved with Expand on (expanded: true) opens as Full content with no Expand control, and turning Full content off gives the Scrollable card', async () => {
  const f = await fixture([{ ...CARDS['repo-code'], expanded: true }]);
  try {
    await f.open();
    await f.card().locator('[data-code-card][data-status="ready"]').waitFor({ timeout: 30000 });
    assert.equal(await f.mode(), 'full', 'the old Expand reads as Full content');
    await until(async () => await f.card().locator('[data-code-line]').count() === LINES, 'every line, as Expand showed them');
    assert.equal(await f.card().locator('[data-code-card-expand]').count(), 0);
    await f.menu(); assert.equal(await f.row().getAttribute('aria-checked'), 'true', 'the row says Full content is on'); await f.page.keyboard.press('Escape');
    await f.setLayout(false); await f.waitSaved('scrollable');
    assert.equal(await f.card().locator('[data-code-line]').count(), 40);
    assert.equal('expanded' in (await f.saved()).blocks.find(b => b.id === 'subject'), false, 'the old flag is gone once the card is saved');
  } finally { await f.context.close(); }
});

check('a viewer card (heading) gets no Full content row', async () => {
  const f = await fixture([{ id: 'subject', type: 'heading', text: 'Section', dx: 0, dy: 0 }, NEIGHBOR]);
  try {
    await f.open(); await f.menu();
    await f.page.getByRole('menu').first().waitFor();
    assert.equal(await f.row().count(), 0);
  } finally { await f.context.close(); }
});

try {
  for (const test of checks) {
    const started = Date.now(); try { await test.action(); results.push({ name: test.name, pass: true, ms: Date.now() - started }); }
    catch (error) { results.push({ name: test.name, pass: false, ms: Date.now() - started, error: error.stack }); }
    console.log(`${results.at(-1).pass ? 'PASS' : 'FAIL'} ${test.name}${results.at(-1).error ? ': ' + results.at(-1).error : ''}`);
  }
} finally {
  await browser.close();
  const report = { candidate: process.env.CANDIDATE_SHA || 'unverified', results, errors, blockedModelRequests: blocked, limitations: ['Deterministic layout acceptance only; the notebook site itself is blocked, so the notebook frame height is the card estimate (notebook-height.js), not a measurement of Jupyter.'] };
  writeFileSync(resolve(OUT, 'result.json'), JSON.stringify(report, null, 2));
  const passed = results.filter(x => x.pass).length; console.log(`${passed}/${checks.length} checks passed; ${errors.length} page errors`);
  process.exitCode = passed === checks.length && !errors.length ? 0 : 1;
}
