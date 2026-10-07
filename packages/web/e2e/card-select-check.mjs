// Learning-canvas card selection (docs/features/canvas-card-selection.md), the owner's fifteen cases, against the LOCAL
// stack only: local D1 and fresh browser profiles. No model is called: /api/learn/ask is answered here, the article
// reader's /api/learn/wiki is answered here, and any other model route fails the run. Prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/card-select-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-select-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-select-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`sel-owner-${run}@example.com`, `sel_${run}`) };
const viewer = { session: await sessionFor(`sel-viewer-${run}@example.org`, `selv_${run}`) };
const api = async (who, path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// ---- two canvases: A with an explanation, a quiz and an article; B with one card ----
const BLOCKS = [
  { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
  { id: 'k-quiz', type: 'quiz', dx: 0, dy: 0, question: 'What does salt do to the freezing point of water?', options: [{ key: 'A', text: 'Lowers it', correct: true }, { key: 'B', text: 'Raises it' }], why: 'Dissolved particles get in the way of the crystal forming.' },
  { id: 'k-wiki', type: 'wiki', dx: 0, dy: 0, title: 'Freezing-point_depression', section: 0 },
];
const state = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
const A = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Kitchen chemistry ${run}` }) })).body;
const B = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Bridge loads ${run}` }) })).body;
const catalog = (await api(owner, '/api/apps')).body;
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}:ink`;
const SEEDS = { [keyOf(A.name)]: state(BLOCKS), [keyOf(B.name)]: state([{ id: 'b-exp', type: 'explanation', dx: 0, dy: 0, title: 'Trusses carry load', body: 'A truss is a frame of triangles.' }]) };

const browser = await chromium.launch();
const errors = [], asks = [], stray = [];
const contextFor = async (who, options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
  // The question is recorded and answered here; no model.
  await context.route('**/api/learn/ask', async route => {
    asks.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `event: chunk\ndata: ${JSON.stringify({ text: 'Salt lowers the freezing point.' })}\n\nevent: done\ndata: {}\n\n` });
  });
  await context.route('**/api/learn/wiki?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Freezing-point depression', url: 'https://en.wikipedia.org/wiki/Freezing-point_depression', licence: { title: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }, html: '<p>Freezing-point depression is the drop in the temperature at which a substance freezes, caused when a smaller amount of another substance is added.</p>' }) }));
  await context.route(/\/api\/learn\/(tutor|artifact|home-ask|journeys?)\b/, route => { if (route.request().method() === 'GET') return route.continue(); stray.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
let page;
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const card = id => page.locator(`[data-block-id="${id}"]`);
const strip = () => page.locator('[data-selected-card]');
const isSelected = async id => (await card(id).getAttribute('aria-current')) === 'true';
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const slash = async text => { await composer().click(); await composer().fill(text); await page.waitForTimeout(150); await composer().press('Enter'); await page.waitForTimeout(900); };
// A press on a card: on its drag strip by default, or on `on` (a locator inside it: its text, its body).
const press = async (id, { double = false, on = null } = {}) => {
  const box = await (on || card(id).locator('[data-drag-handle]')).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (double) await page.mouse.dblclick(x, y); else await page.mouse.click(x, y);
  await page.waitForTimeout(300);
};
const holes = async () => (await api(owner, `/api/canvases/dives?app=${A.name}&board=main`)).body?.children?.length ?? 0;
// Zoom to fit (Shift+1, from the canvas, not the composer), so every card of the canvas is on screen.
const fit = async () => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(700); };
const openA = async () => {
  await page.goto(`${BASE}/apps/${A.name}`);
  await card('k-exp').waitFor({ timeout: 60000 }).catch(async error => { await page.screenshot({ path: `${SHOTS}/failed-open.png` }); console.log('stray', stray, 'errors', errors); throw error; });
  await page.waitForTimeout(800);
  await fit();
};

({ page } = await contextFor(owner));
await openA();
await shot('A-normal-card');

await check('1 single click selects the card and opens nothing', async () => {
  const url = page.url();
  await press('k-exp', { on: card('k-exp').getByText('Why salt melts ice') });
  assert.ok(await isSelected('k-exp'));
  assert.equal(page.url(), url, 'no navigation');
  assert.equal(await page.locator('[aria-label="Learn agent chat"] [aria-label="Wikipedia reader"]').count(), 0, 'no reader');
  assert.equal(await card('k-exp').getAttribute('tabindex'), '0', 'and Tab reaches it');
});
await shot('B-selected-card');

await check('7 the composer strip names the selected card: its title, its id, Remove selected card context', async () => {
  await strip().waitFor({ timeout: 5000 });
  assert.equal(await strip().getAttribute('data-selected-card'), 'k-exp');
  assert.match(await strip().innerText(), /Why salt melts ice/);
  assert.equal(await strip().locator('button[aria-label="Remove selected card context"]').count(), 1);
  assert.equal(await page.locator('[data-canvas-target]').count(), 1, 'one strip, never a second chip');
});
await shot('C-selected-card-composer-strip');

await check('6 selecting another card moves the selection and the strip to it', async () => {
  await press('k-quiz');
  assert.ok(await isSelected('k-quiz'));
  assert.ok(!(await isSelected('k-exp')));
  assert.equal(await strip().getAttribute('data-selected-card'), 'k-quiz');
});

await check('4 Esc clears the selection and the strip', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.ok(!(await isSelected('k-quiz')));
  assert.equal(await strip().count(), 0);
});

await check('5 a click on the blank canvas clears them', async () => {
  await press('k-exp');
  assert.equal(await strip().count(), 1);
  const box = await card('k-exp').boundingBox();
  await page.mouse.click(box.x + box.width + 260, box.y + 20);
  await page.waitForTimeout(200);
  assert.ok(!(await isSelected('k-exp')));
  assert.equal(await strip().count(), 0);
});

await check('8 x on the strip removes the context and the card selection together', async () => {
  await press('k-exp');
  await strip().locator('button[aria-label="Remove selected card context"]').click();
  await page.waitForTimeout(200);
  assert.equal(await strip().count(), 0);
  assert.ok(!(await isSelected('k-exp')), 'never a ring with no strip');
});

await check('10 /ask with nothing selected asks about the canvas: no card target', async () => {
  await slash('/ask what is ice made of?');
  const ask = asks.at(-1);
  assert.equal(ask?.message, 'what is ice made of?');
  assert.equal(ask.canvas_target, undefined);
});

await check('9 /ask with a card selected carries that card: its id, kind and title, its text as material', async () => {
  await press('k-exp');
  await composer().click();
  await composer().fill('/ask why does this happen?');
  await shot('D-ask-typed-with-card-selected');
  await composer().press('Enter');
  await page.waitForTimeout(900);
  const ask = asks.at(-1);
  assert.equal(ask?.message, 'why does this happen?');
  assert.equal(ask.canvas_target?.id, 'k-exp');
  assert.equal(ask.canvas_target.title, 'Why salt melts ice');
  assert.match(ask.canvas_target.text, /lowers its freezing point/);
  assert.deepEqual(Object.keys(ask.canvas_target).sort(), ['id', 'kind', 'text', 'title'], 'the temporary contract, nothing more');
});

await check('11 after the send the card stays selected; the follow-up asks about it again', async () => {
  assert.ok(await isSelected('k-exp'));
  assert.equal(await strip().getAttribute('data-selected-card'), 'k-exp');
  await slash('/ask show another example');
  assert.equal(asks.at(-1)?.canvas_target?.id, 'k-exp');
  assert.ok(await isSelected('k-exp'));
});
await shot('C2-after-send-card-kept');

// Natural typing is the way in (owner, 2026-10-06): no slash needed - the selected card rides a plain question too.
await check('11b with a card selected, a plain typed question (no /) carries the card too', async () => {
  const before = asks.length;
  await slash('why is salt better than sugar at this?');
  assert.equal(asks.length, before + 1, 'one ask, through the normal composer');
  assert.equal(asks.at(-1).message, 'why is salt better than sugar at this?');
  assert.equal(asks.at(-1).canvas_target?.id, 'k-exp');
});

await check('12 the card\'s own controls never open it: a double-click on a quiz answer', async () => {
  // The answers so far landed in the chat sheet (a selected card is context; it does not move the answer): fold it away.
  const collapse = page.getByRole('button', { name: 'Collapse chat' });
  if (await collapse.count()) await collapse.first().click();
  await fit();
  const before = { url: page.url(), holes: await holes() };
  const option = card('k-quiz').locator('button', { hasText: 'Lowers it' }).first();
  await option.dblclick();
  await page.waitForTimeout(800);
  assert.equal(page.url(), before.url, 'no navigation');
  assert.equal(await holes(), before.holes, 'no Rabbit Hole');
  assert.equal(await page.locator('[aria-label="Learn agent chat"] [aria-label="Wikipedia reader"]').count(), 0, 'no reader');
});

await check('2 a double-click opens: an article card its reader; a learning card its Rabbit Hole', async () => {
  // The card's header; a double-click on the article text belongs to the article (selecting a word).
  await press('k-wiki', { double: true, on: card('k-wiki').getByText('Wikipedia', { exact: true }).first() });
  await page.locator('[aria-label="Learn agent chat"] [aria-label="Wikipedia reader"]').waitFor({ timeout: 10000 });
  assert.ok(await isSelected('k-wiki'), 'the reader opens from the selected card');
  await press('k-exp', { double: true, on: card('k-exp').getByText('lowers its freezing point') });
  await page.waitForURL(/[?&]hole=canvas-[a-f0-9]{8}/, { timeout: 20000 });
});
await shot('02-dblclick-entered-hole');

await check('13 the selected-card context never crosses canvases: none inside the hole, none on another canvas', async () => {
  await page.waitForTimeout(800);
  assert.equal(await strip().count(), 0, 'not in the Rabbit Hole');
  await page.goto(`${BASE}/apps/${B.name}`);
  await card('b-exp').waitFor({ timeout: 60000 });
  assert.equal(await strip().count(), 0, 'not on canvas B');
});

await check('3 Enter opens the selected card; Space selects a focused card first', async () => {
  await openA();
  await card('k-quiz').focus();
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assert.ok(await isSelected('k-quiz'), 'Space selects the focused card');
  await page.keyboard.press('Enter');
  await page.waitForURL(/[?&]hole=canvas-[a-f0-9]{8}/, { timeout: 20000 });
});

await check('14 a reload clears the selection: nothing selected, no strip', async () => {
  await openA();
  await press('k-exp');
  assert.equal(await strip().count(), 1);
  await page.reload();
  await card('k-exp').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  assert.ok(!(await isSelected('k-exp')));
  assert.equal(await strip().count(), 0);
  assert.doesNotMatch(page.url(), /k-exp|select/, 'never in the URL');
});

// ---- touch: a tap selects, and the selected card offers Open (no double-tap) ----
await check('E touch: a tap selects and the selected card offers a small Open', async () => {
  const phone = await contextFor(owner, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const desktop = page;
  page = phone.page;
  await openA();
  await card('k-exp').scrollIntoViewIfNeeded();
  const box = await card('k-exp').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
  await page.waitForTimeout(400);
  assert.ok(await isSelected('k-exp'));
  assert.equal(await card('k-exp').locator('[data-card-open]').count(), 1);
  await shot('E-mobile-selected-open');
  await card('k-exp').locator('[data-card-open]').tap();
  await page.waitForURL(/[?&]hole=canvas-[a-f0-9]{8}/, { timeout: 20000 });
  await phone.context.close();
  page = desktop;
});

// ---- 15: a shared, view-only canvas: selection works, nothing about the source changes ----
await check('15 on a shared view-only canvas a click selects a card, no strip, and the source is untouched', async () => {
  const shared = (await api(owner, `/api/learn/boards/${A.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: state(BLOCKS) }) })).body;
  const before = JSON.stringify((await api(owner, `/api/learn/boards/${A.name}/main`)).body?.state);
  const guest = await contextFor(viewer);
  const desktop = page;
  page = guest.page;
  await page.goto(`${BASE}/b/${shared.sharing.view}`);
  await page.locator('[data-start-rabbit-hole]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  const box = await card('k-exp').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-view-selection="k-exp"]').count(), 1, 'the view selection ring');
  assert.equal(await page.locator('[data-start-rabbit-hole]').getAttribute('data-origin'), 'k-exp', 'Start Rabbit Hole begins at the selected card');
  assert.equal(await strip().count(), 0, 'the shared ask is about the canvas: no card strip');
  const after = JSON.stringify((await api(owner, `/api/learn/boards/${A.name}/main`)).body?.state);
  assert.equal(after, before, 'the source board is unchanged');
  await guest.context.close();
  page = desktop;
});

await check('no model route was called and no page error', async () => {
  assert.deepEqual(stray, []);
  assert.deepEqual(errors, []);
});

await browser.close();
console.log(`${results.length}/18 checks passed`);
process.exit(results.length === 18 ? 0 : 1);
