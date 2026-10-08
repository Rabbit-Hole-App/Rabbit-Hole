// Start Rabbit Hole from a shared canvas (docs/features/shared-canvas-rabbit-hole.md), the owner's fourteen cases, against
// the LOCAL stack only: it writes to local D1 and fresh browser profiles. No model is called: the Tutor's planner request is
// answered in the browser, and the stack's provider tripwire (e2e/provider-tripwire.js) must count no provider request. Two unrelated shared
// canvases prove the behaviour is generic: a root start on one, a selected-card start on the other (a different card
// type), through the same code.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/shared-rabbit-hole-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('shared-rabbit-hole-check runs against a local stack only');
const SHOTS = process.argv[2] || 'shared-rabbit-hole-shots';
mkdirSync(SHOTS, { recursive: true });
// TEST_BYPASS_SECRET in the environment (another local stack, e.g. e2e/journey-local-stack.md) wins over the file.
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`rh-owner-${run}@example.com`) }, viewer = { session: await sessionFor(`rh-viewer-${run}@example.org`) };
const call = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
const api = async (who, path, init) => { const response = await call(who, path, init); return { status: response.status, body: await response.json().catch(() => null) }; };

// ---- two unrelated shared canvases, both public links ----
const shareCanvas = async (title, blocks) => {
  const canvas = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  const state = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] };
  const shared = (await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state }) })).body;
  return { canvas, token: shared.sharing.view, title };
};
const kitchen = await shareCanvas('Kitchen chemistry', [
  { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
  { id: 'k-quiz', type: 'quiz', dx: 0, dy: 0, question: 'What does salt do to the freezing point of water?', options: [{ key: 'A', text: 'Lowers it', correct: true }, { key: 'B', text: 'Raises it' }], why: 'Dissolved particles get in the way of the crystal forming.', choice: null },
]);
const bridges = await shareCanvas('Bridge loads', [
  { id: 'b-cards', type: 'flashcards', dx: 0, dy: 0, cards: [{ front: 'What is a truss?', back: 'A frame of triangles that carries load as tension and compression.' }, { front: 'Where is the bending moment largest?', back: 'At mid-span, for a simply supported beam under a uniform load.' }] },
]);
const ownerBoard = async source => JSON.stringify((await api(owner, `/api/learn/boards/${source.canvas.name}/main`)).body);
const sharedView = async source => (await api(null, `/api/learn/boards/shared/${source.token}`)).body;
const ownerThreads = async source => ((await api(owner, `/api/ask/threads?scope=learn&ref=${source.canvas.name}`)).body?.threads || []).length;
// The owner's canvases as a viewer could affect them: updated_at is left out, because the owner's own board edit below
// ("Later addition") is a meaningful change that moves it (docs/features/canvas-metadata.md).
const ownerCanvases = async () => JSON.stringify((await api(owner, '/api/canvases')).body.canvases.map(({ updated_at, ...canvas }) => canvas));
const before = { kitchen: await ownerBoard(kitchen), bridges: await ownerBoard(bridges), threads: await ownerThreads(kitchen), canvases: await ownerCanvases() };

// The proof that nothing reached a model provider: a missing API key is not isolation (a keyless worker still calls the
// provider, unauthenticated), so the stack must run behind the provider tripwire, and this check reads its count.
const providerCalls = async () => {
  const response = await fetch(`${BASE}/__provider-tripwire`);
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw Error('the stack runs without the provider tripwire: start its workers through e2e/tripwire-*-worker.js (e2e/provider-tripwire.js)');
  return (await response.json()).hits;
};
const providerBefore = (await providerCalls()).length;
const plans = [], hooks = [];
const browser = await chromium.launch();
const errors = [];
const contextFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  // A new hole's opening question is a Tutor turn; its plan is answered here, as next-steps-check and journey-check do.
  await context.route('**/api/learn/tutor/plan', route => { plans.push(route.request().url()); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }); });
  // Professor Next Steps (#46) asks its hook planner when a canvas opens; on a stack without the fixture model that planner
  // would call the provider, so the hook request is answered here too, with the server's own unavailable reply
  // (learn-next-steps-routes.js), what these pages got before the tripwire. next-steps-check owns the hooks themselves.
  await context.route(/\/api\/learn\/(?:tutor|boards\/shared\/[^/]+)\/next-steps$/, route => { hooks.push(route.request().url()); return route.fulfill({ status: 502, json: { error: 'The next steps planner is unavailable' } }); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let page;
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const openShared = async source => { await page.goto(`${BASE}/b/${source.token}`); await page.locator('[data-start-rabbit-hole]').waitFor({ timeout: 30000 }); await page.waitForTimeout(1200); };
// A view-only canvas: the click lands on the canvas surface, which selects the card under it.
const clickCard = async id => { const box = await page.locator(`[data-block-id="${id}"]`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + Math.min(40, box.height / 2)); await page.waitForTimeout(300); };
const holeOf = url => new URL(url).pathname.match(/^\/apps\/(canvas-[a-f0-9]{8})$/)?.[1];
const tree = async (who, hole) => (await api(who, `/api/canvases/dives?app=${hole}&board=main`));
// The hole opens on its anchor card: a card on the canvas, never only the page title.
const anchorCard = () => page.locator('[data-block-id]', { hasText: 'Started from' }).first();
const anchor = text => page.locator('[data-block-id]', { hasText: text }).first().waitFor({ timeout: 20000 });

({ page } = await contextFor(viewer));
await openShared(kitchen);
await check('1 the shared viewer shows Start Rabbit Hole, then Fork', async () => {
  const order = await page.locator('header button').evaluateAll(buttons => buttons.map(button => (button.hasAttribute('data-start-rabbit-hole') ? 'start' : button.hasAttribute('data-fork-button') ? 'fork' : null)).filter(Boolean));
  assert.deepEqual(order, ['start', 'fork']);
  assert.equal(await page.locator('[data-start-rabbit-hole]').innerText(), 'Start Rabbit Hole');
  // Fork is still there, now carrying the canvas's direct fork count (canvas-forking.md): none yet.
  assert.equal(await page.locator('[data-fork-button]').getAttribute('aria-label'), 'Fork, 0 forks', 'Fork is still there, with its count');
  assert.equal(await page.locator('[data-start-rabbit-hole]').getAttribute('data-origin'), 'root', 'nothing selected: the canvas root');
});
await shot('01-shared-header-root');

// ---- 3: no selection, a root start on one shared canvas ----
let rootHole;
await check('3 no selection: Start Rabbit Hole begins at the shared canvas root', async () => {
  await page.locator('[data-start-rabbit-hole]').click();
  await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 20000 });
  rootHole = holeOf(page.url());
  await anchor('Started from the shared canvas "Kitchen chemistry".');
  assert.match(await anchorCard().innerText(), /Exploring from Kitchen chemistry/);
  await page.getByText('Your Rabbit Hole is ready. It is private to you.').waitFor({ timeout: 10000 });
  const t = (await tree(viewer, rootHole)).body;
  assert.equal(t.dive.origin.origin_block_id, ':root');
  assert.deepEqual(t.path.map(level => level.kind), ['shared', 'canvas']);
});
await page.locator('[data-dive-navigator]').waitFor({ timeout: 15000 });
await shot('02-root-hole');

