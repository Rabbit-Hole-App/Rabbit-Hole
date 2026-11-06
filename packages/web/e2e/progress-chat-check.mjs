// Progress questions and feedback review in chat (C:/s/spec/tutor-workflow/draft.md Task 10; acceptance 58-60), against the
// LOCAL stack only, with real persistence: a real journey goal from the stack's fixture planners (JOURNEY_MODEL_STUB), a
// keyed choice answer graded in code through the real attempt route, real /api/learn/coaching and /api/learn/progress. No
// model is called: the page answers the Learn ask with a canned stream after recording its body (a keyless stack refuses
// every ask at apiAsk's first line, so the server half of a progress question - resolving the scope and the read-only
// context - is proven by control-plane test/chat-modes.test.js and test/learn-progress-context.test.js, not here); every
// other model-capable request is aborted and counted, and none may happen.
// Prints no secrets.
// Usage: BASE=http://127.0.0.1:9301 SMALL_CP=http://127.0.0.1:9303 VARS=<cp .dev.vars> node e2e/progress-chat-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chatRouteAnswer } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:9301';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9303';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('progress-chat-check runs against the local stack only');
const SHOTS = process.argv[2] || 'progress-chat-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pchat-${Date.now().toString(36)}@example.com`, secret }) })).json();
const call = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};
const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });

// --- setup through the real routes --------------------------------------------------------------------------------------
const canvas = await post('/api/canvases', { title: `Logistic Regression ${Date.now().toString(36)}` });
const APP = canvas.name, BOARD = 'main', at = { app: APP, board: BOARD };
// A journey goal: start, skip the intake, and the stack's fixture planner opens the diagnostic with keyed probes.
await post('/api/learn/journey', { ...at, action: 'start', text: 'I want to learn logistic regression' });
const diag = await post('/api/learn/journey', { ...at, action: 'intake_skip' });
assert.equal(diag.journey.state, 'diagnostic', 'the fixture planner opened the diagnostic');
const coaching = async () => (await call(`/api/learn/coaching?app=${APP}&board=${BOARD}`)).state;
let state = await coaching();
const act = async (action, payload) => { state = (await post('/api/learn/coaching', { ...at, actionId: `${action}-${Math.random().toString(36).slice(2)}`, expectedRevision: state.revision, action, payload })).state; return state; };
const knn = state.goals.find(goal => goal.journeyId === diag.journey.id)?.goalId;
assert.ok(knn, 'the journey is a goal of this canvas');
// p1 (learn-journey-fixtures.js probesFor): a keyed multiple choice on the vocabulary claim; option b is a known misconception.
await act('change_scope', { goalId: knn, criteria: [
  { criterionId: 'vote', label: 'Explain the majority vote', requirement: 'Pick the statement that holds on a new case', requiresReasoning: false, skillKey: 'logistic-regression-foundations/vocabulary' },
  { criterionId: 'k', label: 'Explain what changes with k', requirement: 'Say what a larger k changes', requiresReasoning: true },
] });
await act('activate_activity', { activity: { goalId: knn, objective: 'The vocabulary on a new case', prompt: 'On a case you have not seen before, which statement holds?', responseKind: 'choice', criterionRefs: [{ criterionId: 'vote', version: 1 }], sourceRefs: [{ kind: 'journey_probe', id: 'p1', version: 1 }] } });
const activity = state.activities.find(a => a.activityId === state.activeActivityId);
const answered = await post('/api/learn/tutor/attempts', { ...at, activityId: activity.activityId, activityRevision: activity.revision, submissionKey: `pchat-${Date.now().toString(36)}`, submittedContent: { optionId: 'b' } });
assert.deepEqual([answered.assessment.status, answered.assessment.route], ['completed', 'keyed'], 'graded in code');
const ATTEMPT = answered.attempt.attemptId, ORIGINAL = answered.assessment;
// The submit stepped its activity to awaiting_feedback, then feedback_ready, each a coaching revision (learn-coaching-store.js
// advanceActivity, Tutor T5 gap a): read the state again, as the app does after Check my answer (TutorActivity.jsx).
state = await coaching();
// A different active goal, then Tutor selected and Off (acceptance 59).
await act('create_goal', { label: 'Logistic regression thresholds', criteria: [{ criterionId: 'r1', label: 'Read a threshold', requirement: 'Read a decision threshold', requiresReasoning: false }] });
const ACTIVE = state.activeGoalId;
assert.notEqual(ACTIVE, knn);
await act('save_controls', { event: { type: 'select_mode', mode: 'tutor' } });
await act('save_controls', { event: { type: 'set_tutor_enabled', enabled: false } });
const progressOf = async () => (await call(`/api/learn/progress?app=${APP}&board=${BOARD}&goalId=${knn}`)).progress;
const attemptOf = () => call(`/api/learn/tutor/attempts/${ATTEMPT}?app=${APP}&board=${BOARD}`);
const before = await progressOf();
assert.deepEqual(before.criteria.map(c => c.status), ['practising', 'not_checked']);

