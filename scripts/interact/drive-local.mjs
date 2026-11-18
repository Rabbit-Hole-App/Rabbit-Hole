// Brief 27 task 3: drives a list of prompts at ONE depth through /interactive on the owner's LOCAL stack (default http://127.0.0.1:8878), on ONE fresh canvas in that stack's own storage.
//   node scripts/interact/drive-local.mjs --prompts scripts/interact/sets/ml-prompts.json [--depth brief] [--base http://127.0.0.1:8878] [--out <dir>] [--email <test identity>] [--stop-usd N]
//   node scripts/interact/drive-local.mjs --check     sign in, create the canvas, load the signed-in page and the jobs route, write ml-canvas.json; sends NO prompt and spends nothing (HTTP only, no browser)
//   node scripts/interact/drive-local.mjs --check-browser   as --check, plus a headless browser looks for the Chat composer and Depth menu (still sends nothing)
// Sign-in is plain HTTP through the local mock OAuth (OAUTH_MOCK=true on the stack): /auth/google/start, the mock authorize with a fixed sub and email, then the callback, which sets the small_session cookie.
// The test identity is not the owner's account, so the owner's canvases are untouched. Per prompt it records: pick, fill result, build result, prompt-to-card ms, USD, the saved job record, the plan, the sealed
// manifest, the captured frames when the stack exposes them, and a 100% zoom screenshot of the card (headless Chromium, 1440x900, deviceScaleFactor 1). Diagnostics (detail=1) need EXPLAIN_DIAGNOSTICS=true on the stack.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_DIR = 'C:/s/spec/interact-real', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const DEPTHS = ['brief', 'balanced', 'detailed'];
const USAGE = 'usage: node scripts/interact/drive-local.mjs (--prompts <list.json> [--depth brief|balanced|detailed] | --check | --check-browser) [--base <url>] [--out <dir>] [--email <addr>] [--canvas-file <path>] [--stop-usd N]';

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const fail = (message, code = 1) => { console.log(`RESULT FAILED: ${message}`); process.exit(code); };
if (flag('help')) { console.log(USAGE); process.exit(0); }
const check = flag('check') || flag('check-browser'), promptsFile = opt('prompts'), depth = opt('depth', 'brief');
const BASE = opt('base', 'http://127.0.0.1:8878').replace(/\/$/, ''), EMAIL = opt('email', 'owner-interact-ml@example.com');
const OUT = opt('out', join(REPO, 'docs/features/interact/evidence/2026-11-15-b27')), CANVAS_FILE = opt('canvas-file', `${SPEC_DIR}/ml-canvas.json`);
// brief 31: --steps <n> advances the card's step slider n-1 times after the card screenshot, saving <id>-stateK.png per state and every flow node's rendered box in <id>-nodes.json.
// brief 32: --times 0.6,1.8,3 sets the card's time scrubber to each moment (a timed card), saving <id>-t<k>.png, the diagram's SVG and every flow node's box in <id>-times.json; --slider-test plays the card, then moves its x slider to 2 (--slider-name "B length" --slider-value 1.5 for another) and records what changed.
// brief 34: with --times the card is re-found after a reload of the saved canvas and <id>-visible.json lists every probe point of the card that something else covers.
// brief 33: --settings "B mass=2,B length=1;B mass=1,B length=2" sets the card's sliders (by their aria-label) before each run of --times; files get -s<k> in their names.
const GROUPS = opt('settings', '').split(';').filter(Boolean), TIMES = opt('times', '').split(',').filter(Boolean).map(Number), SLIDER_TEST = flag('slider-test'), STEPS = Number(opt('steps', 0)), WAIT_MS = Number(opt('wait-ms', 300000)), stopUsd = opt('stop-usd') === undefined ? Infinity : Number(opt('stop-usd'));
if (!DEPTHS.includes(depth)) fail(`--depth takes ${DEPTHS.join(', ')}. ${USAGE}`, 2);
if (!check && !promptsFile) fail(`--prompts <list.json> is required (or --check). ${USAGE}`, 2);
if (!(stopUsd > 0)) fail(`--stop-usd is a positive number. ${USAGE}`, 2);
let PROMPTS = [];
if (promptsFile) {
  try { PROMPTS = JSON.parse(readFileSync(promptsFile, 'utf8').replace(/^﻿/, '')); } catch (error) { fail(`--prompts ${promptsFile} is not readable JSON (${error.message}). ${USAGE}`, 2); }
  if (!Array.isArray(PROMPTS) || !PROMPTS.length || PROMPTS.some(p => !p?.prompt || p.id === undefined)) fail(`--prompts takes a list of { id, prompt, expect }. ${USAGE}`, 2);
}
const log = (...a) => console.log(new Date().toISOString(), ...a), sleep = ms => new Promise(r => setTimeout(r, ms));
const firstLine = s => (s == null ? null : String(s).split('\n')[0].slice(0, 400));

