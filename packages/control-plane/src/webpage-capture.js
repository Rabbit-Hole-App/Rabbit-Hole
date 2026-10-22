// Webpage card captures (C:/s/spec/day-1021/webcard-interface.md, the contract; webpage-card-scope.md section 4). The capture
// browser (Browser Run binding env.BROWSER, @cloudflare/puppeteer) renders a public page once at 1280 px; the card shows only
// the stored JPEG tiles and text runs, never the page. Every capture version is a set of file_sources rows (learn 0023):
// a manifest, its tiles and its text runs, inserted 'uploading' and flipped to 'stored' together only when screening
// passes. file-access.js serves 'stored' rows only, so an unscreened capture is unreachable through /api/learn/files,
// a share link, a member board or a fork alike. No migration, no model call here (screening is webpage-screen.js).
//   POST /api/learn/webpages                      { app, board, url, lineage? }  capture (lineage: Refresh)
//   POST /api/learn/webpages/<manifest id>/screen { app, board }                 Retry screening
//   GET  /api/learn/webpages/<manifest id>?app=&board=                           status
import { boardOwner, ownerRow } from './learn-boards.js';
import { learnMedia } from './learn-storage.js';
import { checkRequest, checkUrl } from './url-guard.js';
import { screenCapture } from './webpage-screen.js';

export const WEBPAGE_LIMITS = Object.freeze({ width: 1280, tile: 1400, minTile: 280, height: 20_000, bytes: 10 * 1024 * 1024, chars: 200_000,
  perDay: 30, navigateMs: 20_000, idleMs: 5_000, screenMs: 120_000, staleMs: 3 * 60_000, keepUnreferencedMs: 30 * 86_400_000, keepUploadingMs: 86_400_000 });
const L = WEBPAGE_LIMITS;
const FS_ID = /^fs_[0-9a-f]{24}$/, LINEAGE = /^wc_[0-9a-f]{24}$/, BOARD = /^[A-Za-z0-9 _.-]{1,100}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const statusKey = id => `webpage-status/${id}.json`;
const encode = value => new TextEncoder().encode(JSON.stringify(value));

export const webpagesRoute = path => path === '/api/learn/webpages' || /^\/api\/learn\/webpages\/[^/]+(\/screen)?$/.test(path);

// Tiles top to bottom; the last one is the bottom max(280, remainder) px, overlapping its neighbour (JEV takes 280-1568 px a side).
export function tilePlan(height) {
  const total = Math.max(L.minTile, Math.ceil(height));
  const tiles = [];
  for (let y = 0; y < total; y += L.tile) tiles.push({ y, h: Math.min(L.tile, total - y) });
  const last = tiles.at(-1);
  if (last.h < L.minTile) { last.y = total - L.minTile; last.h = L.minTile; }
  return tiles.map((t, index) => ({ index, ...t }));
}

// In the capture page: one run per line fragment of each visible text node, page coordinates, at most maxChars characters.
/* c8 ignore start: runs inside Chromium */
function textRuns(maxChars, maxY) {
  const runs = [], skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  let chars = 0, truncated = false;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const range = document.createRange(), sx = window.scrollX, sy = window.scrollY, r1 = v => Math.round(v * 10) / 10;
  for (let node; !truncated && (node = walker.nextNode());) {
    const text = node.nodeValue, el = node.parentElement;
    if (!text || !text.trim() || !el || skip.has(el.tagName) || getComputedStyle(el).visibility === 'hidden') continue;
    let line = null;
    const flush = () => { if (line) { runs.push({ text: line.text, x: r1(line.x), y: r1(line.y), w: r1(line.w), h: r1(line.h) }); chars += line.text.length; line = null; } };
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const x = r.left + sx, y = r.top + sy;
      if (y >= maxY) break;
      if (line && Math.abs(y - line.y) < r.height / 2 && x >= line.x + line.w - 1) {
        line.text = text.slice(line.start, m.index + m[0].length); line.w = x + r.width - line.x; line.h = Math.max(line.h, r.height);
      } else { flush(); line = { text: m[0], start: m.index, x, y, w: r.width, h: r.height }; }
      if (chars + line.text.length >= maxChars) { truncated = true; break; }
    }
    flush();
  }
  return { runs, truncated };
}
// In the capture page: what decides "Login required".
function pageFacts() {
  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  return { height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    password: [...document.querySelectorAll('input[type=password]')].some(visible), textLength: (document.body?.innerText || '').trim().length };
}
// Scrolls one tile into the viewport and lets lazy content paint (two frames).
async function scrollToY(y) {
  window.scrollTo(0, y);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}
