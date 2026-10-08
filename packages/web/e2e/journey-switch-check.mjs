// The owner decisions of 2026-10-07 (docs/features/professor-next-steps.md §4.5, §1.8 item 7) in a real browser, against the
// KEYLESS local stack only: (a) a tray answer advances the tray, (b) a side question in an open tray gets a Tutor answer while
// the tray stays open, (c) the Tutor-offered Start a learning path chip switches subject during setup through the
// continue-or-start confirmation and keeps the canvas, (d) Continue keeps the setup, (e) a replacement start that fails keeps
// the setup, (f) typing alone never replaces the journey, (g) a review board (?board=) is its own. The Tutor planner
// (/api/learn/tutor/plan) and the Learn chat are answered here; the journey route runs on the stack (JOURNEY_MODEL_STUB=fixtures,
// so rule 5 is the fixture resolver) except the two replace starts (e) and D2 fail. No model call: the stack's provider tripwire count must be 0.
// Usage: BASE=http://127.0.0.1:8898 SMALL_CP=http://127.0.0.1:8899 VARS=<stack cp/.dev.vars> node e2e/journey-switch-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { assertKeyless, defaultAppVars } from './keyless-guard.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8898';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8899';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('journey-switch-check runs against the local stack only');
const VARS = process.env.VARS;
if (!VARS) throw Error('VARS=<the local stack control plane .dev.vars> is required');
assertKeyless({ who: 'journey-switch-check', vars: VARS, appVars: defaultAppVars(VARS) });
const SHOTS = process.argv[2] || 'journey-switch-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pnsj-${run}@example.com`, secret }) })).json()).session;
if (!session) throw Error('no session (is the stack up with SMALL_ENV=test?)');
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return r.json(); };
const who = await api('/api/apps');
const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Journey switch ${run}` }) })).name;
const journeyOf = (board = 'main') => api(`/api/learn/journey?app=${canvas}&board=${board}`);
const INK = `small.adaptive-canvas:${who.org}:${who.email}:${canvas}:ink`;
const KEPT = { id: 'kept-note', type: 'explanation', dx: 0, dy: 0, title: 'My own notes', body: 'A card the learner made before any path: a subject switch must keep it.' };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [KEPT] };
const CANNED = 'A canned Tutor answer from journey-switch-check: no model was called.';
const SSE = `event: chunk\ndata: ${JSON.stringify({ text: CANNED })}\n\nevent: done\ndata: {}\n\n`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, state]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state)); }, [INK, STATE]);
// The Tutor planner: a canned respond_text; words registered with offer() also carry a suggest_journey offer, in setup too.
const offers = new Map();
await context.route('**/api/learn/tutor/plan', route => {
  const body = route.request().postDataJSON(), subject = offers.get(body?.context?.learner_intent?.raw_user_message);
  return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: CANNED }, ...(subject ? [{ type: 'suggest_journey', request: subject }] : [])] } });
});
await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: SSE }));
await context.route('**/api/learn/home-ask', route => route.fulfill({ json: { answer: CANNED, references: [], offer_rabbit_hole: false } }));
await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image)|chat)/, route => route.abort());
// (e): the next replace start fails as a database error would (HTTP 500), before it reaches the stack. D2: the next one
// answers as the route answers a staged replacement whose planner failed (the fixtures cannot fail; the route's staging is
// test/learn-journey-route.test.js D2): 502 with the board's journey as it is, still live.
let failNext = false, planFailNext = false;
await context.route('**/api/learn/journey', async route => {
  const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
  if (failNext && body?.action === 'start' && body.replace) { failNext = false; return route.fulfill({ status: 500, json: { error: 'D1_ERROR' } }); }
  if (planFailNext && body?.action === 'start' && body.replace) { planFailNext = false; return route.fulfill({ status: 502, json: { error: 'The planner failed. Try again.', ...(await journeyOf(body.board)) } }); }
  return route.continue();
});
const net = [], errors = [];
const watch = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const { pathname, search } = new URL(request.url());
    if (!pathname.startsWith('/api/learn/')) return;
    let body = null; try { body = request.postDataJSON(); } catch { /* not JSON */ }
    net.push({ method: request.method(), path: pathname, search, body });
  });
};
const posts = (path, from = 0) => net.slice(from).filter(e => e.method === 'POST' && e.path === path);
const actions = (from = 0) => posts('/api/learn/journey', from).map(e => e.body?.action);
let page = await context.newPage();
watch(page);
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const composer = () => page.locator('[data-learn-dock] [data-chat-composer] :is(textarea, input:not([type="file"]))').first();
const send = async text => { await composer().fill(text); await composer().press('Enter'); };
const tray = () => page.evaluate(() => {
  const t = document.querySelector('[data-tutor-prompt-tray]');
  return t && { mode: t.dataset.mode || null, label: t.getAttribute('aria-label'), busy: !!t.querySelector('[data-tray-busy]'), error: t.querySelector('[data-tray-error]')?.textContent || null,
    options: [...t.querySelectorAll('[data-tray-option]')].map(b => b.textContent) };
});
const settled = async (test, arg = null, timeout = 20000) => { await page.waitForFunction(test, arg, { timeout }); await page.waitForTimeout(400); return tray(); };
const trayIs = (mode, label = null) => settled(([m, l]) => { const t = document.querySelector('[data-tutor-prompt-tray]'); return !!t && !t.querySelector('[data-tray-busy]') && t.dataset.mode === m && (l == null || t.getAttribute('aria-label') === l); }, [mode, label]);
const waitFor = async (ok, what, timeout = 20000) => { for (const end = Date.now() + timeout; !(await ok());) { if (Date.now() > end) throw Error(`timed out: ${what}`); await page.waitForTimeout(250); } };
const answers = () => page.getByText(CANNED).count();
const chip = () => page.getByRole('button', { name: 'Start a learning path' }).last();
const kept = async () => (await page.locator(`[data-block-id="${KEPT.id}"]`).count()) === 1
  && (await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.some(b => b.id === 'kept-note'), INK));
// Type the words, wait for the Tutor's answer and its chip.
const offered = async (words, subject = 'SQL') => {
  offers.set(words, subject);
  const before = await answers();
  await send(words);
  await waitFor(async () => (await answers()) > before && (await chip().isVisible()), 'the Tutor answer with its chip');
};

await page.goto(`${BASE}/apps/${canvas}?tab=learn`);
await composer().waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
// Precondition: a setup journey started the one way a canvas starts one, the chip (Task 11b fix B1).
await offered('I want to learn logistic regression', 'logistic regression');
offers.clear();
await chip().click();
let goal = await trayIs('intent_intake');
const first = (await journeyOf()).journey;
assert.deepEqual([first.state, first.request.topic, await kept()], ['intake', 'logistic regression', true]);

await check('b a side question in the open tray gets a Tutor answer; the tray stays open and unadvanced', async () => {
  const from = net.length, before = await answers();
  await send('What is a sigmoid?');
  await waitFor(async () => (await answers()) > before, 'the Tutor answer');
  const plan = posts('/api/learn/tutor/plan', from);
  assert.deepEqual(actions(from), ['resolve'], 'rule 5 only: no journey write');
  assert.equal(plan.length, 1);
  assert.equal(plan[0].body.context.journey_context.phase, 'setup');
  assert.ok(await page.locator('[data-chat-sheet]').isVisible(), 'answered in the chat sheet');
  assert.deepEqual(await tray(), goal, 'the same tray, still open and answerable');
  assert.equal((await journeyOf()).journey.revision, first.revision);
});
await shot('1-side-question-tray-open');

await check('a typing an option of the open tray answers it and the tray advances', async () => {
  const from = net.length;
  await send(goal.options[0]);
  const next = await settled(([l]) => { const t = document.querySelector('[data-tutor-prompt-tray]'); return !!t && !t.querySelector('[data-tray-busy]') && t.getAttribute('aria-label') !== l; }, [goal.label]);
  assert.deepEqual(actions(from), ['intake_answer']);
  assert.equal(posts('/api/learn/tutor/plan', from).length, 0, 'a tray answer is never a Tutor plan');
  assert.equal(next.mode, 'intent_intake');
  assert.equal((await journeyOf()).journey.intake.slots.goal, 'intuition');
  goal = next;
});

await check('f typing a new subject during setup starts nothing; the Tutor offers the chip', async () => {
  const from = net.length;
  await offered('Teach me SQL instead');
  const plan = posts('/api/learn/tutor/plan', from).at(-1).body.context;
  assert.deepEqual(plan.allowed_actions, ['respond_text', 'suggest_journey'], 'setup: words and the learning-path offer');
  assert.deepEqual(actions(from), ['resolve'], 'no start, no archive');
  const now = (await journeyOf()).journey;
  assert.deepEqual([now.id, now.request.topic, now.state], [first.id, 'logistic regression', 'intake']);
  assert.deepEqual(await tray(), goal);
});
await shot('2-setup-chip');

await check('c-confirm the chip asks for confirmation naming the current and the proposed subjects', async () => {
  const from = net.length;
  await chip().click();
  const confirm = await trayIs('clarification');
  assert.deepEqual([confirm.label, confirm.options], ['Continue logistic regression or start sql?', ['Continue logistic regression', 'Start sql']]);
  assert.deepEqual(actions(from), ['start'], 'the chip is the existing journey start; the setup journey answers 409');
  assert.equal((await journeyOf()).journey.id, first.id);
});
await shot('3-confirmation');

await check('d Continue keeps the current setup and sends nothing', async () => {
  const from = net.length;
  await page.locator('[data-tray-option="continue"]').click();
  assert.deepEqual(await trayIs('intent_intake', goal.label), goal);
  assert.deepEqual(actions(from), []);
  const now = (await journeyOf()).journey;
  assert.deepEqual([now.id, now.revision], [first.id, first.revision + 1]);
});
await shot('4-declined-setup-kept');

await check('e a replacement start that fails keeps the setup and says so', async () => {
  await offered('Teach me SQL instead');
  await chip().click();
  await trayIs('clarification');
  failNext = true;
  const from = net.length;
  await page.locator('[data-tray-option="start_new"]').click();
  const shown = await settled(() => !!document.querySelector('[data-tutor-prompt-tray] [data-tray-error]'));
  assert.deepEqual(actions(from), ['start']);
  assert.equal(posts('/api/learn/journey', from)[0].body.replace, first.id);
  assert.deepEqual([shown.mode, shown.label, shown.options], [goal.mode, goal.label, goal.options], 'the setup tray, still answerable');
  assert.match(shown.error, /^Could not start sql, so logistic regression stays as it was\./);
  const now = (await journeyOf()).journey;
  assert.deepEqual([now.id, now.state, now.revision], [first.id, 'intake', first.revision + 1]);
});
await shot('5-failed-switch-setup-kept');

let second = null;
await check('c Start in the confirmation starts the new setup and keeps the canvas', async () => {
  await offered('Teach me SQL instead');
  await chip().click();
  await trayIs('clarification');
  const from = net.length;
  await page.locator('[data-tray-option="start_new"]').click();
  await trayIs('intent_intake', 'What do you want to be able to do with sql?');
  assert.deepEqual(actions(from), ['start']);
  assert.equal(posts('/api/learn/journey', from)[0].body.replace, first.id);
  second = (await journeyOf()).journey;
  assert.notEqual(second.id, first.id);
  assert.deepEqual([second.state, second.request.topic], ['intake', 'sql']);
  assert.ok(await kept(), 'the card made before the switch is still on the canvas and in its saved copy');
});
await shot('6-new-setup-canvas-kept');

// D2 (owner 2026-10-07, option A): a skip-setup replacement that fails to plan keeps the old journey, setup or active, with
// Try again; Try again (the real route: staged, planned, swapped) replaces it, and the canvas keeps everything.
const sectionOf = id => page.evaluate(([key, jid]) => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).filter(b => b.journey?.journey_id === jid || b.journey_id === jid).length, [INK, id]);
async function failedThenRetried(id, words, topic, old, tray) {
  await offered(words, `${topic}, skip setup and just start`);
  await chip().click();
  const confirm = await trayIs('clarification');
  assert.equal(confirm.label, `Continue ${old.request.topic} or start ${topic}?`, id);
  planFailNext = true;
  let from = net.length;
  await page.locator('[data-tray-option="start_new"]').click();
  const shown = await settled(() => !!document.querySelector('[data-tutor-prompt-tray] [data-tray-error]'));
  assert.equal(posts('/api/learn/journey', from)[0].body.replace, old.id, id);
  assert.ok(shown.error.startsWith(`Could not start ${topic}, so ${old.request.topic} stays as it was.`), id);
  assert.deepEqual([shown.mode, shown.options], tray ? [tray.mode, tray.options] : [null, []], `${id}: the old tray, still answerable`);
  const kept_ = (await journeyOf()).journey;
  assert.deepEqual([kept_.id, kept_.state, kept_.revision], [old.id, old.state, old.revision], `${id}: the old journey, unchanged`);
  await shot(`${id}-failed-plan-kept`);
  from = net.length;
  await page.locator('[data-tray-retry]').click();
  await waitFor(async () => (await journeyOf()).journey?.request.topic === topic, `${id}: the replacement`);
  const made = (await journeyOf()).journey;
  await waitFor(async () => (await sectionOf(made.id)) >= 4 && !!(await journeyOf()).journey.section_plan?.heading_block_id, `${id}: section 1 drawn and recorded`, 30000);
  const now = (await journeyOf()).journey;
  assert.deepEqual(posts('/api/learn/journey', from).filter(e => e.body.action === 'start').map(e => e.body.replace), [old.id], `${id}: Try again is the same replace start`);
  assert.deepEqual([now.state, now.section_plan?.section_id], ['active', 's1'], id);
  assert.ok(await kept(), `${id}: the learner card is kept`);
  return now;
}

let third = null, latest = null, oldBlocks = 0;
await check('D2-setup a skip-setup replacement that fails to plan keeps the setup; Try again replaces it', async () => {
  await page.locator('[data-tray-option="intuition"]').click();
  const tray_ = await trayIs('intent_intake', 'How familiar are you with sql?');
  third = await failedThenRetried('D2-setup', 'Can we do joins instead and skip setup?', 'joins', (await journeyOf()).journey, tray_);
  oldBlocks = await sectionOf(third.id);
});
await shot('D2-setup-retried-replaced');

await check('D2-active a skip-setup replacement of an active journey that fails to plan keeps it and its section; Try again replaces it', async () => {
  assert.equal(await page.locator('[data-tutor-prompt-tray]').count(), 0, 'an active journey: no tray');
  const from = net.length;
  latest = await failedThenRetried('D2-active', 'Could we switch to indexes and skip setup?', 'indexes', (await journeyOf()).journey, null);
  assert.equal(await sectionOf(third.id), oldBlocks, "the replaced journey's section stays on the canvas");
  assert.ok(posts('/api/learn/tutor/plan', from).length >= 1);
});
await shot('D2-active-retried-replaced');

await check('g a review board is its own: its Tutor, journey and session store never touch the main board', async () => {
  await page.close();
  page = await context.newPage(); // a fresh tab: sessionStorage starts empty
  watch(page);
  const from = net.length;
  await page.goto(`${BASE}/apps/${canvas}?tab=learn&board=pnsreview`);
  await composer().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-tutor-prompt-tray]').count(), 0, 'the main board setup tray is not here');
  assert.ok(net.slice(from).some(e => e.method === 'GET' && e.path === '/api/learn/journey' && e.search.includes('board=pnsreview')));
  await offered('I want to learn graphs', 'graphs');
  await chip().click();
  await trayIs('intent_intake', 'What do you want to be able to do with graphs?');
  const writes = posts('/api/learn/journey', from);
  assert.ok(writes.length >= 1 && writes.every(e => e.body.board === 'pnsreview'), 'every journey write names the review board');
  assert.ok(posts('/api/learn/tutor/plan', from).length >= 1);
  const review = (await journeyOf('pnsreview')).journey, main = (await journeyOf()).journey;
  assert.deepEqual([review.request.topic, main.id, main.revision, main.request.topic], ['graphs', latest.id, latest.revision, 'indexes'], 'the main board journey is untouched');
  const keys = await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('small.tutor:')));
  assert.ok(keys.length >= 1, 'the review board Tutor stored its session');
  assert.deepEqual(keys.filter(k => k.includes('|main') || [first, second, third, latest].some(j => k.includes(j.id))), [], `no store of the main board: ${keys.join(', ')}`);
  assert.equal(await page.locator(`[data-block-id="${KEPT.id}"]`).count(), 0, 'the review board canvas is not the main board canvas');
});
await shot('7-review-board-own-journey');

await check('no model call: the provider tripwire counts 0 on the app (with its in-process control plane) and on the control plane', async () => {
  const counts = [];
  for (const origin of [BASE, CP]) counts.push((await (await fetch(`${origin}/__provider-tripwire`)).json()).hits.length);
  console.log('provider tripwire', counts.join(' / '));
  assert.deepEqual(counts, [0, 0]);
});
await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/12 checks passed`);
process.exit(results.length === 12 ? 0 : 1);
