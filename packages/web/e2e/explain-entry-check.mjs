// /explain v2 entry points (EXP-T20 slice 3, EXP-T21, Lane L2) against the LOCAL stack only. The board save, chat threads and
// sign-in are REAL; the /explain job API (C:/s/spec/explain/job-api-c.md) is a fake job server in the browser, so this runs
// with EXPLAIN_V2_ENABLED off, never calls a model, and every other model-capable request is aborted and counted.
//   1. typed /explain: one job (source explicit, the saved line's chat thread), its card placed at once and waiting;
//   2. a reload while it waits shows the same card, observes the job and creates nothing; ready, the card becomes the
//      explanation and the board saves its result identity;
//   3. the picker (Add explanation pill + words) is the same job path;
//   4. Use example (a submitted suggestion) only fills the composer; its Send makes one job;
//   5. natural language the server routes to explain (chat route, flow direct) is the same job path;
//   6. a command-bearing Ctrl+K /explain on a selected card: one job (source command) with the card's words as context;
//   7. canvas switch: a job made on canvas A that finishes while canvas B is open attaches to nothing on B, and to its card on A;
//   8. provider_unavailable: the card says the explanation is paused and keeps the request; Retry (twice) sends one Retry with
//      the job's attempt, and the card then fills in;
//   9. stale revision: a Ctrl+K Edit whose candidate was made from another revision of the card is refused at Apply, the card
//      and the candidate kept;
//  10. nothing else asked a model, left the stack, or threw.
// Usage: BASE=http://127.0.0.1:9311 SMALL_CP=http://127.0.0.1:9313 VARS=<stack .dev.vars> node e2e/explain-entry-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SCENE_EXAMPLE } from '../../control-plane/src/agents/learn-scene-author.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9311';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9313';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-entry-check runs against the local stack only');
const OUT = process.argv[2] || 'explain-entry-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim().replace(/^(['"])(.*)\1$/, '$2');
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `xen-${run}@example.com`, secret }) })).json();
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const out = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${method} ${path}: HTTP ${response.status} ${out?.error || ''}`);
  return out;
};
const EMPTY = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [] };
const NOTES = { id: 'notes', type: 'explanation', title: 'Heap notes', body: 'A binary heap keeps every parent at or above its children.', dx: 0, dy: 0 };
const canvasA = await api('/api/canvases', 'POST', { title: `Explain entry A ${run}` });
const canvasB = await api('/api/canvases', 'POST', { title: `Explain entry B ${run}` });
await api(`/api/learn/boards/${canvasA.name}/main`, 'PUT', { state: { ...EMPTY, blocks: [NOTES] } });
await api(`/api/learn/boards/${canvasB.name}/main`, 'PUT', { state: { ...EMPTY, blocks: [] } });
const board = name => api(`/api/learn/boards/${name}/main`).then(out => out.state);

// The fake job server: one job per requestId; a job waits ('authoring') until the check releases it.
const jobs = new Map(), creates = [], retries = [];
let routeAnswer = null; // the chat route's next decision (step 5); null answers 404, so a plain turn is sent as today
const view = job => ({ id: job.id, version: 1, boardId: job.boardId, cardId: job.cardId, requestClass: job.requestClass, stage: job.stage, attempt: job.attempt,
  terminal: ['ready', 'failed', 'cancelled'].includes(job.stage), round: 0, stopReason: null, failure: job.failure || null, recovery: job.recovery || [],
  usage: { credits: 0, unknown: false }, result: job.stage === 'ready' ? job.identity : null, createdAt: 0, updatedAt: 0 });
const identity = job => ({ jobId: job.id, resultId: `er_${job.id}`, cardId: job.cardId, canvas: { boardId: job.boardId }, promptRef: 'p', revision: `xr_${job.id}`, baseRevision: null,
  specHash: 's', compiledHash: 'c', componentVersions: {}, policyVersion: 'v' });
const release = (job, extra = {}) => Object.assign(job, { stage: 'ready', identity: { ...identity(job), ...extra }, failure: null, recovery: [] });
const lastCreate = () => creates.at(-1);
const refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|artifact))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  const path = url.pathname;
  if (path === '/api/learn/explain/jobs' && method === 'POST') {
    const body = request.postDataJSON();
    let job = [...jobs.values()].find(entry => entry.requestId === body.requestId);
    if (!job) {
      creates.push(body);
      job = { id: `ej_${run}${jobs.size + 1}`, requestId: body.requestId, boardId: body.boardId, cardId: body.cardId, requestClass: body.requestClass, stage: 'authoring', attempt: 1 };
      jobs.set(job.id, job);
    }
    return route.fulfill({ status: 202, json: { job: view(job) } });
  }
  const one = path.match(/^\/api\/learn\/explain\/jobs\/([^/]+)(?:\/(\w+))?$/);
  if (one) {
    const job = jobs.get(decodeURIComponent(one[1]));
    if (!job) return route.fulfill({ status: 404, json: { error: 'Not available' } });
    if (one[2] === 'retry') {
      const body = request.postDataJSON();
      retries.push(body);
      if (body.expectedAttempt === job.attempt && job.stage === 'failed') Object.assign(job, { stage: 'authoring', attempt: job.attempt + 1, failure: null, recovery: [] });
      return route.fulfill({ status: 202, json: { job: view(job) } });
    }
    if (one[2]) return route.fulfill({ json: { job: view(job) } });
    const board = url.searchParams.get('board');
    if (board !== job.boardId) return route.fulfill({ status: 404, json: { error: 'Not available' } });
    return route.fulfill({ json: { job: view(job), ...(job.stage === 'ready' ? { block: { type: 'animation', id: job.cardId, title: SCENE_EXAMPLE.title, scene: SCENE_EXAMPLE, explain: job.identity } } : {}) } });
  }
  if (path === '/api/learn/chat/route' && method === 'POST') return routeAnswer ? route.fulfill({ json: routeAnswer }) : route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(path)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(path) && method !== 'GET') { refused.push(path); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 10;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); } throw Error(label); };

const browser = await chromium.launch();
const open = async name => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/apps/${name}`);
  await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 });
  return { context, page };
};
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
const pending = (page, id) => page.locator(`[data-block-id="${id}"] [data-explain-pending]`);
const drawn = (page, id) => page.locator(`[data-block-id="${id}"] svg [data-animation-object]`).first();
const newJob = async count => { await until(async () => creates.length === count, `expected ${count} job create(s), saw ${creates.length}`); return [...jobs.values()].at(-1); };

