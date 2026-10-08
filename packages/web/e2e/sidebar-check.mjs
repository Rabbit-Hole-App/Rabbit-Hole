// The Rabbit Hole sidebar polish (docs/features/sidebar-polish.md), against the LOCAL stack only: local D1 and fresh
// browser profiles. No model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 node e2e/sidebar-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('sidebar-check runs against the local stack only');
const SHOTS = process.argv[2] || 'sidebar-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `yuvish-${run}@example.com`, secret, handle: `yu_${run}` }) })).json()).session;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
await api('/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Yuvish' }) });

const LONG = 'Backpropagation through time, unrolled step by step for a small recurrent network';
const TITLES = ['Logistic regression', LONG, 'Attention from scratch', 'Optics', 'Tokenizers', 'Softmax temperature'];
const made = [];
for (const title of TITLES) made.push((await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body);
const binned = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Old notes ${run}` }) })).body;
const RECENT = made.map(c => c.name);

const browser = await chromium.launch();
const fresh = async (options = {}, init = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(([recent, init]) => {
    localStorage.setItem('small.recent', JSON.stringify(recent));
    for (const [k, v] of Object.entries(init)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, [RECENT, init]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const errors = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name, clip = { x: 0, y: 0, width: 720, height: 900 }) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png`, clip }); console.log('shot', name); };
const aside = page => page.locator('aside[data-sidebar]');
const mode = async (page, m) => { await page.locator(`aside[data-sidebar="${m}"]`).waitFor({ timeout: 30000 }); await page.waitForTimeout(400); };
const open = async (page, path) => { await page.goto(`${BASE}${path}`); await aside(page).locator('[data-account-menu]').waitFor({ timeout: 60000 }); await page.waitForTimeout(800); };
const box = async locator => locator.boundingBox();
const btn = (page, name) => aside(page).getByRole('button', { name, exact: true });
const tipText = page => page.locator('[data-sidebar-tip]').innerText();
const width = async page => (await box(aside(page))).width;
const NAV = ['Search', 'Notifications', 'Home', 'Library', 'Explore'];
const RAIL = ['Account menu', 'Expand sidebar', ...NAV, 'Trash', 'Feedback'];

const page = await fresh();
await open(page, '/apps');
await mode(page, 'expanded');

await check('1 expanded is 260-280px; the account row is the only top anchor: no product mark, 32-36px avatar, 52-56px row, Yuvish', async () => {
  const w = await width(page);
  assert.ok(w >= 260 && w <= 280, `expanded width ${w}`);
  assert.equal(Math.round((await box(page.locator('[data-shell-sidebar]'))).width), Math.round(w));
  const account = btn(page, 'Account menu');
  assert.match(await account.innerText(), /^Y\s+Yuvish$/);
  assert.equal(await aside(page).locator('img[src*="favicon"]').count(), 0, 'a product mark beside the person');
  assert.ok(!(await aside(page).innerText()).includes('Rabbit Hole'), 'a Rabbit Hole name row');
  const a = await box(account);
  for (const b of await aside(page).locator('button, [role="link"]').all()) if (await b.isVisible()) assert.ok((await box(b)).y >= a.y - 1, 'something sits above the account row');
  const avatar = await box(account.locator(':scope > *').first());
  assert.ok(avatar.width >= 32 && avatar.width <= 36 && avatar.height >= 32 && avatar.height <= 36, `avatar ${avatar.width}x${avatar.height}`);
  const row = await box(account.locator('xpath=..'));
  assert.ok(row.height >= 52 && row.height <= 56, `account row ${row.height}`);
  const collapse = await box(btn(page, 'Collapse sidebar'));
  assert.ok(collapse.x > a.x + a.width - 4 && Math.abs((collapse.y + collapse.height / 2) - (a.y + a.height / 2)) <= 2, 'the panel control is not at the right of the account row');
});
await shot(page, 'A-expanded');

// Recent shows the top two and no View all (owner, 2026-10-08).
await check('2 expanded order: Search, Notifications, Home, Library, Explore, RECENT, then Trash and Feedback; no Private list; two Recent rows, no View all, no title twice', async () => {
  const ys = [];
  for (const name of NAV) ys.push((await box(btn(page, name))).y);
  const recent = aside(page).getByRole('region', { name: 'Recent' });
  ys.push((await box(recent)).y, (await box(btn(page, 'Trash'))).y, (await box(aside(page).locator('[data-feedback]'))).y);
  assert.equal(await aside(page).getByRole('button', { name: 'View all' }).count(), 0, 'no View all');
  assert.deepEqual([...ys].sort((p, q) => p - q), ys, `order ${ys}`);
  assert.equal(await aside(page).getByRole('region', { name: 'Private' }).count(), 0);
  assert.ok(!/\bPrivate\b/i.test(await aside(page).innerText()), 'Private still listed');
  assert.match(await recent.locator('[aria-label="Collapse Recent"]').innerText(), /^RECENT$/);
  const rows = await aside(page).locator('[role="link"]').allInnerTexts();
  assert.equal(await recent.locator('[role="link"]').count(), 2);
  assert.equal(new Set(rows).size, rows.length, `a canvas twice: ${rows}`);
});

