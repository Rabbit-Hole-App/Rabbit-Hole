// Moved into the app from the gate harness template scripts/r36-gate/templates/answer-routing-chat.mjs (harness 43f9661e), so the
// gate runs this file as it is (it reads process.env.LOCAL_CP_VARS; scripts/r36-gate/prepare.mjs). Same assertions, plus the
// right panel's Context tab (owner, 2026-10-14: Context replaced the Chat | Sources switch). Run on the gate's loopback stack:
// BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 LOCAL_CP_VARS=<cp .dev.vars> node e2e/answer-routing-check.mjs [outDir]
// Deterministic UI acceptance on the isolated dev clone; no model calls. The chat workspace (owner brief 2026-10-13, contract B5):
// the main composer is in the right-side Chat pane, answers show in its transcript, and a card is made only by Add as card.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const SMALL_CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const LOCAL_CP_VARS = process.env.LOCAL_CP_VARS;
const base = new URL(BASE), cp = new URL(SMALL_CP);
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.port !== '8878') throw Error('Use approved loopback app 8878');
if (cp.protocol !== 'http:' || cp.hostname !== '127.0.0.1' || cp.port !== '8879') throw Error('Use approved loopback CP 8879');
if (!LOCAL_CP_VARS) throw Error('LOCAL_CP_VARS must point to the private scheduled CP .dev.vars');
const secret = readFileSync(LOCAL_CP_VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1]?.trim();
if (!secret) throw Error('private CP vars has no TEST_BYPASS_SECRET');
const fetchWithTimeout = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
const OUT = process.argv[2] || 'answer-routing-shots';
mkdirSync(OUT, { recursive: true });
const wrongResponse = await fetchWithTimeout(`${SMALL_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: 'wrong' }) });
assert.equal(wrongResponse.status, 401);
const sessionResponse = await fetchWithTimeout(`${SMALL_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
assert.equal(sessionResponse.status, 200);
const { session } = await sessionResponse.json();
assert.ok(session);
const cookie = { Cookie: `small_session=${session}` };
const cpAppsResponse = await fetchWithTimeout(`${SMALL_CP}/api/apps`, { headers: cookie });
assert.equal(cpAppsResponse.status, 200);
const appsResponse = await fetchWithTimeout(`${BASE}/api/apps`, { headers: cookie });
assert.equal(appsResponse.status, 200);
const apps = await appsResponse.json();
const canvasTitle = `answer-routing-${Date.now().toString(36)}`;
const canvasResponse = await fetchWithTimeout(`${BASE}/api/canvases`, { method: 'POST', headers: { ...cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: canvasTitle }) });
assert.equal(canvasResponse.status, 201);
const canvas = await canvasResponse.json();
assert.match(canvas.name, /^canvas-[a-f0-9]{8}$/);
const APP = canvas.name, BOARD = `answer-routing-${Date.now()}`;
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const blocks = ['Seed one', 'Seed two'].map((title, i) => ({ id: `seed-${i}`, type: 'explanation', title, body: `Card ${i} explains a different idea.`, more: [], dx: i * 500, dy: 0 }));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, blocks]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks })), [KEY, blocks]);
const page = await context.newPage(), errors = [], calls = [], results = [];
page.on('pageerror', error => errors.push(error.message));
let plan = null, artifactError = false, turns = 0;
const THREAD = `answer-routing-thread-${Date.now().toString(36)}`;
await page.route('**/api/learn/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  if (req.method() !== 'POST') return route.continue();
  calls.push({ path, body: req.postDataJSON() });
  // The Chat pane posts every turn to /api/learn/ask (contract A4); the reply is the contract's SSE order: chunk, then answer_meta,
  // then done (contract B2). Auto on a journey canvas goes to the Tutor planner instead, so both are scripted with the same answer.
  if (path === '/api/learn/ask' || path === '/api/learn/tutor/plan') {
    assert.ok(plan, 'every chat request is scripted');
    if (plan.error) return route.fulfill({ status: 503, json: { error: 'Routing test unavailable' } });
    if (path === '/api/learn/tutor/plan') return route.fulfill({ json: { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: plan.text }], ...(plan.kind === 'clarify' ? { clarification_requested: true } : {}) } });
    const turn = ++turns, messageId = String(turn * 2), event = (name, data) => `event: ${name}
data: ${JSON.stringify(data)}

`;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: event('chunk', { text: plan.text })
      + event('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: plan.kind || 'answer' })
      + event('done', { threadId: THREAD, userMessageId: String(turn * 2 - 1), messageId }) });
  }
  // Chat persistence saves the exchange the learner saw (no model call): it reaches the real stack.
  if (/^\/api\/learn\/chat\/(threads\/[^/]+\/messages|active)$/.test(path)) return route.continue();
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (path === '/api/learn/artifact') return route.fulfill(artifactError
    ? { status: 503, json: { error: 'Material unavailable' } }
    : { json: { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'Created teaching card', body: 'Only this card contains the lesson.', more: [] } } });
  throw Error(`Unscripted model-capable request: ${path}`);
});
const check = (label, ok) => { assert.ok(ok, label); results.push(label); console.log('PASS', label); };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });
const pane = page.locator('[data-chat-pane]');
const cards = () => page.locator('[data-chat-block]').count();
const input = pane.locator('[data-chat-composer] input:not([type="file"]), [data-chat-composer] textarea').first();
const send = async (text, response) => { plan = response; await input.fill(text); if (text.startsWith('/')) await page.waitForTimeout(150); await input.press('Enter'); await page.waitForTimeout(900); };
const say = text => ({ text });
const pick = async id => {
  await input.blur(); await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(400);
  await page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last().click();
  await page.locator(`[data-selected-card="${id}"]`).waitFor();
};
// An answer in the Chat transcript (ChatMessages: data-answer; its footer's data-add-to-canvas button is Add as card).
const answer = text => pane.locator('[data-answer]').filter({ hasText: text });
const CHAT = ['/api/learn/ask', '/api/learn/tutor/plan'];
const plans = () => calls.filter(c => CHAT.includes(c.path)).length;
const conversationUi = () => page.evaluate(() => document.querySelectorAll('[data-card-conversation],[data-panel-tab="conversation"],[aria-label="Card conversation"]').length);
const panelTabs = () => page.locator('[data-panel-tab]').evaluateAll(tabs => tabs.map(tab => tab.dataset.panelTab));
try {
  await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
  await page.locator('[data-block-id="seed-0"]').waitFor({ timeout: 60000 });
  await input.waitFor({ timeout: 30000 });
  check('the canvas dock is gone: the one main composer is in the Chat pane', await page.locator('[data-learn-dock]').count() === 0 && await pane.locator('[data-chat-composer]').count() === 1);
  await send('Explain a probability curve', say('Direct teaching answer.'));
  await answer('Direct teaching answer.').waitFor();
  check('a teaching answer shows in the Chat transcript, once', await answer('Direct teaching answer.').count() === 1 && await page.getByText('Direct teaching answer.', { exact: true }).count() === 1);
  check('no canvas card is created by itself for an answer', await cards() === 0);
  await shot('transcript-answer');
  const requestsBeforeAdd = calls.length;
  await answer('Direct teaching answer.').locator('[data-add-to-canvas]').click();
  await page.locator('[data-chat-block]').filter({ hasText: 'Direct teaching answer.' }).waitFor();
  check('Add as card puts that answer on the canvas as one card, with no request', await cards() === 1 && calls.length === requestsBeforeAdd);
  await answer('Direct teaching answer.').locator('[data-add-to-canvas][data-added]').click();
  await page.waitForTimeout(400);
  check('a click on Added locates the card and adds no duplicate', await cards() === 1 && calls.length === requestsBeforeAdd);
  await shot('add-as-card');
  await pick('seed-0');
  const resizer = page.getByRole('separator', { name: 'Resize Learn panel' }), panelWas = await resizer.count();
  await send('What does this part mean?', say('Selected-card answer.'));
  // Owner, 2026-10-13: no Card conversation in the right panel. A question about a selected card is answered in the Chat
  // transcript like any answer; the selection only scopes the question.
  await answer('Selected-card answer.').waitFor();
  check('selected-card discussion answers in the Chat transcript: no new card, no card conversation', await cards() === 1 && await conversationUi() === 0);
  check('the right panel has no Card conversation tab, only its own tabs (Progress is one since the 2026-10-22 owner decision), Chat among them', await page.getByRole('tab', { name: 'Card conversation' }).count() === 0 && (await panelTabs()).includes('chat') && (await panelTabs()).every(id => ['chat', 'find', 'toc', 'comments', 'progress', 'context', 'links', 'files'].includes(id)));
  check('the question is still scoped to the selected card', JSON.stringify(calls.filter(c => CHAT.includes(c.path)).at(-1)?.body?.canvas_target ?? calls.filter(c => CHAT.includes(c.path)).at(-1)?.body?.context?.target ?? null).includes('Card 0 explains a different idea.'));
  check('selected-card answer has one visible copy', await page.getByText('Selected-card answer.', { exact: true }).count() === 1);
  check('the answer leaves the right panel as it was', await resizer.count() === panelWas);
  await send('And the next part?', say('Follow-up answer.'));
  await answer('Follow-up answer.').waitFor();
  check('a follow-up is another transcript answer; still no new card and no card conversation', await cards() === 1 && await conversationUi() === 0);
  await shot('selected-card-chat');
  await pick('seed-1');
  await send('What about this other card?', say('Other-card answer.'));
  await answer('Other-card answer.').waitFor();
  const plansBeforeReturn = plans();
  await pick('seed-0');
  check('reselecting a card opens no conversation and makes no model request', await conversationUi() === 0 && plans() === plansBeforeReturn);
  check('each answer is in the transcript once, and the canvas holds only the added card', await cards() === 1 && (await Promise.all(['Selected-card answer.', 'Follow-up answer.', 'Other-card answer.'].map(text => answer(text).count()))).every(count => count === 1));
  await send('Which one?', { text: 'Do you mean the left curve or the right curve?', kind: 'clarify' });
  await pane.getByText('Do you mean the left curve or the right curve?', { exact: true }).waitFor();
  check('clarification appears in the Chat transcript, with no card or panel duplicate', await cards() === 1 && await conversationUi() === 0 && await page.getByText('Do you mean the left curve or the right curve?', { exact: true }).count() === 1);
  await send('Try again', { error: true });
  await pane.getByRole('alert').first().waitFor();
  check('planner errors appear in the Chat transcript without a card', await cards() === 1);
  await shot('clarification-error');
  // Material is made by a / command (learn-slash.js -> /api/learn/artifact), never by a chat answer: no chat request, no chat card.
  const chatBeforeMaterial = plans();
  await send('/explain A probability curve', null);
  await page.locator('[data-block-id]').filter({ hasText: 'Created teaching card' }).first().waitFor();
  check('material creation runs once, sends no chat request and adds no chat card', calls.filter(c => c.path === '/api/learn/artifact').length === 1 && plans() === chatBeforeMaterial && await cards() === 1);
  await shot('material-only');
  artifactError = true;
  await send('/explain Another probability curve', null);
  await page.getByText(/could not be made|Material unavailable/).first().waitFor();
  check('failed material creation is visible and makes no card', calls.filter(c => c.path === '/api/learn/artifact').length === 2 && plans() === chatBeforeMaterial && await cards() === 1);
  check('no browser runtime errors', errors.length === 0);
  await page.setViewportSize({ width: 390, height: 844 }); await shot('phone');
  const tripwireResponse = await fetchWithTimeout(`${BASE}/__provider-tripwire`);
  assert.equal(tripwireResponse.status, 200);
  const tripwire = await tripwireResponse.json();
  check('provider tripwire remains empty', Array.isArray(tripwire.hits) && tripwire.hits.length === 0);
  writeFileSync(`${OUT}/evidence.json`, JSON.stringify({ base: BASE, board: BOARD, results, errors, requests: calls.map(c => c.path), modelCalls: 0 }, null, 2));
  console.log(`${results.length}/${results.length} checks passed`, 'board', BOARD);
} catch (error) { await shot('failure'); console.log((await page.locator('body').innerText()).slice(-5000)); throw error; }
finally { await browser.close(); }
