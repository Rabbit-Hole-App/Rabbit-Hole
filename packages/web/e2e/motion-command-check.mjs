// /motion as the command for the Motion explainer-video pipeline (owner, 2026-10-20, lane L8), against the LOCAL stack only, in
// light and in dark. No model call and no paid call: every model route is aborted and counted, and no Motion orchestrator is
// configured on a local stack (its .dev.vars has no MOTION_* key).
// MOTION=on (default; the stack's development build, VITE_COACHING_DEV, offers /motion). Per theme:
//   0. saved /animate work still renders, first on a fresh page: a maths-animation video card made by /animate and an animation
//      scene card, nothing regenerated;
//   1. discovery: the Chat picker lists /motion under Create, "Create an animated explainer video", and no /animate;
//   2. the selected pill reads Motion (no /) with Remove Motion, picked or typed;
//   3. typed /motion (MOT-20/UI-15, owner messages 39 and 40) is a chat turn: the chat answer (MOCKED /api/learn/ask, a proposal
//      in answer_meta) draws the generation proposal card: title, Duration, Audio Off with On disabled, the server's credits line
//      and one Generate, no Cancel; a duration change saves version 2 (MOCKED PUT .../proposal); Duration offers exactly 5 to 60 in
//      fives and Aspect ratio the nine shared ratios (a proposal without one reads 16:9), and a change of either keeps the other
//      (owner brief 2026-10-23); nothing reaches the video route;
//   4. MOCKED generation (/api/learn/video stubbed here): the card's Generate adds one video card and starts exactly one confirmed
//      motion_request carrying the approved proposal; the card shows its progress, then the ready video with the job's title
//      (no meta line, owner message 31);
//   5. MOCKED failure: the stubbed job fails; the card says why and offers Generate again; nothing else starts;
//   5e. MOCKED identical prompt twice (owner message 37): two Generate presses send two starts with different request ids;
//   5d. MOCKED Stop asks first (owner message 35): Cancel and Escape send nothing, keep it generating and return focus to Stop;
//      the confirmation's Stop sends exactly one stop request and the card shows Stopped.;
//   5c. MOCKED reload of an ended job (MOT-11): failed, stopped and interrupted cards whose hold is still pending keep their error
//      after a reload and keep reading the list (GET only, no start) until the server settles the hold, then stop;
//   5b. MOCKED reload mid-job (lane mact): a card saved while its job runs keeps that job's placement id, so after a reload it
//      follows the same job (polls only, no second start) and shows the video once ready;
//   6. REAL refusal (no stub): the stack's worker has no orchestrator, so Generate's one request is refused and the card
//      says Motion is not available in this environment, retryable;
//   7. the Slash commands window: opening it and choosing /motion sends no request but the committed clip's own GET; its card
//      plays that real Motion video (job 8a2015a4) from memory, pauses and seeks (static assets answer without byte ranges, so
//      the plain path could not seek); no /animate row;
//   8. MOCKED selected card (owner brief 2026-10-21 message 7 item 4): with a card selected, /motion explain this sends the
//      card's id, title and text as motion_request context.selection; the line stays the learner's words;
//   9-13. MOT-20b (every entry point reaches the same shared proposal card; CR-1's POST /api/learn/chat/route MOCKED, a named
//      capability decided with no router call): the picker (pill then words: route names motion, the turn carries its
//      route_token); natural language ("Create a 15-second animated explanation of photosynthesis", no /motion: the router's
//      proposal, the same bound fields on route and turn); clarification (one question with its options, the draft kept, no
//      turn; choosing Motion asks again with it named); router failure (Answer normally and Retry, the draft kept, never a paid
//      capability); an answer suggestion (a click only prepares the composer; its Send proposes);
//   14-15. Ctrl+K on the selected card hands /motion to the Chat's proposal card (the editor says Sent to Chat, stages nothing,
//      the Chat draft stays); a reload restores the saved proposals (MOCKED thread restore): the newest live, the generated one
//      inactive, nothing sent;
// MOTION=off (a production-like build: VITE_RABBIT_HOLE=true only). Per theme: no /motion or /animate in the picker or the
//   window, and a typed /motion says Motion is not available here and runs nothing.
// Usage: BASE=http://127.0.0.1:9261 SMALL_CP=http://127.0.0.1:9263 VARS=C:/s/toc-uimotion/.dev.vars [MOTION=off] node e2e/motion-command-check.mjs [shotsDir]
import { openSlashHelp } from './canvas-menu-helpers.mjs';
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