// Mock sign-in over HTTP: the cookie jar carries the signed oauth flow cookie (rh_oauth) from start to callback; the session comes back as small_session.
const jar = {};
const eat = r => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0], i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookies = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const hop = async url => { const r = await fetch(url, { redirect: 'manual', headers: { ...UA, cookie: cookies() } }); eat(r); return r; };
const signIn = async () => {
  const start = await hop(`${BASE}/auth/google/start`), authorize = start.headers.get('location');
  if (start.status !== 302 || !authorize?.includes('/test/oauth/authorize')) throw new Error(`/auth/google/start did not redirect to the mock authorize page (HTTP ${start.status}); the stack needs OAUTH_MOCK=true`);
  const u = new URL(authorize, BASE); u.searchParams.set('sub', 'owner-interact-ml'); u.searchParams.set('email', EMAIL);
  const granted = await hop(u), callback = granted.headers.get('location');
  if (!callback?.includes('/auth/google/callback')) throw new Error(`the mock authorize step did not redirect to the callback (HTTP ${granted.status})`);
  await hop(new URL(callback, BASE));
  if (!jar.small_session) throw new Error('the callback set no small_session cookie');
  return jar.small_session;
};
let session;
try { session = await signIn(); } catch (error) { fail(`${error.message}. Next: is the local stack up at ${BASE} (bash C:/s/spec/owner-local/owner-stack.sh)?`); }
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};

