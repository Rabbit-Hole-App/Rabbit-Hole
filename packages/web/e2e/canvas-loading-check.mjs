// The canvas loading skeleton (owner brief 2026-10-23; src/CanvasLoading.jsx): while a canvas loads, each surface shows its OWN
// shell - the owner's canvas, a share link (/b), an Explore canvas (/e), a member's canvas (/c) and the embeds (/embed/b, /embed/e)
// - never the retired "Learn" page, and the hand-over to the loaded canvas moves no header or canvas edge. The canvas GETs are held
// (the owner's canvas record, the shared board, the member board) so the loading state is on screen for certain; a MutationObserver
// installed before any page script records every "Learn" text node and retired loading placeholder from the first frame, and a
// requestAnimationFrame sampler records the header and canvas rectangles in every frame until the loaded page settles.
// Against the LOCAL stack only - it writes to local D1 and fresh browser profiles; never point it at a deployed worker. No model
// calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/canvas-loading-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-loading-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { email: `load-owner-${run}@example.com` }, member = { email: `load-member-${run}@example.com` };
owner.session = await sessionFor(owner.email, `loadown_${run}`);
member.session = await sessionFor(member.email, `loadmem_${run}`);
// Membership writes are control-plane routes (the dev worker does not serve them) and need that site's own Origin.
const api = async (who, path, { method = 'GET', body, origin = BASE } = {}) => {
  const response = await fetch(`${origin}${path}`, { method, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const need = (reply, what) => { if (reply.status < 200 || reply.status > 299) throw Error(`${what}: HTTP ${reply.status} ${JSON.stringify(reply.body).slice(0, 200)}`); return reply.body; };

// ---- one canvas, seen from every surface: the owner's page, its share link, its publication, a member, and both embeds ----
// A short title, so the owner header's real row and its skeleton wrap alike on a phone (two rows: title and menus, then actions).
const TITLE = 'Load check';
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SEED = { strokes: [], links: [], items: [], groups: [], areas: [], exchanges: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, ...style, text: 'Softmax' }] };
const canvas = need(await api(owner, '/api/canvases', { method: 'POST', body: { title: TITLE } }), 'create the canvas');
const boardPath = `/api/learn/boards/${canvas.name}/main`;
const view = need(await api(owner, `${boardPath}/share`, { method: 'POST', body: { shared: true, view: true, public_view: true, state: SEED } }), 'share the canvas').sharing.view;
need(await api(owner, `/api/apps/${canvas.name}/publish`, { method: 'POST', body: {} }), 'publish the canvas');
const saved = need(await api(owner, boardPath), 'read the board');
const publication = saved.sharing?.publication, boardId = saved.board_id;
if (!view || !publication || !boardId) throw Error(`setup: share ${!!view}, publication ${!!publication}, board id ${!!boardId}`);
const invited = need(await api(owner, `/api/learn/c/${boardId}/members`, { method: 'POST', body: { emails: [member.email] }, origin: CP }), 'invite the member').invited?.[0];
const inviteToken = String(invited?.test_invite_url || '').split('#')[1];
if (!inviteToken) throw Error('setup: no test invitation echo (the stack needs SMALL_ENV=test)');
const code = need(await api(member, '/api/learn/invites/code', { method: 'POST', body: { token: inviteToken }, origin: CP }), 'ask for the code').test_code;
if (need(await api(member, '/api/learn/invites/accept', { method: 'POST', body: { token: inviteToken, code }, origin: CP }), 'accept the invitation').joined !== true) throw Error('setup: the member did not join');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` - ${detail}`}`); };
const browser = await chromium.launch();
const errors = [];

// Installed before any page script: the retired texts and placeholders, anything an embed must never show, the loading shells
// seen, and one sample per frame of the header and canvas rectangles (consecutive equal frames counted, not repeated).
function recorder({ headerSel, canvasSel, forbidden }) {
  const log = window.__load = { learn: [], retired: [], forbidden: [], surfaces: [], frames: [], stable: 0 };
  const RETIRED_TEXT = /^(Opening the board|Opening the canvas)$/;
  const RETIRED_SEL = '[aria-label="Loading Learn"]';
  const text = node => {
    const value = (node.nodeValue || '').trim();
    if (value === 'Learn') log.learn.push(node.parentElement?.outerHTML.slice(0, 160) || value);
    else if (RETIRED_TEXT.test(value)) log.retired.push(value);
  };
  const element = node => {
    if (node.matches(RETIRED_SEL)) log.retired.push(RETIRED_SEL);
    if (forbidden && node.matches(forbidden)) log.forbidden.push(node.outerHTML.slice(0, 160));
    const surface = node.getAttribute('data-canvas-loading');
    if (surface && !log.surfaces.includes(surface)) log.surfaces.push(surface);
  };
  const scan = node => {
    if (node.nodeType === 3) return text(node);
    if (node.nodeType !== 1) return;
    element(node);
    for (const child of node.querySelectorAll('*')) element(child);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
  };
  new MutationObserver(records => { for (const record of records) { if (record.type === 'characterData') text(record.target); else record.addedNodes.forEach(scan); } })
    .observe(document, { childList: true, subtree: true, characterData: true });
  const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return r.width || r.height ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10) : null; };
  const tick = () => {
    const frame = { h: rect(headerSel), c: rect(canvasSel), loading: !!document.querySelector('[data-canvas-loading]'), dark: document.documentElement.classList.contains('dark'), wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
    const last = log.frames.at(-1), key = f => JSON.stringify([f.h, f.c, f.loading, f.dark, f.wide]);
    if (last && key(last) === key(frame)) { last.n += 1; log.stable = frame.loading ? 0 : last.n; } else { frame.n = 1; log.frames.push(frame); log.stable = 0; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// An embed shows its compact header only: never the full site's header, its menus, the owner's controls or another shell.
const EMBED_FORBIDDEN = '[role="menubar"], [data-compact-menu], [data-canvas-header], [data-share-button], [data-learn-home], [data-panel-toggle], [data-comments-header], [data-shared-brand], [data-panel-header], [aria-label="Learn agent chat"], [data-canvas-loading="owner"], [data-canvas-loading="shared"], [data-canvas-loading="member"]';
const luminance = rgb => { const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || []).map(Number); return (r + g + b) / 3; };

// One surface, loaded with its canvas GET held: the loading shell is measured, then the GET goes on and the loaded page settles.
async function surface({ tag, who = null, url, surface: kind, hold, slow = null, theme = 'light', width = 1440, height = 900, prefs = null, chatWidth = null, toolbar, embed = false }) {
  const context = await browser.newContext({ viewport: { width, height } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(([t, p, w]) => {
    localStorage.setItem('small.theme', t);
    if (p) localStorage.setItem('rh.ui-prefs', JSON.stringify(p));
    if (w) localStorage.setItem('rh.chat.width', String(w));
  }, [theme, prefs, chatWidth]);
  await context.addInitScript(recorder, embed
    ? { headerSel: '[data-loading-header], [data-embed-root] > header', canvasSel: '[data-loading-canvas], [aria-label="Lesson canvas"]', forbidden: EMBED_FORBIDDEN }
    : { headerSel: '[data-loading-header], [data-canvas-header]', canvasSel: '[data-loading-canvas], [aria-label="Lesson canvas"]', forbidden: null });
  let release, asked, held = 0;
  const gate = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { asked = resolve; });
  await context.route(request => new URL(request).pathname === hold, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    held += 1;
    asked();
    await gate;
    return route.continue();
  });
  // A slow network for the board's own reads after the hold (the owner's board GET): the brief's route delay, not a wait.
  if (slow) await context.route(request => new URL(request).pathname === slow, async route => { await new Promise(resolve => setTimeout(resolve, 600)); return route.continue(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${tag}: ${error.message}`));
  await page.goto(url);
  const loading = page.locator(`[data-canvas-loading="${kind}"]`);
  await loading.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-loading-header]') && document.querySelector('[data-loading-canvas]'));
  await Promise.race([arrived, new Promise(resolve => { setTimeout(resolve, 30000); })]); // the held GET has been asked for (else the first check fails)
  const during = await page.evaluate(() => {
    const root = document.querySelector('[data-canvas-loading]'), panel = document.querySelector('[data-loading-panel]');
    const box = node => { const r = node?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; };
    return { dark: document.documentElement.classList.contains('dark'), surfaceBg: getComputedStyle(panel || root).backgroundColor, rootBg: getComputedStyle(root).backgroundColor,
      panel: box(panel), toolbar: !!document.querySelector('[data-loading-toolbar]'), minimap: !!document.querySelector('[data-loading-minimap]'),
      openLink: !!document.querySelector('[data-canvas-loading] [data-embed-open]'), wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag.replace(/[^a-z0-9]+/gi, '-')}-loading.png` });
  release();
  await page.locator('[data-shape-id="seed-rect"]').first().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('[data-canvas-loading]') && window.__load.stable >= 20, null, { timeout: 30000 });
  const after = await page.evaluate(sel => {
    const header = document.querySelector(sel), main = header?.closest('main');
    return { rootBg: main ? getComputedStyle(main).backgroundColor : null, toolbar: !!document.querySelector('[role="toolbar"][aria-label="Canvas tools"]'), minimap: !!document.querySelector('[data-canvas-minimap]'),
      chatPanel: (() => { const r = document.querySelector('aside[aria-label="Learn agent chat"]')?.getBoundingClientRect(); return r ? Math.round(r.width) : null; })(),
      wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
  }, embed ? '[data-embed-root] > header' : '[data-canvas-header]');
  const log = await page.evaluate(() => window.__load);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag.replace(/[^a-z0-9]+/gi, '-')}-loaded.png` });

  // The frames from the first one with both a header and a canvas: none may lose either, and each is within 1px of the last.
  const first = log.frames.findIndex(f => f.h && f.c), tail = first < 0 ? [] : log.frames.slice(first), last = log.frames.at(-1);
  const off = (a, b) => (a && b ? Math.max(...a.map((v, i) => Math.abs(v - b[i]))) : Infinity);
  const gaps = tail.filter(f => !f.h || !f.c).length;
  const drift = tail.map(f => Math.max(off(f.h, last.h), off(f.c, last.c)));
  const worst = tail.filter((f, i) => drift[i] > 1).slice(0, 3).map(f => ({ h: f.h, c: f.c, loading: f.loading, frames: f.n }));
  check(`${tag}: its own loading shell shows while the canvas GET is held, and no other surface's shell ever does`, held >= 1 && log.surfaces.length === 1 && log.surfaces[0] === kind, JSON.stringify({ held, surfaces: log.surfaces }));
  check(`${tag}: no "Learn" text, retired loading label or old placeholder at any time from the first frame`, log.learn.length === 0 && log.retired.length === 0, JSON.stringify({ learn: log.learn.slice(0, 3), retired: log.retired.slice(0, 3) }));
  check(`${tag}: the canvas loads (its shape is drawn) and the loading shell is gone`, !last.loading && await page.locator('[data-canvas-loading]').count() === 0);
  check(`${tag}: header and canvas rectangles hold within 1px from the first loading frame to the settled page, with no blank frame`, first >= 0 && tail.some(f => f.loading) && gaps === 0 && worst.length === 0,
    JSON.stringify({ first, gaps, last: { h: last.h, c: last.c }, worst }));
  const darkFrames = tail.every(f => f.dark === (theme === 'dark'));
  check(`${tag}: the ${theme} theme is on in every frame, and the loading shell's surface follows it and matches the loaded page`, during.dark === (theme === 'dark') && darkFrames
    && (theme === 'dark' ? luminance(during.surfaceBg) < 128 : luminance(during.surfaceBg) > 128) && during.rootBg === after.rootBg, JSON.stringify({ during, after: after.rootBg }));
  check(`${tag}: the toolbar and minimap placeholders are exactly what the loaded canvas shows (View > Toolbar and Minimap, saved prefs)`, during.toolbar === toolbar && after.toolbar === toolbar && during.minimap === after.minimap && during.minimap === (prefs?.minimap !== false),
    JSON.stringify({ during: [during.toolbar, during.minimap], after: [after.toolbar, after.minimap] }));
  check(`${tag}: nothing scrolls sideways while it loads or after`, !during.wide && !after.wide && tail.every(f => !f.wide));
  if (embed) {
    check(`${tag}: no menubar, page header, menus or owner controls at any time, and Open in Rabbit Hole is there while it loads`, log.forbidden.length === 0 && during.openLink, JSON.stringify(log.forbidden.slice(0, 3)));
  }
  if (chatWidth) check(`${tag}: the loading panel keeps the saved Chat width (${chatWidth}px), the loaded panel's width`, during.panel?.w === chatWidth && after.chatPanel === chatWidth, JSON.stringify({ during: during.panel, after: after.chatPanel }));
  await context.close();
}

