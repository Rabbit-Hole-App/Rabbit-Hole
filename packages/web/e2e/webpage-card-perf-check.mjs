// Webpage card performance (C:/s/spec/day-1021/webcard-brief.md "Performance": tiled lazy rendering, offscreen tiles unloaded,
// checks with 1, 10 and 20 cards incl. scroll, zoom and reload; scrolling, locking and canvas movement make ZERO AI calls),
// against the LOCAL stack only. Each board holds N webpage cards of 8 fixture tiles each (11,200 px pages, webpage-card-fixtures.mjs);
// the tiles, manifests and text runs are answered here from memory by id, so this measures the card, not R2. Nothing is
// captured or screened; any model, capture or screening request is counted and fails the run.
// Measured per board (Performance API, rAF frame times and CDP Performance.getMetrics): initial render (navigation to a decoded
// tile in every card on screen), reload render, card-scroll and canvas-pan frame rate, JS heap, DOM nodes, mounted and decoded
// tiles (with the viewport bound they must stay under), and tile network requests. Prints a table, `ok <label>` per budget,
// `N/total checks passed`; exit 1 on any failure. Evidence: OUT/perf.json.
// Budgets: no earlier e2e check sets an fps or heap budget (model-budget-measure.mjs only measures), so they are set here:
// FPS from the brief (about 50 fps at 20 cards while panning; card scroll held to the same), the rest as named below.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] [OUT=<dir>] node e2e/webpage-card-perf-check.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tileJpegs, makeCapture, heldResult, webpageBlock, TILE_H } from './webpage-card-fixtures.mjs';