await check('3 Recent rows are one line; a long title truncates and its full title shows on hover after a short delay', async () => {
  const row = aside(page).locator('[role="link"]').filter({ hasText: 'Backpropagation' });
  const r = await box(row);
  assert.ok(r.height <= 34, `row ${r.height}px`);
  assert.ok(await row.locator('span.truncate').evaluate(el => el.scrollWidth > el.clientWidth), 'the long title is not truncated');
  await row.hover();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-sidebar-tip]').count(), 0, 'the tooltip had no delay');
  await page.locator('[data-sidebar-tip]').waitFor({ timeout: 1500 });
  assert.equal(await tipText(page), LONG);
});
await shot(page, 'G-recent-truncation');
await page.mouse.move(900, 600);

await check('4 Home is current on Home: a tinted surface, stronger text and a 2-3px bar on the left, not a blue block', async () => {
  const home = btn(page, 'Home');
  assert.equal(await home.getAttribute('aria-current'), 'page');
  const bar = await box(home.locator('[data-here-bar]'));
  const h = await box(home);
  assert.ok(bar.width >= 2 && bar.width <= 3 && Math.abs(bar.x - h.x) <= 1, `bar ${bar.width}px at ${bar.x - h.x}`);
  const style = await home.evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, weight: +s.fontWeight }; });
  assert.notEqual(style.bg, 'rgba(0, 0, 0, 0)', 'no tinted surface');
  assert.ok(!/35, 131, 226/.test(style.bg), 'a blue block');
  assert.ok(style.weight >= 500, 'the text is not stronger');
  assert.equal(await btn(page, 'Library').locator('[data-here-bar]').count(), 0);
});
await shot(page, 'C-home-active', { x: 0, y: 0, width: 360, height: 420 });

await check('5 the account menu opens from the avatar: Settings and Log out, a subtle ring while open', async () => {
  await btn(page, 'Account menu').click();
  assert.equal(await btn(page, 'Account menu').getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
});
await shot(page, 'F-account-menu', { x: 0, y: 0, width: 720, height: 420 });
await page.keyboard.press('Escape');

await check('6 Library (Recent has no View all) opens the Library, where Library is current with the same treatment', async () => {
  await btn(page, 'Library').click();
  await page.waitForURL(/\/library$/);
  await page.waitForTimeout(600);
  const library = btn(page, 'Library');
  assert.equal(await library.getAttribute('aria-current'), 'page');
  assert.equal(await library.locator('[data-here-bar]').count(), 1);
  assert.equal(await btn(page, 'Home').getAttribute('aria-current'), null);
});
await shot(page, 'D-library-active', { x: 0, y: 0, width: 360, height: 420 });

await check('7 Collapse sidebar (the panel icon, not a chevron) makes a 60-68px rail of 40-44px targets, navigation only, remembered after a reload', async () => {
  // The panel icon, as the canvas's right panel toggle draws it (owner, 2026-10-08).
  assert.equal(await btn(page, 'Collapse sidebar').locator('svg.lucide-panel-left-close').count(), 1);
  await btn(page, 'Collapse sidebar').click();
  await mode(page, 'rail');
  assert.equal(await btn(page, 'Expand sidebar').locator('svg.lucide-panel-left-open').count(), 1);
  const w = await width(page);
  assert.ok(w >= 60 && w <= 68, `rail width ${w}`);
  assert.equal(Math.round((await box(page.locator('[data-shell-sidebar]'))).width), Math.round(w));
  assert.equal(await page.evaluate(() => localStorage.getItem('small.sidebar')), 'closed');
  await page.reload();
  await mode(page, 'rail');
  for (const name of RAIL) {
    const b = await box(name === 'Feedback' ? aside(page).locator('[data-feedback]') : btn(page, name));
    assert.ok(b && b.x >= 0 && b.x + b.width <= w, `${name} is not on the rail`);
    if (name !== 'Expand sidebar') assert.ok(b.width >= 40 && b.width <= 44 && b.height >= 40 && b.height <= 44, `${name} target ${b.width}x${b.height}`);
  }
  assert.equal(await aside(page).getByRole('region', { name: 'Recent' }).count(), 0, 'Recent squeezed into the rail');
  assert.equal(await aside(page).locator('[role="link"]').count(), 0, 'canvases on the rail');
  for (const t of TITLES) assert.ok(!(await aside(page).innerText()).includes(t.slice(0, 12)), `${t} on the rail`);
});
await shot(page, 'B-collapsed-rail');

await check('8 every rail control has a tooltip on hover after ~400ms, beside the rail', async () => {
  for (const name of RAIL) {
    await page.mouse.move(900, 600);
    await page.waitForTimeout(100);
    await (name === 'Feedback' ? aside(page).locator('[data-feedback]') : btn(page, name)).hover();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-sidebar-tip]').count(), 0, `${name}: no delay`);
    await page.locator('[data-sidebar-tip]').waitFor({ timeout: 1500 });
    assert.equal(await tipText(page), name);
    assert.ok((await box(page.locator('[data-sidebar-tip]'))).x >= await width(page), `${name}: the tooltip covers the rail`);
  }
  await page.mouse.move(900, 600);
  await btn(page, 'Library').hover();
  await page.locator('[data-sidebar-tip]').waitFor({ timeout: 1500 });
});
await shot(page, 'E-rail-tooltip', { x: 0, y: 0, width: 360, height: 420 });