const PHONE = { width: 390, height: 844 };
const appHold = `/api/apps/${canvas.name}`, sharedHold = token => `/api/learn/boards/shared/${token}`;
await surface({ tag: 'owner canvas, desktop, light', who: owner, url: `${BASE}/apps/${canvas.name}`, surface: 'owner', hold: appHold, slow: boardPath, chatWidth: 460, toolbar: true });
await surface({ tag: 'owner canvas, phone, dark, minimap off', who: owner, url: `${BASE}/apps/${canvas.name}`, surface: 'owner', hold: appHold, slow: boardPath, theme: 'dark', ...PHONE, prefs: { minimap: false }, toolbar: true });
await surface({ tag: 'share link, desktop, light', url: `${BASE}/b/${view}`, surface: 'shared', hold: sharedHold(view), toolbar: true });
await surface({ tag: 'share link, phone, dark', url: `${BASE}/b/${view}`, surface: 'shared', hold: sharedHold(view), theme: 'dark', ...PHONE, toolbar: true });
await surface({ tag: 'Explore canvas, desktop, dark', url: `${BASE}/e/${publication}`, surface: 'shared', hold: sharedHold(publication), theme: 'dark', toolbar: true });
await surface({ tag: 'member canvas, desktop, light', who: member, url: `${BASE}/c/${boardId}`, surface: 'member', hold: `/api/learn/c/${boardId}/board`, toolbar: false });
await surface({ tag: 'embed of the share link, desktop, light', url: `${BASE}/embed/b/${view}?theme=light`, surface: 'embed', hold: sharedHold(view), toolbar: true, embed: true });
await surface({ tag: 'embed of the publication, phone, dark', url: `${BASE}/embed/e/${publication}?theme=dark`, surface: 'embed', hold: sharedHold(publication), theme: 'dark', ...PHONE, toolbar: true, embed: true });

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
// 8 surfaces x 7 checks, 2 embed checks, 1 saved panel width, no page errors.
const total = 60;
const failed = results.filter(ok => !ok).length;
if (results.length !== total) console.log(`FAIL ran ${results.length} checks, expected ${total}`);
console.log(`${results.length - failed}/${total} checks passed`);
process.exit(failed || results.length !== total ? 1 : 0);
