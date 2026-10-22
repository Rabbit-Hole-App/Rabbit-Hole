// The canvas's bottom chrome (owner, 2026-10-08): "move the minimap to the left bottom above the zoom buttons. so that they are
// all in one together" and "move the 3 hooks options window to the bottom right aligned with the lower of the chat composer";
// and "if the questions are still being loaded just show the skeleton and a spinner and not the previous question". On an owned
// and a shared canvas, at 1440 and 1024 wide and at phone width: the minimap sits directly above the zoom row on its left edge;
// the hooks sit right of the composer with their bottom on the composer's bottom (on a phone, above the composer at the right);
// no chrome overlaps other chrome; a loading set is a skeleton, never the previous hooks. The owned canvas has no dock now
// (owner brief 2026-10-13 sections 2 and 4): its composer is the Chat pane's, right of the canvas (on a phone, under it), so
// there the hooks sit at the canvas's lower right on the strip's baseline, right of the minimap and zoom (on a phone,
// at the right, above the Chat pane), and no chrome covers the Chat pane. The shared board keeps its own dock composer. And (owner, 2026-10-08: "in the
// canvas above the chat composer you are cutting the canvas too much") the strip floats: the canvas runs to the bottom under
// it, the empty strip lets the pointer through to the canvas, its controls stay clickable, and zoom to fit frames every card
// clear of the composer, the hooks, the minimap and zoom (a bottom inset; on a phone the tools' strip is at the top). Against the
// LOCAL keyless stack only: the hook planner answers from its fixtures, the provider tripwire must count 0, nothing is sent but
// the owned pages' one learner turn each, answered here. Owner decision 3a (2026-10-20, Tutor workflow): owned-canvas hooks are
// proactive Tutor suggestions - only while Tutor is selected, On and unpaused, never on open, loaded only after a meaningful
// learner change - so the owned canvas selects Tutor (its saved control) and each owned page takes one finished learner turn
// before its hooks are measured, as next-steps-wiring-check does. The shared canvas reads its saved set at rest and never
// generates on open (owner priority 1, 2026-10-21): with none saved its card offers Suggest, pressed here (sharedReady).
// Usage: BASE=http://127.0.0.1:8858 SMALL_CP=http://127.0.0.1:8859 [TEST_BYPASS_SECRET=<that stack's>] node e2e/canvas-chrome-check.mjs [shotsDir]
// The hooks must load, so the stack's hook planner must answer without a model: a keyless stack (e2e/journey-local-stack.md,
// the one blank-canvas-hooks-check uses) answers from its fixtures; a stack with model keys trips the provider tripwire.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8858';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8859';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-chrome-check runs against the local stack only');
const SHOTS = process.argv[2] || 'canvas-chrome-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const owner = { session: await sessionFor(`chrome-owner-${run}@example.com`, `chrome_${run}`) };
const viewer = { session: await sessionFor(`chrome-viewer-${run}@example.org`, `chromev_${run}`) };
const api = async (who, path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } })).json();

