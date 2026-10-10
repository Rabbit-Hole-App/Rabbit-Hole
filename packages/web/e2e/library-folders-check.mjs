// Library folders (docs/features/library-folders.md), against the LOCAL stack only: local D1 and fresh browser profiles.
// No model is called and nothing is sent from a composer; the stack's provider tripwire must read 0 at the end. Prints no
// secrets. Canvases only: importing a project needs the indexer, which the keyless stack has none of (the control-plane
// unit test files a project).
// Usage: BASE=http://127.0.0.1:8908 SMALL_CP=http://127.0.0.1:8909 node e2e/library-folders-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8908';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8909';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('library-folders-check runs against the local stack only');
const SHOTS = process.argv[2] || 'library-folders-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`fld-owner-${run}@example.com`, `fld_${run}`) };
const other = { session: await sessionFor(`fld-other-${run}@example.org`, `fldo_${run}`) };
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const folders = async (who = owner) => (await api(who, '/api/library/folders')).body;

const T = { optics: `Optics ${run}`, waves: `Waves ${run}`, prisms: `Prisms ${run}` };
const made = {};
for (const [key, title] of Object.entries(T)) made[key] = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).body;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (name, p = page) => { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/folders-${name}.png` }); console.log('shot', name); };
const settle = () => page.waitForTimeout(900);
const card = (title, p = page) => p.locator('[data-library-card="canvas"]').filter({ has: p.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const cards = (p = page) => p.locator('[data-library-card]');
const tile = (name, p = page) => p.locator('[data-folder-tile]').filter({ has: p.locator('[data-folder-name]', { hasText: new RegExp(`^${name}$`) }) });
const tileMore = (name) => tile(name).locator('xpath=..').locator('[data-folder-more]');
const library = async (search = '', p = page) => { await p.goto(`${BASE}/library${search}`); await p.locator('h1').waitFor(); await p.waitForTimeout(800); };
const cardMenu = async (title) => { await card(title).hover(); await card(title).getByTitle('More').click(); await page.locator('[data-menu-folder]').waitFor(); };
const dialog = (name) => page.getByRole('dialog', { name });
const edge = async (name) => tile(name).locator('span[aria-hidden="true"]').first().evaluate(el => getComputedStyle(el).backgroundColor);
const byName = async (name) => (await folders()).folders.find(f => f.name === name);

await library();
let papers;
await check('1 New folder beside the filters: a name, the six swatches, Create; the tile shows the colour and 0 items', async () => {
  await page.locator('[data-new-folder]').click();
  await dialog('New folder').waitFor();
  assert.equal(await dialog('New folder').locator('[data-swatch]').count(), 6);
  assert.equal(await dialog('New folder').getByRole('button', { name: 'Create' }).isDisabled(), true, 'no name, no folder');
  await dialog('New folder').getByLabel('Folder name').fill('  Reading   list ');
  await dialog('New folder').locator('[data-swatch][aria-label="Green"]').click();
  await shot('01-new-folder-dialog');
  await dialog('New folder').getByRole('button', { name: 'Create' }).click();
  await tile('Reading list').waitFor();
  assert.match(await tile('Reading list').locator('[data-folder-count]').innerText(), /^0 items$/);
  assert.equal(await edge('Reading list'), 'rgb(26, 127, 55)');
  papers = await byName('Reading list');
  assert.equal(papers.color, '#1a7f37');
  assert.equal(await page.locator('[data-new-folder]').count(), 1, 'the header still offers New folder');
});
await check('2 Rename from the tile ⋮, in a dialog like the card rename', async () => {
  await tile('Reading list').hover();
  await tileMore('Reading list').click();
  await page.locator('[data-folder-rename]').click();
  await dialog('Rename folder').getByLabel('Folder name').fill('Papers');
  await dialog('Rename folder').getByRole('button', { name: 'Save' }).click();
  await tile('Papers').waitFor();
  assert.equal(await tile('Reading list').count(), 0);
  assert.equal((await byName('Papers')).id, papers.id);
});
await check('3 Colour from the tile ⋮: the six swatches, the current one checked', async () => {
  await tile('Papers').hover();
  await tileMore('Papers').click();
  await page.locator('[data-folder-colour]').click();
  assert.equal(await page.locator('.shadow-pop [data-swatch]').count(), 6);
  assert.equal(await page.locator('.shadow-pop [data-swatch][aria-checked="true"]').getAttribute('aria-label'), 'Green');
  await shot('02-folder-menu-colour');
  await page.locator('.shadow-pop [data-swatch][aria-label="Purple"]').click();
  await settle();
  assert.equal(await edge('Papers'), 'rgb(124, 58, 237)');
  assert.equal((await byName('Papers')).color, '#7c3aed');
});
await check('4 Move to folder from the card ⋮: the folder with its colour; the card leaves the top view and the tile counts it', async () => {
  await cardMenu(T.optics);
  await page.locator('[data-menu-folder]').click();
  await page.locator(`[data-folder-option="${papers.id}"]`).waitFor();
  assert.equal(await page.locator('[data-menu-folder-new]').count(), 1);
  assert.equal(await page.locator('[data-menu-folder-remove]').count(), 0, 'not in a folder yet');
  await shot('03-card-menu-move');
  await page.locator(`[data-folder-option="${papers.id}"]`).click();
  await settle();
  assert.equal(await card(T.optics).count(), 0, 'filed, so out of the top view');
  assert.match(await tile('Papers').locator('[data-folder-count]').innerText(), /^1 item$/);
  assert.equal((await folders()).items[made.optics.name], papers.id);
});
let waves;
await check('5 New folder… from the card ⋮ makes the folder and files the card in one step', async () => {
  await cardMenu(T.waves);
  await page.locator('[data-menu-folder]').click();
  await page.locator('[data-menu-folder-new]').click();
  await dialog('New folder').waitFor();
  assert.match(await dialog('New folder').innerText(), /The card moves into it\./);
  await dialog('New folder').getByLabel('Folder name').fill('Waves stuff');
  await dialog('New folder').getByLabel('Folder name').press('Enter');
  await tile('Waves stuff').waitFor();
  await settle();
  assert.match(await tile('Waves stuff').locator('[data-folder-count]').innerText(), /^1 item$/);
  assert.equal(await card(T.waves).count(), 0);
  waves = await byName('Waves stuff');
  assert.equal((await folders()).items[made.waves.name], waves.id);
  assert.notEqual(waves.color, papers.color, 'a new folder takes the next swatch');
});
await check('6 Drag a card onto a tile to move it', async () => {
  await card(T.prisms).dragTo(tile('Papers'));
  await settle();
  assert.equal(await card(T.prisms).count(), 0);
  assert.match(await tile('Papers').locator('[data-folder-count]').innerText(), /^2 items$/);
  assert.equal((await folders()).items[made.prisms.name], papers.id);
});
await shot('04-tiles');
await check('7 A search at the top still finds a filed card', async () => {
  await page.locator('[data-library-search]').fill(T.prisms.slice(0, 5));
  await page.waitForTimeout(400);
  assert.equal(await card(T.prisms).count(), 1);
  await page.locator('[data-library-search]').fill('');
  await page.waitForTimeout(400);
  assert.equal(await card(T.prisms).count(), 0);
});
await check('8 Opening a folder: ?d= in the URL, the breadcrumb Library › Papers, its cards only, its ⋮ in the header', async () => {
  await tile('Papers').click();
  await page.locator('[data-folder-crumb]').waitFor();
  assert.ok(page.url().includes(`d=${papers.id}`), page.url());
  assert.match(await page.locator('[data-folder-crumb]').innerText(), /Library\s*Papers/);
  assert.match(await page.locator('h1').innerText(), /^Papers$/);
  assert.equal(await cards().count(), 2);
  assert.equal(await card(T.optics).count() + await card(T.prisms).count(), 2);
  assert.equal(await page.locator('[data-folder-tile]').count(), 0, 'no tiles inside a folder');
  assert.equal(await page.locator('[data-new-folder]').count(), 0, 'flat folders: none made inside one');
  assert.equal(await page.locator('h1 ~ div [data-folder-more]').count(), 1);
  await shot('05-folder-open');
});
await check('9 Filters, sort and search work inside the folder and keep it open', async () => {
  const menu = page.locator('.shadow-pop');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await menu.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.waitForTimeout(600);
  assert.ok(page.url().includes(`d=${papers.id}`) && page.url().includes('type=projects'), page.url());
  assert.equal(await cards().count(), 0, 'no projects in it');
  await page.getByRole('button', { name: /^Filters/ }).click();
  await menu.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.waitForTimeout(600);
  assert.ok(page.url().includes(`d=${papers.id}`) && !page.url().includes('type='), `Clear filters stays in the folder: ${page.url()}`);
  assert.equal(await cards().count(), 2);
  assert.equal(await page.locator('[data-sort-control]').count(), 1);
  await page.locator('[data-library-search]').fill('Prisms');
  await page.waitForTimeout(400);
  assert.equal(await cards().count(), 1);
  await page.locator('[data-library-search]').fill('');
  await page.waitForTimeout(400);
});
await check('10 Remove from folder from the card ⋮; drop on the Library crumb removes too; the empty state follows', async () => {
  await cardMenu(T.optics);
  assert.equal(await page.locator('[data-menu-folder-remove]').count(), 1);
  await page.locator('[data-menu-folder-remove]').click();
  await settle();
  assert.equal(await card(T.optics).count(), 0);
  assert.equal((await folders()).items[made.optics.name], undefined);
  await card(T.prisms).dragTo(page.locator('[data-folder-crumb-library]'));
  await settle();
  assert.equal(await cards().count(), 0);
  assert.equal((await folders()).items[made.prisms.name], undefined);
  await page.getByText('This folder is empty.').waitFor();
  await shot('06-empty-folder');
});
await check('11 The Library crumb and Back both leave the folder; the cards are back at the top', async () => {
  await page.locator('[data-folder-crumb-library]').click();
  await page.waitForTimeout(600);
  assert.ok(!page.url().includes('d='), page.url());
  assert.equal(await card(T.optics).count() + await card(T.prisms).count(), 2);
  await page.goBack();
  await page.locator('[data-folder-crumb]').waitFor();
  assert.ok(page.url().includes(`d=${papers.id}`), 'Back reopens the folder');
  await page.goForward();
  await page.waitForTimeout(600);
  assert.ok(!page.url().includes('d='));
  await tile('Papers').waitFor();
});
await check('12 Delete folder confirms with the owner\'s words; its items go back to the Library; nothing is deleted', async () => {
  await cardMenu(T.optics);
  await page.locator('[data-menu-folder]').click();
  await page.locator(`[data-folder-option="${papers.id}"]`).click();
  await settle();
  await tile('Papers').hover();
  await tileMore('Papers').click();
  await page.locator('[data-folder-delete]').click();
  const confirm = dialog("Delete folder 'Papers'?");
  await confirm.waitFor();
  assert.match(await confirm.innerText(), /Its 1 item goes back to Library; nothing is deleted\./);
  await shot('07-delete-confirm');
  await confirm.getByRole('button', { name: 'Delete folder' }).click();
  await settle();
  assert.equal(await tile('Papers').count(), 0);
  assert.equal(await card(T.optics).count(), 1, 'back at the top');
  const now = await folders();
  assert.deepEqual(now.folders.map(f => f.name), ['Waves stuff']);
  assert.deepEqual(now.items, { [made.waves.name]: waves.id });
  assert.equal((await api(owner, '/api/apps')).body.apps.filter(a => a.kind === 'canvas').length, 3, 'all three canvases still exist');
});
await check('13 Reload keeps the folders and what is in them', async () => {
  await page.reload();
  await tile('Waves stuff').waitFor();
  await page.waitForTimeout(800);
  assert.match(await tile('Waves stuff').locator('[data-folder-count]').innerText(), /^1 item$/);
  assert.equal(await card(T.waves).count(), 0);
  assert.equal(await card(T.optics).count() + await card(T.prisms).count(), 2);
});
await check('14 Another account sees none of it: an empty list, 404 on the folder, no tiles, a strange ?d= says so', async () => {
  assert.deepEqual(await folders(other), { folders: [], items: {} });
  assert.equal((await api(other, `/api/library/folders/${waves.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Mine' }) })).status, 404);
  assert.equal((await api(other, `/api/library/folders/${waves.id}/items/${made.waves.name}`, { method: 'DELETE' })).status, 404);
  const theirs = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await theirs.addCookies([{ name: 'small_session', value: other.session, url: BASE }]);
  const p = await theirs.newPage();
  await api(other, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Theirs ${run}` }) });
  await library('', p);
  assert.equal(await p.locator('[data-folder-tile]').count(), 0);
  await library(`?d=${waves.id}`, p);
  await p.getByText('No such folder in your Library.').waitFor();
  assert.equal(await cards(p).count(), 0);
  await theirs.close();
  assert.equal((await byName('Waves stuff')).name, 'Waves stuff', 'untouched');
});
await check('15 keyboard: Tab reaches a tile, Enter opens it, Escape closes the folder menu', async () => {
  await library();
  await tile('Waves stuff').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-folder-crumb]').waitFor();
  assert.ok(page.url().includes(`d=${waves.id}`));
  await page.locator('h1 ~ div [data-folder-more]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-folder-rename]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-folder-rename]').waitFor({ state: 'detached' });
});

// Visual quality (brief): 1024 and a phone, and dark, on the tiles and an open folder.
await check('16 phone, 1024 and dark views render the tiles and the open folder', async () => {
  for (const [name, width, height] of [['08-1024-tiles', 1024, 800], ['09-phone-tiles', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await library();
    await tile('Waves stuff').waitFor();
    const box = await tile('Waves stuff').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${name}: the tile fits the viewport (${JSON.stringify(box)})`);
    await shot(name);
  }
  await library(`?d=${waves.id}`);
  await page.locator('[data-folder-crumb]').waitFor();
  await shot('10-phone-folder-open');
  await page.setViewportSize({ width: 1440, height: 900 });
  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dark.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
  await dark.addInitScript(() => localStorage.setItem('small.theme', 'dark'));
  const p = await dark.newPage();
  await library('', p);
  await tile('Waves stuff', p).waitFor();
  await shot('11-tiles-dark', p);
  await dark.close();
});

await check('17 the provider tripwire read 0: no model call anywhere in this run', async () => {
  const wire = await (await fetch(`${BASE}/__provider-tripwire`)).json();
  assert.deepEqual(wire.hits, [], JSON.stringify(wire.hits));
});
await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/18 checks passed`);
process.exit(results.length === 18 ? 0 : 1);
