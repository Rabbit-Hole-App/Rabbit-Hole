// The house filled buttons' contrast in the real pages (owner 2026-10-22, "contrast yes"), against the LOCAL stack only:
// Add goal (goal management), Upload (the Context header, the action Button), Publish to Explore (Share), Start Rabbit Hole
// (another person's Explore card) and Sign in (a view link, signed out), in the light and the dark theme. For each, at rest,
// hovered, focused by the keyboard and pressed (mouse held down, released off the button so nothing is clicked), it reads
// the computed text and background colours from the DOM, composites any alpha over the surfaces behind and any brightness
// filter, and holds the WCAG 1.4.3 4.5:1 floor; focused, the focus ring is visible. Every model-capable request is aborted;
// no publish, fork, goal or sign-in happens. Prints no secrets.
// Not here (no route in the keyless stack reaches them; primary-button.test.mjs pins their classes and the fill's ratio):
// chat Run (an agent proposal), Search's Add to canvas, Check answer and Play Lesson 1 (lesson plan preview), and Invite
// (Share's People with access needs the comments worker, comments-invite-check).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/primary-button-contrast-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('primary-button-contrast-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`pbc-owner-${run}@example.com`, `pbc_${run}`) };
const other = { session: await sessionFor(`pbc-other-${run}@example.org`, `pbco_${run}`) };
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const post = (who, path, body = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body) });
const STATE = text => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.` }] });

// ---- rows: the owner's canvas (saved, with a view link anyone may open signed out), and another person's public canvas ----
const TITLE = { mine: `Contrast ${run}`, theirs: `Orbits contrast ${run}` };
const mine = await post(owner, '/api/canvases', { title: TITLE.mine });
await api(owner, `/api/learn/boards/${mine.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE('Buoyancy') }) });
const view = (await post(owner, `/api/learn/boards/${mine.name}/main/share`, { shared: true, view: true, public_view: true, state: STATE('Buoyancy') })).sharing.view;
const theirs = await post(other, '/api/canvases', { title: TITLE.theirs });
await api(other, `/api/learn/boards/${theirs.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE('Ellipses') }) });
await post(other, `/api/apps/${theirs.name}/publish`);
const goalsOf = async () => (await api(owner, `/api/learn/coaching?app=${mine.name}&board=main`)).state.goals.filter(goal => goal.lifecycle !== 'archived');

const PRIMARY = 'rgb(27, 111, 194)', HOVER = 'rgb(22, 92, 163)';
const browser = await chromium.launch();
const errors = [], model = [], writes = [];
const modelRoute = (path, method) => path === '/api/learn/ask' || path === '/api/learn/chat/route' || path.startsWith('/api/learn/tutor/') || path === '/api/learn/artifact'
  || path === '/api/learn/home-ask' || path === '/api/ask' || path.startsWith('/api/learn/inline') || (path === '/api/learn/journey' && method === 'POST');
// A press released off the button must not click it: a publish or a fork would be the proof that it did.
const clickRoute = (path, method) => method !== 'GET' && (/^\/api\/apps\/[^/]+\/publish$/.test(path) || path === '/api/learn/boards/fork');
const contextFor = async (who, theme) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.addInitScript(t => localStorage.setItem('small.theme', t), theme);
  await context.route('**/api/**', route => {
    const request = route.request(), url = new URL(request.url());
    if (modelRoute(url.pathname, request.method())) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (clickRoute(url.pathname, request.method())) { writes.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};

const total = 11;
const results = [];
const check = async (label, fn, page) => {
  try { await fn(); results.push({ label, ok: true }); console.log(`ok ${label}`); }
  catch (error) {
    results.push({ label, ok: false });
    if (page) await page.mouse.up().catch(() => {});
    console.log(`FAIL ${label} - ${String(error?.message || error).split('\n')[0].slice(0, 400)}`);
    if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {});
  }
};
// Waits for a condition the step asserts (polled, bounded), never a fixed pause.
const until = async (fn, label, ms = 15000) => { const end = Date.now() + ms; for (;;) { const value = await fn(); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${label}`); await new Promise(resolve => setTimeout(resolve, 100)); } };