async function scrollThrough(maxY) {
  for (let y = 0; y < maxY; y += 1000) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
  window.scrollTo(0, 0);
}
/* c8 ignore stop */

const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sign_in|sso|auth|authenticate|session\/new)(\/|$)/i;
const failure = (status, reason) => ({ status, reason });

// One capture with an open browser. Returns { status: 'ready', ... } or { status: 'blocked'|'login_required'|'unavailable', reason }.
// A fresh browser context per capture (own cookies and storage, closed after), so a reused session carries nothing over.
export async function capturePage(browser, url, { fetcher = fetch } = {}) {
  const context = await browser.createBrowserContext();
  try { return await captureIn(context, url, fetcher); } finally { await context.close().catch(() => {}); }
}

async function captureIn(context, url, fetcher) {
  const cache = new Map(), t0 = Date.now(), times = {};
  const mark = name => { times[name] = Date.now() - t0; };
  let blockedNavigation = null, blockedRequests = 0;
  const page = await context.newPage();
  // One tile tall, so each tile is shot from the viewport: a clip beyond the viewport re-renders the whole page per shot
  // (about 15 s a tile on a long article, measured on Browser Run). shortcut: fixed and sticky bars repeat on every tile.
  await page.setViewport({ width: L.width, height: L.tile, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const verdict = await checkRequest(request.url(), { fetcher, cache });
      if (!verdict.ok) {
        // A refused redirect hop of the page itself makes goto fail; report why (an iframe's only matters if goto fails).
        if (request.isNavigationRequest()) blockedNavigation = verdict;
        blockedRequests += 1;
        return await request.abort('blockedbyclient');
      }
      // A fresh browser holds no learner cookie; never send one or an Authorization header anyway.
      const headers = { ...request.headers() };
      for (const name of Object.keys(headers)) if (/^(cookie|authorization)$/i.test(name)) delete headers[name];
      await request.continue({ headers });
    } catch { /* the request already finished or the page closed */ }
  });
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout: L.navigateMs });
  } catch (error) {
    if (blockedNavigation) return failure(blockedNavigation.kind, blockedNavigation.reason);
    const message = String(error?.message || error);
    console.error('webpage capture: navigation failed', message.slice(0, 300));
    // Browser Run's own egress policy refuses some private addresses before our guard sees them.
    if (/ERR_BLOCKED_BY_ADMINISTRATOR|ERR_BLOCKED_BY_CLIENT/.test(message)) return failure('blocked', 'This address cannot be captured.');
    if (/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION/.test(message)) return failure('unavailable', 'This site could not be found.');
    if (/timeout/i.test(error?.name || '') || /timeout/i.test(message)) return failure('unavailable', 'This page took too long to load.');
    return failure('unavailable', 'This page could not be loaded.');
  }
  if (blockedNavigation) return failure(blockedNavigation.kind, blockedNavigation.reason);
  const code = response?.status?.() ?? 200;
  if ([401, 403, 407].includes(code)) return failure('login_required', 'This page needs a sign-in, so it cannot be captured.');
  if (code >= 400) return failure('unavailable', `This page answered with an error (${code}).`);
  mark('load');
  await page.waitForNetworkIdle?.({ idleTime: 500, timeout: L.idleMs }).catch(() => {});
  mark('idle');
  const finalUrl = page.url();
  const facts = await page.evaluate(pageFacts);
  if ((facts.password && facts.textLength < 1500) || (LOGIN_PATH.test(new URL(finalUrl).pathname) && facts.textLength < 2000)) {
    return failure('login_required', 'This page needs a sign-in, so it cannot be captured.');
  }
  await page.evaluate(scrollThrough, Math.min(facts.height, L.height)).catch(() => {});
  mark('scroll');
  const pageHeight = Math.max(1, Math.ceil((await page.evaluate(pageFacts)).height || facts.height));
  const truncated = { height: pageHeight > L.height, bytes: false, text: false };
  const tiles = [];
  let total = 0;
  for (const tile of tilePlan(Math.min(pageHeight, L.height))) {
    await page.evaluate(scrollToY, tile.y);
    const bytes = new Uint8Array(await page.screenshot({ type: 'jpeg', quality: 72, clip: { x: 0, y: tile.y, width: L.width, height: tile.h }, captureBeyondViewport: false }));
    if (total + bytes.length > L.bytes) { truncated.bytes = true; break; }
    total += bytes.length;
    tiles.push({ ...tile, width: L.width, type: 'image/jpeg', bytes });
  }
  if (!tiles.length) return failure('unavailable', 'This page could not be captured.');
  const height = tiles.at(-1).y + tiles.at(-1).h;
  mark('tiles');
  const found = await page.evaluate(textRuns, L.chars, height);
  mark('text');
  console.log('webpage capture: ms', JSON.stringify(times), 'tiles', tiles.length, 'bytes', total, 'runs', found.runs.length, 'blocked', blockedRequests);
  truncated.text = !!found.truncated;
  const tileOf = y => tiles.reduce((at, t) => (t.y <= y ? t.index : at), 0);
  const runs = found.runs.filter(r => r.y < height).map(r => ({ ...r, tile: tileOf(r.y) }));
  const title = String(await page.title() || '').replace(/\s+/g, ' ').trim().slice(0, 300) || new URL(finalUrl).hostname;
  return { status: 'ready', title, finalUrl, pageHeight, height, tiles, runs, truncated, blockedRequests };
}

