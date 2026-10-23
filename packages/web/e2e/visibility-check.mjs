// The owned-card Card options menu, Share and Library trash (docs/features/visibility-menu.md, library-trash.md), against the LOCAL stack
// only: local D1 and fresh browser profiles. No model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/visibility-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('visibility-check runs against the local stack only');
const SHOTS = process.argv[2] || 'visibility-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`vis-owner-${run}@example.com`, `vis_${run}`) };
const viewer = { session: await sessionFor(`vis-viewer-${run}@example.org`, `visv_${run}`) };
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'v1', type: 'explanation', dx: 0, dy: 0, title: 'Refraction', body: 'Light bends at a boundary.' }] };

const TITLE = `Optics ${run}`, OTHER = `Waves ${run}`;
const c = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
const other = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: OTHER }) })).body;
const catalog = (await api(owner, '/api/apps')).body;
const SEEDS = Object.fromEntries([c, other].map(x => [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${x.name}:ink`, STATE]));
const row = async () => (await api(owner, `/api/apps/${c.name}`)).body;
const explore = async () => (await api(viewer, '/api/learn/boards/published')).body.canvases.map(x => x.title);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
await context.addInitScript(seeds => { for (const [k, v] of Object.entries(seeds)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, SEEDS);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const card = title => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const library = async () => { await page.goto(`${BASE}/library?type=canvases`); await page.locator('[data-library-card]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(500); };
const menuOf = async title => { await card(title).hover(); await card(title).getByTitle('Card options').click(); await page.getByRole('button', { name: 'Rename', exact: true }).waitFor(); };
const button = name => page.getByRole('button', { name, exact: true });
// Owner brief 2026-10-22: access is managed inside the Share window (no Visibility dropdown in the Card options menu). These helpers
// drive that window: the link mode is its "Who can open this?" select, Explore publication is its own tab.
const shareDialog = page.locator('[data-share-dialog]').getByRole('dialog', { name: 'Share canvas' });
const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (await fn()) return; await page.waitForTimeout(250); } assert.fail(`never reached: ${what}`); };
const openShare = async title => {
  await menuOf(title);
  await button('Share').click();
  await shareDialog.waitFor({ timeout: 60000 });
  await until(() => shareDialog.getByLabel('Who can open this?').isEnabled(), 'the Share window has loaded');
};
const closeShare = async () => { await page.keyboard.press('Escape'); await page.locator('[data-share-dialog]').waitFor({ state: 'detached' }); };
const linkMode = async (title, mode) => {
  await openShare(title);
  await shareDialog.getByLabel('Who can open this?').selectOption(mode);
  await until(() => shareDialog.getByLabel('Who can open this?').isEnabled(), 'the link mode is saved');
  await closeShare();
};
const publish = async (title, on) => {
  await openShare(title);
  await shareDialog.getByRole('tab', { name: 'Explore' }).click();
  if (on) await shareDialog.locator('[data-publish]').click();
  else { await shareDialog.locator('[data-unpublish]').click(); await shareDialog.locator('[data-confirm-unpublish]').click(); }
  await shareDialog.locator(`[data-explore-publish="${on ? 'published' : 'private'}"]`).waitFor({ timeout: 30000 });
  await closeShare();
};

await library();
await check('1 the owned canvas Card options menu is the owner\'s menu, in order; no Visibility, Copy link, Archive or snapshot row', async () => {
  await menuOf(TITLE);
  const labels = (await page.locator('[role="menu"] button, .shadow-pop button').allInnerTexts()).map(l => l.trim());
  const order = labels.filter(l => ['Rename', 'Edit description', 'Duplicate', 'Change cover', 'Share', 'Move to Trash'].includes(l));
  assert.deepEqual(order, ['Rename', 'Edit description', 'Duplicate', 'Change cover', 'Share', 'Move to Trash']);
  for (const gone of ['Visibility', 'Copy link', 'Archive', 'Use canvas snapshot', 'Share / Manage link', 'Change thumbnail']) assert.ok(!labels.includes(gone), `${gone} is not in the menu`);
  assert.equal(await page.locator('[data-menu-item="trash"]').count(), 1);
  assert.equal(await page.locator('[data-menu-item]').last().getAttribute('data-menu-item'), 'trash', 'Move to Trash is last');
});
await shot('01-menu');
await page.keyboard.press('Escape');
await check('2 Share shows a private canvas as Invited people only, never "Only you", and no working link', async () => {
  await openShare(TITLE);
  assert.equal(await shareDialog.getByLabel('Who can open this?').inputValue(), 'invited');
  assert.doesNotMatch(await shareDialog.innerText(), /only you/i);
  assert.equal(await shareDialog.locator('input[aria-label="Share link URL"]').count(), 0, 'no share link while it is off');
  await shot('01b-share-private');
  await closeShare();
});
await check('2b copying the private link names it as one recipients cannot open and never turns sharing on', async () => {
  await openShare(TITLE);
  const note = shareDialog.locator('[data-private-link]');
  await note.waitFor();
  assert.match(await note.innerText(), /Private link: people you send it to cannot open it\. Copying it does not share anything/);
  await note.getByRole('button', { name: 'Copy link' }).click();
  await until(async () => /Copied|Copy failed/.test(await note.innerText()), 'the copy reports its result');
  assert.equal((await row()).access, 'private', 'copying changed nothing');
  assert.equal((await api(owner, `/api/learn/boards/${c.name}/main`)).body.sharing.shared, false);
  await closeShare();
});

let shareToken;
await check('3 Invited -> link, sign-in required: a share link, still not in Explore', async () => {
  await linkMode(TITLE, 'signin');
  const now = await row();
  assert.equal(now.access, 'unlisted');
  shareToken = (await api(owner, `/api/learn/boards/${c.name}/main`)).body.sharing.view;
  assert.ok(shareToken);
  assert.ok(!(await explore()).includes(TITLE));
});
let fork;
await check('4 Publish to Explore: in Explore under the @handle, the share link kept', async () => {
  fork = (await api(viewer, '/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: shareToken }, key: `vis-fork-${run}` }) })).body;
  await publish(TITLE, true);
  assert.equal((await row()).access, 'public');
  assert.ok((await explore()).includes(TITLE));
  assert.equal((await api(viewer, `/api/learn/boards/shared/${shareToken}`)).status, 200);
});
await check('5 Remove from Explore: out of Explore and /e dies; the share link still opens', async () => {
  const token = (await row()).publication_token;
  await publish(TITLE, false);
  assert.ok(!(await explore()).includes(TITLE));
  assert.equal((await api(viewer, `/api/learn/boards/shared/${token}`)).status, 404);
  assert.equal((await api(viewer, `/api/learn/boards/shared/${shareToken}`)).status, 200);
});
await check('7 Invited people only: the link stops; forks made from it survive', async () => {
  await linkMode(TITLE, 'invited');
  await until(async () => (await row()).access === 'private', 'the canvas is private');
  assert.equal((await api(viewer, `/api/learn/boards/shared/${shareToken}`)).status, 404);
  assert.equal((await api(viewer, `/api/apps/${fork.name}`)).status, 200);
});
await check('8 Rename keeps a typed title exactly; a repeat only earns a quiet note', async () => {
  await menuOf(TITLE);
  await button('Rename').click();
  const dialog = page.getByRole('dialog', { name: 'Rename' });
  await dialog.getByLabel('Title').fill(OTHER);
  await dialog.locator('[data-same-title]').waitFor();
  await shot('03-rename-same-title');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1000);
  assert.equal((await row()).title, OTHER, 'kept exactly, no "(2)"');
  await api(owner, `/api/apps/${c.name}`, { method: 'PATCH', body: JSON.stringify({ title: TITLE }) });
  await library();
});
await check('9 Edit description: up to 500 characters, saved on the canvas', async () => {
  await menuOf(TITLE);
  await button('Edit description').click();
  const dialog = page.getByRole('dialog', { name: 'Edit description' });
  await dialog.getByLabel('Description').fill('How light bends at a boundary, hands on.');
  assert.match(await dialog.innerText(), /40\/500/);
  await shot('04-edit-description');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1000);
  assert.equal((await row()).description, 'How light bends at a boundary, hands on.');
});
// Owner, 2026-10-08: Share opens the canvas page's own Share dialog as a popup over the Library, never the canvas.
await check('10 Share opens the Share dialog as a popup over the Library; closing it leaves the Library as it was', async () => {
  const at = page.url();
  await menuOf(TITLE);
  await button('Share').click();
  const panel = page.locator('[data-share-dialog]').getByRole('dialog', { name: 'Share canvas' });
  await panel.waitFor({ timeout: 60000 });
  assert.equal(page.url(), at, 'still the Library');
  assert.equal(await page.locator('[data-library-card]').filter({ hasText: TITLE }).count(), 1, 'the Library is under the popup');
  await panel.getByLabel('Who can open this?').waitFor();
  await shot('05-share-panel');
  await page.keyboard.press('Escape');
  await page.locator('[data-share-dialog]').waitFor({ state: 'detached' });
  assert.equal(page.url(), at, 'closing it stays on the Library');
});

await check('11 Move to Trash confirms with the owner\'s words; the canvas leaves the Library; Restore brings it back unpublished', async () => {
  await library();
  await publish(TITLE, true);
  await library();
  await menuOf(TITLE);
  await button('Move to Trash').click();
  const dialog = page.getByRole('dialog', { name: 'Move this canvas to Trash?' });
  assert.match(await dialog.innerText(), /It will disappear from your Library and public\/shared access will stop\. Existing forks will not be deleted\. You can restore it from Trash\./);
  await shot('06-trash-confirm');
  await dialog.getByRole('button', { name: 'Move to Trash' }).click();
  await page.waitForTimeout(1200);
  assert.equal(await card(TITLE).count(), 0);
  assert.ok(!(await explore()).includes(TITLE), 'out of Explore');
  await page.getByRole('button', { name: 'Trash', exact: true }).first().click();
  const trash = page.getByRole('dialog', { name: 'Trash' });
  await trash.getByText(TITLE).waitFor({ timeout: 10000 });
  assert.match(await trash.innerText(), /Nothing here is deleted/);
  await shot('07-trash-list');
  await trash.getByText(TITLE).hover();
  await trash.getByRole('button', { name: 'Restore' }).first().click();
  await page.waitForTimeout(1200);
  await trash.getByRole('button', { name: 'Close' }).click();
  await library();
  await card(TITLE).waitFor();
  const now = await row();
  assert.equal(now.published, false, 'Restore never republishes');
  assert.equal(now.description, 'How light bends at a boundary, hands on.');
});
await shot('08-restored-library');
await check('12 an unlisted canvas in Trash suspends its link; Restore reactivates the same link', async () => {
  await library();
  await linkMode(OTHER, 'signin');
  const token = (await api(owner, `/api/learn/boards/${other.name}/main`)).body.sharing.view;
  await api(owner, `/api/apps/${other.name}/trash`, { method: 'POST', body: '{}' });
  assert.equal((await api(viewer, `/api/learn/boards/shared/${token}`)).status, 404);
  await api(owner, `/api/apps/${other.name}/untrash`, { method: 'POST', body: '{}' });
  assert.equal((await api(viewer, `/api/learn/boards/shared/${token}`)).status, 200);
});

await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/13 checks passed`);
process.exit(results.length === 13 ? 0 : 1);