// --- the browser --------------------------------------------------------------------------------------------------------
const browser = await chromium.launch();
const errors = [], model = [], asks = [], reviews = [], progressReads = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const MODEL = /^\/api\/(learn\/(tutor\/(plan|evaluate)|artifact|home-ask|next-steps|voice|image|transcribe|assess)|ask$|chat$)/;
const CANNED = 'A canned answer: no model was called.';
await context.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === '/api/learn/ask' && request.method() === 'POST') {
    const body = request.postDataJSON(), n = asks.push({ body }), messageId = `m-${n}`;
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; // the Chat stream, as chat-context-pill-check.mjs fakes it
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: frame('chunk', { text: CANNED })
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'answer', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || `canvaschat-pchat-${n}`, userMessageId: `u-${n}`, messageId }) });
  }
  // CR-1 route decision (dev-cp.mjs chatRouteAnswer): an answer. CI has no JEV key, so the real route would fall back and send nothing.
  if (url.pathname === '/api/learn/chat/route' && request.method() === 'POST') return route.fulfill({ json: chatRouteAnswer(JSON.parse(route.request().postData() || '{}')) });
  // The canned thread exists only in this page: its state saves (attachments, draft) are answered here.
  if (url.pathname.includes('/threads/canvaschat-pchat-')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  if (/\/reassess$/.test(url.pathname)) reviews.push(request.postDataJSON());
  if (url.pathname === '/api/learn/progress') progressReads.push(url.searchParams.get('goalId'));
  if (MODEL.test(url.pathname) || (url.pathname === '/api/learn/journey' && request.method() === 'POST' && request.postDataJSON()?.action === 'resolve')) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const chatPane = () => page.locator('[data-chat-pane]');
const field = () => chatPane().locator('[data-chat-composer] textarea').first();
const icon = () => page.locator('[data-panel-header]').getByRole('tab', { name: 'Progress', exact: true }); // the right panel's Progress tab, after Comments (owner 2026-10-22)
const progress = () => page.locator('[data-progress-pane]');
const chips = () => chatPane().locator('[data-context-chip][data-ref-key^="progress:"]');
const box = async locator => (await locator.boundingBox()) || { x: -1, y: -1, width: 0, height: 0 };
const vote = () => progress().locator('[data-progress-skill]').first();
const openSkill = async () => {
  if (!(await progress().isVisible())) await icon().click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 15000 });
  const goal = progress().getByRole('combobox', { name: 'Learning goal' });
  if ((await goal.inputValue()) !== knn) await goal.selectOption(knn);
  await progress().locator('[data-progress-viewing]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-progress-skill]')?.textContent.includes('Explain the majority vote'), null, { timeout: 10000 });
  if ((await vote().getByRole('button').first().getAttribute('aria-expanded')) !== 'true') await vote().getByRole('button').first().click();
  await progress().locator('[data-progress-why]').waitFor({ timeout: 5000 });
};
const controls = async () => { const s = await coaching(); return [s.controls.mode, s.controls.tutorEnabled, s.activeGoalId]; };

await page.goto(`${BASE}/apps/${APP}`);
await chatPane().waitFor({ state: 'visible', timeout: 60000 });
await field().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

