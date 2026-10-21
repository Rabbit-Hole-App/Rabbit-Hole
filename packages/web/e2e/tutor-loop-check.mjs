// One complete saved Tutor learning loop (C:/s/spec/tutor-workflow/draft.md Slice A, owner decision 7a; Tasks 05-09 and
// 07), against the LOCAL keyless stack only, with real persistence (local D1) and stubbed models (JOURNEY_MODEL_STUB=fixtures,
// no model key bound). A learning path on logistic regression is started and accepted through the real journey route (the
// product's existing start, which journey-check covers in the browser); then, in the browser:
//   choose the goal's skills in Progress -> start the next activity (a planned keyed check: existing material) -> answer it
//   and press Check my answer (the only submit) -> the keyed assessment, graded in code -> Progress reads the saved result ->
//   reload -> Progress and the activity's feedback again -> a second signed-in browser context reads the same Progress.
// Tutor T8 adds, on the same canvas: a submit lost on the network keeps the answer and its retry reuses the submission key;
// a reply that still reads pending is followed to the final feedback (GET, no model); and two Tutor turns whose plans are
// answered in the page (no model): "Teach me KNN instead" on this logistic regression path in Auto is answered as an aside,
// never evaluated against the path, the plan's unrequested follow-up question dropped (ruling Q5) and its learning-path offer
// kept; the same plan in Tutor On keeps the question.
// Every other model-capable request is aborted and counted, and none may happen; the attempts route makes no model call for
// a keyed answer. Prints no secrets.
// Usage: BASE=http://127.0.0.1:9291 SMALL_CP=http://127.0.0.1:9293 VARS=<stack .dev.vars> node e2e/tutor-loop-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9291';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9293';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('tutor-loop-check runs against the local stack only');
const SHOTS = process.argv[2] || 'tutor-loop-shots';
mkdirSync(SHOTS, { recursive: true });
const varsText = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
if (/^(ANTHROPIC_API_KEY|TYPESAFE_API_KEY|VERCEL_TYPESAFE_API_KEY)=/m.test(varsText)) throw Error('tutor-loop-check runs on the keyless stack only');
const secret = varsText.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const EMAIL = `tutorloop-${Date.now().toString(36)}@example.com`;
const sessionFor = async () => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const session = await sessionFor();
if (!session) throw Error('the control plane minted no session (is the stack up with SMALL_ENV=test?)');
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};

