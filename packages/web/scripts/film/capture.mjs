// FILM RUNNER: ONE take script for every product video. The video is a film.config.json (beats, scripted routes, texts, ramp, checklist thresholds); this file is the engine.
// It records a take from the REAL Rabbit Hole canvas (the branch's dist-dev under `vite preview` on loopback): camera = a CSS transform on <body> (eased, never below 1x), injected cursor + click ring +
// key-cap sticker + caption + tooltip overlay, real clicks, every /api answered from the config's scripted routes and the answer bank. No model is ever asked: anything model-capable that is not
// scripted is logged UNSCRIPTED / ABORT and refused. The editorial layer lives in the recording page only, never in product code; the app sees camera-free rectangles (override below).
// Usage (from packages/web, `vite preview --outDir dist-dev --port 5480` running):
//   node scripts/film/capture.mjs <film.config.json> [outDir]          env: DSF (device scale, default config.dsf or 2; draft.mjs uses 1), SCREENCAST=1 (save every composed frame as a JPEG for render.mjs),
//                                                                       SHOTS=<dir> (a still after each `shot` beat), VIDEO=1 (reference webm), BASE (loopback only), FILM_DATA (folder of the per-video data: bank, markdown)
//   node scripts/film/capture.mjs <film.config.json> --dry             validates the config without a browser
// Output (outDir): requests.log, marks.json (script seconds since t0: typing/reveal/depth/hold/cut/dead/camera/hover/act/start/end), checks.json (what the beat checklist saw: assert.mjs reads it), frames/ + frames.json (SCREENCAST=1), poster.jpg.
// Nothing here runs under CI, a gate or a test: a film is footage, not a release (see README.md).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkConfig, resolveData } from './verbs.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const [CONFIG, OUTARG] = args.filter(a => !a.startsWith('--'));
if (!CONFIG) throw Error('usage: node capture.mjs <film.config.json> [outDir] [--dry]');
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const DATA = process.env.FILM_DATA || dirname(resolve(CONFIG));
const { errors, warnings } = checkConfig(cfg, DATA);
for (const w of warnings) console.error(`WARN ${w}`);
if (errors.length) { for (const e of errors) console.error(`CONFIG ${e}`); process.exit(2); }
if (DRY) { console.log(`config ok: ${cfg.beats.length} beats, ${(cfg.routes?.artifacts?.queue || []).length} banked cards, ${warnings.length} warning(s)`); process.exit(0); }

const WEB = process.cwd();
const { chromium } = createRequire(join(WEB, 'package.json'))('@playwright/test');
const OUT = OUTARG || join(DATA, 'runs', `${cfg.name}-take`);
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || cfg.base || 'http://127.0.0.1:5480';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error('capture runs against a loopback preview only');
const DSF = Number(process.env.DSF || cfg.dsf || 2), VW = cfg.viewport.w, VH = cfg.viewport.h;
const bank = cfg.files?.bank ? JSON.parse(readFileSync(resolveData(cfg, cfg.files.bank, DATA), 'utf8')) : {};
const fileBuffers = Object.fromEntries(Object.entries(cfg.files || {}).filter(([k]) => k !== 'bank').map(([k, f]) => [k, readFileSync(resolveData(cfg, f, DATA))]));
const R = cfg.routes || {}, TH = { skeletonMinMs: 1200, centreTol: 0.12, tooltipMinMs: 700, tooltipDelayMs: 250, deadMax: 1.2, ...(cfg.checklist || {}) };
const texts = cfg.texts || {};
const T = x => (typeof x === 'string' && x.startsWith('@') && texts[x.slice(1)] !== undefined ? texts[x.slice(1)] : x);

const APP = cfg.app.id, ORG = cfg.app.org || 'demo-team', EMAIL = `${cfg.app.emailLocal || 'learner'}@${cfg.app.emailDomain || 'example.invalid'}`;
const canvas = { name: APP, title: cfg.app.title || 'Canvas', description: '', kind: 'canvas', hosting: 'canvas', org: ORG, orgName: cfg.app.orgName || 'Demo', email: EMAIL, owner_email: EMAIL,
  visibility: 'private', members: [], teams: [], published: false, shared: false, board_saved: true, access: 'private', canView: true, canEdit: true,
  url: `/apps/${APP}`, inputs: {}, outputs: {}, created_at: '2026-11-13T12:00:00Z', deployed_at: '2026-11-13T12:00:00Z', observations: [], schedule: null };
const boardState = { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], exchanges: [], sources: [], ...(cfg.board?.state || {}) };
const board = { version: 1, board_id: '00000000-0000-4000-8000-000000000001', updated_by: 'film', updated_at: '2026-11-13T12:00:00.000Z', title: null, forked: false,
  sharing: { shared: false, view: null, edit: null, public_view: false }, state: boardState };
