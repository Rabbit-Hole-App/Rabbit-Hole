// Tutor Task 11 in the browser (C:/s/spec/tutor-workflow/draft.md "Table of Contents, tutoring, and progress", acceptance
// 50-55): the Table of contents beside an accepted learning path, on the LOCAL keyless stack only (real routes and local D1;
// JOURNEY_MODEL_STUB=fixtures and no model key, so no real model can run). A logistic regression path is started and
// accepted through the real journey route, and its skills accepted as the goal's criteria (Progress's Track these skills),
// then in the browser:
//   1 the current step is drawn as ONE heading and the later accepted steps are listed as Planned - material not prepared;
//     opening one shows its purpose and generates nothing; a reload adds no duplicate;
//   2 Viewing (a clicked title) is not Learning now; navigating makes no call and changes no goal or control;
//   3 a saved assessment (a keyed answer, graded in code) shows only as the linked criterion's personal badge; ticking the
//     section's checkbox changes neither, and no evidence, criterion or goal is written into the shared board;
//   4 a TOC planning request renames the heading: the badge keeps the criterion's name and the goal line stays the accepted
//     goal record (acceptance 52);
//   5 a Tutor proposal made before the learner's own rename is stale: Apply changes nothing, the learner's edit wins;
//   6 removing the current step's entry from the contents keeps its canvas heading, its cards and the saved task (Section
//     removed), and it is never redrawn (owner brief 2026-10-23: contents actions never change a canvas object);
//   7 Start/Resume follows the controls rule: in Auto it changes no control; in paused Tutor it clears the pause.
// Every model-capable request is aborted and counted; there must be none. The TOC turns are answered here with canned SSE.
// Prints `ok <label>` per check and counts only; no secrets.
// Usage: BASE=http://127.0.0.1:9371 SMALL_CP=http://127.0.0.1:9373 VARS=<stack .dev.vars> node e2e/toc-plan-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { scopeFromJourney } from '../src/learn-coaching-materials.js';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9371';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9373';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('toc-plan-check runs against the local stack only');
const SHOTS = process.argv[2] || 'toc-plan-shots';
mkdirSync(SHOTS, { recursive: true });
const varsText = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
if (/^(ANTHROPIC_API_KEY|TYPESAFE_API_KEY|VERCEL_TYPESAFE_API_KEY)=/m.test(varsText)) throw Error('toc-plan-check runs on the keyless stack only');
const secret = varsText.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `tocplan-${run}@example.com`, secret }) })).json();
if (!session) throw Error('the control plane minted no session (is the stack up with SMALL_ENV=test?)');
const api = async (path, init = {}) => {
  for (let i = 0; ; i += 1) {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (r.status >= 500 && i < 3 && (init.method || 'GET') === 'GET') continue; // the local D1 now and then answers a read with a 500
    if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${r.status} ${d.error || ''}`);
    return d;
  }
};

// ---------------------------------------------------------------- seed: notes, an accepted path and its criteria
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `TOC plan ${run}` }) });
const APP = canvas.name, card = (id, title) => ({ id, type: 'explanation', dx: 0, dy: 0, title, body: `${title}. `.repeat(6) });
await api(`/api/learn/boards/${APP}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [],
  blocks: [{ id: 'notes', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Debugging notes', done: false }, card('k-notes', 'A stack trace I kept')] } }) });
const journeyPost = body => api('/api/learn/journey', { method: 'POST', body: JSON.stringify({ app: APP, board: 'main', ...body }) });
let j = await journeyPost({ action: 'start', text: 'I want to learn logistic regression' });
for (let i = 0; i < 4 && j.journey.state !== 'path_review'; i += 1) j = await journeyPost({ action: 'cancel', revision: j.journey.revision });
j = await journeyPost({ action: 'accept', revision: j.journey.revision });
assert.equal(j.journey.state, 'active');
const coaching = async () => (await api(`/api/learn/coaching?app=${APP}&board=main`)).state;
const coachingPost = async (action, payload) => {
  const state = await coaching();
  return api('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: APP, board: 'main', actionId: crypto.randomUUID(), expectedRevision: state.revision, action, payload }) });
};
const goalId = (await coaching()).activeGoalId;
assert.equal(goalId, `lg_${j.journey.id}`);
await coachingPost('change_scope', { goalId, criteria: scopeFromJourney(j.journey, j.path) });
const goal = (await coaching()).goals.find(g => g.goalId === goalId);
const [s1, ...later] = j.path.sections;
const s1Criterion = goal.criteria.find(c => c.skillKey === s1.expected_evidence[0].claim);
assert.ok(s1Criterion, 'the first step\'s claim is an agreed criterion');
const board = async () => (await api(`/api/learn/boards/${APP}/main`)).state?.blocks || [];
// Owner brief 2026-10-23: the contents as saved - the board's own `toc` list once edited, else its headings.
const contentsSaved = async () => { const state = (await api(`/api/learn/boards/${APP}/main`)).state || {}; return Array.isArray(state.toc) ? state.toc : (state.blocks || []).filter(b => b.type === 'heading'); };
const progressOf = async () => (await api(`/api/learn/progress?app=${APP}&board=main&goalId=${goalId}`)).progress;

// ---------------------------------------------------------------- browser: count every write, answer the TOC turns
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const model = [], writes = [], asks = [], errors = [], next = [];
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const MODEL = path => ['/api/learn/artifact', '/api/learn/home-ask', '/api/ask'].includes(path) || path.startsWith('/api/learn/inline/')
  || (path.startsWith('/api/learn/tutor/') && !path.startsWith('/api/learn/tutor/attempts'));
await context.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return route.fallback();
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { body = {}; }
  if (path === '/api/learn/ask') {
    const reply = asks.push(body), plan = next.shift() || {};
    if (plan.hold) await plan.hold; // the learner edits while the Tutor answers
    const outline = plan.outline ? frame('outline', { ops: plan.outline(body), base: body.outlineRevision ?? null }) : '';
    const messageId = String(500 + reply);
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: `Canned reply ${reply}.` }) + outline
      + frame('answer_meta', { messageId, actions: [], followUps: [], alternatives: [messageId], kind: 'clarify', syllabus: null })
      + frame('done', { ok: true, threadId: body.thread_id || 'toc-thread', userMessageId: `u-${reply}`, messageId }) });
  }
  if (path === '/api/learn/coaching' || path === '/api/learn/tutor/attempts') writes.push(`${path} ${body.action || ''}`.trim());
  // The materializer records the drawn section (no planner runs for it); any other journey action could plan, so it is refused.
  if (path === '/api/learn/journey') { writes.push(`journey ${body.action}`); if (body.action !== 'section_materialized') { model.push(`journey ${body.action}`); return route.abort(); } }
  if (MODEL(path)) { model.push(`${method} ${path}`); return route.abort(); }
  return route.fallback();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const waitFor = async (test, ms = 20000) => { const end = Date.now() + ms; for (;;) { const value = await test(); if (value) return value; if (Date.now() > end) throw Error('timed out'); await page.waitForTimeout(150); } };
const tab = name => page.getByRole('tab', { name: name === 'Table of contents' ? /^Table of contents(, \d+ proposals? to review)?$/ : name, exact: name !== 'Table of contents' });
const contents = () => page.getByRole('tabpanel', { name: 'Table of contents' });
const entry = id => contents().locator(`[data-toc-entry="${id}"]`);
const steps = () => contents().locator('[data-toc-plan] [data-toc-step]');
const tocBox = () => contents().locator('[data-toc-conversation], [data-toc-ask]');
const tocField = () => tocBox().locator('[data-toc-composer] textarea').first();
const open = async () => {
  await page.goto(`${BASE}/apps/${APP}`);
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('[data-block-id="k-notes"]').waitFor({ timeout: 60000 });
  await tab('Table of contents').click();
  await entry('notes').waitFor({ timeout: 15000 });
};
async function turn(text, plan) {
  if (await contents().locator('[data-toc-start] button').count()) await contents().locator('[data-toc-start] button').click();
  await tocField().waitFor();
  next.push(plan);
  const n = asks.length;
  await tocField().fill(text);
  await tocBox().locator('[data-toc-composer] button[aria-label="Send"]').click();
  await waitFor(() => asks.length > n);
  return n + 1;
}
const settled = async reply => tocBox().getByText(`Canned reply ${reply}.`, { exact: true }).first().waitFor({ timeout: 20000 });
const titleOf = id => entry(id).locator('button[title="Double-click to edit"]').first();

let h1 = null;
await check('1 the current step is drawn as one heading; later accepted steps are Planned - material not prepared; opening one generates nothing', async () => {
  await open();
  // The journey records the drawn heading once its board is saved (section_materialized).
  h1 = await waitFor(async () => (await api(`/api/learn/journey?app=${APP}&board=main`)).journey?.section_plan?.heading_block_id, 60000);
  await entry(h1).waitFor({ timeout: 15000 });
  assert.deepEqual((await board()).filter(b => b.type === 'heading' && b.journey_section_id === s1.id).map(b => b.id), [h1], 'one heading for the step');
  await entry(h1).locator('[data-toc-learning-now]').waitFor();
  await waitFor(async () => (await steps().count()) === later.length);
  assert.deepEqual(await steps().evaluateAll(nodes => nodes.map(n => [n.dataset.tocStep, n.dataset.state])), later.map(s => [s.id, 'planned']));
  assert.equal(await steps().filter({ hasText: 'Planned — material not prepared' }).count(), later.length);
  assert.equal(await contents().locator(`[data-toc-step="${s1.id}"]`).count(), 0, 'the drawn step is not also planned');
  const before = [model.length, writes.length];
  await steps().first().locator('button').first().click();
  assert.equal(await steps().first().locator('[data-toc-step-purpose]').innerText(), later[0].purpose);
  await page.waitForTimeout(1500);
  assert.deepEqual([model.length, writes.length], before, 'opening a planned step calls nothing');
  await shot('01-planned-steps');
  await open();
  await waitFor(async () => (await steps().count()) === later.length);
  assert.equal((await board()).filter(b => b.type === 'heading' && b.journey_section_id === s1.id).length, 1, 'a reload draws no second heading');
});

await check('2 Viewing is not Learning now; navigating a title makes no call and changes no goal or control', async () => {
  const before = await coaching(), counts = [model.length, writes.length];
  await titleOf('notes').click();
  await page.locator('[data-toc-entry="notes"][data-active]').waitFor({ timeout: 10000 });
  assert.equal(await entry('notes').locator('[data-toc-learning-now]').count(), 0);
  assert.equal(await entry(h1).locator('[data-toc-learning-now]').count(), 1, 'Learning now stays on the current step');
  await page.waitForTimeout(1500);
  assert.deepEqual([model.length, writes.length], counts, 'navigation makes no call');
  const after = await coaching();
  assert.deepEqual([after.revision, after.activeGoalId, after.activeActivityId ?? null, after.controls], [before.revision, before.activeGoalId, before.activeActivityId ?? null, before.controls]);
});

const label = s1Criterion.label;
await check('3 a saved assessment is the linked criterion\'s personal badge; the checkbox changes neither, and nothing private reaches the board', async () => {
  // One keyed answer on the first step's claim (the diagnostic's p1, graded in code on the server), sent as the learner would.
  const probe = fixtureFor('journey_diagnostic', { topic: 'logistic regression' }).probes.find(p => p.id === 'p1');
  const out = await coachingPost('activate_activity', { activity: { goalId, objective: 'Recognise the vocabulary', prompt: probe.prompt, responseKind: 'choice',
    criterionRefs: [{ criterionId: s1Criterion.criterionId, version: s1Criterion.version }], sourceRefs: [{ kind: 'journey_probe', id: 'p1', version: j.journey.path_version || 1, locator: { diagnostic: true } }] } });
  const activity = out.state.activities.find(a => a.activityId === out.state.activeActivityId);
  const sent = await api('/api/learn/tutor/attempts', { method: 'POST', body: JSON.stringify({ app: APP, board: 'main', activityId: activity.activityId, activityRevision: activity.revision, submissionKey: `toc-plan-${run}`, submittedContent: { optionId: probe.key.correct }, sourceRefs: [], assistanceRefs: [] }) });
  assert.equal(sent.assessment.status, 'completed');
  const read = await progressOf(), row = read.criteria.find(c => c.criterionId === s1Criterion.criterionId);
  assert.equal(row.status, 'practising', 'a keyed answer without reasoning is practising');
  await open();
  const badge = entry(h1).locator('[data-toc-evidence]');
  await badge.waitFor({ timeout: 15000 });
  assert.equal(await badge.innerText(), `${label}: practising`);
  assert.equal(await contents().locator('[data-toc-evidence]').count(), 1, 'only the linked heading has a badge');
  assert.equal(await entry(h1).locator('input[type="checkbox"]').isChecked(), false, 'an assessment never ticks the box');
  const counts = writes.length;
  await entry(h1).locator('input[type="checkbox"]').check();
  await waitFor(async () => (await contentsSaved()).find(b => b.id === h1)?.done === true);
  assert.equal((await board()).find(b => b.id === h1)?.done ?? false, false, 'owner brief 2026-10-23: the tick is the contents\' own, the canvas heading is unchanged');
  assert.equal(await badge.innerText(), `${label}: practising`, 'the tick leaves the badge');
  const again = await progressOf();
  assert.deepEqual([again.summaryRevision, again.criteria.find(c => c.criterionId === s1Criterion.criterionId).status], [read.summaryRevision, 'practising'], 'and Progress');
  assert.equal(writes.length, counts, 'a tick sends no coaching, attempt or journey write');
  const shared = JSON.stringify([await board(), await contentsSaved()]);
  for (const secretish of ['practising', 'demonstrated', s1Criterion.criterionId, goalId, activity.activityId]) assert.ok(!shared.includes(secretish), `the board holds no ${secretish}`);
  await shot('03-evidence-badge');
  await badge.click();
  await page.locator('[data-progress-pane]').waitFor({ state: 'visible', timeout: 10000 });
  await tab('Table of contents').click();
});

await check('4 a TOC rename request changes the title only: the badge keeps the criterion\'s name and the goal line stays the accepted goal', async () => {
  const goalLine = `Goal · ${goal.label}`;
  assert.equal((await contents().locator('[data-toc-goal]').innerText()).replace(/\s+/g, ' ').trim(), goalLine);
  const reply = await turn('Rename section 1 to KNN', { outline: () => [{ op: 'retitle', id: h1, text: 'KNN' }] });
  await settled(reply);
  await waitFor(async () => (await titleOf(h1).innerText()) === 'KNN');
  assert.equal(await entry(h1).locator('[data-toc-evidence]').innerText(), `${label}: practising`, 'never relabelled as KNN');
  assert.equal((await contents().locator('[data-toc-goal]').innerText()).replace(/\s+/g, ' ').trim(), goalLine, 'a planning message never replaces the goal');
  const saved = await waitFor(async () => { const b = (await contentsSaved()).find(x => x.id === h1); return b?.text === 'KNN' && b; });
  assert.equal(saved.heading, h1, 'the entry stays linked to the step heading by id');
  // Owner brief 2026-10-23: the rename is the contents' own; the canvas heading keeps its title and its journey stamps.
  const drawn = (await board()).find(x => x.id === h1);
  assert.deepEqual([drawn.text, drawn.journey_section_id, drawn.journey_id], [s1.title, s1.id, j.journey.id], 'the step stays linked by id');
  await shot('04-renamed');
});

await check('5 a Tutor proposal made before the learner\'s own rename is stale: Apply changes nothing and the newer edit wins', async () => {
  let release;
  const hold = new Promise(go => { release = go; });
  const reply = await turn('Add distance scaling after section 1', { hold, outline: () => [{ op: 'add', level: 1, text: 'Distance scaling', after: h1 }, { op: 'retitle', id: h1, text: 'Tutor title' }] });
  // While the Tutor answers, the learner renames the target in the panel.
  await entry(h1).getByRole('button', { name: 'Edit KNN' }).click();
  await entry(h1).locator('[data-toc-editor] input[name="title"]').fill('My threshold notes');
  await entry(h1).locator('[data-toc-editor] input[name="title"]').press('Enter');
  await waitFor(async () => (await titleOf(h1).innerText()) === 'My threshold notes');
  release();
  await settled(reply);
  const card = contents().locator('[data-toc-proposal]');
  await card.waitFor({ timeout: 15000 });
  assert.match(await card.innerText(), /The contents changed since this proposal\. Ask the Tutor again\./);
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await titleOf(h1).innerText(), 'My threshold notes', 'the learner\'s edit wins');
  assert.equal(await contents().locator('[data-toc-entry]', { hasText: 'Distance scaling' }).count(), 0, 'no part of the proposal applied');
  await shot('05-stale-proposal');
  await card.getByRole('button', { name: 'Discard', exact: true }).click();
  await waitFor(async () => (await contentsSaved()).find(b => b.id === h1)?.text === 'My threshold notes');
  assert.ok(!(await contentsSaved()).some(b => b.text === 'Distance scaling' || b.text === 'Tutor title'));
  assert.ok(!(await board()).some(b => b.text === 'Distance scaling' || b.text === 'Tutor title' || b.text === 'My threshold notes'), 'the canvas gets none of it');
});