const BLOCKS = [
  { id: 'c-1', type: 'explanation', dx: 0, dy: 0, title: 'Why bread rises', body: 'Yeast ferments sugar into carbon dioxide, which the gluten traps.' },
  { id: 'c-2', type: 'explanation', dx: 0, dy: 0, title: 'What kneading does', body: 'Kneading aligns gluten strands into a stretchy network.' },
  // Enough cards that a fit is bound by the height left above the chrome.
  ...['Proofing', 'Oven spring', 'Crust colour', 'Crumb structure', 'Sourdough starters', 'Salt and gluten'].map((title, i) => (
    { id: `c-${i + 3}`, type: 'explanation', dx: 0, dy: 0, title, body: `${title}: one more step in how bread rises.` })),
];
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'How bread rises' }) });
const catalog = await api(owner, '/api/apps');
const seed = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };
const token = (await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: STATE }) })).sharing?.view;
assert.ok(token, 'a share link');
// Owner 3a: the owner picks Tutor on the owned canvas (the saved canvas control; Tutor is On and unpaused by default).
{
  const { state } = await api(owner, `/api/learn/coaching?app=${canvas.name}&board=main`);
  const picked = await fetch(`${BASE}/api/learn/coaching`, { method: 'POST', headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' }, body: JSON.stringify({ app: canvas.name, board: 'main', actionId: `tutor-${run}`, expectedRevision: state.revision, action: 'save_controls', payload: { event: { type: 'select_mode', mode: 'tutor' } } }) });
  assert.equal(picked.status, 200, 'Tutor selected on the owned canvas');
}
const QUESTION = 'Why does bread dough rise?', REPLY = 'Yeast makes gas and the gluten traps it.';

const browser = await chromium.launch();
const errors = [], sent = [], turns = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const open = async (who, path, viewport, { turn = false } = {}) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(entries => { for (const [key, value] of Object.entries(entries)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, seed);
  // Nothing else is asked: a question would be a send. The hook requests are the real route, answered by the stack's fixtures.
  // The Chat pane's thread list (/api/ask/threads) is not a question: it passes.
  await context.route(/\/api\/(ask(?!\/threads)|learn\/(ask|tutor\/plan|home-ask|artifact))\b/, route => { sent.push(new URL(route.request().url()).pathname); return route.abort(); });
  // An owned page's one learner turn (owner 3a): the Tutor plan answered here, never by a model (the keyless stack has no
  // Tutor-plan fixture). Registered last, so it runs before the refusal above.
  if (turn) await context.route('**/api/learn/tutor/plan', route => { turns.push(route.request().postDataJSON()?.context?.learner_intent?.raw_user_message ?? null); return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: REPLY }] } }); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
  await page.goto(`${BASE}${path}`);
  return page;
};
const box = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null; }, selector);
const disjoint = (a, b) => !a || !b || a.right <= b.x + 0.5 || b.right <= a.x + 0.5 || a.bottom <= b.y + 0.5 || b.bottom <= a.y + 0.5;
const round = b => b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)]));