const replies = {
  '/api/profile': { name: cfg.app.profileName || 'Learner', avatar: null, handle: 'learner', description: '' }, // HandleGate (main.jsx) asks for a handle when the profile has none
  '/api/apps': { org: ORG, orgName: canvas.orgName, email: EMAIL, apps: [canvas], folders: [] },
  [`/api/apps/${APP}`]: canvas,
  [`/api/apps/${APP}/learn-course`]: { course: null, canAuthor: true },
  '/api/workspaces': { active: ORG, email: EMAIL, workspaces: [{ slug: ORG, name: canvas.orgName, role: 'owner', kind: 'custom' }] },
  [`/api/learn/boards/${APP}/main`]: board,
  '/api/learn/cad/jobs': { blocks: [] },
  ...Object.fromEntries(Object.entries(R.static || {}).map(([path, json]) => [path.replace('{app}', APP), json])),
};
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const { chatRouteAnswer } = await import(pathToFileURL(join(WEB, 'e2e/dev-cp.mjs')).href);

const log = [];
const marks = { typing: [], reveal: [], depth: [], hold: [], cut: [], dead: [], camera: [], hover: [], act: [], upload: [] };
const obs = { pills: [], skeletons: [], centred: [], tooltips: [], menus: [], chat: [], expects: [] };
const THREAD = R.ask?.threadId || `canvaschat-${APP.slice(7)}-film`;
const settingsState = { depth: R.settings?.depth || 'balanced', autoSuggest: true, rev: 0 };
const artifactQueue = structuredClone(R.artifacts?.queue || []);
const fileState = { id: R.files?.store?.fileId || 'fs_film_file', rev: null };
let quiet = 0;
const browser = await chromium.launch({});
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, reducedMotion: 'no-preference',
  ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size: { width: VW, height: VH } } } : {}) });
let t0 = Date.now();
const at = () => Number(((Date.now() - t0) / 1000).toFixed(2));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (url.origin !== BASE) { log.push(`ABORT outside ${url.hostname}`); return route.abort(); }
  if (!path.startsWith('/api/')) return route.continue();
  log.push(`${at()} ${method} ${path}`);
  // The Depth menu reads and writes the learner's settings (learn-settings.js): answered from the script so "Could not load your Depth setting" never shows, and the chosen level sticks.
  if (R.settings && path === '/api/learn/user-settings') {
    if (method === 'POST') { const body = request.postDataJSON() || {}; if (body.depth) { settingsState.depth = body.depth; settingsState.rev += 1; } if (typeof body.autoSuggest === 'boolean') settingsState.autoSuggest = body.autoSuggest; }
    return route.fulfill({ json: { learner: 'film-learner', settings: { depth: settingsState.depth, autoSuggest: settingsState.autoSuggest }, depthRevision: settingsState.rev } });
  }
  // The roadmap poll answered 404 without the "disabled" code makes the page re-ask in a tight loop (31,751 GETs in one take, which froze the page): scripted as the product's own "roadmap off".
  if (R.roadmapDisabled && path.startsWith('/api/learn/roadmap')) return route.fulfill({ status: 404, json: { error: 'Not available', code: 'roadmap_disabled' } });
  if (path === '/api/learn/chat/route') { const asked = request.postDataJSON() || {}; return route.fulfill({ json: chatRouteAnswer(asked) }); }
  if (R.ask && path === '/api/learn/ask' && method === 'POST') {
    const asked = request.postDataJSON() || {};
    log.push(`ASK ${JSON.stringify(String(asked.message || '').slice(0, 90))} target=${asked.canvas_target?.kind || '-'}`);
    for (const rule of R.ask.answers || []) {
      if ((!rule.targetKind || asked.canvas_target?.kind === rule.targetKind) && new RegExp(rule.messageRegex || '.').test(asked.message || '')) {
        // the captured answer of a real call on a local stack, replayed as the same SSE frames; only the thread id is this take's
        return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: bank[rule.bank].sse.replace(/"threadId":"[^"]*"/g, `"threadId":"${THREAD}"`) });
      }
    }
    // Every other ask (the Tutor's reaction after a card) gets a quiet stream: no text, no model. `ok: true` on `done` matters: without it the chat stays "busy" and hides the cards' suggestions.
    quiet += 2;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: frame('chunk', { text: '​' }) + frame('answer_meta', { messageId: String(100 + quiet), actions: [], followUps: [], alternatives: [String(100 + quiet)], kind: 'answer' })
      + frame('done', { ok: true, threadId: THREAD, userMessageId: String(99 + quiet), messageId: String(100 + quiet) }) });
  }
  if (R.explainJobsDisabled && path === '/api/learn/explain/jobs' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available', code: 'explain_disabled' } });
  // Ctrl+K (the inline editor): its request check says "proceed" for the written explanation, its router question has no answer, and the card it generates is the next banked answer.
  if (R.inline && path === '/api/learn/inline/decide' && method === 'POST') { log.push('SCRIPTED inline decide'); return route.fulfill({ json: { decision: 'proceed', route: R.inline.route || { capability: 'explain', outcome: 'card' }, paid: false, token: 'film-token' } }); }
  if (R.inline && path === '/api/learn/inline/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available' } });
  if (R.inline && path === '/api/learn/inline/telemetry' && method === 'POST') return route.fulfill({ json: { ok: true } });
  if (R.artifacts && (R.artifacts.paths || ['/api/learn/artifact', '/api/learn/inline/generate']).includes(path) && method === 'POST') {
    const next = artifactQueue.shift();
    if (!next) { log.push('UNSCRIPTED artifact'); return route.fulfill({ status: 503, json: { error: 'unscripted' } }); }
    const [key, delay] = next, start = at();
    await sleep(delay); // the spinner is part of the footage
    marks.reveal.push([start, at() + 1.2]);
    log.push(`SCRIPTED artifact ${key} after ${delay} ms: ${JSON.stringify(request.postDataJSON()?.args || '').slice(0, 90)}`);
    return route.fulfill({ json: structuredClone(bank[key].response) });
  }
  // An uploaded file's save (file-source-client.js uploadSource): POST names the file by sha256; "already stored" (upload: null) answers the source at that revision, after a scripted wait the card shows as its upload.
  if (R.files?.store && path === (R.files.store.path || '/api/learn/files') && method === 'POST') {
    const sent = request.postDataJSON() || {}, wait = R.files.store.delayMs || 1300;
    log.push(`SCRIPTED file store ${JSON.stringify({ name: sent.name, size: sent.size, family: sent.family })}`);
    await sleep(wait);
    fileState.rev = sent.sha256;
    marks.reveal.push([at() - wait / 1000, at() + 0.6]);
    return route.fulfill({ json: { source: { id: fileState.id, rev: sent.sha256, family: sent.family || 'markdown', name: sent.name, type: sent.type || '', size: sent.size, status: 'stored' }, upload: null } });
  }
  if (R.sourceRefs && path === '/api/learn/source-refs' && method === 'POST') return route.fulfill({ json: { ref: { id: 'sr_film', status: 'current' } } });
  if (R.sourceRefs && path === '/api/learn/source-refs/resolve' && method === 'POST') return route.fulfill({ json: { refs: [] } });
  if (new RegExp(R.abortModelRegex || '^\\/api\\/learn\\/(tutor\\/|assess|grade|home-ask|image|inline\\/|journey|scene|video|transcribe|tts|voice\\/|dive|explore|course)').test(path) && method !== 'GET') { log.push(`ABORT model-capable ${path}`); return route.fulfill({ status: 503, json: { error: 'not scripted' } }); }
  if (path === '/api/telemetry/client') return route.fulfill({ json: { ok: true } });
  // A file card lists its highlights (pdf-highlights.js listHighlights): none yet, for this revision (the selection toolbar is offered only when the answer names the card's revision).
  if (path === '/api/learn/pdf-highlights' && method === 'GET') return route.fulfill({ json: { highlights: [], sha256: fileState.rev, changed: 0 } });
  if (path.startsWith('/api/learn/files/') && method === 'GET') {
    if (/\/(text|highlights)\b/.test(path)) return route.fulfill({ json: { highlights: [], sha256: fileState.rev, changed: 0 } });
    return route.fulfill({ status: 200, headers: { 'Content-Type': R.files?.serveType || 'text/markdown; charset=utf-8' }, body: fileBuffers[R.files?.serve || 'markdown'] || '' });
  }
  if (method !== 'GET') return route.fulfill({ json: { ok: true, version: 2 } });
  if (path === '/api/canvases/dives') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (path === '/api/ask/threads') return route.fulfill({ json: { threads: [] } });
  if (path === '/api/learn/chat/active') return route.fulfill({ json: { threadId: null } });
  if (path.startsWith(`/api/learn/boards/${APP}/`) && path.split('/').length === 6) return route.fulfill({ json: replies[`/api/learn/boards/${APP}/main`] });
  if (path.endsWith('/main/assets')) return route.fulfill({ json: { keys: [] } });
  if (path in replies) return route.fulfill({ json: replies[path] });
  if (['/api/watch', '/api/learn/usage', '/api/learn/graph-config', '/api/learn/image-jobs'].includes(path)) return route.fulfill({ json: {} });
  log.push(`404 ${path}`);
  return route.fulfill({ status: 404, json: { error: 'Not found' } });
});

