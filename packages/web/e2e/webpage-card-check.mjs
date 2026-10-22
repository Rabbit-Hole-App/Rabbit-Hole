// Webpage card (C:/s/spec/day-1021/webcard-brief.md with the owner clarifications of 00:3x PT; interface
// C:/s/spec/day-1021/webcard-interface.md v2), against the LOCAL stack only: local D1 and R2, fresh browser profiles.
// Nothing is captured and nothing is screened: POST /api/learn/webpages, its /screen Retry and its status GET are answered
// here with fixture Results (webpage-card-fixtures.mjs). The capture FILES are real: manifest, JPEG tiles and text runs are
// written to the local R2 and file_sources (approved versions 'stored', an unscreened one 'uploading'), so tiles, highlights,
// sharing and forks go through the real server. No model is ever called: Chat turns are answered here with canned text and
// counted; every other model-capable route is aborted and counted. Zero AI requests are asserted for scroll, lock, select,
// Copy, Highlight, opening Ask, region selection and pan.
// The card's DOM below (SEL) is WebpageCard.jsx's: its data-webcard-* attributes, the paste dialog [data-paste-url] and the
// PDF reader's .textLayer. The card scrolls by a CSS translateY on its column and its tiles are blob URLs, so the scroll
// position is read from the transform and the version on show from the tile pixels (each fixture tile is one colour). Prints `ok <label>` per step, ids and counts only (no cookies); `N/total passed`; exit 1 on
// any failure. Evidence: OUT/results.json and *.png.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 PERSIST=<stack>/local D1_CONFIG=<stack>/integ-local-cp.jsonc
//   [VARS=<cp .dev.vars>] [WRANGLER_BIN=<wrangler.js>] [OUT=<dir>] node e2e/webpage-card-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chatRouteAnswer } from './dev-cp.mjs';
import { tileJpegs, makeCapture, readyResult, heldResult, webpageBlock, sourceId, COLORS, TILE_W, TILE_H } from './webpage-card-fixtures.mjs';

const total = 30; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('webpage-card-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/webpage-card', import.meta.url));
mkdirSync(OUT, { recursive: true });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
// The wrangler seeding below leaves the pooled keep-alive socket idle past the dev server's timeout; the next fetch then meets
// "other side closed" (UND_ERR_SOCKET, CI fast-e2e run 39742142945). One retry on a fresh socket; any other failure throws.
const fetch = async (url, init) => { try { return await globalThis.fetch(url, init); } catch (error) { if (error?.cause?.code !== 'UND_ERR_SOCKET') throw error; return globalThis.fetch(url, init); } };
const mint = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const ownerSession = await mint(`webcard-${run}@example.com`, `wc_${run}`), otherSession = await mint(`webcard-other-${run}@example.org`, `wco_${run}`);
const OWNER = `small_session=${ownerSession}`, OTHER = `small_session=${otherSession}`;
const call = async (path, { who = OWNER, method = 'GET', body } = {}) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { cookie: who, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, type: r.headers.get('content-type') || '', body: await r.json().catch(() => null) };
};
const status = async (path, who = OWNER) => (await fetch(`${BASE}${path}`, { headers: { cookie: who } })).status;

// ---------------------------------------------------------------- the card's DOM (WebpageCard.jsx, AdaptiveCanvas.jsx paste dialog)
const SEL = {
  chooser: '[data-paste-url]',                   // the paste dialog "Paste a link": buttons "Paste as text" and "Add webpage card"
  card: '[data-webcard]',                        // the card; its state is stateOf() below
  title: '[data-webcard] h3',
  link: 'a[data-webcard-source]',                // href = the URL, target=_blank, rel noopener
  lock: 'button[data-webcard-lock]',             // the one scroll-lock toggle, aria-pressed, named "Lock scrolling" / "Unlock scrolling"
  refresh: 'button[data-webcard-refresh]',       // named "Refresh"
  body: '[data-webcard-frame]',                  // the window onto the page (present only while an approved capture is shown)
  column: '[data-webcard-column]',               // the tile column, scrolled by translateY(-scrollTop * card scale)
  tile: '[data-webcard-tile]',                   // value = tile index; holds an <img> only while near the viewport
  text: '[data-webcard] .textLayer',             // the transparent text layer of positioned runs
  highlight: '[data-webcard-highlight]',
  oldHighlights: '[data-webcard-earlier]',       // "From an earlier version: N highlights, not shown on this capture."
  truncated: '[data-webcard-truncated]',
  message: '[data-webcard-status]',              // the state line; capturing | screening | inconclusive | error | stopped | capture_error | blocked | login_required | unavailable | failed
  toolbar: '[data-webcard-selection-toolbar]',   // buttons Highlight, Copy, Ask about selection
};

