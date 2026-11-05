// /whiteboard W1 request path in the real app (roadmap rabbit-hole-whiteboard-roadmap-v1.md W1.5-W1.7), against the LOCAL stack only, with
// no model call: the whiteboard job API is a fake job server in this browser (as animation-mvp-check.mjs): the job's plan is posted on the
// line's thread (mocked into that thread's restore, its saves answered here), waits for Generate, then is ready with a result whose files the
// fake assets route serves (empty media: wiring evidence, not a rendered video).
// Covers: /whiteboard in Chat makes one job and a pending card with its stage word; the plan's review card ("Review your whiteboard", its
// "up to <N> credits" line, Length 10 to 60 s at the plan's length); a Length change saves the next revision and re-plans with
// `duration: <n>` (W-D7); Generate pressed twice approves once; the card plays from the assets route with its captions track, the
// "AI-narrated whiteboard video" line and a Download link named after the title; Ctrl+K pressed in the player does not open the inline
// editor; a reload shows the video again with no job read; no page error and no model request.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/whiteboard-mvp-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('whiteboard-mvp-check runs against the local stack only');
const SHOTS = process.argv[2] || 'whiteboard-mvp-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 7; // bump with the steps below; the printed line is what CI reads
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `wbmvp-${run}@example.com`, secret, handle: `wbmvp_${run}` }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json().catch(() => null);
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Whiteboard MVP ${run}` }) });

const REQUEST = 'explain gradient descent with one worked example';
const TITLE = 'Gradient descent, one step';
const MODEL = /^\/api\/(ask$|learn\/(ask|selection|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|artifact|explain|animation|chat\/material-proposals|cad\/jobs|motion))/;
const stray = [], errors = [], results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await current?.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };
const composer = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const sha16 = text => createHash('sha256').update(text).digest('hex').slice(0, 16);

// The fake job server: one job, its plan as a signed-looking proposal (the browser never checks a signature), its saves and actions.
const flow = { job: null, creates: [], approves: [], refines: [], puts: [], gets: 0, briefs: [], proposal: null };
const viewOf = job => ({ id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, stage: job.stage, attempt: 1, terminal: ['ready', 'failed'].includes(job.stage),
  title: TITLE, durationSeconds: job.duration, outcome: 'supported', failure: null, plan: { goal: 'See one update step of gradient descent.', durationSeconds: job.duration }, planHash: 'a'.repeat(64),
  result: job.stage === 'ready' ? { artifactId: `wa_${run}`, revision: 1, planHash: 'a'.repeat(64), measured: { seconds: job.duration, frames: job.duration * 30 } } : null,
  usage: { credits: 0, unknown: false }, chatPending: false, createdAt: 0, updatedAt: 0 });
const planOf = job => ({ proposal_id: sha16(job.id), version: 1, command: 'whiteboard-video', title: TITLE, description: 'See one update step of gradient descent.',
  settings: { duration_seconds: 60 }, source_refs: [], references: [], assumptions: [], limitations: [],
  requirements: ['Scene 1 (20 s): the loss surface', 'Scene 2 (20 s): one gradient step', 'Scene 3 (20 s): the new point', 'Narrated by one voice; 3 scenes; 60 seconds.'],
  input: { org: 'w', app: canvas.name, job: job.id, plan_hash: 'a'.repeat(64), request: REQUEST }, original_request: `/whiteboard ${REQUEST}`,
  expires_at: Math.floor(Date.now() / 1000) + 3600, sig: `v3.${'a'.repeat(64)}`, usage: { max_credits: 391, reserve_credits: null } });
const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (path === '/api/learn/whiteboard/jobs' && method === 'GET') return route.fulfill({ json: { available: true } });
  if (path === '/api/learn/whiteboard/assets') {
    const kind = url.searchParams.get('kind');
    const type = kind === 'captions' ? 'text/vtt' : kind === 'poster' ? 'image/png' : 'video/mp4';
    return route.fulfill({ status: 200, headers: { 'content-type': type, ...(url.searchParams.get('download') ? { 'content-disposition': 'attachment' } : {}) }, body: kind === 'captions' ? 'WEBVTT\n\n' : '' });
  }
  if (path === '/api/learn/whiteboard/jobs' && method === 'POST') {
    const body = request.postDataJSON();
    if (!flow.job) {
      flow.creates.push(body);
      flow.job = { id: `wj_${run}`, requestId: body.requestId, boardId: body.boardId, cardId: body.cardId, prompt: body.prompt, threadId: body.threadId, stage: 'planning', duration: 60 };
      flow.proposal = planOf(flow.job);
      flow.briefs.push({ messageId: '900001', threadId: body.threadId });
      const answer = viewOf(flow.job);
      flow.job.stage = 'awaiting_approval'; // the card's next read finds the plan waiting, so the Chat reads its thread again
      return route.fulfill({ status: 202, json: { job: answer } });
    }
    return route.fulfill({ status: 202, json: { job: viewOf(flow.job) } });
  }
  const one = path.match(/^\/api\/learn\/whiteboard\/jobs\/([^/]+)(?:\/(\w+))?$/);
  if (one && flow.job && decodeURIComponent(one[1]) === flow.job.id) {
    if (method === 'GET') { flow.gets += 1; return route.fulfill({ json: { job: viewOf(flow.job) } }); }
    if (one[2] === 'refine') { const sent = request.postDataJSON(); flow.refines.push(sent); flow.job.duration = Number(/duration:\s*(\d+)/.exec(sent.message)?.[1] || flow.job.duration); return route.fulfill({ json: { job: viewOf(flow.job) } }); }
    if (one[2] === 'approve') { flow.approves.push(request.postDataJSON()); const answer = viewOf({ ...flow.job, stage: 'authoring' }); flow.job.stage = 'ready'; return route.fulfill({ status: 202, json: { job: answer } }); }
  }
  const thread = path.match(/^\/api\/ask\/threads\/([^/]+)$/);
  if (thread && method === 'GET') {
    const id = decodeURIComponent(thread[1]), mine = flow.briefs.filter(b => b.threadId === id);
    if (!mine.length) return route.fallback();
    const real = await route.fetch().catch(() => null);
    const base = real?.ok ? await real.json() : { id, title: 'Whiteboard request', mode: 'auto', contextRefs: [], draft: null, messages: [] };
    const message = b => ({ role: 'assistant', content: 'See one update step of gradient descent.', messageId: b.messageId, kind: 'answer', status: 'done',
      meta: { version: 1, mode: 'ask', kind: 'answer', contextRefs: [], actions: [], followUps: [], syllabus: null, proposal: flow.proposal, alternatives: [b.messageId] } });
    return route.fulfill({ json: { ...base, messages: [...(base.messages || []), ...mine.map(message)] } });
  }
  const saved = path.match(/^\/api\/learn\/chat\/messages\/(\d+)\/proposal$/);
  if (saved && saved[1] === '900001') {
    if (method === 'GET') return route.fulfill({ json: { proposal: flow.proposal, message_id: '900001', used: false, references: [] } });
    const sent = request.postDataJSON();
    flow.puts.push(sent);
    const { expected_version: _version, ...change } = sent;
    flow.proposal = { ...flow.proposal, ...change, version: flow.proposal.version + 1 };
    return route.fulfill({ json: { proposal: flow.proposal, references: [] } });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (MODEL.test(path) && method !== 'GET') { stray.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
};

let current = null;
const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  current = page;
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane][data-chat-restore="ready"]').waitFor({ timeout: 60000 });
  return { context, page };
};

try {
  let { context, page } = await open();
  const plan = () => page.locator('[data-chat-pane] [data-generation-proposal="whiteboard-video"]').last();
  const card = () => page.locator(`[data-block-id="${flow.job.cardId}"] [data-whiteboard-video-card]`);
  await step('/whiteboard in Chat: one job with the request words, and its pending card on the canvas', async () => {
    await composer(page).click(); await composer(page).fill(`/whiteboard ${REQUEST}`); await page.waitForTimeout(150); await composer(page).press('Enter');
    await until(async () => flow.creates.length === 1, 'one job for the line');
    assert.equal(flow.creates[0].prompt, REQUEST, 'the words without the command');
    await card().waitFor({ state: 'attached', timeout: 20000 });
  });
  await step('the review card: Review your whiteboard, up to 391 credits, Length at 60 seconds with 10 to 60', async () => {
    await plan().waitFor({ timeout: 30000 });
    assert.match(await plan().innerText(), /Review your whiteboard/);
    assert.match(await plan().innerText(), /up to 391 credits/);
    const select = plan().locator('select[data-proposal-select="duration_seconds"]');
    assert.equal(await select.inputValue(), '60');
    assert.deepEqual(await select.locator('option').allInnerTexts(), ['10 seconds', '20 seconds', '30 seconds', '40 seconds', '50 seconds', '60 seconds']);
    assert.equal(await card().getAttribute('data-whiteboard-phase'), 'awaiting_approval');
    await plan().screenshot({ path: `${SHOTS}/A-plan.png` });
  });
  await step('a Length change saves version 2 and re-plans with duration: 30; nothing is approved', async () => {
    await plan().locator('select[data-proposal-select="duration_seconds"]').selectOption('30');
    await until(async () => flow.refines.length === 1, 'one refine after the length change');
    assert.deepEqual(flow.puts, [{ expected_version: 1, settings: { duration_seconds: 30 } }]);
    assert.equal(flow.refines[0].message, 'duration: 30');
    assert.equal(flow.refines[0].proposal?.version, 2, 'the refine names the revision just saved');
    assert.equal(flow.approves.length, 0);
  });
  await step('Generate pressed twice approves once; the card plays from the assets route with captions, its caption line and Download', async () => {
    const generate = plan().getByRole('button', { name: 'Generate', exact: true });
    await generate.click(); await generate.click({ force: true }).catch(() => {});
    await until(async () => flow.approves.length >= 1, 'an approve');
    await page.waitForTimeout(800);
    assert.equal(flow.approves.length, 1, 'one approve for two presses');
    const video = card().locator('[data-player] video[data-whiteboard-player]');
    await video.waitFor({ timeout: 30000 });
    assert.match(await video.getAttribute('src'), /\/api\/learn\/whiteboard\/assets\?.*artifact=wa_[^&]+&kind=final$/);
    assert.equal(await video.getAttribute('preload'), 'metadata');
    assert.match(await video.getAttribute('poster'), /kind=poster$/);
    assert.match(await video.locator('track[kind="captions"]').getAttribute('src'), /kind=captions$/);
    assert.equal((await card().locator('[data-whiteboard-caption]').innerText()).trim(), 'AI-narrated whiteboard video');
    const download = card().locator('[data-whiteboard-download]');
    assert.equal((await download.innerText()).trim(), 'Download');
    assert.match(await download.getAttribute('href'), /kind=final&download=1$/);
    assert.equal(await download.getAttribute('download'), 'gradient-descent-one-step.mp4');
    await card().screenshot({ path: `${SHOTS}/B-ready.png` });
  });
  await step('Ctrl+K pressed with the player focused does not open the inline editor', async () => {
    await card().locator('video').focus();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-inline-ai]').count(), 0);
  });
  await step('a reload shows the video again with no job read', async () => {
    await page.waitForTimeout(2500); // the canvas autosave
    await context.close();
    const gets = flow.gets;
    ({ context, page } = await open());
    await card().locator('video[data-whiteboard-player]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    assert.equal(flow.gets, gets, 'a ready card is served by its artifact, never by the job');
  });
  await context.close();
  await step('no model request and no page error', async () => {
    assert.deepEqual(stray, []);
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${TOTAL} checks passed`);
process.exit(passed === TOTAL && results.length === TOTAL ? 0 : 1);