await check('attach_context_does_not_send: Ask tutor about this attaches a removable chip and keeps the draft, Tutor Off and the active goal; nothing is sent', async () => {
  await field().fill('my own words, unsent');
  await openSkill();
  assert.match(await chatPane().locator('[data-tutor-switch]').innerText(), /Off/, 'Tutor is selected and Off');
  const sent = asks.length;
  await progress().locator('[data-progress-ask]').click();
  await chips().first().waitFor({ timeout: 5000 });
  assert.match(await chips().first().innerText(), /Explain the majority vote/);
  assert.equal(await field().inputValue(), 'my own words, unsent', 'the written draft is kept exactly');
  assert.match(await chatPane().locator('[data-tutor-switch]').innerText(), /Off/, 'the switch is unchanged');
  assert.deepEqual(await controls(), ['tutor', false, ACTIVE], 'mode, switch and active goal unchanged on the server');
  assert.equal(asks.length, sent, 'attaching sends nothing');
  // Owner 2026-10-22: Progress is a tab of the right panel, so the question takes the learner to the Chat tab.
  assert.ok((await box(chatPane())).width > 200, 'Chat shows');
  assert.equal(await progress().isVisible(), false, 'Progress gave way to Chat');
  assert.equal(await page.locator('[data-panel-tab="chat"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'TEXTAREA', 'the composer has focus');
  await shot('pchat-01-ask-attached');
  // Removable: x takes the chip off this chat only; the draft stays.
  await chips().first().getByRole('button', { name: /Remove .* from this chat/ }).click();
  assert.equal(await chips().count(), 0);
  assert.equal(await field().inputValue(), 'my own words, unsent');
  await openSkill(); // the Progress tab kept its viewed goal and open skill
  await progress().locator('[data-progress-ask]').click();
  await chips().first().waitFor({ timeout: 5000 });
  assert.equal(await chips().count(), 1, 'attaching again adds it once');
});

await check('progress_question_does_not_assess: the question rides the existing chat with its scope; no assessment, no evaluation, no control change', async () => {
  const sent = asks.length, revision = before.summaryRevision;
  await field().fill('Why is this still practising when I picked an answer?');
  await field().press('Enter');
  for (let i = 0; i < 40 && asks.length === sent; i++) await page.waitForTimeout(250);
  assert.equal(asks.length, sent + 1, 'one Learn ask');
  const { body } = asks.at(-1);
  const ref = body.context_refs.find(r => r.kind === 'progress');
  assert.ok(ref, 'the progress scope rides as a chat ref');
  assert.deepEqual([ref.range.goalRefs[0].goalId, ref.range.criterionRefs[0].criterionId, ref.range.summaryRevision], [knn, 'vote', revision]);
  assert.deepEqual(ref.range.observationIds, before.criteria[0].evidenceIds);
  assert.equal(body.mode, 'auto', 'a Chat Tutor turn on /api/learn/ask names auto (chat-route.js askMode); the thread keeps Tutor');
  await chatPane().getByText(CANNED).first().waitFor({ timeout: 10000 });
  const { assessments } = await attemptOf();
  assert.deepEqual(assessments.map(a => a.assessmentId), [ORIGINAL.assessmentId], 'no new assessment');
  assert.equal((await progressOf()).summaryRevision, revision, 'Progress unchanged');
  assert.deepEqual(reviews, [], 'no review filed');
  assert.deepEqual(await controls(), ['tutor', false, ACTIVE]);
  await shot('pchat-02-question-answered');
});

await check('Question this feedback is a draft until Send; at Send one dispute is filed and the original result is kept', async () => {
  // The question's chip stays with the conversation; this review is its own chip.
  await openSkill();
  const filed = reviews.length;
  await progress().locator('[data-progress-question]').click();
  const review = chatPane().locator('[data-context-chip][data-ref-key^="progress:"]').filter({ hasText: 'Review' });
  await review.first().waitFor({ timeout: 5000 });
  assert.match(await review.first().innerText(), /Review · Explain the majority vote/);
  assert.equal(await field().inputValue(), 'I think this feedback missed something: ', 'an empty composer gets the offered words, unsent');
  await page.waitForTimeout(800);
  assert.equal(reviews.length, filed, 'no dispute is filed before Send');
  await shot('pchat-03-review-draft');
  await field().fill('I think this feedback missed something: option b is how it was taught in class.');
  const sent = asks.length;
  await field().press('Enter');
  for (let i = 0; i < 60 && asks.length === sent; i++) await page.waitForTimeout(250);
  assert.equal(reviews.length, filed + 1, 'one dispute at Send');
  assert.deepEqual(reviews.at(-1), { app: APP, board: BOARD, requestKey: `dispute-${ORIGINAL.assessmentId}`, dispute: true });
  const { assessments } = await attemptOf();
  assert.equal(assessments.length, 2, 'the review is a new version');
  const [original, again] = assessments;
  assert.deepEqual([original.assessmentId, original.status, original.route], [ORIGINAL.assessmentId, 'completed', 'keyed'], 'the original result is kept');
  assert.deepEqual(original.observations.map(o => [o.observationId, o.fit, o.reason]), ORIGINAL.observations.map(o => [o.observationId, o.fit, o.reason]), 'its findings unchanged');
  assert.equal(again.supersedesAssessmentId, ORIGINAL.assessmentId);
  const view = await progressOf();
  const history = view.criteria[0].evidence.map(e => [e.assessmentId, e.validity]);
  assert.deepEqual(history[0], [ORIGINAL.assessmentId, again.status === 'completed' ? 'superseded' : 'disputed'], 'the original stays in the history, labelled');
  if (again.status !== 'completed') assert.equal(view.criteria[0].status, 'needs_review');
  const ask = asks.at(-1).body.context_refs.find(r => r.kind === 'progress' && r.range.review);
  assert.deepEqual(ask.range.review, { attemptId: ATTEMPT, assessmentId: ORIGINAL.assessmentId, board: BOARD });
  // Progress reads again after the dispute (ask.jsx dispatches rh:progress-changed).
  for (let i = 0; i < 20 && !progressReads.length; i++) await page.waitForTimeout(250);
  assert.ok(progressReads.filter(id => id === knn).length >= 2, 'Progress read the goal again');
  // A second message with the review chip still attached replays the same dispute: still one review.
  await field().fill('And one more thing about it.');
  await field().press('Enter');
  for (let i = 0; i < 60 && reviews.length === filed + 1; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(1000);
  assert.equal((await attemptOf()).assessments.length, 2, 'the same key replays: no second review');
  console.log(`  review result: ${again.status}${again.reason ? ` (${again.reason})` : ''}; original history label: ${history[0][1]}`);
  await shot('pchat-04-review-sent');
});

await check('narrow screen: Ask tutor about this returns to Chat with the chip; Progress keeps its selection for reopening', async () => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(600);
  // Progress and Chat are tabs of one panel: with Progress open, Chat is behind it.
  if (await progress().isVisible()) await progress().locator('[data-progress-close]').click();
  await field().fill('a narrow draft');
  await icon().click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 15000 });
  assert.equal(await progress().getByRole('combobox', { name: 'Learning goal' }).inputValue(), knn, 'the viewed goal was kept');
  if ((await vote().getByRole('button').first().getAttribute('aria-expanded')) !== 'true') await vote().getByRole('button').first().click();
  await progress().locator('[data-progress-ask]').click();
  await page.waitForTimeout(600);
  assert.equal(await progress().isVisible(), false, 'Progress steps aside below lg');
  assert.ok(await field().isVisible(), 'Chat is back');
  assert.equal(await field().inputValue(), 'a narrow draft', 'the draft is kept');
  assert.ok((await chips().count()) >= 1);
  await shot('pchat-05-narrow-chat');
  await icon().click();
  await progress().locator('[data-progress-count]').waitFor({ timeout: 15000 });
  assert.equal(await progress().getByRole('combobox', { name: 'Learning goal' }).inputValue(), knn, 'reopening keeps the viewed goal');
  assert.deepEqual(await controls(), ['tutor', false, ACTIVE], 'still Tutor, Off, and the other goal active');
});

await check('after a dispute, the next Tutor action is not refused: one press of Resume this goal makes the viewed goal current', async () => {
  // The review stepped its activity again, two coaching revisions (learn-coaching-store.js advanceActivity): a page still on the
  // older revision has this first press refused as stale (409) and nothing happens.
  await progress().locator('[data-progress-resume]').click();
  for (let i = 0; i < 40 && (await controls())[2] !== knn; i++) await page.waitForTimeout(250);
  assert.deepEqual(await controls(), ['tutor', false, knn], 'the viewed goal is current; mode and switch unchanged');
  await progress().locator('[data-progress-viewing]').waitFor({ state: 'detached', timeout: 5000 });
});

await check('no model was asked and the page raised no error', async () => {
  assert.deepEqual(model, [], `model-capable requests: ${model.join(', ')}`);
  assert.deepEqual(errors, []);
});

await browser.close();
console.log(`${results.length}/6 checks passed`);
if (results.length !== 6) process.exit(1);
