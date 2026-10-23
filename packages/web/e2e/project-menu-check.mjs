// A project's ⋮ (owner, 2026-10-09; docs/features/visibility-menu.md "Projects"), against the LOCAL stack only: local D1
// and fresh browser profiles; nothing is sent to a model (the canvas page's model routes are refused in the page, and the
// stack runs through the provider tripwire). Prints no secrets.
//   - one menu for canvases and projects, on their cards (project management lives in Home and the Library: owner brief
//     2026-10-16 item 2; the open project's canvas header names the project as plain text and has no project menu);
//   - Rename from the project card: it stays on reload, the repository stays the subtitle, and the header follows;
//   - the project's Share window (owner brief 2026-10-22): the project link apart from the canvases, the per-canvas breakdown,
//     Varies by canvas, Apply to all canvases with its count and a partial failure, a new canvas inheriting, a private
//     repository never opening without sign-in; the project link working signed out and never listing a private canvas;
//   - the cards: the picture's inset above equals its inset below, and the footer ends on the picture's bottom edge;
//   - every menu on screen (owner bug, 2026-10-16): inside the window with an 8px margin and every row answering a press at
//     its centre - card menus at each window edge, and the header's canvas selector and repository dropdown on minGPT's
//     short-named Main canvas with the right panel hidden, reopened and resized, the window resized, and on a phone;
//   - the header (owner brief 2026-10-16 items 1-2): Home alone at the far left and the rest one centred group; the canvas
//     selector switches canvases, makes a New canvas and renames the canvas (Save, Cancel), the new name shown in the
//     selector, its list and the Library; the repository dropdown links GitHub in a new tab with branch, commit and status;
//     Escape and an outside press close the dropdowns, Escape returning focus to the button; Home goes Home.
// The projects are repository rows seeded in local D1 (importing needs the indexer), as project-canvases-check.mjs does.
// Usage: BASE=http://127.0.0.1:8888 SMALL_CP=http://127.0.0.1:8889 PERSIST=<lane>/local D1_CONFIG=<lane>/cfg/cp/wrangler.jsonc \
//        node e2e/project-menu-check.mjs [shotsDir] [reviewShotsDir]
import { chromium } from '@playwright/test';
import { installPointerDiagnostics, reportPointerFailure } from './pointer-diagnostics.mjs';
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

