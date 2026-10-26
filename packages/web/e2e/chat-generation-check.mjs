// Chat generation UX (owner brief, bugs 1 to 3), against the LOCAL stack only, in light and in dark. No model call and no paid call:
// every model route is aborted and counted; the chat answer, the route decision, the thread restore, the saved outputs and the video
// job API are MOCKED in the browser (deterministic transports), so this proves wiring and states, not real generation.
//   1. an ordinary Ask answer to a question with a card selected keeps Explore next, Add as card, Regenerate, Copy and the thumbs
//   2. a non-generating slash command (/practice) gets none of Explore next, its spacing, Add as card or Regenerate; Copy and thumbs stay
//   3. a /motion proposal (the mocked server still sends suggestions with it) shows no Explore next, no spacing, no Add as card or
//      Added, no Regenerate; Copy and thumbs stay; Generate is enabled, with no spinner
//   4. Generate: a double-click starts one job; the button is Starting at once (first observed phase), then Queued, then Generating
//      with a spinner; the stage line is the canvas card's own words; elapsed time is shown but never announced; Go to card and Stop
//      are there; no second banner above the composer; the prompt shows its card link; nothing reads Added to the canvas
//   5. a reload during generation (MOCKED restore with the saved output): the proposal shows Generating again with no new start, an
//      older ordinary answer keeps a collapsed Suggestions toggle and an older command or proposal answer has none
//   6. a New chat shows none of the other thread's job; its own proposal waits for Generate
//   7. Stop in Chat asks first (Cancel and Escape send nothing), then sends the canvas card's own stop request once; the proposal
//      says Stopped with no spinner and the canvas card says Stopped
//   8. completion (Ready with a check, Go to card, no spinner), failure (the reason, no spinner), and an unknown outcome (the
//      connection drops on the start: explained, never success, never started again) each show the right state; with several jobs
//      in the thread every proposal keeps its own state
//   9. back on the first thread after the New chat: its job finishes and the proposal reads Ready; none of the second thread's jobs show
//  10. keyboard (Stop and its confirmation by keys), prefers-reduced-motion (a static icon, explicit words), a narrow Chat (the card
//      wraps, no horizontal overflow, 36 px or taller actions) and the polite status region
// Usage: BASE=http://127.0.0.1:9261 SMALL_CP=http://127.0.0.1:9263 VARS=<stack .dev.vars> node e2e/chat-generation-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9261';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9263';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('chat-generation-check runs against a local stack only');
const OUT = process.argv[2] || 'chat-generation-shots';
mkdirSync(OUT, { recursive: true });
const vars = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
assert.doesNotMatch(vars, /^MOTION_/m, 'a local stack has no Motion orchestrator');
const secret = vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `chatgen-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

const CLIP = '/lesson-assets/motion-softmax-8a2015a4.mp4';
const CLIP_BYTES = readFileSync(new URL(`../public${CLIP}`, import.meta.url));
const TITLE = 'Softmax: Turning Attention Scores into Weights';
const KEY = 'a'.repeat(64);
const STAGE = 'Planning, reviewing and rendering';
const PHOTO = { id: 'k-photo', type: 'explanation', dx: 0, dy: 0, title: 'Photosynthesis', body: 'Plants use light energy to turn carbon dioxide and water into glucose and oxygen.' };

const total = 26; // 13 steps per theme (the ten items above; 8 is five of them), light and dark
const results = [];
let failShot = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`); console.log(error.message.split('\n').slice(1, 6).map(line => `      ${line.slice(0, 240)}`).join('\n')); await failShot?.(results.length); }
};
const until = async (fn, what, ms = 30000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 200)); } };

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => { try { localStorage.setItem('small.theme', value); } catch {} }, theme);
  const seen = [], model = [];
  context.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/learn/') || url.pathname === CLIP) seen.push({ method: request.method(), path: url.pathname, query: url.search, body: request.postData() || '' }); });
  await context.route(/\/api\/learn\/(artifact|tutor\/plan|selection|inline\/[\w-]+|image|scene|search|voice\/[\w-]+)(\?|$)/, route => { model.push(new URL(route.request().url()).pathname); return route.abort(); });
  const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Chat generation ${theme} ${run}` }) });
  await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [PHOTO] } }) });

  // MOCKED route decision (CR-1): a named capability is decided with no router call; plain words are an answer.
  const routes = [];
  await context.route(/\/api\/learn\/chat\/route$/, route => {
    const body = JSON.parse(route.request().postData() || '{}');
    routes.push(body);
    const named = body.capability && body.capability !== 'answer' ? body.capability : null;
    const decided = named ? { route: `capability:${named}`, flow: named === 'motion' ? 'proposal' : 'direct', via: 'capability', capability: named, args: body.text } : { route: 'answer', via: 'jev', capability: null, confidence: 0.9, probability: 0.9 };
    return route.fulfill({ json: { args: body.text, clarification: null, message: null, settings: null, paid: false, retryable: false, code: null, token: decided.flow === 'proposal' ? `route-token-${routes.length}` : null, ...decided } });
  });

  // MOCKED chat answers. The mocked server sends suggestions with EVERY answer, a proposal's included (as one saved before this change
  // would hold them), so a hidden Explore next proves the Chat's own rule. Each turn is kept for the reload's restore, with the
  // outputs the page saved on its user message (PUT .../outputs, MOCKED) and the proposal's latest version.
  const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const asks = [], turns = [], savedOutputs = new Map(), proposals = new Map();
  const suggestions = id => ({ actions: [{ id: 'a1', capabilityId: 'diagram', label: 'Draw the cycle', sourceMessageId: id, contextRefs: [], args: { subject: 'the cycle' }, generationRequired: true, paid: false }], followUps: [{ id: 'f1', text: 'Why does light matter here?', kind: 'clarify' }] });
  await context.route(/\/api\/learn\/ask(\?|$)/, route => {
    const body = JSON.parse(route.request().postData() || '{}');
    asks.push(body);
    const n = asks.length, words = String(body.message || ''), id = String(900000 + n), userId = String(800000 + n);
    const k = n + (theme === 'dark' ? 0x100000 : 0);
    const threadId = body.thread_id ?? `canvaschat-mock-${run}-${theme}-${n}`;
    const proposed = body.command === 'motion' || body.route_token;
    const content = proposed ? 'Here is a video proposal.' : 'Photosynthesis turns light into sugar.';
    const meta = { ...suggestions(id), alternatives: [id] };
    let proposal = null;
    if (proposed) {
      proposal = { proposal_id: `gp-${(run + k.toString(16).padStart(6, '0')).replace(/[^0-9a-f]/g, '0').padStart(16, '0').slice(-16)}`, version: 1, command: 'motion', title: `Motion: ${words}`.slice(0, 120),
        description: 'A row of scores appears. Softmax turns it into weights. The weights add up to one.', settings: { duration_seconds: 15, audio: false }, source_refs: [],
        input: { request: `/motion ${words}`.slice(0, 500), concept: body.generation?.motion?.concept ?? null }, expires_at: Math.floor(Date.now() / 1000) + 3600, sig: 'a'.repeat(64), usage: { estimate_credits: 100, reserve_credits: 896 } };
      proposals.set(id, proposal);
    }
    turns.push({ threadId, user: { role: 'user', content: body.command ? `/${body.command} ${words}` : words, ...(body.command ? { command: body.command } : {}), messageId: userId }, answer: { role: 'assistant', content, messageId: id, kind: 'answer', status: 'done', meta } });
    return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: content })
      + sse('answer_meta', { messageId: id, ...suggestions(id), alternatives: [id], kind: 'answer', syllabus: null, ...(proposal ? { proposal } : {}) })
      + sse('done', { ok: true, threadId, userMessageId: userId, messageId: id }) });
  });
  // The page saves a card a proposal made as an output of its prompt (MOCKED PUT): kept here and restored with the thread.
  await context.route(/\/api\/learn\/chat\/messages\/(\d+)\/outputs$/, route => {
    const id = /messages\/(\d+)\//.exec(route.request().url())[1], sent = JSON.parse(route.request().postData() || '{}').outputs || [];
    const kept = savedOutputs.get(id) || [];
    for (const output of sent) { const at = kept.findIndex(entry => entry.cardId === output.cardId); if (at >= 0) kept[at] = output; else kept.push(output); }
    savedOutputs.set(id, kept);
    return route.fulfill({ json: { outputs: kept } });
  });
  let restoring = null;
  await context.route(/\/api\/learn\/chat\/active(\?|$)/, route => (restoring && route.request().method() === 'GET' ? route.fulfill({ json: { threadId: restoring } }) : route.fallback()));
  await context.route(/\/api\/ask\/threads\/[^/?]+$/, route => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    if (!restoring || id !== restoring || route.request().method() !== 'GET') return route.fallback();
    const messages = turns.filter(t => t.threadId === id).flatMap(t => [{ ...t.user, ...(savedOutputs.has(t.user.messageId) ? { outputs: savedOutputs.get(t.user.messageId) } : {}) },
      { ...t.answer, meta: { ...t.answer.meta, ...(proposals.has(t.answer.messageId) ? { proposal: proposals.get(t.answer.messageId) } : {}), alternatives: [t.answer.messageId] } }]);
    return route.fulfill({ json: { id, title: 'Chat generation', mode: 'auto', contextRefs: [], draft: null, messages } });
  });
  await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));

  // MOCKED video jobs: every start is a new job, listed by its placement id; the test moves a job through its states.
  const jobs = new Map(), attempts = [];
  let drop = false, cancels = 0, serial = 0;
  const hold = { usd: 8.96, state: 'released' };
  const listed = () => [...jobs.entries()].map(([id, job]) => ({ id, key: KEY, status: job.status, retryable: job.retryable !== false, hold,
    ...(job.status === 'failed' ? { error: job.error || 'The Motion job failed: still blocking after the repair round: blank_frame' } : {}),
    ...(job.status === 'ready' ? { provider: 'motion', motion: { title: TITLE, duration_seconds: 15, renderer: 'remotion', source_refs: [] } } : {}) }));
  await context.route(/\/api\/learn\/video\?/, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('asset')) return route.fulfill({ body: CLIP_BYTES, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' } });
    const posted = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : null;
    if (posted?.action === 'cancel') { cancels += 1; const job = jobs.get(posted.id); if (job) Object.assign(job, { status: 'failed', error: 'Stopped.' }); return route.fulfill({ json: { videos: listed() } }); }
    if (posted) {
      attempts.push(posted);
      if (drop) { drop = false; return route.abort('failed'); }
      serial += 1;
      const id = `job-${theme}-${serial}`;
      jobs.set(id, { status: 'generating' });
      return route.fulfill({ status: 202, json: { motionEstimateCredits: 100, videos: listed(), placementId: id } });
    }
    return route.fulfill({ json: { motionEstimateCredits: 100, videos: listed() } });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  const shot = name => page.screenshot({ path: `${OUT}/${theme}-${name}.png` });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme is applied');
  const dock = page.locator('[data-chat-pane]');
  const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  const proposalCards = dock.locator('[data-generation-proposal]');
  const cardFor = words => proposalCards.filter({ has: page.locator('h3', { hasText: `Motion: ${words}` }) });
  const answerOf = card => card.locator('xpath=ancestor::*[@data-answer][1]');
  const startsMade = () => serial;
  const modeButton = dock.getByRole('button', { name: 'Mode', exact: true });
  const setMode = async mode => {
    if ((await modeButton.getAttribute('data-chat-mode')) === mode) return;
    await modeButton.click();
    await page.locator(`[data-chat-mode-option="${mode}"]`).click();
    await until(async () => (await modeButton.getAttribute('data-chat-mode')) === mode, `mode ${mode}`);
  };
  const send = async line => { await composer().fill(line); await composer().press('Enter'); };
  const propose = async words => {
    await send(`/motion ${words}`);
    const card = cardFor(words);
    await card.waitFor({ timeout: 30000 });
    await card.locator('[data-proposal-generate]:not([disabled])').waitFor({ timeout: 30000 });
    return card;
  };
  const phase = card => card.locator('[data-proposal-generate]').getAttribute('data-proposal-phase');
  const untilPhase = (card, want, what) => until(async () => (await phase(card)) === want, `${what || 'the proposal'} reads ${want}`, 40000);
  const label = card => card.locator('[data-proposal-generate]').innerText().then(text => text.trim());
  const press = async card => {
    await card.evaluate(node => {
      const button = node.querySelector('[data-proposal-generate]');
      window.__phases = [];
      new MutationObserver(() => { const value = button.getAttribute('data-proposal-phase'); if (value && value !== window.__phases.at(-1)) window.__phases.push(value); }).observe(button, { attributes: true, attributeFilter: ['data-proposal-phase'] });
    });
    await card.locator('[data-proposal-generate]').click();
  };
  const phases = () => page.evaluate(() => window.__phases || []);
  const jobOf = n => `job-${theme}-${n}`;
  failShot = async n => {
    await page.screenshot({ path: `${OUT}/FAIL-${String(n).padStart(2, '0')}-${theme}.png` }).catch(() => {});
    const dockText = (await dock.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700);
    console.log(`   [step ${n} page] mode ${await modeButton.getAttribute('data-chat-mode').catch(() => '?')}; proposal cards ${await proposalCards.count().catch(() => '?')}; starts ${startsMade()}; dock: ${dockText}`);
  };
  const extras = async answer => ({
    explore: await answer.locator('section[aria-label="Explore next"]').count(), spacing: await answer.locator('[data-answer-suggestions]').count(),
    add: await answer.locator('[data-add-to-canvas]').count(), regenerate: await answer.locator('button[aria-label="Regenerate answer"]').count(),
    copy: await answer.locator('button[aria-label="Copy answer"]').count(), thumbs: await answer.locator('button[aria-label="Good answer"]').count(),
  });

  // 1 ----------------------------------------------------------------------------------------------------------------
  await step(`${theme}: an ordinary Ask answer, with a card selected, keeps Explore next, Add as card, Regenerate, Copy and the thumbs`, async () => {
    await setMode('ask');
    const photo = page.locator('[data-block-id="k-photo"]');
    await photo.waitFor({ timeout: 30000 });
    const handle = await photo.locator('[data-drag-handle]').boundingBox();
    await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.locator('[data-selected-card="k-photo"]').waitFor({ timeout: 8000 });
    await send('What is photosynthesis?');
    await until(() => dock.locator('[data-answer]').count().then(count => count >= 1), 'the answer');
    const answer = dock.locator('[data-answer]').last();
    await answer.locator('section[aria-label="Explore next"]').waitFor({ timeout: 15000 });
    assert.match(JSON.stringify(asks.at(-1)), /k-photo/, 'the turn is about the selected card');
    assert.deepEqual(await extras(answer), { explore: 1, spacing: 1, add: 1, regenerate: 1, copy: 1, thumbs: 1 });
    await shot('01-ordinary');
  });

  // 2 ----------------------------------------------------------------------------------------------------------------
  await step(`${theme}: a non-generating slash command (/practice) gets no Explore next, spacing, Add as card or Regenerate; Copy and the thumbs stay`, async () => {
    const before = asks.length;
    await send('/practice photosynthesis');
    await until(() => asks.length > before, 'the chat turn');
    assert.equal(asks.at(-1).command, 'practice');
    await until(() => dock.locator('[data-answer]').count().then(count => count >= 2), 'the second answer');
    const answer = dock.locator('[data-answer]').last();
    await answer.locator('button[aria-label="Copy answer"]').waitFor({ timeout: 15000 });
    assert.deepEqual(await extras(answer), { explore: 0, spacing: 0, add: 0, regenerate: 0, copy: 1, thumbs: 1 });
    assert.equal(await answer.getByText('Explore next').count(), 0);
    await shot('02-practice');
  });

  // 3 ----------------------------------------------------------------------------------------------------------------
  const FIRST = '15s explain the first topic';
  await step(`${theme}: a /motion proposal has no Explore next, spacing, Add as card or Regenerate; Copy and the thumbs stay; Generate is enabled and idle`, async () => {
    await setMode('auto');
    const card = await propose(FIRST);
    assert.deepEqual(await extras(answerOf(card)), { explore: 0, spacing: 0, add: 0, regenerate: 0, copy: 1, thumbs: 1 });
    assert.equal((await label(card)), 'Generate');
    assert.equal(await card.locator('[data-proposal-job-status]').count(), 0);
    assert.equal(await card.locator('[data-proposal-generate] svg').count(), 0, 'no spinner before the press');
    assert.equal(startsMade(), 0, 'nothing asked of the video route');
    await card.screenshot({ path: `${OUT}/${theme}-03-proposal.png` });
  });

  // 4 ----------------------------------------------------------------------------------------------------------------
  await step(`${theme}: Generate (double-clicked) starts one job: Starting at once, then Queued, then Generating with the card's own stage; Chat and canvas agree`, async () => {
    const card = cardFor(FIRST);
    const blocks = await page.locator('[data-block-id]').count();
    await card.evaluate(node => {
      const button = node.querySelector('[data-proposal-generate]');
      window.__phases = [];
      new MutationObserver(() => { const value = button.getAttribute('data-proposal-phase'); if (value && value !== window.__phases.at(-1)) window.__phases.push(value); }).observe(button, { attributes: true, attributeFilter: ['data-proposal-phase'] });
    });
    // The first job waits in the queue (MOCKED list), as soon as it exists.
    const queue = setInterval(() => { const job = jobs.get(jobOf(1)); if (job && job.status === 'generating' && !job.released) job.status = 'queued'; }, 50);
    await card.locator('[data-proposal-generate]').dblclick();
    await untilPhase(card, 'queued');
    clearInterval(queue);
    assert.equal((await phases())[0], 'submitting', `the first thing the press showed: ${(await phases()).join(', ')}`);
    assert.equal(await label(card), 'Queued');
    await page.waitForTimeout(2500);
    assert.equal(startsMade(), 1, 'a double-click is one job');
    assert.equal(await page.locator('[data-block-id]').count(), blocks + 1, 'one card');
    jobs.get(jobOf(1)).status = 'generating';
    await untilPhase(card, 'running');
    assert.equal(await label(card), 'Generating');
    const button = card.locator('[data-proposal-generate]');
    assert.equal(await button.getAttribute('aria-busy'), 'true');
    assert.equal(await button.isDisabled(), true);
    assert.equal(await button.locator('svg').count(), 1, 'a spinner');
    // The same job on the canvas: the card's own words, and the Chat's stage line says them too.
    const onCanvas = page.locator('[data-block-id]', { hasText: STAGE });
    await onCanvas.waitFor({ timeout: 15000 });
    assert.equal(await onCanvas.count(), 1);
    assert.equal((await card.locator('[data-proposal-job-detail]').innerText()).trim(), STAGE);
    // Elapsed time is shown, and never announced.
    await card.locator('[data-proposal-elapsed]').waitFor({ timeout: 10000 });
    const announced = await card.locator('[data-proposal-announcement]').innerText();
    assert.match(announced, /^Generating\. Planning, reviewing and rendering$/);
    assert.doesNotMatch(announced, /\d|elapsed/);
    assert.equal(await card.locator('[data-proposal-announcement]').getAttribute('aria-live'), 'polite');
    assert.equal(await card.locator('[data-proposal-go-to-card]').count(), 1);
    assert.equal(await card.locator('[data-proposal-stop]').count(), 1);
    assert.doesNotMatch(await card.innerText(), /Added to the canvas/);
    assert.equal(await page.locator('[data-gen-indicator]').count(), 0, 'no second banner for the same job');
    assert.equal(await dock.locator('[data-chat-output]').count(), 1, 'the prompt shows its card');
    // The output was saved on the prompt, so a reload can find the job again.
    await until(() => [...savedOutputs.values()].some(list => list.some(output => output.jobId?.startsWith('proposal:gp-'))), 'the output saved on its prompt');
    // The board holds the card with its placement id before the reload.
    await until(() => seen.some(r => r.method === 'PUT' && /\/api\/learn\/boards\/[^/]+\/main$/.test(r.path) && r.body.includes(jobOf(1))), 'the board saved with the placement id');
    await shot('04-generating');
    await card.screenshot({ path: `${OUT}/${theme}-04-generating-proposal.png` });
  });

  // 5 ----------------------------------------------------------------------------------------------------------------
  const threadA = turns.at(-1).threadId;
  await step(`${theme}: a reload during generation shows the proposal Generating again with no new start; older answers keep or lose their extras by kind`, async () => {
    restoring = threadA;
    const posts = startsMade(), asked = asks.length;
    try {
      await page.reload();
      await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
      await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
      const card = cardFor(FIRST);
      await card.waitFor({ timeout: 30000 });
      await untilPhase(card, 'running', 'the restored proposal');
      assert.equal(await label(card), 'Generating');
      assert.equal(await card.locator('[data-proposal-generate]').isDisabled(), true, 'it cannot be pressed again');
      await page.waitForTimeout(1500);
      assert.deepEqual([startsMade() - posts, asks.length - asked], [0, 0], 'a reload sends no start and no turn');
      // older answers: the ordinary one keeps a collapsed Suggestions toggle; the command and proposal answers have no extras at all
      assert.equal(await dock.locator('[data-answer-suggestions-toggle]').count(), 1, 'only the older ordinary answer has the toggle');
      assert.deepEqual(await extras(answerOf(card)), { explore: 0, spacing: 0, add: 0, regenerate: 0, copy: 1, thumbs: 1 }, 'the proposal answer, viewed after a reload');
      assert.equal(await dock.locator('[data-add-to-canvas]').count(), 1, 'Add as card remains on the ordinary answer only');
      assert.equal(await page.locator('[data-gen-indicator]').count(), 0, 'still no second banner');
      await shot('05-reloaded');
    } finally { restoring = null; }
  });

  // 6 ----------------------------------------------------------------------------------------------------------------
  const SECOND = '10s explain the second topic';
  await step(`${theme}: a New chat shows none of the other thread's job; its own proposal waits for Generate`, async () => {
    await dock.locator('[data-chat-new]').click();
    await until(async () => (await proposalCards.count()) === 0, 'the new chat is empty');
    assert.equal(await dock.locator('[data-proposal-job-status]').count(), 0, 'no status of the other thread');
    assert.equal(await page.locator('[data-gen-indicator]').count(), 0);
    const card = await propose(SECOND);
    assert.equal(await card.locator('[data-proposal-job-status]').count(), 0);
    assert.equal(await label(card), 'Generate');
    assert.notEqual(turns.at(-1).threadId, threadA, 'a different thread');
  });

  // 7 ----------------------------------------------------------------------------------------------------------------
  await step(`${theme}: Stop in Chat asks first, then sends the canvas card's own stop request once; the proposal and the canvas card say Stopped`, async () => {
    const card = cardFor(SECOND);
    await press(card);
    await untilPhase(card, 'running');
    const stop = card.locator('[data-proposal-stop]'), confirm = card.locator('[data-proposal-stop-confirm]');
    await stop.waitFor();
    await stop.click();
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /Stop this video\? Credits already used won't be refunded\./);
    assert.equal(await card.locator('[data-proposal-stop-cancel]').evaluate(node => node === document.activeElement), true, 'Cancel is focused');
    await card.locator('[data-proposal-stop-cancel]').click();
    assert.deepEqual([await confirm.count(), cancels], [0, 0], 'Cancel sends nothing');
    await stop.click();
    await confirm.waitFor();
    await page.keyboard.press('Escape');
    assert.deepEqual([await confirm.count(), cancels, await stop.evaluate(node => node === document.activeElement)], [0, 0, true], 'Escape sends nothing and returns focus to Stop');
    await stop.click();
    await card.locator('[data-proposal-stop-confirmed]').click();
    await untilPhase(card, 'stopped');
    assert.equal(cancels, 1, 'one stop request');
    assert.equal(await card.locator('[data-proposal-generate] svg').count(), 0, 'no spinner once stopped');
    assert.equal(await card.locator('[data-proposal-stop]').count(), 0);
    assert.match(await card.locator('[data-proposal-job-detail]').innerText(), /Stopped/);
    await page.locator('[data-block-id]', { hasText: 'Stopped.' }).first().waitFor({ timeout: 15000 });
    await card.screenshot({ path: `${OUT}/${theme}-07-stopped.png` });
  });

  // 8 ----------------------------------------------------------------------------------------------------------------
  const THIRD = '9s explain the third topic', FOURTH = '8s explain the fourth topic', FIFTH = '7s explain the fifth topic';
  await step(`${theme}: completion shows Ready with a check and Go to card, no spinner`, async () => {
    const card = await propose(THIRD);
    await press(card);
    await untilPhase(card, 'running');
    jobs.get(jobOf(startsMade())).status = 'ready';
    await untilPhase(card, 'done');
    assert.equal(await label(card), 'Ready');
    assert.equal(await card.locator('[data-proposal-generate] svg').count(), 1, 'a check icon');
    assert.equal(await card.locator('[data-proposal-generate] .animate-spin').count(), 0, 'no spinner');
    assert.equal(await card.locator('[data-proposal-stop]').count(), 0);
    assert.match(await card.locator('[data-proposal-announcement]').innerText(), /ready on the canvas/);
    const posts = startsMade();
    await card.locator('[data-proposal-go-to-card]').click();
    await page.waitForTimeout(800);
    assert.equal(startsMade(), posts, 'Go to card starts nothing');
    await card.screenshot({ path: `${OUT}/${theme}-08-ready.png` });
  });
  await step(`${theme}: failure shows the reason and no spinner, with the card to open`, async () => {
    const card = await propose(FOURTH);
    await press(card);
    await untilPhase(card, 'running');
    jobs.get(jobOf(startsMade())).status = 'failed';
    await untilPhase(card, 'failed');
    assert.equal(await card.locator('[data-proposal-generate] svg').count(), 0, 'no spinner');
    assert.equal(await label(card), 'Generate', 'the button keeps its name, greyed');
    assert.equal(await card.locator('[data-proposal-generate]').isDisabled(), true);
    assert.match(await card.locator('[data-proposal-job-detail]').innerText(), /could not be made/);
    assert.equal(await card.locator('[data-proposal-go-to-card]').count(), 1);
    await card.screenshot({ path: `${OUT}/${theme}-08-failed.png` });
  });
  await step(`${theme}: an unknown outcome (the connection drops on the start) is explained, never success, never started again`, async () => {
    const card = await propose(FIFTH);
    drop = true;
    const posts = attempts.length;
    await press(card);
    await untilPhase(card, 'unknown');
    assert.equal(await card.locator('[data-proposal-generate] svg').count(), 0, 'no spinner');
    assert.match(await card.locator('[data-proposal-job-detail]').innerText(), /could not confirm[\s\S]*not started again/);
    assert.doesNotMatch(await card.innerText(), /\bReady\b|Added to the canvas/);
    await page.waitForTimeout(4000);
    assert.equal(attempts.length - posts, 1, 'one attempt, no automatic resubmission');
    await card.screenshot({ path: `${OUT}/${theme}-08-unknown.png` });
  });
  await step(`${theme}: with several jobs in the thread, every proposal keeps its own state`, async () => {
    const states = await Promise.all([SECOND, THIRD, FOURTH, FIFTH].map(words => phase(cardFor(words))));
    assert.deepEqual(states, ['stopped', 'done', 'failed', 'unknown']);
    assert.equal(await dock.locator('[data-chat-output]').count(), 4, 'each prompt shows the card its own proposal made');
  });

  // 9 ----------------------------------------------------------------------------------------------------------------
  await step(`${theme}: back on the first thread its job finishes and the proposal reads Ready; none of the second thread's jobs show there`, async () => {
    restoring = threadA;
    try {
      await page.reload();
      await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
      await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 30000 });
      const card = cardFor(FIRST);
      await card.waitFor({ timeout: 30000 });
      await untilPhase(card, 'running', 'the first thread\'s proposal');
      assert.equal(await cardFor(SECOND).count(), 0, 'the other thread\'s proposals are not here');
      assert.equal(await dock.locator('[data-proposal-job-status]').count(), 1, 'one status: this thread\'s');
      jobs.get(jobOf(1)).status = 'ready';
      await untilPhase(card, 'done');
      assert.equal(await label(card), 'Ready');
      await shot('09-first-thread-ready');
    } finally { restoring = null; }
  });

  // 10 ---------------------------------------------------------------------------------------------------------------
  const SIXTH = '6s explain the sixth topic';
  await step(`${theme}: keyboard, reduced motion, a narrow Chat and the polite status region`, async () => {
    await dock.locator('[data-chat-new]').click();
    await until(async () => (await proposalCards.count()) === 0, 'the new chat is empty');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const card = await propose(SIXTH);
    await press(card);
    await untilPhase(card, 'running');
    // Keyboard: Stop and its confirmation by keys.
    const stop = card.locator('[data-proposal-stop]');
    await stop.focus();
    await page.keyboard.press('Enter');
    await card.locator('[data-proposal-stop-confirm]').waitFor();
    assert.equal(await stop.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await card.locator('[data-proposal-stop-confirm]').count(), 0);
    assert.equal(await stop.evaluate(node => node === document.activeElement), true, 'focus returns to Stop');
    await card.locator('[data-proposal-go-to-card]').focus();
    assert.equal(await card.locator('[data-proposal-go-to-card]').evaluate(node => node === document.activeElement), true, 'Go to card takes focus by keyboard');
    // Reduced motion: the spinner and the shimmer do not animate; the words say what is happening.
    const animated = await card.locator('[data-proposal-generate] svg, [data-proposal-job-detail]').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
    assert.deepEqual([...new Set(animated)], ['none'], `animations under prefers-reduced-motion: ${animated.join(', ')}`);
    assert.equal(await label(card), 'Generating');
    // The busy label stays readable (not dimmed like a plain disabled button) and the action is at least 36 px tall.
    assert.equal(await card.locator('[data-proposal-generate]').evaluate(node => getComputedStyle(node).opacity), '1');
    assert.ok((await card.locator('[data-proposal-generate]').boundingBox()).height >= 36, 'the action is 36 px or taller');
    // The status region is polite and carries no time.
    assert.equal(await card.locator('[data-proposal-announcement]').getAttribute('role'), 'status');
    assert.doesNotMatch(await card.locator('[data-proposal-announcement]').innerText(), /\d/);
    // A narrow Chat: the card wraps its actions and never scrolls sideways.
    await card.evaluate(node => { node.parentElement.style.width = '300px'; node.parentElement.style.maxWidth = '300px'; });
    const fit = await card.evaluate(node => ({ overflow: node.scrollWidth - node.clientWidth, width: node.getBoundingClientRect().width }));
    assert.ok(fit.overflow <= 1 && fit.width <= 301, `a 300 px card fits: ${JSON.stringify(fit)}`);
    for (const selector of ['[data-proposal-generate]', '[data-proposal-go-to-card]', '[data-proposal-stop]']) {
      assert.ok((await card.locator(selector).boundingBox()).height >= 36, `${selector} is 36 px or taller`);
    }
    await card.screenshot({ path: `${OUT}/${theme}-10-narrow-reduced-motion.png` });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    jobs.get(jobOf(startsMade())).status = 'ready';
    await untilPhase(card, 'done');
  });

  console.log(`   ${theme}: model routes refused: ${model.length ? model.join(' ') : 'none'}`);
  assert.deepEqual(errors, [], `${theme}: no page errors`);
  await context.close();
}
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} passed${results.length === total ? '' : ` (ran ${results.length})`}`);
process.exit(passed === total && results.length === total ? 0 : 1);