// The geometry rules, one page at a time. phone: the hooks above the composer at the right, the overview in the tools' strip.
const layout = async (page, where, { phone = false, shared = false } = {}) => {
  const hooks = await box(page, '[data-hooks-slot] section[data-next-steps]');
  // The shared board's dock composer; the owned canvas has none, its composer is in the Chat pane.
  const composer = await box(page, '[data-canvas-composer]');
  const pane = await box(page, '[data-chat-pane]');
  const surface = await box(page, '[data-canvas-surface]');
  const zoom = await box(page, '[data-zoom]');
  const minimap = await box(page, '[data-canvas-minimap] [aria-label="Canvas overview"]');
  const strip = await box(page, '[data-canvas-bottom]');
  const stack = await box(page, '[data-zoom-stack]');
  assert.ok(hooks && (shared ? composer : pane && !composer) && surface && zoom && strip && stack, `${where}: hooks ${!!hooks}, dock ${!!composer}, Chat pane ${!!pane}, surface ${!!surface}, zoom ${!!zoom}`);
  // The canvas runs to the bottom: no band of its own under it; the strip floats over its lower edge.
  assert.ok(surface.bottom >= strip.bottom - 2 && (!composer || surface.bottom >= composer.bottom), `${where}: the canvas ${JSON.stringify(round(surface))} stops above the strip ${JSON.stringify(round(strip))}`);
  // No chrome over other chrome.
  for (const [name, b] of [['hooks', hooks], ['zoom', zoom], ['minimap', minimap]]) if (b) assert.ok(disjoint(b, composer) && disjoint(b, pane), `${where}: the ${name} covers the composer or the Chat pane`);
  assert.ok(disjoint(hooks, stack), `${where}: the hooks ${JSON.stringify(round(hooks))} cover the minimap and zoom ${JSON.stringify(round(stack))}`);
  if (pane) assert.ok(phone ? pane.y >= surface.bottom - 0.5 : pane.x >= surface.right - 0.5, `${where}: the Chat pane ${JSON.stringify(round(pane))} is not ${phone ? 'under' : 'right of'} the canvas ${JSON.stringify(round(surface))}`);
  // Its controls take the pointer: the composer's field, the zoom row, a hook.
  const hit = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return { surface: !!el?.closest('[data-canvas-surface]'), field: !!el?.closest('[data-canvas-composer] input[placeholder], [data-canvas-composer] textarea[placeholder], [data-chat-pane] [data-chat-composer] textarea'), zoom: !!el?.closest('[title="Reset zoom"]'), hook: !!el?.closest('[data-hooks-slot] [data-next-step]') };
  }, [x, y]);
  const reset = await box(page, '[title="Reset zoom"]');
  const hook = await box(page, '[data-hooks-slot] [data-next-step]');
  assert.ok((await hit(reset.x + reset.w / 2, reset.y + reset.h / 2)).zoom, `${where}: the zoom row is not on top`);
  assert.ok((await hit(hook.x + hook.w / 2, hook.y + hook.h / 2)).hook, `${where}: a hook is not on top`);
  // The empty strip lets the pointer through: right of the zoom stack, level with the zoom row, the canvas takes it.
  const gapX = (stack.right + (phone ? surface.right : composer ? composer.x : hooks.x)) / 2;
  assert.ok((await hit(gapX, zoom.y + zoom.h / 2)).surface, `${where}: the empty strip at (${Math.round(gapX)}, ${Math.round(zoom.y + zoom.h / 2)}) does not reach the canvas`);
  if (phone) {
    const tools = await box(page, '[role="toolbar"][aria-label="Canvas tools"]');
    assert.ok(!tools || tools.bottom <= surface.y + 1, `${where}: on a phone the tools' strip is not above the canvas`);
  }
  if (phone) {
    // Above the dock, or above the canvas's own bottom (the Chat pane is under it), at the right.
    const floor = composer || { y: surface.bottom, right: surface.right };
    assert.ok(hooks.bottom <= floor.y + 0.5 && hooks.right >= floor.right - 24, `${where}: on a phone the hooks sit above the composer at the right ${JSON.stringify(round(hooks))} ${JSON.stringify(round(floor))}`);
  } else {
    // On the dock's baseline, right of it; with no dock, on the strip's baseline (the minimap and zoom group's bottom), right
    // of that group, at the lower right: out to the canvas's right edge (the strip spans the right gutter too), short of the Chat pane.
    const base = composer || stack;
    assert.ok(Math.abs(hooks.bottom - base.bottom) <= 2, `${where}: the hooks' bottom ${Math.round(hooks.bottom)} is not the ${composer ? 'composer' : 'minimap and zoom group'} bottom ${Math.round(base.bottom)}`);
    assert.ok(hooks.x >= (composer || stack).right - 0.5, `${where}: the hooks are not right of the ${composer ? 'composer' : 'minimap and zoom'}`);
    if (!composer) assert.ok(hooks.right >= surface.right - 24 && hooks.right <= pane.x + 0.5, `${where}: the hooks ${JSON.stringify(round(hooks))} are not at the canvas's lower right ${JSON.stringify(round(surface))}, short of the Chat pane ${JSON.stringify(round(pane))}`);
    // A canvas 640 px wide or less (1024 wide with the Chat pane open) keeps the overview in the tools, as a phone does.
    if (strip.w <= 640) assert.ok(!minimap && await page.getByRole('button', { name: 'Show overview' }).count(), `${where}: a ${Math.round(strip.w)} px canvas offers no Show overview`);
    else assert.ok(minimap, `${where}: a minimap`);
    if (minimap) assert.ok(minimap.bottom <= zoom.y + 0.5 && zoom.y - minimap.bottom <= 12 && Math.abs(minimap.x - zoom.x) <= 1.5, `${where}: the minimap ${JSON.stringify(round(minimap))} is not directly above the zoom row ${JSON.stringify(round(zoom))}`);
    if (minimap) assert.ok(minimap.right <= (composer ? composer.x : hooks.x) + 0.5, `${where}: the minimap is not left of the ${composer ? 'composer' : 'hooks'}`);
  }
  // The composer's field takes the pointer. A phone's Chat pane is under the canvas: scrolled to for the tap (after every
  // measure above), then the canvas back.
  const fieldSelector = composer ? '[data-canvas-composer] input[placeholder], [data-canvas-composer] textarea[placeholder]' : '[data-chat-pane] [data-chat-composer] textarea';
  await page.locator(fieldSelector).first().scrollIntoViewIfNeeded();
  const field = await box(page, fieldSelector);
  assert.ok((await hit(field.x + field.w / 2, field.y + field.h / 2)).field, `${where}: the composer's field is not on top`);
  await page.locator('[data-canvas-surface]').scrollIntoViewIfNeeded();
  // The Voice and Tutor caption's stack never holds the hooks now.
  assert.equal(await page.locator('[data-left-stack] [data-next-steps]').count(), 0, `${where}: hooks in the left stack`);
  // Zoom to fit (the minimap's Back to content; on a phone the tools' strip opens the overview, which has the same button)
  // frames every card clear of the floating chrome.
  if (!minimap) await page.getByRole('button', { name: 'Show overview' }).click();
  await page.getByRole('button', { name: 'Back to content' }).first().click();
  await page.waitForTimeout(1500);
  // Measured again after the fit: on a phone the open overview moved the canvas down.
  const fitted = await box(page, '[data-canvas-surface]');
  const chrome = [['composer', await box(page, '[data-canvas-composer]')], ['hooks', await box(page, '[data-hooks-slot] section[data-next-steps]')], ['minimap and zoom', await box(page, '[data-zoom-stack]')]];
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => { const r = el.getBoundingClientRect(); return { id: el.getAttribute('data-block-id'), x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }));
  assert.ok(cards.length >= 8, `${where}: ${cards.length} cards`);
  // The fit's zoom floor is 20% (frame in AdaptiveCanvas.jsx): content taller than the room above the chrome even there
  // (8 cards above a phone's hooks and composer) starts at the room's top and pans out from under the chrome.
  const scale = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('[data-canvas-surface] div[style*="scale("]')?.style.transform || '')?.[1] || 1));
  if (scale > 0.2001) for (const card of cards) for (const [name, b] of chrome) assert.ok(disjoint(card, b), `${where}: after zoom to fit, card ${card.id} ${JSON.stringify(round(card))} is under the ${name} ${JSON.stringify(round(b))}`);
  else assert.ok(Math.min(...cards.map(card => card.y)) <= fitted.y + 49, `${where}: at the 20% floor the fit does not start at the top`);
  fits.push(`${where} ${Math.round(scale * 100)}%`);
  for (const card of cards) assert.ok(card.y >= fitted.y - 1 && (scale <= 0.2001 || card.bottom <= fitted.bottom + 1), `${where}: after zoom to fit, card ${card.id} is off the canvas`);
};
const fits = [];
const ready = page => page.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 60000 });
// The shared card at rest: its saved set (ready), or Suggest (empty) when none is saved yet, pressed as the viewer would.
const sharedReady = async page => {
  await page.locator('[data-hooks-slot] section[data-next-steps="ready"], [data-hooks-slot] section[data-next-steps="empty"]').first().waitFor({ timeout: 60000 });
  if (await page.locator('[data-hooks-slot] [data-next-steps-request]').count()) await page.locator('[data-hooks-slot] [data-next-steps-request]').click();
  await ready(page);
};
// A board's load notice is a passing toast; the screenshots wait it out so they show the chrome itself.
const settle = page => page.getByText('You are seeing the latest saved version of this board.').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

