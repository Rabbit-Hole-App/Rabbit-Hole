// The Progress pane (C:/s/spec/tutor-workflow/draft.md Task 09, "Progress UI and access", acceptance 48 and 56), against the
// LOCAL stack only: real goals through the real /api/learn/coaching, a fresh browser profile. GET /api/learn/progress is
// stubbed in the browser with ProgressViews until lane T4's route is merged; REAL_PROGRESS=1 runs the same steps on the real
// route. No model is called: every model-capable request is aborted and counted, and none may happen. Prints no secrets.
// Usage: BASE=http://127.0.0.1:9251 SMALL_CP=http://127.0.0.1:9253 VARS=<cp .dev.vars> node e2e/tutor-progress-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9251';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9253';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-progress-check runs against the local stack only');
const SHOTS = process.argv[2] || 'tutor-progress-shots';
const REAL = process.env.REAL_PROGRESS === '1';
mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tutorprog-${Date.now().toString(36)}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Logistic Regression ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const CARD = { id: 'c-knn', type: 'explanation', dx: 0, dy: 0, title: 'KNN: a new example', body: 'Predict the class. Explain your choice.' };
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [CARD] } };
const coachingOf = async () => (await api(`/api/learn/coaching?app=${canvas.name}&board=main`)).state;
const act = async (state, action, payload) => (await api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', actionId: `${action}-${Math.random()}`, expectedRevision: state.revision, action, payload }) })).state;
const criterion = (criterionId, label) => ({ criterionId, label, requirement: `Show that you can ${label.toLowerCase()}`, requiresReasoning: false });
let state = await coachingOf();
state = await act(state, 'create_goal', { label: 'Predict a class using KNN', criteria: [criterion('c1', 'Identify nearest neighbours'), criterion('c2', 'Explain the majority vote'), criterion('c3', 'Explain what changes with k')] });
const knn = state.goals[0].goalId;
state = await act(state, 'create_goal', { label: 'Logistic regression thresholds', criteria: [criterion('r1', 'Read a threshold')] });
const reg = state.goals.find(goal => goal.goalId !== knn).goalId;
state = await act(state, 'activate_goal', { goalId: knn });
assert.equal(state.activeGoalId, knn, 'KNN is the active goal, regression paused');

// Task 08's ProgressView for each goal (contract SHAPES.ProgressView; criteria rows are deriveCriterionSummary's).
const row = (criterionId, status, reason, evidence = []) => ({ criterionId, version: 1, status, reason, evidenceIds: evidence, application: { status: 'not_checked', evidenceIds: [] }, retention: { status: 'not_checked', evidenceIds: [] } });
const VIEWS = {
  [knn]: { goalRef: { goalId: knn, scopeVersion: 1 }, summaryRevision: 2, derivationVersion: 1, criteria: [row('c1', 'demonstrated_independently', 'independent_support', ['o1']), row('c2', 'demonstrated_with_help', 'assisted_support', ['o2']), row('c3', 'not_checked', 'no_evidence')],
    counts: { total: 3 }, pendingAssessments: [], savedAt: '2026-10-20T10:05:00.000Z', nextAction: { label: 'Explain the vote in a new neighbour arrangement, without a hint.', prompt: 'Give me a fresh KNN example to explain without a hint.', actionLabel: 'Try a fresh example' } },
  [reg]: { goalRef: { goalId: reg, scopeVersion: 1 }, summaryRevision: 1, derivationVersion: 1, criteria: [row('r1', 'practising', 'incomplete_support', ['o3'])], counts: { total: 1 }, pendingAssessments: ['as-9'], savedAt: '2026-10-19T09:00:00.000Z' },
};

const browser = await chromium.launch();
const errors = [], model = [], progressReads = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
const modelRoute = (path, method) => path === '/api/learn/ask' || path.startsWith('/api/learn/tutor/') || path === '/api/learn/artifact' || path === '/api/learn/home-ask' || path === '/api/ask' || (path === '/api/learn/journey' && method === 'POST');
let progressDown = false;
await context.route('**/api/**', route => {
  const request = route.request(), url = new URL(request.url());
  if (modelRoute(url.pathname, request.method())) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  if (url.pathname === '/api/learn/progress') {
    progressReads.push(url.searchParams.get('goalId'));
    if (progressDown) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'progress_unavailable' }) });
    if (!REAL) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ view: VIEWS[url.searchParams.get('goalId')] }) });
  }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name, target = page) => { await target.waitForTimeout(400); await target.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const settle = (ms = 400) => page.waitForTimeout(ms);
const chatPane = (p = page) => p.locator('[data-chat-pane]');
const field = (p = page) => chatPane(p).locator('[data-chat-composer] textarea').first();
const icon = (p = page) => chatPane(p).getByRole('button', { name: 'Progress', exact: true });
const progress = (p = page) => p.locator('[data-progress-pane]');
const box = async locator => (await locator.boundingBox()) || { x: -1, y: -1, width: 0, height: 0 };
const open = async (p = page) => { await p.goto(`${BASE}/apps/${canvas.name}`); await chatPane(p).waitFor({ state: 'visible', timeout: 60000 }); await field(p).waitFor({ timeout: 30000 }); await p.waitForTimeout(1500); };

await check('the Progress icon in the Chat header opens Progress left of Chat; the draft, mode and Chat stay', async () => {
  await open();
  await field().fill('my own words, unsent');
  assert.equal(await icon().getAttribute('title'), 'Progress');
  await icon().click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 10000 });
  const pane = await box(progress()), chat = await box(chatPane()), card = await box(page.locator(`[data-block-id="${CARD.id}"]`).first());
  assert.ok(pane.width > 200 && chat.width > 200, 'both panes visible');
  assert.ok(card.x < pane.x && pane.x + pane.width <= chat.x + 2, 'Canvas, then Progress, then Chat');
  assert.equal(await field().inputValue(), 'my own words, unsent', 'the draft is kept');
  assert.match(await chatPane().getByRole('button', { name: 'Mode', exact: true }).innerText(), /Auto/, 'the mode is unchanged');
  assert.equal(await icon().getAttribute('aria-pressed'), 'true');
  await shot('progress-01-open-light');
});