await check('9 keyboard: Tab reaches the rail controls, focus shows the tooltip, Esc hides it', async () => {
  await page.mouse.move(900, 600);
  await btn(page, 'Search').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Home');
  await page.locator('[data-sidebar-tip]').waitFor({ timeout: 1500 });
  assert.equal(await tipText(page), 'Home');
  await page.keyboard.press('Escape');
  await page.locator('[data-sidebar-tip]').waitFor({ state: 'detached', timeout: 1500 });
});

await check('10 no hover auto-expand: resting on and crossing the rail keeps it a rail', async () => {
  await page.mouse.move(30, 300);
  await page.waitForTimeout(500);
  await page.mouse.move(30, 700, { steps: 10 });
  await page.mouse.move(200, 400, { steps: 10 });
  await page.mouse.move(30, 400, { steps: 10 });
  await page.waitForTimeout(900);
  assert.equal(await aside(page).getAttribute('data-sidebar'), 'rail');
  const w = await width(page);
  assert.ok(w >= 60 && w <= 68, `rail grew to ${w}`);
});

await check('11 Trash from the rail lists a trashed canvas with Restore and the footer copy; Restore brings it back', async () => {
  assert.equal((await api(`/api/apps/${binned.name}/trash`, { method: 'POST', body: '{}' })).status, 200);
  await page.mouse.move(900, 600);
  await btn(page, 'Trash').click();
  const trash = page.getByRole('dialog', { name: 'Trash' });
  await trash.getByText(`Old notes ${run}`).waitFor({ timeout: 10000 });
  assert.match(await trash.innerText(), /Items stay in Trash until you restore them\. Nothing here is deleted\./);
  await trash.getByText(`Old notes ${run}`).hover();
  await trash.getByRole('button', { name: 'Restore' }).first().click();
  await page.waitForTimeout(1200);
  assert.ok(!(await api('/api/library/trash')).body.items.some(i => i.name === binned.name), 'still in Trash');
  await trash.getByRole('button', { name: 'Close' }).click();
});

await check('12 Expand sidebar returns to the expanded width, remembered after a reload; Trash opens from there too', async () => {
  await btn(page, 'Expand sidebar').click();
  await mode(page, 'expanded');
  const w = await width(page);
  assert.ok(w >= 260 && w <= 280, `expanded width ${w}`);
  assert.equal(await page.evaluate(() => localStorage.getItem('small.sidebar')), 'open');
  await page.reload();
  await mode(page, 'expanded');
  await btn(page, 'Trash').click();
  const trash = page.getByRole('dialog', { name: 'Trash' });
  await trash.waitFor();
  assert.match(await trash.innerText(), /Nothing here is deleted/);
  await trash.getByRole('button', { name: 'Close' }).click();
});
await page.context().close();

await check('13 reduced motion: the collapse and expand have no transition', async () => {
  const p = await fresh({ reducedMotion: 'reduce' });
  await open(p, '/apps');
  const t = await p.evaluate(() => [document.querySelector('aside[data-sidebar]'), document.querySelector('[data-shell-sidebar]')].map(el => getComputedStyle(el).transitionProperty));
  assert.deepEqual(t, ['none', 'none']);
  await p.context().close();
});

await check('14 dark theme: a dark sidebar surface with light text, expanded and as a rail', async () => {
  const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  for (const closed of [false, true]) {
    const p = await fresh({}, { 'small.theme': 'dark', 'small.sidebar': closed ? 'closed' : 'open' });
    await open(p, '/library');
    await mode(p, closed ? 'rail' : 'expanded');
    const [bg, fg] = await btn(p, 'Home').evaluate(el => [getComputedStyle(el.closest('aside')).backgroundColor, getComputedStyle(el).color]);
    assert.ok(lum(bg) < 0.2 && lum(fg) > 0.55, `dark ${closed ? 'rail' : 'sidebar'}: bg ${bg}, text ${fg}`);
    await shot(p, closed ? 'H-dark-rail' : 'H-dark-expanded');
    await p.context().close();
  }
});

await check('15 a phone gets no permanent rail, even with the rail remembered; the menu button opens the drawer', async () => {
  const p = await fresh({ viewport: { width: 390, height: 844 } }, { 'small.sidebar': 'closed' });
  await p.goto(`${BASE}/apps`);
  await p.getByRole('button', { name: 'Open sidebar', exact: true }).waitFor({ timeout: 60000 });
  await p.waitForTimeout(800);
  assert.ok(!(await p.locator('aside').isVisible()), 'a rail shows at 390px');
  await p.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await mode(p, 'expanded');
  await p.context().close();
});

await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/16 checks passed`);
process.exit(results.length === 16 ? 0 : 1);
