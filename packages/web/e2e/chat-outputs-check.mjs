// A Chat prompt, its generation and the cards it made (UI changes brief sections 1, 2 and 5; C:/s/spec/ui-changes/brief.md), against
// the LOCAL stack only. Message persistence is REAL: the user message, its command and its outputs are read back from the server
// (POST /api/learn/chat/threads/<id>/messages, PUT /api/learn/chat/messages/<id>/outputs, GET /api/ask/threads/<id>), and the board
// save is real. Only /api/learn/artifact, the CAD job routes and one CAD thumbnail are answered in the browser; every other
// model-capable request is aborted and counted, so no model, executor or paid call is ever made.
//   1. a /cad line shows as the learner's message at once, and its confirmation shows that exact line   (brief items 1, 3)
//   2. the line is saved as a user message with its command before Generate                               (item 2)
//   3. after Generate the card and the indicator above the composer are both active; the indicator shows the line, a spinner and
//      a shimmer, and the message keeps showing                                                            (items 1, 4)
//   4. after a reload the line is still there and the still-running job's indicator comes back             (item 2, refresh)
//   5. the job finishes: card and indicator leave their active state together; the message holds a thumbnail (item 4)
//   6. the thumbnail focuses, selects and scrolls to the card                                              (item 10)
//   7. the card deleted, the thumbnail restores it from its snapshot: jobs un-hidden, same card, no generation (item 11)
//   8. repeated restore clicks add no second card; with the card present they only locate it              (item 12)
//   9. a failed job and a cancelled job each stop the indicator's spinner and shimmer, with a stable line  (item 5)
//  10. /explain leaves a compact card link (no picture) under its line                                    (brief 5)
//  11. a card removed before it finished says restoration is unavailable and nothing is generated         (clarification 5)
//  12. the server holds each line with its command and outputs; a fresh browser shows them and they still navigate, by keyboard too
//  13. the commands that answered with a prompt (/simplify, /deeper, /example, /ask, /teach) are removed (owner, 2026-10-20, L7):
//      typed in Auto and in Ask each says it is unavailable, makes no pill and sends no Tutor plan or /api/learn/ask
//  14. a pill line sent while another command runs stays in the composer and runs once that ends
// Before this change step 1 fails: a / line never shows as a message. Step 14 fails on be869fa1 and main e3fc9671 (L1b): the
// pill and its words clear and nothing is sent. /api/learn/ask and the Tutor plan get canned answers here.
// Usage: BASE=http://127.0.0.1:9141 SMALL_CP=http://127.0.0.1:9143 VARS=<cp .dev.vars> node e2e/chat-outputs-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { unavailableCommand } from '../src/agent/slash.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9141';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9143';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('chat-outputs-check runs against the local stack only');
const OUT = process.argv[2] || 'chat-outputs-shots';
mkdirSync(OUT, { recursive: true });
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `cho-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// ---------------------------------------------------------------- setup: a canvas with one older card
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Chat outputs ${run}` }) });
const OLD = { id: 'old-card', type: 'explanation', title: 'Already here', body: 'A card made before.', dx: 900, dy: 0 };
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [OLD] } }) });
const thread = async () => {
  const { threads } = await api(`/api/ask/threads?scope=learn&ref=${canvas.name}&limit=5`);
  return threads?.[0] ? api(`/api/ask/threads/${threads[0].id}`) : null;
};

// ---------------------------------------------------------------- routes: messages and board real; model and CAD scripted
const CAD_LINE = '/cad an educational 40 mm by 20 mm by 5 mm rectangular plate';
const FAIL_LINE = '/cad a bracket that will fail';
const CANCEL_LINE = '/cad a hinge that will be cancelled';
const EXPLAIN_LINE = '/explain why a token id is only an index';
const THUMB = '/api/learn/files/src_fixture/d/thumb.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const jobs = new Map();
const cadCalls = [];
const manifest = job => ({ schema: 'cad-model/1', revisionId: `rev-${job.id}`, title: job.title, units: 'mm', parameters: { length: 40 }, assumptions: ['Fixture.'], validation: { baselinePassed: true, checks: [], unchecked: [] },
  artifacts: [{ kind: 'thumbnail', url: THUMB, name: 'thumb.png' }] });