await check('5 the hole is the viewer\'s own and private', async () => {
  assert.equal((await tree(viewer, rootHole)).status, 200);
  assert.equal((await tree(owner, rootHole)).status, 404, 'the sharer cannot see it');
  assert.notEqual((await api(owner, `/api/learn/boards/${rootHole}/main`)).status, 200);
  assert.ok(((await api(viewer, '/api/canvases')).body.canvases || []).some(entry => entry.name === rootHole), 'in the viewer\'s Library');
});

await check('10 back: the map leads to the shared source, view only', async () => {
  const level = page.locator('[data-dive-navigator] [data-dive-level^="share:"]');
  assert.equal(await level.innerText(), 'Kitchen chemistry');
  await page.locator('[data-dive-navigator] [aria-label="Up to the parent hole"]').click();
  await page.waitForURL(new RegExp(`/b/${kitchen.token}$`), { timeout: 20000 });
  await page.locator('[data-start-rabbit-hole]').waitFor();
  assert.ok(await page.getByText('View only').isVisible(), 'still the view-only shared page');
  assert.equal(await page.locator('[role="toolbar"][aria-label="Canvas tools"]').count(), 0, 'no editing tools on the source');
});
await shot('05-back-to-shared-source');

// ---- 4 and 14: a selected card on a different shared canvas, a different card type, the same code ----
let cardHole;
await openShared(bridges);
await check('4 a selected card is the origin (flashcards, on another shared canvas)', async () => {
  await clickCard('b-cards');
  await page.locator('[data-view-selection="b-cards"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-start-rabbit-hole]').getAttribute('data-origin'), 'b-cards');
  assert.match(await page.locator('[data-start-rabbit-hole]').getAttribute('title'), /from ".+"\. This canvas stays as it is\./);
  await shot('03-shared-card-selected');
  await page.locator('[data-start-rabbit-hole]').click();
  await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 20000 });
  cardHole = holeOf(page.url());
  const t = (await tree(viewer, cardHole)).body;
  assert.equal(t.dive.origin.origin_block_id, 'b-cards');
  assert.equal(t.path[0].title, 'Bridge loads');
  assert.equal(t.path[1].title, 'Flashcards: 2 cards', 'named as the canvas describes the card, kind first');
  await anchor('on the shared canvas "Bridge loads".');
});
await page.locator('[data-dive-navigator]').waitFor({ timeout: 15000 });
await shot('04-card-hole');
await check('14 the same implementation on two unrelated sources (root on one, a card on the other)', async () => {
  assert.notEqual(rootHole, cardHole);
  const [a, b] = [(await tree(viewer, rootHole)).body, (await tree(viewer, cardHole)).body];
  assert.deepEqual([a.dive.created_by, b.dive.created_by], ['shared_start', 'shared_start']);
  assert.deepEqual([a.dive.source.title, b.dive.source.title], ['Kitchen chemistry', 'Bridge loads']);
  assert.deepEqual([a.dive.origin.origin_block_id, b.dive.origin.origin_block_id], [':root', 'b-cards']);
});

