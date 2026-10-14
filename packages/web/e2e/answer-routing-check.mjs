// Deterministic UI acceptance on the isolated dev clone; no model calls.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DEV_CP } from './dev-cp.mjs';
const BASE = process.env.BASE || 'https://rabbit-hole-web-dev-answer-routing.tryrabbithole.workers.dev';
if (new URL(BASE).hostname !== 'rabbit-hole-web-dev-answer-routing.tryrabbithole.workers.dev') throw Error('Use the answer-routing review clone');
const OUT = process.argv[2] || 'answer-routing-shots';
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const sessionResponse = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) });
assert.equal(sessionResponse.status, 200);
const { session } = await sessionResponse.json();
assert.ok(session);
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}` } })).json();
const APP = 'repo-06745f10-nanogpt', BOARD = `answer-routing-${Date.now()}`;
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const blocks = ['Seed one', 'Seed two'].map((title, i) => ({ id: `seed-${i}`, type: 'explanation', title, body: `Card ${i} explains a different idea.`, more: [], dx: i * 500, dy: 0 }));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, blocks]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks })), [KEY, blocks]);
const page = await context.newPage(), errors = [], calls = [], results = [];
page.on('pageerror', error => errors.push(error.message));
let plan = null, artifactError = false;
await page.route('**/api/learn/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  if (req.method() !== 'POST') return route.continue();
  calls.push({ path, body: req.postDataJSON() });
  if (path === '/api/learn/tutor/plan') {
    assert.ok(plan, 'every planner request is scripted');
    if (plan.error) return route.fulfill({ status: 503, json: { error: 'Routing test unavailable' } });
    return route.fulfill({ json: { strategy: 'none', constraints_add: [], ...plan } });
  }
  if (path === '/api/learn/tutor/evaluate') return route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } });
  if (path === '/api/learn/artifact') return route.fulfill(artifactError
    ? { status: 503, json: { error: 'Material unavailable' } }
    : { json: { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'Created teaching card', body: 'Only this card contains the lesson.', more: [] } } });
  throw Error(`Unscripted model-capable request: ${path}`);
});
const check = (label, ok) => { assert.ok(ok, label); results.push(label); console.log('PASS', label); };
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` });
const cards = () => page.locator('[data-chat-block]').count();
const sheet = page.locator('[data-chat-sheet]');
const input = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"]), [data-learn-dock] [data-chat-composer] textarea').first();
const send = async (text, response) => { plan = response; await input.fill(text); await input.press('Enter'); await page.waitForTimeout(900); };
const say = text => ({ actions: [{ type: 'respond_text', text }] });
const pick = async id => {
  await input.blur(); await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(400);
  await page.locator(`[data-block-id="${id}"] [data-drag-zone]`).last().click();
  await page.locator(`[data-selected-card="${id}"]`).waitFor();
};
try {
  await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
  await page.locator('[data-block-id="seed-0"]').waitFor({ timeout: 60000 });
  await send('Explain a probability curve', say('Direct teaching answer.'));
  await page.locator('[data-chat-block]').filter({ hasText: 'Direct teaching answer.' }).waitFor();
  check('clear teaching request creates exactly one card', await cards() === 1);
  check('teaching answer is absent from the window above chat', await sheet.getByText('Direct teaching answer.').count() === 0);
  await shot('direct-card');
  await pick('seed-0');
  const resizer = page.getByRole('separator', { name: 'Resize Learn panel' }), panelWas = await resizer.count();
  await send('What does this part mean?', say('Selected-card answer.'));
  // Owner, 2026-10-13: "we do not need Card Conversation in right side panel ... remove it". A question about a selected card is
  // answered like any chat answer, as a card; the selection only scopes the question. There is no Card conversation tab or panel.
  const chat = text => page.locator('[data-chat-block]').filter({ hasText: text });
  const conversationUi = () => page.evaluate(() => document.querySelectorAll('[data-card-conversation],[data-panel-tab="conversation"],[aria-label="Card conversation"]').length);
  const panelTabs = () => page.locator('[data-panel-tab]').evaluateAll(tabs => tabs.map(tab => tab.dataset.panelTab));
  await chat('Selected-card answer.').waitFor();
  check('selected-card discussion answers in the ordinary chat: one more card, nothing in the right panel', await cards() === 2 && await conversationUi() === 0);
  check('the right panel has no Card conversation tab, only its own tabs', await page.getByRole('tab', { name: 'Card conversation' }).count() === 0 && (await panelTabs()).length >= 3 && (await panelTabs()).every(id => ['find', 'toc', 'comments', 'files'].includes(id)));
  check('the question is still scoped to the selected card', String(calls.filter(c => c.path === '/api/learn/tutor/plan').at(-1)?.body?.context?.target?.description).includes('Card 0 explains a different idea.'));
  check('selected-card answer has one visible copy', await page.getByText('Selected-card answer.', { exact: true }).count() === 1);
  check('the answer leaves the right panel as it was: it no longer opens for a selected card', await resizer.count() === panelWas);
  await send('And the next part?', say('Follow-up answer.'));
  await chat('Follow-up answer.').waitFor();
  check('a follow-up is another ordinary chat card; still nothing in the right panel', await cards() === 3 && await conversationUi() === 0);
  await shot('selected-card-chat');
  await pick('seed-1');
  await send('What about this other card?', say('Other-card answer.'));
  await chat('Other-card answer.').waitFor();
  const plansBeforeReturn = calls.filter(c => c.path === '/api/learn/tutor/plan').length;
  await pick('seed-0');
  check('reselecting a card opens no conversation and makes no model request', await conversationUi() === 0 && calls.filter(c => c.path === '/api/learn/tutor/plan').length === plansBeforeReturn);
  check('each answer is its own card, once', await cards() === 4 && (await Promise.all(['Selected-card answer.', 'Follow-up answer.', 'Other-card answer.'].map(text => chat(text).count()))).every(count => count === 1));
  await send('Which one?', { ...say('Do you mean the left curve or the right curve?'), clarification_requested: true });
  await sheet.getByText('Do you mean the left curve or the right curve?', { exact: true }).waitFor();
  check('clarification appears above chat, with no card or panel duplicate', await cards() === 4 && await conversationUi() === 0 && await page.getByText('Do you mean the left curve or the right curve?', { exact: true }).count() === 1);
  await send('Try again', { error: true });
  await sheet.getByRole('alert').waitFor();
  check('planner errors appear above chat without an empty card', await cards() === 4);
  await shot('clarification-error');
  await send('Create teaching material', { inferred_intent: 'teach', actions: [{ type: 'respond_text', text: 'Duplicate planner explanation.' }, { type: 'create_material', command: 'explain', request: 'A probability curve' }] });
  await page.locator('[data-block-id]').filter({ hasText: 'Created teaching card' }).first().waitFor();
  check('material creation runs once and adds no duplicate chat card', calls.filter(c => c.path === '/api/learn/artifact').length === 1 && await cards() === 4);
  check('planner explanation is not duplicated in another surface', await page.getByText('Duplicate planner explanation.', { exact: true }).count() === 0);
  await shot('material-only');
  artifactError = true;
  await send('Create another teaching card', { actions: [{ type: 'respond_text', text: 'Another duplicate.' }, { type: 'create_material', command: 'explain', request: 'Another probability curve' }] });
  await sheet.getByText(/could not be made|Material unavailable/).waitFor();
  check('failed material creation is visible and makes no duplicate', await cards() === 4 && await page.getByText('Another duplicate.', { exact: true }).count() === 0);
  check('no browser runtime errors', errors.length === 0);
  await page.setViewportSize({ width: 390, height: 844 }); await shot('phone');
  writeFileSync(`${OUT}/evidence.json`, JSON.stringify({ base: BASE, board: BOARD, results, errors, requests: calls.map(c => c.path), modelCalls: 0 }, null, 2));
  console.log('PASS', results.length, 'checks;', 'board', BOARD);
} catch (error) { await shot('failure'); console.log((await page.locator('body').innerText()).slice(-5000)); throw error; }
finally { await browser.close(); }
