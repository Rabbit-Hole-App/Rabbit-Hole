// EXPERIMENTAL, UNPROVEN: the frame-stepped 4K take (virtual clock via Playwright page.clock, the Web Animations API for CSS animations, a JS camera tween, one true 3840x2160 screenshot per 33 ms step). Snapshot of the first film's experiment taken 2026-11-14 while it was still being tried: it is film-specific (beats, bank keys and selectors are hard-coded), not config-driven, and was not shown to reproduce the page faithfully. If it is made to work, port its stepping into capture.mjs as a mode, do not copy this file.
// FILM: "/explain around a markdown". Records the take from the REAL Rabbit Hole canvas (dist-dev of explain/video-canvas under vite preview). Adapted from the landing AI-Tutor kit
// (C:/s/spec/film-explain/kit/landing-tutor/capture/capture.mjs): same camera (CSS transform on <body>, eased, never below 1x), same cursor + click ring, same request log. Changes: the app id,
// the board (the markdown only), and /api/learn/artifact + /api/learn/ask answered from the answer bank (bank/bank.json) in script order with a scripted delay.
// No model is asked: every /api request is answered here; anything model-capable that is not scripted is logged UNSCRIPTED / ABORT and refused.
// Usage (from <worktree>/packages/web, `vite preview --outDir dist-dev --port 5480` running):  node C:/s/spec/film-explain/capture.mjs [outDir]
// Env: DSF (device scale factor, default 2), VIDEO=1 to record the reference webm, SHOTS=<dir> to save a still after each beat (debugging).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WEB = process.cwd();
const { chromium } = createRequire(join(WEB, 'package.json'))('@playwright/test');
const F = 'C:/s/spec/film-explain/';
const OUT = process.argv[2] || `${F}take-1`;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:5480';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error('capture runs against a loopback preview only');
const DSF = Number(process.env.DSF || 2), VW = 1920, VH = 1080;
const bank = JSON.parse(readFileSync(`${F}bank/bank.json`, 'utf8'));
const exported = JSON.parse(readFileSync(`${F}bank/board-export-canvas-bcb7f9f6-fresh.json`, 'utf8'));
const markdown = readFileSync(`${F}serve/en.md`);
const fileState = { id: 'fs_film_md', rev: null };
// B0a: the board starts EMPTY; the markdown card is made by the product itself (Insert > Upload a file > Add to canvas), so its file source is whatever the scripted /api/learn/files answers (fileState).

const ORG = 'demo-team', EMAIL = ['learner', 'example.invalid'].join('@'), APP = 'canvas-4d6b2a91'; // LearnPage treats only canvas-<8 hex> as a canvas
const canvas = { name: APP, title: 'Decision Trees', description: '', kind: 'canvas', hosting: 'canvas', org: ORG, orgName: 'Demo', email: EMAIL, owner_email: EMAIL,
  visibility: 'private', members: [], teams: [], published: false, shared: false, board_saved: true, access: 'private', canView: true, canEdit: true,
  url: `/apps/${APP}`, inputs: {}, outputs: {}, created_at: '2026-11-13T12:00:00Z', deployed_at: '2026-11-13T12:00:00Z', observations: [], schedule: null };
const boardState = { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], exchanges: [], sources: [] };
const board = { version: 1, board_id: '00000000-0000-4000-8000-000000000001', updated_by: 'film', updated_at: '2026-11-13T12:00:00.000Z', title: null, forked: false,
  sharing: { shared: false, view: null, edit: null, public_view: false }, state: boardState };
const replies = {
  '/api/profile': { name: 'Learner', avatar: null, handle: 'learner', description: '' }, // HandleGate (main.jsx) asks for a handle when the profile has none
  '/api/apps': { org: ORG, orgName: 'Demo', email: EMAIL, apps: [canvas], folders: [] },
  [`/api/apps/${APP}`]: canvas,
  [`/api/apps/${APP}/learn-course`]: { course: null, canAuthor: true },
  '/api/workspaces': { active: ORG, email: EMAIL, workspaces: [{ slug: ORG, name: 'Demo', role: 'owner', kind: 'custom' }] },
  [`/api/learn/boards/${APP}/main`]: board,
  '/api/learn/cad/jobs': { blocks: [] },
};
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const { chatRouteAnswer } = await import(pathToFileURL(join(WEB, 'e2e/dev-cp.mjs')).href);

const log = [], marks = { typing: [], reveal: [], depth: [], cut: [] };
const THREAD = 'canvaschat-4d6b2a91-film';
let quiet = 0;
const settingsState = { depth: 'balanced', autoSuggest: true, rev: 0 };
// The scripted wait is the footage of the skeleton card (spinner, "Creating /explain", the sweep): long enough to be seen at 1.0x.
const artifactQueue = [['p1', 1900], ['p2', 1900], ['qcard', 1900], ['p3', 1700], ['p4', 1900]];
const browser = await chromium.launch(process.env.GPU ? { channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-zero-copy'] } : {});
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, reducedMotion: 'no-preference',
  ...(process.env.VIDEO ? { recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } } : {}) });