let { context, page } = await open(canvasA.name);
let first = null;

await step('typed /explain: one job from the saved line\'s thread, its card placed at once and waiting', async () => {
  await send(page, '/explain how a heap keeps its order');
  first = await newJob(1);
  const body = lastCreate();
  assert.deepEqual([body.prompt, body.requestClass, body.source], ['how a heap keeps its order', 'simple', 'explicit']);
  assert.equal(typeof body.threadId, 'string', 'the brief has a thread to appear in');
  await pending(page, first.cardId).waitFor();
  assert.match(await page.locator(`[data-block-id="${first.cardId}"] [data-explain-stage]`).innerText(), /Writing the explanation/);
  await page.screenshot({ path: `${OUT}/1-typed-waiting.png` });
});

await step('a reload while it waits shows the same card, creates nothing; ready, the card is the explanation and is saved', async () => {
  await until(async () => (await board(canvasA.name)).blocks.some(block => block.id === first.cardId && block.explainJob?.id === first.id), 'the waiting card was not saved');
  await context.close();
  ({ context, page } = await open(canvasA.name));
  await pending(page, first.cardId).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  assert.equal(creates.length, 1, 'opening the canvas starts nothing');
  release(first);
  await drawn(page, first.cardId).waitFor({ timeout: 20000 });
  await until(async () => (await board(canvasA.name)).blocks.find(block => block.id === first.cardId)?.explain?.resultId === `er_${first.id}`, 'the board does not hold the result identity');
  assert.equal(await page.locator(`[data-block-id="${first.cardId}"]`).count(), 1, 'one card for the job');
  await page.screenshot({ path: `${OUT}/2-ready.png` });
});

await step('the picker: the Add explanation pill and its words make the same job', async () => {
  const box = composerOf(page);
  await box.click(); await box.fill('/expl');
  await page.locator('[data-slash-command="explain"]').click();
  await page.locator('[data-chat-pane] [data-command-pill="explain"]').waitFor();
  await box.fill('why a heap is a complete tree');
  await box.press('Enter');
  const job = await newJob(2);
  assert.deepEqual([lastCreate().prompt, lastCreate().source], ['why a heap is a complete tree', 'explicit']);
  await pending(page, job.cardId).waitFor();
  release(job);
});

await step('Use example only fills the composer; its Send makes one job', async () => {
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Slash commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Slash commands' });
  await sheet.waitFor();
  await sheet.locator('[data-slash-help="explain"]').click();
  await sheet.locator('[data-slash-use-example="explain"]').click();
  await sheet.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(800);
  assert.equal(creates.length, 2, 'a suggestion click sends nothing');
  assert.equal(await composerOf(page).inputValue(), 'how binary search works');
  await composerOf(page).press('Enter');
  const job = await newJob(3);
  assert.equal(lastCreate().prompt, 'how binary search works');
  release(job);
});

await step('natural language the server routes to explain is the same job path', async () => {
  routeAnswer = { route: 'capability:explain', capability: 'explain', flow: 'direct', via: 'jev', args: 'draw how a heap swaps a new item up' };
  await send(page, 'draw how a heap swaps a new item up');
  const job = await newJob(4);
  routeAnswer = null;
  assert.deepEqual([lastCreate().prompt, lastCreate().source], ['draw how a heap swaps a new item up', 'explicit']);
  await pending(page, job.cardId).waitFor();
  release(job);
});