// ---------------------------------------------------------------- fixtures: three versions, written to local D1 and R2
const browser = await chromium.launch();
const jpegs = await tileJpegs(browser);
const URL_A = 'https://example.com/rivers', TITLE_A = 'Rivers and deltas';
const RUN_1 = 'Rivers carry sediment from the hills toward the sea.', RUN_2 = 'Deltas record the balance between river and tide.', RUN_3 = 'The third part of the page sits lower down.';
const RUN_NEW = 'Refreshed text now sits where the first paragraph was.';
const V1 = makeCapture({ jpegs, tiles: ['red', 'green', 'blue'], url: URL_A, title: TITLE_A, runs: [{ text: RUN_1, x: 80, y: 200, w: 900, h: 28 }, { text: RUN_2, x: 80, y: TILE_H + 200, w: 860, h: 28 }, { text: RUN_3, x: 80, y: 2 * TILE_H + 200, w: 860, h: 28 }] });
// Refresh: the same lineage, new bytes, and different words in the same place as RUN_1 (an old highlight must not land on them).
const V2 = makeCapture({ jpegs, tiles: ['amber', 'green', 'grey'], url: URL_A, title: TITLE_A, lineage: V1.lineage, runs: [{ text: RUN_NEW, x: 80, y: 200, w: 900, h: 28 }, { text: RUN_2, x: 80, y: TILE_H + 200, w: 860, h: 28 }] });
const V3 = makeCapture({ jpegs, tiles: ['grey'], url: 'https://example.org/unscreened', title: 'Unscreened', runs: [{ text: 'Unscreened words.', x: 40, y: 100, w: 400, h: 24 }] });
const wrangler = args => (process.env.WRANGLER_BIN
  ? execFileSync(process.execPath, [process.env.WRANGLER_BIN, ...args, '--local', '--persist-to', PERSIST, '--config', D1_CONFIG], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
  : execFileSync(`npx wrangler ${args.map(a => `"${a}"`).join(' ')} --local --persist-to "${PERSIST}" -c "${D1_CONFIG}"`, { cwd: root, shell: true, stdio: ['ignore', 'ignore', 'inherit'] }));
const sql = statements => wrangler(['d1', 'execute', 'rabbit-hole-learn-dev', '--command', statements.join('; ').replace(/\s+/g, ' ')]);
const catalog = (await call('/api/apps')).body;
const canvasOf = async title => { const c = (await call('/api/canvases', { method: 'POST', body: { title } })).body; if (!/^canvas-[a-f0-9]{8}$/.test(c?.name || '')) throw Error(`no canvas: ${JSON.stringify(c).slice(0, 160)}`); return c.name; };
const A = await canvasOf(`Webpage card ${run}`), B = await canvasOf(`Webpage states ${run}`), C = await canvasOf(`Webpage refusal ${run}`);
{
  const now = Date.now(), rows = [];
  for (const [cap, state] of [[V1, 'stored'], [V2, 'stored'], [V3, 'uploading']]) for (const f of cap.files) {
    const key = `file-sources/${f.id}/original/${f.sha256}`, file = `${OUT}/${f.id}.bin`;
    writeFileSync(file, f.bytes);
    wrangler(['r2', 'object', 'put', `rabbit-hole-dev-learn-media/${key}`, '--file', file, '--content-type', f.type]);
    rows.push(`INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at)
      VALUES ('${f.id}', '${catalog.org}', '${catalog.email}', '${A}', NULL, 'webpage', '${f.role}${f.index ?? ''}', '${f.type}', '${f.declared}', ${f.bytes.length}, '${f.sha256}', '${key}', '${state}', ${now}, ${state === 'stored' ? now : 'NULL'})`);
  }
  sql(rows);
}
const boardPath = name => `/api/learn/boards/${name}/main`;
const emptyState = (extra = {}) => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks: [], exchanges: [], ...extra });
const STYLE = { color: '#37352f', opacity: 1 };
await call(boardPath(A), { method: 'PUT', body: { state: emptyState({ items: [{ id: 't1', kind: 'text', x: 80, y: 80, w: 300, text: 'note', ...STYLE }] }) } });
const STATES = [
  webpageBlock('k-login', null, { x: 0, y: 0, url: 'https://example.com/members', title: 'example.com', failure: { status: 'login_required', reason: 'This page needs a sign-in.' } }),
  webpageBlock('k-unavail', null, { x: 560, y: 0, url: 'https://example.com/gone', title: 'example.com', failure: { status: 'unavailable', reason: 'The page did not load.' } }),
  webpageBlock('k-blocked', null, { x: 1120, y: 0, url: 'https://example.com/x', title: 'example.com', failure: { status: 'blocked', reason: 'Hidden: explicit content.' } }),
  webpageBlock('k-failed', null, { x: 0, y: 700, url: 'https://example.com/f', title: 'example.com', failure: { status: 'failed', reason: 'The capture failed.' } }),
  webpageBlock('k-inc', null, { x: 560, y: 700, url: V3.url, title: 'example.org', pending: { manifestId: V3.manifestId, status: 'inconclusive', reason: 'Screening was not sure.', startedAt: Date.now() } }),
  webpageBlock('k-err', null, { x: 1120, y: 700, url: V3.url, title: 'example.org', pending: { manifestId: V3.manifestId, status: 'error', reason: 'Screening did not finish.', startedAt: Date.now() } }),
  webpageBlock('k-trunc', { ...V1, capture: { ...V1.capture, truncated: { height: true, bytes: false, text: false } } }, { x: 1680, y: 0 }),
];
await call(boardPath(B), { method: 'PUT', body: { state: emptyState({ blocks: STATES }) } });
// C: the approved card, and a card that names the UNSCREENED version in its fileRef (worst case: a client bug or a crafted
// save). The save indexes both (the owner owns the rows), so only the screening gate stands between a reader and V3.
const C_STATE = emptyState({ blocks: [webpageBlock('c-ok', V1), webpageBlock('c-leak', V3, { x: 600 })] });
await call(boardPath(C), { method: 'PUT', body: { state: C_STATE } });