// A new account is gated on choosing a public @handle (HandleGate); the test identity picks one over the API so the page shows the canvas.
const me = await api('GET', '/api/profile');
if (me.data && !me.data.handle) { const set = await api('PUT', '/api/profile', { handle: 'interact_ml_test' }); if (set.status >= 400) fail(`could not set a handle for the test identity (HTTP ${set.status} ${JSON.stringify(set.data)})`); }
const made = await api('POST', '/api/canvases', { title: `${opt('title', 'ML stepper')} ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) fail(`could not create a canvas (HTTP ${made.status}).`);
const saved = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
const boardId = saved.data?.board_id; if (!boardId) fail(`could not save the canvas board (HTTP ${saved.status}).`);
const url = `${BASE}/apps/${app}`; // never ?board=
mkdirSync(SPEC_DIR, { recursive: true }); mkdirSync(OUT, { recursive: true });
const record = jobs => writeFileSync(CANVAS_FILE, JSON.stringify({ base: BASE, email: EMAIL, app, boardId, depth, createdAt, jobs }, null, 2));
const createdAt = new Date().toISOString(); record([]);
const jobsOf = async () => { const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); return Array.isArray(l.data) ? l.data : (l.data?.jobs || []); };

if (check) {
  const page = await fetch(url, { headers: { ...UA, cookie: `small_session=${session}` } }), jobs = await api('GET', `/api/learn/explain/jobs?board=${encodeURIComponent(boardId)}`);
  let composers = 'not checked (HTTP only; --check-browser looks)';
  if (flag('check-browser')) { const { page: tab, browser } = await openBrowser(); await tab.goto(url); composers = await tab.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 }).then(() => 'found', () => 'NOT found'); await browser.close(); }
  console.log(`signed in as ${EMAIL} on ${BASE} (cookie small_session set); canvas ${app}; board ${boardId}; page HTTP ${page.status}; explain jobs route HTTP ${jobs.status} (${(Array.isArray(jobs.data) ? jobs.data : jobs.data?.jobs || []).length} jobs); Chat composer ${composers}; wrote ${CANVAS_FILE}`);
  const ok = page.ok && jobs.status === 200 && !String(composers).startsWith('NOT');
  const why = !page.ok ? `the signed-in page answered HTTP ${page.status}` : jobs.status === 404 ? 'sign-in, canvas and page work, but the explain jobs route answers 404: the stack runs without EXPLAIN_V2_ENABLED=true or without the EXPLAIN_JOBS Durable Object (see the hand-back)' : `the explain jobs route answered HTTP ${jobs.status}`;
  console.log(ok ? 'RESULT CHECK OK: sign-in, canvas, signed-in page and the explain jobs route work; nothing was sent' : `RESULT FAILED: ${why}`);
  await sleep(200); // lets the HTTP sockets close first: exiting at once can trip a libuv assertion on Windows
  process.exit(ok ? 0 : 1);
}

async function openBrowser() {
  const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
  let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  return { browser, page: await context.newPage() };
}

const { browser, page } = await openBrowser();
page.on('pageerror', e => log('pageerror', String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') log('console.error', m.text().slice(0, 240)); });
const net = [];
page.on('response', async r => { if (/\/api\//.test(r.url()) && !/\/(profile|presence|telemetry|analytics)/.test(r.url()) && r.request().method() !== 'OPTIONS') net.push({ method: r.request().method(), url: r.url().replace(BASE, ''), status: r.status(), body: (await r.text().catch(() => '')).slice(0, 200) }); if (net.length > 40) net.shift(); });
let approveFailed = null;
page.on('response', async r => { if (/\/explain\/jobs\/[^/]+\/approve/.test(r.url()) && r.status() >= 400) approveFailed = `approve ${r.status()}: ${(await r.text().catch(() => '')).slice(0, 200)}`; });
await page.goto(url);
// brief 35: the right panel starts closed on every page (owner 2026-11-18); the run needs the Chat composer in it.
{ const show = page.locator('[data-panel-toggle][aria-label="Show the right panel"]').first(); await show.waitFor({ timeout: 20000 }).catch(() => {}); if (await show.count()) await show.click().catch(() => {}); }
await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 90000 }).catch(async error => {
  await page.screenshot({ path: `${OUT}/no-composer.png` }).catch(() => {});
  const seen = await page.evaluate(() => ({ url: location.href, panes: document.querySelectorAll('[data-chat-pane]').length, composers: document.querySelectorAll('[data-chat-composer]').length, text: document.body.innerText.slice(0, 400) })).catch(() => null);
  fail(`no Chat composer on ${url}: ${firstLine(error.message)}; page saw ${JSON.stringify(seen)}; screenshot ${OUT}/no-composer.png`);
});
await page.waitForTimeout(2000);
const depthButton = page.locator('[data-depth-menu] [data-depth]').first();
// brief 32: a prompt entry may carry its own "depth" (two cards of different Depths on one canvas); the run's --depth is the default.
const setDepth = async want => {
  if (await depthButton.getAttribute('data-depth').catch(() => null) !== want) {
    await depthButton.click(); await page.locator(`[data-depth-option="${want}"]`).click(); await page.waitForTimeout(300);
    if (await depthButton.getAttribute('data-depth') !== want) fail(`could not set Depth to ${want}`);
  }
};
await setDepth(depth);
const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const detailOf = async (id, version) => (await api('GET', `/api/learn/explain/jobs/${id}?board=${boardId}&detail=1${version ? `&version=${version}` : ''}`)).data;
const save = (name, value) => { if (value == null) return null; writeFileSync(`${OUT}/${name}`, JSON.stringify(value, null, 2)); return name; };

const results = []; let spent = 0, stopped = null;
for (const { id, prompt, expect, depth: promptDepth } of PROMPTS) {
  await setDepth(promptDepth ?? depth);
  const tag = String(id), known = new Set((await jobsOf()).map(j => j.id)), plans0 = await page.locator('[data-generation-proposal] [data-proposal-generate]').count();
  await page.evaluate(() => document.querySelectorAll('[data-program-card]').forEach(e => e.setAttribute('data-seen', '1'))); // brief 32: the new card is the one not marked yet (several cards on one canvas)
  await box.click(); await box.fill(`/interactive ${prompt}`); await page.waitForTimeout(200);
  const tSent = Date.now(); await box.press('Enter'); log(tag, 'sent');
  const r = { id: tag, prompt, expect: expect ?? 'fit', depth: promptDepth ?? depth, jobId: null, stage: null, stopReason: null, pick: null, fill: null, build: null, promptToCardMs: null, usd: null, files: {} };
  let job = null, shown = false;
  const planWait = page.waitForFunction(count => document.querySelectorAll('[data-generation-proposal] [data-proposal-generate]').length > count, plans0, { timeout: WAIT_MS, polling: 'raf' }).then(() => { shown = true; }, () => {});
  // a fast pass builds straight through (ready with no proposal); a job that ends first (failed, cancelled) ends the wait too
  const jobEnd = (async () => { while (!shown && Date.now() - tSent < WAIT_MS) { job ??= (await jobsOf()).find(j => !known.has(j.id)); const s = job && (await api('GET', `/api/learn/explain/jobs/${job.id}?board=${boardId}`)).data?.job; if (s && ['failed', 'cancelled', 'ready'].includes(s.stage)) return s; await sleep(400); } return null; })();
  const early = await Promise.race([planWait.then(() => null), jobEnd]);
  let end = early;
  if (early) { r.jobId = early.id ?? job?.id; if (early.stage === 'ready') r.promptToCardMs = Date.now() - tSent; }
  else if (shown) {
    const proposal = page.locator('[data-generation-proposal][data-proposal-job]').last();
    r.jobId = await proposal.getAttribute('data-proposal-job'); await proposal.screenshot({ path: `${OUT}/${tag}-plan.png` }).catch(() => {});
    await proposal.locator('[data-proposal-generate]').click(); log(tag, 'job', r.jobId, 'plan shown, Generate pressed');
    const tGen = Date.now();
    while (Date.now() - tGen < 300000) { end = (await api('GET', `/api/learn/explain/jobs/${r.jobId}?board=${boardId}`)).data?.job; if (['ready', 'failed', 'cancelled'].includes(end?.stage) || end?.terminal || approveFailed) break; await sleep(400); }
    if (end?.stage === 'ready') r.promptToCardMs = Date.now() - tSent;
  }
  if (!r.jobId) { r.jobId = job?.id ?? null; }
  Object.assign(r, { stage: end?.stage ?? null, stopReason: end?.stopReason ?? null, failure: end?.failure?.message ?? approveFailed ?? (end ? null : 'no job ended within 300 s'), network: end ? undefined : net.splice(0) });
  if (end?.stage === 'ready') {
    const fresh = page.locator('[data-program-card]:not([data-seen])');
    let card = await fresh.count() ? fresh.last() : page.locator('[data-program-card]').last();
    try { await card.waitFor({ timeout: 30000 }); await card.scrollIntoViewIfNeeded();
      // brief 34: the view the chat leaves after Generate puts the card under the canvas toolbar; a fresh load of the saved canvas is the view the owner gets, with the whole card clear of it. (The new card is the last one on the fresh canvas.)
      if (TIMES.length) {
        await page.reload(); card = page.locator('[data-program-card]').last(); await card.waitFor({ timeout: 30000 }); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
        r.files.visible = save(`${tag}-visible.json`, await card.evaluate(c => { const b = c.getBoundingClientRect(), covered = []; let n = 0; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 6; j++) { const x = b.x + 12 + (b.width - 24) * i / 8, y = b.y + 12 + (b.height - 24) * j / 6, e = document.elementFromPoint(x, y); n++; if (!e || !c.contains(e)) covered.push({ x: Math.round(x), y: Math.round(y), by: e ? `${e.tagName}.${String(e.getAttribute('class') ?? '').slice(0, 40)}` : 'nothing' }); } return { box: { x: b.x, y: b.y, w: b.width, h: b.height }, viewport: { w: innerWidth, h: innerHeight }, pointsChecked: n, covered }; }));
      }
      await card.screenshot({ path: `${OUT}/${tag}-card.png` }); r.files.screenshot = `${tag}-card.png`;
      if (STEPS > 1) {
        const slider = card.locator('input[type="range"]').first(), states = [];
        for (let k = 1; k <= STEPS; k++) {
          if (k > 1) { await slider.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600); }
          await card.screenshot({ path: `${OUT}/${tag}-state${k}.png` }); await page.screenshot({ path: `${OUT}/${tag}-page${k}.png` }); const cardBox = await card.boundingBox();
          states.push({ state: k, cardBox, viewport: page.viewportSize(), nodes: await card.locator('[data-tutor-node]').evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { id: e.getAttribute('data-tutor-node'), onPath: e.hasAttribute('data-tutor-path'), x: b.x, y: b.y, w: b.width, h: b.height }; })), edges: await card.locator('[data-tutor-edge]').evaluateAll(els => els.map(e => ({ id: e.getAttribute('data-tutor-edge'), onPath: e.hasAttribute('data-tutor-path') }))) });
        }
        r.files.nodes = save(`${tag}-nodes.json`, states);
      }
      if (TIMES.length) {
        const scrub = card.locator('input[type="range"][aria-label="Time"]').first(), moments = [], layoutMeasures = [];
        for (const [gi, group] of (GROUPS.length ? GROUPS : ['']).entries()) {
        if (group) for (const pair of group.split(',')) { const [label, value] = pair.split('='); await card.locator(`input[type="range"][aria-label="${label}"]`).first().fill(value); }
        await page.waitForTimeout(600);
        const sfx = GROUPS.length ? `-s${gi + 1}` : '';
        for (const [k, t] of TIMES.entries()) {
          await scrub.fill(String(t)); await page.waitForTimeout(700);
          await card.screenshot({ path: `${OUT}/${tag}${sfx}-t${k + 1}.png` }); await page.screenshot({ path: `${OUT}/${tag}${sfx}-page-t${k + 1}.png` }); // the card element's own shot is clipped to the viewport; the page shot shows what the owner sees
          if (k === 0 || t === 3) layoutMeasures.push({ settings: group, time: t, ...(await card.evaluate(c => { const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; }, frame = c.querySelector('[data-program-frame]'), svg = frame?.querySelector('svg'); const objects = {};
            for (const g of c.querySelectorAll('[data-animation-object]')) { const id = g.getAttribute('data-animation-object'); if (/^(value\.|formula|note|label\.|support|ball\.|string\.|now|dot\.)/.test(id)) objects[id] = box(g); }
            const figure = c.querySelector('[data-frame-figure="diagram"] svg'); const scene = c.querySelector('[data-interact-scene]'), rows = [...c.querySelectorAll('[data-animation-transport], [data-scene-controls]')].map(box);
            return { card: box(c), scene: box(scene), frame: box(frame), svg: box(svg), figure: box(figure), reset: box(c.querySelector('[data-scene-reset]')), resetCell: box(c.querySelector('[data-interact-reset-cell]')), heading: !!c.querySelector('[data-interact-heading]'), readoutsRow: !!c.querySelector('[data-interact-readouts]'), controlRows: rows, sliders: [...c.querySelectorAll('input[type="range"]')].map(box), objects, viewport: { w: innerWidth, h: innerHeight } }; })) });
          moments.push({ settings: group, text: (await card.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-260), time: t, scrub: await scrub.inputValue(), box: await card.boundingBox(), fit: await card.evaluate(e => ({ scrollHeight: e.scrollHeight, clientHeight: e.clientHeight, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth })), nodes: await card.locator('[data-tutor-node]').evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { id: e.getAttribute('data-tutor-node'), onPath: e.hasAttribute('data-tutor-path'), cx: b.x + b.width / 2, cy: b.y + b.height / 2, x: b.x, y: b.y, w: b.width, h: b.height }; })),
            svg: await card.locator('[data-tutor-diagram]').first().evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, texts: [...e.querySelectorAll('text')].map(x => x.textContent), rects: [...e.querySelectorAll('rect')].map(x => ({ x: +x.getAttribute('x'), y: +x.getAttribute('y'), w: +x.getAttribute('width'), h: +x.getAttribute('height') })) }; }).catch(() => null),
            dot: await card.evaluate(c => [...c.querySelectorAll('*')].filter(e => [...e.attributes].some(a => /(^|[^a-z])dot($|[^a-z])/.test(a.value))).slice(0, 6).map(e => { const b = e.getBoundingClientRect(); return { tag: e.tagName, attrs: Object.fromEntries([...e.attributes].map(a => [a.name, String(a.value).slice(0, 60)])), cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height }; })) });
        }
        }
        r.files.times = save(`${tag}-times.json`, moments); r.files.layout = save(`${tag}-layout.json`, layoutMeasures);
      }
      if (SLIDER_TEST) {
        const scrub = card.locator('input[type="range"][aria-label="Time"]').first(), x = card.locator(`input[type="range"][aria-label="${opt('slider-name', 'x')}"]`).first();
        await scrub.fill('0'); await page.waitForTimeout(400);
        const callout = async () => (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
        const before = { time: await scrub.inputValue(), x: await x.inputValue(), text: await callout() };
        await card.getByRole('button', { name: /^Play$/ }).first().click().catch(() => {}); await page.waitForTimeout(1500);
        const playing = { time: await scrub.inputValue() }; await x.fill(opt('slider-value', '2')); await page.waitForTimeout(800);
        const after = { time: await scrub.inputValue(), x: await x.inputValue(), text: await callout() }; await page.waitForTimeout(1500);
        r.files.sliderTest = save(`${tag}-slider-test.json`, { before, playing, afterMove: after, later: { time: await scrub.inputValue() } });
      }
    } catch (e) { r.files.screenshot = `not taken: ${firstLine(e.message)}`; }
  } else await page.screenshot({ path: `${OUT}/${tag}-${end?.stage ?? 'nostage'}.png` }).catch(() => {});
  if (r.jobId) {
    const full = await detailOf(r.jobId), d = full?.diagnostics ?? null, row = d?.ledger ?? null, fast = d?.designFast ?? null;
    r.diagnostics = d ? 'on' : 'off (the stack answers no detail=1: EXPLAIN_DIAGNOSTICS is not true)';
    // the ledger row when the stack writes one, else the fast path's own pick record (brief 29: b27's rows had pick null for that reason); `top` is the most probable of the family ids and none when no family fit
    const fastPick = fast?.pick, topOf = p => Object.entries(p ?? {}).sort((a, b) => b[1] - a[1])[0] ?? null;
    r.pick = row ? { family: row.pickFamily ?? null, confidence: row.pickConfidence ?? null, ms: row.msPick ?? null }
      : fastPick ? { family: fastPick.family ?? null, confidence: fastPick.confidence ?? null, ms: fastPick.ms ?? null, reason: fastPick.reason ?? null, top: topOf(fastPick.probabilities) } : null;
    const fb = row?.designFallback ?? fast?.fallback ?? null, firstProblem = fast?.firstProblem ?? null, lastProblem = fast?.lastProblem ?? null;
    r.fill = row || fast ? { ok: !fb && row?.designKind === 'fast' && end?.stopReason !== 'design_gap', fallback: fb, corrected: !!firstProblem && !fb, firstProblem: firstLine(firstProblem), lastProblem: firstLine(lastProblem), designKind: row?.designKind ?? null }
      : { ok: end?.stopReason !== 'design_gap' && !/design|fill/i.test(String(r.failure ?? '')), line: firstLine(r.failure) };
    r.build = end?.stage === 'ready' ? { ok: true } : { ok: false, line: firstLine(r.failure) };
    const calls = Array.isArray(d?.calls) ? d.calls : [], callSum = calls.reduce((s, c) => s + (Number(c.costUsd ?? c.cost) || 0), 0);
    r.usd = row ? (Number(row.designCostUsd) || 0) + (Number(row.costUsd) || 0) : d ? callSum : null;
    spent += r.usd ?? 0;
    r.files.job = save(`${tag}-job.json`, full);
    r.files.plan = save(`${tag}-plan.json`, full?.scenePlan ?? null);
    const programHash = [d?.program?.programHash, d?.program?.hash, d?.artifact?.programHash, d?.artifact?.hash].find(h => /^[0-9a-f]{16}$/.test(h ?? ''));
    const ver = programHash ? (await detailOf(r.jobId, programHash))?.version ?? null : null;
    r.files.manifest = save(`${tag}-manifest.json`, ver?.manifest ?? null);
    r.files.frames = save(`${tag}-frames.json`, d?.captures?.length ? d.captures.slice(0, 4) : null); // capture metadata and traces; the pixel bytes are not exposed by detail=1
  }
  results.push(r); appendFileSync(`${OUT}/results.jsonl`, JSON.stringify(r) + '\n'); record(results.map(x => ({ id: x.id, jobId: x.jobId, stage: x.stage }))); log(tag, JSON.stringify({ stage: r.stage, pick: r.pick, fill: r.fill?.ok, build: r.build?.ok, ms: r.promptToCardMs, usd: r.usd }));
  if (spent >= stopUsd) { stopped = `spent US$${spent.toFixed(2)} reached --stop-usd ${stopUsd}`; break; }
}
await browser.close();
for (const r of results) console.log(`${r.id} ${String(r.stage).padEnd(9)} pick ${r.pick?.family ?? 'none'} ${r.pick?.confidence ?? '-'}; fill ${r.fill?.ok ? 'ok' : (r.fill?.firstProblem ?? r.fill?.line ?? '-')}; build ${r.build?.ok ? 'ok' : (r.build?.line ?? '-')}; ${r.promptToCardMs ?? '-'} ms; US$${r.usd?.toFixed(4) ?? '-'}`);
const ok = !stopped && results.length === PROMPTS.length && results.every(r => r.stage === 'ready');
console.log(ok ? `RESULT OK canvas ${app} (${EMAIL}): ${url}; evidence in ${OUT}` : `RESULT FAILED: ${stopped ?? 'not every prompt reached ready'}; ${results.length} of ${PROMPTS.length} done; canvas ${url}; evidence in ${OUT}`);
process.exit(ok ? 0 : 1);