await check('6 removing the current step\'s entry keeps its canvas heading, its cards and the saved task (Section removed) and never redraws it', async () => {
  const cards = (await board()).filter(b => b.journey?.section_id === s1.id).map(b => b.id);
  assert.ok(cards.length >= 1, 'the step has cards');
  const before = await coaching(), counts = writes.length;
  await entry(h1).getByRole('button', { name: 'Remove heading My threshold notes' }).click();
  await waitFor(async () => !(await contentsSaved()).some(b => b.id === h1));
  const left = (await board()).map(b => b.id);
  assert.ok(cards.every(id => left.includes(id)), 'every card of the section stays');
  assert.ok(left.includes(h1), 'owner brief 2026-10-23: the canvas heading stays; only the contents entry went');
  const removed = contents().locator(`[data-toc-step="${s1.id}"][data-state="removed"]`);
  await removed.waitFor({ timeout: 10000 });
  assert.match(await removed.innerText(), /Section removed: its cards and your saved work are kept/);
  assert.equal(await removed.locator('[data-toc-learning-now]').count(), 1, 'still the current task, at its removed location');
  const after = await coaching();
  assert.deepEqual([after.activeActivityId, after.activities.length], [before.activeActivityId, before.activities.length], 'the saved task is kept');
  assert.equal((await progressOf()).criteria.find(c => c.criterionId === s1Criterion.criterionId).status, 'practising', 'its evidence is kept');
  // Planned steps, Progress and the TOC conversation overflow the panel here: the goal line must keep its height.
  assert.ok((await contents().locator('[data-toc-goal]').boundingBox())?.height > 10, 'the goal line is not collapsed by the overflow');
  await shot('06-section-removed');
  await open();
  await page.waitForTimeout(5000);
  assert.equal((await board()).filter(b => b.type === 'heading' && b.journey_section_id === s1.id).length, 1, 'the heading is not drawn again: still the one');
  assert.equal(await entry(h1).count(), 0, 'and it does not come back into the contents');
  assert.equal(writes.length, counts, 'no journey, coaching or attempt write');
});