const blockOf = job => ({ type: 'cad', id: job.cardId, jobId: job.id, modelId: `model-${job.id}`, revisionId: job.state === 'ready' ? `rev-${job.id}` : null, status: job.state, title: job.title, units: 'mm', briefSummary: 'Fixture.',
  manifest: job.state === 'ready' ? manifest(job) : null, acceptedManifest: job.state === 'ready' ? manifest(job) : null, manifestUrl: `/api/learn/cad/jobs/${job.id}`, thumbnailUrl: job.state === 'ready' ? THUMB : null });
const reply = job => ({ job: { id: job.id, cardId: job.cardId, modelId: `model-${job.id}`, state: job.state, stage: job.state, attempt: 1, createdAt: job.createdAt, updatedAt: Date.now(), ...(job.state === 'ready' ? { manifest: manifest(job) } : {}) }, block: blockOf(job) });
const cadReply = (request, url) => {
  const body = request.method() === 'POST' ? request.postDataJSON() || {} : null;
  cadCalls.push({ method: request.method(), path: url.pathname, body });
  if (request.method() === 'POST' && url.pathname === '/api/learn/cad/jobs') {
    const job = { id: `job-${jobs.size + 1}`, cardId: body.cardId, title: body.prompt.slice(0, 40), state: 'queued', hidden: false, createdAt: Date.now() - 3000 };
    jobs.set(job.id, job);
    return reply(job);
  }
  const [, id, action] = url.pathname.match(/^\/api\/learn\/cad\/jobs\/([^/]+)(?:\/(\w+))?$/) || [];
  const job = id && jobs.get(id);
  if (job && action === 'placement') { job.hidden = body.hidden; if (body.hidden && !['ready', 'failed', 'cancelled'].includes(job.state)) job.state = 'cancelled'; }
  if (job && action === 'cancel') job.state = 'cancelled';
  if (job) return reply(job);
  const listed = [...jobs.values()].filter(entry => !entry.hidden);
  return { jobs: listed.map(entry => reply(entry).job), blocks: listed.map(blockOf) };
};
const artifacts = [], refused = [], outside = [], errors = [];
// Steps 13-14: any chat turn a command would make (/api/learn/ask bodies, Tutor plans), and a gate that holds /api/learn/artifact so a
// command is still running.
const asks = [], plans = [];
let artifactHold = null;
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course))/;
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/artifact') { artifacts.push(request.postDataJSON()); await artifactHold; return route.fulfill({ json: { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'A token id is only an index', body: 'The embedding table turns the index into a vector.' } } }).catch(() => {}); }
  if (url.pathname === '/api/learn/ask') { const body = request.postDataJSON(); asks.push(body); return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `event: chunk\ndata: ${JSON.stringify({ text: 'Canned answer.' })}\n\nevent: done\ndata: ${JSON.stringify({ threadId: body.thread_id })}\n\n` }); }
  if (url.pathname === '/api/learn/tutor/plan') { plans.push(request.postDataJSON()); return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Canned Tutor reply.' }] } }); }
  if (url.pathname === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (url.pathname.startsWith('/api/learn/cad/jobs')) return route.fulfill({ json: cadReply(request, url) });
  if (url.pathname === THUMB) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const results = [];
const total = 14;
let page = null;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); await page?.screenshot({ path: `${OUT}/fail-${results.length}-${THEME}.png` }).catch(() => {}); }
};
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw Error(label); };

