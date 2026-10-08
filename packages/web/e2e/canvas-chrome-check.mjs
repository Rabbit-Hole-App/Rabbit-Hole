// The canvas's bottom chrome (owner, 2026-10-08): "move the minimap to the left bottom above the zoom buttons. so that they are
// all in one together" and "move the 3 hooks options window to the bottom right aligned with the lower of the chat composer";
// and "if the questions are still being loaded just show the skeleton and a spinner and not the previous question". On an owned
// and a shared canvas, at 1440 and 1024 wide and at phone width: the minimap sits directly above the zoom row on its left edge;
// the hooks sit right of the composer with their bottom on the composer's bottom (on a phone, above the composer at the right);
// no chrome overlaps other chrome; a loading set is a skeleton, never the previous hooks. And (owner, 2026-10-08: "in the
// canvas above the chat composer you are cutting the canvas too much") the strip floats: the canvas runs to the bottom under
// it, the empty strip lets the pointer through to the canvas, its controls stay clickable, and zoom to fit frames every card
// clear of the composer, the hooks, the minimap and zoom (a bottom inset; on a phone the tools' strip is at the top). Against the
// LOCAL keyless stack only: the hook planner answers from its fixtures, the provider tripwire must count 0, nothing is sent.
// Usage: BASE=http://127.0.0.1:8858 SMALL_CP=http://127.0.0.1:8859 node e2e/canvas-chrome-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8858';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8859';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-chrome-check runs against the local stack only');
const SHOTS = process.argv[2] || 'canvas-chrome-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
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