// ---------------------------------------------------------------- routes: fixture Results, canned turns, counted AI
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|tutor\/(plan|handoff|evaluate)|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|dive|explore|chat\/route))/;
const ai = [], paid = [], captures = [], screens = [], polls = [], uploads = [], fileGets = [], outside = [], errors = [], turns = [];
let phase = 'setup', nextCapture = null, nextScreen = null;
const pollReplies = new Map();
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// A 'ready' reply of the real capture, Retry or status route has already indexed that version to the requesting board
// (webpage-capture.js finishScreen: file_source_refs, the board's next save keeps it), so the card can read its files through
// ?app=&board= before its own save. The mocked replies do the same here, at the moment they answer.
const q1 = v => `'${String(v).replace(/'/g, "''")}'`;
const indexReady = (reply, { app, board = 'main' } = {}) => {
  if (reply?.status === 'ready' && reply.fileRef && app) {
    const ids = [reply.fileRef.source.id, ...reply.fileRef.bundle.map(b => b.source.id)].map(q1).join(', ');
    sql([`INSERT OR IGNORE INTO file_source_refs (source_id, board_id) SELECT s.id, b.id FROM file_sources s, learn_boards b
      WHERE s.id IN (${ids}) AND s.status = 'stored' AND b.app = ${q1(app)} AND b.board = ${q1(board)} AND b.owner_email = ${q1(catalog.email)} AND b.org = ${q1(catalog.org)}`]);
  }
  return reply;
};
const router = async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== BASE) { outside.push(url.hostname); return route.abort(); }
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/webpages' && method === 'POST') { captures.push({ phase, body }); paid.push({ phase, path }); return route.fulfill({ json: indexReady(nextCapture?.(body) ?? heldResult('unavailable', { reason: 'Fixture: no capture queued.' }), body) }); }
  if (/^\/api\/learn\/webpages\/fs_[0-9a-f]{24}\/screen$/.test(path) && method === 'POST') { screens.push({ phase, id: path.split('/')[4], body }); paid.push({ phase, path }); return route.fulfill({ json: indexReady(nextScreen?.(body) ?? heldResult('error', { reason: 'Fixture: no screening queued.' }), body) }); }
  if (/^\/api\/learn\/webpages\/fs_[0-9a-f]{24}$/.test(path) && method === 'GET') { const id = path.split('/').pop(); polls.push({ phase, id }); return route.fulfill({ json: indexReady(pollReplies.get(id) ?? heldResult('screening', { manifestId: id }), Object.fromEntries(url.searchParams)) }); }
  if (path.startsWith('/api/learn/files/') && method === 'GET') fileGets.push({ phase, id: path.split('/').pop(), query: url.search });
  if (path === '/api/learn/media' && method === 'POST') uploads.push({ phase, type: request.headers()['content-type'], body: request.postDataBuffer()?.toString('base64') || '' });
  if (path === '/api/learn/chat/route') { ai.push({ phase, path }); return route.fulfill({ json: chatRouteAnswer(body) }); }
  if (path === '/api/learn/ask' || path === '/api/learn/tutor/plan') {
    ai.push({ phase, path }); turns.push({ phase, path, body });
    if (path === '/api/learn/tutor/plan') return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', constraints_add: [], actions: [{ type: 'respond_text', text: 'Canned reply.' }] } });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: 'Canned reply.' }) + frame('done', { ok: true, threadId: `wc-thread-${turns.length}`, messageId: `m-${turns.length}` }) });
  }
  if (/^\/api\/learn\/chat\/(threads|messages)\//.test(path) && method !== 'GET') return route.fulfill({ json: { ok: true } });
  if (method !== 'GET' && path !== '/api/learn/tutor/next-steps' && MODEL.test(path)) { ai.push({ phase, path }); return route.abort(); }
  return route.fallback();
};

