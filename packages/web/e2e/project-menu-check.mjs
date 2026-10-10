// A project's ⋮ (owner, 2026-10-09; docs/features/visibility-menu.md "Projects"), against the LOCAL stack only: local D1
// and fresh browser profiles; nothing is sent to a model (the canvas page's model routes are refused in the page, and the
// stack runs through the provider tripwire). Prints no secrets.
//   - one menu for canvases and projects: their labels compared, on the card and in the open project's header;
//   - Rename from the card and from the header: it stays on reload, and the repository stays the subtitle;
//   - Visibility for the whole project: confirm with the count, every canvas set, Mixed, a new canvas inheriting, a private
//     repository never Public; the project link working signed out and never listing a private canvas;
//   - the cards: the picture's inset above equals its inset below, and the footer ends on the picture's bottom edge.
// The projects are repository rows seeded in local D1 (importing needs the indexer), as project-canvases-check.mjs does.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 PERSIST=<lane>/local D1_CONFIG=<lane>/cfg/cp/wrangler.jsonc \
//        node e2e/project-menu-check.mjs [shotsDir] [reviewShotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8888';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8889';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('project-menu-check runs against the local stack only');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local', D1_CONFIG = process.env.D1_CONFIG || 'packages/web/wrangler.dev.jsonc';
const SHOTS = process.argv[2] || 'project-menu-shots', REVIEW = process.argv[3] || SHOTS;
for (const dir of [SHOTS, REVIEW]) mkdirSync(dir, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`pm-owner-${run}@example.com`, `pm_${run}`) };
const viewer = { session: await sessionFor(`pm-viewer-${run}@example.org`, `pmv_${run}`) };
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json' } }); return { status: r.status, body: await r.json().catch(() => null) }; };

// Two projects: one on a public repository, one on a private one; two canvases in the first.
const catalog = (await api(owner, '/api/apps')).body;
const PUB = `repo-${run.slice(-8).padStart(8, '0')}-pmpub`, PRIV = `repo-${run.slice(-8).padStart(8, '0')}-pmpriv`, SHA = 'd'.repeat(40);
const sql = [`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${PUB}','${catalog.email}','acme/attention-${run}','main','${SHA}','ready')`,
  `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${PRIV}','${catalog.email}','acme/secret-${run}','main','${SHA}','ready')`,
  `INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${PUB}'`].join('; ');
execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to "${PERSIST}" -c "${D1_CONFIG}" --command "${sql}"`, { cwd: ROOT, shell: true, stdio: 'ignore' });
const STATE = title => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'b0', type: 'explanation', dx: 0, dy: 0, title, body: `${title}, explained in one card.` }] });
const canvasIn = async (title, project = PUB) => {
  const made = (await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).body;
  await api(owner, `/api/learn/boards/${made.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(title), version: 0 }) });
  return made;
};
const heads = await canvasIn('Attention heads'), masks = await canvasIn('Causal masks');
const apps = async () => (await api(owner, '/api/apps')).body.apps;
const row = async name => (await apps()).find(a => a.name === name);

