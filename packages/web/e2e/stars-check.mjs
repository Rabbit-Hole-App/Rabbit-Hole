// Canvas Stars, the shared canvas page (docs/features/stars.md, brief Task 5 and 10), against the LOCAL stack only - it writes to
// local D1 and fresh browser profiles; never point it at a deployed worker. No model calls; prints no secrets.
//   star and unstar persist across a reload and show in a second tab; presses collapse to the last wish and the page agrees
//   with the server; the control is visible at rest, a keyboard toggle with a visible focus; a failed save restores the state
//   and says so; signed out, Star goes through sign-in and returns to this canvas, where ?star=1 stars once and leaves the
//   address; the owner may star their own canvas; a phone header keeps the control whole, 44px tall and inside the page; an
//   unpublished canvas accepts no star.
//   app:           npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/stars-local --port 8878
//   control plane: npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/stars-local --port 8879
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/stars-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('stars-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`star-owner-${run}@example.com`, `starowner_${run}`) };
const viewer = { session: await sessionFor(`star-viewer-${run}@example.org`) };
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const pageFor = async (who, viewport = { width: 1440, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- ana's published canvas: its publication opens at /e/<token> for anyone ----
const SEED = { strokes: [], links: [], items: [], blocks: [{ id: 'h1', type: 'heading', text: 'Why ice floats' }], shapes: [], exchanges: [] };
const made = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Stars check ${run}` }) })).body;
await api(owner, `/api/learn/boards/${made.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: false, state: SEED }) });
const published = (await api(owner, `/api/apps/${made.name}/publish`, { method: 'POST' })).body;
const token = published.publication_token;
check('setup: the canvas is published under a handle', !!token, JSON.stringify(published).slice(0, 200));
const PAGE = `${BASE}/e/${token}`;
const serverState = async who => (await api(who, `/api/learn/boards/shared/${token}/star`)).body;