const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: THEME });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(theme => { try { localStorage.setItem('small.theme', theme); } catch { /* storage off */ } }, THEME);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator(`[data-block-id="${OLD.id}"]`).waitFor({ timeout: 60000 });
  return { context, page };
};
const pane = page => page.locator('[data-chat-pane]');
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await page.waitForTimeout(150); await box.press('Enter'); };
const bubble = (page, text) => pane(page).locator('div.rounded-lg.bg-hover', { hasText: text });
const card = (page, id) => page.locator(`[data-block-id="${id}"]`);
const indicator = (page, id) => pane(page).locator(`[data-gen-indicator="${id}"]`);
const output = (page, id) => pane(page).locator(`[data-chat-output="${id}"]`);
const cardIds = page => page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')));
const inView = async (page, id) => { const box = await card(page, id).boundingBox(); return !!box && box.x < 1500 && box.x + box.width > 0 && box.y < 1000 && box.y + box.height > 0; };
const startsFor = () => cadCalls.filter(c => c.method === 'POST' && c.path === '/api/learn/cad/jobs').length;
const deleteCard = async (page, id) => { await card(page, id).locator('[data-drag-zone]').first().click(); await page.keyboard.press('Delete'); await until(async () => (await card(page, id).count()) === 0, `card ${id} was not deleted`); };
const settledIndicator = async (page, id, phase) => {
  await until(async () => (await indicator(page, id).getAttribute('data-gen-phase')) === phase, `indicator never ${phase}`, 20000);
  assert.equal(await indicator(page, id).getAttribute('data-gen-active'), 'false');
  assert.equal(await indicator(page, id).locator('.animate-spin').count(), 0, 'no spinner once settled');
  assert.equal(await indicator(page, id).locator('.shimmer').count(), 0, 'no shimmer once settled');
};

let context;
({ context, page } = await open());
let cadId = null;
await step('a /cad line shows as the message at once, and the confirmation shows that exact line', async () => {
  await send(page, CAD_LINE);
  await bubble(page, CAD_LINE).waitFor();
  const prompt = pane(page).locator('[data-paid-confirm] [data-paid-prompt]');
  await prompt.waitFor();
  assert.equal(await prompt.innerText(), CAD_LINE);
  assert.equal(startsFor(), 0, 'nothing starts before Generate');
  await page.screenshot({ path: `${OUT}/1-confirm-${THEME}.png` });
});

await step('the line is saved as a user message with its command before Generate', async () => {
  await until(async () => (await thread())?.messages?.some(m => m.role === 'user' && m.content === CAD_LINE && m.command === 'cad'), 'the line is not saved');
});

await step('after Generate the card and the indicator are active together, with the line, a spinner and a shimmer', async () => {
  await pane(page).locator('[data-paid-generate]').click();
  await until(async () => startsFor() === 1, 'the CAD job did not start');
  cadId = jobs.get('job-1').cardId;
  await card(page, cadId).waitFor();
  await until(async () => (await indicator(page, cadId).getAttribute('data-gen-active')) === 'true', 'the indicator is not active');
  assert.match(await card(page, cadId).locator('[data-cad-card]').getAttribute('data-cad-state'), /queued|building/);
  assert.equal(await indicator(page, cadId).locator('[data-gen-prompt]').innerText(), CAD_LINE);
  assert.equal(await indicator(page, cadId).locator('.animate-spin').count(), 1);
  assert.equal(await indicator(page, cadId).locator('[data-gen-text].shimmer').innerText(), 'Generating on the canvas');
  assert.equal(await indicator(page, cadId).locator('[data-progress]').count(), 0, 'no invented progress bar');
  assert.equal(await bubble(page, CAD_LINE).count(), 1, 'the message stays after confirmation');
  jobs.get('job-1').state = 'building';
  await until(async () => (await indicator(page, cadId).locator('[data-gen-stage]').innerText()) === 'Building geometry', 'the job stage is not shown', 10000);
  await page.screenshot({ path: `${OUT}/3-generating-${THEME}.png` });
});

await step('after a reload the line is still there and the running job shows its indicator again', async () => {
  await page.reload();
  await card(page, cadId).waitFor({ timeout: 60000 });
  await bubble(page, CAD_LINE).waitFor();
  await until(async () => (await indicator(page, cadId).getAttribute('data-gen-active')) === 'true', 'no indicator after reload', 20000);
  assert.equal(await indicator(page, cadId).locator('[data-gen-prompt]').innerText(), CAD_LINE);
});

