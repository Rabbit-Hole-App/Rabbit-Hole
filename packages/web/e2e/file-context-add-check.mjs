// Context -> Add to canvas for imported files (owner acceptance 3a; file-to-canvas.js, SourcesPane.jsx), against the LOCAL
// stack only. One stored source per family (docx, csv, xlsx, pptx, glb, png): each card is added to chat, removed from the
// canvas, then put back from its Context row. The card must be the one its family renders, must survive a reload, and the Add
// must not upload anything (it reuses the stored source). No model call: model-capable requests are aborted and counted.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 VARS=<.dev.vars> [FIXTURES=C:/s/fi-fixtures] node e2e/file-context-add-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { familyOf } from '../src/file-capabilities.js';
import { fileCardFromSource } from '../src/file-to-canvas.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879', FIX = process.env.FIXTURES || 'C:/s/fi-fixtures';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('file-context-add-check runs against the local stack only');
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36).slice(-6);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `fca-${run}@example.com`, secret, handle: `fca_${run}` }) })).json();
const auth = { cookie: `small_session=${session}` };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...auth, 'content-type': 'application/json', ...(init.headers || {}) } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// What each family's card is on the canvas: the renderer's own marker inside the card.
const FILES = [
  { path: 'lane2/document.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', marker: '[data-file-doc-card]' },
  { path: 'delimited/quoted.csv', type: 'text/csv', marker: '[data-file-doc-card]' },
  { path: 'workbook/sales.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', marker: '[data-file-doc-card]' },
  { path: 'lane2/deck.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', marker: '[data-file-doc-card]' },
  { path: 'gltf/cube.glb', type: 'model/gltf-binary', marker: '[data-model-card][data-model-state="ready"]' },
  { path: 'image/photo.png', type: 'image/png', marker: 'img' },
];

let failed = 0, steps = 0;
const ok = (name, condition, extra = '') => { steps += 1; if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Context add ${run}` }) })).body;
const board = `/api/learn/boards/${canvas.name}/main`;
const EMPTY = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const save = async state => api(board, { method: 'PUT', body: JSON.stringify({ state, version: (await api(board)).body?.version }) });
await save(EMPTY);
const cards = [];
for (const [i, f] of FILES.entries()) {
  const bytes = readFileSync(`${FIX}/${f.path}`), name = basename(f.path), fam = familyOf({ name });
  const made = await api('/api/learn/files', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', name, type: f.type, size: bytes.byteLength, sha256: sha(bytes), family: fam.id }) });
  if (made.body?.upload) {
    const put = await fetch(`${BASE}/api/learn/files/${made.body.source.id}`, { method: 'PUT', headers: { ...auth, 'content-type': f.type }, body: bytes });
    ok(`${name}: stored as a ${fam.id} source`, put.status === 200, String(put.status));
  } else ok(`${name}: stored as a ${fam.id} source`, made.status < 300 && !!made.body?.source, String(made.status));
  const card = fileCardFromSource({ id: made.body.source.id, rev: sha(bytes), name, type: f.type, size: bytes.byteLength }, fam);
  cards.push({ ...f, name, fam, id: `fca-${i}`, source: made.body.source.id, card: { ...card, id: `fca-${i}`, dx: (i % 2) * 620, dy: Math.floor(i / 2) * 520, w: 520, h: 400 } });
}
ok('the board saves the six cards', (await save({ ...EMPTY, blocks: cards.map(c => c.card) })).status === 200);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const sent = [], uploads = [], errors = [];
for (const route of ['**/api/learn/ask', '**/api/learn/selection', '**/api/learn/tutor/plan', '**/api/learn/artifact', '**/api/learn/home-ask']) await context.route(route, r => { sent.push(r.request().url()); return r.abort(); });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
let watching = false;
page.on('request', r => { const u = new URL(r.url()); if (watching && (/^\/api\/learn\/files\/?$/.test(u.pathname) && r.method() === 'POST' || /^\/api\/learn\/files\/fs_/.test(u.pathname) && r.method() === 'PUT' || /\/assets\//.test(u.pathname) && r.method() === 'PUT' || u.pathname === '/api/learn/media')) uploads.push(`${r.method()} ${u.pathname}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
await page.goto(`${BASE}/apps/${canvas.name}`);
try { await page.locator(`[data-block-id="${cards[0].id}"]`).waitFor({ timeout: 30000 }); }
catch (error) { console.log('INITIAL_PAGE', await page.locator('body').innerText()); console.log('PAGE_ERRORS', JSON.stringify(errors)); await page.screenshot({ path: 'C:/s/spec/fi-context-initial.png' }); await browser.close(); throw error; }
await settle(2500);

await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Shift+Digit1'); await settle(1500);
const rendered = async c => (await page.locator(`[data-block-id="${c.id}"] ${c.marker}`).count()) > 0;
for (const c of cards) ok(`${c.name}: the ${c.fam.id} card renders as its family's card (${c.marker})`, await rendered(c));

// Add each card to chat (one at a time: select, Add to chat), then remove it from the canvas.
// Pan (wheel over an empty corner of the canvas) until the card's header strip is the topmost element at its own point.
const surfaceBox = async () => page.locator('[data-canvas-surface]').first().boundingBox();
const clickStrip = async id => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); await settle(700);
  const card = page.locator('[data-block-id="' + id + '"]');
  const strip = card.locator('[data-drag-handle], [data-drag-zone]').first();
  if (!(await strip.count())) return false;
  const b = await strip.boundingBox();
  if (!b) return false;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y, id]) => document.elementFromPoint(x, y)?.closest('[data-block-id]')?.dataset.blockId === id, [x,y,id]);
  if (!hit) return false;
  await page.mouse.click(x,y); await settle();
  return await card.getAttribute('aria-current') === 'true';
};