const reasonOf = s => ({ failed: 'Hidden: this page did not pass content screening.', inconclusive: 'Hidden: screening could not decide. Try again.', error: 'Hidden: screening did not finish. Try again.' }[s] || null);

// The reply every route gives (interface "Result").
function result({ status, reason = null, lineage, manifest = null, manifestRow = null, screening = null }) {
  const ready = status === 'ready' && manifest && manifestRow;
  return {
    status, reason, lineage: lineage || manifest?.lineage || null, manifestId: manifestRow?.id || null,
    title: ready ? manifest.title : null, finalUrl: ready ? manifest.finalUrl : null, screening,
    capture: ready ? { lineage: manifest.lineage, manifestId: manifestRow.id, sha256: manifestRow.sha256, capturedAt: Date.parse(manifest.fetchedAt),
      finalUrl: manifest.finalUrl, width: manifest.width, height: manifest.height, truncated: manifest.truncated } : null,
    fileRef: ready ? { v: 1, source: { id: manifestRow.id, rev: manifestRow.sha256 }, family: 'webpage',
      meta: { name: manifestRow.name, type: 'application/json', size: manifestRow.bytes, title: manifest.title },
      bundle: [...manifest.tiles.map(t => ({ role: 'tile', index: t.index, source: { id: t.key, rev: t.sha256 } })), { role: 'text', source: { id: manifest.text.key, rev: manifest.text.sha256 } }] } : null,
  };
}

