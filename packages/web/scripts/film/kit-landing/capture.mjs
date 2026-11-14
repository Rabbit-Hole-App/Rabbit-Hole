// Records the AI Tutor landing demo from the REAL Rabbit Hole canvas, Chat (Tutor) pane and Explanation card renderer.
// Owner exception (2026-10-27): a browser may run for this capture only. It is a recording, not a test.
// Nothing leaves the machine and no model is asked: the page is the built dist-dev bundle under `vite preview`, and every
// /api request is answered here. The Tutor's words are the scripted lines in script.json (chat SSE in the shape
// answer-routing-check.mjs uses); the card is the prepared pendulum-block.json (build-block.mjs), returned through the
// product's own /explain fallback path (runLearnCommand -> POST /api/learn/explain/jobs answers explain_disabled -> POST
// /api/learn/artifact). The card's mass, length, Reset experiment and Play controls are really clicked with the mouse.
// Editorial layer, recording page only: a camera (a CSS transform on <body>, eased, like a screen-recording zoom) and a
// cursor that follows the real mouse events, with a ring on each real mousedown. Neither is a product control.
// Usage (from <worktree>/packages/web, with `vite preview --outDir dist-dev --port 5480` running):
//   node C:/s/spec/landing-tutor/capture/capture.mjs <wide|phone> [outDir]
// Writes <outDir>/raw.webm, marks.json (trim points), poster.jpg, requests.log.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WEB = process.cwd();
const { chromium } = createRequire(join(WEB, 'package.json'))('@playwright/test');
const HERE = new URL('.', import.meta.url);
const TAKE = process.argv[2] === 'phone' ? 'phone' : 'wide';
const OUT = process.argv[3] || `C:/s/spec/landing-tutor/take-${TAKE}`;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:5480';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) throw Error('capture runs against a loopback preview only');
const script = JSON.parse(readFileSync(new URL('script.json', HERE), 'utf8'));
const card = JSON.parse(readFileSync(new URL('pendulum-block.json', HERE), 'utf8'));
// The app is laid out at 1600 x 888 (the card fits at 100%), recorded at 1440 x 800. The landing frame is about 1.8:1 on
// desktop; the phone edit keeps the centre 999 x 888 (9:8) of the same view, so its camera frames each moment there.
const VW = 1600, VH = 888, FW = TAKE === 'phone' ? Math.round(VH * 9 / 8) : VW, X0 = (VW - FW) / 2;

const ORG = 'demo-team', EMAIL = ['learner', 'example.invalid'].join('@'), APP = 'canvas-0e1d2c3b'; // LearnPage treats only canvas-<8 hex> as a canvas
const canvas = { name: APP, title: 'Pendulums', description: '', kind: 'canvas', hosting: 'canvas', org: ORG, orgName: 'Demo', email: EMAIL, owner_email: EMAIL,
  visibility: 'private', members: [], teams: [], published: false, shared: false, board_saved: true, access: 'private', canView: true, canEdit: true,
  url: `/apps/${APP}`, inputs: {}, outputs: {}, created_at: '2026-10-27T12:00:00Z', deployed_at: '2026-10-27T12:00:00Z', observations: [], schedule: null };
const replies = {
  // HandleGate (main.jsx) asks for a handle when the profile has none.
  '/api/profile': { name: 'Learner', avatar: null, handle: 'learner', description: '' },
  '/api/apps': { org: ORG, orgName: 'Demo', email: EMAIL, apps: [canvas], folders: [] },
  [`/api/apps/${APP}`]: canvas,
  [`/api/apps/${APP}/learn-course`]: { course: null, canAuthor: true },
  '/api/workspaces': { active: ORG, email: EMAIL, workspaces: [{ slug: ORG, name: 'Demo', role: 'owner', kind: 'custom' }] },
  // GET /api/learn/boards/<app>/main as learn-boards.js answers a new canvas: nothing saved yet.
  [`/api/learn/boards/${APP}/main`]: { exists: false, sharing: { shared: false, view: null, edit: null, public_view: false } },
  '/api/learn/cad/jobs': { blocks: [] },
};
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// The CR-1 route decision for a plain question (e2e/dev-cp.mjs chatRouteAnswer): answer it normally.
const { chatRouteAnswer } = await import(pathToFileURL(join(WEB, 'e2e/dev-cp.mjs')).href);

