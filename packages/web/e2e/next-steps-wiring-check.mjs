// Professor Next Steps, the page wiring (docs/features/professor-next-steps.md §1.4, §1.6, §1.7), in a real browser against the
// LOCAL stack only: local D1 and fresh browser profiles. No model is called: the hook sets come from the stack's keyless planner
// fixtures (JOURNEY_MODEL_STUB=fixtures), every model route the page could reach is answered or refused here (the Tutor plan,
// the repository handoff, evaluate, Learn chat, materials, voice), and the stack's provider tripwire (e2e/provider-tripwire.js)
// must count no provider request. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/next-steps-wiring-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('next-steps-wiring-check runs against the local stack only');
const SHOTS = process.argv[2] || 'next-steps-wiring-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const owner = { session: await sessionFor(`pnsw-owner-${run}@example.com`) };
const viewer = { session: await sessionFor(`pnsw-viewer-${run}@example.org`) };
const late = { session: await sessionFor(`pnsw-late-${run}@example.org`) };
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const board = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
const canvasWith = async (title, blocks) => {
  const made = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  assert.equal((await api(owner, `/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: board(blocks), version: 0 }) })).status, 200);
  return made.name;
};
const tripwire = async origin => { const r = await fetch(`${origin}/__provider-tripwire`); if (!(r.headers.get('content-type') || '').includes('json')) throw Error(`${origin} runs without the provider tripwire (e2e/tripwire-*-worker.js)`); return (await r.json()).hits.length; };
const providerBefore = await tripwire(BASE) + await tripwire(CP);

// ---- three canvases: a plain owned one (the hooks, a click, the dive suggestion), a project one (the handoff), a shared one ----
const BREAD = await canvasWith(`Bread baking ${run}`, [
  { id: 'b1', type: 'explanation', dx: 0, dy: 0, title: 'Why bread dough rises', body: 'Yeast ferments sugars and the gas is trapped by gluten.' },
  { id: 'b2', type: 'explanation', dx: 0, dy: 0, title: 'What kneading changes', body: 'Kneading aligns gluten strands into a stretchy network.' },
]);
const REPO = await canvasWith(`Reading nanoGPT ${run}`, [{ id: 'r1', type: 'explanation', dx: 0, dy: 0, title: 'Causal masking', body: 'Each token may attend only to itself and the tokens before it.' }]);
const TIDES = await canvasWith(`Tides ${run}`, [
  { id: 't1', type: 'explanation', dx: 0, dy: 0, title: 'Why the Moon pulls the sea', body: 'The Moon pulls the near side of the ocean more strongly than the Earth as a whole.' },
  { id: 't2', type: 'quiz', dx: 0, dy: 0, question: 'How many high tides most coasts see a day?', options: [{ key: 'A', text: 'Two', correct: true }, { key: 'B', text: 'One' }], why: 'There is a bulge on each side of the Earth.', choice: null },
]);
const token = (await api(owner, `/api/learn/boards/${TIDES}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: board((await api(owner, `/api/learn/boards/${TIDES}/main`)).body.state.blocks) }) })).body.sharing.view;
const ownerBoard = async () => JSON.stringify((await api(owner, `/api/learn/boards/${TIDES}/main`)).body.state);
const sharedBefore = await ownerBoard();