await step('a command-bearing Ctrl+K /explain on a selected card: one job, source command, the card\'s words as context', async () => {
  await page.locator('[data-block-id="notes"]').click({ position: { x: 70, y: 22 } });
  await page.keyboard.press('Control+k');
  const editor = page.locator('[data-inline-ai]');
  await editor.waitFor();
  await editor.locator('[data-inline-prompt]').fill('/explain why the root is the largest');
  await editor.locator('[data-inline-submit]').click();
  const job = await newJob(5);
  const body = lastCreate();
  assert.deepEqual([body.prompt, body.source], ['why the root is the largest', 'command']);
  assert.match(body.context?.text || '', /parent at or above its children/);
  await editor.waitFor({ state: 'detached', timeout: 5000 });
  await pending(page, job.cardId).waitFor();
  release(job);
});

await step('canvas switch: a job finishing while canvas B is open attaches to nothing there, and to its card on A', async () => {
  await send(page, '/explain how heapify builds a heap');
  const job = await newJob(6);
  await until(async () => (await board(canvasA.name)).blocks.some(block => block.id === job.cardId), 'the waiting card was not saved on A');
  await page.goto(`${BASE}/apps/${canvasB.name}`);
  await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 });
  release(job);
  await page.waitForTimeout(3000);
  assert.equal(await page.locator(`[data-block-id="${job.cardId}"]`).count(), 0, 'nothing on B');
  assert.ok(!(await board(canvasB.name)).blocks.some(block => block.id === job.cardId), 'B\'s board never holds it');
  await page.goto(`${BASE}/apps/${canvasA.name}`);
  await drawn(page, job.cardId).waitFor({ timeout: 30000 });
});

await step('provider_unavailable: paused with the request kept; Retry twice sends one Retry at the job\'s attempt; then it fills in', async () => {
  await send(page, '/explain how a heap removes its root');
  const job = await newJob(7);
  Object.assign(job, { stage: 'failed', failure: { stage: 'authoring', category: 'provider_unavailable', message: 'unused', retryable: true }, recovery: ['new_attempt', 'edit_request'] });
  const card = page.locator(`[data-block-id="${job.cardId}"]`);
  const notice = card.locator('[data-explain-unavailable]');
  await notice.waitFor({ timeout: 20000 });
  const text = await notice.innerText();
  assert.match(text, /temporarily unavailable/i);
  assert.match(text, /how a heap removes its root/);
  assert.doesNotMatch(text, /\.\.\.|…|\$/);
  await page.screenshot({ path: `${OUT}/8-provider-unavailable.png` });
  const retry = card.locator('[data-explain-retry]');
  await retry.dblclick();
  await until(async () => retries.length >= 1, 'no Retry was sent');
  await page.waitForTimeout(500);
  assert.equal(retries.filter(body => body.expectedAttempt === 1).length, retries.length, 'every Retry carries the attempt it saw');
  assert.equal(job.attempt, 2, 'one new attempt');
  assert.equal(creates.length, 7, 'Retry makes no new job');
  release(job);
  await drawn(page, job.cardId).waitFor({ timeout: 20000 });
});

await step('stale revision: an Edit made from another revision of the card is refused at Apply; the card and candidate stay', async () => {
  const card = page.locator(`[data-block-id="${first.cardId}"]`);
  const before = (await board(canvasA.name)).blocks.find(block => block.id === first.cardId);
  await card.click({ position: { x: 70, y: 22 } });
  await page.keyboard.press('Control+k');
  const editor = page.locator('[data-inline-ai]');
  await editor.waitFor();
  await editor.locator('[data-inline-mode-toggle]').click();
  await editor.locator('[data-inline-mode="edit"]').click();
  await editor.locator('[data-inline-prompt]').fill('show the swap step');
  const count = creates.length;
  await editor.locator('[data-inline-submit]').click();
  const job = await newJob(count + 1);
  assert.deepEqual([lastCreate().requestClass, lastCreate().cardId, lastCreate().baseRevision], ['edit', first.cardId, before.explain.revision]);
  release(job, { baseRevision: 'xr_another' });
  await card.locator('[data-explain-apply]').waitFor({ timeout: 20000 });
  await card.locator('[data-explain-apply]').click();
  assert.match(await card.locator('[data-explain-edit-problem]').innerText(), /changed after the edit started/);
  assert.equal((await board(canvasA.name)).blocks.find(block => block.id === first.cardId).explain.revision, before.explain.revision, 'the accepted explanation is unchanged');
});

await step('nothing else asked a model, left the stack, or threw', async () => {
  assert.deepEqual(refused, [], `model-capable requests: ${refused.join(', ')}`);
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
});

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} explain entry checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