const log = [];
let nextReply = null, turn = 1;
const THREAD = 'canvaschat-0e1d2c3b-pendulum';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, reducedMotion: 'no-preference', recordVideo: { dir: OUT, size: { width: 1440, height: 800 } } });
let t0 = Date.now();
const at = () => Number(((Date.now() - t0) / 1000).toFixed(2));
await context.route('**/*', route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (url.origin !== BASE) { log.push(`ABORT outside ${url.hostname}`); return route.abort(); }
  if (!path.startsWith('/api/')) return route.continue();
  log.push(`${at()} ${method} ${path}`);
  if (path === '/api/learn/chat/route') return route.fulfill({ json: chatRouteAnswer(request.postDataJSON() || {}) });
  if (path === '/api/learn/ask' && method === 'POST') {
    if (!nextReply) { log.push('UNSCRIPTED ask'); return route.fulfill({ status: 503, json: { error: 'unscripted' } }); }
    const text = nextReply; nextReply = null; turn++;
    const messageId = String(turn * 2);
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: frame('chunk', { text })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer' })
      + frame('done', { threadId: THREAD, userMessageId: String(turn * 2 - 1), messageId }) });
  }
  // Where Auto sends the turn to the Tutor planner instead, the same scripted line is its one respond_text action.
  if (path === '/api/learn/tutor/plan' && method === 'POST' && nextReply) {
    const text = nextReply; nextReply = null;
    return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text }] } });
  }
  // /explain v2 is off here, so the command takes the existing artifact path; the answer is the prepared card, not a generation.
  if (path === '/api/learn/explain/jobs' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available', code: 'explain_disabled' } });
  if (path === '/api/learn/artifact' && method === 'POST') return route.fulfill({ json: { result: 'artifact', primitive: 'animation', block: structuredClone(card) } });
  if (/^\/api\/learn\/(tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course)/.test(path) && method !== 'GET') { log.push(`ABORT model-capable ${path}`); return route.fulfill({ status: 404, json: { error: 'Not available' } }); }
  if (path === '/api/telemetry/client') log.push(`TELEMETRY ${(request.postData() || '').slice(0, 600)}`);
  if (method !== 'GET') return route.fulfill({ json: { ok: true, version: 2 } });
  // Not a Rabbit Hole and no earlier chat: what the server answers a fresh canvas (Dive.jsx treats a refusal as no holes).
  if (path === '/api/canvases/dives') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (path === '/api/ask/threads') return route.fulfill({ json: { threads: [] } });
  // The canvas's saved conversation so far (chat-threads.js restore): the learner's goal and the Tutor's question.
  if (path === '/api/learn/chat/active') return route.fulfill({ json: { threadId: THREAD } });
  if (path === `/api/ask/threads/${THREAD}`) return route.fulfill({ json: { id: THREAD, title: script.opening.learner, mode: 'auto', contextRefs: [], draft: null,
    messages: [{ id: 'm-1', role: 'user', content: script.opening.learner, status: 'done' }, { id: 'm-2', role: 'assistant', content: script.opening.tutor, status: 'done' }] } });
  if (path.startsWith(`/api/learn/boards/${APP}/`) && path.split('/').length === 6) return route.fulfill({ json: replies[`/api/learn/boards/${APP}/main`] });
  if (path.endsWith('/main/assets')) return route.fulfill({ json: { keys: [] } });
  if (path in replies) return route.fulfill({ json: replies[path] });
  if (['/api/watch', '/api/learn/usage', '/api/learn/graph-config', '/api/learn/image-jobs'].includes(path)) return route.fulfill({ json: {} });
  // Anything else is a feature this fresh canvas does not have: the server's refusal, which each caller already handles.
  log.push(`404 ${path}`);
  return route.fulfill({ status: 404, json: { error: 'Not found' } });
});
// The camera and the cursor, outside <body> so the camera never moves them.
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById('rh-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `html{overflow:hidden}body{transform-origin:0 0;transition:transform var(--cam,0ms) cubic-bezier(.65,0,.35,1)}
      #rh-cursor{position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;width:26px;height:32px;margin:-2px 0 0 -3px;filter:drop-shadow(0 1px 2px #0005);transition:none}
      #rh-ring{position:fixed;z-index:2147483646;pointer-events:none;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#2383e233;border:2px solid #2383e2aa;opacity:0}
      #rh-ring.on{animation:rh-ring .5s ease-out}
      @keyframes rh-ring{0%{opacity:1;transform:scale(.35)}100%{opacity:0;transform:scale(1.15)}}`;
    const cursor = document.createElement('div');
    cursor.id = 'rh-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 32 40" width="26" height="32"><path d="M3 2v29l8-7 6 13 6-3-6-12h12Z" fill="white" stroke="#20211f" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.id = 'rh-ring';
    document.documentElement.append(style, ring, cursor);
    addEventListener('mousemove', event => { cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`; }, true);
    addEventListener('mousedown', event => { ring.style.left = `${event.clientX}px`; ring.style.top = `${event.clientY}px`; ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on'); }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
});
const page = await context.newPage();
t0 = Date.now(); // the video starts with the page
page.on('pageerror', error => log.push(`PAGEERROR ${error.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error') log.push(`CONSOLE ${m.text().slice(0, 300)}`); });
const pause = ms => page.waitForTimeout(ms);
const pane = page.locator('[data-chat-pane]');
const field = pane.locator('[data-chat-composer] textarea, [data-chat-composer] input:not([type="file"])').first();
const answer = text => pane.locator('[data-answer]').filter({ hasText: text.slice(0, 40) });

// Camera: frame a page rectangle (untransformed CSS px) in the output frame, eased over ms, never below 1x.
let cam = { s: 1, tx: 0, ty: 0 };
const camera = async (r, ms = 550, max = 2.4) => {
  const s = Math.min(max, Math.max(1, Math.min(FW / r.w, VH / r.h)));
  let tx = VW / 2 - s * (r.x + r.w / 2), ty = VH / 2 - s * (r.y + r.h / 2);
  tx = Math.min(X0, Math.max(X0 + FW - s * VW, tx)); ty = Math.min(0, Math.max(VH - s * VH, ty));
  cam = { s, tx, ty };
  await page.evaluate(([c, d]) => { document.body.style.setProperty('--cam', `${d}ms`); document.body.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`; }, [cam, ms]);
  await pause(ms + 60);
};
// An element's rectangle with the camera taken out, optionally grown by pad.
const rectOf = async (locator, pad = 0) => {
  const b = await locator.boundingBox();
  return { x: (b.x - cam.tx) / cam.s - pad, y: (b.y - cam.ty) / cam.s - pad, w: b.width / cam.s + 2 * pad, h: b.height / cam.s + 2 * pad };
};
const union = (...rs) => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
// A real click: the mouse glides to the control's centre (the cursor follows its events), then presses.
const click = async locator => {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  log.push(`CLICK at ${Math.round(b.x + b.width / 2)},${Math.round(b.y + b.height / 2)} hits ${await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName} ${[...e.attributes].map(a => `${a.name}=${a.value.slice(0, 30)}`).join(' ')}`.slice(0, 200) : 'nothing'; }, [b.x + b.width / 2, b.y + b.height / 2])}`);
  await pause(120); await page.mouse.down(); await pause(70); await page.mouse.up(); await pause(220);
};
// marks.typing: [start, end] seconds of every stretch of keystrokes, so retime.mjs can keep typing at 1.0x (owner 2026-10-27).
const typed = async (text, delay) => { const a = at(); await page.keyboard.type(text, { delay }); (marks.typing ||= []).push([a, at()]); };
const typeIn = async (text, delay = 14) => { await click(field); await typed(text, delay); await pause(250); };
// One learner message and the Tutor's scripted reply: the camera moves in on the composer while the learner writes, then
// frames the learner's message with the Tutor's answer for reading.
const composer = pane.locator('[data-chat-composer]');
const toComposer = async () => camera(await rectOf(composer, 30), 500, 2.1);
const say = async (learner, tutor, read) => {
  nextReply = tutor;
  await toComposer();
  await typeIn(learner); await page.keyboard.press('Enter');
  await answer(tutor).waitFor({ timeout: 20000 });
  await pause(120);
  await camera(union(await rectOf(pane.locator('[data-user-turn]').last(), 20), await rectOf(answer(tutor).last(), 20)), 600, 2.1);
  await pause(read);
};
// After a click on the card the pointer rests in the drawing's empty lower right, away from the toolbar and the swings.
const park = async () => { const b = await cardRoot.locator('svg').first().boundingBox(); await page.mouse.move(b.x + b.width * .86, b.y + b.height * .78, { steps: 10 }); }; // the empty lower right of the drawing
const cardRoot = page.locator('[data-block-id]').filter({ has: page.locator('[data-input-control="bMass"]') }).first();
// The whole workspace; the phone edit cannot hold all of it, so it shows the conversation and the canvas beside it.
const overview = async (ms = 800) => camera(TAKE === 'phone' ? await rectOf(pane) : { x: 0, y: 0, w: VW, h: VH }, ms);
const marks = {};
try {
  await page.goto(`${BASE}/apps/${APP}`);
  await field.waitFor({ timeout: 25000 });
  await answer(script.opening.tutor).waitFor({ timeout: 20000 }); // the saved conversation is restored
  await pause(2500); // the board's first save and its notices settle (trimmed off)
  const [ask, open, next, together, slower] = script.turns;
  await overview(0);
  marks.start = at();
  await pause(700);                                         // the workspace, briefly
  await camera(union(await rectOf(pane.locator('[data-user-turn]').last(), 20), await rectOf(answer(script.opening.tutor), 20)), 550, 2.1);
  await pause(2500);                                        // the Tutor's question
  await say(ask.learner, ask.tutor, 2900);                  // "More weight?" / "Let's compare two pendulums. Type /explain ..."
  // The learner opens the experiment with the real /explain command (the picker: /explain, Enter, then the words).
  await toComposer();
  await click(field); await typed('/explain', 30); await pause(220); await page.keyboard.press('Enter');
  await pause(180); await typed(open.learner, 9); await pause(260); await page.keyboard.press('Enter');
  await cardRoot.waitFor({ timeout: 20000 });
  await pause(250);
  // The card is taller than the canvas at 100%: the canvas's own Zoom to fit (Shift+1) shows all of it; the camera then reads it.
  await field.evaluate(node => node.blur()); await page.keyboard.press('Shift+Digit1'); await pause(450);
  await overview(500);                                      // the card arrives on the canvas beside the conversation
  await pause(700);
  const sceneBox = cardRoot.locator('svg').first(), transport = cardRoot.locator('[data-animation-transport]'), controls = cardRoot.locator('[data-scene-controls]');
  const experiment = async (ms = 550) => camera(union(await rectOf(sceneBox, 14), await rectOf(transport, 8)), ms); // both pendulums, readouts and the player
  const controlsView = async () => camera(union(await rectOf(transport, 10), await rectOf(controls, 10)), 500);
  const choose = (name, value) => click(controls.locator(`[data-input-control="${name}"][data-input-value="${value}"]`));
  await say(next.learner, next.tutor, 3000);                // the Tutor, now that the card is there: "Change B's mass to 2 kg ..."
  await controlsView();
  await choose('bMass', 1);                                 // B: 2 kg
  await click(transport.locator('[data-animation-play]'));  // Play
  marks.run1 = at();
  await park();
  await experiment(450);
  await pause(4800);                                        // real time: about two and a half swings each, together (2.01 s)
  marks.run1End = at();
  await say(together.learner, together.tutor, 3300);
  await controlsView();
  await choose('bMass', 0);                                 // B: 1 kg (the player pauses and returns to 0 s)
  await choose('bLen', 1);                                  // B: 2 m
  await click(transport.locator('[data-animation-play]'));  // Play
  marks.run2 = at();
  await park();
  await experiment(450);
  await pause(4800);                                        // real time: B (2.84 s) falls out of step with A (2.01 s)
  marks.run2End = at();
  await say(slower.learner, slower.tutor, 3400);
  await overview(500);
  await pause(500);
  marks.end = at();
  await page.screenshot({ path: join(OUT, 'poster.jpg'), type: 'jpeg', quality: 86, clip: { x: X0, y: 0, width: FW, height: VH } });
} catch (error) {
  await page.screenshot({ path: join(OUT, 'failed.jpg'), type: 'jpeg', quality: 80 }).catch(() => {});
  throw error;
} finally {
  writeFileSync(join(OUT, 'requests.log'), log.join('\n'));
  writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ ...marks, crop: { x: X0, w: FW, viewport: VW } }, null, 2));
  const video = page.video();
  await context.close(); await browser.close();
  if (video) renameSync(await video.path(), join(OUT, 'raw.webm'));
  console.log(JSON.stringify({ take: TAKE, marks, pageErrors: log.filter(l => l.startsWith('PAGEERROR')).length, unscripted: log.filter(l => /UNSCRIPTED|ABORT model/.test(l)) }, null, 1));
}