// Stores one ready capture as 'uploading' rows; returns { manifest, manifestRow, ids }.
async function store(env, owner, app, boardRow, lineage, url, page, now) {
  const bucket = learnMedia(env), db = env.LEARN_DB;
  const rows = [];
  const put = async (bytes, type, kind, name) => {
    const id = `fs_${randomHex(12)}`, sha = await digest(bytes), key = `file-sources/${id}/original/${sha}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { source: id, webpage: lineage }, sha256: sha });
    rows.push({ id, type, kind, name, bytes: bytes.length, sha, key });
    return { id, sha };
  };
  const tiles = [];
  for (const t of page.tiles) {
    const saved = await put(t.bytes, 'image/jpeg', 'webpage-tile', `${page.title} tile ${t.index + 1}.jpg`);
    tiles.push({ index: t.index, y: t.y, h: t.h, key: saved.id, sha256: saved.sha, type: 'image/jpeg' });
  }
  const text = await put(encode({ runs: page.runs }), 'application/json', 'webpage-text', `${page.title} text.json`);
  const manifest = { v: 1, lineage, url, finalUrl: page.finalUrl, title: page.title, fetchedAt: new Date(now).toISOString(), width: L.width,
    height: page.height, pageHeight: page.pageHeight, tiles, text: { key: text.id, sha256: text.sha, chars: page.runs.reduce((n, r) => n + r.text.length, 0) },
    truncated: page.truncated, blockedRequests: page.blockedRequests || 0, screening: { status: 'pending', reason: null } };
  const saved = await put(encode(manifest), 'application/json', 'webpage-manifest', `${page.title} (webpage capture).json`);
  await db.batch(rows.map(r => db.prepare(`INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'webpage', ?, ?, ?, ?, ?, ?, 'uploading', ?)`).bind(r.id, owner.org, owner.email, app, boardRow.id, r.name.slice(0, 200), r.type, r.kind, r.bytes, r.sha, r.key, now)));
  const manifestRow = await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(saved.id).first();
  return { manifest, manifestRow };
}

const versionIds = manifest => [...manifest.tiles.map(t => t.key), manifest.text.key];

// Screens one stored version and applies the verdict: passed -> every row 'stored'; failed -> rows 'failed', bytes deleted;
// inconclusive or error -> rows stay 'uploading' (Retry). The verdict is kept beside it in R2.
async function screenVersion(env, owner, manifestRow, manifest, deps, tiles = null) {
  const bucket = learnMedia(env), db = env.LEARN_DB, now = deps.now();
  await bucket.put(statusKey(manifestRow.id), encode({ status: 'pending', reason: null, at: now }), { httpMetadata: { contentType: 'application/json' } });
  if (!tiles) {
    tiles = [];
    for (const t of manifest.tiles) {
      const row = await db.prepare('SELECT r2_key FROM file_sources WHERE id = ?').bind(t.key).first();
      const object = row && await bucket.get(row.r2_key);
      if (!object) return finishScreen(env, owner, manifestRow, manifest, { status: 'error', reason: 'A capture tile is missing.' });
      tiles.push({ index: t.index, y: t.y, h: t.h, width: L.width, type: t.type, bytes: new Uint8Array(await object.arrayBuffer()) });
    }
  }
  const textRow = await db.prepare('SELECT r2_key FROM file_sources WHERE id = ?').bind(manifest.text.key).first();
  const textObject = textRow && await bucket.get(textRow.r2_key);
  const text = textObject ? (JSON.parse(await textObject.text()).runs || []).map(r => r.text).join('\n') : '';
  let verdict, timer;
  try {
    verdict = await Promise.race([(deps.screen || screenCapture)(env, manifest, tiles, text),
      new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'error', reason: 'Screening took too long.' }), L.screenMs); })]);
  } catch (error) { verdict = { status: 'error', reason: String(error?.message || error).slice(0, 200) }; }
  finally { clearTimeout(timer); }
  if (!['passed', 'failed', 'inconclusive', 'error'].includes(verdict?.status)) verdict = { status: 'error', reason: 'Screening gave no verdict.' };
  return finishScreen(env, owner, manifestRow, manifest, verdict);
}

async function finishScreen(env, owner, manifestRow, manifest, verdict) {
  const bucket = learnMedia(env), db = env.LEARN_DB, now = Date.now(), ids = [manifestRow.id, ...versionIds(manifest)];
  const screening = { status: verdict.status, reason: verdict.reason || reasonOf(verdict.status), ...(verdict.policy ? { policy: verdict.policy } : {}) };
  await bucket.put(statusKey(manifestRow.id), encode({ ...screening, at: now }), { httpMetadata: { contentType: 'application/json' } });
  const mine = `id IN (SELECT value FROM json_each(?)) AND org = ? AND owner_email = ? AND status = 'uploading'`;
  if (verdict.status === 'passed') {
    await db.prepare(`UPDATE file_sources SET status = 'stored', stored_at = ? WHERE ${mine}`).bind(now, JSON.stringify(ids), owner.org, owner.email).run();
    const row = await db.prepare('SELECT * FROM file_sources WHERE id = ?').bind(manifestRow.id).first();
    return result({ status: 'ready', manifest, manifestRow: row, screening });
  }
  if (verdict.status === 'failed') {
    const keys = (await db.prepare(`SELECT r2_key FROM file_sources WHERE ${mine}`).bind(JSON.stringify(ids), owner.org, owner.email).all()).results.map(r => r.r2_key);
    await db.prepare(`UPDATE file_sources SET status = 'failed', deleted_at = ? WHERE ${mine}`).bind(now, JSON.stringify(ids), owner.org, owner.email).run();
    await Promise.allSettled(keys.map(key => bucket.delete(key)));
    return result({ status: 'blocked', reason: screening.reason, manifest, manifestRow, screening });
  }
  return result({ status: verdict.status, reason: screening.reason, manifest, manifestRow, screening });
}

// Unreferenced webpage files of this owner: stored ones after 30 days (an undo or an offline save may still name them),
// unscreened ones after a day. Forks and shared boards hold their own file_source_refs rows, so they keep theirs.
export async function sweepWebpageSources(env, owner, now = Date.now()) {
  const db = env.LEARN_DB, bucket = learnMedia(env);
  const rows = (await db.prepare(`SELECT id, r2_key, declared_type FROM file_sources s WHERE org = ? AND owner_email = ? AND family = 'webpage'
    AND ((status = 'stored' AND created_at < ?) OR (status = 'uploading' AND created_at < ?))
    AND NOT EXISTS (SELECT 1 FROM file_source_refs r WHERE r.source_id = s.id) LIMIT 200`).bind(owner.org, owner.email, now - L.keepUnreferencedMs, now - L.keepUploadingMs).all()).results;
  if (!rows.length) return 0;
  await db.prepare(`UPDATE file_sources SET status = 'deleted', deleted_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM file_source_refs r WHERE r.source_id = file_sources.id)`)
    .bind(now, JSON.stringify(rows.map(r => r.id))).run();
  const gone = new Set((await db.prepare(`SELECT id FROM file_sources WHERE status = 'deleted' AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(rows.map(r => r.id))).all()).results.map(r => r.id));
  await Promise.allSettled(rows.filter(r => gone.has(r.id)).flatMap(r => [bucket.delete(r.r2_key), ...(r.declared_type === 'webpage-manifest' ? [bucket.delete(statusKey(r.id))] : [])]));
  return gone.size;
}