// Two projects: one on a public repository, one on a private one; two canvases in the first. A third, minGPT as in the owner's
// report, has a short name that puts its header ⋯ near the window's left edge (step 12b).
const catalog = (await api(owner, '/api/apps')).body;
const PUB = `repo-${run.slice(-8).padStart(8, '0')}-pmpub`, PRIV = `repo-${run.slice(-8).padStart(8, '0')}-pmpriv`, SHORT = `repo-${run.slice(-8).padStart(8, '0')}-pmgpt`, SHA = 'd'.repeat(40);
const sql = [`INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${PUB}','${catalog.email}','acme/attention-${run}','main','${SHA}','ready')`,
  `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${PRIV}','${catalog.email}','acme/secret-${run}','main','${SHA}','ready')`,
  `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${catalog.org}','${SHORT}','${catalog.email}','acme/minGPT','main','${SHA}','ready')`,
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
  await installPointerDiagnostics(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
// A part of a numbered step (1b, 12b): asserted and printed the same way (a failure ends the run), but not a step of its own,
// so the run stays the 12 steps the release gate attests (r36-gate collect.mjs/run.mjs stageCount === 12).
const part = async (label, fn) => { await fn(); console.log(`ok ${label}`); };
const shot = async (page, dir, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}.png` }); console.log('shot', name); };
const { page } = await contextFor(owner);
const libraryCard = (kind, title) => page.locator(`[data-library-card="${kind === 'repository' ? 'project' : 'canvas'}"]`).filter({ has: page.locator('[data-card-title]', { hasText: title }) });
const library = async () => { await page.goto(`${BASE}/library`); await page.locator('[data-library-card="project"]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(800); };
const labels = () => page.locator('[data-menu-item]').evaluateAll(els => els.map(el => el.textContent.trim()));
// A header dropdown (ui.jsx useMenuButton): its portaled box and its rows, the same way.
const inWindowHeader = async (what, rows = '[role^="menuitem"]') => {
  const m = await page.evaluate(sel => {
    let menu = document.querySelector('[data-menu-button-open]'); while (menu && !menu.classList.contains('fixed')) menu = menu.parentElement;
    const r = menu.getBoundingClientRect();
    const blocked = [...menu.querySelectorAll(sel)].filter(row => { const b = row.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !hit || !row.contains(hit); }).map(row => row.textContent.trim());
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: innerWidth, height: innerHeight, rows: menu.querySelectorAll(sel).length, blocked };
  }, rows);
  assert.ok(m.left >= 8 && m.right <= m.width - 8 && m.top >= 8 && m.bottom <= m.height - 8, `${what}: the menu ${JSON.stringify(m)} is inside the window, 8px from each edge`);
  assert.ok(m.rows > 0, `${what}: it has rows`);
  assert.deepEqual(m.blocked, [], `${what}: every row answers a press at its centre`);
};
const open = async card => { await card.hover(); await card.getByTitle('Card options').click(); await page.locator('[data-menu-item]').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(300); };
const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(200); };
// The open menu as it is on screen: its box inside the window with the 8px margin, and every row the element a press at its
// centre lands on (nothing over it, not cut off).
const inWindow = async what => {
  const m = await page.evaluate(() => {
    let menu = document.querySelector('[data-menu-item]'); while (menu && !menu.classList.contains('fixed')) menu = menu.parentElement;
    const r = menu.getBoundingClientRect();
    const blocked = [...menu.querySelectorAll('[data-menu-item]')].filter(row => { const b = row.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !hit || !row.contains(hit); }).map(row => row.textContent.trim());
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: innerWidth, height: innerHeight, blocked };
  });
  assert.ok(m.left >= 8 && m.right <= m.width - 8 && m.top >= 8 && m.bottom <= m.height - 8, `${what}: the menu ${JSON.stringify(m)} is inside the window, 8px from each edge`);
  assert.deepEqual(m.blocked, [], `${what}: every row answers a press at its centre`);
};

await library();
let canvasMenu, projectMenu;
await check('1 one menu: the canvas ⋮ and the project ⋮ show the same shared rows in the same order, the type-only rows in their slots', async () => {
  await open(libraryCard('canvas', 'Attention heads')); canvasMenu = await labels(); await shot(page, REVIEW, 'project-menu-01-canvas-menu'); await close();
  await open(libraryCard('repository', `acme/attention-${run}`.split('/')[1])); projectMenu = await labels(); await shot(page, REVIEW, 'project-menu-02-project-menu'); await close();
  const ONLY = { canvas: ['Edit description', 'Duplicate'], project: ['Explore codebase', 'New canvas in project'] };
  const shared = (list, only) => list.filter(l => !only.includes(l));
  assert.deepEqual(shared(canvasMenu, ONLY.canvas), shared(projectMenu, ONLY.project), `${canvasMenu} | ${projectMenu}`);
  // Owner brief 2026-10-22: Open | Pin, Rename, Move to folder, Change cover | Share | Move to Trash, on canvases and projects alike.
  assert.deepEqual(shared(canvasMenu, ONLY.canvas), ['Open', 'Pin', 'Rename', 'Move to folder', 'Change cover', 'Share', 'Move to Trash']);
  assert.deepEqual(canvasMenu, ['Open', 'Pin', 'Rename', 'Edit description', 'Duplicate', 'Move to folder', 'Change cover', 'Share', 'Move to Trash']);
  assert.deepEqual(projectMenu, ['Open', 'Explore codebase', 'New canvas in project', 'Pin', 'Rename', 'Move to folder', 'Change cover', 'Share', 'Move to Trash']);
});
await part('1b card ⋮ menus near each window edge open inside it: the leftmost and rightmost card, and a phone\'s top and bottom', async () => {
  const cards = page.locator('[data-library-card]');
  const at = async (card, block, what) => { await card.evaluate((el, b) => el.scrollIntoView({ block: b }), block); await open(card); await inWindow(what); await close(); };
  const xs = await cards.evaluateAll(list => list.map(el => el.getBoundingClientRect().left));
  await at(cards.nth(xs.indexOf(Math.min(...xs))), 'nearest', 'the leftmost card');
  await at(cards.nth(xs.indexOf(Math.max(...xs))), 'nearest', 'the rightmost card');
  await page.setViewportSize({ width: 360, height: 640 });
  await at(cards.first(), 'center', 'a phone, a card mid-screen');
  await at(cards.first(), 'end', 'a phone, the card at the bottom (the menu opens above it)');
  await open(cards.first()); await shot(page, REVIEW, 'project-menu-01b-phone-card-menu'); await close();
  await page.setViewportSize({ width: 1440, height: 900 });
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
// The repository opens on its canvas (repo-canvas-graph.md, correction to decision 2). Owner brief 2026-10-16 items 1-2 (the
// approved centred-menubar and named-repository mockups): the project's name is plain text with no menu (Rename, Visibility
// and the rest are the card's, steps 1-2), the canvas name is the canvas selector, and the repository is one named dropdown.
await check('3 the open project\'s header: Home alone at the far left, then one centred group - the project as plain text (the Library rename), the canvas selector, the menubar and the repository dropdown; no project menu', async () => {
  // Renaming is the Library's (the card's Rename, as step 2): a second rename there, then the open project shows it.
  await library();
  await open(libraryCard('repository', NAME));
  await page.locator('[data-menu-rename]').click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(NAME2); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await libraryCard('repository', NAME2).waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/apps/${PUB}`);
  await page.locator('[data-project-crumb]').waitFor({ timeout: 60000 });
  assert.equal((await page.locator('[data-project-crumb]').innerText()).trim(), NAME2, 'the name the Library gave it');
  assert.equal(await page.locator('[data-project-crumb]').evaluate(el => el.tagName), 'SPAN', 'plain text, not a button or link');
  assert.equal(await page.locator('[data-canvas-header] [data-project-more], [data-canvas-header] [title="Card options"]').count(), 0, 'no project menu in the header');
  assert.equal((await page.locator('[data-canvas-switcher]').innerText()).trim(), 'Main canvas');
  assert.equal(await page.locator('[data-repo-menu]').getAttribute('aria-label'), `Repository acme/attention-${run}`);
  assert.equal(await page.locator('[data-canvas-header] a[href*="github.com"]').count(), 0, 'the repository is a dropdown button, not a link in the header');
  const g = await page.evaluate(() => {
    const box = el => el.getBoundingClientRect(), header = box(document.querySelector('[data-canvas-header]')), group = box(document.querySelector('[data-header-group]')), home = box(document.querySelector('[data-learn-home]'));
    const inGroup = ['[data-project-crumb]', '[data-canvas-switcher]', '[data-canvas-menubar], [role="menubar"]', 'button[aria-label="Present"]', '[data-repo-menu]'].map(sel => !!document.querySelector(`[data-header-group] ${sel.split(', ').join(', [data-header-group] ')}`));
    return { homeLeft: home.left - header.left, homeRight: home.right, groupLeft: group.left, centre: Math.abs((group.left + group.right) / 2 - (header.left + header.right) / 2), inGroup };
  });
  assert.ok(g.homeLeft <= 16, `Home at the far left (${g.homeLeft}px in)`);
  assert.ok(g.groupLeft > g.homeRight, 'the group starts after Home');
  assert.deepEqual(g.inGroup, [true, true, true, true, true], 'project, canvas selector, menubar, actions and repository in the one group');
  assert.ok(g.centre <= 2, `the group is centred in the header (${g.centre}px off)`);
  await shot(page, REVIEW, 'project-menu-03-header');
});
// A canvas selector and the repository dropdown on minGPT's Main canvas (the owner's report was the project ⋯ there opening
// off-screen after the right panel closed; the project menu is gone, these are the header's dropdowns now). Each picture is
// taken before the assertion, so a failing run still shows the menu.
const SELECTOR = '[data-canvas-switcher]', REPO = '[data-repo-menu]';
const dropdown = async (button, what, picture) => {
  await page.locator(button).click(); await page.locator('[data-menu-button-open]').waitFor();
  if (picture) await shot(page, REVIEW, picture);
  await inWindowHeader(what);
  await page.keyboard.press('Escape'); await page.locator('[data-menu-button-open]').waitFor({ state: 'detached' });
};
await check('12 minGPT\'s Main canvas: the canvas selector and the repository dropdown open inside the window with the right panel closed, reopened and resized, the window resized and on a phone, every row reachable', async () => {
  await page.goto(`${BASE}/apps/${SHORT}?tab=learn`);
  await page.locator(SELECTOR).waitFor({ timeout: 60000 });
  assert.equal((await page.locator('[data-project-crumb]').innerText()).trim(), 'minGPT');
  const toggle = page.locator('button[aria-label="Hide the right panel"], button[aria-label="Show the right panel"]').first();
  await toggle.waitFor({ timeout: 30000 });
  await toggle.click(); await page.locator('button[aria-label="Show the right panel"]').waitFor();
  await dropdown(SELECTOR, 'canvas selector, the right panel closed', 'header-12-1-canvas-panel-closed');
  await dropdown(REPO, 'repository, the right panel closed', 'header-12-1-repo-panel-closed');
  await toggle.click(); await page.locator('button[aria-label="Hide the right panel"]').waitFor();
  await dropdown(SELECTOR, 'canvas selector, the right panel reopened', 'header-12-2-canvas-panel-reopened');
  await dropdown(REPO, 'repository, the right panel reopened', 'header-12-2-repo-panel-reopened');
  const handle = await page.getByRole('separator', { name: 'Resize Learn panel' }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x - 200, handle.y + handle.height / 2, { steps: 6 }); await page.mouse.up();
  await dropdown(SELECTOR, 'canvas selector, the right panel resized', 'header-12-3-canvas-panel-resized');
  await dropdown(REPO, 'repository, the right panel resized', 'header-12-3-repo-panel-resized');
  for (const [width, height] of [[1100, 760], [390, 760], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await dropdown(SELECTOR, `canvas selector, the window at ${width}x${height}`, `header-12-4-canvas-${width}x${height}`);
    await dropdown(REPO, `repository, the window at ${width}x${height}`, `header-12-4-repo-${width}x${height}`);
  }
  // Open, then the window resizes: the dropdown is placed again from its button and stays inside.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(REPO).click(); await page.locator('[data-menu-button-open]').waitFor();
  await page.setViewportSize({ width: 900, height: 700 }); await page.waitForTimeout(300);
  await inWindowHeader('repository, the window resized while it is open');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
});
await part('12b the dropdowns by keyboard and pointer: Enter opens with focus on the first row, the arrows move, Escape closes and returns focus to the button, an outside press closes; the repository link opens GitHub in a new tab with the real branch, commit and status', async () => {
  for (const button of [SELECTOR, REPO]) {
    await page.locator(button).focus(); await page.keyboard.press('Enter');
    await page.locator('[data-menu-button-open]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-menu-button-open]')?.contains(document.activeElement), null, { timeout: 3000 });
    const first = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('ArrowDown');
    assert.notEqual(await page.evaluate(() => document.activeElement.textContent.trim()), first, `${button}: ArrowDown moves`);
    await page.keyboard.press('Escape');
    await page.locator('[data-menu-button-open]').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(sel => document.activeElement === document.querySelector(sel), button), true, `${button}: focus back on the button`);
    await page.locator(button).click(); await page.locator('[data-menu-button-open]').waitFor();
    try {
      await page.mouse.click(700, 500);
      await page.locator('[data-menu-button-open]').waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(await page.locator(button).getAttribute('aria-expanded'), 'false', `${button}: an outside press closes it`);
    } catch(error) {
      await reportPointerFailure(page, `${SHOTS}/header-12b-outside-failed.png`, 'header outside press', {button,x:700,y:500});
      throw error;
    }
  }
  await page.locator(REPO).click();
  const link = page.locator('[data-menu-button-open] a[data-repo-badge]');
  assert.deepEqual([await link.getAttribute('href'), await link.getAttribute('target'), await link.getAttribute('rel')], ['https://github.com/acme/minGPT', '_blank', 'noopener noreferrer']);
  const details = (await page.locator('[data-repo-details]').innerText()).replace(/\s+/g, ' ');
  assert.match(details, /Branch main/); assert.match(details, new RegExp(`Commit ${SHA.slice(0, 7)}`)); assert.match(details, /Status Ready/);
  assert.match(details, /Refresh branch/, 'the owner may refresh');
  const [tab] = await Promise.all([page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null), link.click()]);
  assert.ok(tab, 'a new tab opened');
  assert.equal(page.url().includes(`/apps/${SHORT}`), true, 'this tab stays on the canvas');
  await tab?.close();
});
// The canvas selector (owner brief item 2): the project's canvases with the open one checked, switching, New canvas through
// the existing create flow, and Rename canvas with Save and Cancel, the name updated in the selector, its list and the Library.
await check('13 the canvas selector: the project\'s canvases, the open one checked; a pick switches; New canvas makes and opens one; Rename canvas saves (selector, list, Library) and Cancel keeps the name', async () => {
  // On minGPT's project, so the visibility steps below keep their own project's canvas count.
  const first = await canvasIn('Attention heads', SHORT), second = await canvasIn('Causal masks', SHORT);
  await page.goto(`${BASE}/apps/${SHORT}?tab=learn&canvas=${first.name}`);
  await page.locator(SELECTOR, { hasText: 'Attention heads' }).waitFor({ timeout: 60000 });
  assert.equal((await page.locator(SELECTOR).innerText()).trim(), 'Attention heads');
  await page.locator(SELECTOR).click();
  const options = page.locator('[data-menu-button-open] [data-canvas-option]');
  const rows = await options.evaluateAll(els => els.map(el => [el.textContent.trim(), el.getAttribute('aria-checked')]));
  assert.deepEqual(rows[0], ['Main canvas', 'false'], 'the Main canvas first');
  assert.deepEqual(rows.slice(1).sort(), [['Attention heads', 'true'], ['Causal masks', 'false']], JSON.stringify(rows));
  assert.deepEqual(await page.locator('[data-menu-button-open] [data-new-canvas], [data-menu-button-open] [data-rename-canvas]').allInnerTexts(), ['New canvas', 'Rename canvas']);
  await shot(page, REVIEW, 'header-13-1-canvas-selector');
  await page.locator(`[data-menu-button-open] [data-canvas-option="${second.name}"]`).click();
  await page.waitForURL(new RegExp(`canvas=${second.name}$`), { timeout: 15000 });
  await page.locator(SELECTOR, { hasText: 'Causal masks' }).waitFor({ timeout: 30000 });
  // Rename: Cancel keeps the name; Save renames it everywhere.
  await page.locator(SELECTOR).click(); await page.locator('[data-menu-button-open] [data-rename-canvas]').click();
  const field = page.getByRole('dialog', { name: 'Rename canvas' }).getByRole('textbox', { name: 'Canvas name' });
  assert.equal(await field.inputValue(), 'Causal masks');
  await field.fill('Will not stick'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await page.locator(SELECTOR).innerText()).trim(), 'Causal masks', 'Cancel keeps the name');
  const RENAMED = `Masked attention ${run}`;
  await page.locator(SELECTOR).click(); await page.locator('[data-menu-button-open] [data-rename-canvas]').click();
  await field.fill(RENAMED); await shot(page, REVIEW, 'header-13-2-rename');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator(SELECTOR, { hasText: RENAMED }).waitFor({ timeout: 10000 });
  for (let i = 0; i < 40 && (await row(second.name)).title !== RENAMED; i++) await page.waitForTimeout(250);
  assert.equal((await row(second.name)).title, RENAMED, 'saved on the server');
  await page.locator(SELECTOR).click();
  assert.equal((await page.locator(`[data-menu-button-open] [data-canvas-option="${second.name}"]`).innerText()).trim(), RENAMED, 'the list shows it');
  await page.keyboard.press('Escape');
  await page.reload(); await page.locator(SELECTOR, { hasText: RENAMED }).waitFor({ timeout: 60000 });
  await library(); assert.equal(await libraryCard('canvas', RENAMED).count(), 1, 'the Library card shows the new name');
  // New canvas: the existing create flow, opened in this project.
  await page.goto(`${BASE}/apps/${SHORT}?tab=learn`);
  await page.locator(SELECTOR).waitFor({ timeout: 60000 });
  await page.locator(SELECTOR).click(); await page.locator('[data-menu-button-open] [data-new-canvas]').click();
  const name = page.getByRole('textbox', { name: 'Canvas name' });
  assert.match(await name.inputValue(), /^Canvas \d+$/);
  await name.fill(`Selector canvas ${run}`); await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForURL(new RegExp(`/apps/${SHORT}\\?tab=learn&canvas=canvas-[a-f0-9]{8}$`), { timeout: 15000 });
  await page.locator(SELECTOR, { hasText: `Selector canvas ${run}` }).waitFor({ timeout: 30000 });
  assert.equal((await apps()).find(a => a.kind === 'canvas' && a.title === `Selector canvas ${run}`)?.project, SHORT, 'in this project');
});
await check('14 Home is its own button at the far left and goes Home; the canvas header carries no project actions', async () => {
  await page.goto(`${BASE}/apps/${PUB}?tab=learn`);
  await page.locator('[data-learn-home]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-header-group] [data-learn-home]').count(), 0, 'Home is not in the centred group');
  await page.locator('[data-learn-home]').click();
  await page.waitForURL(url => new URL(url).pathname === '/apps', { timeout: 15000 });
});
// Owner brief 2026-10-22: a project's access is managed in its Share window (Card options -> Share), never in a Visibility submenu.
// Its Share tab is the project link only; its Canvases tab lists the Main canvas and every canvas with its own link access and
// Explore publication, and "Apply to all canvases" is the one explicit bulk change. "Mixed" is replaced by "Varies by canvas".
const shareProject = async card => {
  await open(card);
  await page.locator('[data-menu-share]').click();
  const dialog = page.getByRole('dialog', { name: 'Share project' });
  await dialog.waitFor({ timeout: 60000 });
  await dialog.getByLabel('Who can open this?').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-share-dialog] select')?.disabled, null, { timeout: 60000 });
  return dialog;
};
const closeShare = async () => { await page.keyboard.press('Escape'); await page.locator('[data-share-dialog]').waitFor({ state: 'detached', timeout: 10000 }); };
const canvasRows = dialog => dialog.locator('[data-project-canvas]');
const rowOf = (dialog, title) => canvasRows(dialog).filter({ hasText: title });
const shareOf = async name => (await api(owner, `/api/learn/boards/${name}/main`)).body.sharing;
const publishViaApi = async c => { await api(owner, `/api/learn/boards/${c.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true }) }); await api(owner, `/api/apps/${c.name}/publish`, { method: 'POST' }); };
await check('4 the project\'s Share window: Share is the project link only, Canvases lists the Main canvas and each canvas, Apply to all canvases asks with the count and changes link access only', async () => {
  await library();
  const dialog = await shareProject(libraryCard('repository', NAME2));
  assert.deepEqual(await dialog.getByRole('tab').allInnerTexts(), ['Share', 'Canvases'], 'no Explore or Embed tab: a project is never published, only its canvases are');
  assert.match(await dialog.locator('[data-project-link-note]').innerText(), /This is the project link only\. The project itself is never listed on Explore/);
  // The project link, on its own: no canvas follows it.
  await dialog.getByLabel('Who can open this?').selectOption('public');
  await page.waitForFunction(() => !document.querySelector('[data-share-dialog] select')?.disabled, null, { timeout: 30000 });
  assert.equal((await shareOf(PUB)).public_view, true, 'the project link opens signed out');
  for (const c of [heads, masks]) assert.equal((await shareOf(c.name)).shared, false, `${c.title} did not follow the project link`);
  await dialog.getByRole('tab', { name: 'Canvases' }).click();
  assert.equal(await canvasRows(dialog).count(), 3, 'the Main canvas and two canvases');
  const titles = (await canvasRows(dialog).locator('span.truncate').allInnerTexts()).map(t => t.trim());
  assert.equal(titles[0], 'Main canvas', 'the Main canvas first');
  assert.deepEqual(titles.slice(1).sort(), ['Attention heads', 'Causal masks']);
  assert.match(await rowOf(dialog, 'Main canvas').innerText(), /Project link: Anyone with the link · no sign-in/);
  assert.match(await rowOf(dialog, 'Attention heads').innerText(), /Link: Invited people only/);
  assert.doesNotMatch(await dialog.innerText(), /only you/i, 'invited access is never "Only you"');
  assert.equal(await dialog.locator('[data-project-canvases]').getAttribute('data-project-canvases'), 'varies');
  await shot(page, REVIEW, 'project-menu-04a-canvases-varies');
  // Apply to all canvases: the count, then a confirmation; Cancel changes nothing.
  await dialog.locator('#apply-all-mode').selectOption('public');
  const apply = dialog.locator('[data-apply-all]');
  assert.match(await apply.innerText(), /Apply to all canvases \(2\)/);
  await apply.click();
  const group = dialog.getByRole('group', { name: 'Apply to all canvases' });
  assert.match(await group.innerText(), /Change link access to .Anyone with the link · no sign-in. on 2 canvases\? Each of them replaces its own link setting\./);
  await shot(page, REVIEW, 'project-menu-04b-apply-confirm');
  await group.getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await shareOf(heads.name)).shared, false, 'Cancel changed nothing');
  await apply.click();
  await group.locator('[data-confirm-apply]').click();
  await rowOf(dialog, 'Attention heads').getByText('Link: Anyone with the link · no sign-in').waitFor({ timeout: 30000 });
  await rowOf(dialog, 'Causal masks').getByText('Link: Anyone with the link · no sign-in').waitFor({ timeout: 30000 });
  for (const c of [heads, masks]) { const s = await shareOf(c.name); assert.ok(s.shared && s.public_view && !s.published, `${c.title} has the link, and is not on Explore`); }
  assert.equal(await dialog.locator('[data-project-canvases]').getAttribute('data-project-canvases'), 'same', 'the Main canvas and both canvases now share one link access');
  assert.equal(await dialog.locator('[data-canvas-published]').count(), 0, 'applying link access published nothing to Explore');
  await closeShare();
  // Explore publication is each canvas's own (here through the API; the canvas dialog's Explore tab is share-dialog-check's).
  for (const c of [heads, masks]) await publishViaApi(c);
  await library();
  const again = await shareProject(libraryCard('repository', NAME2));
  await again.getByRole('tab', { name: 'Canvases' }).click();
  assert.equal(await again.locator('[data-canvas-published]').count(), 2, 'both canvases say Published on Explore; the project row does not');
  assert.equal(await rowOf(again, 'Main canvas').locator('[data-canvas-published]').count(), 0);
  await closeShare();
  for (const c of [heads, masks]) assert.equal((await row(c.name)).access, 'public', c.title);
  assert.equal((await row(PUB)).access, 'public');
  assert.equal(await libraryCard('repository', NAME2).locator('[data-card-visibility]').getAttribute('data-card-visibility'), 'public', 'a uniform project shows its common status');
  assert.equal(await page.locator('[data-library-card="canvas"] [data-card-visibility="mixed"]').count(), 0, 'a canvas never says Varies by canvas');
});
await check('5 one canvas changed on its own: the project says Varies by canvas, and its badge opens the Share window on the Canvases breakdown', async () => {
  await api(owner, `/api/apps/${masks.name}/unpublish`, { method: 'POST' });
  assert.equal((await row(PUB)).access, 'mixed');
  await library();
  const badge = libraryCard('repository', NAME2).locator('[data-card-visibility="mixed"]');
  assert.equal((await badge.innerText()).trim(), 'Varies by canvas');
  assert.equal(await badge.getAttribute('title'), 'Canvases in this project have different access settings.');
  assert.equal(await badge.evaluate(el => el.tagName), 'BUTTON');
  await shot(page, REVIEW, 'project-menu-05a-badge');
  await badge.click();
  const dialog = page.getByRole('dialog', { name: 'Share project' });
  await dialog.waitFor({ timeout: 60000 });
  assert.equal(await dialog.getByRole('tab', { name: 'Canvases' }).getAttribute('aria-selected'), 'true', 'opens on the breakdown');
  await dialog.locator('[data-project-canvases]').waitFor({ timeout: 30000 });
  assert.match(await dialog.innerText(), /Canvases in this project have different access settings\./);
  assert.equal(await dialog.locator('[data-canvas-published]').count(), 1, 'only Attention heads is published now');
  assert.match(await rowOf(dialog, 'Causal masks').innerText(), /Link: Anyone with the link · no sign-in/);
  assert.doesNotMatch(await rowOf(dialog, 'Causal masks').innerText(), /Published on Explore/);
  await shot(page, REVIEW, 'project-menu-05b-breakdown');
  await closeShare();
});
await part('5b a partial failure of Apply to all canvases lists the canvas that failed, never claims all changed, and shows the saved states', async () => {
  const dialog = await shareProject(libraryCard('repository', NAME2));
  await dialog.getByRole('tab', { name: 'Canvases' }).click();
  await page.route(`**/api/learn/boards/${masks.name}/main/share`, route => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Could not save' }) }) : route.continue()));
  await dialog.locator('#apply-all-mode').selectOption('invited');
  await dialog.locator('[data-apply-all]').click();
  await dialog.locator('[data-confirm-apply]').click();
  const failed = dialog.locator('[data-apply-failed]');
  await failed.waitFor({ timeout: 30000 });
  assert.match(await failed.innerText(), /1 of 2 canvases could not be changed, so they keep their previous access/);
  assert.match(await failed.innerText(), /Causal masks: Could not save/);
  assert.doesNotMatch(await failed.innerText(), /Attention heads/, 'the canvas that changed is not listed as failed');
  assert.match(await rowOf(dialog, 'Attention heads').innerText(), /Link: Invited people only/, 'the reloaded state of the one that changed');
  assert.match(await rowOf(dialog, 'Causal masks').innerText(), /Link: Anyone with the link · no sign-in/, 'the one that failed keeps its access');
  await shot(page, REVIEW, 'project-menu-05c-partial-failure');
  await page.unroute(`**/api/learn/boards/${masks.name}/main/share`);
  await closeShare();
  await api(owner, `/api/learn/boards/${heads.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true }) });
});
let third;
await check('6 a canvas added later takes the project\'s visibility (Public again), and a mixed project adds one private', async () => {
  for (const c of [heads, masks]) await publishViaApi(c);
  third = await canvasIn('Positional encodings');
  assert.equal((await row(third.name)).access, 'public');
  await api(owner, `/api/apps/${third.name}/unpublish`, { method: 'POST' });
  assert.equal((await canvasIn('Loose notes')).access, 'private', 'mixed: private');
});
await check('7 a project on a private repository cannot be opened without signing in: the no-sign-in options are disabled and the Share window says why', async () => {
  await library();
  const dialog = await shareProject(libraryCard('repository', `secret-${run}`));
  assert.equal(await dialog.getByLabel('Who can open this?').locator('option[value="public"]').evaluate(o => o.disabled), true);
  assert.match(await dialog.innerText(), /Private repository: the link cannot be opened without signing in\./);
  await dialog.getByRole('tab', { name: 'Canvases' }).click();
  if (await dialog.locator('#apply-all-mode').count()) assert.equal(await dialog.locator('#apply-all-mode option[value="public"]').evaluate(o => o.disabled), true);
  await shot(page, REVIEW, 'project-menu-06-private-repository');
  await closeShare();
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
const total = 14;
console.log(results.length === total ? 'PASS' : 'FAIL', `${results.length}/${total} checks passed`);
process.exit(results.length === total ? 0 : 1);