// The learning path: start, skip the intake and the diagnostic (its keyed probes stay unanswered, usable as practice checks),
// accept the drafted path. Fixture planners only.
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Tutor loop ${Date.now().toString(36)}` }) });
const journeyPost = body => api('/api/learn/journey', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', ...body }) });
let j = await journeyPost({ action: 'start', text: 'I want to learn logistic regression' });
for (let i = 0; i < 4 && j.journey.state !== 'path_review'; i += 1) j = await journeyPost({ action: 'cancel', revision: j.journey.revision });
assert.equal(j.journey.state, 'path_review', `the path is drafted (state ${j.journey.state})`);
j = await journeyPost({ action: 'accept', revision: j.journey.revision });
assert.equal(j.journey.state, 'active');
const coachingOf = async () => (await api(`/api/learn/coaching?app=${canvas.name}&board=main`)).state;
const goalId = (await coachingOf()).activeGoalId;
assert.equal(goalId, `lg_${j.journey.id}`, 'the journey is the learner\'s active goal');
// The keyed check the loop answers: the diagnostic's transfer probe on the first claim, and its right option (the key stays on
// the server; the check reads the fixture's own definition, never the browser copy).
const probe = fixtureFor('journey_diagnostic', { topic: 'logistic regression' }).probes.find(p => p.id === 'p1');

const browser = await chromium.launch();
const errors = [], model = [], attempts = [], keys = [], reads = [], plans = [], hooks = [];
// net: what the next requests meet (T8): failSubmit aborts the next attempts POST at the network; pendingSubmit lets it save
// and makes its reply read pending; plan answers the Tutor's plan request in the page (a canned plan, not a model).
const net = { failSubmit: false, pendingSubmit: false, plan: null };
const MODEL = (path, method) => path === '/api/learn/ask' || path === '/api/learn/artifact' || path === '/api/learn/home-ask' || path === '/api/ask'
  || (path.startsWith('/api/learn/tutor/') && !path.startsWith('/api/learn/tutor/attempts'));
async function learner(label) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: label === 'second' ? await sessionFor() : session, url: BASE }]);
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/learn/tutor/plan' && net.plan) { plans.push(request.postDataJSON()); return route.fulfill({ json: net.plan }); }
    if (url.pathname === '/api/learn/tutor/next-steps') { hooks.push(label); return route.abort(); } // hooks after a Tutor On turn: gated, counted apart
    if (MODEL(url.pathname, request.method())) { model.push(`${label} ${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.pathname.startsWith('/api/learn/tutor/attempts/') && request.method() === 'GET') reads.push(label);
    if (url.pathname === '/api/learn/tutor/attempts' && request.method() === 'POST') {
      keys.push(request.postDataJSON().submissionKey);
      if (net.failSubmit) { net.failSubmit = false; return route.abort('internetdisconnected'); }
      attempts.push(label);
      if (net.pendingSubmit) {
        net.pendingSubmit = false;
        const response = await route.fetch(), body = await response.json();
        return route.fulfill({ response, json: { ...body, assessment: { ...body.assessment, status: 'pending' } } });
      }
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  return { context, page };
}
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const chatPane = page => page.locator('[data-chat-pane]');
const progress = page => page.locator('[data-progress-pane]');
const card = page => page.locator('[data-tutor-activity-card]');
const open = async page => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await chatPane(page).waitFor({ state: 'visible', timeout: 60000 });
  await chatPane(page).locator('[data-chat-composer] textarea').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
};
const openProgress = async page => {
  if (!(await progress(page).isVisible().catch(() => false))) await chatPane(page).getByRole('button', { name: 'Progress', exact: true }).click();
  await progress(page).locator('[data-progress-count], [data-progress-empty]').first().waitFor({ timeout: 15000 });
};
const skills = page => progress(page).locator('[data-progress-skill]').evaluateAll(nodes => nodes.map(node => node.dataset.progressSkill));

const a = await learner('first');
let scope = [];
await check('choose the goal: Progress shows the learning path\'s goal and asks to track its skills; accepting saves them', async () => {
  await open(a.page);
  await openProgress(a.page);
  assert.match(await progress(a.page).getByRole('combobox', { name: 'Learning goal' }).locator('option:checked').innerText(), /logistic regression/i);
  const next = progress(a.page).locator('[data-progress-activity="accept_scope"]');
  await next.waitFor({ timeout: 10000 });
  await shot(a.page, 'loop-01-track-skills');
  await next.locator('[data-progress-accept-scope]').click();
  await progress(a.page).locator('[data-progress-skill]').first().waitFor({ timeout: 15000 });
  scope = (await coachingOf()).goals.find(goal => goal.goalId === goalId).criteria;
  assert.ok(scope.length >= 2, `criteria saved (${scope.length})`);
  assert.ok((await skills(a.page)).every(status => status === 'not_checked'), 'nothing is checked yet');
  assert.match(await progress(a.page).locator('[data-progress-count]').innerText(), new RegExp(`0\\s*of ${scope.length}`));
});