for (const c of cards) {
  await page.locator('[data-panel-tab="chat"]').first().click();
  ok(c.name + ': card selectable', await clickStrip(c.id));
  await page.locator('[data-add-to-chat]:visible').first().click(); await settle(700);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Delete'); await settle(900);
  ok(c.name + ': card removed after attaching to chat', await page.locator('[data-block-id="' + c.id + '"]').count() === 0);
}
const companionToggle = page.locator('[data-panel-companion]').first();
if (await companionToggle.getAttribute('aria-pressed') !== 'true') await companionToggle.click();
await page.locator('[data-companion-view="context"]').click();
console.log('CONTEXT_ROWS', await page.locator('[data-sources-pane]').innerText());
await page.screenshot({ path: 'C:/s/spec/fi-context-rows.png' });
watching = true;
for (const c of cards) {
  const row = page.locator('[data-material-row]').filter({ has: page.locator('[data-material-name]', { hasText: c.name }) });
  const add = row.locator('[data-material-action="canvas"]');
  await add.click(); await settle(900); await add.click(); await settle(900);
  let matching = [];
  for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
    const saved = (await api(board)).body;
    matching = (saved.state?.blocks || []).filter(b => b.fileRef?.source?.id === c.source);
    if (matching.length) break;
    await settle(250);
  }
  ok(c.name + ': Context Add stores one card after two clicks', matching.length === 1, String(matching.length));
  if (matching.length === 1) c.id = matching[0].id;
  ok(c.name + ': correct family renderer after Context Add', await rendered(c));
}
await page.reload(); await page.locator('[data-canvas-surface]').waitFor(); await settle(2500);
await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Shift+Digit1'); await settle(1000);
for (const c of cards) ok(c.name + ': restored card survives reload', await rendered(c));
ok('Context Add never uploads the source again', uploads.length === 0, JSON.stringify(uploads));
ok('no model request attempted', sent.length === 0);
ok('no browser exceptions', errors.length === 0, JSON.stringify(errors));
await browser.close(); console.log(steps + ' checks, ' + failed + ' failed'); process.exitCode = failed ? 1 : 0;