const total = 33; // ok() lines: 10 per board size (3 sizes), zoom at 20, heap, page errors; keep it equal
const BUDGET = { fps: 50, renderMs: 5000, heapGrowthMiB: 64, requestsPerTile: 2, margin: 400 };
const SIZES = [1, 10, 20], TILES_PER_CARD = 8, CYCLE = ['red', 'green', 'blue', 'amber'];
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('webpage-card-perf-check runs against the local stack only');
const OUT = process.env.OUT || process.argv[2] || fileURLToPath(new URL('./shots/webpage-card-perf', import.meta.url));
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
// A pooled keep-alive socket left idle past the dev server's timeout fails with "other side closed" (UND_ERR_SOCKET); retry once.
const fetch = async (url, init) => { try { return await globalThis.fetch(url, init); } catch (error) { if (error?.cause?.code !== 'UND_ERR_SOCKET') throw error; return globalThis.fetch(url, init); } };
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `webperf-${run}@example.com`, secret, handle: `wp_${run}` }) })).json()).session;
const call = async (path, method = 'GET', body) => (await fetch(`${BASE}${path}`, { method, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json().catch(() => null);

const results = [];
const ok = (label, pass, detail = '') => { results.push({ label, pass }); console.log(`${pass ? 'ok' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`); };

const browser = await chromium.launch();
const jpegs = await tileJpegs(browser, CYCLE);
const files = new Map(); // fs id -> { bytes, type }
const boards = {};
for (const n of SIZES) {
  const blocks = Array.from({ length: n }, (_, i) => {
    const cap = makeCapture({ jpegs, tiles: Array.from({ length: TILES_PER_CARD }, (_, t) => CYCLE[(i + t) % CYCLE.length]), url: `https://example.com/page-${i}`, title: `Page ${i}`,
      runs: Array.from({ length: TILES_PER_CARD }, (_, t) => ({ text: `Paragraph ${t} of page ${i}.`, x: 80, y: t * TILE_H + 200, w: 600, h: 28 })) });
    for (const f of cap.files) files.set(f.id, f);
    return webpageBlock(`w${i}`, cap, { x: (i % 5) * 560, y: Math.floor(i / 5) * 700 });
  });
  const canvas = await call('/api/canvases', 'POST', { title: `Webpage perf ${n} ${run}` });
  if (!/^canvas-[a-f0-9]{8}$/.test(canvas?.name || '')) throw Error(`no canvas: ${JSON.stringify(canvas).slice(0, 160)}`);
  await call(`/api/learn/boards/${canvas.name}/main`, 'PUT', { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] } });
  boards[n] = canvas.name;
}

const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|tutor\/(plan|handoff|evaluate)|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|dive|explore|chat\/route|webpages))/;
let ai = [], tileRequests = new Map(), errors = [], thumbs = [];
const isTile = id => files.get(id)?.role === 'tile';
const router = route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== BASE) return route.abort();
  // Diagnosis only (fast-e2e 39745217786: one 1217 ms frame while panning 10 and 20 cards): when the board thumbnail is sent.
  if (request.method() === 'PUT' && path.endsWith('/thumbnail')) thumbs.push(Date.now());
  const file = path.startsWith('/api/learn/files/') && files.get(path.split('/').pop());
  if (file && request.method() === 'GET') {
    if (isTile(file.id)) tileRequests.set(file.id, (tileRequests.get(file.id) || 0) + 1);
    return route.fulfill({ status: 200, body: file.bytes, headers: { 'content-type': file.type, 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  if (request.method() !== 'GET' && path !== '/api/learn/tutor/next-steps' && MODEL.test(path)) { ai.push(path); return path.startsWith('/api/learn/webpages') ? route.fulfill({ json: heldResult('error') }) : route.abort(); }
  return route.fallback();
};

// Cards on screen, mounted and decoded tiles, and the most tiles the viewport (plus MARGIN px around it) can justify: per card
// near the viewport, the tiles its visible body spans plus one above and one below, never more than the card has.
// WebpageCard.jsx: [data-webcard] is the card, [data-webcard-frame] its window onto the page, and each [data-webcard-tile]
// placeholder holds an <img> (a blob URL) only while the tile is near the viewport, so a mounted tile is an <img>.
const tileState = page => page.evaluate(([tileH, margin, perCard]) => {
  const vw = innerWidth, vh = innerHeight;
  const cards = [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')].filter(e => e.querySelector('[data-webcard]'));
  let bound = 0, visible = 0;
  for (const c of cards) {
    const body = c.querySelector('[data-webcard-frame]'); if (!body) continue;
    const r = body.getBoundingClientRect();
    if (r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh) visible += 1;
    if (r.right > -margin && r.left < vw + margin && r.bottom > -margin && r.top < vh + margin) {
      const onScreen = Math.max(1, tileH * (r.width / 1280));
      bound += Math.min(perCard, Math.ceil(Math.min(r.height, vh + 2 * margin) / onScreen) + 2);
    }
  }
  const imgs = [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-webcard-tile] img')];
  return { cards: cards.length, visible, bound, mounted: imgs.length, decoded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
}, [TILE_H, BUDGET.margin, TILES_PER_CARD]);
// performance.now() (ms since navigation) at the first frame where every card on screen shows a decoded tile.
const renderedAt = page => page.waitForFunction(() => {
  const cards = [...document.querySelectorAll('[aria-label="Lesson canvas"] [data-block-id]')].filter(e => e.querySelector('[data-webcard]'));
  const onScreen = cards.filter(c => { const r = c.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; });
  return onScreen.length > 0 && onScreen.every(c => [...c.querySelectorAll('[data-webcard-tile] img')].some(i => i.complete && i.naturalWidth > 0)) && performance.now();
}, null, { polling: 'raf', timeout: 60000 }).then(h => h.jsonValue());
// rAF frame intervals over `ms` while `act` runs repeatedly: frames per second (from the mean interval), p95 and worst frame.
const fpsDuring = async (page, ms, act) => {
  // Diagnosis: Long Animation Frames over 100 ms in the window, with their slowest scripts (Chromium LoAF API).
  const sampling = page.evaluate(ms => new Promise(resolve => { const t = [], loaf = []; let last = performance.now(); const end = last + ms;
    let observer = null;
    try { observer = new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.duration > 100) loaf.push({ at: Math.round(e.startTime - (end - ms)), ms: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), layout: Math.round((e.startTime + e.duration) - (e.styleAndLayoutStart || e.startTime + e.duration)),
      scripts: (e.scripts || []).sort((a, b) => b.duration - a.duration).slice(0, 3).map(x => `${Math.round(x.duration)}ms ${x.invokerType}:${x.invoker} ${x.sourceFunctionName || ''} ${(x.sourceURL || '').split('/').pop()}:${x.sourceCharPosition}`) }); });
      observer.observe({ type: 'long-animation-frame', buffered: false }); } catch { /* no LoAF in this browser */ }
    const tick = now => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else { observer?.disconnect(); resolve({ t, loaf }); } }; requestAnimationFrame(tick); }), ms);
  const stop = Date.now() + ms; let i = 0;
  while (Date.now() < stop) { await act(i); i += 1; }
  const sampled = await sampling, raw = sampled.t.slice(1), t = [...raw].sort((a, b) => a - b);
  // Diagnosis: where the worst frame ends, in ms from the window start.
  const worstAt = Math.round(raw.slice(0, raw.indexOf(Math.max(...raw)) + 1).reduce((a, b) => a + b, 0));
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  return { fps: +(1000 / mean).toFixed(1), p95: +t[Math.floor(t.length * 0.95)].toFixed(1), worst: +t[t.length - 1].toFixed(1), frames: t.length, loaf: sampled.loaf, worstAt };
};
const barePoint = page => page.evaluate(() => {
  const limit = Math.min(...[...document.querySelectorAll('[data-chat-pane],[data-sources-pane]')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect().x), innerWidth) - 30;
  for (let y = 140; y < innerHeight - 160; y += 40) for (let x = 360; x < limit; x += 40) {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[role="dialog"],button,a')) return { x, y };
  }
  return null;
});
const metrics = async cdp => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); return Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value])); };
const MiB = 1048576;

