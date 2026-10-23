// The Share canvas dialog (owner brief 2026-10-22; docs/features/canvas-sharing.md, explore-publish.md), against the LOCAL stack
// only: local D1 and fresh browser profiles. No model calls; prints no secrets.
// Covers: opening and switching tabs write nothing; tablist keyboard; the three access modes against the server's own fields;
// a failed save reverts to what the server holds; clipboard failure; Explore and the share link are independent; Remove from
// Explore asks first; Embed refuses a restricted link and sends you to the access dropdown; reload and canvas switching; Escape
// returns focus; a narrow screen and both themes.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/share-dialog-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('share-dialog-check runs against the local stack only');
const SHOTS = process.argv[2] || 'share-dialog-shots';
mkdirSync(SHOTS, { recursive: true });
const TOTAL = 12;
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`dlg-owner-${run}@example.com`, `dlg_${run}`) };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'd1', type: 'explanation', dx: 0, dy: 0, title: 'Refraction', body: 'Light bends at a boundary.' }] };

const TITLE = `Dialog ${run}`, OTHER = `Dialog two ${run}`;
const made = async title => (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;
const one = await made(TITLE), two = await made(OTHER);
const catalog = (await api('/api/apps')).body;
const SEEDS = Object.fromEntries([one, two].map(x => [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${x.name}:ink`, STATE]));
const sharing = async () => (await api(`/api/learn/boards/${one.name}/main`)).body.sharing;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await context.addInitScript(seeds => { for (const [k, v] of Object.entries(seeds)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, SEEDS);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Every write the page makes to sharing or publication, so "opening changes nothing" is asserted on the wire.
const writes = [];
page.on('request', request => { if (request.method() !== 'GET' && /\/share$|\/publish$|\/unpublish$|\/comment-settings$|\/members/.test(new URL(request.url()).pathname)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const dialog = page.getByRole('dialog', { name: 'Share canvas' });
const tab = name => dialog.getByRole('tab', { name });
const access = dialog.getByLabel('Who can open this?');
const open = async name => {
  await page.goto(`${BASE}/apps/${name}`);
  await page.locator('[data-share-button]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator('[data-share-button]').click();
  await dialog.waitFor();
};

await open(one.name);
await check('1 opening the dialog and visiting every tab writes nothing; the canvas title sits under the heading', async () => {
  assert.equal(await dialog.locator('h2').innerText(), 'Share canvas');
  assert.equal(await dialog.locator('p[title]').first().innerText(), TITLE);
  assert.deepEqual(await dialog.getByRole('tab').allInnerTexts(), ['Share', 'Explore', 'Embed']);
  for (const name of ['Explore', 'Embed', 'Share']) { await tab(name).click(); await page.waitForTimeout(300); }
  assert.deepEqual(writes, [], 'no share, publish or comment write');
  const before = await sharing();
  assert.ok(!before.shared && !before.view && !before.public_view && !before.published, JSON.stringify(before));
});
await check('2 tablist keyboard: arrows, Home and End move focus and selection', async () => {
  await tab('Share').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Explore').getAttribute('aria-selected'), 'true');
  assert.ok(await tab('Explore').evaluate(node => node === document.activeElement), 'focus follows');
  await page.keyboard.press('End');
  assert.equal(await tab('Embed').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Share').getAttribute('aria-selected'), 'true', 'wraps');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await tab('Embed').getAttribute('aria-selected'), 'true', 'wraps back');
  await page.keyboard.press('Home');
  assert.equal(await tab('Share').getAttribute('aria-selected'), 'true');
});
await check('3 invited only: the dropdown says so, no link is shown as working', async () => {
  assert.equal(await access.inputValue(), 'invited');
  assert.equal(await dialog.locator('input[aria-label="Share link URL"]').count(), 0);
  await dialog.getByText('Only people you invite can open this canvas.').waitFor();
  // Owner decision 2026-10-22 (permanent share link): the rule is shown exactly, with no mention of a new link.
  await dialog.getByText('Turning sharing off blocks access through this link. Turning it back on restores access using the same link.', { exact: true }).waitFor();
  assert.deepEqual(await access.locator('option').allInnerTexts(), ['Invited people only', 'Anyone with the link · sign-in required', 'Anyone with the link · no sign-in']);
});
await check('4 a failed save reverts the dropdown to what the server holds and says so', async () => {
  await page.route('**/api/learn/boards/*/main/share', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The save failed on purpose.' }) }));
  await access.selectOption('signin');
  await dialog.getByRole('alert').getByText('The save failed on purpose.').waitFor();
  assert.equal(await access.inputValue(), 'invited', 'the UI does not claim what the server did not save');
  assert.equal(await dialog.locator('input[aria-label="Share link URL"]').count(), 0);
  await page.unroute('**/api/learn/boards/*/main/share');
  assert.equal((await sharing()).shared, false);
});
let viewToken;
await check('5 sign-in required: the server holds shared + view, not public; the link is one line with the whole URL available', async () => {
  await access.selectOption('signin');
  const link = dialog.locator('input[aria-label="Share link URL"]');
  await link.waitFor({ timeout: 15000 });
  const url = await link.inputValue();
  viewToken = url.split('/b/')[1];
  const now = await sharing();
  assert.ok(viewToken && now.shared && now.view === viewToken && now.public_view === false, JSON.stringify(now));
  assert.equal(await link.getAttribute('title'), url, 'the complete URL is available');
  assert.equal(await access.inputValue(), 'signin');
  await dialog.getByText('Anyone with the link can view this canvas after signing in. They cannot edit it.').waitFor();
  await shot('01-signin');
});
await check('6 Copy link: Copied only after the clipboard accepted it; on failure the URL is selected and a message says how to copy', async () => {
  const copy = dialog.getByRole('button', { name: 'Copy link' });
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await copy.click();
  await dialog.getByText('Copy failed.').waitFor();
  assert.equal(await dialog.getByText('Copied', { exact: true }).count(), 0, 'no Copied after a refusal');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Share link URL', 'the field is focused and selected');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }); });
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await dialog.getByText('Copied', { exact: true }).waitFor();
});
await check('7 no sign-in: public_view on the same link', async () => {
  await access.selectOption('public');
  await dialog.getByText('Anyone with the link can view this canvas without signing in. They cannot edit it.').waitFor();
  const now = await sharing();
  assert.ok(now.shared && now.public_view === true && now.view === viewToken, JSON.stringify(now));
});
await check('8 Explore is independent of the link: publish, then invited only keeps it published; Remove asks first and keeps the link', async () => {
  await tab('Explore').click();
  await dialog.locator('[data-explore-publish="private"] [data-publish]').click();
  await dialog.locator('[data-explore-publish="published"]').waitFor({ timeout: 30000 });
  await dialog.getByText('Your saved changes appear here automatically.').waitFor();
  assert.doesNotMatch(await dialog.innerText(), /snapshot|excluded/i, 'Explore is live');
  const publication = (await sharing()).publication;
  assert.ok(publication, 'published');
  await tab('Share').click();
  await access.selectOption('invited');
  await dialog.getByText('Only people you invite can open this canvas.').waitFor();
  let now = await sharing();
  assert.ok(now.shared === false && now.published === true && now.publication === publication, `invited only keeps the publication: ${JSON.stringify(now)}`);
  // One permanent link: sharing off keeps the token on the server, shows no URL as working, and turning it back on restores the same URL.
  assert.equal(now.view, viewToken, 'the token is kept while sharing is off');
  assert.equal(await dialog.locator('input[aria-label="Share link URL"]').count(), 0, 'no URL shown while sharing is off');
  await access.selectOption('signin');
  await dialog.locator('input[aria-label="Share link URL"]').waitFor();
  const link = (await sharing()).view;
  assert.equal(link, viewToken, 'the same link comes back');
  assert.equal((await dialog.locator('input[aria-label="Share link URL"]').inputValue()).split('/b/')[1], viewToken);
  await tab('Explore').click();
  await dialog.locator('[data-unpublish]').click();
  await dialog.getByRole('group', { name: 'Remove from Explore' }).waitFor();
  assert.equal((await sharing()).published, true, 'nothing is removed by the first click');
  await dialog.getByRole('group', { name: 'Remove from Explore' }).getByRole('button', { name: 'Cancel' }).click();
  await dialog.locator('[data-unpublish]').click();
  await dialog.locator('[data-confirm-unpublish]').click();
  await dialog.locator('[data-explore-publish="private"]').waitFor({ timeout: 30000 });
  now = await sharing();
  assert.ok(!now.published && now.shared && now.view === link, `the share link is untouched: ${JSON.stringify(now)}`);
});
await check('9 Embed: a sign-in link cannot be embedded; Change link access returns to the dropdown; nothing was made public', async () => {
  await tab('Embed').click();
  const change = dialog.locator('[data-embed-change-access]');
  await change.waitFor();
  assert.equal((await sharing()).public_view, false, 'opening Embed changed nothing');
  await change.click();
  assert.equal(await tab('Share').getAttribute('aria-selected'), 'true');
  assert.ok(await access.evaluate(node => node === document.activeElement), 'the access dropdown has focus');
});
await check('10 reload keeps the access; another canvas shows its own state, never this one\'s', async () => {
  await page.reload();
  await page.locator('[data-share-button]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator('[data-share-button]').click();
  assert.equal(await access.inputValue(), 'signin');
  await open(two.name);
  assert.equal(await dialog.locator('p[title]').first().innerText(), OTHER);
  assert.equal(await access.inputValue(), 'invited');
  assert.equal(await dialog.locator('input[aria-label="Share link URL"]').count(), 0);
});
await check('11 Escape closes the dialog and focus returns to the Share button', async () => {
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.ok(await page.locator('[data-share-button]').evaluate(node => node === document.activeElement), 'focus returns');
  await page.locator('[data-share-button]').click();
  await dialog.waitFor();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Share canvas"]')), 'Tab stays inside the dialog');
});
await check('12 a narrow screen makes it a near full width sheet; both themes keep it readable', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  const box = await dialog.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.width >= 350, JSON.stringify(box));
  await shot('02-narrow-light');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const bg = await dialog.evaluate(node => getComputedStyle(node).backgroundColor);
  assert.notEqual(bg, 'rgb(255, 255, 255)', 'the dark theme repaints the surface');
  await shot('03-narrow-dark');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.setViewportSize({ width: 1440, height: 900 });
});

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log(`${results.length}/${TOTAL} checks passed`);
process.exit(results.length === TOTAL ? 0 : 1);