// An idle Browser Run session if one is open (new sessions are rate limited per account), else a new one kept alive a
// minute for the next capture. The route disconnects, never closes, so the session stays reusable.
async function launchBrowser(env) {
  const { default: puppeteer } = await import('@cloudflare/puppeteer');
  const open = await puppeteer.sessions(env.BROWSER).catch(error => { console.error('webpage capture: sessions failed', String(error?.message || error).slice(0, 200)); return []; });
  const idle = open.filter(s => !s.connectionId);
  console.log('webpage capture: sessions', open.length, 'idle', idle.length);
  for (const { sessionId } of idle) {
    try { return await puppeteer.connect(env.BROWSER, sessionId); } catch { /* taken by another request: try the next */ }
  }
  try { return await puppeteer.launch(env.BROWSER, { keep_alive: 60_000 }); } catch (error) {
    // New sessions are rate limited per account: wait for the next allowed one once, if it is near.
    const limits = /429/.test(String(error?.message)) && await puppeteer.limits(env.BROWSER).catch(() => null);
    console.log('webpage capture: limits', JSON.stringify(limits));
    const wait = limits?.timeUntilNextAllowedBrowserAcquisition;
    if (!(Number.isFinite(wait) && wait <= 15_000)) throw error;
    await new Promise(r => setTimeout(r, wait + 250));
    return puppeteer.launch(env.BROWSER, { keep_alive: 60_000 });
  }
}

async function ownerBoard(req, env, app, board, deps) {
  if (typeof app !== 'string' || !BOARD.test(String(board))) return json({ error: 'Name the canvas (app) and board' }, 400);
  const owner = await (deps.boardOwner || boardOwner)(req, env, app);
  if (owner instanceof Response) return owner;
  const row = await ownerRow(env, owner, app, board);
  if (!row) return json({ error: 'Save this board first.' }, 404);
  return { owner, row };
}

async function readManifest(env, owner, id) {
  if (!FS_ID.test(id)) return null;
  const row = await env.LEARN_DB.prepare("SELECT * FROM file_sources WHERE id = ? AND org = ? AND owner_email = ? AND family = 'webpage' AND declared_type = 'webpage-manifest'").bind(id, owner.org, owner.email).first();
  const object = row && ['uploading', 'stored'].includes(row.status) && await learnMedia(env).get(row.r2_key);
  return object ? { row, manifest: JSON.parse(await object.text()) } : row ? { row, manifest: null } : null;
}