const results = [], facts = {};
let page = null, context = null;
const ONLY = process.env.ONLY || '';
const check = async (label, fn) => {
  if (ONLY && !ONLY.split('|').some(part => label.includes(part))) return;
  phase = label;
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    const message = String(error?.message || error).split('\n')[0].slice(0, 400);
    results.push({ label, ok: false, error: message });
    console.log(`FAIL ${label} - ${message}${String(error?.stack || '').split('\n').filter(l => l.includes('webpage-card-check.mjs')).slice(0, 2).map(l => ` @${l.trim().replace(/.*check\.mjs:/, '')}`).join('')}`);
    if (page) await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
  }
};
const open = async (name, theme = 'light') => {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await context.addCookies([{ name: 'small_session', value: ownerSession, url: BASE }]);
  await context.addInitScript(t => { try { localStorage.setItem('small.theme', t); } catch { /* sandboxed */ } }, theme);
  await context.route('**/*', router);
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await page.goto(`${BASE}/apps/${name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
};
const reload = async () => { await page.reload(); await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 }); await page.waitForTimeout(1200); };
const waitFor = async (test, ms = 10000, what = 'timed out') => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error(what); await page.waitForTimeout(150); } };
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const strings = v => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const bodyHas = (body, text) => strings(body).some(s => norm(s).includes(norm(text)));
const aiNow = () => ai.length + paid.length;
const noAi = async (label, fn) => { const before = { ai: ai.length, paid: paid.length }; await fn(); await page.waitForTimeout(600);
  assert.deepEqual(ai.slice(before.ai).map(a => a.path), [], `${label}: AI requests`); assert.deepEqual(paid.slice(before.paid).map(a => a.path), [], `${label}: capture or screening requests`); };
const saved = async name => (await call(boardPath(name))).body?.state || {};
const savedBlock = async (name, test) => ((await saved(name)).blocks || []).find(test);
const webBlockId = () => page.evaluate(() => [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')].find(e => e.querySelector('[data-webcard]'))?.dataset.blockId || null);
const card = id => page.locator(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`).first();
const part = (id, sel) => card(id).locator(sel).first();
// 'ready' when the approved capture shows with no state line; otherwise the state line's value; 'none' with neither.
const stateOf = id => part(id, SEL.card).evaluate(el => { const line = el.querySelector('[data-webcard-status]'); return line ? line.dataset.webcardStatus : el.querySelector('[data-webcard-frame]') ? 'ready' : 'none'; });
// Capture px at the top of the view: the column's translateY over the card scale (column width / capture width).
const scrollTop = id => part(id, SEL.column).evaluate((c, width) => { const m = /translateY\((-?[\d.e+-]+)px\)/.exec(c.style.transform); return m ? -Number(m[1]) / (c.offsetWidth / width) : 0; }, TILE_W);
const retryOf = id => part(id, SEL.message).getByRole('button', { name: 'Retry', exact: true });
const camera = () => page.evaluate(() => { const s = document.querySelector('[data-canvas-surface]'); const w = s && [...s.children].find(e => /scale\(/.test(e.style.transform)); return w ? w.style.transform : null; });
const zoom = () => page.evaluate(() => { const s = document.querySelector('[data-canvas-surface]'); const w = [...s.children].find(e => /scale\(/.test(e.style.transform)); return new DOMMatrix(getComputedStyle(w).transform).a; });
// The decoded tile pictures of a card: { index, rgb } from each picture's top quarter (clear of the darker middle band). Tiles
// are blob URLs, so which version is on show is read from the pixels (one colour per fixture tile) and the files requested.
const tilesShown = id => card(id).locator(`${SEL.tile} img`).evaluateAll(list => list.filter(i => i.complete && i.naturalWidth > 0).map(i => {
  const c = Object.assign(document.createElement('canvas'), { width: 8, height: 8 }), x = c.getContext('2d');
  x.drawImage(i, 0, 0, i.naturalWidth, i.naturalHeight / 4, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data, s = [0, 0, 0];
  for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
  return { index: Number(i.closest('[data-webcard-tile]').dataset.webcardTile), rgb: s.map(v => v / 64) };
}));
const tinted = (rgb, name) => rgb.every((v, k) => Math.abs(v - COLORS[name][k]) <= 30);
// `cap` is on show: some tile decoded, every decoded tile has that version's colour at its place, and its tiles came from the server.
const shows = (seen, cap) => seen.length > 0 && seen.every(t => tinted(t.rgb, cap.colors[t.index])) && fileGets.some(f => cap.tileIds.includes(f.id));
// Tile `index` of `cap` is decoded on the card.
const showsTile = (seen, cap, index) => seen.some(t => t.index === index && tinted(t.rgb, cap.colors[index])) && fileGets.some(f => f.id === cap.tileIds[index]);
const pane = () => page.locator('[data-chat-pane]');
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
const barePoint = () => page.evaluate(() => {
  const limit = Math.min(...[...document.querySelectorAll('[data-chat-pane],[data-sources-pane]')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect().x), innerWidth) - 30;
  for (let y = 140; y < innerHeight - 160; y += 40) for (let x = 360; x < limit; x += 40) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[data-view-selection],[role="dialog"],[role="menu"],button,a')) return { x, y };
  }
  return null;
});
const focusCanvas = async () => { const p = await barePoint(); assert.ok(p, 'a bare point of canvas'); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200); };
const copy = text => page.evaluate(t => navigator.clipboard.writeText(t), text);
const pasteOnCanvas = async text => { await focusCanvas(); await copy(text); await page.keyboard.press('Control+v'); };
const chooser = () => page.locator(SEL.chooser);
const itemTexts = async () => ((await saved(A)).items || []).map(i => i.text);
// Select the words of one run in a card's text layer: a DOM range, then the pointer-up a drag ends with; a real drag if the
// card listens to the pointer instead. Returns the selected text and its on-screen box.
const selectRun = async (id, words) => {
  const picked = await page.evaluate(([id, words]) => {
    const layer = document.querySelector(`[aria-label="Lesson canvas"] [data-block-id="${id}"] [data-webcard] .textLayer`);
    if (!layer) return { error: 'no text layer' };
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const at = n.data.indexOf(words);
      if (at < 0) continue;
      const range = document.createRange(); range.setStart(n, at); range.setEnd(n, at + words.length);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const r = range.getBoundingClientRect(), init = { bubbles: true, cancelable: true, button: 0, clientX: r.right - 1, clientY: r.top + r.height / 2 };
      n.parentElement.dispatchEvent(new PointerEvent('pointerup', init)); n.parentElement.dispatchEvent(new MouseEvent('mouseup', init));
      return { text: sel.toString(), box: { x: r.x, y: r.y, w: r.width, h: r.height } };
    }
    return { error: `"${words}" not in the text layer ("${layer.textContent.slice(0, 120)}")` };
  }, [id, words]);
  if (picked.error) throw Error(picked.error);
  const toolbar = page.locator(SEL.toolbar);
  if (!(await toolbar.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false))) {
    const { x, y, w, h } = picked.box;
    await page.mouse.move(x + 1, y + h / 2); await page.mouse.down(); await page.mouse.move(x + w - 1, y + h / 2, { steps: 8 }); await page.mouse.up();
    picked.text = await page.evaluate(() => getSelection().toString());
  }
  await toolbar.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error(`a selection showed no ${SEL.toolbar}`); });
  return picked;
};
const highlightsOf = (manifestId, who = OWNER, app = A) => call(`/api/learn/pdf-highlights?app=${app}&key=${encodeURIComponent(`web:${V1.lineage}`)}&manifest=${manifestId}`, { who });
const overlap = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return (ix * iy) / Math.max(1, b.w * b.h); };
const boxes = sel => page.locator(sel).evaluateAll(list => list.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter(b => b.w > 0 && b.h > 0));
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
// WCAG contrast of an element's text against its first opaque background.
const contrastOf = locator => locator.evaluate(el => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = null; for (let e = el; e && !bg; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.9) bg = c; }
  bg ||= [255, 255, 255];
  const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(bg)].sort((x, y) => y - x);
  return { ratio: +((a + 0.05) / (b + 0.05)).toFixed(2), bg, dark: document.documentElement.classList.contains('dark') };
});

// ================================================================ canvas A: paste, card, scroll, lock, select, highlight, Ask
await open(A);
let ID = null;

await check('paste a URL on the canvas: the chooser offers Paste as text and Add webpage card, from the keyboard; Escape cancels and creates nothing', async () => {
  await pasteOnCanvas(URL_A);
  await chooser().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { throw Error(`pasting a URL showed no ${SEL.chooser}`); });
  for (const name of ['Paste as text', 'Add webpage card']) assert.equal(await chooser().getByRole('button', { name, exact: true }).count(), 1, `the chooser offers ${name}`);
  assert.ok(await page.evaluate(sel => !!document.activeElement?.closest(sel), SEL.chooser), 'focus moves into the chooser');
  await shot('01-chooser');
  await page.keyboard.press('Escape');
  await chooser().waitFor({ state: 'hidden', timeout: 3000 });
  await page.waitForTimeout(800);
  assert.equal(captures.length, 0, 'Escape captured nothing');
  assert.equal(await webBlockId(), null, 'no webpage card');
  assert.ok(!(await itemTexts()).includes(URL_A), 'no text box');
});

await check('"Paste as text" (Tab and Enter) pastes the URL as a text box and captures nothing', async () => {
  await pasteOnCanvas(URL_A);
  await chooser().waitFor({ state: 'visible', timeout: 5000 });
  for (let i = 0; i < 6 && norm(await page.evaluate(() => document.activeElement?.textContent || '')) !== 'Paste as text'; i += 1) await page.keyboard.press('Tab');
  assert.equal(norm(await page.evaluate(() => document.activeElement?.textContent || '')), 'Paste as text', 'Tab reaches Paste as text');
  await page.keyboard.press('Enter');
  await waitFor(async () => (await itemTexts()).includes(URL_A), 15000, 'no saved text box holds the URL');
  assert.equal(captures.length, 0, 'no capture request');
  assert.equal(await webBlockId(), null, 'no webpage card');
});

