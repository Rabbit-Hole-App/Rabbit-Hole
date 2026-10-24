// Canvas Stars on the cards, the profile and the personal Stars page (docs/features/stars.md, brief Tasks 5-8 and 10), against the LOCAL
// stack only - it writes to local D1 and fresh browser profiles; never point it at a deployed worker. No model calls; prints no secrets.
//   Library: an own canvas's card carries Star with its count at rest; a press stars it, persists across a reload and never opens the card.
//   Explore: a published canvas's card carries Star; the starred state comes from the batched state route; a failed save restores the
//   confirmed state and says so; Star is a keyboard control with a visible focus; a touch screen gets a 44px target and no sideways scroll.
//   Signed out: Star goes through sign-in and back to Explore with ?star=<token>, which stars that card once and leaves the address.
//   Profile: the Stars tab is addressable (?tab=stars), counts and lists only public canvases, is the same for a signed-out visitor, and drops a
//   canvas that stopped being public - and never shows a private canvas the person starred.
//   Personal Stars: reachable from Home and the Library; lists my own, public and (after Remove from Explore) unavailable stars, the
//   unavailable one as a generic row with no title, removable; search runs over the collection.
//   app:           npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/stars-local --port 8878
//   control plane: npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/stars-local --port 8879
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/stars-surfaces-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('stars-surfaces-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const ownerHandle = `ssowner_${run}`, viewerHandle = `ssviewer_${run}`;
const owner = { session: await sessionFor(`ss-owner-${run}@example.com`, ownerHandle) };
const viewer = { session: await sessionFor(`ss-viewer-${run}@example.org`, viewerHandle) };
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const pageFor = async (who, viewport = { width: 1440, height: 900 }, extra = {}) => {
  const context = await browser.newContext({ viewport, ...extra });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- the owner's three canvases: A and C published, B private ----
const SEED = { strokes: [], links: [], items: [], blocks: [{ id: 'h1', type: 'heading', text: 'Why ice floats' }], shapes: [], exchanges: [] };
const make = async (label, publish) => {
  const title = `Stars surfaces ${run} ${label}`;
  const canvas = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
  if (!publish) return { title, name: canvas.name };
  await api(owner, `/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: false, state: SEED }) });
  const token = (await api(owner, `/api/apps/${canvas.name}/publish`, { method: 'POST' })).body?.publication_token;
  return { title, name: canvas.name, token };
};
const A = await make('A', true), B = await make('B', false), C = await make('C', true);
check('setup: A and C are published, B is private', !!A.token && !!C.token && !B.token);

const star = card => card.locator('[data-star-button]');
const settled = card => card.locator('[data-star-button][aria-busy="false"]:not([disabled])').waitFor({ timeout: 15000 });
const read = async card => ({ pressed: await star(card).getAttribute('aria-pressed'), count: (await star(card).locator('[data-star-count-value]').innerText()).trim(), label: await star(card).getAttribute('aria-label') });
const exploreCard = (page, item) => page.locator('[data-explore-card]').filter({ hasText: item.title });
const openExplore = async (page, search = `/explore`, item = A) => {
  await page.goto(`${BASE}${search}`);
  await page.locator('[data-explore-search]').fill(`Stars surfaces ${run}`);
  const card = exploreCard(page, item);
  await card.waitFor({ timeout: 60000 });
  await settled(card);
  return card;
};

// ---- 1 Library: Star at rest on the owner's own canvas, a press persists and never opens the card ----
const lib = await pageFor(owner);
await lib.goto(`${BASE}/library?type=canvases`);
await lib.locator('[data-library-search]').fill(`Stars surfaces ${run}`);
const libB = lib.locator('[data-library-card="canvas"]').filter({ hasText: B.title });
await libB.waitFor({ timeout: 60000 });
await settled(libB);
const libRest = await read(libB);
check('Library: the owner\'s card shows Star with its count at rest, zero shown, own canvas included', libRest.pressed === 'false' && libRest.count === '0' && libRest.label === 'Star, 0 stars', JSON.stringify(libRest));
await star(libB).click();
await settled(libB);
check('Library: a press stars it - Starred, count 1 - and stays on the Library', (await read(libB)).pressed === 'true' && (await read(libB)).count === '1' && new URL(lib.url()).pathname === '/library', lib.url());
check('Library: the server holds that star on the owner route', (await api(owner, `/api/apps/${B.name}`)).body?.starred_by_me === true);
await lib.reload();
await lib.locator('[data-library-search]').fill(`Stars surfaces ${run}`);
await libB.waitFor();
check('Library: after a reload it is still starred', (await read(libB)).pressed === 'true' && (await read(libB)).count === '1');
await shot(lib, '01-library-starred');

// ---- 2 Explore: a viewer's Star persists; a press does not open the card; failure restores; keyboard; touch ----
const viewerPage = await pageFor(viewer);
let cardA = await openExplore(viewerPage);
const exploreRest = await read(cardA);
check('Explore: the card shows Star with its count at rest', exploreRest.pressed === 'false' && exploreRest.count === '0' && exploreRest.label === 'Star, 0 stars', JSON.stringify(exploreRest));
await star(cardA).click();
await settled(cardA);
check('Explore: a press stars it and does not open the canvas', (await read(cardA)).pressed === 'true' && (await read(cardA)).count === '1' && new URL(viewerPage.url()).pathname === '/explore', viewerPage.url());
await shot(viewerPage, '02-explore-starred');
await viewerPage.reload();
cardA = await openExplore(viewerPage);
check('Explore: after a reload the state route shows it starred', (await read(cardA)).pressed === 'true' && (await read(cardA)).count === '1');

await viewerPage.route('**/api/learn/boards/shared/*/star', route => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The star could not be saved. Try again.' }) }) : route.continue()));
await star(cardA).click();
await settled(cardA);
check('Explore: a failed unstar puts the starred state back and says why', (await read(cardA)).pressed === 'true' && await viewerPage.getByText('The star could not be saved. Try again.').first().isVisible());
await viewerPage.unroute('**/api/learn/boards/shared/*/star');

await viewerPage.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
await viewerPage.evaluate(() => document.activeElement?.blur());
let focused = false;
for (let i = 0; i < 80 && !focused; i += 1) { await viewerPage.keyboard.press('Tab'); focused = await viewerPage.evaluate(title => !!document.activeElement?.matches('[data-explore-card] [data-star-button]') && !!document.activeElement.closest('[data-explore-card]').textContent.includes(title), A.title); }
const ring = focused ? await viewerPage.evaluate(() => { const s = getComputedStyle(document.activeElement); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; }) : false;
check('Explore: the keyboard reaches Star on the first canvas card with a visible focus indicator', focused && ring);
await viewerPage.keyboard.press('Enter');
await settled(cardA);
check('Explore: Enter unstars from the keyboard (count 0), still on Explore', (await read(cardA)).pressed === 'false' && (await read(cardA)).count === '0' && new URL(viewerPage.url()).pathname === '/explore');
await viewerPage.keyboard.press('Space');
await settled(cardA);
check('Explore: Space stars it again', (await read(cardA)).pressed === 'true' && (await read(cardA)).count === '1');

const phone = await pageFor(viewer, { width: 390, height: 844 }, { hasTouch: true });
const phoneCard = await openExplore(phone);
const phoneBox = await star(phoneCard).boundingBox();
const flat = await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
check('Explore on a phone: Star is at least 44px tall and wide and the page does not scroll sideways', phoneBox.height >= 43.5 && phoneBox.width >= 43.5 && flat, JSON.stringify([phoneBox, flat]));
await shot(phone, '03-explore-phone');

// ---- 3 signed out: sign-in and back, the card is starred once and the address is clean ----
const guest = await pageFor(null);
const guestCard = await openExplore(guest, '/explore', C);
check('signed out: the card shows the public count, not starred', (await read(guestCard)).pressed === 'false' && (await read(guestCard)).count === '0');
await star(guestCard).click();
await guest.waitForURL(/\/login\?next=/, { timeout: 20000 });
const next = new URL(guest.url()).searchParams.get('next');
check('signed out, Star goes through sign-in and returns to Explore with the card\'s own token', next === `/explore?star=${C.token}`, next);
check('nothing was written before sign-in', (await api(viewer, `/api/learn/boards/shared/${C.token}/star`)).body?.star_count === 0);
const back = await pageFor(viewer);
await back.goto(`${BASE}/explore?star=${C.token}`);
await back.locator('[data-explore-search]').fill(`Stars surfaces ${run}`);
const backCard = exploreCard(back, C);
await backCard.waitFor({ timeout: 60000 });
await backCard.locator('[data-star-button][aria-pressed="true"]').waitFor({ timeout: 15000 });
await settled(backCard);
check('back from sign-in it stars that card once, leaves the address, and the count is 1', (await read(backCard)).pressed === 'true' && (await read(backCard)).count === '1' && !new URL(back.url()).search.includes('star='), back.url());
await back.reload();
const afterReload = await openExplore(back, '/explore', C);
check('a reload does not star again or undo it', (await read(afterReload)).pressed === 'true' && (await read(afterReload)).count === '1');

// ---- 4 profile Stars tab: public only, addressable, the same signed out, follows visibility ----
const profileOf = async (page, handle, tab) => { await page.goto(`${BASE}/@${handle}${tab ? `?tab=${tab}` : ''}`); await page.locator('[data-profile-tabs]').waitFor({ timeout: 60000 }); };
const visitor = await pageFor(null);
await profileOf(visitor, viewerHandle, 'stars');
await visitor.locator('[data-profile-star-card]').first().waitFor({ timeout: 30000 });
check('profile: ?tab=stars opens the Stars tab, signed out', (await visitor.locator('[data-profile-stars-tab]').getAttribute('data-state')) === 'active');
check('profile: the tab count is the public canvases starred (A and C), and so is the list', (await visitor.locator('[data-profile-stars-count]').innerText()).trim() === '2' && await visitor.locator('[data-profile-star-card]').count() === 2);
check('profile: each card carries Star and its actual creator', await visitor.locator('[data-profile-star-card] [data-star-button]').count() === 2 && (await visitor.locator('[data-profile-star-card] [data-creator]').first().innerText()).includes(ownerHandle));
await shot(visitor, '04-profile-stars');
await visitor.locator('[data-profile-tabs]').getByRole('tab', { name: 'Canvases' }).click();
check('profile: the Canvases tab drops the tab from the address and keeps the profile', !new URL(visitor.url()).search.includes('tab=') && new URL(visitor.url()).pathname === `/@${viewerHandle}`, visitor.url());
await visitor.locator('[data-profile-tabs]').getByRole('tab', { name: /^Stars/ }).click();
check('profile: the Stars tab puts ?tab=stars in the address', new URL(visitor.url()).searchParams.get('tab') === 'stars');

const ownerProfile = await pageFor(null);
await profileOf(ownerProfile, ownerHandle, 'stars');
await ownerProfile.locator('[data-profile-stars-empty]').waitFor({ timeout: 30000 });
const ownerHtml = await ownerProfile.content();
check('profile: the owner starred only a private canvas - the public Stars tab is empty, counts 0 and never names it', (await ownerProfile.locator('[data-profile-stars-count]').innerText()).trim() === '0' && !ownerHtml.includes(B.title) && !ownerHtml.includes(B.name));

// ---- 5 personal Stars: reachable from Home and Library, own and public entries, an unavailable one, Remove, search ----
const home = await pageFor(viewer);
await home.goto(`${BASE}/apps`);
await home.locator('[data-open-stars]').waitFor({ timeout: 60000 });
await home.locator('[data-open-stars]').click();
await home.waitForURL(/\/library\?view=stars/, { timeout: 20000 });
await home.locator('[data-stars-list]').waitFor({ timeout: 30000 });
check('Home has a Stars button that opens the personal Stars page', new URL(home.url()).searchParams.get('view') === 'stars');
await home.goto(`${BASE}/library`);
await home.locator('[data-open-stars]').waitFor({ timeout: 60000 });
await home.locator('[data-open-stars]').click();
await home.waitForURL(/\/library\?view=stars/, { timeout: 20000 });
await home.locator('[data-star-card]').first().waitFor({ timeout: 30000 });
check('the Library has the same Stars button, to the same page', await home.locator('[data-star-card="public"]').count() === 2 && (await home.locator('[data-stars-count]').innerText()).trim() === '2 stars');
check('every entry shows Star as pressed, with no Card options (Rename, Delete, publishing and folders belong to the owner alone)', await home.locator('[data-star-card] [data-star-button][aria-pressed="true"]').count() === 2 && await home.locator('[data-star-card] [aria-label="Card options"]').count() === 0);
await shot(home, '05-personal-stars');

await api(owner, `/api/apps/${C.name}/unpublish`, { method: 'POST' });
const publicStars = (await api(null, `/api/learn/creators/${viewerHandle}`)).body;
check('after Remove from Explore the public profile count drops to 1 and the canvas leaves the list', publicStars?.starred_count === 1 && (await api(null, `/api/learn/creators/${viewerHandle}/stars`)).body?.starred?.length === 1);
await home.reload();
await home.locator('[data-star-unavailable]').waitFor({ timeout: 30000 });
const unavailableText = await home.locator('[data-star-unavailable]').innerText();
const page5 = await home.content();
check('personal Stars: the lost canvas is one generic "Canvas unavailable" row, counted, with no title', unavailableText.includes('Canvas unavailable') && !page5.includes(C.title) && (await home.locator('[data-stars-count]').innerText()).trim() === '2 stars, 1 unavailable');
await home.locator('[data-stars-search]').fill('Stars surfaces');
await home.locator('[data-star-card="public"]').first().waitFor();
await home.waitForTimeout(600);
check('search covers the accessible stars only, so the unavailable one never matches', await home.locator('[data-star-card]').count() === 1 && await home.locator('[data-star-unavailable]').count() === 0);
await home.locator('[data-stars-search]').fill('');
await home.locator('[data-star-unavailable]').waitFor({ timeout: 15000 });
await home.locator('[data-star-remove]').click();
await home.locator('[data-star-unavailable]').waitFor({ state: 'detached', timeout: 15000 });
check('Remove clears the unavailable row, and the server holds one star', (await home.locator('[data-stars-count]').innerText()).trim() === '1 star' && (await api(viewer, '/api/learn/stars')).body?.total === 1);

const mine = await pageFor(owner);
await mine.goto(`${BASE}/library?view=stars`);
const ownEntry = mine.locator('[data-star-card="owner"]').filter({ hasText: B.title });
await ownEntry.waitFor({ timeout: 60000 });
check('personal Stars: the owner\'s own starred canvas opens from its own route and is starred', (await ownEntry.locator('[data-card-title]').getAttribute('href')) === `/apps/${B.name}` && (await read(ownEntry)).pressed === 'true');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