export async function webpagesFetch(req, env, deps = {}) {
  const url = new URL(req.url), path = url.pathname;
  if (!webpagesRoute(path)) return null;
  if (!env.LEARN_DB || !learnMedia(env)) return json({ error: 'Webpage cards need the Learn database and media bucket on this worker.' }, 503);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin' }, 403);
  deps = { now: Date.now, fetcher: fetch, launch: launchBrowser, ...deps };
  const db = env.LEARN_DB;

  if (path === '/api/learn/webpages') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { app, board = 'main', url: raw, lineage: given } = body || {};
    if (given !== undefined && !(typeof given === 'string' && LINEAGE.test(given))) return json({ error: 'Bad capture lineage' }, 400);
    const access = await ownerBoard(req, env, app, board, deps);
    if (access instanceof Response) return access;
    const { owner, row } = access, lineage = given || `wc_${randomHex(12)}`;
    const checked = await checkUrl(raw, { fetcher: deps.fetcher });
    if (!checked.ok) return json({ ...result({ status: checked.kind, reason: checked.reason, lineage }), error: checked.reason }, checked.kind === 'blocked' ? 400 : 200);
    if (!env.BROWSER && !deps.browser) return json({ error: 'Webpage capture is not set up on this worker.' }, 503);
    const now = deps.now();
    const today = await db.prepare("SELECT count(*) AS n FROM file_sources WHERE org = ? AND owner_email = ? AND family = 'webpage' AND declared_type = 'webpage-manifest' AND created_at > ?")
      .bind(owner.org, owner.email, now - 86_400_000).first();
    if (today.n >= L.perDay) return json({ error: `You can capture ${L.perDay} webpages a day. Try again tomorrow.` }, 429);
    await sweepWebpageSources(env, owner, now).catch(() => {});
    let browser, page;
    try {
      browser = deps.browser || await deps.launch(env);
      page = await capturePage(browser, checked.url, { fetcher: deps.fetcher });
    } catch (error) {
      const busy = /429|limit/i.test(String(error?.message || error));
      console.error('webpage capture: browser failed', String(error?.message || error).slice(0, 300));
      return json(result({ status: 'unavailable', reason: busy ? 'Webpage capture is busy right now. Try again in a minute.' : 'This page could not be captured.', lineage }));
    } finally { await browser?.disconnect?.().catch(() => {}); }
    if (page.status !== 'ready') return json(result({ status: page.status, reason: page.reason, lineage }));
    const { manifest, manifestRow } = await store(env, owner, app, row, lineage, checked.url, page, now);
    return json(await screenVersion(env, owner, manifestRow, manifest, deps, page.tiles));
  }

  const [, id, screen] = path.match(/^\/api\/learn\/webpages\/([^/]+)(\/screen)?$/);
  const isScreen = !!screen;
  if (isScreen ? req.method !== 'POST' : req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  let params = Object.fromEntries(url.searchParams);
  if (isScreen) { try { params = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); } }
  const access = await ownerBoard(req, env, params?.app, params?.board || 'main', deps);
  if (access instanceof Response) return access;
  const found = await readManifest(env, access.owner, id);
  if (!found) return json({ error: 'Not available' }, 404);
  const { row, manifest } = found;
  if (row.status === 'stored') return json(result({ status: 'ready', manifest, manifestRow: row, screening: { status: 'passed', reason: null } }));
  if (row.status !== 'uploading' || !manifest) return json(result({ status: 'blocked', reason: reasonOf('failed'), lineage: null, manifestRow: row, screening: { status: 'failed', reason: reasonOf('failed') } }));
  const saved = await learnMedia(env).get(statusKey(row.id));
  const last = saved ? JSON.parse(await saved.text()) : { status: 'pending', at: row.created_at };
  const stale = last.status === 'pending' && deps.now() - (last.at || row.created_at) > L.staleMs;
  if (isScreen) {
    if (last.status === 'pending' && !stale) return json(result({ status: 'screening', manifest, manifestRow: row, screening: { status: 'pending', reason: null } }));
    return json(await screenVersion(env, access.owner, row, manifest, deps));
  }
  if (stale) return json(result({ status: 'error', reason: reasonOf('error'), manifest, manifestRow: row, screening: { status: 'error', reason: reasonOf('error') } }));
  const status = last.status === 'pending' ? 'screening' : last.status;
  return json(result({ status, reason: last.reason || reasonOf(last.status), manifest, manifestRow: row, screening: { status: last.status, reason: last.reason || null } }));
}