await step('the job finishes: card and indicator leave the active state together; the message holds a thumbnail', async () => {
  jobs.get('job-1').state = 'ready';
  await until(async () => (await card(page, cadId).locator('[data-cad-card]').getAttribute('data-cad-state')) === 'ready', 'the card never became ready', 20000);
  // Same source: within one watch tick (1.5 s) of the card, never before it.
  await settledIndicator(page, cadId, 'done');
  assert.equal(await indicator(page, cadId).locator('[data-gen-text]').innerText(), 'Generated on the canvas');
  await until(async () => (await output(page, cadId).locator('img').count()) === 1, 'no thumbnail under the line', 15000);
  await page.screenshot({ path: `${OUT}/5-done-thumbnail-${THEME}.png` });
});

await step('the thumbnail focuses, selects and scrolls to the card', async () => {
  await page.locator(`[data-block-id="${OLD.id}"]`).locator('[data-drag-zone], h3, p').first().click().catch(() => {});
  await output(page, cadId).click();
  await until(async () => (await page.locator('[data-selected-card]').getAttribute('data-selected-card')) === cadId, 'the card is not selected');
  await until(() => inView(page, cadId), 'the card is not in view');
});

await step('the card deleted, the thumbnail restores it from its snapshot: jobs shown again, same card, no generation', async () => {
  const before = { starts: startsFor(), artifacts: artifacts.length };
  await deleteCard(page, cadId);
  await until(async () => jobs.get('job-1').hidden === true, 'the delete did not hide the job');
  await output(page, cadId).click();
  await card(page, cadId).waitFor();
  assert.equal(jobs.get('job-1').hidden, false, 'placement hidden:false before the card returns');
  const placements = cadCalls.filter(c => c.path.endsWith('/placement')).map(c => c.body.hidden);
  assert.deepEqual(placements.slice(-2), [true, false]);
  assert.deepEqual({ starts: startsFor(), artifacts: artifacts.length }, before, 'no generation');
  await until(async () => (await card(page, cadId).locator('[data-cad-card]').getAttribute('data-cad-state')) === 'ready', 'the restored card is not the finished model');
  await page.screenshot({ path: `${OUT}/7-restored-${THEME}.png` });
});

await step('repeated restore clicks add no second card; with the card there they only locate it', async () => {
  await deleteCard(page, cadId);
  await Promise.all([output(page, cadId).click(), output(page, cadId).click({ delay: 10 }), output(page, cadId).click({ delay: 20 })]);
  await card(page, cadId).waitFor();
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) await output(page, cadId).click();
  await page.waitForTimeout(800);
  assert.equal((await cardIds(page)).filter(id => id === cadId).length, 1);
  assert.equal(cadCalls.filter(c => c.path.endsWith('/placement') && c.body.hidden === false).length, 2, 'one un-hide per restore');
  assert.equal(startsFor(), 1);
});

let failId = null, cancelId = null;
await step('a failed job and a cancelled job each stop the spinner and shimmer and show a stable line', async () => {
  await send(page, FAIL_LINE);
  await pane(page).locator('[data-paid-prompt]', { hasText: FAIL_LINE }).waitFor();
  await pane(page).locator('[data-paid-generate]').click();
  await until(async () => startsFor() === 2, 'the second job did not start');
  failId = jobs.get('job-2').cardId;
  await until(async () => (await indicator(page, failId).getAttribute('data-gen-active')) === 'true', 'not active');
  jobs.get('job-2').state = 'failed';
  await settledIndicator(page, failId, 'failed');
  assert.equal(await indicator(page, failId).locator('[data-gen-text]').innerText(), 'Generation failed');
  await page.screenshot({ path: `${OUT}/9-failed-${THEME}.png` });
  await send(page, CANCEL_LINE);
  await pane(page).locator('[data-paid-prompt]', { hasText: CANCEL_LINE }).waitFor();
  await pane(page).locator('[data-paid-generate]').click();
  await until(async () => startsFor() === 3, 'the third job did not start');
  cancelId = jobs.get('job-3').cardId;
  await until(async () => (await indicator(page, cancelId).getAttribute('data-gen-active')) === 'true', 'not active');
  await card(page, cancelId).locator('[data-cad-action="cancel"]').click();
  await settledIndicator(page, cancelId, 'cancelled');
  assert.equal(await indicator(page, cancelId).locator('[data-gen-text]').innerText(), 'Generation cancelled');
  for (const line of [CAD_LINE, FAIL_LINE, CANCEL_LINE]) assert.equal(await bubble(page, line).count(), 1, `${line} stays`);
});