// The element's colours as drawn: every CSS colour normalised through a canvas, the background composited over each
// translucent surface behind it down to the first opaque one (else white), the text over that, then any brightness filter.
const look = locator => locator.evaluate(el => {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = css => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const layers = [];
  let opacity = 1;
  for (let n = el; n; n = n.parentElement) {
    const style = getComputedStyle(n);
    opacity *= Number(style.opacity);
    const c = style.backgroundColor === 'transparent' ? { a: 0 } : rgba(style.backgroundColor);
    if (c.a > 0 && layers.at(-1)?.a !== 1) layers.push(c);
  }
  let bg = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers.reverse()) bg = over(layer, bg);
  const style = getComputedStyle(el);
  let fg = over(rgba(style.color), bg);
  if (style.filter !== 'none') {
    const m = style.filter.match(/^brightness\(([\d.]+)\)$/);
    if (!m) throw Error(`unhandled filter ${style.filter}`);
    const k = Number(m[1]), lit = c => ({ r: Math.min(255, c.r * k), g: Math.min(255, c.g * k), b: Math.min(255, c.b * k), a: 1 });
    bg = lit(bg); fg = lit(fg);
  }
  const lum = c => [c.r, c.g, c.b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [hi, lo] = [lum(fg), lum(bg)].sort((p, q) => q - p);
  const css = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  return { own: style.backgroundColor, bg: css(bg), fg: css(fg), ratio: (hi + 0.05) / (lo + 0.05), opacity, disabled: !!el.disabled,
    outline: { style: style.outlineStyle, width: parseFloat(style.outlineWidth) || 0, color: rgba(style.outlineColor).a },
    hovered: el.matches(':hover'), focused: el === document.activeElement && el.matches(':focus-visible'), pressed: el.matches(':active') };
});
// Colour transitions (transition-colors, 100ms) and a panel's fade-in: read until two reads 120ms apart agree.
const settled = async locator => { let last = null; return until(async () => { const now = await look(locator); const same = last && now.bg === last.bg && now.fg === last.fg && now.opacity === last.opacity; last = now; await new Promise(resolve => setTimeout(resolve, 120)); return same && now; }, 'colours settle', 5000); };

