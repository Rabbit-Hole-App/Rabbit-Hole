// One complete saved Tutor learning loop (C:/s/spec/tutor-workflow/draft.md Slice A, owner decision 7a; Tasks 05-09 and
// 07), against the LOCAL keyless stack only, with real persistence (local D1) and stubbed models (JOURNEY_MODEL_STUB=fixtures,
// no model key bound). A learning path on logistic regression is started and accepted through the real journey route (the
// product's existing start, which journey-check covers in the browser); then, in the browser:
//   choose the goal's skills in Progress -> start the next activity (a planned keyed check: existing material) -> answer it
//   and press Check my answer (the only submit) -> the keyed assessment, graded in code -> Progress reads the saved result ->
//   reload -> Progress and the activity's feedback again -> a second signed-in browser context reads the same Progress.
// Every model-capable request is aborted and counted, and none may happen; the attempts route makes no model call for a
// keyed answer. Prints no secrets.
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
const errors = [], model = [], attempts = [];
const MODEL = (path, method) => path === '/api/learn/ask' || path === '/api/learn/artifact' || path === '/api/learn/home-ask' || path === '/api/ask'
  || (path.startsWith('/api/learn/tutor/') && !path.startsWith('/api/learn/tutor/attempts'));
async function learner(label) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: label === 'second' ? await sessionFor() : session, url: BASE }]);
  await context.route('**/api/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (MODEL(url.pathname, request.method())) { model.push(`${label} ${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.pathname === '/api/learn/tutor/attempts' && request.method() === 'POST') attempts.push(label);
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
  await card(a.page).getByRole('radio', { name: probe.options.find(o => o.id === probe.key.correct).label }).check();
  await a.page.waitForTimeout(500);
  assert.equal(attempts.length, 0, 'an answer is not a submission until Check my answer');
  await card(a.page).locator('[data-tutor-check]').click();
  await card(a.page).locator('[data-tutor-feedback]').filter({ hasText: /Correct/ }).waitFor({ timeout: 20000 });
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
  assert.deepEqual((await progressRead()).summaryRevision, saved.summaryRevision, 'the read model is unchanged by reading it');
  await shot(b.page, 'loop-06-second-context');
  await b.context.close();
});

assert.deepEqual(model, [], `no model request: ${model.join()}`);
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`attempts submitted: ${attempts.length}`);
console.log(`PASS ${results.length}/6 checks`);
await browser.close();