// ---- the browser: every model route answered or refused here ----
const CLICK_REPLY = 'A warm room speeds the yeast up, so the gas comes faster.';
const OPENING_REPLY = 'Here is where the carried question goes first.';
const ANSWER = 'The mask is built once in `CausalSelfAttention.__init__`:\n\n```python\nself.register_buffer("bias", torch.tril(torch.ones(T, T)))\n```\n\nSources: model.py:39-41';
const plans = [], handoffs = [], refused = [];
const plan = text => ({ strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text }] });
const browser = await chromium.launch();
const errors = [];
const contextFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.route('**/api/learn/tutor/plan', route => {
    const body = route.request().postDataJSON();
    plans.push(body);
    const intent = body?.context?.learner_intent || {};
    // A typed question on the project canvas hands off to the repository reader; a hook (clicked or carried) gets words.
    if (intent.kind === 'next_step') return route.fulfill({ json: plan(plans.filter(p => p.context?.learner_intent?.kind === 'next_step').length === 1 ? CLICK_REPLY : OPENING_REPLY) });
    return route.fulfill({ json: { ...plan('Let me read the source for that.'), actions: [{ type: 'respond_text', text: 'Let me read the source for that.' }, { type: 'handoff', capability: 'repository_context', request: 'Where is the causal mask built in model.py?' }] } });
  });
  await context.route('**/api/learn/tutor/handoff', route => { handoffs.push(route.request().postDataJSON()); return route.fulfill({ json: { answer: ANSWER, telemetry: { outcome: 'ok', served_model: 'stub-reader', prompt_version: 'stub' } } }); });
  await context.route(/\/api\/(learn\/(ask|home-ask|artifact|tts|voice\/|assess|transcribe|image|video|scene|grade|tutor\/evaluate)|chat)/, route => { refused.push(new URL(route.request().url()).pathname); return route.abort(); });
  await context.route(/\/api\/learn\/boards\/shared\/[^/]+\/ask$/, route => { refused.push('shared ask'); return route.abort(); });
  // The project canvas reads a repository (canvasRepository: a canvas with a project), so its Tutor may hand off: its app row gets one.
  await context.route(`**/api/apps/${REPO}`, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, json: { ...(await response.json()), project: 'repo-pnsw-demo' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const sets = [];
const watchSets = page => page.on('response', async response => {
  if (response.request().method() === 'POST' && /\/api\/learn\/(tutor|boards\/shared\/[^/]+)\/next-steps$/.test(new URL(response.url()).pathname)) sets.push({ path: new URL(response.url()).pathname, status: response.status(), body: await response.json().catch(() => null) });
});
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let page;
const shot = async name => { await page.mouse.move(1300, 420); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const hooks = () => page.locator('[data-next-steps] [data-next-step]').allInnerTexts();
const ready = () => page.locator('[data-next-steps="ready"]').waitFor({ timeout: 60000 });
const last = path => [...sets].reverse().find(entry => entry.path === path)?.body;
const composer = () => page.locator('[data-learn-dock] [data-chat-composer] textarea, [data-learn-dock] [data-chat-composer] input:not([type="file"])').first();

// ---- owned canvas ----
({ page } = await contextFor(owner));
watchSets(page);
await page.goto(`${BASE}/apps/${BREAD}`);
await ready();
await check('1 owned canvas: the card shows exactly the 3 hooks of the set, verbatim and in order', async () => {
  const set = last('/api/learn/tutor/next-steps');
  assert.equal(set?.options?.length, 3);
  assert.deepEqual(await hooks(), set.options.map(option => option.hook));
  assert.equal(await page.locator('[data-next-steps] h2').innerText(), 'Curious where this goes?');
  const text = await page.locator('[data-next-steps]').innerText();
  for (const option of set.options) for (const hidden of [option.selected_next_step.learning_goal, option.selected_next_step.basis]) assert.ok(!text.includes(hidden), 'nothing from selected_next_step but the hook');
});
await shot('01-owned-hooks');
await check('2 no set is asked for on hover, pan, zoom or a click on the canvas', async () => {
  await page.waitForTimeout(1500);
  const before = sets.length;
  const surface = page.locator('[data-canvas-surface]');
  const box = await surface.boundingBox();
  const b2 = await page.locator('[data-block-id="b2"]').boundingBox();
  await page.mouse.click(b2.x + b2.width / 2, b2.y + 14); // selects a card
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('[data-next-step]').first().hover();
  await page.mouse.move(box.x + box.width - 80, box.y + 120);
  await page.mouse.wheel(0, 240);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
  await page.mouse.click(box.x + box.width - 60, box.y + 60);
  await page.waitForTimeout(2000);
  assert.equal(sets.length, before, `${sets.length - before} new hook request(s)`);
});
await page.getByTitle('Reset zoom').click(); // back to 100% for the screenshots
const clicked = (await hooks())[0];
const plansBefore = plans.length;
await page.locator('[data-next-step]').first().click();
await page.locator('[data-step-chip]').waitFor({ timeout: 30000 });
await page.getByText(CLICK_REPLY).waitFor({ timeout: 30000 });
await check('3 a click is one next_step Tutor turn: the step as data, no learner words, no evidence, no Learn chat, the composer untouched', async () => {
  const turn = plans.slice(plansBefore);
  assert.equal(turn.length, 1);
  const intent = turn[0].context.learner_intent;
  assert.deepEqual([intent.kind, intent.raw_user_message, intent.selected_next_step.hook], ['next_step', '', clicked]);
  assert.deepEqual(refused, [], 'no evaluate, Learn chat or material request');
  assert.equal(await composer().inputValue(), '');
  assert.equal(await page.locator('[data-step-chip]').innerText(), clicked);
});
await page.locator('[data-next-steps="ready"] [data-next-step]').first().waitFor({ timeout: 60000 });
await check('4 the finished turn brings a new set; the clicked hook stays only as the chip', async () => {
  await page.waitForFunction(() => document.querySelectorAll('[data-next-steps="ready"] [data-next-step]').length === 3);
  const now = await hooks();
  assert.equal(now.length, 3);
  assert.ok(!now.includes(clicked));
  assert.deepEqual(now, last('/api/learn/tutor/next-steps').options.map(option => option.hook));
});
await shot('02-owned-click-turn');
await check('5 the Tutor\'s Rabbit Hole suggestion draws inside tutor.extras in the dock, never floating over a plain canvas', async () => {
  // The event executeActions sends for a suggest_dive action (LearnTutor.jsx suggestDive): a plain canvas has no claims, so no
  // planner row offers one; the card is the same either way.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId: 'b2', topic: 'Gluten networks' } })));
  await page.locator('[data-tutor-extras] [data-dive-suggestion]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-dive-suggestion]').count(), 1);
});
await shot('03-owned-suggestion-in-extras');
await check('6 a review board mounts no hooks: no card and no set request', async () => {
  const before = sets.length;
  await page.goto(`${BASE}/apps/${BREAD}?board=demo`);
  await page.locator('[data-block-id]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  assert.equal(await page.locator('[data-next-steps]').count(), 0);
  assert.equal(sets.length, before);
});
await check('7 ?board=main is a review board of its own: never the real main board row, journey or Tutor store (owner decision 3)', async () => {
  const fresh = await page.context().newPage(); // a new tab: its sessionStorage starts empty
  const seen = [];
  fresh.on('request', request => seen.push(new URL(request.url()).pathname + new URL(request.url()).search));
  await fresh.goto(`${BASE}/apps/${BREAD}?board=main`);
  await fresh.getByText('No review board is registered as').waitFor({ timeout: 60000 });
  await fresh.waitForTimeout(4000);
  const realRow = new RegExp(`^/api/learn/boards/${BREAD}/main(/|\\?|$)`);
  assert.deepEqual(seen.filter(path => realRow.test(path) || (path.startsWith('/api/learn/journey?') && /[?&]board=main(&|$)/.test(path))), []);
  assert.ok(seen.some(path => path.startsWith(`/api/learn/boards/${BREAD}/review-main`)), 'its own board row');
  assert.ok(seen.some(path => path.startsWith('/api/learn/journey?') && path.includes('board=review-main')), 'its own journey');
  assert.deepEqual(await fresh.evaluate(() => Object.keys(sessionStorage).filter(key => key.endsWith('|main'))), [], 'no Tutor store of the real main board');
  await fresh.close();
});

// ---- the repository handoff answer in the dock ----
await page.goto(`${BASE}/apps/${REPO}`);
await composer().waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);
await composer().fill('Where is the causal mask built?');
await composer().press('Enter');
// The Sources line is drawn as evidence pills (ask.jsx SourcesLine), so its text is the file reference.
await page.locator('[data-chat-sheet] [aria-label="Answer evidence"]', { hasText: 'model.py:39-41' }).waitFor({ timeout: 30000 });
await check('8 a handoff answer is the Tutor reply in the dock: markdown, code and its Sources line as evidence', async () => {
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].capability, 'repository_context');
  const sheet = page.locator('[data-chat-sheet]');
  assert.ok(await sheet.locator('pre, code').count() > 0);
  assert.match(await sheet.innerText(), /Let me read the source for that\.[\s\S]*CausalSelfAttention[\s\S]*model\.py:39-41/);
});
await shot('04-dock-handoff-answer');
await page.context().close();