// The four states of one button; `rest` is its expected own fill at rest (the hover is the primary's darker fill).
async function states(page, locator, name, theme, rest) {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  await locator.scrollIntoViewIfNeeded();
  const away = async () => { await page.mouse.move(1, 1); };
  const seen = {};
  const hold = (state, value) => {
    console.log(`${theme} ${name} ${state}: ${value.fg} on ${value.bg} ${value.ratio.toFixed(2)}:1`);
    assert.equal(value.disabled, false, `${name} ${state}: enabled`);
    assert.equal(value.opacity, 1, `${name} ${state}: fully opaque`);
    assert.ok(value.ratio >= 4.5, `${theme} ${name} ${state}: ${value.ratio.toFixed(2)}:1 is under 4.5:1 (${value.fg} on ${value.bg})`);
    seen[state] = value;
  };
  await away();
  const atRest = await settled(locator);
  assert.equal(atRest.hovered || atRest.pressed, false, `${name}: at rest`);
  assert.equal(atRest.own, rest, `${theme} ${name}: its fill at rest`);
  hold('rest', atRest);

  const box = await locator.boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(...centre);
  await until(async () => (await look(locator)).hovered, `${name} hovered`);
  const hovered = await settled(locator);
  assert.equal(hovered.own, HOVER, `${theme} ${name}: the darker hover`);
  hold('hover', hovered);

  // Keyboard focus: back one stop and forward again, by the keyboard, so :focus-visible is the browser's own.
  await away();
  await locator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await until(async () => (await look(locator)).focused, `${name} keyboard-focused`);
  const focused = await settled(locator);
  assert.equal(focused.hovered, false, `${name}: focused, not hovered`);
  assert.ok(focused.outline.style !== 'none' && focused.outline.width >= 1 && focused.outline.color > 0, `${theme} ${name}: a visible focus ring (${JSON.stringify(focused.outline)})`);
  hold('focus', focused);

  // Pressed: the mouse held down on the button, then moved off and released there, so no click lands on it.
  await page.mouse.move(...centre);
  await page.mouse.down();
  await until(async () => (await look(locator)).pressed, `${name} pressed`);
  const pressed = await settled(locator);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  hold('pressed', pressed);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${theme}-${name.replace(/\W+/g, '-').toLowerCase()}.png` }).catch(() => {});
  return seen;
}

const openCanvas = async page => {
  await page.goto(`${BASE}/apps/${mine.name}`);
  await page.locator('[aria-label="Lesson canvas"]').waitFor({ timeout: 60000 });
  await page.locator('[data-chat-pane]').waitFor({ state: 'visible', timeout: 30000 });
};
const themed = async (page, theme) => assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', `the ${theme} theme is on`);

for (const theme of ['light', 'dark']) {
  const { context, page } = await contextFor(owner, theme);

  await check(`${theme}: Add goal (goal management) clears 4.5:1 at rest, hovered, focused and pressed, with a focus ring`, async () => {
    await openCanvas(page);
    await themed(page, theme);
    // A bare /goal: Enter on the open picker makes the Goal pill, and Enter again runs it (goal-command-check).
    const field = page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
    await field.click(); await field.fill('/goal'); await field.press('Enter');
    await page.locator('[data-chat-pane] [data-chat-composer] [data-command-pill="goal"]').waitFor();
    await field.press('Enter');
    const add = page.locator('[data-goal-manager] [data-goal-add-save]');
    await until(() => add.isEnabled(), 'Add goal enabled once the saved goals load');
    await states(page, add, 'Add goal', theme, PRIMARY);
  }, page);

  await check(`${theme}: Upload (the Context header) clears 4.5:1 at rest, hovered, focused and pressed, with a focus ring`, async () => {
    await openCanvas(page);
    const open = () => page.evaluate(() => ['aside[data-companion]', '[data-context-panel]'].every(s => (document.querySelector(s)?.getBoundingClientRect().width || 0) > 50));
    if (!(await open())) await page.locator('[data-panel-companion]').click({ timeout: 5000 });
    await page.locator('[data-sources-pane]').waitFor({ state: 'visible', timeout: 10000 });
    await states(page, page.locator('[data-companion-header] [data-materials-upload]'), 'Upload', theme, theme === 'dark' ? PRIMARY : 'rgb(23, 108, 206)');
  }, page);

  await check(`${theme}: Publish to Explore (Share) clears 4.5:1 at rest, hovered, focused and pressed, with a focus ring`, async () => {
    await openCanvas(page);
    await page.locator('[data-share-button]').click();
    const panel = page.getByRole('dialog', { name: 'Share canvas' });
    await panel.getByRole('tab', { name: 'Explore' }).click();
    await states(page, panel.locator('[data-publish]'), 'Publish to Explore', theme, PRIMARY);
  }, page);

  await check(`${theme}: Start Rabbit Hole (another person's Explore card) clears 4.5:1 at rest, hovered, focused and pressed, with a focus ring`, async () => {
    await page.goto(`${BASE}/explore`);
    const card = page.locator('[data-explore-card]').filter({ has: page.locator('[data-card-title]', { hasText: TITLE.theirs }) });
    await card.waitFor({ timeout: 60000 });
    await themed(page, theme);
    await states(page, card.locator('[data-card-start-rabbit-hole]'), 'Start Rabbit Hole', theme, PRIMARY);
  }, page);

  const guest = await contextFor(null, theme);
  await check(`${theme}: Sign in (a view link, signed out) clears 4.5:1 at rest, hovered, focused and pressed, with a focus ring`, async () => {
    await guest.page.goto(`${BASE}/b/${view}`);
    await themed(guest.page, theme);
    await states(guest.page, guest.page.locator('[data-sign-in]'), 'Sign in', theme, PRIMARY);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(new URL(guest.page.url()).pathname, `/b/${view}`, 'the press released off Sign in did not sign in');
  }, guest.page);
  await guest.context.close();
  await context.close();
}

await check('no press clicked: nothing published or forked, no goal added; model requests aborted', async () => {
  assert.deepEqual(writes, [], 'no publish or fork request');
  assert.equal((await goalsOf()).length, 0, 'no goal added');
  console.log(`model-capable requests aborted: ${model.length}`);
});

await browser.close();
const passed = results.filter(r => r.ok).length;
if (errors.length) console.log(`page errors (reported, not failed): ${errors.slice(0, 5).join(' | ')}`);
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