// The recording page's editorial layer (never product code): cursor, click ring, key-cap sticker, caption, tooltip overlay, and the camera-free rectangle override.
await context.addInitScript(({ noOverride, tipSelector, tipDelay, keys }) => {
  const install = () => {
    if (document.getElementById('rh-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `html{overflow:hidden}body{transform-origin:0 0;transition:transform var(--cam,0ms) cubic-bezier(.65,0,.35,1)}
      #rh-cursor{position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;width:26px;height:32px;margin:-2px 0 0 -3px;filter:drop-shadow(0 1px 2px #0005);transition:left .38s cubic-bezier(.3,.1,.2,1),top .38s cubic-bezier(.3,.1,.2,1)}
      #rh-ring{position:fixed;z-index:2147483646;pointer-events:none;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#2383e233;border:2px solid #2383e2aa;opacity:0}
      #rh-ring.on{animation:rh-ring .5s ease-out}
      @keyframes rh-ring{0%{opacity:1;transform:scale(.35)}100%{opacity:0;transform:scale(1.15)}}
      #rh-key{position:fixed;left:50%;top:9%;z-index:2147483645;pointer-events:none;display:flex;gap:10px;transform:translateX(-50%) scale(.9);opacity:0;transition:opacity .18s,transform .18s}
      #rh-key.on{opacity:1;transform:translateX(-50%) scale(1)}
      #rh-key span{font:600 30px/1 Inter,system-ui,sans-serif;color:#20211f;background:#fff;border:2px solid #20211f;border-bottom-width:6px;border-radius:12px;padding:12px 20px;box-shadow:0 8px 24px #0003}`;
    const cursor = document.createElement('div');
    cursor.id = 'rh-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 32 40" width="26" height="32"><path d="M3 2v29l8-7 6 13 6-3-6-12h12Z" fill="white" stroke="#20211f" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.id = 'rh-ring';
    const keycap = document.createElement('div');
    keycap.id = 'rh-key';
    keycap.innerHTML = keys.map(k => `<span>${k}</span>`).join('');
    document.documentElement.append(style, ring, cursor, keycap);
    window.__key = () => { keycap.classList.add('on'); setTimeout(() => keycap.classList.remove('on'), 1200); }; // the key-cap sticker shows for 1.2 s
    const caption = document.createElement('div');
    caption.id = 'rh-cap';
    caption.style.cssText = 'position:fixed;left:50%;bottom:7%;z-index:2147483645;pointer-events:none;transform:translateX(-50%);opacity:0;transition:opacity .25s;font:600 30px/1.2 Inter,system-ui,sans-serif;color:#fff;background:#20211fe6;border-radius:14px;padding:14px 26px;box-shadow:0 8px 24px #0004';
    document.documentElement.append(caption);
    // The browser's own title tooltip is not drawn in a headless capture: a control matching tipSelector shows its title the way a tooltip would, after tipDelay ms of hover.
    const tip = document.createElement('div');
    tip.id = 'rh-tip';
    tip.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .15s;font:500 22px/1.2 Inter,system-ui,sans-serif;color:#fff;background:#20211fee;border-radius:8px;padding:8px 14px;white-space:nowrap;transform:translateX(-50%)';
    document.documentElement.append(tip);
    let tipTimer = 0;
    addEventListener('mouseover', event => {
      const el = tipSelector && event.target.closest && event.target.closest(tipSelector);
      clearTimeout(tipTimer);
      if (!el) { tip.style.opacity = '0'; return; }
      tipTimer = setTimeout(() => { const r = elementRect.call(el); tip.textContent = el.getAttribute('title') || el.getAttribute('aria-label') || ''; tip.style.left = `${r.left + r.width / 2}px`; tip.style.top = `${r.bottom + 10}px`; tip.style.opacity = '1'; }, tipDelay);
    }, true);
    addEventListener('mousedown', () => { clearTimeout(tipTimer); tip.style.opacity = '0'; }, true);
    window.__cap = (text, ms) => { caption.textContent = text; caption.style.opacity = '1'; setTimeout(() => { caption.style.opacity = '0'; }, ms); };
    addEventListener('mousemove', event => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; }, true);
    addEventListener('mousedown', event => { ring.style.left = `${event.clientX}px`; ring.style.top = `${event.clientY}px`; ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on'); }, true);
  };
  // The camera is a CSS transform on <body>. The canvas places things (the selection toolbar, the Ctrl+K window, a card made from a passage) from client rectangles, so with the camera on it would
  // compute from camera pixels. These rectangles are therefore given camera-free (the app works in the untransformed layout; the transform only shows it larger). The runner reads raw rectangles
  // (window.__rawRects = true) when it needs screen pixels for the mouse.
  const cam = () => { const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec((document.body && document.body.style.transform) || ''); return m ? { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) } : null; };
  const fix = r => { const c = window.__rawRects ? null : cam(); return c && r ? new DOMRect((r.left - c.tx) / c.s, (r.top - c.ty) / c.s, r.width / c.s, r.height / c.s) : r; };
  const elementRect = Element.prototype.getBoundingClientRect, rangeRect = Range.prototype.getBoundingClientRect;
  if (!noOverride) {
    Element.prototype.getBoundingClientRect = function () { return fix(elementRect.call(this)); };
    Range.prototype.getBoundingClientRect = function () { return fix(rangeRect.call(this)); };
  }
  // Long tasks (main thread blocked) are logged so a frozen stretch in the footage is explained: render.mjs cuts the ones over 3 s.
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.duration > 400) console.error(`LONGTASK ${Math.round(e.duration)} ms at ${Math.round(e.startTime)}`); }).observe({ entryTypes: ['longtask'] }); } catch { /* no longtask support */ }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
}, { noOverride: !!process.env.NOOVERRIDE, tipSelector: cfg.tooltip?.selector || '[data-ask]', tipDelay: TH.tooltipDelayMs, keys: cfg.sticker?.keys || ['Ctrl', 'K'] });