const star = page => page.locator('header [data-star-button]');
const settled = page => page.waitForFunction(() => document.querySelector('header [data-star-button]')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
const read = async page => ({ pressed: await star(page).getAttribute('aria-pressed'), count: (await star(page).locator('[data-star-count-value]').innerText()).trim(), label: await star(page).getAttribute('aria-label') });
const open = async (who, viewport) => { const page = await pageFor(who, viewport); await page.goto(PAGE); await star(page).waitFor({ timeout: 60000 }); return page; };

// ---- 1 visible at rest, unstarred, zero shown deliberately ----
const page = await open(viewer);
const rest = await read(page);
check('visible at rest: outlined "Star" with its count, zero shown', rest.pressed === 'false' && rest.count === '0' && rest.label === 'Star, 0 stars' && (await star(page).innerText()).includes('Star'), JSON.stringify(rest));
const order = await page.evaluate(() => { const x = selector => document.querySelector(selector)?.getBoundingClientRect().left ?? null; return [x('header [data-star-button]'), x('header [data-shared-creator]'), x('header [data-fork-button]')]; });
check('Star sits left of the @handle, which stays immediately left of Fork', order[0] !== null && order[1] !== null && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
await shot(page, '01-rest');

// ---- 2 star, reload, second tab ----
await star(page).click();
await settled(page);
const starred = await read(page);
check('Star: filled "Starred", pressed, the server\'s count', starred.pressed === 'true' && starred.count === '1' && starred.label === 'Starred, 1 star' && (await star(page).innerText()).includes('Starred'), JSON.stringify(starred));
check('the server holds exactly that', JSON.stringify(await serverState(viewer)) === JSON.stringify({ starred_by_me: true, star_count: 1 }));
await shot(page, '02-starred');
await page.reload();
await star(page).waitFor();
check('after a reload it is still starred, count 1', JSON.stringify(await read(page)) === JSON.stringify(starred));
const second = await open(viewer);
await second.locator('header [data-star-button]').click();
await settled(second);
check('a second tab unstars: its own state is not starred, count 0', (await read(second)).pressed === 'false' && (await read(second)).count === '0');
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForFunction(() => document.querySelector('header [data-star-button]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 15000 });
check('the first tab shows the change when it is focused again', (await read(page)).count === '0');

// ---- 3 repeated presses: the page and the server agree, never a negative or doubled count ----
for (let i = 0; i < 5; i += 1) await star(page).click({ delay: 10 }); // odd: ends starred
await settled(page);
const after = await read(page), server = await serverState(viewer);
check('five quick presses end where the last one asked (starred), the page matching the server, count 1', after.pressed === 'true' && after.count === '1' && server.starred_by_me === true && server.star_count === 1, JSON.stringify([after, server]));

// ---- 4 keyboard: Tab reaches Star before Fork, Enter toggles, the focus is visible ----
await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
await page.evaluate(() => document.activeElement?.blur());
let focused = false;
for (let i = 0; i < 40 && !focused; i += 1) { await page.keyboard.press('Tab'); focused = await page.evaluate(() => document.activeElement?.matches('header [data-star-button]')); }
const ring = focused ? await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; }) : false;
check('Tab reaches Star with a visible focus indicator', focused && ring);
await page.keyboard.press('Enter');
await settled(page);
check('Enter unstars from the keyboard', (await read(page)).pressed === 'false' && (await read(page)).count === '0');
await page.keyboard.press('Space');
await settled(page);
check('Space stars again', (await read(page)).pressed === 'true' && (await read(page)).count === '1');

// ---- 5 a failed save restores the confirmed state and says so; a retry works ----
await page.route('**/api/learn/boards/shared/*/star', route => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The star could not be saved. Try again.' }) }) : route.continue()));
await star(page).click();
await settled(page);
check('a failed unstar puts the starred state back and says why', (await read(page)).pressed === 'true' && (await read(page)).count === '1' && await page.getByText('The star could not be saved. Try again.').first().isVisible());
await page.unroute('**/api/learn/boards/shared/*/star');
await star(page).click();
await settled(page);
check('pressing again retries and succeeds', (await read(page)).pressed === 'false' && (await serverState(viewer)).star_count === 0);

// ---- 6 the owner may star their own canvas ----
const ownerPage = await open(owner);
await ownerPage.locator('header [data-star-button]').click();
await settled(ownerPage);
check('the owner stars their own canvas: pressed, count 1', (await read(ownerPage)).pressed === 'true' && (await read(ownerPage)).count === '1');

// ---- 7 signed out: the public count, then sign-in and back ----
const guest = await open(null);
const guestRead = await read(guest);
check('signed out sees the public count, not starred', guestRead.pressed === 'false' && guestRead.count === '1');
await star(guest).click();
await guest.waitForURL(/\/login\?next=/, { timeout: 20000 });
const next = new URL(guest.url()).searchParams.get('next');
check('signed out, Star goes through sign-in and returns to this canvas with ?star=1', next === `/e/${token}?star=1`, next);
check('nothing was written before sign-in', (await serverState(viewer)).star_count === 1);
const back = await pageFor(viewer);
await back.goto(`${BASE}/e/${token}?star=1`);
await star(back).waitFor({ timeout: 60000 });
await back.waitForFunction(() => document.querySelector('header [data-star-button]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 15000 });
await settled(back);
check('back from sign-in it stars once, leaves the address, and the count is 2', (await read(back)).count === '2' && !new URL(back.url()).search.includes('star=1'), back.url());
await back.reload();
await star(back).waitFor();
check('a reload does not star again or undo it', JSON.stringify(await read(back)) === JSON.stringify({ pressed: 'true', count: '2', label: 'Starred, 2 stars' }));
await shot(back, '03-back-from-sign-in');

// ---- 8 a phone header: whole, 44px tall, inside the page, no sideways scroll ----
const phone = await open(viewer, { width: 390, height: 844 });
const box = await star(phone).boundingBox();
const layout = await phone.evaluate(() => {
  const s = document.querySelector('header [data-star-button]').getBoundingClientRect(), f = document.querySelector('header [data-fork-button]').getBoundingClientRect();
  const label = [...document.querySelectorAll('header [data-star-button] span')].find(node => !node.hasAttribute('data-star-count-value'));
  return { inside: s.left >= 0 && s.right <= innerWidth, apart: s.right <= f.left || f.right <= s.left, flat: document.documentElement.scrollWidth <= innerWidth, labelClipped: label ? label.getBoundingClientRect().width <= 1 : null };
});
check('phone: Star is inside the page, clear of Fork, at least 44px tall, and the page does not scroll sideways', layout.inside && layout.apart && layout.flat && box.height >= 43.5, JSON.stringify([layout, box]));
check('phone: the label leaves the layout, the icon, state and count stay (accessible name unchanged)', layout.labelClipped === true && (await read(phone)).label.startsWith('Star'), JSON.stringify(await read(phone)));
await shot(phone, '04-phone');

// ---- 9 a canvas that is no longer public accepts no star ----
await api(owner, `/api/apps/${made.name}/unpublish`, { method: 'POST' });
const refused = await api(viewer, `/api/learn/boards/shared/${token}/star`, { method: 'PUT' });
check('after Remove from Explore the publication token accepts no star', refused.status === 404, String(refused.status));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