await check('"Add webpage card": one capture request (URL, no lineage), Capturing, then after the status poll the card shows title, link (new tab) and the lock toggle', async () => {
  nextCapture = () => heldResult('screening', { lineage: V1.lineage, manifestId: V1.manifestId, url: URL_A });
  pollReplies.set(V1.manifestId, readyResult(V1));
  await pasteOnCanvas(URL_A);
  await chooser().getByRole('button', { name: 'Add webpage card', exact: true }).click();
  ID = await waitFor(webBlockId, 10000, 'no webpage card appeared');
  assert.equal(captures.length, 1, 'one capture request');
  assert.equal(captures[0].body.url, URL_A); assert.equal(captures[0].body.app, A); assert.ok(!captures[0].body.lineage, 'a first capture names no lineage');
  await waitFor(async () => await stateOf(ID) === 'ready', 60000, `the card never became ready (state ${await stateOf(ID)}, ${polls.length} polls)`);
  assert.ok(polls.some(p => p.id === V1.manifestId), 'the card polled the capture status');
  assert.equal(norm(await part(ID, SEL.title).innerText()), TITLE_A);
  const link = part(ID, SEL.link);
  assert.equal(await link.getAttribute('href'), URL_A); assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(String(await link.getAttribute('rel')), /noopener/);
  assert.equal(await part(ID, SEL.lock).getAttribute('aria-pressed'), 'false');
  await waitFor(async () => shows(await tilesShown(ID), V1), 20000, 'no tile of the capture loaded');
  assert.ok(fileGets.some(f => f.id === V1.tileIds[0]), 'the first tile came through /api/learn/files');
  assert.equal(await card(ID).locator('iframe, script').count(), 0, 'no iframe or script in the card');
  await waitFor(async () => (await savedBlock(A, b => b.id === ID))?.capture?.manifestId === V1.manifestId, 15000, 'the board did not save the approved capture');
  await shot('02-card');
});

await check('normal paste in the Chat composer is unchanged: the URL lands in the text, no chooser, no card', async () => {
  const tab = page.locator('[data-panel-tab="chat"]'); if (await tab.count() && await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await composer().click(); await composer().fill('');
  const n = captures.length;
  await copy(URL_A); await page.keyboard.press('Control+v'); await page.waitForTimeout(500);
  assert.ok((await composer().inputValue()).includes(URL_A), 'the composer holds the URL');
  assert.equal(await chooser().count(), 0, 'no chooser'); assert.equal(captures.length, n, 'no new capture');
  await composer().fill('');
});

await check('normal paste in a text editor is unchanged: the URL lands in the text box, no chooser', async () => {
  await page.locator('[data-item-id="t1"]').dblclick();
  const n = captures.length;
  await copy(URL_A); await page.keyboard.press('Control+v'); await page.waitForTimeout(400);
  const text = await page.evaluate(() => document.activeElement?.closest('[data-rich-editor]') ? document.activeElement.innerText : null);
  assert.ok(String(text).includes(URL_A), `the editor holds the URL (${JSON.stringify(text)?.slice(0, 80)})`);
  assert.equal(await chooser().count(), 0, 'no chooser'); assert.equal(captures.length, n, 'no new capture');
  await page.keyboard.press('Escape');
});

await check('aligned text: each run sits over its place in the capture (CSS px of the page, scaled with the card)', async () => {
  const geo = await page.evaluate(([id, words]) => {
    const root = document.querySelector(`[aria-label="Lesson canvas"] [data-block-id="${id}"]`);
    const tile = root.querySelector('[data-webcard-tile="0"]'), t = tile.getBoundingClientRect();
    const span = [...root.querySelectorAll('[data-webcard] .textLayer span')].find(e => e.childElementCount === 0 && e.textContent.includes(words)), s = span.getBoundingClientRect();
    return { scale: t.width / 1280, dx: s.x - t.x, dy: s.y - t.y };
  }, [ID, RUN_1]);
  assert.ok(Math.abs(geo.dx - 80 * geo.scale) <= 4, `run x ${geo.dx} vs ${80 * geo.scale}`);
  assert.ok(Math.abs(geo.dy - 200 * geo.scale) <= 4, `run y ${geo.dy} vs ${200 * geo.scale}`);
});

await check('scrolling the card moves the capture, not the canvas; zero AI requests', async () => {
  await noAi('scroll', async () => {
    const body = await part(ID, SEL.body).boundingBox(), cam = await camera(), top = await scrollTop(ID);
    await page.mouse.click(body.x + body.width / 2, body.y + 20);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
    for (let i = 0; i < 8; i += 1) { await page.mouse.wheel(0, 250); await frames(); }
    await waitFor(async () => await scrollTop(ID) >= top + 1000, 4000, `the capture did not scroll (scroll-top ${await scrollTop(ID)})`);
    assert.equal(await camera(), cam, 'the canvas did not move');
    await waitFor(async () => showsTile(await tilesShown(ID), V1, 1), 10000, 'the second tile did not load after the scroll');
  });
});

await check('the lock toggle: locked, the wheel pans the canvas and the capture stays; unlocked again; zero AI requests', async () => {
  await noAi('lock', async () => {
    await part(ID, SEL.lock).click();
    assert.equal(await part(ID, SEL.lock).getAttribute('aria-pressed'), 'true');
    assert.match(String(await part(ID, SEL.lock).getAttribute('aria-label') || await part(ID, SEL.lock).innerText()), /unlock scrolling/i);
    const body = await part(ID, SEL.body).boundingBox(), cam = await camera(), top = await scrollTop(ID);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
    for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, 200); await frames(); }
    await waitFor(async () => await camera() !== cam, 3000, 'locked: the wheel did not pan the canvas');
    assert.equal(await scrollTop(ID), top, 'locked: the capture did not scroll');
    await part(ID, SEL.lock).click();
    assert.equal(await part(ID, SEL.lock).getAttribute('aria-pressed'), 'false');
  });
});