await check('7 Start/Resume follows the controls rule: Auto keeps every control; in paused Tutor it clears the pause; no call either way', async () => {
  const resume = () => contents().locator('[data-toc-resume]').first();
  const auto = await coaching(), calls = model.length;
  assert.equal(auto.controls.mode, 'auto');
  await resume().click();
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);
  assert.deepEqual((await coaching()).controls, auto.controls, 'in Auto nothing changes');
  await coachingPost('save_controls', { event: { type: 'select_mode', mode: 'tutor' } });
  await coachingPost('save_controls', { event: { type: 'not_now' } });
  assert.deepEqual([(await coaching()).controls.mode, (await coaching()).controls.suggestionsPaused], ['tutor', true]);
  await open();
  await resume().click();
  await waitFor(async () => (await coaching()).controls.suggestionsPaused === false);
  const controls = (await coaching()).controls;
  assert.deepEqual([controls.mode, controls.tutorEnabled], ['tutor', true], 'mode and On stay');
  await page.waitForTimeout(1500);
  assert.equal(model.length, calls, 'no model call');
});

await browser.close();
assert.deepEqual(model, [], 'no model-capable request');
assert.deepEqual(errors, [], 'no page error');
console.log(`toc-plan-check: ${results.length}/7 passed; model-capable requests ${model.length}; TOC turns ${asks.length}`);
