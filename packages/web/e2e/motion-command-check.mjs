// /motion as the command for the Motion explainer-video pipeline (owner, 2026-10-20, lane L8), against the LOCAL stack only, in
// light and in dark. No model call and no paid call: every model route is aborted and counted, and no Motion orchestrator is
// configured on a local stack (its .dev.vars has no MOTION_* key).
// MOTION=on (default; the stack's development build, VITE_COACHING_DEV, offers /motion). Per theme:
//   0. saved /animate work still renders, first on a fresh page: a maths-animation video card made by /animate and an animation
//      scene card, nothing regenerated;
//   1. discovery: the Chat picker lists /motion under Create, "Create an animated explainer video", and no /animate;
//   2. the selected pill reads Motion (no /) with Remove Motion, picked or typed;
//   3. typed /motion: the confirmation shows the exact line; Cancel starts nothing and adds no card;
//   4. MOCKED generation (/api/learn/video stubbed here): Generate adds one card and starts exactly one confirmed
//      motion_request; the card shows its progress, then the ready video with the job's title (no meta line, owner message 31);
//   5. MOCKED failure: the stubbed job fails; the card says why and offers Retry render; nothing else starts;
//   5b. MOCKED reload mid-job (lane mact): a card saved while its job runs keeps that job's placement id, so after a reload it
//      follows the same job (polls only, no second start) and shows the video once ready;
//   6. REAL refusal (no stub): the stack's worker has no orchestrator, so Generate's one request is refused and the card
//      says Motion is not available in this environment, retryable;
//   7. the Slash commands window: opening it and choosing /motion sends no request but the committed clip's own GET; its card
//      plays that real Motion video (job 8a2015a4) from memory, pauses and seeks (static assets answer without byte ranges, so
//      the plain path could not seek); no /animate row;
//   8. MOCKED selected card (owner brief 2026-10-21 message 7 item 4): with a card selected, /motion explain this sends the
//      card's id, title and text as motion_request context.selection; the line stays the learner's words;
// MOTION=off (a production-like build: VITE_RABBIT_HOLE=true only). Per theme: no /motion or /animate in the picker or the
//   window, and a typed /motion says Motion is not available here and runs nothing.
// Usage: BASE=http://127.0.0.1:9261 SMALL_CP=http://127.0.0.1:9263 VARS=C:/s/toc-uimotion/.dev.vars [MOTION=off] node e2e/motion-command-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { causalAttentionScene } from '../src/reference-scenes.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9261';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9263';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('motion-command-check runs against a local stack only');
const OFF = process.env.MOTION === 'off';
const OUT = process.argv[2] || 'motion-command-shots';
mkdirSync(OUT, { recursive: true });
const vars = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
assert.doesNotMatch(vars, /^MOTION_/m, 'a local stack has no Motion orchestrator');
const secret = vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `motion-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

const LINE = '/motion 15s explain me softmax func';
const CLIP = '/lesson-assets/motion-softmax-8a2015a4.mp4';
const CLIP_BYTES = readFileSync(new URL(`../public${CLIP}`, import.meta.url));
const TITLE = 'Softmax: Turning Attention Scores into Weights';
const PAUSED = 'Motion generation is temporarily unavailable while we fix a reliability issue.';
const REFUSED = 'Motion is not available in this environment yet. Nothing was started.';
// Saved before this change: a maths animation made by /animate (its clip a committed file here, as a stored clip would be) and
// an animation scene card. Neither may regenerate or break.
const OLD_ANIMATE = { id: 'k-animate', type: 'video', mode: 'generate', title: 'Why the sigmoid saturates', caption: 'Made by /animate before /motion replaced it.', status: 'ready',
  src: '/landing/softmax-overview-v1.mp4', variants: [{ src: '/landing/softmax-overview-v1.mp4' }], variant: 0, promptUsed: '/animate why the sigmoid saturates', dx: 0, dy: 0,
  operation: { op: 'generate_math_animation', id: 'sigmoid-saturation', concept: 'Sigmoid saturation', purpose: 'derivation', caption: 'The derivative peaks at a quarter.',
    scene: { title: 'Where the slope goes', steps: [{ kind: 'equation', expressions: ['\\sigma(x) = \\frac{1}{1 + e^{-x}}'], note: 'the sigmoid', hold: 2 }] } } };
const PHOTO = { id: 'k-photo', type: 'explanation', dx: 0, dy: 0, title: 'Photosynthesis', body: 'Plants use light energy to turn carbon dioxide and water into glucose and oxygen.' };
const OLD_SCENE = { id: 'k-scene', type: 'animation', title: causalAttentionScene.title, scene: causalAttentionScene, time: 0, selectedObject: null, marked: null, dx: 620, dy: 0 };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Motion check ${run}` }) });
// The saved cards get a canvas of their own per theme, so the cards this check makes never move them out of view.
const savedCanvas = async theme => {
  const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Saved animate cards ${theme} ${run}` }) });
  await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [OLD_ANIMATE, OLD_SCENE] } }) });
  return made;
};

const total = OFF ? 6 : 22; // per theme: 11 steps with Motion on, 3 with it off
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`); }
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 200)); } };

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => { try { localStorage.setItem('small.theme', value); } catch {} }, theme);
  // Every request the page makes to /api/learn, with its method and body, and every model route refused.
  const seen = [], model = [];
  context.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/learn/') || url.pathname === CLIP) seen.push({ method: request.method(), path: url.pathname, query: url.search, body: request.postData() || '' }); });
  await context.route(/\/api\/learn\/(artifact|tutor\/plan|ask|selection|inline\/[\w-]+|image|scene|search|voice\/[\w-]+)(\?|$)/, route => { model.push(new URL(route.request().url()).pathname); return route.abort(); });
  await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  const shot = name => page.screenshot({ path: `${OUT}/${theme}-${OFF ? 'off-' : ''}${name}.png` });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme is applied');
  const dock = page.locator('[data-chat-pane]');
  const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  const picker = dock.locator('[data-slash-picker]');
  const pill = dock.locator('[data-command-pill]');
  const notice = dock.locator('[data-slash-result]');
  const videoPosts = () => seen.filter(r => r.path === '/api/learn/video' && r.method === 'POST' && !r.body.includes('"action"'));
  const dismiss = async () => { await dock.getByRole('button', { name: 'Dismiss' }).click({ timeout: 1500 }).catch(() => {}); await composer().fill(''); };
  const pickerRows = async () => {
    await composer().click(); await composer().fill('/');
    await picker.waitFor();
    await picker.locator('[data-slash-more]').click();
    return picker.locator('[data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand));
  };
  const openWindow = async () => {
    await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Slash commands' }).click();
    const sheet = page.getByRole('dialog', { name: 'Slash commands' });
    await sheet.waitFor();
    return sheet;
  };
  const closeWindow = async sheet => { await sheet.locator('[data-slash-search]').focus(); await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => page.keyboard.press('Escape')); };

  if (OFF) {
    await step(`${theme} off: the picker offers neither /motion nor /animate`, async () => {
      const rows = await pickerRows();
      assert.ok(rows.length > 10 && !rows.includes('motion') && !rows.includes('animate'), rows.join(' '));
      await shot('01-picker');
      await composer().fill('');
    });
    await step(`${theme} off: a typed /motion says Motion is not available here and runs nothing`, async () => {
      const before = seen.length;
      await composer().fill(LINE); await composer().press('Enter');
      await notice.getByText('Motion (animated explainer videos) is not available here.', { exact: true }).waitFor({ timeout: 8000 });
      assert.equal(await dock.locator('[data-paid-generate]').count(), 0, 'no confirmation');
      assert.equal(seen.slice(before).filter(r => r.path === '/api/learn/video').length, 0, 'no video request');
      assert.equal(await page.getByText(`Motion: ${LINE.slice(8)}`).count(), 0, 'no card');
      await shot('02-typed-motion-off');
      await dismiss();
    });
    await step(`${theme} off: the Slash commands window lists neither /motion nor /animate`, async () => {
      const sheet = await openWindow();
      const listed = await sheet.locator('[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp));
      assert.ok(listed.length > 10 && !listed.includes('motion') && !listed.includes('animate'), listed.join(' '));
      await sheet.screenshot({ path: `${OUT}/${theme}-off-03-window.png` });
      await closeWindow(sheet);
    });
    assert.deepEqual(errors, [], 'no page errors');
    await context.close();
    continue;
  }

  await step(`${theme}: saved /animate work still renders: its maths-animation video and an animation scene, nothing regenerated`, async () => {
    const saved = await savedCanvas(theme);
    await page.goto(`${BASE}/apps/${saved.name}`);
    await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
    await shot('10-board');
    const old = page.locator('[data-block-id="k-animate"]');
    await old.scrollIntoViewIfNeeded();
    const video = old.locator('video[data-lesson-video]');
    await video.waitFor();
    const duration = await video.evaluate(node => new Promise(done => { if (node.readyState >= 1) return done(node.duration); node.addEventListener('loadedmetadata', () => done(node.duration), { once: true }); setTimeout(() => done(0), 10000); }));
    assert.ok(duration > 20, `the saved clip loads: ${duration}s`);
    assert.match(await old.innerText(), /Why the sigmoid saturates/);
    assert.equal(await old.locator('[data-generate-video]').count(), 0);
    const scene = page.locator('[data-block-id="k-scene"]');
    await scene.scrollIntoViewIfNeeded();
    // The scene draws as an SVG with its objects (AnimatedScene.jsx).
    const drawn = scene.locator('svg[viewBox]').first();
    await drawn.waitFor({ state: 'attached' });
    assert.ok(await drawn.evaluate(node => node.querySelectorAll('*').length) > 10, 'the scene draws its objects');
    assert.match(await scene.innerText(), new RegExp(causalAttentionScene.title));
    // Played (a DOM click: the minimap and Curious panel may sit over its transport), the scene moves on and draws its beats.
    await scene.getByRole('button', { name: /^Play/ }).first().evaluate(button => button.click());
    await page.waitForTimeout(2500);
    assert.equal(seen.filter(r => r.method === 'POST' && r.path === '/api/learn/video' && r.body.includes('generate_math_animation')).length, 0, 'nothing regenerated');
    await old.screenshot({ path: `${OUT}/${theme}-10-saved-animate-card.png` });
    await scene.screenshot({ path: `${OUT}/${theme}-11-saved-scene-card.png` });
  });

  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });

  await step(`${theme}: discovery: /motion is under Create with "Create an animated explainer video"; no /animate`, async () => {
    const rows = await pickerRows();
    assert.ok(rows.includes('motion') && !rows.includes('animate'), rows.join(' '));
    assert.ok(rows.indexOf('diagram') < rows.indexOf('motion') && rows.indexOf('motion') < rows.indexOf('flashcards'), `Create order: ${rows.join(' ')}`);
    assert.equal((await picker.locator('[data-slash-command="motion"]').innerText()).replace(/\s+/g, ' ').trim(), '/motion Create an animated explainer video');
    await picker.locator('[data-slash-command="motion"]').scrollIntoViewIfNeeded();
    await shot('01-picker');
    await composer().fill('/anim');
    await dock.locator('[data-slash-none]').waitFor({ timeout: 5000 });
    await composer().fill('/mot');
    assert.deepEqual(await picker.locator('[data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand)), ['motion']);
    await composer().fill('');
  });

  await step(`${theme}: the selected pill reads Motion, never /motion, picked or typed`, async () => {
    await composer().fill('/');
    await picker.locator('[data-slash-command="motion"]').click();
    await pill.waitFor();
    assert.deepEqual([await pill.getAttribute('data-command-pill'), (await pill.innerText()).trim()], ['motion', 'Motion']);
    assert.equal(await dock.getByRole('button', { name: 'Remove Motion', exact: true }).count(), 1);
    await shot('02-pill-picked');
    await dock.getByRole('button', { name: 'Remove Motion', exact: true }).click();
    await composer().fill('/motion ');
    await pill.waitFor();
    assert.deepEqual([await pill.getAttribute('data-command-pill'), (await pill.innerText()).trim()], ['motion', 'Motion']);
    await dock.getByRole('button', { name: 'Remove Motion', exact: true }).click();
    await composer().fill('');
  });

  await step(`${theme}: typed /motion asks first, showing the exact line; Cancel starts nothing and adds no card`, async () => {
    const before = seen.length, cards = await page.locator('[data-block-id]').count();
    await composer().fill(LINE); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').waitFor();
    assert.equal((await dock.locator('[data-paid-prompt]').innerText()).trim(), LINE);
    // Owner message 30 (replacing message 25's wording): the plain paid-generation line, no amount or reservation sentence.
    assert.match(await notice.innerText(), /This uses paid generation\./);
    assert.doesNotMatch(await notice.innerText(), /\$\d|reserv|Rendering is covered|credit/i); // no orchestrator here: no estimate
    // The confirmation still reads the video list (a GET) before Generate, for the pause (owner message 28); nothing else
    // may reach the video route (a saved card's clip may load meanwhile, a GET of its asset).
    const reads = () => seen.slice(before).filter(r => r.path === '/api/learn/video' && r.method === 'GET' && !r.query.includes('asset='));
    const asked = () => seen.slice(before).filter(r => r.path === '/api/learn/video' && r.method !== 'GET');
    assert.ok(reads().length >= 1, 'the confirmation read the video list from the server');
    assert.equal(asked().length, 0, 'nothing asked of the video route before Generate');
    await notice.screenshot({ path: `${OUT}/${theme}-03-confirm.png` });
    await dock.locator('[data-paid-cancel]').click();
    await page.waitForTimeout(800);
    assert.equal(asked().length, 0, 'Cancel starts nothing');
    assert.equal(await page.locator('[data-block-id]').count(), cards, 'Cancel adds no card');
    await dismiss();
  });

  // The video route, stubbed for steps 4 and 5 only (MOCKED): wiring, not generation.
  let stub = null;
  const KEY = 'a'.repeat(64);
  await page.route(/\/api\/learn\/video\?/, async route => {
    if (!stub) return route.fallback();
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('asset')) return route.fulfill({ body: CLIP_BYTES, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' } });
    // New generation paused on the server (MOCKED, owner message 28): the list says so and the start is refused.
    if (stub.paused) return request.method() === 'POST' ? route.fulfill({ status: 503, json: { error: PAUSED, code: 'motion_paused' } }) : route.fulfill({ json: { motionPaused: true, videos: [] } });
    // The server's reservation (MOCKED): still in the API (internal only, owner message 30); the card must never show it.
    const hold = status => ({ usd: 8.96, state: status === 'generating' ? 'reserved' : status === 'failed' ? 'pending' : 'released' });
    const video = status => ({ id: stub.id, key: KEY, status, retryable: true, hold: hold(status),
      ...(status === 'failed' ? { error: 'The Motion job failed: still blocking after the repair round: blank_frame' } : {}),
      ...(status === 'ready' ? { provider: 'motion', motion: { title: TITLE, duration_seconds: 15, renderer: 'remotion', source_refs: [{ id: 'S1', kind: 'code', path: 'model.py', start_line: 62, end_line: 64 }] } } : {}) });
    if (request.method() === 'POST') return route.fulfill({ status: 202, json: { motionHoldUsd: 8.96, motionEstimateCredits: 100, videos: [video('generating')], placementId: stub.id } });
    stub.polls += 1;
    return route.fulfill({ json: { motionHoldUsd: 8.96, motionEstimateCredits: 100, videos: [video(!stub.held && stub.polls >= 2 ? stub.end : 'generating')] } });
  });

  await step(`${theme}: MOCKED generation: Generate adds one card and starts one confirmed motion_request; the ready video plays in it`, async () => {
    stub = { id: `p-ready-${theme}`, polls: 0, end: 'ready', held: true };
    const posts = videoPosts().length;
    await composer().fill(LINE); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').waitFor();
    // Owner messages 30 and 32: the server's estimate in credits (MOCKED 100); its reservation (MOCKED 8.96) is never shown.
    assert.match(await notice.innerText(), /This uses paid generation · about 100 credits/);
    assert.doesNotMatch(await notice.innerText(), /\$\d|reserv|Rendering is covered/i);
    await dock.locator('[data-paid-generate]').click();
    const card = page.locator('[data-block-id]', { hasText: 'Planning, reviewing and rendering' });
    await card.waitFor({ timeout: 10000 });
    const id = await card.getAttribute('data-block-id');
    // While it runs (after a poll that carried the MOCKED hold): no amount or reservation line on the card (owner message 30).
    for (let i = 0; i < 100 && stub.polls < 1; i++) await page.waitForTimeout(100);
    assert.ok(stub.polls >= 1, 'the card polled its job');
    assert.equal(await card.locator('[data-video-hold]').count(), 0, 'no hold line');
    assert.doesNotMatch(await card.innerText(), /\$\d|reserv/i);
    stub.held = false;
    await page.waitForTimeout(600);
    await shot('04-generating');
    const mine = page.locator(`[data-block-id="${id}"]`);
    const video = mine.locator('video[data-lesson-video]');
    await video.waitFor({ timeout: 20000 });
    const duration = await video.evaluate(node => new Promise(done => { if (node.readyState >= 1) return done(node.duration); node.addEventListener('loadedmetadata', () => done(node.duration), { once: true }); setTimeout(() => done(0), 10000); }));
    assert.equal(Math.round(duration), 15, `duration ${duration}`);
    // Owner message 31: the title shows; the meta line (15s · Motion explainer · Remotion · grounding) does not.
    assert.match(await mine.innerText(), new RegExp(TITLE));
    assert.doesNotMatch(await mine.innerText(), /Motion explainer|Not grounded/);
    const started = videoPosts().slice(posts);
    assert.equal(started.length, 1, 'exactly one start');
    const body = JSON.parse(started[0].body);
    assert.deepEqual([body.confirmed, body.operation.op, body.operation.request], [true, 'motion_request', LINE]);
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-05-ready-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED failure: the card says why and offers Retry render; nothing else starts`, async () => {
    stub = { id: `p-fail-${theme}`, polls: 0, end: 'failed' };
    const posts = videoPosts().length;
    await composer().fill('/motion 10s explain the causal mask'); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').click();
    const mine = page.locator('[data-block-id]', { hasText: 'still blocking after the repair round: blank_frame' });
    await mine.waitFor({ timeout: 20000 });
    assert.equal((await mine.locator('[data-generate-video]').innerText()).trim(), 'Retry render');
    // Its final cost is not confirmed yet (MOCKED pending), and the card still shows no amount or reservation (owner message 30).
    assert.equal(await mine.locator('[data-video-hold]').count(), 0, 'no hold line');
    assert.doesNotMatch(await mine.innerText(), /\$\d|reserv|Reconciliation/i);
    assert.equal(videoPosts().length - posts, 1, 'one start, no automatic retry');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-06-failed-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED paused: the confirmation says Motion generation is paused; Generate is refused with the same text`, async () => {
    stub = { id: `p-paused-${theme}`, polls: 0, paused: true };
    const posts = videoPosts().length;
    await composer().fill(`/motion 11s explain dropout ${theme}`); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').waitFor();
    assert.equal((await notice.innerText()).includes(PAUSED), true, 'the confirmation says generation is paused');
    assert.doesNotMatch(await notice.innerText(), /\$\d/, 'no reservation is offered');
    await dock.locator('[data-paid-generate]').click();
    const mine = page.locator('[data-block-id]', { hasText: PAUSED });
    await mine.waitFor({ timeout: 20000 });
    assert.equal(videoPosts().length - posts, 1, 'one start, refused by the server');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-06a-paused-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED reload mid-job: the saved card follows the same job again, with no second start, and plays it`, async () => {
    stub = { id: `p-reload-${theme}`, polls: 0, end: 'ready', held: true };
    const posts = videoPosts().length;
    await composer().fill(`/motion 15s explain attention heads ${theme}`); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').click();
    const card = page.locator('[data-block-id]', { hasText: 'Planning, reviewing and rendering' });
    await card.waitFor({ timeout: 10000 });
    const id = await card.getAttribute('data-block-id');
    // The board is saved with the job's placement id before the reload.
    await until(() => seen.some(r => r.method === 'PUT' && /\/api\/learn\/boards\/[^/]+\/main$/.test(r.path) && r.body.includes(stub.id)), 'the board saved with the placement id');
    await page.reload();
    await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
    const mine = page.locator(`[data-block-id="${id}"]`);
    await mine.waitFor({ timeout: 30000 });
    const polled = stub.polls;
    await until(() => stub.polls > polled, 'the restored card polls its job');
    stub.held = false;
    await mine.locator('video[data-lesson-video]').waitFor({ timeout: 30000 });
    assert.equal(videoPosts().length - posts, 1, 'one start; the reload only follows it');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-06b-reloaded-ready-card.png` });
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
    await dismiss();
  });

  await step(`${theme}: REAL refusal: with no orchestrator the worker refuses Generate; the card says Motion is not available here`, async () => {
    stub = null;
    const posts = videoPosts().length;
    await composer().fill(`/motion 12s explain layer norm ${theme}`); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').click();
    const mine = page.locator('[data-block-id]', { hasText: REFUSED });
    await mine.waitFor({ timeout: 20000 });
    assert.equal((await mine.locator('[data-generate-video]').innerText()).trim(), 'Retry render');
    assert.equal(videoPosts().length - posts, 1, 'one request, answered by the real worker');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-07-refused-card.png` });
    await dismiss();
  });

  await step(`${theme}: the window: opening it and choosing /motion sends nothing; the real Motion video plays, pauses and seeks`, async () => {
    // A fresh page, settled, so the earlier steps' board saves (debounced PUTs of the board and its thumbnail) are done first.
    await page.reload();
    await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
    await page.waitForTimeout(4000);
    const before = seen.length;
    const sheet = await openWindow();
    try {
    const listed = await sheet.locator('[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp));
    assert.ok(listed.includes('motion') && !listed.includes('animate'), listed.join(' '));
    await sheet.locator('[data-slash-help="motion"]').click();
    const card = sheet.locator('[data-slash-card="videoGenerate"]');
    const video = card.locator('video[data-lesson-video]');
    await video.waitFor();
    // The committed clip, fetched once as a plain GET and played from memory.
    assert.ok((await video.getAttribute('src')).startsWith('blob:'), await video.getAttribute('src'));
    assert.deepEqual(seen.slice(before).filter(r => r.path === CLIP).map(r => r.method), ['GET']);
    assert.equal((await sheet.locator('[data-slash-label]').innerText()).trim(), 'Create an animated explainer video');
    assert.equal((await sheet.locator('[data-slash-media]').innerText()).trim(), 'AI-generated');
    assert.match(await sheet.locator('[data-slash-about]').innerText(), /^Creates an animated explainer video card/);
    assert.match(await sheet.innerText(), new RegExp(`e\\.g\\. ${LINE}`));
    assert.match(await sheet.locator('[data-slash-sample]').innerText(), /^A real Motion video, made from this example\./);
    // Owner message 31: no meta line; the title and sources stay.
    assert.match(await card.innerText(), new RegExp(`${TITLE}[\\s\\S]*Sources: model\\.py:44–45, model\\.py:48–50, model\\.py:62–64, model\\.py:65–71`));
    assert.doesNotMatch(await card.innerText(), /Motion explainer|Not grounded/);
    assert.equal(await card.locator('[data-generate-video]').count(), 0, 'no Generate in the window');
    const duration = await video.evaluate(node => new Promise(done => { if (node.readyState >= 1) return done(node.duration); node.addEventListener('loadedmetadata', () => done(node.duration), { once: true }); setTimeout(() => done(0), 10000); }));
    assert.equal(Math.round(duration), 15, `duration ${duration}`);
    // Play with a click on the video (a user gesture), as a learner would.
    await video.click();
    await until(() => video.evaluate(node => !node.paused && node.currentTime > 1), 'playback advances', 8000);
    await sheet.screenshot({ path: `${OUT}/${theme}-08-window-playing.png` });
    await video.click();
    await until(() => video.evaluate(node => node.paused), 'pause', 4000);
    const paused = await video.evaluate(node => node.currentTime);
    await page.waitForTimeout(700);
    assert.equal(await video.evaluate(node => node.currentTime), paused, 'paused stays put');
    await video.evaluate(node => new Promise((done, fail) => { node.addEventListener('seeked', done, { once: true }); setTimeout(() => fail(Error('no seeked event')), 5000); node.currentTime = 10; }));
    const at = await video.evaluate(node => ({ t: node.currentTime, ready: node.readyState }));
    assert.ok(Math.abs(at.t - 10) < 0.2 && at.ready >= 2, JSON.stringify(at));
    await page.waitForTimeout(300);
    await sheet.screenshot({ path: `${OUT}/${theme}-09-window-seeked-10s.png` });
    const during = seen.slice(before);
    // The canvas behind the window keeps its own persistence (the board thumbnail is drawn after its saves pause, LearnPage.jsx
    // thumbnailScheduler) and may reload a saved card's clip (a GET of its asset). Choosing /motion reads the server's reservation
    // (a GET of the video list, owner message 25). The window itself sends nothing: no POST, no generation or model route.
    const persistence = r => r.method === 'PUT' && /^\/api\/learn\/boards\/[^/]+\/main(\/thumbnail)?$/.test(r.path);
    const sent = during.filter(r => !persistence(r) && (r.method !== 'GET' || (/\/api\/learn\/(artifact|scene|image)/.test(r.path) && !r.query.includes('asset=')))).map(r => `${r.method} ${r.path}${r.query}`);
    console.log(`   ${theme}: requests while the window was open: ${during.map(r => `${r.method} ${r.path}`).join(', ') || 'none'}`);
    assert.deepEqual(sent, [], `the window sends nothing: ${sent.join(' ')}`);
    } finally { await closeWindow(sheet); }
  });

  await step(`${theme}: MOCKED selected card: /motion explain this sends the card as context.selection, the line unchanged`, async () => {
    const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Motion selection ${theme} ${run}` }) });
    await api(`/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [PHOTO] } }) });
    await page.goto(`${BASE}/apps/${made.name}`);
    const photo = page.locator('[data-block-id="k-photo"]');
    await photo.waitFor({ timeout: 60000 });
    await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
    const handle = await photo.locator('[data-drag-handle]').boundingBox();
    await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.locator('[data-selected-card="k-photo"]').waitFor({ timeout: 8000 });
    stub = { id: `p-sel-${theme}`, polls: 0, end: 'ready' };
    const posts = videoPosts().length;
    await composer().fill('/motion explain this'); await composer().press('Enter');
    await dock.locator('[data-paid-generate]').click();
    await until(async () => videoPosts().length > posts, 'the confirmed start');
    const { operation } = JSON.parse(videoPosts().at(-1).body);
    assert.equal(operation.request, '/motion explain this');
    assert.deepEqual([operation.context?.selection?.cardId, operation.context?.selection?.title], ['k-photo', 'Photosynthesis'], JSON.stringify(operation.context));
    assert.match(operation.context.selection.text, /Plants use light energy/);
    assert.ok(operation.context.selection.text.length <= 4000 && !operation.context.selection.sourceRefs, 'bounded plain text, no repository refs');
    assert.equal(videoPosts().length - posts, 1, 'one start');
    await shot('10-selected-card-generated');
    stub = null;
    await dismiss();
  });


  console.log(`   ${theme}: model routes refused: ${model.length ? model.join(' ') : 'none'}`);
  assert.deepEqual(errors, [], `${theme}: no page errors`);
  await context.close();
}
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} passed${results.length === total ? '' : ` (ran ${results.length})`}`);
process.exit(passed === total && results.length === total ? 0 : 1);