await check('the overview: the current goal, a count that matches the skill rows, one next step, and when it was saved', async () => {
  assert.match(await progress().locator('[data-progress-count]').innerText(), /1\s*of 3\s*skills demonstrated independently/);
  assert.deepEqual(await progress().locator('[data-progress-skill]').evaluateAll(nodes => nodes.map(node => node.dataset.progressSkill)), ['demonstrated_independently', 'demonstrated_with_help', 'not_checked']);
  assert.match(await progress().locator('[data-progress-skill]').nth(1).innerText(), /Explain the majority vote\s*Demonstrated with help/);
  assert.equal(await progress().locator('[data-progress-next]').count(), 1, 'one next step');
  assert.match(await progress().locator('[data-progress-saved]').innerText(), /Based on saved answers · updated/);
  assert.equal(await progress().getByRole('combobox', { name: 'Learning goal' }).inputValue(), knn);
});

await check('a skill expands in place by keyboard: Why this status, then More about this skill', async () => {
  const toggle = progress().locator('[data-progress-skill]').nth(1).getByRole('button').first(); // the row's toggle; an open row also holds Ask tutor about this (Task 10)
  await toggle.focus();
  await page.keyboard.press('Enter');
  await progress().locator('[data-progress-why]').waitFor({ timeout: 5000 });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.match(await progress().locator('[data-progress-why]').innerText(), /Why this status[\s\S]*with help/);
  await progress().locator('[data-progress-more] summary').click();
  assert.match(await progress().locator('[data-progress-more]').innerText(), /Applied to a new case[\s\S]*Remembered later/);
  await shot('progress-02-skill-expanded-light');
});

await check('viewing another goal is read only: the active goal stays, Resume is offered separately', async () => {
  await progress().getByRole('combobox', { name: 'Learning goal' }).selectOption(reg);
  await progress().locator('[data-progress-viewing]').waitFor({ timeout: 5000 });
  assert.match(await progress().locator('[data-progress-viewing]').innerText(), /Your current goal is Predict a class using KNN/);
  assert.match(await progress().locator('[data-progress-pending]').innerText(), /Feedback pending on 1 answer/);
  assert.equal((await coachingOf()).activeGoalId, knn, 'browsing never switches the active goal');
});