const page = await context.newPage();
// SCREENCAST=1: every frame the browser composes is saved as a JPEG with its timestamp (Page.startScreencast): render.mjs builds the film from these, not from Playwright's 1 Mbit/s video.
// The screencast never exceeds the CSS size (1920x1080 whatever the device scale, measured): true 4K needs the frame-stepped route in experimental/capture-step.mjs.
const frameDir = join(OUT, 'frames'), frameLog = [];
let cdp = null; const frameWrites = [];
if (process.env.SCREENCAST) {
  mkdirSync(frameDir, { recursive: true });
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', event => {
    const n = frameLog.length;
    frameLog.push({ n, ts: event.metadata.timestamp, w: event.metadata.deviceWidth, h: event.metadata.deviceHeight, off: event.metadata.offsetTop });
    frameWrites.push(import('node:fs/promises').then(fs => fs.writeFile(join(frameDir, `f${String(n).padStart(6, '0')}.jpg`), Buffer.from(event.data, 'base64'))));
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: VW * DSF, maxHeight: VH * DSF, everyNthFrame: 1 });
}
t0 = Date.now();
page.on('pageerror', error => log.push(`PAGEERROR ${error.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error') log.push(`CONSOLE ${m.text().slice(0, 300)}`); });

// ---- locators: a css string, "@name" (cfg.locators), or { css | role+name(+nameRegex) | text(+exact), within, hasText, hasExactText, nth, first }
const L = (spec, scope = page) => {
  if (typeof spec === 'string') return spec.startsWith('@') ? L(cfg.locators[spec.slice(1)], scope) : scope.locator(spec);
  const base = spec.within ? L(spec.within, scope) : scope;
  let l = spec.role ? base.getByRole(spec.role, spec.nameRegex ? { name: new RegExp(spec.nameRegex) } : spec.name ? { name: spec.name } : {})
    : spec.text ? base.getByText(spec.text, { exact: !!spec.exact }) : base.locator(spec.css);
  if (spec.hasText) l = l.filter({ hasText: spec.hasText });
  if (spec.hasExactText) l = l.filter({ has: page.getByText(spec.hasExactText, { exact: true }) });
  if (spec.nth !== undefined) l = l.nth(spec.nth); else if (spec.first) l = l.first();
  return l;
};
const cardWith = b => L({ css: '[data-block-id]', ...(b.titleExact ? { hasExactText: b.title } : { hasText: b.title }), first: true });

// ---- the camera, the cursor, the pauses
let cam = { s: 1, tx: 0, ty: 0 };
const pause = ms => { const a = at(); (ms >= 900 ? marks.hold : marks.act).push([a, a + ms / 1000]); return page.waitForTimeout(ms); }; // a pause of 0.9 s or more is a read hold (1.0x in the ramp); shorter ones are plain activity
const camera = async (r, ms = 550, max = 2.4, free = false) => {
  const s = Math.min(max, Math.max(1, Math.min(VW / r.w, VH / r.h)));
  let tx = VW / 2 - s * (r.x + r.w / 2), ty = VH / 2 - s * (r.y + r.h / 2);
  // free: the subject is centred exactly even at the screen's edge (the margin beyond the canvas is blank page); otherwise the camera never shows past the page.
  if (!free) { tx = Math.min(0, Math.max(VW - s * VW, tx)); ty = Math.min(0, Math.max(VH - s * VH, ty)); }
  cam = { s, tx, ty };
  const a = at();
  await page.evaluate(([c, d]) => { document.body.style.setProperty('--cam', `${d}ms`); document.body.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`; }, [cam, ms]);
  await page.waitForTimeout(ms + 60);
  marks.camera.push([a, at()]);
};
const rectOf = async (locator, pad = 0) => {
  const b = await locator.boundingBox();
  return { x: (b.x - cam.tx) / cam.s - pad, y: (b.y - cam.ty) / cam.s - pad, w: b.width / cam.s + 2 * pad, h: b.height / cam.s + 2 * pad };
};
const union = (...rs) => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
const screenUnion = boxes => { const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y)); return { x, y, w: Math.max(...boxes.map(b => b.x + b.width)) - x, h: Math.max(...boxes.map(b => b.y + b.height)) - y }; };
// The page re-renders slowly under the camera (software raster): a mouse.move step waits a frame, so the cursor overlay eases on its own (CSS) and the page gets a few move events.
let lastX = 0, lastY = 0;
const glide = async (x, y, steps = 14) => {
  const a = at(), d = Math.hypot(x - lastX, y - lastY);
  await page.mouse.move(x, y, { steps: Math.min(steps, 4) });
  lastX = x; lastY = y;
  await page.waitForTimeout(Math.round(Math.min(520, 140 + d * 0.3)));
  marks.act.push([a, at()]);
};
const press = async () => { await pause(120); await page.mouse.down(); await pause(70); await page.mouse.up(); await pause(220); };
const click = async locator => { const b = await locator.boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2); await press(); };
const hover = async (locator, ms = 600) => { const a = at(), b = await locator.boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(ms); marks.hover.push([a, at()]); };
const typed = async (text, delay) => { const a = at(); await page.keyboard.type(text, { delay }); marks.typing.push([a, at()]); };
const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }).catch(() => {}); };
const raw = async fn => { await page.evaluate(() => { window.__rawRects = true; }); try { return await fn(); } finally { await page.evaluate(() => { window.__rawRects = false; }); } };
const inViewport = r => r.x >= -1 && r.y >= -1 && r.x + r.w <= VW + 1 && r.y + r.h <= VH + 1;