let explainId = null;
await step('/explain leaves a compact card link with no picture under its line', async () => {
  await send(page, EXPLAIN_LINE);
  await until(async () => !!(explainId = (await cardIds(page)).find(id => ![OLD.id, cadId, failId, cancelId].includes(id) && !id.startsWith('slot'))), 'no explanation card');
  await output(page, explainId).waitFor();
  assert.equal(await output(page, explainId).locator('img').count(), 0);
  assert.match(await output(page, explainId).getAttribute('aria-label'), /^Go to A token id is only an index/);
  await page.screenshot({ path: `${OUT}/10-link-${THEME}.png` });
});

await step('a card removed before it finished says restoration is unavailable; nothing is generated', async () => {
  const before = { starts: startsFor(), artifacts: artifacts.length };
  await deleteCard(page, cancelId);
  await output(page, cancelId).click();
  await pane(page).locator(`[data-chat-output-problem="${cancelId}"]`).waitFor();
  assert.match(await pane(page).locator(`[data-chat-output-problem="${cancelId}"]`).innerText(), /removed before it finished/);
  await page.waitForTimeout(800);
  assert.equal(await card(page, cancelId).count(), 0);
  assert.deepEqual({ starts: startsFor(), artifacts: artifacts.length }, before);
  await page.screenshot({ path: `${OUT}/11-unavailable-${THEME}.png` });
});
await context.close();

await step('the server holds each line with its command and outputs; a fresh browser shows them and they navigate', async () => {
  let saved;
  await until(async () => { saved = await thread(); const cadMsg = saved.messages.find(m => m.content === CAD_LINE); return cadMsg?.outputs?.[0]?.snapshot?.block?.status === 'ready' && saved.messages.find(m => m.content === EXPLAIN_LINE)?.outputs?.length === 1; }, 'outputs not saved', 20000);
  const users = saved.messages.filter(m => m.role === 'user');
  assert.deepEqual(users.filter(m => m.content !== EXPLAIN_LINE).map(m => [m.content, m.command]), [[CAD_LINE, 'cad'], [FAIL_LINE, 'cad'], [CANCEL_LINE, 'cad']]);
  const cadOut = users[0].outputs[0];
  assert.deepEqual([cadOut.cardId, cadOut.kind, cadOut.thumb, cadOut.jobId], [cadId, 'cad', THUMB, 'job-1']);
  assert.equal(users.filter(m => m.content === CAD_LINE).length, 1, 'one message per line, retries included');
  ({ context, page } = await open());
  await bubble(page, CAD_LINE).waitFor();
  await output(page, cadId).waitFor();
  await output(page, explainId).waitFor();
  // By keyboard: the link is a named button with a tooltip; Enter on it selects its card.
  assert.equal(await output(page, explainId).getAttribute('title'), await output(page, explainId).getAttribute('aria-label'));
  await output(page, explainId).focus();
  await page.keyboard.press('Enter');
  await until(async () => (await page.locator('[data-selected-card]').getAttribute('data-selected-card')) === explainId, 'the link does not select its card');
  await page.screenshot({ path: `${OUT}/12-fresh-${THEME}.png` });
  await context.close();
});