// ---- shared canvas: a signed-in viewer ----
({ page } = await contextFor(viewer));
watchSets(page);
await page.goto(`${BASE}/b/${token}`);
await ready();
const sharedSet = last(`/api/learn/boards/shared/${token}/next-steps`);
await check('9 shared canvas: the same card with the 3 shared hooks, verbatim and in order', async () => {
  assert.deepEqual(await hooks(), sharedSet.options.map(option => option.hook));
  assert.ok(sharedSet.options.every(option => option.selected_next_step.scope === 'shared'));
});
await shot('05-shared-hooks');
const sharedClicked = (await hooks())[0];
const beforeHole = plans.length;
await page.locator('[data-next-step]').first().click();
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 30000 });
await page.locator('[data-step-chip]').waitFor({ timeout: 60000 });
await page.getByText(OPENING_REPLY).waitFor({ timeout: 30000 });
await check('10 a shared hook starts the viewer\'s private hole, whose first Tutor turn opens on that hook once, as the step', async () => {
  const opening = plans.slice(beforeHole).filter(p => p.context?.learner_intent?.kind === 'next_step');
  assert.equal(opening.length, 1);
  assert.deepEqual([opening[0].context.learner_intent.raw_user_message, opening[0].context.learner_intent.selected_next_step.hook], ['', sharedClicked]);
  assert.equal(await page.locator('[data-step-chip]').innerText(), sharedClicked);
  assert.equal(await composer().inputValue(), '');
  assert.equal(await ownerBoard(), sharedBefore, 'the shared board is unchanged');
});
await shot('06-carried-hook-opening');
await check('11 the carried hook is taken once: a reload of the hole sends no second opening', async () => {
  await page.reload();
  await page.locator('[data-learn-dock]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(5000);
  assert.equal(plans.slice(beforeHole).filter(p => p.context?.learner_intent?.kind === 'next_step').length, 1);
});
await page.context().close();

// ---- shared canvas: signed out, then back from sign-in ----
({ page } = await contextFor(null));
watchSets(page);
await page.goto(`${BASE}/b/${token}`);
await ready();
const lateClicked = (await hooks())[1];
const lateId = await page.locator('[data-next-step]').nth(1).getAttribute('data-next-step');
await page.locator('[data-next-step]').nth(1).click();
await page.waitForURL(/\/login\?next=/, { timeout: 30000 });
const next = new URL(page.url()).searchParams.get('next');
await check('12 signed out, the hook waits through sign-in for this link: ?rabbit=root&hook=<id>, the step kept in this tab', async () => {
  assert.equal(new URLSearchParams(next.split('?')[1]).get('hook'), lateId);
  assert.equal(new URLSearchParams(next.split('?')[1]).get('rabbit'), 'root');
  assert.ok(await page.evaluate(() => !!sessionStorage.getItem('small.next-step.pending')));
});
await page.context().addCookies([{ name: 'small_session', value: late.session, url: BASE }]);
const beforeLate = plans.length;
await page.goto(`${BASE}${next}`);
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 30000 });
await page.locator('[data-step-chip]').waitFor({ timeout: 60000 });
await check('13 back from sign-in, the kept step starts the hole and opens it, once', async () => {
  const opening = plans.slice(beforeLate).filter(p => p.context?.learner_intent?.kind === 'next_step');
  assert.equal(opening.length, 1);
  assert.equal(opening[0].context.learner_intent.selected_next_step.hook, lateClicked);
  assert.ok(await page.evaluate(() => !sessionStorage.getItem('small.next-step.pending')), 'taken once');
});
await shot('07-after-sign-in-opening');
await check('14 no provider request (tripwire) and no page errors', async () => {
  assert.equal(await tripwire(BASE) + await tripwire(CP) - providerBefore, 0);
  assert.deepEqual(errors, []);
});
await browser.close();
console.log(`provider tripwire hits: ${await tripwire(BASE) + await tripwire(CP)}`);
console.log(`${results.length}/14 checks passed`);
process.exit(results.length === 14 ? 0 : 1);