await check('Escape closes Progress and returns focus to the icon; reopening keeps the viewed goal', async () => {
  await progress().getByRole('combobox', { name: 'Learning goal' }).focus();
  await page.keyboard.press('Escape');
  await settle(600);
  // A retracted column keeps its content mounted (ResizableSidePanel, inert at width 0), so closed is the column's width.
  assert.equal(await icon().getAttribute('aria-pressed'), 'false', 'closed');
  assert.ok((await box(page.locator('[data-companion]'))).width < 2, 'the column is retracted');
  assert.ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-chat-progress')), 'focus is back on the Progress icon');
  assert.equal(await field().inputValue(), 'my own words, unsent');
  await icon().click();
  await progress().locator('[data-progress-viewing]').waitFor({ timeout: 5000 });
  assert.equal(await progress().getByRole('combobox', { name: 'Learning goal' }).inputValue(), reg, 'the viewed goal is kept for reopening');
});

await check('Resume this goal is its own action: it switches the active goal, and nothing calls a model', async () => {
  await progress().locator('[data-progress-resume]').click();
  await settle(1200);
  assert.equal((await coachingOf()).activeGoalId, reg);
  assert.equal(await progress().locator('[data-progress-viewing]').count(), 0);
  assert.deepEqual(model, [], `no model request: ${model.join()}`);
});

await check('the panes resize by keyboard within bounds; Progress in Tutor, Ask and Off changes no control', async () => {
  const separator = page.getByRole('separator', { name: 'Resize viewer' });
  const before = (await box(progress())).width;
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  await settle(500);
  const after = (await box(progress())).width;
  assert.notEqual(Math.round(after), Math.round(before), 'resized');
  const chat = await box(chatPane());
  assert.ok(chat.width >= 300, 'Chat keeps a readable width');
  const before2 = await coachingOf();
  await chatPane().getByRole('button', { name: 'Mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
  await settle(900);
  await icon().click(); await settle(); await icon().click(); await settle();
  const after2 = await coachingOf();
  assert.deepEqual([after2.controls.mode, after2.controls.tutorEnabled, after2.controls.suggestionsPaused], ['tutor', before2.controls.tutorEnabled, before2.controls.suggestionsPaused], 'opening Progress changed no control');
  await shot('progress-03-tutor-mode-light');
});

await check('a failed read is an error with Retry, never empty progress', async () => {
  progressDown = true;
  await page.reload();
  await open();
  await icon().click();
  await progress().locator('[data-progress-error]').waitFor({ timeout: 10000 });
  assert.match(await progress().locator('[data-progress-error]').innerText(), /could not be loaded[\s\S]*Retry/);
  assert.equal(await progress().locator('[data-progress-count]').count(), 0, 'no zero count');
  progressDown = false;
  await progress().locator('[data-progress-error]').getByRole('button', { name: 'Retry' }).click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 10000 });
});

await check('dark theme', async () => {
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark'));
  await open();
  await icon().click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 10000 });
  await progress().locator('[data-progress-skill]').first().getByRole('button').first().click();
  await shot('progress-04-open-dark');
  await page.evaluate(() => localStorage.setItem('small.theme', 'light'));
});

await check('narrow screen: Progress at full width with Close; closing returns to Chat with the draft kept', async () => {
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 420, height: 860 });
  await open(phone);
  await field(phone).fill('phone draft');
  await icon(phone).click();
  await progress(phone).locator('[data-progress-count]').waitFor({ timeout: 10000 });
  const pane = await box(progress(phone));
  assert.ok(pane.width >= 400 - 2, `full width (${pane.width}px)`);
  assert.equal(await chatPane(phone).isVisible(), false, 'Chat is put away, still mounted');
  await shot('progress-05-narrow-light', phone);
  await progress(phone).getByRole('button', { name: 'Close Progress' }).click();
  await chatPane(phone).waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await field(phone).inputValue(), 'phone draft', 'the draft is kept');
  await phone.close();
});

assert.deepEqual(model, [], `no model request: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`progress reads: ${progressReads.length} (${REAL ? 'real route' : 'stubbed route'})`);
console.log(`PASS ${results.length}/10 checks`);
await browser.close();