const stamps = {}; let skeletonPending = null;
const targets = async (b, key = 'on') => (Array.isArray(b[key]) ? b[key] : [b[key]]).map(spec => L(spec));
// the beat verbs (see verbs.mjs for the list and the required fields)
const verbs = {
  goto: async b => { await page.goto(`${BASE}${b.url.replace('{app}', `/apps/${APP}`)}`); },
  'wait-for': async b => { await L(b.on).waitFor({ timeout: b.timeout || 10000, ...(b.state ? { state: b.state } : {}) }); },
  blur: async b => { if (b.on) await L(b.on).evaluate(node => node.blur()).catch(() => {}); else await page.evaluate(() => document.activeElement && document.activeElement.blur()); },
  start: async () => { marks.start = at(); },
  end: async () => { marks.end = at(); },
  hold: async b => { await pause(b.ms); },
  shot: async b => { await shot(b.name); },
  click: async b => { await click(L(b.on)); },
  hover: async b => {
    await hover(L(b.on), b.ms ?? 600);
    if (b.tooltip) {
      const shown = await page.evaluate(() => { const t = document.getElementById('rh-tip'); return !!t && t.style.opacity === '1'; });
      obs.tooltips.push({ at: at(), ms: (b.ms ?? 600) - TH.tooltipDelayMs, shown });
    }
  },
  type: async b => {
    const text = T(b.text);
    await typed(text, b.delay ?? 30); await pause(b.after ?? 260);
    if (b.expectField) {
      const got = await page.evaluate(sel => (document.querySelector(sel) || {}).value, b.expectField);
      log.push(`CHECK field text equals the sentence: ${got === text}`);
      if (got !== text) throw Error(`the field did not hold the typed sentence: ${JSON.stringify(got)}`);
    }
  },
  press: async b => { await page.keyboard.press(b.key || 'Enter'); },
  'mouse-press': async () => { await press(); },
  sticker: async () => { await page.evaluate(() => window.__key()); },
  camera: async b => {
    if (b.full) await camera({ x: 0, y: 0, w: VW, h: VH }, b.ms ?? 450, b.max ?? 1, !!b.free);
    else {
      const locs = await targets(b), rects = []; for (const l of locs) rects.push(await rectOf(l, b.pad ?? 30));
      await camera(rects.length > 1 ? union(...rects) : rects[0], b.ms ?? 550, b.max ?? 2.4, !!b.free);
      if (b.check) {
        const boxes = []; for (const l of locs) boxes.push(await l.boundingBox());
        const r = screenUnion(boxes);
        if (b.check === 'centred') { const dx = Math.abs(r.x + r.w / 2 - VW / 2) / VW, dy = Math.abs(r.y + r.h / 2 - VH / 2) / VH; obs.centred.push({ at: at(), name: b.name || '', dx: +dx.toFixed(3), dy: +dy.toFixed(3), ok: dx <= TH.centreTol && dy <= TH.centreTol }); }
        if (b.check === 'inframe') obs[b.as || 'chat'].push({ at: at(), name: b.name || '', ok: inViewport(r) });
      }
    }
  },
  'scroll-into-view': async b => { await L(b.on).scrollIntoViewIfNeeded(); },
  'scroll-heading': async b => {
    await page.evaluate(([h, rootSel, scrollSel]) => {
      const root = document.querySelector(rootSel);
      const el = [...root.querySelectorAll('h1,h2,h3,h4')].find(node => node.textContent.trim().startsWith(h));
      const scroller = root.closest(scrollSel);
      if (el && scroller) scroller.scrollTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
    }, [b.text, b.container || '[data-file-doc-md]', b.scroller || '[data-scroll]']);
    await pause(300);
  },
  // The Chat composer's /explain through the picker, so the command pill is on screen before the question is typed (a typed "/explain" + Enter alone leaves plain text).
  'slash-command': async b => {
    await click(L(b.field)); await typed(b.text || '/explain', 30); await pause(250);
    const option = L(b.option); await option.waitFor({ timeout: 5000 }); await click(option);
    const seen = await L(b.pill).waitFor({ timeout: 4000 }).then(() => true, () => false);
    obs.pills.push({ at: at(), ok: seen });
    if (!seen) log.push('WARN no command pill after the picker click');
    await page.waitForTimeout(500); marks.hold.push([at() - 0.5, at()]); // the pill is held in view (a real beat, 0.5 s)
  },
  expect: async b => { const ok = await L(b.on).waitFor({ timeout: b.timeout || 4000 }).then(() => true, () => false); (obs[b.as] || (obs[b.as] = [])).push({ at: at(), name: b.name || '', ok }); },
  // Depth, chosen with the cursor in the real DepthMenu: open (hold so the levels and the helper line are read), frame button + drop-down inside the viewport, then the level.
  'choose-depth': async b => {
    const scope = L(b.scope), menu = scope.locator('[data-depth-menu]'), a = at();
    await click(menu.locator('button').first());
    const drop = scope.locator('[data-depth-menu] [role="menu"]');
    await drop.waitFor({ state: 'visible', timeout: 3000 });
    const m = await raw(() => page.evaluate(() => { const r = document.querySelector('[data-depth-menu] [role="menu"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth }; }));
    log.push(`DEPTH menu rect ${JSON.stringify(m)}`);
    await camera(union(await rectOf(menu, 30), await rectOf(drop, 30)), 450, b.max ?? 1.7);
    const boxes = [await menu.boundingBox(), await drop.boundingBox()];
    obs.menus.push({ at: at(), name: `depth ${b.level}`, ok: inViewport(screenUnion(boxes)) });
    await pause(b.hold ?? 700);
    await click(scope.locator(`[data-depth-option="${b.level}"]`));
    marks.depth.push([a, at()]);
  },
  // The skeleton card ("Creating /explain", spinner, sweep) the product reserves where the card will land: framed as soon as it stands, so its wait is the footage; `near` also in frame.
  skeleton: async b => {
    const slot = L(b.slot || '[data-slot-id]').first();
    const found = await slot.waitFor({ state: 'visible', timeout: b.wait ?? 4000 }).then(() => true, () => false);
    log.push(`T ${at()} skeleton: found=${found}`);
    if (!found) { log.push('WARN no skeleton slot appeared'); return; }
    skeletonPending = { from: at() };
    await page.waitForTimeout(700); // the canvas camera glides the slot to the view; read its place after
    const r = await rectOf(slot, 30);
    await camera(b.near ? union(r, await rectOf(L(b.near), 20)) : r, 500, b.max ?? 1.7, true);
  },
  'wait-card': async b => {
    const card = b.title ? cardWith(b) : L(b.on);
    await card.waitFor({ timeout: b.timeout ?? 25000 });
    if (skeletonPending) { obs.skeletons.push({ at: at(), found: true, ms: Math.round((at() - skeletonPending.from) * 1000) }); skeletonPending = null; }
    else if (b.expectSkeleton !== false) obs.skeletons.push({ at: at(), found: false, ms: 0 });
    await pause(b.settle ?? 400);
  },
  'set-files': async b => { await L(b.on).setInputFiles({ name: b.name, mimeType: b.mimeType || 'text/markdown', buffer: fileBuffers[b.file] }); },
  // Film only: the product lands a new Markdown card in Full content (one ~10,000 px card); the card's own Full-content toggle (Shift+F, or its menu row) puts it back to the compact scrolling card.
  'toggle-layout': async b => {
    const card0 = L(b.card), box = await card0.boundingBox();
    await verbs.blur({}); await glide(box.x + box.width / 2, box.y + 12); await press(); // the card's top handle selects it (Shift+F is ignored while a field has the focus)
    await page.keyboard.press(b.key || 'Shift+KeyF'); await pause(500);
    let now = await card0.getAttribute('data-card-layout');
    if (now !== (b.want || 'scrollable')) {
      await page.mouse.click(box.x + 120, box.y + 40, { button: 'right' }); await pause(300);
      await page.getByRole('menuitem', { name: new RegExp(b.menuRow || 'Full content') }).first().click({ timeout: 3000 }).catch(() => {}); await pause(500);
      now = await card0.getAttribute('data-card-layout');
    }
    log.push(`LAYOUT after the toggle: ${now}`);
    if (now !== (b.want || 'scrollable')) console.error('WARN the card is not in the wanted layout after the toggle: the later beats are composed for it');
  },
  // Select exactly one sentence of a scrolling document card with a real mouse drag, then frame the toolbar it opens and the selection together.
  'select-text': async b => {
    const sentence = T(b.text), cont = b.container;
    const where = await raw(() => page.evaluate(([s, sel, scrollSel]) => {
      const root = document.querySelector(sel), scroller = root.closest(scrollSel), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.textContent.indexOf(s); if (i < 0) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + s.length);
        const r = range.getBoundingClientRect(), box = scroller.getBoundingClientRect();
        scroller.scrollTop += r.top - (box.top + box.height * 0.4);
        const after = range.getBoundingClientRect();
        return { x: after.left, y: after.top, w: after.width, h: after.height, cardX: box.left, cardW: box.width };
      }
      return null;
    }, [sentence, cont, b.scroller || '[data-scroll]']));
    if (!where) throw Error('the sentence is not in the rendered document');
    await pause(300);
    await camera({ x: where.cardX - 20, y: where.y - 140, w: where.cardW + 40, h: 360 }, b.ms ?? 600, b.max ?? 2.0);
    const span = await raw(() => page.evaluate(([s, sel]) => {
      const root = document.querySelector(sel), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.textContent.indexOf(s); if (i < 0) continue;
        const a = document.createRange(), z = document.createRange();
        a.setStart(node, i); a.setEnd(node, i + 5); z.setStart(node, i + s.length - 1); z.setEnd(node, i + s.length);
        const ra = a.getClientRects()[0], rz = z.getClientRects()[0];
        return { x1: ra.left + 1, y1: ra.top + ra.height / 2, x2: rz.right - 1, y2: rz.top + rz.height / 2 };
      }
      return null;
    }, [sentence, cont]));
    await glide(span.x1, span.y1, 14); await pause(150); await page.mouse.down(); await glide(span.x2, span.y2, 24); await page.mouse.up(); await pause(250);
    // The drag is the visual; the selection must be exactly the sentence (a drag that ends near a line end can run on into the next paragraph): checked and, only if it differs, set to the sentence.
    const exact = await page.evaluate(([s, sel]) => {
      if (String(window.getSelection()).replace(/\s+/g, ' ').trim() === s) return true;
      const walker = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.textContent.indexOf(s); if (i < 0) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + s.length);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return false;
      }
      return null;
    }, [sentence, cont]);
    log.push(`SEL exact after drag: ${exact}`);
    await pause(400);
    const toolbar = L(b.toolbar); await toolbar.waitFor({ timeout: 8000 }); await pause(300);
    const selBox = await raw(() => page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
    const selFree = { x: (selBox.x - cam.tx) / cam.s - 30, y: (selBox.y - cam.ty) / cam.s - 30, w: selBox.w / cam.s + 60, h: selBox.h / cam.s + 60 };
    await camera(union(await rectOf(toolbar, 30), selFree), 450, 2.0);
  },
  caption: async b => { await page.evaluate(([t, ms]) => window.__cap(t, ms), [T(b.text), b.ms]); },
  stamp: async b => { stamps[b.name] = at(); },
  mark: async b => { const from = typeof b.from === 'string' ? stamps[b.from] : (b.from ?? at()); (marks[b.kind] || (marks[b.kind] = [])).push([from, at() + (b.plus ?? 0)]); },
  'click-empty': async b => { await page.mouse.move(VW * b.x, VH * b.y); await glide(VW * (b.x + 0.02), VH * b.y, 14); await press(); },
  fit: async b => { await verbs.blur({}); await page.keyboard.press('Shift+Digit1'); await pause(b.ms ?? 800); },
  // "click and position the cards": the cursor takes a card by its handle and drops it in a free spot (a free 40 px grid cell at least 220 px away that overlaps no other card).
  'drag-to-free-spot': async b => {
    const card = L(b.card), handle = card.locator(b.handle || '[data-drag-handle]').first();
    await hover(card, 250);
    const hb = await handle.boundingBox(), gb = await card.boundingBox(), others = [];
    for (const blk of await page.locator('[data-block-id]').all()) { const bb = await blk.boundingBox(); if (bb && Math.abs(bb.x - gb.x) + Math.abs(bb.y - gb.y) > 4) others.push(bb); }
    let target = null, best = 1e9;
    for (let x = 40; x <= VW - gb.width - 40; x += 40) for (let y = 40; y <= VH - gb.height - 40; y += 40) {
      const hit = others.some(o => x < o.x + o.width + 20 && x + gb.width + 20 > o.x && y < o.y + o.height + 20 && y + gb.height + 20 > o.y);
      const d = Math.hypot(x - gb.x, y - gb.y);
      if (!hit && d >= 220 && d < best) { best = d; target = { x, y }; }
    }
    log.push(`DRAG target ${JSON.stringify(target)} from ${Math.round(gb.x)},${Math.round(gb.y)} (${others.length} other cards)`);
    if (target) {
      await glide(hb.x + hb.width / 2, hb.y + hb.height / 2, 14); await pause(250);
      await page.mouse.down(); await pause(120);
      await glide(hb.x + hb.width / 2 + (target.x - gb.x), hb.y + hb.height / 2 + (target.y - gb.y), 30);
      await page.mouse.up(); await pause(300);
    }
  },
  'dump-layout': async () => { log.push('LAYOUT (id x y w h) ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute('data-block-id').slice(0, 8), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })))); },
  poster: async () => { await page.mouse.move(VW * 0.5, VH * 0.97, { steps: 10 }); await page.screenshot({ path: join(OUT, 'poster.jpg'), type: 'jpeg', quality: 90 }); },
};

try {
  for (const [i, beat] of cfg.beats.entries()) {
    log.push(`BEAT ${i} ${beat.do}${beat.note ? ` (${beat.note})` : ''} at ${at()}`);
    await verbs[beat.do](beat);
  }
} catch (error) {
  await page.screenshot({ path: join(OUT, 'failed.png') }).catch(() => {});
  log.push(`FAILED ${error.message.slice(0, 300)}`);
  throw error;
} finally {
  // dead time: any stretch with no typing, reveal, depth, hold, camera, hover or cursor activity longer than TH.deadMax is marked `dead`; render.mjs cuts it (cut, not sped).
  if (marks.start !== undefined && marks.end !== undefined) {
    const windows = [...marks.typing, ...marks.reveal, ...marks.depth, ...marks.hold, ...marks.camera, ...marks.hover, ...marks.act].filter(([a, b]) => b > marks.start && a < marks.end).sort((x, y) => x[0] - y[0]);
    let reach = marks.start;
    for (const [a, b] of windows) { if (a - reach > TH.deadMax) marks.dead.push([+(reach + 0.3).toFixed(2), +(a - 0.1).toFixed(2)]); reach = Math.max(reach, b); }
    if (marks.end - reach > TH.deadMax) marks.dead.push([+(reach + 0.3).toFixed(2), +(marks.end - 0.1).toFixed(2)]);
  }
  writeFileSync(join(OUT, 'requests.log'), log.join('\n'));
  writeFileSync(join(OUT, 'checks.json'), JSON.stringify({ obs, thresholds: TH }, null, 1));
  if (cdp) {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(frameWrites);
    writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames: frameLog }));
  }
  writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ ...marks, t0Epoch: t0 / 1000, viewport: { w: VW, h: VH, dsf: DSF } }, null, 2));
  const video = page.video();
  await context.close(); await browser.close();
  if (video) renameSync(await video.path(), join(OUT, 'raw.webm'));
  console.log(JSON.stringify({ marks: { start: marks.start, end: marks.end, typing: marks.typing.length, reveal: marks.reveal.length, depth: marks.depth.length, dead: marks.dead.length }, pageErrors: log.filter(l => l.startsWith('PAGEERROR')).length,
    unscripted: log.filter(l => /UNSCRIPTED|ABORT model/.test(l)), failed: log.filter(l => l.startsWith('FAILED')) }, null, 1));
}