const browser = await chromium.launch();
const errors = [];
const NO_MODEL = /\/api\/(learn\/(ask|home-ask|tutor\/|assess|artifact|board$|voice\/)|ask($|\/))/;
const contextFor = async (who, viewport = { width: 1440, height: 900 }) => {
  const context = await browser.newContext({ viewport });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.route(url => NO_MODEL.test(new URL(url).pathname), route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, dir, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}.png` }); console.log('shot', name); };
const { page } = await contextFor(owner);
const libraryCard = (kind, title) => page.locator(`[data-library-card="${kind === 'repository' ? 'project' : 'canvas'}"]`).filter({ has: page.locator('[data-card-title]', { hasText: title }) });
const library = async () => { await page.goto(`${BASE}/library`); await page.locator('[data-library-card="project"]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800); };
const labels = () => page.locator('[data-menu-item]').evaluateAll(els => els.map(el => el.textContent.trim()));
const open = async card => { await card.hover(); await card.getByTitle('More').click(); await page.locator('[data-menu-item]').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(300); };
const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(200); };

await library();
let canvasMenu, projectMenu, headerMenu;
await check('1 one menu: the canvas ⋮ and the project ⋮ show the same shared rows in the same order, the type-only rows in their slots', async () => {
  await open(libraryCard('canvas', 'Attention heads')); canvasMenu = await labels(); await shot(page, REVIEW, 'project-menu-01-canvas-menu'); await close();
  await open(libraryCard('repository', `acme/attention-${run}`.split('/')[1])); projectMenu = await labels(); await shot(page, REVIEW, 'project-menu-02-project-menu'); await close();
  const ONLY = { canvas: ['Edit description', 'Duplicate', 'Archive'], project: ['Learn', 'Map', 'Pin', 'Unpin', 'New canvas in project'] };
  const shared = (list, only) => list.filter(l => !only.includes(l));
  assert.deepEqual(shared(canvasMenu, ONLY.canvas), shared(projectMenu, ONLY.project), `${canvasMenu} | ${projectMenu}`);
  assert.deepEqual(shared(canvasMenu, ONLY.canvas), ['Open', 'Rename', 'Visibility', 'Share / Manage link', 'Copy link', 'Change thumbnail', 'Move to Trash']);
});
const NAME = `Attention, from scratch ${run}`, NAME2 = `Attention in 3 canvases ${run}`;
await check('2 Rename from the project card: the card shows the new name, the repository stays its subtitle, and a reload keeps it', async () => {
  await open(libraryCard('repository', `attention-${run}`));
  await page.locator('[data-menu-rename]').click();
  const input = page.getByRole('textbox', { name: 'Title' });
  assert.equal(await input.inputValue(), `attention-${run}`, 'it starts from the name the card shows');
  await input.fill(NAME); await page.getByRole('button', { name: 'Save', exact: true }).click();
  const card = libraryCard('repository', NAME);
  await card.waitFor({ timeout: 10000 });
  assert.equal((await card.locator('[data-source-link]').innerText()).trim(), `github.com/acme/attention-${run}`);
  await shot(page, REVIEW, 'rename-01-card-renamed');
  await library();
  assert.equal(await libraryCard('repository', NAME).count(), 1, 'kept on reload');
  assert.equal((await row(PUB)).repo, `acme/attention-${run}`);
});
await check('3 the open project\'s header: its name with the repository beside it, and the same ⋮; Rename there stays on reload', async () => {
  await page.goto(`${BASE}/apps/${PUB}`);
  await page.locator('[data-project-title]').waitFor({ timeout: 60000 });
  assert.equal((await page.locator('[data-project-title]').innerText()).trim(), NAME);
  assert.equal((await page.locator('[data-project-repo]').innerText()).trim(), `acme/attention-${run}`);
  await page.locator('[data-project-more]').click(); await page.locator('[data-menu-item]').first().waitFor();
  headerMenu = await labels();
  assert.deepEqual(headerMenu, projectMenu, 'the card\'s menu');
  await shot(page, REVIEW, 'project-menu-03-header-menu');
  await page.locator('[data-menu-rename]').click();
  await page.getByRole('textbox', { name: 'Title' }).fill(NAME2); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('[data-project-title]', { hasText: NAME2 }).waitFor({ timeout: 10000 });
  await page.reload(); await page.locator('[data-project-title]').waitFor({ timeout: 60000 });
  assert.equal((await page.locator('[data-project-title]').innerText()).trim(), NAME2, 'kept on reload');
  assert.equal((await page.locator('[data-project-repo]').innerText()).trim(), `acme/attention-${run}`, 'the repository stays');
  await shot(page, REVIEW, 'rename-02-header-renamed');
});
await check('12 Main and nested Learn expose the same project menu as Map', async () => {
  for (const query of ['tab=learn', `tab=learn&canvas=${heads.name}`]) {
    await page.goto(`${BASE}/apps/${PUB}?${query}`);
    await page.locator('[data-project-more]').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('[data-project-more]').count(), 1, 'one project menu');
    await page.locator('[data-project-more]').click();
    await page.locator('[data-menu-item]').first().waitFor();
    assert.deepEqual(await labels(), projectMenu, query);
    await close();
  }
});
const visibility = async (card, to) => { await open(card); await page.locator('[data-menu-visibility]').click(); await page.locator(`[data-access="${to}"]`).click(); };
await check('4 Visibility on the project: "Make 3 canvases public?", then every canvas and the project are Public', async () => {
  await library();
  await visibility(libraryCard('repository', NAME2), 'public');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  assert.match(await dialog.innerText(), /Make 3 canvases public\?/);
  await shot(page, REVIEW, 'project-menu-04-confirm-public');
  await dialog.getByRole('button', { name: 'Make public' }).click();
  await page.waitForTimeout(2500);
  for (const c of [heads, masks]) assert.equal((await row(c.name)).access, 'public', c.title);
  assert.equal((await row(PUB)).access, 'public');
  assert.equal(await libraryCard('repository', NAME2).locator('[data-card-visibility]').getAttribute('data-card-visibility'), 'public');
});
await check('5 one canvas changed on its own: the project reads Mixed, none checked', async () => {
  await visibility(libraryCard('canvas', 'Causal masks'), 'unlisted');
  await page.waitForTimeout(2000);
  assert.equal((await row(PUB)).access, 'mixed');
  await open(libraryCard('repository', NAME2)); await page.locator('[data-menu-visibility]').click();
  await page.locator('[data-access-mixed]').waitFor({ timeout: 5000 });
  assert.deepEqual(await page.locator('[data-access]').evaluateAll(els => els.map(el => el.getAttribute('aria-checked'))), ['false', 'false', 'false']);
  await shot(page, REVIEW, 'project-menu-05-mixed');
  await close();
});
let third;
await check('6 a canvas added later takes the project\'s visibility (Public again), and a mixed project adds one private', async () => {
  await visibility(libraryCard('repository', NAME2), 'public');
  await page.getByRole('dialog').getByRole('button', { name: 'Make public' }).click();
  await page.waitForTimeout(2500);
  third = await canvasIn('Positional encodings');
  assert.equal((await row(third.name)).access, 'public');
  await api(owner, `/api/apps/${third.name}/unpublish`, { method: 'POST' });
  assert.equal((await canvasIn('Loose notes')).access, 'private', 'mixed: private');
});
await check('7 a project on a private repository is never Public: the row is disabled and says why', async () => {
  await library();
  await open(libraryCard('repository', `secret-${run}`)); await page.locator('[data-menu-visibility]').click();
  const pub = page.locator('[data-access="public"]');
  assert.equal(await pub.isDisabled(), true);
  assert.match(await pub.innerText(), /Private repository: can't be public/);
  await shot(page, REVIEW, 'project-menu-06-private-repository');
  await close();
});
await check('8 the project link opens signed out, names the project and lists only the canvases a viewer may open', async () => {
  // A private canvas in the same project: never listed.
  const secretCanvas = await canvasIn(`SECRET-${run}`);
  assert.equal((await row(secretCanvas.name)).access, 'private', 'the project is mixed now, so it was added private');
  const view = (await api(owner, `/api/learn/boards/${PUB}/main`)).body.sharing.view;
  assert.ok(view, 'the project link is on');
  const out = await contextFor(null);
  await out.page.goto(`${BASE}/b/${view}`);
  await out.page.locator('[data-project-canvases]').waitFor({ timeout: 60000 });
  assert.match(await out.page.locator('header').innerText(), new RegExp(NAME2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await out.page.locator('[data-project-canvases]').click();
  const listed = await out.page.locator('[data-project-canvas]').allInnerTexts();
  assert.deepEqual(listed.map(t => t.trim()).sort(), ['Attention heads', 'Causal masks'].sort(), 'signed out: the published ones');
  const text = await out.page.content();
  assert.ok(!text.includes(`SECRET-${run}`) && !text.includes('Positional encodings') && !text.includes(catalog.email), 'no private canvas, no unpublished one, no email');
  await shot(out.page, REVIEW, 'project-menu-07-link-signed-out');
  await out.context.close();
  const ben = await contextFor(viewer);
  await ben.page.goto(`${BASE}/b/${view}`);
  await ben.page.locator('[data-project-canvases]').click();
  assert.ok(!(await ben.page.locator('[data-project-canvas]').allInnerTexts()).some(t => t.includes('SECRET')), 'signed in: still never the private one');
  await ben.context.close();
});
await check('9 New canvas in project, from the project card\'s ⋮: a canvas in this project, opened in its Learn tab', async () => {
  await library();
  await open(libraryCard('repository', NAME2));
  await page.locator('[data-menu-item="new_canvas"]').click();
  const input = page.getByRole('textbox', { name: 'Canvas name' });
  assert.match(await input.inputValue(), /^Canvas \d+$/, 'the switcher\'s starting name');
  await input.fill(`Rotary embeddings ${run}`); await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(new RegExp(`/apps/${PUB}\\?tab=learn&canvas=canvas-[a-f0-9]{8}$`), { timeout: 15000 });
  const made = (await apps()).find(a => a.kind === 'canvas' && a.title === `Rotary embeddings ${run}`);
  assert.equal(made?.project, PUB, 'in this project');
  assert.ok(page.url().endsWith(`canvas=${made.name}`), 'opened');
});
// The cards: equal insets above and below the picture, the footer on its bottom edge (owner, 2026-10-09).
const aligned = async (cards, label) => {
  const all = await cards.evaluateAll(els => els.map(el => {
    const box = n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    return { card: box(el), pic: box(el.querySelector('[data-card-thumbnail]')), foot: box(el.querySelector('[data-card-footer]')) };
  }));
  assert.ok(all.length > 0, label);
  for (const [i, c] of all.entries()) {
    const above = c.pic.top - c.card.top, below = c.card.bottom - c.pic.bottom;
    assert.ok(Math.abs(above - below) <= 1, `${label} ${i}: the picture's inset above ${above} and below ${below}`);
    assert.ok(Math.abs(c.foot.bottom - c.pic.bottom) <= 1, `${label} ${i}: the footer ends at ${c.foot.bottom}, the picture at ${c.pic.bottom}`);
  }
};
await check('10 every card: the picture\'s inset above equals its inset below, and the footer ends on its bottom edge (project, canvas, Home, Explore)', async () => {
  await library();
  await aligned(page.locator('[data-library-card="project"]'), 'project');
  await aligned(page.locator('[data-library-card="canvas"]'), 'canvas');
  await shot(page, REVIEW, 'cards-library-1440');
  await page.goto(`${BASE}/apps`); await page.locator('[data-recent-card], [data-continue-card]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800);
  await aligned(page.locator('[data-recent-card], [data-continue-card]').filter({ has: page.locator('[data-card-thumbnail]') }), 'home');
  await shot(page, REVIEW, 'cards-home-1440');
  const other = await contextFor(viewer);
  await other.page.goto(`${BASE}/explore`); await other.page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 }); await other.page.waitForTimeout(800);
  await aligned(other.page.locator('[data-explore-card]'), 'explore');
  await shot(other.page, REVIEW, 'cards-explore-1440');
  for (const [label, viewport] of [['1024', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport); await library(); await shot(page, REVIEW, `cards-library-${label}`);
    if (label === '1024') await aligned(page.locator('[data-library-card]'), 'library at 1024');
    if (label === 'phone') { await open(libraryCard('repository', NAME2)); await shot(page, REVIEW, 'project-menu-phone'); await close(); }
    await other.page.setViewportSize(viewport); await other.page.reload(); await other.page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 }); await other.page.waitForTimeout(800);
    await shot(other.page, REVIEW, `cards-explore-${label}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await other.context.close();
});
const tripwire = await Promise.all([BASE, CP].map(async origin => { const r = await fetch(`${origin}/__provider-tripwire`).catch(() => null); return r?.ok ? (await r.json()).hits.length : 'off'; }));
await check('11 no page errors, the provider tripwire at 0', async () => {
  assert.deepEqual(errors, []);
  console.log(`   provider tripwire: ${tripwire.join(', ')}`);
  assert.deepEqual(tripwire, [0, 0]);
});
console.log('canvas menu:  ', canvasMenu.join(' | '));
console.log('project menu: ', projectMenu.join(' | '));
await browser.close();
const total = 12;
console.log(results.length === total ? 'PASS' : 'FAIL', `${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