// A command chosen as a pill, then its words and Enter (L5's defect: the prompt came back to a Send that still saw the pill).
const WORDS = 'why softmax';
const pillSend = async (page, name, words = WORDS) => {
  const box = composerOf(page);
  await box.click(); await box.fill(`/${name} `);
  await pane(page).locator(`[data-command-pill="${name}"]`).waitFor();
  await box.fill(words); await page.waitForTimeout(150); await box.press('Enter');
};
const idle = page => until(async () => (await pane(page).locator('[data-chat-composer] button[aria-label="Stop"]').count()) === 0, 'the chat stays busy');
const composerClear = async page => { assert.equal(await composerOf(page).inputValue(), ''); assert.equal(await pane(page).locator('[data-command-pill]').count(), 0); };
const askMode = async page => {
  if ((await pane(page).locator('[data-chat-mode]').getAttribute('data-chat-mode')) === 'ask') return;
  await pane(page).locator('[data-chat-mode]').click();
  await pane(page).locator('[data-chat-mode-option="ask"]').click();
  await until(async () => (await pane(page).locator('[data-chat-mode]').getAttribute('data-chat-mode')) === 'ask', 'Ask mode not chosen');
};

// Owner, 2026-10-20 (L7): the five commands that answered with a prompt are removed, so none reaches the chat as a turn.
await step('the removed prompt commands, typed in Auto and in Ask, say they are unavailable and send no chat turn', async () => {
  ({ context, page } = await open());
  const before = { asks: asks.length, plans: plans.length };
  assert.equal(await pane(page).locator('[data-chat-mode]').getAttribute('data-chat-mode'), 'auto', 'Auto first');
  for (const mode of ['auto', 'ask']) {
    if (mode === 'ask') await askMode(page);
    for (const name of ['simplify', 'deeper', 'example', 'ask', 'teach']) {
      await send(page, `/${name} ${WORDS}`);
      await pane(page).locator('[data-slash-result]', { hasText: unavailableCommand(name) }).waitFor();
      assert.equal(await pane(page).locator('[data-command-pill]').count(), 0, `${mode}: /${name} makes no pill`);
    }
  }
  await idle(page);
  assert.deepEqual([asks.length, plans.length], [before.asks, before.plans], 'no Tutor plan and no /api/learn/ask');
  await page.screenshot({ path: `${OUT}/13-removed-prompts-${THEME}.png` });
});

await step('a pill line sent while another command runs stays in the composer and runs once that ends', async () => {
  let release = () => {};
  artifactHold = new Promise(done => { release = done; });
  try {
    await askMode(page);
    await send(page, '/explain softmax as a ratio');
    await pane(page).locator('[data-slash-result]', { hasText: 'Working on /explain' }).waitFor();
    await until(async () => artifacts.at(-1)?.command === 'explain', '/explain made no request');
    // A retained card command as the pill (owner, 2026-10-20, L7: the prompt commands this step used are removed).
    const before = artifacts.length, asked = asks.length;
    await pillSend(page, 'quiz', 'while it works');
    await page.waitForTimeout(600);
    assert.equal(await composerOf(page).inputValue(), '/quiz while it works', 'the held line stays in the composer');
    assert.equal(artifacts.length, before, 'nothing is requested while the command runs');
    await page.screenshot({ path: `${OUT}/14-held-${THEME}.png` });
    release(); artifactHold = null;
    await until(async () => artifacts.length === before + 1, 'the held line never ran');
    assert.deepEqual([artifacts.at(-1).command, artifacts.at(-1).args], ['quiz', 'while it works']);
    await idle(page);
    await page.waitForTimeout(800);
    assert.deepEqual([artifacts.length, asks.length], [before + 1, asked], 'it ran once, as its card command');
    await composerClear(page);
  } finally { release(); artifactHold = null; }
  await context.close();
});
await browser.close();

const passed = results.filter(Boolean).length;
const clean = !refused.length && !errors.length;
console.log(`${clean ? 'ok' : 'FAIL'} no model call beyond the stubbed routes (${refused.join(', ') || 'none refused'}), no page error${errors.length ? `: ${errors.join(' | ')}` : ''}; outside hosts aborted: ${[...new Set(outside)].join(', ') || 'none'}`);
console.log(`${passed}/${total} passed`);
process.exit(passed === total && results.length === total && clean ? 0 : 1);