const rows = [];
for (const n of SIZES) {
  ai = []; tileRequests = new Map(); thumbs = [];
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${n}: ${error.message.slice(0, 160)}`));
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  const row = { cards: n };
  try {
    await page.goto(`${BASE}/apps/${boards[n]}`);
    row.renderMs = Math.round(await renderedAt(page));
    await page.waitForTimeout(1500);
    const first = await tileState(page);
    Object.assign(row, { visible: first.visible, mounted: first.mounted, decoded: first.decoded, bound: first.bound, tileReqs: [...tileRequests.values()].reduce((a, b) => a + b, 0) });
    ok(`${n} cards: every card on screen shows a decoded tile within ${BUDGET.renderMs} ms of navigation`, row.renderMs <= BUDGET.renderMs, `${row.renderMs} ms`);
    ok(`${n} cards: mounted tiles stay within the viewport bound, and only those were requested`, first.mounted <= first.bound && tileRequests.size <= first.bound, `${first.mounted} mounted, ${tileRequests.size} requested, bound ${first.bound} of ${n * TILES_PER_CARD}`);
    const m0 = await metrics(cdp); row.heapMiB = +(m0.JSHeapUsedSize / MiB).toFixed(1); row.nodes = m0.Nodes;

    // FIRST LOAD: a board with no thumbnail yet has one due about 4 s after it opens, inside the scroll and pan windows
    // below. They are measured from first open, not after it: the scheduler must not draw while the learner pans
    // (card-thumbnail.js `quiet`; before that fix 32.2 and 24.3 fps at 10 and 20 cards, fast-e2e 39749160898).
    // Card scroll: wheel over the first card's body, down then up.
    const body = await page.locator('[aria-label="Lesson canvas"] [data-block-id="w0"] [data-webcard-frame]').boundingBox();
    await page.mouse.click(body.x + body.width / 2, body.y + 20);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
    const scroll = await fpsDuring(page, 1500, i => page.mouse.wheel(0, i < 40 ? 80 : -80));
    Object.assign(row, { scrollFps: scroll.fps, scrollP95: scroll.p95 });
    ok(`${n} cards, first load: scrolling a card runs at ${BUDGET.fps} fps or more`, scroll.fps >= BUDGET.fps, `${scroll.fps} fps, p95 ${scroll.p95} ms, worst ${scroll.worst} ms`);

    // Canvas pan: wheel over bare canvas, back and forth.
    const bare = await barePoint(page);
    await page.mouse.move(bare.x, bare.y);
    const panFrom = Date.now();
    const pan = await fpsDuring(page, 1500, i => page.mouse.wheel((i % 20) < 10 ? 60 : -60, (i % 20) < 10 ? 30 : -30));
    Object.assign(row, { panFps: pan.fps, panP95: pan.p95 });
    // Diagnosis: board thumbnail uploads relative to the pan window's start (ms; the window is 0 to 1500).
    const thumbAt = thumbs.map(t => t - panFrom).join(' ') || 'none';
    ok(`${n} cards, first load: panning the canvas runs at ${BUDGET.fps} fps or more`, pan.fps >= BUDGET.fps, `${pan.fps} fps, p95 ${pan.p95} ms, worst ${pan.worst} ms, thumbnail sent at ${thumbAt}, ${pan.frames} frames, worst frame ends at ${pan.worstAt} ms, long frames ${JSON.stringify(pan.loaf)}`);

    // Offscreen unload: pan every card off screen, wait past the release delay, then come back.
    // A card that slides under the pointer takes the wheel (an unlocked card scrolls its page), so pan from a bare point each time.
    const wheelBare = async dy => { const p = await barePoint(page); if (p) await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, dy); await page.waitForTimeout(30); };
    for (let i = 0; i < 30 && (await tileState(page)).visible > 0; i += 1) await wheelBare(-800);
    await page.waitForTimeout(3000);
    const away = await tileState(page);
    row.mountedAway = away.mounted;
    for (let i = 0; i < 60 && (await tileState(page)).visible === 0; i += 1) await wheelBare(400);
    await page.waitForTimeout(1500);
    const back = await tileState(page), worstTile = Math.max(0, ...tileRequests.values());
    row.maxReqPerTile = worstTile;
    ok(`${n} cards: tiles unload off screen and come back with at most ${BUDGET.requestsPerTile} requests per tile`, away.visible === 0 && away.mounted <= away.bound && back.decoded > 0 && worstTile <= BUDGET.requestsPerTile,
      `away ${away.visible} visible, ${away.mounted} mounted (bound ${away.bound}), back ${back.decoded} decoded, worst tile ${worstTile} requests`);

    // STEADY STATE: the board's first thumbnail has been drawn in a pause (the scheduler still draws it), then a card's page
    // and the canvas are scrolled and panned again, on a card that is on screen now.
    const waitFrom = Date.now();
    while (!thumbs.length && Date.now() - waitFrom < 20000) await page.waitForTimeout(100);
    ok(`${n} cards: the first thumbnail is still drawn, in a pause`, thumbs.length > 0, thumbs.length ? `sent ${thumbs[0] - waitFrom} ms after the wait began` : 'none in 20 s');
    // A point on some card's page, clear of the chat pane, wherever the cards came back to (fast-e2e 39755588357: requiring a
    // card's centre on screen found none).
    const onScreen = await page.evaluate(() => {
      const limit = Math.min(...[...document.querySelectorAll('[data-chat-pane],[data-sources-pane]')].filter(e => e.offsetWidth).map(e => e.getBoundingClientRect().x), innerWidth) - 30;
      for (let y = 120; y < innerHeight - 120; y += 30) for (let x = 120; x < limit; x += 30) {
        if (document.elementFromPoint(x, y)?.closest('[data-webcard-frame]')) return { x: x - 1, y: y - 1, width: 2, height: 2 };
      }
      return null;
    });
    let steadyScroll = { fps: 0, p95: 0, worst: 0 };
    if (onScreen) {
      await page.mouse.move(onScreen.x + onScreen.width / 2, onScreen.y + onScreen.height / 2);
      steadyScroll = await fpsDuring(page, 1500, i => page.mouse.wheel(0, i < 40 ? 80 : -80));
    }
    ok(`${n} cards, steady state: scrolling a card runs at ${BUDGET.fps} fps or more`, !!onScreen && steadyScroll.fps >= BUDGET.fps, onScreen ? `${steadyScroll.fps} fps, p95 ${steadyScroll.p95} ms, worst ${steadyScroll.worst} ms` : 'no card page under a free point on screen');
    const bare3 = await barePoint(page); if (bare3) await page.mouse.move(bare3.x, bare3.y);
    const steadyPan = await fpsDuring(page, 1500, i => page.mouse.wheel((i % 20) < 10 ? 60 : -60, (i % 20) < 10 ? 30 : -30));
    Object.assign(row, { steadyScrollFps: steadyScroll.fps, steadyPanFps: steadyPan.fps });
    ok(`${n} cards, steady state: panning the canvas runs at ${BUDGET.fps} fps or more`, steadyPan.fps >= BUDGET.fps, `${steadyPan.fps} fps, p95 ${steadyPan.p95} ms, worst ${steadyPan.worst} ms, long frames ${JSON.stringify(steadyPan.loaf)}`);

    if (n === SIZES.at(-1)) {
      // Zoom out until every card is on screen: still bounded by what the viewport shows.
      const bare2 = await barePoint(page); await page.mouse.move(bare2.x, bare2.y);
      await page.keyboard.down('Control');
      for (let i = 0; i < 12 && (await tileState(page)).visible < n; i += 1) { await page.mouse.wheel(0, 300); await page.waitForTimeout(80); }
      await page.keyboard.up('Control'); await page.waitForTimeout(2000);
      const zoomed = await tileState(page);
      Object.assign(row, { zoomVisible: zoomed.visible, zoomMounted: zoomed.mounted, zoomBound: zoomed.bound });
      ok(`${n} cards zoomed out: mounted tiles stay within the viewport bound`, zoomed.mounted <= zoomed.bound, `${zoomed.visible} cards on screen, ${zoomed.mounted} mounted, bound ${zoomed.bound}`);
    }

    // Reload: the board and its tiles again (the camera may differ; render is timed the same way).
    await page.reload();
    row.reloadMs = Math.round(await renderedAt(page));
    ok(`${n} cards: reload shows a decoded tile in every card on screen within ${BUDGET.renderMs} ms`, row.reloadMs <= BUDGET.renderMs, `${row.reloadMs} ms`);
    await page.waitForTimeout(800);
    ok(`${n} cards: zero AI, capture or screening requests during render, scroll, pan${n === SIZES.at(-1) ? ', zoom' : ''} and reload`, ai.length === 0, ai.join(', '));
  } catch (error) {
    ok(`${n} cards: the run completed`, false, String(error?.message || error).split('\n')[0].slice(0, 300));
    await page.screenshot({ path: `${OUT}/fail-${n}.png` }).catch(() => {});
  }
  rows.push(row);
  await context.close();
}
const heap = rows.map(r => r.heapMiB);
ok(`JS heap grows by at most ${BUDGET.heapGrowthMiB} MiB from 1 to ${SIZES.at(-1)} cards`, heap.every(h => typeof h === 'number') && heap.at(-1) - heap[0] <= BUDGET.heapGrowthMiB, `${heap.join(' / ')} MiB`);
ok('no page error', errors.length === 0, errors.join(' | '));
await browser.close();
console.table(rows);
writeFileSync(`${OUT}/perf.json`, JSON.stringify({ base: BASE, budget: BUDGET, tilesPerCard: TILES_PER_CARD, rows, results, errors }, null, 2));
const passed = results.filter(r => r.pass).length;
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, but total says ${total}`);
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