// ---- 8, 9: reload; the source's version survives the source changing ----
await check('8 reload keeps the hole and its provenance', async () => {
  await page.reload();
  await page.locator('[data-dive-navigator] [data-dive-level^="share:"]').waitFor({ timeout: 20000 });
  await anchor('on the shared canvas "Bridge loads".');
});
await check('9 the source version and provenance survive the source changing', async () => {
  const board = (await api(owner, `/api/learn/boards/${bridges.canvas.name}/main`)).body;
  const changed = await api(owner, `/api/learn/boards/${bridges.canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { ...board.state, blocks: [...board.state.blocks, { id: 'b-new', type: 'explanation', dx: 0, dy: 0, title: 'Later addition', body: 'x' }] }, version: board.version }) });
  assert.equal(changed.status, 200, JSON.stringify(changed.body).slice(0, 120));
  const source = (await tree(viewer, cardHole)).body.dive.source;
  assert.deepEqual([source.version, source.title, source.share_url, source.resource_id, source.board], [1, 'Bridge loads', `/b/${bridges.token}`, bridges.canvas.name, 'main']);
  // The hole's source names no owner email (docs/features/user-handles.md): the creator is read by @handle, by reference.
  assert.equal(source.creator, null);
  assert.ok(!JSON.stringify(source).includes('rh-owner-'), 'no owner email in the hole');
  before.bridges = await ownerBoard(bridges); // the owner's own edit, not the viewer's
});

// ---- 11: signed out, the existing sign-in, and the start resumes from the same card ----
let resumedHole;
{
  const anon = await contextFor(null);
  page = anon.page;
  await openShared(kitchen);
  await check('11 signed out: sign in, come back, and the Rabbit Hole is started from the same card', async () => {
    await clickCard('k-quiz');
    assert.equal(await page.locator('[data-start-rabbit-hole]').getAttribute('data-origin'), 'k-quiz');
    await page.locator('[data-start-rabbit-hole]').click();
    // The existing sign-in: /login, which the app worker sends on to its /sign-in page with `next` kept.
    await page.waitForURL(/\/(login|sign-in)\?next=/, { timeout: 20000 });
    const next = new URL(page.url()).searchParams.get('next');
    assert.equal(next, `/b/${kitchen.token}?rabbit=k-quiz`, 'the origin rides the existing sign-in');
    await page.waitForTimeout(1200);
    const google = page.getByRole('button', { name: 'Google' }).or(page.getByRole('link', { name: 'Google' })).first();
    const realSignIn = await google.isVisible().catch(() => false);
    await shot('06-signed-out-goes-to-sign-in');
    if (realSignIn) {
      // The app worker's own sign-in page, with the local mock OAuth (OAUTH_MOCK=true): the real round trip.
      await google.click();
      await page.waitForURL(/test\/oauth\/authorize/, { timeout: 15000 });
      await page.locator('input[name=sub]').fill(`rh-viewer-${run}`);
      await page.locator('input[name=email]').fill(`rh-viewer-${run}@example.org`);
      await page.locator('form button, form input[type=submit]').first().click();
      // Someone new to Rabbit Hole chooses their public handle first (docs/features/user-handles.md), in place: the
      // address keeps ?rabbit=, so the start resumes from the same card once the handle is claimed.
      await page.locator('[data-handle-setup]').waitFor({ timeout: 30000 });
      assert.match(page.url(), /\?rabbit=k-quiz$/, 'the handle step keeps the origin in the address');
      await shot('06b-choose-handle-then-resume');
      await page.getByRole('textbox', { name: 'Handle' }).fill(`rh_${run}`.slice(0, 30));
      await page.getByRole('button', { name: 'Continue' }).click();
    } else {
      // The dev worker refuses /login (the P0-B barrier); the session the sign-in would end with, then `next`.
      await anon.context.addCookies([{ name: 'small_session', value: viewer.session, url: BASE }]);
      await page.goto(`${BASE}${next}`);
    }
    console.log(`  (sign-in: ${realSignIn ? 'the real page, mock OAuth' : 'session handed over, dev worker'})`);
    await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 30000 });
    resumedHole = holeOf(page.url());
    // Read as the browser's own session: the hole belongs to whoever just signed in.
    const t = await page.evaluate(async hole => (await fetch(`/api/canvases/dives?app=${hole}&board=main`)).json(), resumedHole);
    assert.equal(t.dive.origin.origin_block_id, 'k-quiz');
    assert.equal(t.path[0].title, 'Kitchen chemistry');
    await anchor('on the shared canvas "Kitchen chemistry".');
  });
  await shot('07-resumed-after-sign-in');
  await anon.context.close();
}

// ---- 6, 7, 12, 13: the shared canvases, the sharer's data, no fork ----
await check('6 the shared canvases are unchanged by every start', async () => {
  assert.equal(await ownerBoard(kitchen), before.kitchen);
  assert.equal(await ownerBoard(bridges), before.bridges);
});
await check('7 the viewer\'s holes and chat stay private: the sharer\'s threads and canvases do not change', async () => {
  assert.equal(await ownerThreads(kitchen), before.threads);
  for (const hole of [rootHole, cardHole, resumedHole]) assert.equal((await tree(owner, hole)).status, 404);
});
await check('12 no fork is made by starting a Rabbit Hole', async () => {
  assert.deepEqual([(await sharedView(kitchen)).fork_count, (await sharedView(bridges)).fork_count], [0, 0]);
});
await check('13 the sharer\'s own data is never mutated', async () => {
  assert.equal(await ownerCanvases(), before.canvases);
});

// ---- 2: Fork still does exactly what it did ----
({ page } = await contextFor(viewer));
await openShared(bridges);
await check('2 Fork is unchanged: a copy in the viewer\'s Library, counted on the source', async () => {
  await page.locator('[data-fork-button]').click();
  await page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 30000 });
  assert.equal((await sharedView(bridges)).fork_count, 1);
  assert.notEqual(new URL(page.url()).pathname, `/apps/${cardHole}`, 'the fork is its own canvas, not the hole');
});

await check('no request reached a model provider: the provider tripwire counted none during this check', async () => {
  const during = (await providerCalls()).slice(providerBefore);
  console.log(`tutor plans answered in the browser: ${plans.length}; next-steps hook requests answered: ${hooks.length}; provider requests: ${during.length}`);
  assert.deepEqual(during, []);
});
await check('no page errors', async () => assert.deepEqual(errors, []));
console.log(`${results.length}/${results.length} checks passed`);
await browser.close();