await check('keyboard: link, lock and Refresh are named and focusable; Space and Enter on the focused lock toggle it', async () => {
  for (const [sel, name] of [[SEL.link, /rivers|example\.com|open/i], [SEL.lock, /lock scrolling/i], [SEL.refresh, /^refresh$/i]]) {
    const el = part(ID, sel);
    const info = await el.evaluate(e => ({ tab: e.tabIndex, name: e.getAttribute('aria-label') || e.textContent.trim(), disabled: e.disabled }));
    assert.ok(info.tab >= 0 && !info.disabled, `${sel} is focusable`); assert.match(info.name, name, `${sel} name "${info.name}"`);
  }
  await part(ID, SEL.lock).focus();
  await page.keyboard.press('Space'); assert.equal(await part(ID, SEL.lock).getAttribute('aria-pressed'), 'true', 'Space locks');
  await page.keyboard.press('Enter'); assert.equal(await part(ID, SEL.lock).getAttribute('aria-pressed'), 'false', 'Enter unlocks');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body), 'Tab moves on from the lock');
});

await check('the scroll position survives reload', async () => {
  const top = await scrollTop(ID);
  assert.ok(top >= 1000, `scrolled first (${top})`);
  await waitFor(async () => Math.abs(((await savedBlock(A, b => b.id === ID))?.scrollTop ?? -1) - top) <= 2, 15000, 'the board did not save the scroll position');
  await reload();
  await part(ID, SEL.body).waitFor({ timeout: 30000 });
  await waitFor(async () => Math.abs(await scrollTop(ID) - top) <= 2, 15000, `reload restored scroll-top ${await scrollTop(ID)}, not ${top}`);
  await waitFor(async () => showsTile(await tilesShown(ID), V1, 1), 15000, 'the scrolled-to tile did not load after reload');
});

let selected = null;
await check('selecting text shows Highlight, Copy and Ask about selection; zero AI requests', async () => {
  await noAi('select', async () => {
    selected = await selectRun(ID, RUN_2);
    assert.equal(norm(selected.text), RUN_2);
    for (const name of ['Highlight', 'Copy', 'Ask about selection']) assert.equal(await page.locator(SEL.toolbar).getByRole('button', { name, exact: true }).count(), 1, `the toolbar offers ${name}`);
    await shot('03-selection');
  });
});

await check('Copy puts exactly the selected text on the clipboard; zero AI requests', async () => {
  await noAi('copy', async () => {
    await copy('before');
    await page.locator(SEL.toolbar).getByRole('button', { name: 'Copy', exact: true }).click();
    await waitFor(async () => norm(await page.evaluate(() => navigator.clipboard.readText())) === RUN_2, 4000, `the clipboard holds "${await page.evaluate(() => navigator.clipboard.readText())}"`);
  });
});

await check('Highlight saves one highlight on this capture version (server lists it) and draws it over the words; zero AI requests', async () => {
  await noAi('highlight', async () => {
    selected = await selectRun(ID, RUN_2);
    await page.locator(SEL.toolbar).getByRole('button', { name: 'Highlight', exact: true }).click();
    const rows = await waitFor(async () => { const r = await highlightsOf(V1.manifestId); return r.status === 200 && r.body?.highlights?.length ? r.body.highlights : null; }, 10000, 'Highlight saved no row');
    assert.equal(rows.length, 1, 'one highlight');
    assert.ok(bodyHas(rows[0], RUN_2), 'the row holds the words');
    const marks = await boxes(`[aria-label="Lesson canvas"] [data-block-id="${ID}"] ${SEL.highlight}`);
    assert.ok(marks.length >= 1, 'a highlight box is drawn');
    assert.ok(Math.max(...marks.map(m => overlap(m, selected.box))) > 0.5, 'the box covers the selected words');
  });
});

await check('Ask about selection opens Chat with the selection attached and sends nothing (no ask, plan or route request); zero AI requests', async () => {
  await noAi('ask', async () => {
    const chipsBefore = await pane().locator('[data-context-chip]').count().catch(() => 0);
    await selectRun(ID, RUN_2);
    await page.locator(SEL.toolbar).getByRole('button', { name: 'Ask about selection', exact: true }).click();
    await pane().waitFor({ state: 'visible', timeout: 5000 });
    await waitFor(async () => await pane().locator('[data-context-chip]').count() > chipsBefore, 5000, 'no context chip was attached');
    await page.waitForTimeout(2000);
    assert.equal(turns.length, 0, 'nothing was sent');
    await shot('04-ask');
  });
});

await check('a deliberate Send carries the selected text, page title, URL and capture reference', async () => {
  const n = turns.length;
  await composer().fill('What does this mean?');
  await pane().locator('[data-chat-composer] button[aria-label="Send"]').click();
  const turn = await waitFor(() => turns[n], 20000, 'no turn was sent');
  facts.send = turn.path;
  for (const want of [RUN_2, TITLE_A, URL_A]) assert.ok(bodyHas(turn.body, want), `the turn carries "${want}"`);
  assert.ok([V1.lineage, V1.manifestId, V1.sha256.slice(0, 12)].some(ref => bodyHas(turn.body, ref)), 'the turn names the capture (lineage, manifest or version)');
});

await check('reload restores the capture and its highlight', async () => {
  await reload();
  await waitFor(async () => await stateOf(ID) === 'ready', 30000, 'the card is not ready after reload');
  await waitFor(async () => shows(await tilesShown(ID), V1), 15000, 'no tile after reload');
  await waitFor(async () => (await card(ID).locator(SEL.highlight).count()) >= 1, 15000, 'the highlight is gone after reload');
});

await check('a failed Refresh (Unavailable, screening failed, inconclusive) keeps the approved capture and its highlight shown', async () => {
  const failures = [['unavailable', 'The page did not load.'], ['blocked', 'Hidden: explicit content.'], ['inconclusive', 'Screening was not sure.']];
  for (const [kind, reason] of failures) {
    const n = captures.length;
    nextCapture = () => heldResult(kind, { lineage: V1.lineage, manifestId: kind === 'unavailable' ? null : sourceId(), reason, url: URL_A });
    await part(ID, SEL.refresh).click();
    await waitFor(() => captures.length > n, 5000, `${kind}: Refresh sent no capture request`);
    assert.equal(captures[n].body.lineage, V1.lineage, `${kind}: Refresh names the lineage`);
    await page.waitForTimeout(1500);
    assert.ok(shows(await tilesShown(ID), V1), `${kind}: the approved tiles are still shown`);
    assert.ok(await card(ID).locator(SEL.highlight).count() >= 1, `${kind}: the highlight is still shown`);
    const block = await savedBlock(A, b => b.id === ID);
    assert.equal(block?.capture?.manifestId, V1.manifestId, `${kind}: the saved card keeps the approved version`);
    assert.equal(JSON.stringify(block?.fileRef), JSON.stringify(V1.fileRef), `${kind}: the saved fileRef is unchanged`);
  }
  assert.equal(fileGets.filter(f => f.phase === phase && !V1.files.some(x => x.id === f.id)).length, 0, 'no file of a failed version was requested');
  await shot('05-failed-refresh');
});