let t0 = 0, vt = 0;
const waiters = [];
const vsleep = ms => new Promise(resolve => waiters.push([vt + ms, resolve]));
const at = () => Number((vt / 1000).toFixed(2));
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (url.origin !== BASE) { log.push(`ABORT outside ${url.hostname}`); return route.abort(); }
  if (!path.startsWith('/api/')) return route.continue();
  log.push(`${at()} ${method} ${path}`);
  // The Depth menu reads and writes the learner's settings (learn-settings.js): answered from the script so "Could not load your Depth setting" never shows, and the chosen level sticks.
  if (path === '/api/learn/user-settings') {
    if (method === 'POST') { const body = request.postDataJSON() || {}; if (body.depth) { settingsState.depth = body.depth; settingsState.rev += 1; } if (typeof body.autoSuggest === 'boolean') settingsState.autoSuggest = body.autoSuggest; }
    return route.fulfill({ json: { learner: 'film-learner', settings: { depth: settingsState.depth, autoSuggest: settingsState.autoSuggest }, depthRevision: settingsState.rev } });
  }
  // The roadmap poll answered 404 without the "disabled" code made the page re-ask in a tight loop (31,751 GETs in one take, which starved the page for 11 s twice): scripted as "roadmap off", the product's own answer for that (it then asks once a minute).
  if (path.startsWith('/api/learn/roadmap')) return route.fulfill({ status: 404, json: { error: 'Not available', code: 'roadmap_disabled' } });
  if (path === '/api/learn/chat/route') { const asked = request.postDataJSON() || {}; log.push(`ROUTE ${JSON.stringify(asked).slice(0, 260)}`); return route.fulfill({ json: chatRouteAnswer(asked) }); }
  if (path === '/api/learn/ask' && method === 'POST') {
    const asked = request.postDataJSON() || {};
    log.push(`ASK ${JSON.stringify(String(asked.message || '').slice(0, 90))} target=${asked.canvas_target?.kind || '-'} keys=${Object.keys(asked).join(',')} mode=${asked.mode || '-'} ${JSON.stringify(asked.command || asked.intent || '').slice(0, 60)}`);
    if (asked.canvas_target?.kind === 'card' && /too many regions/.test(asked.message || '')) {
      // "Ask here": the captured answer of a real call on the local stack (bank.qhere), replayed as the same SSE frames; only the thread id is this take's.
      const body = bank.qhere.sse.replace(/"threadId":"[^"]*"/g, `"threadId":"${THREAD}"`);
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
    }
    // Every other ask (the Tutor's reaction after a card) gets a quiet stream: no text, no model.
    quiet += 2;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: frame('chunk', { text: '​' }) + frame('answer_meta', { messageId: String(100 + quiet), actions: [], followUps: [], alternatives: [String(100 + quiet)], kind: 'answer' })
      + frame('done', { ok: true, threadId: THREAD, userMessageId: String(99 + quiet), messageId: String(100 + quiet) }) });
  }
  if (path === '/api/learn/explain/jobs' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available', code: 'explain_disabled' } });
  // Ctrl+K (the inline editor): its request check says "proceed" for the written explanation (capability `explain`, outcome card), its router question has no answer, and the card it generates is the next banked answer.
  if (path === '/api/learn/inline/decide' && method === 'POST') { log.push('SCRIPTED inline decide'); return route.fulfill({ json: { decision: 'proceed', route: { capability: 'explain', outcome: 'card' }, paid: false, token: 'film-token' } }); }
  if (path === '/api/learn/inline/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available' } });
  if (path === '/api/learn/inline/telemetry' && method === 'POST') return route.fulfill({ json: { ok: true } });
  if ((path === '/api/learn/artifact' || path === '/api/learn/inline/generate') && method === 'POST') {
    const next = artifactQueue.shift();
    if (!next) { log.push('UNSCRIPTED artifact'); return route.fulfill({ status: 503, json: { error: 'unscripted' } }); }
    const [key, delay] = next, start = at();
    await vsleep(delay); // the spinner is part of the footage
    marks.reveal.push([start, at() + 1.2]);
    log.push(`SCRIPTED artifact ${key} after ${delay} ms: ${JSON.stringify(request.postDataJSON()?.args || '').slice(0, 90)}`);
    return route.fulfill({ json: structuredClone(bank[key].response) });
  }
  // B0a: the uploaded markdown's save (file-source-client.js uploadSource): POST names the file by sha256; "already stored" (upload: null) answers the source at that revision, after a scripted wait the card shows as its upload.
  if (path === '/api/learn/files' && method === 'POST') {
    const sent = request.postDataJSON() || {};
    log.push(`SCRIPTED file store ${JSON.stringify({ name: sent.name, size: sent.size, family: sent.family })}`);
    await vsleep(1300);
    fileState.rev = sent.sha256;
    marks.reveal.push([at() - 1.3, at() + 0.6]);
    return route.fulfill({ json: { source: { id: fileState.id, rev: sent.sha256, family: sent.family || 'markdown', name: sent.name, type: sent.type || '', size: sent.size, status: 'stored' }, upload: null } });
  }
  if (path === '/api/learn/source-refs' && method === 'POST') return route.fulfill({ json: { ref: { id: 'sr_film_p3', status: 'current' } } });
  if (path === '/api/learn/source-refs/resolve' && method === 'POST') return route.fulfill({ json: { refs: [] } });
  if (/^\/api\/learn\/(tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course)/.test(path) && method !== 'GET') { log.push(`ABORT model-capable ${path}`); return route.fulfill({ status: 503, json: { error: 'not scripted' } }); }
  if (path === '/api/telemetry/client') return route.fulfill({ json: { ok: true } });
  // The Markdown card lists its highlights (pdf-highlights.js listHighlights): none yet, for this revision (the selection toolbar is offered only when the answer names the card's revision).
  if (path === '/api/learn/pdf-highlights' && method === 'GET') { log.push(`HIGHLIGHTS ${url.search.slice(0, 80)}`); return route.fulfill({ json: { highlights: [], sha256: fileState.rev, changed: 0 } }); }
  if (path.startsWith('/api/learn/files/') && method === 'GET') {
    if (/\/(text|highlights)\b/.test(path)) { log.push(`HIGHLIGHTS ${path}`); return route.fulfill({ json: { highlights: [], sha256: fileState.rev, changed: 0 } }); }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: markdown });
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
// The camera and the cursor, outside <body> so the camera never moves them (the kit's editorial layer; neither is a product control).
await context.addInitScript(({ noOverride }) => {
  const install = () => {
    if (document.getElementById('rh-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `html{overflow:hidden}body{transform-origin:0 0}
      #rh-cursor{position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;width:26px;height:32px;margin:-2px 0 0 -3px;filter:drop-shadow(0 1px 2px #0005)}
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
    keycap.innerHTML = '<span>Ctrl</span><span>K</span>';
    document.documentElement.append(style, ring, cursor, keycap);
    // Editorial sticker (recording page only, same layer as the cursor): a key-cap "Ctrl K" that shows for 1.2 s when the take presses Ctrl+K.
    // STEP mode: the camera and every CSS animation/transition run on the take's virtual clock (window.__tick is called by the take after each clock step).
    window.__vt = 0;
    let camFrom = { s: 1, tx: 0, ty: 0 }, camTo = camFrom, camStart = 0, camMs = 0;
    const ease = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const camNow = () => { if (!camMs) return camTo; const e = ease(Math.min(1, (window.__vt - camStart) / camMs)); return { s: camFrom.s + (camTo.s - camFrom.s) * e, tx: camFrom.tx + (camTo.tx - camFrom.tx) * e, ty: camFrom.ty + (camTo.ty - camFrom.ty) * e }; };
    window.__camTo = (c, ms) => { camFrom = camNow(); camTo = c; camStart = window.__vt; camMs = ms; };
    window.__tick = v => {
      window.__vt = v; const c = camNow(); if (document.body) document.body.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
      for (const a of document.getAnimations()) { if (a.__vt0 === undefined) { a.__vt0 = v - (Number(a.currentTime) || 0); a.pause(); } a.currentTime = v - a.__vt0; }
    };
    window.__key = () => { keycap.classList.add('on'); setTimeout(() => keycap.classList.remove('on'), 1200); };
    const caption = document.createElement('div');
    caption.id = 'rh-cap';
    caption.style.cssText = 'position:fixed;left:50%;bottom:7%;z-index:2147483645;pointer-events:none;transform:translateX(-50%);opacity:0;transition:opacity .25s;font:600 30px/1.2 Inter,system-ui,sans-serif;color:#fff;background:#20211fe6;border-radius:14px;padding:14px 26px;box-shadow:0 8px 24px #0004';
    document.documentElement.append(caption);
    // The browser's own title tooltip is not drawn in a headless capture: the "Ask here" / "Ask in a new card" buttons show their title the way a tooltip would (same editorial layer, recording page only).
    const tip = document.createElement('div');
    tip.id = 'rh-tip';
    tip.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .15s;font:500 22px/1.2 Inter,system-ui,sans-serif;color:#fff;background:#20211fee;border-radius:8px;padding:8px 14px;white-space:nowrap;transform:translateX(-50%)';
    document.documentElement.append(tip);
    let tipTimer = 0;
    addEventListener('mouseover', event => {
      const el = event.target.closest && event.target.closest('[data-ask]');
      clearTimeout(tipTimer);
      if (!el) { tip.style.opacity = '0'; return; }
      tipTimer = setTimeout(() => { const r = elementRect.call(el); tip.textContent = el.getAttribute('title') || el.getAttribute('aria-label') || ''; tip.style.left = `${r.left + r.width / 2}px`; tip.style.top = `${r.bottom + 10}px`; tip.style.opacity = '1'; }, 250);
    }, true);
    addEventListener('mousedown', () => { clearTimeout(tipTimer); tip.style.opacity = '0'; }, true);
    window.__cap = (text, ms) => { caption.textContent = text; caption.style.opacity = '1'; setTimeout(() => { caption.style.opacity = '0'; }, ms); };
    addEventListener('mousemove', event => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; }, true);
    addEventListener('mousedown', event => { ring.style.left = `${event.clientX}px`; ring.style.top = `${event.clientY}px`; ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on'); }, true);
  };
  // The camera is a CSS transform on <body>. The canvas places things (the selection toolbar, the Ctrl+K window, the card made from a passage) from client rectangles, so with the camera on it would
  // compute from camera pixels. These rectangles are therefore given camera-free (the app works in the untransformed layout; the transform only shows it larger). The take script reads raw rectangles
  // (window.__rawRects = true) when it needs screen pixels for the mouse.
  const cam = () => { const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec((document.body && document.body.style.transform) || ''); return m ? { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) } : null; };
  const fix = r => { const c = window.__rawRects ? null : cam(); return c && r ? new DOMRect((r.left - c.tx) / c.s, (r.top - c.ty) / c.s, r.width / c.s, r.height / c.s) : r; };
  const elementRect = Element.prototype.getBoundingClientRect, rangeRect = Range.prototype.getBoundingClientRect;
  if (!noOverride) {
    Element.prototype.getBoundingClientRect = function () { return fix(elementRect.call(this)); };
    Range.prototype.getBoundingClientRect = function () { return fix(rangeRect.call(this)); };
  }
  // Long tasks (main thread blocked > 50 ms) are logged so a frozen stretch in the footage is explained: any over 1 s is a finding.
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.duration > 400) console.error(`LONGTASK ${Math.round(e.duration)} ms at ${Math.round(e.startTime)}`); }).observe({ entryTypes: ['longtask'] }); } catch { /* no longtask support */ }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
}, { noOverride: !!process.env.NOOVERRIDE });
const page = await context.newPage();
await page.clock.install({ time: new Date('2026-11-14T00:00:00Z') });
await page.clock.pauseAt(new Date('2026-11-14T00:00:02Z'));
page.waitForTimeout = ms => vsleep(ms);
// SCREENCAST=1: every frame the browser composes is saved as a full-size JPEG with its timestamp (Page.startScreencast, up to 3840x2160): the frames of the film are rendered from these, not from Playwright's 1 Mbit/s video.
const frameDir = join(OUT, 'frames'), frameLog = [];
let cdp = null, frameWrites = [];
if (process.env.SCREENCAST) {
  mkdirSync(frameDir, { recursive: true });
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', event => {
    const n = frameLog.length;
    frameLog.push({ n, ts: event.metadata.timestamp, w: event.metadata.deviceWidth, h: event.metadata.deviceHeight, off: event.metadata.offsetTop });
    frameWrites.push(import('node:fs/promises').then(fs => fs.writeFile(join(frameDir, `f${String(n).padStart(6, '0')}.jpg`), Buffer.from(event.data, 'base64'))));
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  if (process.env.SHOTLOOP) {
    // Page.startScreencast never exceeds the CSS size (1920x1080 at DSF 2, measured), so the 4K frames come from back-to-back Page.captureScreenshot calls at DSF 2.
    globalThis.shotLoopOn = true;
    globalThis.shotLoop = (async () => {
      while (globalThis.shotLoopOn) {
        const ts = Date.now() / 1000;
        let r = null;
        if (process.env.RAWCDP) {
          if (Date.now() - t0 < 15000) { await new Promise(res => setTimeout(res, 200)); continue; }
          const s = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, optimizeForSpeed: true }).catch(() => null), new Promise(res => setTimeout(() => res(null), 8000))]);
          r = s && Buffer.from(s.data, 'base64');
        } else r = await page.screenshot({ type: 'jpeg', quality: 92, scale: 'device', timeout: 15000 }).catch(() => null);
        if (!r) continue;
        const n = frameLog.length;
        frameLog.push({ n, ts, w: VW * DSF, h: VH * DSF });
        frameWrites.push(import('node:fs/promises').then(fs => fs.writeFile(join(frameDir, `f${String(n).padStart(6, '0')}.jpg`), r)));
      }
    })();
  } else
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: VW * DSF, maxHeight: VH * DSF, everyNthFrame: 1 });
}
t0 = 0; vt = 0;
// The stepper: advance the virtual clock DT per step (the page's timers and rAF via page.clock, its CSS animations via __tick), release the script's waits, screenshot at true device size inside the capture window.
const DT = Number(process.env.DT || 33.333), CAPFROM = Number(process.env.CAPFROM || 0), CAPTO = Number(process.env.CAPTO || 1e9), STOPAT = Number(process.env.STOPAT || 0), IDLE = Number(process.env.IDLE || 100);
const stepStats = { shots: 0, shotMs: [] };
globalThis.stepOn = true;
const finishStep = async () => {
  await Promise.all(frameWrites);
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames: frameLog }));
};
globalThis.stepper = (async () => {
  mkdirSync(frameDir, { recursive: true });
  while (globalThis.stepOn) {
    const inside = vt / 1000 >= CAPFROM && vt / 1000 <= CAPTO, dt = inside ? DT : IDLE;
    // release the script's waits in time order INSIDE the step (a 9 ms key delay must not cost a whole 33 ms step): each release lets the script act, then enqueue its next wait
    const target = vt + dt;
    for (;;) {
      const due = waiters.filter(x => x[0] <= target + 1e-6).sort((p, q) => p[0] - q[0])[0];
      if (!due) break;
      waiters.splice(waiters.indexOf(due), 1); vt = Math.max(vt, due[0]); due[1]();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    vt = target;
    await page.clock.runFor(dt);
    await page.evaluate(v => window.__tick && window.__tick(v), vt).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 25)); // real time: lets the script's reaction (a click, a key) reach the page before the frame
    if (inside) {
      const s = Date.now();
      const buf = await page.screenshot({ type: 'jpeg', quality: 92, scale: 'device', timeout: 30000 }).catch(() => null);
      if (buf) { const n = frameLog.length; frameLog.push({ n, ts: vt / 1000, w: VW * DSF, h: VH * DSF }); stepStats.shots++; stepStats.shotMs.push(Date.now() - s); frameWrites.push(import('node:fs/promises').then(fs => fs.writeFile(join(frameDir, `f${String(n).padStart(6, '0')}.jpg`), buf))); }
    }
    if (STOPAT && vt / 1000 >= STOPAT) {
      globalThis.stepOn = false;
      await finishStep();
      writeFileSync(join(OUT, 'requests.log'), log.join('\n'));
      writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ ...marks, t0Epoch: 0, viewport: { w: VW, h: VH, dsf: DSF }, stopAt: STOPAT }, null, 2));
      const ms = stepStats.shotMs.sort((a, b) => a - b);
      console.log(JSON.stringify({ stopAt: STOPAT, shots: stepStats.shots, medianShotMs: ms[Math.floor(ms.length / 2)], p95ShotMs: ms[Math.floor(ms.length * 0.95)] }));
      process.exit(0);
    }
  }
})();
page.on('pageerror', error => log.push(`PAGEERROR ${error.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error') log.push(`CONSOLE ${m.text().slice(0, 300)}`); });
marks.hold = [];
const pause = ms => { if (ms >= 900) marks.hold.push([at(), at() + ms / 1000]); return page.waitForTimeout(ms); };
const pane = page.locator('[data-chat-pane]');
const field = pane.locator('[data-chat-composer] textarea, [data-chat-composer] input:not([type="file"])').first();
const composer = pane.locator('[data-chat-composer]');

let cam = { s: 1, tx: 0, ty: 0 };
const camera = async (r, ms = 550, max = 2.4, free = false) => {
  const s = Math.min(max, Math.max(1, Math.min(VW / r.w, VH / r.h)));
  let tx = VW / 2 - s * (r.x + r.w / 2), ty = VH / 2 - s * (r.y + r.h / 2);
  // free: the subject is centred exactly even at the screen's edge (the margin beyond the canvas is blank page); otherwise the camera never shows past the page.
  if (!free) { tx = Math.min(0, Math.max(VW - s * VW, tx)); ty = Math.min(0, Math.max(VH - s * VH, ty)); }
  cam = { s, tx, ty };
  await page.evaluate(([c, d]) => window.__camTo(c, d), [cam, ms]);
  await pause(ms + 60);
};
const rectOf = async (locator, pad = 0) => {
  const b = await locator.boundingBox();
  return { x: (b.x - cam.tx) / cam.s - pad, y: (b.y - cam.ty) / cam.s - pad, w: b.width / cam.s + 2 * pad, h: b.height / cam.s + 2 * pad };
};
const union = (...rs) => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
// The page re-renders slowly under the camera (software raster): each mouse.move step waited a frame, so a 14-step glide took up to 6 s of frozen footage. The cursor overlay eases on its own (CSS), the page gets a few move events.
let lastX = 0, lastY = 0;
const glide = async (x, y, steps = 14) => {
  const d = Math.hypot(x - lastX, y - lastY), wait = Math.round(Math.min(520, 140 + d * 0.3)), travel = Math.min(380, wait), n = Math.max(3, Math.round(travel / 33));
  for (let i = 1; i <= n; i++) { const e = 1 - Math.pow(1 - i / n, 3); await page.mouse.move(lastX + (x - lastX) * e, lastY + (y - lastY) * e); await vsleep(travel / n); }
  lastX = x; lastY = y;
  await vsleep(wait - travel);
};
const press = async () => { await pause(120); await page.mouse.down(); await pause(70); await page.mouse.up(); await pause(220); };
const click = async locator => { const b = await locator.boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2); await press(); };
const hover = async (locator, ms = 600) => { const b = await locator.boundingBox(); await glide(b.x + b.width / 2, b.y + b.height / 2); await pause(ms); };
const typed = async (text, delay) => { const a = at(), k = Math.max(1, Math.floor(33.3 / Math.max(1, delay))); for (let i = 0; i < text.length; i += k) { await page.keyboard.type(text.slice(i, i + k)); await vsleep(delay * Math.min(k, text.length - i)); } marks.typing.push([a, at()]); };
const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}.png`) }).catch(() => {}); };
const toComposer = async () => camera(await rectOf(composer, 30), 500, 2.1);
const cardWith = title => page.locator('[data-block-id]').filter({ hasText: title }).first();
// The Chat composer's /explain through the picker, so the command pill (data-command-token) is on screen before the question is typed (a typed "/explain" + Enter alone leaves plain text).
const slashExplain = async () => {
  await click(field); await typed('/explain', 30); await pause(250);
  const option = page.locator('[data-slash-picker] [role="option"]').first();
  await option.waitFor({ timeout: 5000 });
  await click(option);
  await composer.locator('[data-command-token]').waitFor({ timeout: 4000 }).catch(() => log.push('WARN no command pill after the picker click'));
  await page.waitForTimeout(500);                                                       // the pill is held in view (a real beat, 0.5 s)
  marks.hold.push([at() - 0.5, at()]);
};
// The skeleton card ("Creating /explain", spinner, sweep) the product reserves where the card will land: framed as soon as it stands, so its wait is the footage; `near` also in frame.
const showSkeleton = async (near = null, max = 1.7, wait = 4000) => {
  const slot = page.locator('[data-slot-id]').first();
  const found = await slot.waitFor({ state: 'visible', timeout: wait }).then(() => true, () => false);
  log.push(`T ${at()} skeleton: found=${found}`);
  if (!found) { log.push('WARN no skeleton slot appeared'); return false; }
  await page.waitForTimeout(700);                                                       // the canvas camera glides the slot to the view; read its place after
  const r = await rectOf(slot, 30);
  await camera(near ? union(r, near) : r, 500, max, true);
  return true;
};
const P1 = 'how does a decision tree split a two-feature dataset into regions?';
const P2 = 'how does a decision tree trace a new point from the root to a prediction?';
const P4 = 'how does Gini impurity change as the fraction of one class goes from 0 to 1, compared with entropy?';
const PASSAGE = 'About 63% of the original samples appear in each bootstrap (the rest are out-of-bag samples that can be used for validation).';
// Depth, chosen with the cursor in the real DepthMenu: open (hold so the three levels and the helper line are read), then the level.
const chooseDepth = async (scope, level, hold) => {
  const menu = scope.locator('[data-depth-menu]');
  const a = at();
  log.push(`T ${at()} depth: start`);
  await click(menu.locator('button').first());
  log.push(`T ${at()} depth: clicked`);
  // The drop-down opens upward and to the right of its button: frame the button and the whole menu (>= its own width free), never the button alone.
  const drop = scope.locator('[data-depth-menu] [role="menu"]');
  await drop.waitFor({ state: 'visible', timeout: 3000 });
  log.push(`T ${at()} depth: menu visible`);
  await page.evaluate(() => { window.__rawRects = true; });
  const m = await page.evaluate(() => { const r = document.querySelector('[data-depth-menu] [role="menu"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, vw: innerWidth }; });
  await page.evaluate(() => { window.__rawRects = false; });
  log.push(`DEPTH menu rect ${JSON.stringify(m)} (right edge ${Math.round(m.right)} of ${m.vw})`);
  await camera(union(await rectOf(menu, 30), await rectOf(drop, 30)), 450, 1.7);
  log.push(`T ${at()} depth: framed`);
  await pause(hold);
  await click(scope.locator(`[data-depth-option="${level}"]`));
  marks.depth.push([a, at()]);
};
// The markdown card scrolls inside: bring a heading to the top of its scroller before the camera moves.
const scrollMarkdownTo = async heading => {
  await page.evaluate(h => {
    const root = document.querySelector('[data-file-doc-md]');
    const el = [...root.querySelectorAll('h1,h2,h3,h4')].find(node => node.textContent.trim().startsWith(h));
    const scroller = root.closest('[data-scroll]');
    if (el && scroller) scroller.scrollTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
  }, heading);
  await pause(300);
};
try {
  await page.goto(`${BASE}/apps/${APP}`);
  await field.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await field.evaluate(node => node.blur());
  marks.start = at();
  await shot('b0');
  await pause(900);                                                                    // B0: an empty canvas
  // B0a: Insert > Upload a file > (the destination) Add to canvas > (the import) Add to canvas: the product's own import of the lesson's en.md. The native file dialog never opens:
  // the file goes straight into the page's hidden file input (the same input Upload a file clicks).
  const uploadAt = at();
  await click(page.getByRole('menubar').getByRole('menuitem', { name: 'Insert' }));
  const uploadItem = page.getByRole('menuitem', { name: 'Upload a file' });
  await uploadItem.waitFor({ timeout: 4000 });
  await shot('b0a1'); await pause(900);                                                // the menu is read
  await click(uploadItem);
  await page.locator('input[type="file"][multiple]:not([data-attach-input]):not([data-attach-input])').first().setInputFiles({ name: 'en.md', mimeType: 'text/markdown', buffer: markdown });
  const destination = page.locator('[data-upload-destination]');
  await destination.waitFor({ timeout: 6000 });
  await shot('b0a2'); await pause(900);                                                // where the file goes
  await click(destination.locator('[data-upload-choice="canvas"]'));
  const importDialog = page.locator('[data-file-import-dialog]');
  await importDialog.getByRole('button', { name: 'Add to canvas' }).waitFor({ timeout: 6000 });
  await shot('b0a3'); await pause(900);                                                // how it is added: Markdown card
  await click(importDialog.getByRole('button', { name: 'Add to canvas' }));
  await page.locator('[data-file-doc-md]').first().waitFor({ timeout: 20000 });         // the markdown card lands (its upload shows while the scripted save waits)
  marks.reveal.push([uploadAt, at() + 0.8]);
  await pause(500);
  await shot('b0a4');
  // Film only: the product lands a new Markdown card in Full content (one ~10,000 px card); the card's own Full-content toggle (Shift+F, the menu row) puts it back to the compact scrolling card the film is composed for.
  await field.evaluate(node => node.blur()).catch(() => {});                           // Shift+F is ignored while a field has the focus
  const card0 = page.locator('[data-block-id]').first(), cardBox = await card0.boundingBox();
  await glide(cardBox.x + cardBox.width / 2, cardBox.y + 12); await press();           // the card's top handle selects it
  await page.keyboard.press('Shift+KeyF'); await pause(500);
  let layoutNow = await card0.getAttribute('data-card-layout');
  if (layoutNow !== 'scrollable') {                                                    // fallback: the card's menu row "Full content" (right click on the header)
    await page.mouse.click(cardBox.x + 120, cardBox.y + 40, { button: 'right' }); await pause(300);
    await page.getByRole('menuitem', { name: /Full content/ }).first().click({ timeout: 3000 }).catch(() => {}); await pause(500);
    layoutNow = await card0.getAttribute('data-card-layout');
  }
  log.push(`LAYOUT after the toggle: ${layoutNow}`);
  if (layoutNow !== 'scrollable') console.error('WARN the markdown card is not scrollable after the toggle: the later beats are composed for the scrollable card');
  await page.keyboard.press('Shift+Digit1'); await pause(700);                         // fit: the card centred
  await camera(await rectOf(page.locator('[data-block-id]').first(), 40), 600, 1.5, true);
  await shot('b0a5'); await pause(1400);                                               // the lesson card, read
  // B1: P1 at Balanced (the default level reads in the icon)
  await scrollMarkdownTo('What a decision tree does');
  await toComposer();
  await slashExplain();                                                                 // the /explain pill is on screen
  await typed(P1, 9); await pause(260); await page.keyboard.press('Enter');
  await showSkeleton();                                                                 // the skeleton card: spinner, "Creating /explain", the sweep, for the whole wait
  await shot('b1sk');
  await cardWith('Decision Tree Feature Regions').waitFor({ timeout: 25000 });
  await pause(400);
  await camera(await rectOf(cardWith('Decision Tree Feature Regions'), 30), 600, 1.6, true); // the new card, centred
  await shot('b1'); await pause(1800);
  // B2: P2 at Detailed, chosen with the cursor
  await toComposer();
  await chooseDepth(pane, 'detailed', 900);
  await slashExplain();
  await typed(P2, 9); await pause(260); await page.keyboard.press('Enter');
  await showSkeleton();
  await shot('b2sk');
  await cardWith('Decision Tree Traversal').waitFor({ timeout: 25000 });
  await pause(400);
  await camera(await rectOf(cardWith('Decision Tree Traversal'), 30), 600, 1.6, true);
  await shot('b2'); await pause(1500);
  // The product removes a card's suggestion rows once any Ask has been used on it (found in the debug runs: both "Ask here" and "Ask in a new card"), so Q-here and Q-card cannot both come from card 1.
  // B3 = Ask here on card 1's question 2 (the real answer opens in the Chat pane); B4 = Ask in a new card on card 2's question 1 ("How are the optimal split thresholds chosen during training?"), the child card beside card 2.
  const card1 = cardWith('Decision Tree Feature Regions'), card2 = cardWith('Decision Tree Traversal');
  const q1 = card1.locator('[data-explanation-suggestion]').nth(0), q2 = card1.locator('[data-explanation-suggestion]').nth(1);
  await q2.scrollIntoViewIfNeeded();
  // The question rows and the Chat pane are in one frame (1.0x), so the click and the thread that opens beside it are seen together.
  await camera({ x: 0, y: 0, w: VW, h: VH }, 450, 1);
  await hover(q2, 300);                                                                 // the row reveals its two buttons
  await hover(q2.locator('[data-ask="here"]'), 1000);                                   // the "Ask in chat" button and its tooltip (a hold: 1.0x)
  const askMark = at();
  await click(q2.locator('[data-ask="here"]'));
  await shot('b3a'); await pause(1800);                                                 // the thread streams in the Chat pane, in frame
  await camera(await rectOf(pane, 10), 600, 1.8);                                       // then the pane itself
  await pause(2000);                                                                    // title, action, chips are read
  await shot('b3b');
  marks.reveal.push([askMark, at()]);
  // B4: Ask in a new card on card 2's question 1: the skeleton beside the parent, then the child card and the curved link
  const r1 = card2.locator('[data-explanation-suggestion]').nth(0);
  await r1.scrollIntoViewIfNeeded();
  await camera(union(await rectOf(card2, 20), await rectOf(card1, 20)), 500, 1.6);
  await hover(r1.locator('[data-ask="card"]'), 900);                                    // the button and its tooltip ("Ask in a new card")
  await shot('b4tip');
  await click(r1.locator('[data-ask="card"]'));
  await showSkeleton(await rectOf(card2, 20), 1.4);                                      // the skeleton beside its parent
  await shot('b4sk');
  await cardWith('Searching for the Best Threshold').waitFor({ timeout: 25000 });
  await pause(400);
  await camera(union(await rectOf(card2, 20), await rectOf(cardWith('Searching for the Best Threshold'), 20)), 600, 1.5, true);
  await shot('b4'); await pause(1500);
  // B5: highlight the Bagging sentence, [Ctrl+K], Enter
  await field.evaluate(node => node.blur()).catch(() => {});
  await camera({ x: 0, y: 0, w: VW, h: VH }, 400, 1);
  await page.keyboard.press('Shift+Digit1'); await pause(800);                         // the canvas view back on everything: the markdown card fully on screen
  await scrollMarkdownTo('Random forests: the power of ensembles');
  await page.evaluate(() => { window.__rawRects = true; });
  const where = await page.evaluate(sentence => {                                         // the sentence mid-card in the markdown's own scroller; its rectangle
    const root = document.querySelector('[data-file-doc-md]'), scroller = root.closest('[data-scroll]');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent.indexOf(sentence);
      if (i < 0) continue;
      const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + sentence.length);
      const r = range.getBoundingClientRect(), box = scroller.getBoundingClientRect();
      scroller.scrollTop += r.top - (box.top + box.height * 0.4);
      const after = range.getBoundingClientRect();
      return { x: after.left, y: after.top, w: after.width, h: after.height, cardX: box.left, cardW: box.width };
    }
    return null;
  }, PASSAGE);
  await page.evaluate(() => { window.__rawRects = false; });
  if (!where) throw Error('the P3 sentence is not in the rendered markdown');
  await pause(300);
  if (!process.env.NOCAM_B5) await camera({ x: where.cardX - 20, y: where.y - 140, w: where.cardW + 40, h: 360 }, 600, 2.0);
  await page.evaluate(() => { window.__rawRects = true; });
  const span = await page.evaluate(sentence => {
    const root = document.querySelector('[data-file-doc-md]');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent.indexOf(sentence);
      if (i < 0) continue;
      const a = document.createRange(), b = document.createRange();
      a.setStart(node, i); a.setEnd(node, i + 5);
      b.setStart(node, i + sentence.length - 1); b.setEnd(node, i + sentence.length);
      const ra = a.getClientRects()[0], rb = b.getClientRects()[0];
      return { x1: ra.left + 1, y1: ra.top + ra.height / 2, x2: rb.right - 1, y2: rb.top + rb.height / 2 };
    }
    return null;
  }, PASSAGE);
  await page.evaluate(() => { window.__rawRects = false; });
  if (!span) throw Error('the P3 sentence is not in the rendered markdown');
  await glide(span.x1, span.y1, 14); await pause(150); await page.mouse.down(); await glide(span.x2, span.y2, 24);
  await page.mouse.up(); await pause(250);
  // The drag is the visual; the selection must be exactly the sentence (a drag that ends near a line end can run on into the next paragraph), so what is selected is checked and, only if it differs, set to the sentence.
  const exact = await page.evaluate(sentence => {
    const got = String(window.getSelection()).replace(/\s+/g, ' ').trim();
    if (got === sentence) return true;
    const root = document.querySelector('[data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent.indexOf(sentence);
      if (i < 0) continue;
      const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + sentence.length);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      return false;
    }
    return null;
  }, PASSAGE);
  log.push(`SEL exact after drag: ${exact}`);

  await pause(400);
  const toolbar = page.locator('[data-file-doc-selection-toolbar]');
  await toolbar.waitFor({ timeout: 8000 });
  await pause(300);
  // The camera frames what is on screen now: the toolbar (it sits right above the selection) and the selected sentence together, so neither is cut off.
  await page.evaluate(() => { window.__rawRects = true; });
  const selBox = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.evaluate(() => { window.__rawRects = false; });
  const selFree = { x: (selBox.x - cam.tx) / cam.s - 30, y: (selBox.y - cam.ty) / cam.s - 30, w: selBox.w / cam.s + 60, h: selBox.h / cam.s + 60 };
  await camera(union(await rectOf(toolbar, 30), selFree), 450, 2.0);
  await shot('b5a');
  await hover(toolbar.locator('[data-quick-ask]'), 400);
  await page.evaluate(() => window.__key());                                            // the Ctrl K key-cap sticker (recording page only)
  await press();
  await page.locator('[data-inline-ai]').waitFor({ timeout: 15000 });
  await camera(await rectOf(page.locator('[data-inline-ai]'), 60), 450, 2.2);
  await shot('b5b'); await pause(1200);
  const enterAt = at();
  await page.keyboard.press('Enter');
  // The window previews the card it made ("Adds this card to the canvas when you accept"): the preview is read, then Accept (a real click) puts the card on the canvas.
  const accept = page.locator('[data-inline-ai]').getByRole('button', { name: 'Accept' });
  await accept.waitFor({ timeout: 25000 });
  await camera(await rectOf(page.locator('[data-inline-ai]'), 60), 450, 2.2);
  await shot('b5pre'); await pause(2200);
  await click(accept);
  await cardWith('Bootstrap Coverage Limit').waitFor({ timeout: 15000 });
  marks.reveal.push([enterAt, at() + 0.8]);
  await pause(400);
  await camera(await rectOf(cardWith('Bootstrap Coverage Limit'), 30), 600, 1.6, true);   // the card Ctrl+K made, centred
  await shot('b5c'); await pause(2000);
  // B6: Ctrl+K on the empty canvas, /explain at Brief (the window's own Depth menu)
  await page.mouse.move(VW * 0.4, VH * 0.9); // an empty part of the canvas
  await camera({ x: 0, y: 0, w: VW, h: VH }, 600, 1.6);
  await glide(VW * 0.42, VH * 0.9, 14); await press();                                  // a click on empty canvas
  await page.evaluate(() => window.__key());                                            // the Ctrl K key-cap sticker (recording page only)
  await page.keyboard.press('Control+k');
  await page.locator('[data-inline-ai]').waitFor({ timeout: 15000 });
  await camera(await rectOf(page.locator('[data-inline-ai]'), 60), 450, 2.0);
  await typed('/explain', 30); await pause(300);
  log.push('DEBUG window picker: ' + JSON.stringify(await page.evaluate(() => ({ value: (document.querySelector('[data-inline-prompt]') || {}).value, options: [...document.querySelectorAll('[data-inline-ai] [role="option"], [data-inline-ai] [role="listbox"] *')].map(e => e.textContent.trim().slice(0, 40)).slice(0, 6), pill: !!document.querySelector('[data-inline-command]') }))));
  await shot('b6a');
  await click(page.locator('[data-inline-ai] [role="option"]').first());                  // the picker's first entry: explain (Explanation); the pill appears
  await pause(400);
  log.push('DEBUG window after pick: ' + JSON.stringify(await page.evaluate(() => ({ value: (document.querySelector('[data-inline-prompt]') || {}).value, cmd: document.querySelector('[data-inline-ai]').getAttribute('data-inline-command') }))));
  await shot('b6b');
  await chooseDepth(page.locator('[data-inline-ai]'), 'brief', 500);
  await click(page.locator('[data-inline-prompt]'));                                       // the field takes the focus back from the menu before anything is typed
  await typed(P4, 9); await pause(260);
  const typedP4 = await page.evaluate(() => (document.querySelector('[data-inline-prompt]') || {}).value);
  log.push(`CHECK window text equals P4: ${typedP4 === P4}`);
  if (typedP4 !== P4) throw Error(`the Ctrl+K window did not hold the P4 sentence: ${JSON.stringify(typedP4)}`);
  const enter6 = at();
  await page.keyboard.press('Enter');
  // A typed command makes its card directly (no preview): the card lands where the window was.
  const gini = page.locator('[data-block-id]').filter({ has: page.getByText('Gini Impurity vs Entropy', { exact: true }) }).first();
  await gini.waitFor({ timeout: 25000 });
  marks.reveal.push([enter6, at() + 0.8]);
  await pause(400);
  await camera(await rectOf(gini, 30), 600, 1.6, true);                                  // the card, centred
  await shot('b6'); await pause(1800);
  // B6b: "click and position the cards": at the overview, the cursor takes the new card by its handle and drops it in a free spot; a caption says so
  await camera({ x: 0, y: 0, w: VW, h: VH }, 800, 1);
  await field.evaluate(node => node.blur()).catch(() => {}); await page.keyboard.press('Shift+Digit1'); await pause(900);
  await page.evaluate(() => window.__cap('Click and drag cards anywhere', 3800));
  const handle = gini.locator('[data-drag-handle]').first();
  await hover(gini, 250);
  const hb = await handle.boundingBox(), gb = await gini.boundingBox();
  const others = [];
  for (const b of await page.locator('[data-block-id]').all()) { const bb = await b.boundingBox(); if (bb && Math.abs(bb.x - gb.x) + Math.abs(bb.y - gb.y) > 4) others.push(bb); }
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
  await pause(1000);
  // B7: the whole arrangement, held, the end
  await page.mouse.move(VW * 0.5, VH * 0.97, { steps: 10 });
  await page.screenshot({ path: join(OUT, 'poster.jpg'), type: 'jpeg', quality: 90 });
  log.push('LAYOUT (id x y w h, page px at the final fit) ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute('data-block-id').slice(0, 8), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), (e.innerText || '').slice(0, 24).replace(/\n/g, ' ')]; }))));
  await pause(2500);                                                                    // the overview is held, no drift
  marks.end = at();
} catch (error) {
  await page.screenshot({ path: join(OUT, 'failed.png') }).catch(() => {});
  log.push(`FAILED ${error.message.slice(0, 300)}`);
  log.push('DEBUGFAIL ' + JSON.stringify(await page.evaluate(() => ({ toolbars: [...document.querySelectorAll('[role="toolbar"]')].map(t => `${t.getAttribute('aria-label')}|${Object.keys(t.dataset).join(',')}|${JSON.stringify(t.getBoundingClientRect().toJSON ? t.getBoundingClientRect().toJSON() : 0)}`), selection: String(window.getSelection()).slice(0, 80), md: !!document.querySelector('[data-file-doc-md]') })).catch(e => String(e))));
  throw error;
} finally {
  writeFileSync(join(OUT, 'requests.log'), log.join('\n'));
  if (process.env.STEP && !STOPAT) { globalThis.stepOn = false; await globalThis.stepper; await finishStep(); }
  if (cdp) {
    if (globalThis.shotLoop) { globalThis.shotLoopOn = false; await globalThis.shotLoop; } else await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(frameWrites);
    writeFileSync(join(OUT, 'frames.json'), JSON.stringify({ frames: frameLog }));
  }
  writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ ...marks, t0Epoch: t0 / 1000, viewport: { w: VW, h: VH, dsf: DSF } }, null, 2));
  const video = page.video();
  await context.close(); await browser.close();
  if (video) renameSync(await video.path(), join(OUT, 'raw.webm'));
  console.log(JSON.stringify({ marks: { start: marks.start, end: marks.end, typing: marks.typing.length, reveal: marks.reveal.length, depth: marks.depth.length }, pageErrors: log.filter(l => l.startsWith('PAGEERROR')).length,
    unscripted: log.filter(l => /UNSCRIPTED|ABORT model/.test(l)), failed: log.filter(l => l.startsWith('FAILED')) }, null, 1));
}
