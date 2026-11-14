// Professor Next Steps, the page wiring (docs/features/professor-next-steps.md §1.4, §1.6, §1.7), in a real browser against the
// LOCAL stack only: local D1 and fresh browser profiles. No model is called: the hook sets come from the stack's keyless planner
// fixtures (JOURNEY_MODEL_STUB=fixtures), every model route the page could reach is answered or refused here (the chat route and
// Learn ask are answered; plan, evaluate, handoff, materials and voice are refused), and the stack's provider tripwire
// (e2e/provider-tripwire.js) must count no provider request. Since Tutor cleanup P2 a hook click is an ordinary Chat turn. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 node e2e/next-steps-wiring-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mockChatRoute } from './dev-cp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('next-steps-wiring-check runs against the local stack only');
const SHOTS = process.argv[2] || 'next-steps-wiring-shots';
mkdirSync(SHOTS, { recursive: true });
// VARS names the stack's control-plane .dev.vars (the keyless local stack writes its own).
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
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

// ---- two canvases: a plain owned one (the hooks, a click), a shared one ----
const BREAD = await canvasWith(`Bread baking ${run}`, [
  { id: 'b1', type: 'explanation', dx: 0, dy: 0, title: 'Why bread dough rises', body: 'Yeast ferments sugars and the gas is trapped by gluten.' },
  { id: 'b2', type: 'explanation', dx: 0, dy: 0, title: 'What kneading changes', body: 'Kneading aligns gluten strands into a stretchy network.' },
]);
const TIDES = await canvasWith(`Tides ${run}`, [
  { id: 't1', type: 'explanation', dx: 0, dy: 0, title: 'Why the Moon pulls the sea', body: 'The Moon pulls the near side of the ocean more strongly than the Earth as a whole.' },
  { id: 't2', type: 'quiz', dx: 0, dy: 0, question: 'How many high tides most coasts see a day?', options: [{ key: 'A', text: 'Two', correct: true }, { key: 'B', text: 'One' }], why: 'There is a bulge on each side of the Earth.', choice: null },
]);
const token = (await api(owner, `/api/learn/boards/${TIDES}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: board((await api(owner, `/api/learn/boards/${TIDES}/main`)).body.state.blocks) }) })).body.sharing.view;
const ownerBoard = async () => JSON.stringify((await api(owner, `/api/learn/boards/${TIDES}/main`)).body.state);
const sharedBefore = await ownerBoard();

// ---- the browser: every model route answered or refused here ----
const CLICK_REPLY = 'A warm room speeds the yeast up, so the gas comes faster.';
const asks = [], refused = [];
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const TOTAL = 13;
const browser = await chromium.launch();
const errors = [];
const contextFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  // Nothing in the browser calls the Tutor routes any more (Tutor cleanup P2): a request to one is refused, and fails a check below.
  await context.route(/\/api\/(learn\/(home-ask|artifact|tts|voice\/|assess|transcribe|image|video|scene|grade|tutor\/(plan|evaluate|handoff))|chat)/, route => { refused.push(new URL(route.request().url()).pathname); return route.abort(); });
  await context.route(/\/api\/learn\/boards\/shared\/[^/]+\/ask$/, route => { refused.push('shared ask'); return route.abort(); });
  // A plain Auto or Ask turn asks the chat route first, then posts /api/learn/ask as server-sent events. Registered after the catch-all.
  await mockChatRoute(context);
  await context.route('**/api/learn/ask', route => {
    asks.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: CLICK_REPLY }) + frame('done', { ok: true, threadId: `pnsw-thread-${asks.length}`, messageId: `pnsw-m-${asks.length}` }) });
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
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
// Since Tutor cleanup P2 a clicked hook is an ordinary user turn in the Chat pane (ask.jsx sendStep calls send(hook)); the step chip
// belongs to the retired Tutor turn, so stepChips is only used to assert it is absent.
const stepChips = hook => page.locator('[data-chat-pane] [data-step-chip]').filter({ hasText: hook });
const chatReplies = text => page.locator('[data-chat-pane] [data-answer]').filter({ hasText: text });
const replyCards = text => page.locator('[data-block-id]').filter({ hasText: text });

// ---- owned canvas ----
// Owner decision 3a (2026-10-20): hooks are proactive suggestions - only in selected, enabled, unpaused Tutor, never on open. The
// owner picks Tutor (its saved canvas control), opening asks nothing, and since Tutor cleanup P2 the first set comes from the
// card's explicit Suggest (a finished Chat turn no longer brings it).
{
  const { body } = await api(owner, `/api/learn/coaching?app=${BREAD}&board=main`);
  assert.equal((await api(owner, '/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: BREAD, board: 'main', actionId: `tutor-${run}`, expectedRevision: body.state.revision, action: 'save_controls', payload: { event: { type: 'select_mode', mode: 'tutor' } } }) })).status, 200);
}
({ page } = await contextFor(owner));
watchSets(page);
await page.goto(`${BASE}/apps/${BREAD}`);
await composer().waitFor({ timeout: 60000 });
await page.waitForTimeout(4000); // past the 1200 ms hook debounce
await check('0 opening a canvas in Tutor On asks for no hooks (owner 3a); Suggest brings the first set', async () => {
  assert.equal(sets.length, 0, 'no set on open');
  // Owner ruling 2026-10-21 (View > Curious on must visibly show): at rest, Curious's empty state with Suggest, no hook card.
  assert.equal(await page.locator('[data-next-step]').count(), 0, 'no hook card at rest');
  assert.equal(await page.locator('[data-next-steps]:not([data-next-steps="empty"])').count(), 0, 'no set card at rest');
  await page.locator('[data-hooks-slot] section[data-next-steps="empty"]').getByRole('button', { name: 'Suggest next steps' }).click({ timeout: 5000 });
});
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
const asksBefore = asks.length;
await page.locator('[data-next-step]').first().click();
await chatReplies(CLICK_REPLY).first().waitFor({ timeout: 30000 });
await check('3 a click is one plain Chat turn: the hook sentence is the message, nothing else rides with it, no plan, evaluate or handoff', async () => {
  const turn = asks.slice(asksBefore);
  assert.equal(turn.length, 1);
  assert.equal(turn[0].message, clicked);
  assert.ok(!JSON.stringify(turn[0]).includes('selected_next_step'), 'no selected_next_step payload');
  assert.deepEqual(refused, [], 'no plan, evaluate, handoff or material request');
  assert.equal(await composer().inputValue(), '');
  assert.equal(await stepChips(clicked).count(), 0, 'no step chip: the hook is an ordinary user turn');
  assert.equal(await page.locator('[data-chat-pane] [data-user-turn]').filter({ hasText: clicked }).count(), 1, 'the hook sentence once, as the learner\'s turn');
  assert.equal(await chatReplies(CLICK_REPLY).count(), 1, 'the reply once, under it');
  assert.equal(await replyCards(CLICK_REPLY).count(), 0, 'no canvas card (chat shell 8fa30fcd)');
});
// ponytail: the old check 4 (a finished Tutor turn brings a new set without the clicked hook) is not rewritten; with no Tutor a
// turn is no trigger, so a new set now comes only from a canvas change, Refresh or Suggest.
await shot('02-owned-click-turn');
await check('5 no Tutor extras: a Rabbit Hole suggestion event draws nothing and the dock has no extras', async () => {
  // 'small:dive-suggest', [data-dive-suggestion] and [data-tutor-extras] left with the browser Tutor (Tutor cleanup P2).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId: 'b2', topic: 'Gluten networks' } })));
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('[data-dive-suggestion], [data-tutor-extras]').count(), 0);
});
await check('6 a review board mounts no hooks: no card and no set request', async () => {
  const before = sets.length;
  await page.goto(`${BASE}/apps/${BREAD}?board=demo`);
  await page.locator('[data-block-id]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);
  assert.equal(await page.locator('[data-next-steps]').count(), 0);
  assert.equal(sets.length, before);
});
await check('7 ?board=main is a review board of its own: never the real main board row or a saved store of it (owner decision 3)', async () => {
  const fresh = await page.context().newPage(); // a new tab: its sessionStorage starts empty
  const seen = [];
  fresh.on('request', request => seen.push(new URL(request.url()).pathname + new URL(request.url()).search));
  await fresh.goto(`${BASE}/apps/${BREAD}?board=main`);
  await fresh.getByText('No review board is registered as').waitFor({ timeout: 60000 });
  await fresh.waitForTimeout(4000);
  const realRow = new RegExp(`^/api/learn/boards/${BREAD}/main(/|\\?|$)`);
  assert.deepEqual(seen.filter(path => realRow.test(path)), []);
  assert.ok(seen.some(path => path.startsWith(`/api/learn/boards/${BREAD}/review-main`)), 'its own board row');
  assert.deepEqual(await fresh.evaluate(() => Object.keys(sessionStorage).filter(key => key.endsWith('|main'))), [], 'no Tutor store of the real main board');
  await fresh.close();
});

// ---- shared canvas: a signed-in viewer ----
({ page } = await contextFor(viewer));
watchSets(page);
await page.goto(`${BASE}/b/${token}`);
// Owner priority 1 (2026-10-21, "/b Next steps charging credits automatically"): opening the link reads the saved set only;
// with none it is idle and the card offers Suggest, the viewer's explicit (charged) ask.
await page.locator('[data-next-steps="empty"]').waitFor({ timeout: 60000 });
const viewed = last(`/api/learn/boards/shared/${token}/next-steps`);
await page.locator('[data-next-steps-request]').click();
await ready();
const sharedSet = last(`/api/learn/boards/shared/${token}/next-steps`);
await check('9 shared canvas: opening the link generates nothing (idle, Suggest); on Suggest, the same card with the 3 shared hooks, verbatim and in order', async () => {
  assert.deepEqual(viewed, { idle: true });
  assert.deepEqual(await hooks(), sharedSet.options.map(option => option.hook));
  assert.ok(sharedSet.options.every(option => option.selected_next_step.scope === 'shared'));
});
await shot('05-shared-hooks');
const sharedClicked = (await hooks())[0];
const asksBeforeHole = asks.length;
await page.locator('[data-next-step]').first().click();
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 30000 });
// Tutor cleanup P2: a new hole sends no opening question and shows no waiting prompt; the carried hook is not a turn.
await page.locator('[data-chat-pane]').waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
await check('10 a shared hook starts the viewer\'s private hole, which sends no opening turn and shows no waiting prompt', async () => {
  assert.equal(asks.length, asksBeforeHole, 'no Chat turn');
  assert.equal(await page.locator('[data-tutor-opening-waiting]').count(), 0, 'no waiting prompt');
  assert.equal(await stepChips(sharedClicked).count(), 0, 'no step chip');
  assert.equal(await composer().inputValue(), '');
  assert.deepEqual(refused, [], 'no plan, evaluate or handoff request');
  assert.equal(await ownerBoard(), sharedBefore, 'the shared board is unchanged');
});
await shot('06-hole-after-shared-hook');
await check('11 a reload of the hole still sends nothing', async () => {
  await page.reload();
  await page.locator('[data-chat-pane]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(5000);
  assert.equal(asks.length, asksBeforeHole);
  assert.equal(await page.locator('[data-tutor-opening-waiting]').count(), 0);
});
await page.context().close();

// ---- shared canvas: signed out, then signed in (owner R3 decision, 2026-10-16: no AI generation for signed-out viewers) ----
({ page } = await contextFor(null));
watchSets(page);
const signedOutHooks = [];
page.on('request', request => { if (/\/next-steps$/.test(new URL(request.url()).pathname)) signedOutHooks.push(request.url()); });
await page.goto(`${BASE}/b/${token}`);
await page.locator('[data-shared-ask] [data-chat-composer]').waitFor({ timeout: 60000 });
// Opened after the signed-out page, a signed-in page has asked for its hooks: the signed-out one had as long, and asked nothing.
const { page: signedInPage } = await contextFor(viewer);
const asked = signedInPage.waitForRequest(request => request.method() === 'POST' && /\/next-steps$/.test(new URL(request.url()).pathname), { timeout: 60000 });
await signedInPage.goto(`${BASE}/b/${token}`);
await asked;
await signedInPage.context().close();
await check('12 signed out, the shared page asks for no hooks and shows none', async () => {
  assert.deepEqual(signedOutHooks, []);
  assert.equal(await page.locator('[data-next-steps]').count(), 0);
});
await page.context().addCookies([{ name: 'small_session', value: late.session, url: BASE }]);
const asksBeforeLate = asks.length;
await page.reload();
await ready();
const lateClicked = (await hooks())[1];
await page.locator('[data-next-step]').nth(1).click();
await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 30000 });
await page.locator('[data-chat-pane]').waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
await check('13 once signed in, the same page shows the hooks, and one starts the hole and sends nothing', async () => {
  assert.equal(asks.length, asksBeforeLate, 'no Chat turn');
  assert.deepEqual([await stepChips(lateClicked).count(), await page.locator('[data-tutor-opening-waiting]').count(), await composer().inputValue()], [0, 0, ''], 'no step chip, no waiting prompt, an untouched composer');
  assert.deepEqual(refused, [], 'no plan, evaluate or handoff request');
  assert.ok(await page.evaluate(() => !sessionStorage.getItem('small.next-step.pending')), 'nothing left pending');
});
await shot('07-after-sign-in-hole');
await check('14 no provider request (tripwire) and no page errors', async () => {
  assert.equal(await tripwire(BASE) + await tripwire(CP) - providerBefore, 0);
  assert.deepEqual(errors, []);
});
await browser.close();
console.log(`provider tripwire hits: ${await tripwire(BASE) + await tripwire(CP)}`);
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