await check('do an activity: the next step is the path\'s own keyed check; starting it saves the activity and shows it above the composer', async () => {
  const next = progress(a.page).locator('[data-progress-activity="existing_check"]');
  await next.waitFor({ timeout: 10000 });
  await next.locator('[data-progress-try-activity]').click();
  await card(a.page).waitFor({ timeout: 15000 });
  assert.equal(await card(a.page).getAttribute('data-tutor-activity-card'), 'in_progress');
  assert.match(await card(a.page).innerText(), new RegExp(probe.prompt.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const state = await coachingOf();
  const activity = state.activities.find(x => x.activityId === state.activeActivityId);
  assert.deepEqual([activity.status, activity.responseKind, activity.sourceRefs[0].id], ['in_progress', 'choice', 'p1']);
  assert.equal(attempts.length, 0, 'starting an activity submits nothing');
  await shot(a.page, 'loop-02-activity');
});

await check('explicitly submit: choosing an option submits nothing; Check my answer saves one attempt, graded in code, with honest feedback', async () => {
  const right = probe.options.find(o => o.id === probe.key.correct).label;
  await card(a.page).getByRole('radio', { name: right }).check();
  await a.page.waitForTimeout(500);
  assert.equal(attempts.length, 0, 'an answer is not a submission until Check my answer');
  // T8: the first Check my answer is lost on the network; the answer stays and says it was not saved.
  net.failSubmit = true;
  await card(a.page).locator('[data-tutor-check]').click();
  await card(a.page).locator('[data-tutor-feedback][role="alert"]').filter({ hasText: /not saved/ }).waitFor({ timeout: 20000 });
  assert.equal(await card(a.page).getByRole('radio', { name: right }).isChecked(), true, 'a failed save never clears the answer');
  const unsaved = await coachingOf();
  assert.equal(unsaved.activities.find(x => x.activityId === unsaved.activeActivityId).status, 'in_progress', 'nothing was saved');
  await shot(a.page, 'loop-03a-not-saved');
  // The retry saves, with the same submission key; its reply reads pending, and the card follows it to the final feedback.
  net.pendingSubmit = true;
  await card(a.page).locator('[data-tutor-check]').click();
  await card(a.page).locator('[data-tutor-feedback]').filter({ hasText: /Checking it/ }).waitFor({ timeout: 20000 });
  await shot(a.page, 'loop-03b-pending');
  await card(a.page).locator('[data-tutor-feedback]').filter({ hasText: /Correct/ }).waitFor({ timeout: 20000 });
  assert.deepEqual([keys.length, keys[1] === keys[0], /^sub-/.test(keys[0])], [2, true, true], 'the retry reuses the submission key');
  assert.ok(reads.length >= 1, 'the pending feedback was read again with GET');
  assert.match(await card(a.page).locator('[data-tutor-feedback]').innerText(), /Explain why in your own words/, 'a right option shows no reasoning yet');
  assert.equal(attempts.length, 1);
  await a.page.locator('[data-tutor-activity-card="feedback_ready"]').waitFor({ timeout: 15000 });
  await shot(a.page, 'loop-03-feedback');
});

const first = scope[0];
const progressRead = async () => (await api(`/api/learn/progress?app=${canvas.name}&board=main&goalId=${goalId}`)).progress;
let saved = null;
await check('assess and read Progress: the skill moves from Not checked to Practising (reasoning not shown yet), counted once, nothing pending', async () => {
  const row = progress(a.page).locator('[data-progress-skill]').first();
  await progress(a.page).locator('[data-progress-skill="practising"]').first().waitFor({ timeout: 15000 });
  assert.match(await row.innerText(), new RegExp(`${first.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*Practising`));
  await row.getByRole('button').click();
  assert.match(await progress(a.page).locator('[data-progress-why]').innerText(), /partly there[\s\S]*Based on 1 saved answer/);
  assert.equal(await progress(a.page).locator('[data-progress-pending]').count(), 0);
  saved = await progressRead();
  assert.deepEqual([saved.criteria[0].status, saved.criteria[0].evidenceIds.length, saved.pendingAssessments], ['practising', 1, []]);
  assert.equal(saved.criteria[0].evidence[0].application, 'applied', 'the transfer probe applies the idea to a new case');
  // The next step uses the answer: the same skill again, now as a question to explain (the check is not offered twice).
  const next = progress(a.page).locator('[data-progress-activity="requirement"]');
  await next.waitFor({ timeout: 10000 });
  assert.ok((await next.innerText()).includes(first.label), 'the same skill');
  await shot(a.page, 'loop-04-progress');
});

await check('reload: Progress, the activity and its feedback come back from saved state, with no new submission', async () => {
  await a.page.reload();
  await chatPane(a.page).waitFor({ state: 'visible', timeout: 60000 });
  await card(a.page).locator('[data-tutor-feedback]').filter({ hasText: /Correct/ }).waitFor({ timeout: 20000 });
  const right = probe.options.find(o => o.id === probe.key.correct).label;
  assert.equal(await card(a.page).getByRole('radio', { name: right }).isChecked(), true, 'the accepted submission is shown');
  await openProgress(a.page);
  await progress(a.page).locator('[data-progress-skill="practising"]').first().waitFor({ timeout: 15000 });
  assert.deepEqual(await skills(a.page), saved.criteria.map(c => c.status));
  assert.equal(attempts.length, 1);
  await shot(a.page, 'loop-05-reloaded');
});

await check('a second signed-in browser context reads the same Progress and the same activity feedback', async () => {
  const b = await learner('second');
  await open(b.page);
  await openProgress(b.page);
  await progress(b.page).locator('[data-progress-skill="practising"]').first().waitFor({ timeout: 15000 });
  assert.deepEqual(await skills(b.page), saved.criteria.map(c => c.status));
  assert.match(await progress(b.page).locator('[data-progress-count]').innerText(), new RegExp(`0\\s*of ${scope.length}`));
  await card(b.page).locator('[data-tutor-feedback]').filter({ hasText: /Correct/ }).waitFor({ timeout: 20000 });
  assert.equal(await card(b.page).getByRole('radio', { name: probe.options.find(o => o.id === probe.key.correct).label }).isChecked(), true, 'the accepted submission is shown on the other device');
  assert.deepEqual((await progressRead()).summaryRevision, saved.summaryRevision, 'the read model is unchanged by reading it');
  await shot(b.page, 'loop-06-second-context');
  await b.context.close();
});

// ---- T8: the journey exit and ruling Q5 on the same canvas (plans answered in the page, never a model) ----
const ANSWER = 'K-nearest neighbours labels a point by the classes of the k closest points.';
const QUESTION = 'Which class would three neighbours pick here?';
const claim = Object.keys(j.journey.registry.claims)[0];
net.plan = { strategy: 'socrates', constraints_add: [], actions: [{ type: 'respond_text', text: ANSWER }, { type: 'ask_question', text: QUESTION, claim, purpose: 'diagnose' }, { type: 'suggest_journey', request: 'KNN' }] };
const journeyNow = async () => (await api(`/api/learn/journey?app=${canvas.name}&board=main`)).journey;
const composer = page => chatPane(page).locator('[data-chat-composer] textarea').first();
const say = async (page, text) => { await composer(page).fill(text); await composer(page).press('Enter'); };
await check('journey exit and Q5 in Auto: a new subject is answered, never evaluated against the path; the unrequested question is dropped, the path offer kept', async () => {
  const before = await journeyNow(), sent = plans.length;
  assert.equal((await coachingOf()).controls.mode, 'auto', 'Auto, the default');
  await say(a.page, 'Teach me KNN instead');
  await a.page.getByText(ANSWER).first().waitFor({ timeout: 30000 });
  await a.page.waitForTimeout(1500);
  assert.equal(plans.length, sent + 1, 'one plan request');
  assert.equal(await a.page.getByText(QUESTION).count(), 0, 'no unrequested follow-up question in Auto');
  assert.equal(await a.page.getByRole('button', { name: 'Start a learning path' }).count(), 1, 'the learning-path offer answers the request');
  const after = await journeyNow();
  assert.deepEqual([after.id, after.state, after.active_section_id, after.evidence.events.length], [before.id, before.state, before.active_section_id, before.evidence.events.length], 'the path is untouched: nothing was graded against it');
  assert.equal(hooks.length, 0, 'no hooks in Auto');
  await shot(a.page, 'loop-07-exit-auto');
});

await check('Q5 in Tutor On: the same plan keeps its follow-up question', async () => {
  await chatPane(a.page).getByRole('button', { name: 'Mode', exact: true }).click();
  await a.page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
  await a.page.waitForTimeout(800);
  const controls = (await coachingOf()).controls;
  assert.deepEqual([controls.mode, controls.tutorEnabled, controls.suggestionsPaused], ['tutor', true, false]);
  await say(a.page, 'And how does it choose k?');
  await a.page.getByText(QUESTION).first().waitFor({ timeout: 30000 });
  await shot(a.page, 'loop-08-question-tutor-on');
});

assert.deepEqual(model, [], `no model request: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`attempts submitted: ${attempts.length}; submit keys sent: ${keys.length}; attempt reads: ${reads.length}; plans answered in the page: ${plans.length}; hook requests (Tutor On, aborted): ${hooks.length}`);
console.log(`PASS ${results.length}/8 checks`);
await browser.close();