await check('Refresh makes a new version: the new tiles show, and the old highlight is not attached to the new text', async () => {
  nextCapture = () => readyResult(V2);
  await part(ID, SEL.refresh).click();
  await waitFor(async () => shows(await tilesShown(ID), V2), 20000, 'the new version did not show');
  await waitFor(async () => (await savedBlock(A, b => b.id === ID))?.capture?.manifestId === V2.manifestId, 15000, 'the board did not save the new version');
  assert.equal((await savedBlock(A, b => b.id === ID)).capture.lineage, V1.lineage, 'the lineage stays');
  assert.equal(await card(ID).locator(SEL.highlight).count(), 0, 'no highlight drawn on the new version');
  await part(ID, SEL.oldHighlights).waitFor({ timeout: 10000 }).catch(() => { throw Error(`no ${SEL.oldHighlights} note`); });
  assert.match(norm(await part(ID, SEL.oldHighlights).innerText()), /1 highlight/i);
  const now = await highlightsOf(V2.manifestId);
  assert.equal(now.status, 200); assert.equal(now.body.highlights.length, 0, 'the server lists none on the new version');
  assert.ok(now.body.changed >= 1, `the server counts the old one (changed ${now.body.changed})`);
});

await check('the refreshed version survives reload and the old highlight stays off it', async () => {
  await reload();
  await waitFor(async () => shows(await tilesShown(ID), V2), 20000, 'the new version is gone after reload');
  assert.equal(await card(ID).locator(SEL.highlight).count(), 0);
  await part(ID, SEL.oldHighlights).waitFor({ timeout: 10000 });
});

await check('region selection after scrolling the card and zooming the canvas pictures the scrolled part of the page; zero AI requests', async () => {
  await noAi('region', async () => {
    const body = await part(ID, SEL.body).boundingBox();
    await page.mouse.click(body.x + body.width / 2, body.y + 20);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
    const target = TILE_H + 300; // inside the green tile, clear of its band
    for (let i = 0; i < 20 && Math.abs(await scrollTop(ID) - target) > 150; i += 1) { await page.mouse.wheel(0, Math.sign(target - await scrollTop(ID)) * 100); await frames(); }
    const z0 = await zoom();
    const bare = await barePoint();
    await page.mouse.move(bare.x, bare.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, 200); await page.keyboard.up('Control'); await page.waitForTimeout(500);
    assert.ok(Math.abs(await zoom() - z0) > 0.02, 'the canvas zoomed');
    const b = await part(ID, SEL.body).boundingBox();
    const n = uploads.length;
    await page.getByRole('button', { name: 'Ask about selection — drag over any part of the canvas' }).click();
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.6, { steps: 8 }); await page.mouse.up();
    const up = await waitFor(() => uploads[n], 20000, 'the region picture was not uploaded');
    const mean = await page.evaluate(async ({ type, body }) => {
      const form = await new Response(Uint8Array.from(atob(body), c => c.charCodeAt(0)), { headers: { 'content-type': type } }).formData();
      const bmp = await createImageBitmap(form.get('file')), c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d');
      x.drawImage(bmp, 0, 0); const d = x.getImageData(Math.floor(bmp.width * 0.25), Math.floor(bmp.height * 0.25), Math.ceil(bmp.width / 2), Math.ceil(bmp.height / 2)).data;
      const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      return s.map(v => Math.round(v / (d.length / 4)));
    }, up);
    facts.region_mean_rgb = mean;
    assert.ok(mean[1] > mean[0] + 40 && mean[1] > mean[2] + 20, `the region shows the green middle of the page, not its top (mean rgb ${mean})`);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Select and move', exact: true }).click().catch(() => {});
  });
});

await check('panning the canvas around the card makes zero AI requests', async () => {
  await noAi('pan', async () => {
    const p = await barePoint(), cam = await camera();
    await page.mouse.move(p.x, p.y);
    for (let i = 0; i < 6; i += 1) { await page.mouse.wheel(i % 2 ? -150 : 150, 120); await frames(); }
    assert.notEqual(await camera(), cam, 'the canvas panned');
  });
});

// ================================================================ canvas B: hidden states, truncation, Retry, themes
await check('hidden states: Login required, Unavailable, Hidden with its reason, Failed; none shows a tile or text or requests a file', async () => {
  await open(B);
  const want = { 'k-login': [/login required/i, 'login_required'], 'k-unavail': [/unavailable/i, 'unavailable'], 'k-blocked': [/hidden/i, 'blocked'], 'k-failed': [/fail|unavailable|could not/i, 'failed'] };
  for (const [id, [text, state]] of Object.entries(want)) {
    await card(id).waitFor({ timeout: 30000 });
    assert.equal(await stateOf(id), state, `${id} state`);
    assert.match(norm(await card(id).innerText()), text, `${id} says so`);
    assert.equal(await card(id).locator(`${SEL.tile}, ${SEL.text}`).count(), 0, `${id} shows no capture`);
  }
  assert.match(norm(await part('k-blocked', SEL.message).innerText()), /explicit content/i, 'the blocked card gives its reason');
  await page.waitForTimeout(1500);
  assert.deepEqual(fileGets.filter(f => V3.files.some(x => x.id === f.id)).map(f => f.id), [], 'no file of an unscreened version was requested');
  await shot('06-states');
});