const total = OFF ? 6 : 44; // per theme: 22 steps with Motion on (7 for MOT-20b entry points, decisions and reload; 1 for MOT-22's refusal), 3 with it off
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
  // MOCKED chat answer (MOT-20): every /motion turn's proposal, its input the turn's own request, concept and selected card, so
  // Generate sends what the real worker accepts. Its signature is not real: with no orchestrator here the worker never checks it.
  const asks = [], proposals = new Map(), routes = [], turns = [];
  const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // MOCKED route decision (CR-1, chat-route-interface.md): a named capability is decided with no router call, as the server
  // does; plain words are answered from this script (stand-ins for real JEV answers, which the CR-1 corpus covers).
  const scripted = new Map([
    ['Create a 15-second animated explanation of photosynthesis', { route: 'capability:motion', flow: 'proposal', via: 'jev', capability: 'motion', confidence: 0.93, probability: 0.9 }],
    ['make something about this', { route: 'clarify', via: 'jev', capability: null, clarification: { question: 'Did you want a Motion video or an answer in chat?', options: ['motion', 'answer'] } }],
    ['the router times out on this', { route: 'answer', via: 'fallback', retryable: true, code: 'timeout', capability: null, token: null, message: 'Couldn\'t check whether this asks for a video or another tool. Answer normally, or try again.' }],
  ]);
  await context.route(/\/api\/learn\/chat\/route$/, route => {
    const body = JSON.parse(route.request().postData() || '{}');
    routes.push(body);
    const n = routes.length, named = body.capability && body.capability !== 'answer' ? body.capability : null;
    const decided = named ? { route: `capability:${named}`, flow: named === 'motion' ? 'proposal' : 'direct', via: 'capability', capability: named, args: body.text }
      : scripted.get(body.text) || { route: 'answer', via: 'jev', capability: null, confidence: 0.9, probability: 0.9 };
    return route.fulfill({ json: { args: body.text, clarification: null, message: null, settings: null, paid: false, retryable: false, code: null, token: decided.flow === 'proposal' ? `route-token-${n}` : null, ...decided } });
  });
  // MOCKED Ctrl+K decision: the shared free checks and fixed routes the worker runs (inline-ai-decide.js), for an explicit command.
  const decide = await import('../src/inline-ai-decide.js');
  await context.route(/\/api\/learn\/inline\/decide$/, route => {
    const { request, enabled } = JSON.parse(route.request().postData() || '{}');
    const local = decide.checkRequest(request);
    if (local) return route.fulfill({ json: local.error ? { error: local.error, code: 'invalid', retryable: false } : local });
    const out = decide.settle(decide.fixedRoute(request, enabled), { decision: 'proceed', capability: 'note' }, enabled);
    if (out.decision === 'proceed') out.token = 'inline-token';
    return route.fulfill({ json: { ...decide.checkDecision(out), meta: { validator: 'jev' } } });
  });
  // A proposal only for a proposed turn (an explicit /motion, or a route_token); any other turn is an answer, with the
  // suggestions a step queues (nextActions).
  let nextActions = [];
  await context.route(/\/api\/learn\/ask(\?|$)/, route => {
    const body = JSON.parse(route.request().postData() || '{}');
    asks.push(body);
    const n = asks.length, words = String(body.message || ''), id = String(900000 + n);
    const threadId = body.thread_id ?? `canvaschat-mock-${run}-${n}`;
    if (body.command !== 'motion' && !body.route_token) {
      const actions = nextActions.map((a, i) => ({ id: `a${i + 1}`, sourceMessageId: id, contextRefs: [], generationRequired: true, paid: true, ...a })); nextActions = [];
      turns.push({ threadId, user: { role: 'user', content: words, messageId: String(800000 + n) }, answer: { role: 'assistant', content: 'Photosynthesis turns light into sugar.', messageId: id, kind: 'answer', status: 'done', meta: { actions, followUps: [] } } });
      return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: 'Photosynthesis turns light into sugar.' })
        + sse('answer_meta', { messageId: id, actions, followUps: [], alternatives: [id], kind: 'answer', syllabus: null })
        + sse('done', { ok: true, threadId, userMessageId: String(800000 + n), messageId: id }) });
    }
    const seconds = Math.min(30, Math.max(5, Number(/(\d+)s\b/.exec(words)?.[1] || 10)));
    const proposal = { proposal_id: `gp-${(run + n.toString(16).padStart(6, '0')).replace(/[^0-9a-f]/g, '0').padStart(16, '0').slice(-16)}`, version: 1, command: 'motion',
      title: `Motion: ${words}`.slice(0, 120), description: 'A row of scores appears. Softmax turns it into weights. The weights add up to one.',
      settings: { duration_seconds: seconds, audio: false }, source_refs: [],
      input: { request: `/motion ${words}`.slice(0, 500), concept: body.generation?.motion?.concept ?? null, ...(body.generation?.motion?.context ? { context: body.generation.motion.context } : {}) },
      expires_at: Math.floor(Date.now() / 1000) + 3600, sig: 'a'.repeat(64), usage: { estimate_credits: 100, reserve_credits: 896 } };
    proposals.set(id, proposal);
    turns.push({ threadId, user: { role: 'user', content: words, messageId: String(800000 + n) }, answer: { role: 'assistant', content: 'Here is a video proposal.', messageId: id, kind: 'answer', status: 'done', meta: { actions: [], followUps: [] } } });
    return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: 'Here is a video proposal.' })
      + sse('answer_meta', { messageId: id, actions: [], followUps: [], alternatives: [id], kind: 'answer', syllabus: null, proposal })
      + sse('done', { ok: true, threadId, userMessageId: String(800000 + n), messageId: id }) });
  });
  // MOCKED restore after a reload (the reload step only): the Chat's active thread and its saved messages, each answer with the
  // proposal version saved over it (proposals), as the server's answer meta would hold them.
  let restoring = null;
  await context.route(/\/api\/learn\/chat\/active(\?|$)/, route => (restoring && route.request().method() === 'GET' ? route.fulfill({ json: { threadId: restoring } }) : route.fallback()));
  await context.route(/\/api\/ask\/threads\/[^/?]+$/, route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    if (!restoring || id !== restoring || route.request().method() !== 'GET') return route.fallback();
    const messages = turns.filter(t => t.threadId === id).flatMap(t => [t.user, { ...t.answer, meta: { ...t.answer.meta, ...(proposals.has(t.answer.messageId) ? { proposal: proposals.get(t.answer.messageId) } : {}), alternatives: [t.answer.messageId] } }]);
    return route.fulfill({ json: { id, title: 'Motion check', mode: 'auto', contextRefs: [], draft: null, messages } });
  });
  // MOCKED duration change on the card: the next version of the same proposal, saved over its message. MOT-22: as the server, a
  // save names the revision it was made from, and one from an older revision is a 409 with the current proposal.
  await context.route(/\/api\/learn\/chat\/messages\/\d+\/proposal$/, route => {
    const id = /messages\/(\d+)\//.exec(route.request().url())[1], previous = proposals.get(id), sent = JSON.parse(route.request().postData());
    if (sent.expected_version !== previous.version) return route.fulfill({ status: 409, json: { error: 'changed', code: 'proposal_stale', current: previous, current_message_id: id } });
    const proposal = { ...previous, version: previous.version + 1, settings: sent.settings };
    proposals.set(id, proposal);
    return route.fulfill({ json: { proposal } });
  });
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
  // MOT-20: a /motion line is a chat turn whose answer draws a proposal card; its Generate is enabled once the answer is saved.
  const proposalCards = dock.locator('[data-generation-proposal]');
  const propose = async line => {
    const before = await proposalCards.count();
    await composer().fill(line); await composer().press('Enter');
    await until(async () => (await proposalCards.count()) > before, `the proposal card for ${line}`);
    const card = proposalCards.last();
    await card.locator('[data-proposal-generate]:not([disabled])').waitFor();
    return card;
  };
  const generate = async line => (await propose(line)).locator('[data-proposal-generate]').click();
  const dismiss = async () => { await dock.getByRole('button', { name: 'Dismiss' }).click({ timeout: 1500 }).catch(() => {}); await composer().fill(''); };
  const pickerRows = async () => {
    await composer().click(); await composer().fill('/');
    await picker.waitFor();
    await picker.locator('[data-slash-more]').click();
    return picker.locator('[data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand));
  };
  const openWindow = async () => {
    await openSlashHelp(page); // // Owner brief 2026-10-22: Slash commands left View for the chat composer's slash palette
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
      assert.equal(await dock.locator('[data-paid-generate], [data-generation-proposal]').count(), 0, 'no confirmation and no proposal');
      assert.equal(asks.length, 0, 'no chat turn');
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

  // MOT-20/UI-15 (owner messages 39 and 40) replaces the confirmation window: the proposal card comes from the chat answer.
  await step(`${theme}: typed /motion is a chat turn: the proposal card shows title, Duration, Audio Off, the credits line and one Generate; nothing starts`, async () => {
    const before = seen.length, cards = await page.locator('[data-block-id]').count(), turns = asks.length;
    const card = await propose(LINE);
    const turn = asks[turns];
    assert.deepEqual([turn.command, turn.message, turn.generation?.motion?.concept !== undefined], ['motion', LINE.replace(/^\/motion /, ''), true], JSON.stringify(turn).slice(0, 200));
    assert.equal(asks.length - turns, 1, 'one chat turn');
    assert.equal(await card.getAttribute('data-generation-proposal'), 'motion');
    assert.equal(await card.getAttribute('data-proposal-active'), 'true');
    assert.equal((await card.locator('h3').innerText()).trim(), `Motion: ${LINE.replace(/^\/motion /, '')}`);
    assert.equal(await card.locator('[data-proposal-duration]').inputValue(), '15');
    assert.deepEqual([await card.locator('[data-proposal-audio="off"]').getAttribute('aria-pressed'), await card.locator('[data-proposal-audio="on"]').isDisabled()], ['true', true]);
    assert.match(await card.locator('[data-proposal-usage]').innerText(), /^About 100 credits/);
    assert.doesNotMatch(await card.innerText(), /\$\d|Will show|Cancel/);
    assert.deepEqual([await card.locator('[data-proposal-generate]').count(), (await card.locator('[data-proposal-generate]').innerText()).trim()], [1, 'Generate']);
    assert.equal(await card.getByRole('button', { name: 'Cancel' }).count(), 0, 'no Cancel');
    // A duration change saves the next version over the message (MOCKED PUT), with no chat turn.
    await card.locator('[data-proposal-duration]').selectOption('20');
    await until(async () => (await card.getAttribute('data-proposal-version')) === '2', 'version 2 after the duration change');
    assert.equal(await card.locator('[data-proposal-duration]').inputValue(), '20');
    assert.ok(seen.some(r => r.method === 'PUT' && /\/proposal$/.test(r.path) && JSON.parse(r.body || '{}').expected_version === 1), 'the save names the revision it was made from (MOT-22)');
    // Owner brief 2026-10-23: Duration offers exactly 5 to 60 in fives; Aspect ratio lists the nine shared ratios and a proposal saved without one reads 16:9.
    assert.deepEqual(await card.locator('[data-proposal-duration] option').evaluateAll(o => o.map(x => x.value)), ['5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60']);
    assert.deepEqual(await card.locator('[data-proposal-aspect-ratio] option').evaluateAll(o => o.map(x => x.textContent)), ['9:16 portrait', '1:1 square', '16:9 landscape', '3:4 portrait', '4:3', '2:3', '3:2', '4:5', '5:4']);
    assert.equal(await card.locator('[data-proposal-aspect-ratio]').inputValue(), '16:9');
    await card.locator('[data-proposal-aspect-ratio]').selectOption('9:16');
    await until(async () => (await card.getAttribute('data-proposal-version')) === '3', 'version 3 after the aspect ratio change');
    assert.equal(await card.locator('[data-proposal-aspect-ratio]').inputValue(), '9:16');
    assert.equal(await card.locator('[data-proposal-duration]').inputValue(), '20', 'the duration is kept');
    const ratioSave = seen.filter(r => r.method === 'PUT' && /\/proposal$/.test(r.path)).map(r => JSON.parse(r.body || '{}')).find(b => b.expected_version === 2);
    assert.deepEqual(ratioSave?.settings, { duration_seconds: 20, audio: false, aspect_ratio: '9:16' }, 'the save carries both selections');
    await card.locator('[data-proposal-duration]').selectOption('60');
    await until(async () => (await card.getAttribute('data-proposal-version')) === '4', 'version 4 after choosing 60 seconds');
    assert.equal(await card.locator('[data-proposal-aspect-ratio]').inputValue(), '9:16', 'the ratio is kept');
    assert.equal(asks.length - turns, 1, 'a settings change is no chat turn');
    await card.screenshot({ path: `${OUT}/${theme}-03-proposal.png` });
    // Nothing reaches the video route before Generate (a saved card's clip may load meanwhile, a GET of its asset), and no card lands.
    assert.equal(seen.slice(before).filter(r => r.path === '/api/learn/video' && r.method !== 'GET').length, 0, 'nothing asked of the video route before Generate');
    assert.equal(await page.locator('[data-block-id]').count(), cards, 'no card before Generate');
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
    // MOT-22 (MOCKED): the server refuses this start for its proposal (a newer version exists), once; nothing starts.
    if (stub.refuse && request.method() === 'POST') { const code = stub.refuse; stub.refuse = null; return route.fulfill({ status: 409, json: { error: 'A newer version of this proposal exists. Use the latest card in the chat.', code } }); }
    if (stub.paused) return request.method() === 'POST' ? route.fulfill({ status: 503, json: { error: PAUSED, code: 'motion_paused' } }) : route.fulfill({ json: { motionPaused: true, videos: [] } });
    // The server's reservation (MOCKED): still in the API (internal only, owner message 30); the card must never show it.
    const hold = status => ({ usd: 8.96, state: status === 'generating' ? 'reserved' : status === 'failed' && !stub.settled ? 'pending' : 'released' });
    const video = status => ({ id: stub.id, key: KEY, status, retryable: true, hold: hold(status),
      ...(status === 'failed' ? { error: stub.error || 'The Motion job failed: still blocking after the repair round: blank_frame' } : {}),
      ...(status === 'ready' ? { provider: 'motion', motion: { title: TITLE, duration_seconds: 15, renderer: 'remotion', source_refs: [{ id: 'S1', kind: 'code', path: 'model.py', start_line: 62, end_line: 64 }] } } : {}) });
    // A stop request (MOCKED): the job ends as the server ends it, failed with Stopped.
    if (request.method() === 'POST' && (request.postData() || '').includes('"action":"cancel"')) { stub.stopped = true; stub.error = 'Stopped.'; return route.fulfill({ json: { videos: [video('failed')] } }); }
    if (stub.stopped) return route.fulfill({ json: { videos: [video('failed')] } });
    if (request.method() === 'POST') return route.fulfill({ status: 202, json: { motionHoldUsd: 8.96, motionEstimateCredits: 100, videos: [video('generating')], placementId: stub.id } });
    stub.polls += 1;
    return route.fulfill({ json: { motionHoldUsd: 8.96, motionEstimateCredits: 100, videos: [video(!stub.held && stub.polls >= 2 ? stub.end : 'generating')] } });
  });

  await step(`${theme}: MOCKED generation: the proposal's Generate adds one card and starts one confirmed motion_request with the approved proposal; the ready video plays in it`, async () => {
    stub = { id: `p-ready-${theme}`, polls: 0, end: 'ready', held: true };
    const posts = videoPosts().length;
    const proposal = await propose(LINE);
    // A double click is one press: one card, one start (the card's guard and its request id).
    await proposal.locator('[data-proposal-generate]').dblclick();
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
    assert.deepEqual([body.operation.proposal?.command, body.operation.proposal?.version, body.operation.proposal?.settings], ['motion', 1, { duration_seconds: 15, audio: false }], 'the exact approved proposal');
    assert.equal(await proposal.getAttribute('data-proposal-active'), 'false', 'a generated proposal is inactive');
    assert.match(await proposal.innerText(), /Added to the canvas/);
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-05-ready-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED failure: the card says why and offers Generate again; nothing else starts`, async () => {
    stub = { id: `p-fail-${theme}`, polls: 0, end: 'failed' };
    const posts = videoPosts().length;
    await generate('/motion 10s explain the causal mask');
    const mine = page.locator('[data-block-id]', { hasText: 'still blocking after the repair round: blank_frame' });
    await mine.waitFor({ timeout: 20000 });
    assert.equal((await mine.locator('[data-generate-video]').innerText()).trim(), 'Generate again'); // owner message 38
    // Its final cost is not confirmed yet (MOCKED pending), and the card still shows no amount or reservation (owner message 30).
    assert.equal(await mine.locator('[data-video-hold]').count(), 0, 'no hold line');
    assert.doesNotMatch(await mine.innerText(), /\$\d|reserv|Reconciliation/i);
    assert.equal(videoPosts().length - posts, 1, 'one start, no automatic retry');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-06-failed-card.png` });
    await dismiss();
  });

  // Paused before any proposal, the chat turn itself is refused before a model call (control-plane chat-modes.test); this is a
  // proposal made before the pause.
  await step(`${theme}: MOCKED paused: a proposal's Generate is refused by the server with the paused text`, async () => {
    stub = { id: `p-paused-${theme}`, polls: 0, paused: true };
    const posts = videoPosts().length;
    await generate(`/motion 11s explain dropout ${theme}`);
    const mine = page.locator('[data-block-id]', { hasText: PAUSED });
    await mine.waitFor({ timeout: 20000 });
    assert.equal(videoPosts().length - posts, 1, 'one start, refused by the server');
    await mine.scrollIntoViewIfNeeded();
    await mine.screenshot({ path: `${OUT}/${theme}-06a-paused-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED refusal for its proposal (MOT-22): the refused card says so and plays nothing, the proposal stays live, and its next Generate starts once`, async () => {
    stub = { id: `p-refused-${theme}`, polls: 0, end: 'ready', refuse: 'proposal_stale' };
    const posts = videoPosts().length;
    const proposal = await propose(`/motion 13s explain layer norm ${theme}`);
    await proposal.locator('[data-proposal-generate]').click();
    const card = page.locator('[data-block-id]').filter({ has: page.locator('[data-proposal-refused="proposal_stale"]') }).last();
    await card.waitFor({ timeout: 10000 });
    assert.match(await card.innerText(), /Not generated\. This proposal changed; use the latest version\./);
    assert.equal(await card.locator('video, [data-generate-video], [data-stop-video], [data-media-provenance], [data-recovery-action]').count(), 0, 'nothing playable, generating or offered on the refused card');
    await proposal.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 10000 });
    assert.doesNotMatch(await proposal.innerText(), /Added to the canvas/, 'the refused start made nothing');
    await dock.getByRole('alert').filter({ hasText: 'This proposal changed; use the latest version.' }).first().waitFor({ timeout: 5000 });
    assert.equal(videoPosts().length - posts, 1, 'one refused start');
    await proposal.locator('[data-proposal-generate]').click();
    await until(() => videoPosts().length - posts === 2, 'the next press starts');
    await until(async () => /Added to the canvas/.test(await proposal.innerText()), 'Added to the canvas once a start was accepted');
    assert.equal(videoPosts().length - posts, 2, 'one refused start and one real one');
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${OUT}/${theme}-06c-refused-card.png` });
    await dismiss();
  });

  await step(`${theme}: MOCKED reload mid-job: the saved card follows the same job again, with no second start, and plays it`, async () => {
    stub = { id: `p-reload-${theme}`, polls: 0, end: 'ready', held: true };
    const posts = videoPosts().length;
    await generate(`/motion 15s explain attention heads ${theme}`);
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

  await step(`${theme}: MOCKED identical prompt twice: two Generate presses send two starts with different request ids`, async () => {
    stub = { id: `p-twice-${theme}`, polls: 0, end: 'ready', held: true };
    const posts = videoPosts().length;
    for (let i = 0; i < 2; i++) {
      await generate(`/motion 9s explain residual streams ${theme}`);
      await until(() => videoPosts().length - posts === i + 1, `press ${i + 1} sent its start`);
    }
    const ids = videoPosts().slice(posts).map(r => JSON.parse(r.body).operation.request_id);
    assert.equal(ids.length, 2, 'two starts');
    assert.ok(ids.every(id => /^[A-Za-z0-9_-]{8,64}$/.test(id || '')), `request ids ${ids.join(', ')}`);
    assert.notEqual(ids[0], ids[1], 'each press has its own request id');
    stub.held = false;
    await dismiss();
  });

  await step(`${theme}: MOCKED Stop asks first: Cancel and Escape send nothing and keep it generating; Stop sends one stop request`, async () => {
    stub = { id: `p-stop-${theme}`, polls: 0, end: 'ready', held: true, settled: true };
    await generate(`/motion 12s explain stopping ${theme}`);
    const card = page.locator('[data-block-id]', { hasText: 'Planning, reviewing and rendering' });
    await card.waitFor({ timeout: 10000 });
    const mine = page.locator(`[data-block-id="${await card.getAttribute('data-block-id')}"]`);
    const stopButton = mine.locator('[data-stop-video]'), confirm = mine.locator('[data-stop-confirm]');
    await stopButton.waitFor({ timeout: 10000 });
    const stops = () => seen.filter(r => r.path === '/api/learn/video' && r.method === 'POST' && r.body.includes('"action":"cancel"')).length;
    const before = stops();
    const focused = locator => locator.evaluate(node => node === document.activeElement);
    // Stop, then Cancel.
    await stopButton.click();
    await confirm.waitFor();
    assert.equal((await confirm.innerText()).includes("Stop this video? Credits already used won't be refunded."), true);
    assert.equal(await focused(mine.locator('[data-stop-cancel]')), true, 'Cancel takes focus');
    await shot('06d-stop-confirm');
    await mine.locator('[data-stop-cancel]').click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(await focused(stopButton), true, 'focus returns to Stop after Cancel');
    // From the keyboard: Enter opens it, Escape cancels.
    await stopButton.press('Enter');
    await confirm.waitFor();
    await page.keyboard.press('Escape');
    await confirm.waitFor({ state: 'detached' });
    assert.equal(await focused(stopButton), true, 'focus returns to Stop after Escape');
    assert.equal(stops() - before, 0, 'Cancel and Escape send no stop request');
    assert.equal(await mine.getByText('Planning, reviewing and rendering').count(), 1, 'still generating');
    // Stop, then Stop: one stop request, and the card says Stopped.
    await stopButton.click();
    await mine.locator('[data-stop-confirmed]').click();
    await mine.getByText('Stopped.', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(stops() - before, 1, 'exactly one stop request');
    assert.equal(await mine.locator('[data-generate-video]').count(), 1, 'stopped: it can be generated again');
    await dismiss();
  });

  await step(`${theme}: MOCKED reload of failed, stopped and interrupted cards with a pending hold: the error stays, reads continue until settled, then stop; no start`, async () => {
    const ended = [['failed', 'The Motion job failed: still blocking after the repair round: blank_frame'], ['stopped', 'Stopped.'],
      ['interrupted', 'The Motion service restarted while this video was being made. Generate it again; the interrupted attempt\'s cost stays counted.']];
    for (const [kind, error] of ended) {
      stub = { id: `p-ended-${kind}-${theme}`, polls: 0, end: 'failed', error };
      await generate(`/motion 10s explain ${kind} jobs ${theme}`);
      const card = page.locator('[data-block-id]', { hasText: error });
      await card.waitFor({ timeout: 20000 });
      const id = await card.getAttribute('data-block-id');
      await until(() => seen.some(r => r.method === 'PUT' && /\/api\/learn\/boards\/[^/]+\/main$/.test(r.path) && r.body.includes(stub.id) && r.body.includes('"failed"')), `the board saved with the ${kind} card`);
      const posts = videoPosts().length;
      await page.reload();
      await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
      const mine = page.locator(`[data-block-id="${id}"]`);
      await mine.waitFor({ timeout: 30000 });
      // After the reload: the card reads its job again and shows its error (owner review MOT-11), still pending.
      const polled = stub.polls;
      await until(() => stub.polls > polled, `the reloaded ${kind} card reads its job`);
      await mine.getByText(error, { exact: false }).waitFor({ timeout: 10000 });
      assert.equal((await mine.locator('[data-generate-video]').innerText()).trim(), 'Generate again'); // owner message 38
      const again = stub.polls;
      await until(() => stub.polls > again, `the ${kind} card keeps reading while its hold is pending`);
      // The server settles the hold: one more read sees it released, then reading stops.
      stub.settled = true;
      const settledAt = stub.polls;
      await until(() => stub.polls > settledAt, `the ${kind} card reads the settled hold`);
      const last = stub.polls;
      await page.waitForTimeout(6500); // one 5 s read interval and a margin: proves no further read
      assert.equal(stub.polls, last, `the ${kind} card stops reading once its hold is settled`);
      assert.equal(videoPosts().length - posts, 0, `no start after reloading the ${kind} card`);
      await mine.scrollIntoViewIfNeeded();
      await mine.screenshot({ path: `${OUT}/${theme}-06c-reloaded-${kind}-card.png` });
      await dismiss();
    }
  });

  await step(`${theme}: REAL refusal: with no orchestrator the worker refuses Generate; the card says Motion is not available here`, async () => {
    stub = null;
    const posts = videoPosts().length;
    await generate(`/motion 12s explain layer norm ${theme}`);
    const mine = page.locator('[data-block-id]', { hasText: REFUSED });
    await mine.waitFor({ timeout: 20000 });
    assert.equal((await mine.locator('[data-generate-video]').innerText()).trim(), 'Generate again'); // owner message 38
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

  // ---- MOT-20b: every entry point reaches the same shared proposal card (CR-1's route decision MOCKED above) ----
  const NL = 'Create a 15-second animated explanation of photosynthesis';
  await step(`${theme}: the picker: choosing /motion then typing routes the named capability (no router call) and sends its token; the card follows`, async () => {
    const r0 = routes.length, a0 = asks.length, before = await proposalCards.count();
    await composer().click(); await composer().fill('/');
    await picker.locator('[data-slash-command="motion"]').click();
    await pill.waitFor();
    await composer().pressSequentially('10s explain friction');
    await composer().press('Enter');
    await until(async () => (await proposalCards.count()) > before, 'the picked proposal card');
    assert.deepEqual([routes[r0]?.capability, routes[r0]?.text], ['motion', '10s explain friction']);
    assert.deepEqual([asks[a0]?.command, asks[a0]?.route_token, asks.length - a0], ['motion', `route-token-${r0 + 1}`, 1]);
    assert.equal(await proposalCards.last().getAttribute('data-proposal-active'), 'true');
    await dismiss();
  });

  await step(`${theme}: natural language: "${NL}" is routed to Motion and proposed on the same card, with no /motion`, async () => {
    const r0 = routes.length, a0 = asks.length, before = await proposalCards.count();
    await composer().fill(NL); await composer().press('Enter');
    await until(async () => (await proposalCards.count()) > before, 'the routed proposal card');
    assert.deepEqual([routes[r0]?.capability, routes[r0]?.text, routes[r0]?.mode], [null, NL, 'auto'], 'a plain line asks the router');
    const turn = asks[a0];
    assert.deepEqual([turn?.message, turn?.command ?? null, turn?.route_token], [NL, null, `route-token-${r0 + 1}`], 'the ordinary turn with the signed route');
    assert.ok(turn.generation?.motion, 'the bound Motion fields ride the turn');
    assert.deepEqual([routes[r0].motion, routes[r0].selection ?? null, routes[r0].source_refs ?? null], [turn.generation.motion, turn.canvas_target ?? null, turn.context_refs ?? null], 'the route and the turn carry the same bound fields');
    assert.equal(videoPosts().filter(r => r.body.includes(NL)).length, 0, 'nothing generated before Generate');
    await dismiss();
  });

  await step(`${theme}: clarification: one question with its options, the draft kept and no turn; choosing Motion proposes it`, async () => {
    const r0 = routes.length, a0 = asks.length, before = await proposalCards.count();
    await composer().fill('make something about this'); await composer().press('Enter');
    const shown = dock.locator('[data-route-decision="clarify"]');
    await shown.waitFor();
    assert.equal((await shown.locator('[data-route-message]').innerText()).trim(), 'Did you want a Motion video or an answer in chat?');
    assert.deepEqual(await shown.locator('[data-route-option]').evaluateAll(nodes => nodes.map(node => node.dataset.routeOption)), ['motion', 'answer']);
    assert.equal(asks.length, a0, 'no chat turn');
    assert.equal(await composer().inputValue(), 'make something about this', 'the draft is kept');
    await shown.screenshot({ path: `${OUT}/${theme}-11-route-clarify.png` });
    await shown.locator('[data-route-option="motion"]').click();
    await until(async () => (await proposalCards.count()) > before, 'the chosen proposal card');
    assert.deepEqual([routes.at(-1).capability, routes.at(-1).text, routes.length - r0], ['motion', 'make something about this', 2], 'the option asks again with the capability named');
    assert.equal(asks.at(-1).route_token, `route-token-${routes.length}`);
    assert.equal(await dock.locator('[data-route-decision]').count(), 0, 'the question goes once answered');
    await dismiss();
  });

  await step(`${theme}: router failure: the draft is kept with Answer normally and Retry; never a paid capability`, async () => {
    const r0 = routes.length, a0 = asks.length, before = await proposalCards.count();
    await composer().fill('the router times out on this'); await composer().press('Enter');
    const shown = dock.locator('[data-route-decision="fallback"]');
    await shown.waitFor();
    assert.match(await shown.innerText(), /Answer normally, or try again\./);
    assert.deepEqual([await shown.locator('[data-route-answer]').count(), await shown.locator('[data-route-retry]').count()], [1, 1]);
    assert.deepEqual([asks.length, await composer().inputValue()], [a0, 'the router times out on this'], 'no turn, the draft kept');
    await shown.locator('[data-route-retry]').click();
    await until(() => routes.length - r0 === 2, 'Retry routes again');
    await shown.waitFor();
    await shown.locator('[data-route-answer]').click();
    await until(() => asks.length > a0, 'Answer normally sends the turn');
    assert.deepEqual([asks[a0].message, asks[a0].route_token ?? null, asks[a0].command ?? null, routes.length - r0], ['the router times out on this', null, null, 2], 'answered as a chat turn: no token, no command, no third route call');
    await dock.getByText('Photosynthesis turns light into sugar.').last().waitFor();
    assert.equal(await proposalCards.count(), before, 'no proposal card');
    await dismiss();
  });

  await step(`${theme}: answer suggestion: a click only prepares the composer; its Send proposes Motion on the same card`, async () => {
    nextActions = [{ capabilityId: 'motion', label: 'Animate photosynthesis', args: { subject: 'photosynthesis in 15s' } }];
    await composer().fill('what is photosynthesis?'); await composer().press('Enter');
    const action = dock.locator('[data-answer-action="motion"]').last();
    await action.waitFor();
    const a0 = asks.length, r0 = routes.length, before = await proposalCards.count();
    await action.click();
    await pill.waitFor();
    await page.waitForTimeout(600);
    assert.deepEqual([asks.length - a0, routes.length - r0], [0, 0], 'a click sends nothing');
    await composer().press('Enter');
    await until(async () => (await proposalCards.count()) > before, 'the suggestion\'s proposal card');
    assert.deepEqual([routes[r0]?.capability, asks[a0]?.command, asks[a0]?.message], ['motion', 'motion', 'photosynthesis in 15s']);
    await dismiss();
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
    await generate('/motion explain this');
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

  await step(`${theme}: Ctrl+K: /motion about the selected card goes to the Chat's proposal card; the editor says so and the Chat draft stays`, async () => {
    await composer().fill('my draft stays');
    const photo = page.locator('[data-block-id="k-photo"]');
    const handle = await photo.locator('[data-drag-handle]').boundingBox();
    await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.locator('[data-selected-card="k-photo"]').waitFor({ timeout: 8000 });
    const a0 = asks.length, before = await proposalCards.count(), posts = videoPosts().length;
    await page.keyboard.press('Control+k');
    await page.locator('[data-inline-prompt]').waitFor();
    await page.locator('[data-inline-prompt]').fill('/motion explain this leaf');
    await page.keyboard.press('Enter');
    await until(async () => (await proposalCards.count()) > before, 'the Ctrl+K proposal card in the Chat');
    const turn = asks[a0];
    assert.deepEqual([turn?.command, turn?.message], ['motion', 'explain this leaf']);
    assert.match(JSON.stringify(turn.generation?.motion?.context?.selection || {}), /k-photo/, 'the turn is about Ctrl+K\'s selection');
    assert.equal(routes.at(-1).capability, 'motion', 'named: no router call');
    await page.locator('[data-inline-notice]').getByText('Sent to Chat: review the proposal there, then Generate.').waitFor();
    assert.equal(await composer().inputValue(), 'my draft stays', 'the Chat draft is kept');
    assert.equal(videoPosts().length, posts, 'nothing generated or staged by Ctrl+K');
    assert.equal(await page.locator('[data-inline-preview], [data-paid-generate]').count(), 0, 'no staged card and no confirmation in the editor');
    await shot('12-ctrlk-handoff');
    await page.keyboard.press('Escape');
    await composer().fill('');
  });

  await step(`${theme}: reload: the saved proposals come back; the newest is live, the generated one stays inactive; nothing is sent`, async () => {
    restoring = asks.at(-1)?.thread_id || turns.at(-1)?.threadId;
    const a0 = asks.length, posts = videoPosts().length, r0 = routes.length;
    try {
      await page.reload();
      await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
      await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
      const live = proposalCards.filter({ has: page.locator('h3', { hasText: /^Motion: explain this leaf$/ }) });
      await live.first().waitFor({ timeout: 15000 });
      assert.equal(await live.last().getAttribute('data-proposal-active'), 'true', 'the newest proposal can Generate');
      const made = proposalCards.filter({ has: page.locator('h3', { hasText: /^Motion: explain this$/ }) });
      if (await made.count()) {
        assert.equal(await made.last().getAttribute('data-proposal-active'), 'false', 'the generated proposal cannot Generate again');
        assert.match(await made.last().innerText(), /Added to the canvas/);
      }
      await page.waitForTimeout(800);
      assert.deepEqual([asks.length - a0, routes.length - r0, videoPosts().length - posts], [0, 0, 0], 'a reload sends no turn, route or start');
      await shot('13-reloaded-proposals');
    } finally { restoring = null; }
  });


  console.log(`   ${theme}: model routes refused: ${model.length ? model.join(' ') : 'none'}`);
  assert.deepEqual(errors, [], `${theme}: no page errors`);
  await context.close();
}
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} passed${results.length === total ? '' : ` (ran ${results.length})`}`);
process.exit(passed === total && results.length === total ? 0 : 1);