for (const [label, viewport, phone] of [['1440', { width: 1440, height: 900 }, false], ['1024', { width: 1024, height: 768 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  await check(`owned canvas at ${label}: the canvas runs under the floating strip; the minimap above the zoom row, the hooks at the lower right on the strip's baseline${phone ? ' (a phone: at the right, above the Chat pane)' : ''}; no chrome over the Chat pane; the controls and the Chat composer take the pointer, the empty strip passes it on; a fit clears the chrome`, async () => {
    const page = await open(owner, `/apps/${canvas.name}`, viewport, { turn: true });
    await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
    // Owner 3a: the saved controls read (Tutor On), then the learner's own finished turn brings the first set.
    await page.locator('[data-chat-pane] [data-tutor-switch="on"] [role="switch"]:enabled').waitFor({ timeout: 60000 });
    const field = page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
    await field.fill(QUESTION);
    await field.press('Enter');
    await page.locator('[data-chat-pane] [data-answer]').filter({ hasText: REPLY }).first().waitFor({ timeout: 30000 });
    await page.locator('[data-canvas-surface]').scrollIntoViewIfNeeded();
    await ready(page);
    await page.waitForTimeout(600);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/chrome-owned-${label}.png` });
    await layout(page, `owned ${label}`, { phone });
    await page.screenshot({ path: `${SHOTS}/chrome-owned-${label}-fit.png` });
    await page.context().close();
  });
}
for (const [label, viewport, phone] of [['1440', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  await check(`shared canvas at ${label}: the same placement`, async () => {
    const page = await open(viewer, `/b/${token}`, viewport);
    await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
    await sharedReady(page);
    await page.waitForTimeout(600);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/chrome-shared-${label}.png` });
    await layout(page, `shared ${label}`, { phone, shared: true });
    await page.screenshot({ path: `${SHOTS}/chrome-shared-${label}-fit.png` });
    await page.context().close();
  });
}
await check('a set on its way is a skeleton with a spinner - the same card size and place - never the previous hooks', async () => {
  // On the shared canvas the hooks follow the selected card (useSharedNextSteps' basis), so a click asks for a new set.
  const page = await open(viewer, `/b/${token}`, { width: 1440, height: 900 });
  // Hold the next set: the card shows what it shows while it waits, recorded on every change.
  await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
  await sharedReady(page);
  const before = await box(page, '[data-hooks-slot] section[data-next-steps]');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(/\/next-steps$/, async route => { await held; await route.continue(); });
  await page.evaluate(() => {
    window.__seen = [];
    const note = () => { const card = document.querySelector('[data-hooks-slot] section[data-next-steps]'); if (card) window.__seen.push({ status: card.dataset.nextSteps, hooks: card.querySelectorAll('[data-next-step]').length, rows: card.querySelectorAll('[data-next-step-placeholder]').length, busy: card.getAttribute('aria-busy') }); };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-next-steps'] });
  });
  // A new basis: select a card (a view-only board selects by a click through its hand tool).
  const c2 = await page.locator('[data-block-id="c-2"]').boundingBox();
  await page.mouse.click(c2.x + c2.width / 2, c2.y + Math.min(40, c2.height / 2));
  const skeleton = page.locator('[data-hooks-slot] section[data-next-steps-skeleton]');
  await skeleton.waitFor({ timeout: 15000 });
  const during = await box(page, '[data-hooks-slot] section[data-next-steps]');
  await page.screenshot({ path: `${SHOTS}/chrome-shared-skeleton.png` });
  assert.equal(await skeleton.locator('[data-next-step]').count(), 0, 'no hook while it loads');
  assert.equal(await skeleton.locator('[data-next-step-placeholder]').count(), 3);
  assert.equal(await skeleton.getAttribute('aria-busy'), 'true');
  assert.equal((await skeleton.locator('.sr-only').innerText()).trim(), 'Loading suggestions');
  assert.ok(Math.abs(during.bottom - before.bottom) <= 1 && Math.abs(during.x - before.x) <= 1 && Math.abs(during.h - before.h) <= 1 && Math.abs(during.w - before.w) <= 1, `the same size and slot: ${JSON.stringify(round(before))} -> ${JSON.stringify(round(during))}`);
  release();
  // The new card has no saved set: Suggest (owner priority 1), then its set.
  await sharedReady(page);
  const seen = await page.evaluate(() => window.__seen);
  assert.ok(seen.every(state => state.status === 'ready' ? state.hooks === 3 : state.status === 'empty' ? state.hooks === 0 && state.rows === 0 : state.hooks === 0 && state.rows === 3 && state.busy === 'true'), `never a previous hook while loading: ${JSON.stringify(seen.slice(0, 6))}`);
  await page.context().close();
});

// A stack without the tripwire (the keyless journey stack: no key to trip) answers it with no JSON: counted as absent.
const tripwire = await Promise.all([BASE, CP].map(async origin => (await (await fetch(`${origin}/__provider-tripwire`)).json().catch(() => null))?.hits?.length ?? 0));
console.log(`provider tripwire: ${tripwire.join(', ')}`);
await check('no page errors, nothing sent but the 3 owned pages\' learner turns (answered here), the provider tripwire at 0 where present', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(sent, []);
  assert.deepEqual(turns, [QUESTION, QUESTION, QUESTION]);
  assert.deepEqual(tripwire, [0, 0]);
});
await browser.close();
console.log(`zoom to fit: ${fits.join(', ')}`);
console.log(`${results.length}/7 checks passed`);
process.exit(results.length === 7 ? 0 : 1);