await check('inconclusive and error are hidden with Retry; Retry re-screens (no new capture) and then shows the card', async () => {
  for (const [id, state] of [['k-inc', 'inconclusive'], ['k-err', 'error']]) {
    assert.equal(await stateOf(id), state, `${id} state`);
    assert.match(norm(await part(id, SEL.message).innerText()), /hidden/i, `${id} says it is hidden`);
    assert.equal(await card(id).locator(SEL.tile).count(), 0, `${id} shows no tile`);
    assert.equal(await retryOf(id).count(), 1, `${id} offers Retry`);
  }
  const n = captures.length, s = screens.length;
  nextScreen = () => readyResult(V1);
  await retryOf('k-inc').click();
  await waitFor(() => screens.length > s, 5000, 'Retry sent no screening request');
  assert.equal(screens[s].id, V3.manifestId, 'Retry re-screens the held version');
  assert.equal(captures.length, n, 'Retry captured nothing new');
  await waitFor(async () => await stateOf('k-inc') === 'ready' && shows(await tilesShown('k-inc'), V1), 20000, 'the card did not show after a passing Retry');
});

await check('a truncated capture is labelled', async () => {
  await card('k-trunc').waitFor({ timeout: 10000 });
  await part('k-trunc', SEL.truncated).waitFor({ timeout: 10000 }).catch(() => { throw Error(`no ${SEL.truncated} label`); });
  assert.match(norm(await part('k-trunc', SEL.truncated).innerText()), /truncat|cut off|shortened|first|limit/i);
});

await check('both themes: the card title, hidden-state line and truncation label read (contrast 4.5 or more) in light and dark', async () => {
  for (const theme of ['light', 'dark']) {
    await open(B, theme);
    await card('k-trunc').waitFor({ timeout: 30000 });
    for (const [id, sel] of [['k-trunc', SEL.title], ['k-trunc', SEL.truncated], ['k-login', SEL.message], ['k-blocked', SEL.message]]) {
      const c = await contrastOf(part(id, sel));
      assert.equal(c.dark, theme === 'dark', `${theme}: html.dark`);
      assert.ok(c.ratio >= 4.5, `${theme}: ${id} ${sel} contrast ${c.ratio} on rgb(${c.bg})`);
    }
    await shot(`07-states-${theme}`);
  }
});

// ================================================================ canvas C: the server refuses unscreened files everywhere
let token = null, fork = null;
await check('by URL: the owner gets 404 for every unscreened file (tiles, text, manifest) while the approved capture is served', async () => {
  const q = `app=${C}&board=main`;
  for (const f of V3.files) assert.equal(await status(`/api/learn/files/${f.id}?${q}`), 404, `the unscreened ${f.role}`);
  const ok = await fetch(`${BASE}/api/learn/files/${V1.tileIds[0]}?${q}`, { headers: { cookie: OWNER } });
  assert.equal(ok.status, 200, 'the approved tile is served'); assert.match(ok.headers.get('content-type') || '', /image\/jpeg/);
});

await check('on a shared /b link: unscreened files are 404 to a viewer while the approved capture is served', async () => {
  const shared = await call(`${boardPath(C)}/share`, { method: 'POST', body: { shared: true, view: true, state: C_STATE } });
  token = shared.body?.sharing?.view;
  assert.ok(token, `the canvas is shared (${shared.status})`);
  for (const f of V3.files) assert.equal(await status(`/api/learn/files/${f.id}?share=${token}`, OTHER), 404, `${f.role} via the link`);
  assert.equal(await status(`/api/learn/files/${V1.tileIds[0]}?share=${token}`, OTHER), 200, 'the approved tile via the link');
});

await check('on a fork: unscreened files are 404 to the fork owner while the approved capture is served', async () => {
  fork = await call('/api/learn/boards/fork', { who: OTHER, method: 'POST', body: { source: { token }, key: `wc-fork-${run}` } });
  assert.match(String(fork.body?.name), /^canvas-[a-f0-9]{8}$/, `forked (${fork.status})`);
  for (const f of V3.files) assert.equal(await status(`/api/learn/files/${f.id}?app=${fork.body.name}&board=main`, OTHER), 404, `${f.role} via the fork`);
  assert.equal(await status(`/api/learn/files/${V1.tileIds[0]}?app=${fork.body.name}&board=main`, OTHER), 200, 'the approved tile via the fork');
});

await check('the refusal is the screening gate: the same tile is served once its row is stored, and refused again when it is not', async () => {
  const id = V3.tileIds[0], q = `app=${C}&board=main`;
  sql([`UPDATE file_sources SET status = 'stored', stored_at = ${Date.now()} WHERE id = '${id}'`]);
  try { assert.equal(await status(`/api/learn/files/${id}?${q}`), 200, 'stored: served'); }
  finally { sql([`UPDATE file_sources SET status = 'uploading', stored_at = NULL WHERE id = '${id}'`]); }
  assert.equal(await status(`/api/learn/files/${id}?${q}`), 404, 'uploading again: refused');
  await call(`${boardPath(C)}/share`, { method: 'POST', body: { shared: false } });
});

await check('no AI request outside the one deliberate Send, no capture or screening request outside paste, Refresh and Retry, no request to a captured site, no page error', async () => {
  facts.ai = ai.map(a => `${a.phase.slice(0, 40)}: ${a.path}`);
  facts.outside_hosts = [...new Set(outside)]; // the app shell's own outside hosts (aborted here) are recorded, not judged
  const sendPhase = results.find(r => r.label.startsWith('a deliberate Send'))?.label;
  assert.deepEqual(ai.filter(a => a.phase !== sendPhase).map(a => a.path), [], 'AI requests outside the Send');
  const allowed = p => /^"Add webpage card"|^a failed Refresh|^Refresh makes|^inconclusive and error/.test(p);
  assert.deepEqual(paid.filter(p => !allowed(p.phase)).map(p => `${p.phase}: ${p.path}`), [], 'capture or screening requests elsewhere');
  assert.deepEqual([...new Set(outside)].filter(h => /(^|\.)example\.(com|org)$/.test(h)), [], 'the card fetched the live page instead of its capture');
  assert.deepEqual(errors, [], 'page errors');
});

if (context) await context.close();
await browser.close();
const passed = results.filter(r => r.ok).length;
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, canvases: { A, B, C, fork: fork?.body?.name ?? null }, versions: { v1: V1.manifestId, v2: V2.manifestId, unscreened: V3.manifestId }, total, passed, checks: results, facts,
  counts: { ai: ai.length, captures: captures.length, screens: screens.length, polls: polls.length, uploads: uploads.length, file_gets: fileGets.length }, page_errors: errors }, null, 2));
if (!ONLY && results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