const browser = await chromium.launch();
const errors = [], sent = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const open = async (who, path, viewport) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(entries => { for (const [key, value] of Object.entries(entries)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, seed);
  // Nothing is asked: a question would be a send. The hook requests are the real route, answered by the stack's fixtures.
  await context.route(/\/api\/(ask|learn\/(ask|tutor\/plan|home-ask|artifact))\b/, route => { sent.push(new URL(route.request().url()).pathname); return route.abort(); });
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
  const composer = await box(page, '[data-canvas-composer]');
  const surface = await box(page, '[data-canvas-surface]');
  const zoom = await box(page, '[data-zoom]');
  const minimap = await box(page, '[data-canvas-minimap] [aria-label="Canvas overview"]');
  const strip = await box(page, '[data-canvas-bottom]');
  const stack = await box(page, '[data-zoom-stack]');
  assert.ok(hooks && composer && surface && zoom && strip && stack, `${where}: hooks ${!!hooks}, composer ${!!composer}, surface ${!!surface}, zoom ${!!zoom}`);
  // The canvas runs to the bottom: no band of its own under it; the strip floats over its lower edge.
  assert.ok(surface.bottom >= strip.bottom - 2 && surface.bottom >= composer.bottom, `${where}: the canvas ${JSON.stringify(round(surface))} stops above the strip ${JSON.stringify(round(strip))}`);
  // No chrome over other chrome.
  for (const [name, b] of [['hooks', hooks], ['zoom', zoom], ['minimap', minimap]]) if (b) assert.ok(disjoint(b, composer), `${where}: the ${name} covers the composer`);
  // Its controls take the pointer: the composer's field, the zoom row, a hook.
  const hit = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return { surface: !!el?.closest('[data-canvas-surface]'), field: !!el?.closest('[data-canvas-composer] input, [data-canvas-composer] textarea'), zoom: !!el?.closest('[title="Reset zoom"]'), hook: !!el?.closest('[data-hooks-slot] [data-next-step]') };
  }, [x, y]);
  const field = await box(page, '[data-canvas-composer] input, [data-canvas-composer] textarea');
  const reset = await box(page, '[title="Reset zoom"]');
  const hook = await box(page, '[data-hooks-slot] [data-next-step]');
  assert.ok((await hit(field.x + field.w / 2, field.y + field.h / 2)).field, `${where}: the composer's field is not on top`);
  assert.ok((await hit(reset.x + reset.w / 2, reset.y + reset.h / 2)).zoom, `${where}: the zoom row is not on top`);
  assert.ok((await hit(hook.x + hook.w / 2, hook.y + hook.h / 2)).hook, `${where}: a hook is not on top`);
  // The empty strip lets the pointer through: right of the zoom stack, level with the zoom row, the canvas takes it.
  const gapX = (stack.right + (phone ? surface.right : composer.x)) / 2;
  assert.ok((await hit(gapX, zoom.y + zoom.h / 2)).surface, `${where}: the empty strip at (${Math.round(gapX)}, ${Math.round(zoom.y + zoom.h / 2)}) does not reach the canvas`);
  if (phone) {
    const tools = await box(page, '[role="toolbar"][aria-label="Canvas tools"]');
    assert.ok(!tools || tools.bottom <= surface.y + 1, `${where}: on a phone the tools' strip is not above the canvas`);
  }
  if (phone) {
    assert.ok(hooks.bottom <= composer.y + 0.5 && hooks.right >= composer.right - 24, `${where}: on a phone the hooks sit above the composer at the right ${JSON.stringify(round(hooks))} ${JSON.stringify(round(composer))}`);
  } else {
    assert.ok(Math.abs(hooks.bottom - composer.bottom) <= 2, `${where}: the hooks' bottom ${Math.round(hooks.bottom)} is not the composer's ${Math.round(composer.bottom)}`);
    assert.ok(hooks.x >= composer.right - 0.5, `${where}: the hooks are not right of the composer`);
    assert.ok(minimap, `${where}: a minimap`);
    assert.ok(minimap.bottom <= zoom.y + 0.5 && zoom.y - minimap.bottom <= 12 && Math.abs(minimap.x - zoom.x) <= 1.5, `${where}: the minimap ${JSON.stringify(round(minimap))} is not directly above the zoom row ${JSON.stringify(round(zoom))}`);
    assert.ok(minimap.right <= composer.x + 0.5, `${where}: the minimap is not left of the composer`);
  }
  // The Voice and Tutor caption's stack never holds the hooks now.
  assert.equal(await page.locator('[data-left-stack] [data-next-steps]').count(), 0, `${where}: hooks in the left stack`);
  // Zoom to fit (the minimap's Back to content; Shift+1 on a phone, where the minimap is the tools' strip's) frames every
  // card clear of the floating chrome.
  if (minimap) await page.getByRole('button', { name: 'Back to content' }).first().click();
  else {
    await page.mouse.click(gapX, zoom.y + zoom.h / 2); // the empty strip: the canvas takes focus from the composer
    await page.keyboard.press('Shift+Digit1');
  }
  await page.waitForTimeout(500);
  const chrome = [['composer', composer], ['hooks', hooks], ['minimap and zoom', stack]];
  const cards = await page.evaluate(() => [...document.querySelectorAll('[data-canvas-surface] [data-block-id]')].map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.blockId, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }));
  assert.ok(cards.length >= 8, `${where}: ${cards.length} cards`);
  for (const card of cards) for (const [name, b] of chrome) assert.ok(disjoint(card, b), `${where}: after zoom to fit, card ${card.id} ${JSON.stringify(round(card))} is under the ${name} ${JSON.stringify(round(b))}`);
  for (const card of cards) assert.ok(card.y >= surface.y - 1 && card.bottom <= surface.bottom + 1, `${where}: after zoom to fit, card ${card.id} is off the canvas`);
};
const ready = page => page.locator('[data-hooks-slot] section[data-next-steps="ready"]').waitFor({ timeout: 60000 });
// A board's load notice is a passing toast; the screenshots wait it out so they show the chrome itself.
const settle = page => page.getByText('You are seeing the latest saved version of this board.').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

for (const [label, viewport, phone] of [['1440', { width: 1440, height: 900 }, false], ['1024', { width: 1024, height: 768 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  await check(`owned canvas at ${label}: the canvas runs under the floating strip; the minimap above the zoom row, the hooks right of the composer on its baseline${phone ? ' (a phone: above it, at the right)' : ''}; the controls take the pointer, the empty strip passes it on; a fit clears the chrome`, async () => {
    const page = await open(owner, `/apps/${canvas.name}`, viewport);
    await page.locator('[data-block-id="c-1"]').waitFor({ timeout: 60000 });
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
    await ready(page);
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
  await ready(page);
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
  await ready(page);
  const seen = await page.evaluate(() => window.__seen);
  assert.ok(seen.every(state => state.status === 'ready' ? state.hooks === 3 : state.hooks === 0 && state.rows === 3 && state.busy === 'true'), `never a previous hook while loading: ${JSON.stringify(seen.slice(0, 6))}`);
  await page.context().close();
});

const tripwire = await Promise.all([BASE, CP].map(async origin => (await (await fetch(`${origin}/__provider-tripwire`)).json().catch(() => ({ hits: [] }))).hits.length));
await check('no page errors, nothing sent, the provider tripwire at 0', async () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(sent, []);
  assert.deepEqual(tripwire, [0, 0]);
});
await browser.close();
console.log(`${results.length}/7 checks passed`);
process.exit(results.length === 7 ? 0 : 1);
