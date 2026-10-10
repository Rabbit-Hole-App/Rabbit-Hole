// Explore publishing end to end (docs/features/explore-publish.md), against the LOCAL stack only - local D1 and fresh
// browser profiles; never a deployed worker. No model calls; prints no secrets. The visibility matrix: PRIVATE (the
// default), UNLISTED (a share link), PUBLIC (Publish to Explore, opened at /e/<token> by anyone, read-only).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explore-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explore-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const run = Date.now().toString(36);
const EMAIL = { owner: `ex-owner-${run}@example.com`, other: `ex-other-${run}@example.org`, viewer: `ex-viewer-${run}@example.net`, late: `ex-late-${run}@example.net` };
const H = { owner: `own_${run}`, other: `oth_${run}`, viewer: `see_${run}`, late: `late_${run}` };
const who = {};
for (const k of Object.keys(EMAIL)) who[k] = { session: await sessionFor(EMAIL[k], H[k]) };
const api = (p, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${p.session}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then(r => r.json().then(body => ({ status: r.status, body })));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const contextFor = async (p, init = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Copy profile link writes the clipboard; the check reads it back.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  if (p) await context.addCookies([{ name: 'small_session', value: p.session, url: BASE }]);
  if (init) await context.addInitScript(init.fn, init.arg);
  // A new hole's opening question is a Tutor turn (#46): answered here, as shared-rabbit-hole-check does; the planner's real
  // wiring is covered on the journey stack. Next Steps hook requests reach the real route (provider-boundary fixture).
  await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: 'What would you like to explore first?' }] } }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
};
const shot = async (page, name, locator = page) => { if (!SHOTS) return; await page.waitForTimeout(400); await locator.screenshot({ path: `${SHOTS}/${name}.png` }); };
// Nobody else's email on the page (a signed-in person's own account menu may show their own, privately).
const noEmail = async (page, own = null) => { const html = await page.content(); return Object.values(EMAIL).filter(email => email !== own).every(email => !html.includes(email)); };
const SEED = text => ({ strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 360, y2: 240, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false, text }] });

// ---- the owner's canvas: PRIVATE, then UNLISTED, then PUBLIC, from the Share panel ----
const TITLE = `Why ice floats (explore ${run})`;
const mine = (await api(who.owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) })).body;
const catalog = (await api(who.owner, '/api/apps')).body;
const key = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${mine.name}`;
const owner = await contextFor(who.owner, { fn: ([k, seed]) => { if (!localStorage.getItem(`${k}:ink`)) localStorage.setItem(`${k}:ink`, JSON.stringify(seed)); }, arg: [key, SEED('Hydrogen bonds')] });
await owner.page.goto(`${BASE}/apps/${mine.name}`);
await owner.page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
await owner.page.locator('[data-share-button]').click();
const panel = owner.page.getByRole('dialog', { name: 'Share this board' });
await panel.locator('[data-explore-publish]').waitFor({ timeout: 15000 });
check('PRIVATE: the panel says only the owner sees it, and offers Publish to Explore', (await panel.innerText()).includes('Only you can see this board.') && await panel.locator('[data-publish]').count() === 1);
await shot(owner.page, '01-private', panel);
await panel.getByRole('switch', { name: 'Share this board' }).click();
await panel.locator('input[aria-label="View link URL"]').waitFor({ timeout: 15000 });
const shareToken = (await panel.locator('input[aria-label="View link URL"]').inputValue()).split('/b/')[1];
const explore = async p => (await api(p, '/api/learn/boards/published')).body.canvases;
check('UNLISTED: a share link exists, and the canvas is still not in Explore', !!shareToken && !(await explore(who.viewer)).some(c => c.title === TITLE) && await panel.locator('[data-publish]').count() === 1);
await shot(owner.page, '02-unlisted', panel);
await panel.locator('[data-publish]').click();
await panel.locator('[data-explore-publish="published"]').waitFor({ timeout: 30000 });
const eUrl = await panel.locator('input[aria-label="Explore link URL"]').inputValue();
const token = eUrl.split('/e/')[1];
check('PUBLIC: Published to Explore, its own /e link (never the share link), and Remove from Explore', !!token && token !== shareToken && await panel.locator('[data-unpublish]').count() === 1);
await shot(owner.page, '03-public', panel);

// ---- another owner's published canvas, and a private and an unlisted one that must stay out ----
const OTHER = `Bridge loads (explore ${run})`;
const theirs = (await api(who.other, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: OTHER }) })).body;
await api(who.other, `/api/learn/boards/${theirs.name}/main`, { method: 'PUT', body: JSON.stringify({ state: SEED('Trusses') }) });
await api(who.other, `/api/apps/${theirs.name}/publish`, { method: 'POST', body: '{}' });
const hidden = (await api(who.owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Private draft (explore ${run})` }) })).body;
await api(who.owner, `/api/learn/boards/${hidden.name}/main`, { method: 'PUT', body: JSON.stringify({ state: SEED('Secret') }) });
const listed = (await explore(who.viewer)).map(c => c.title);
check('Explore lists the published canvases, newest first, and neither private nor unlisted ones', listed.indexOf(OTHER) === 0 && listed.includes(TITLE) && !listed.some(t => /Private draft/.test(t)), JSON.stringify(listed.slice(0, 4)));

// ---- a signed-in viewer: Explore, then the published canvas ----
const viewer = await contextFor(who.viewer);
await viewer.page.goto(`${BASE}/explore`);
await viewer.page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 });
const card = viewer.page.locator('[data-explore-card]').filter({ hasText: TITLE });
// Owner, 2026-10-08: two tabs, Explainers (the default, with Sort) and Creators; the search is the active tab's.
check('Explore opens on the Learning Boards tab, with Sort, searching learning boards only', (await viewer.page.locator('[data-explore-tabs] [role="tab"][data-state="active"]').innerText()) === 'Learning Boards'
  && await viewer.page.locator('[data-sort-control]').count() === 1 && (await viewer.page.locator('[data-explore-search]').getAttribute('placeholder')) === 'Search learning boards'
  && await viewer.page.locator('[data-creator-chip]').count() === 0);
check('the Explore card shows the creator\'s @handle and the fork count, no email', (await card.locator('[data-creator]').innerText()).trim() === `@${H.owner}` && await noEmail(viewer.page, EMAIL.viewer));
await shot(viewer.page, '04-explore');
// Copy profile link on the Creators tab (owner, 2026-10-08): the absolute /@handle on the clipboard; the card's compact
// button stays icon-sized (a check replaces the link icon, the words are its sr-only live text), then reverts; Explore
// stays where it is.
await viewer.page.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
const creatorCard = viewer.page.locator(`[data-explore-creators] [data-creator-card="${H.owner}"]`);
await creatorCard.waitFor({ timeout: 30000 });
const copyProfile = creatorCard.locator('[data-copy-profile]');
const before = viewer.page.url();
const iconWidth = (await copyProfile.boundingBox()).width;
await copyProfile.click();
await viewer.page.waitForTimeout(300);
const said = (await copyProfile.locator('[data-copy-status][aria-live="polite"]').textContent()).trim();
const swapped = await copyProfile.locator('svg.lucide-check').count() === 1 && (await copyProfile.boundingBox()).width === iconWidth;
const clip = await viewer.page.evaluate(() => navigator.clipboard.readText());
await shot(viewer.page, '04b-explore-copy-profile', creatorCard);
await viewer.page.waitForTimeout(1800);
check('Copy profile link on a creator card: the clipboard holds origin + /@handle, a check icon and the live text Profile link copied, no wider, then reverts; nothing navigates',
  clip === `${BASE}/@${H.owner}` && said === 'Profile link copied' && swapped && viewer.page.url() === before && (await copyProfile.getAttribute('aria-label')) === 'Copy profile link',
  `${clip} | ${said} | ${swapped} | ${viewer.page.url()}`);
await viewer.page.locator('[data-explore-tabs]').getByRole('tab', { name: 'Learning Boards' }).click();
await card.waitFor({ timeout: 30000 });
// A click on the card body only selects it (owner, 2026-10-08); its title opens it.
await card.click();
await viewer.page.waitForTimeout(500);
check('a click on the Explore card selects it and stays on Explore', new URL(viewer.page.url()).pathname === '/explore');
// An Explore card's Start Rabbit Hole asks there (owner, 2026-10-08): Cancel stays on Explore with nothing started.
const exploreStarts = [];
viewer.page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/rabbit-hole')) exploreStarts.push(r.url()); });
const cardStart = card.locator('[data-card-start-rabbit-hole]');
if (await cardStart.count()) {
  await cardStart.click();
  const choice = viewer.page.getByRole('dialog', { name: 'Start a Rabbit Hole' });
  await choice.waitFor({ timeout: 10000 });
  check('an Explore card asks From this canvas or Blank, naming "<title> notes"', (await choice.innerText()).includes(`"${TITLE} notes"`)
    && await choice.getByRole('button', { name: 'Blank', exact: true }).count() === 1 && await choice.getByRole('button', { name: 'From this canvas', exact: true }).count() === 1);
  await choice.getByRole('button', { name: 'Cancel', exact: true }).click();
  await viewer.page.waitForTimeout(400);
  check('Cancel starts nothing and stays on Explore', exploreStarts.length === 0 && new URL(viewer.page.url()).pathname === '/explore');
}
await card.locator('[data-card-title]').click();
await viewer.page.waitForURL(new RegExp(`/e/${token}$`), { timeout: 30000 });
await viewer.page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
const header = viewer.page.locator('header');
check('Explore -> the published canvas: read-only, Published by @handle, [Start Rabbit Hole] [Fork 0]', (await viewer.page.locator('[data-shared-creator]').innerText()).trim() === `Published by @${H.owner}`
  && (await header.innerText()).includes('View only') && await viewer.page.locator('[data-start-rabbit-hole]').count() === 1
  && (await viewer.page.locator('[data-fork-button]').getAttribute('aria-label')) === 'Fork, 0 forks' && await noEmail(viewer.page, EMAIL.viewer));
await shot(viewer.page, '05-explore-to-canvas');

// ---- signed out: the canvas opens; Fork and Start Rabbit Hole sign in and resume against the same publication ----
const anon = await contextFor(null);
await anon.page.goto(`${BASE}/e/${token}`);
await anon.page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
check('signed out, /e opens the published canvas, read-only, with no email', await anon.page.locator('[data-shared-creator]').count() === 1 && await noEmail(anon.page));
await shot(anon.page, '06-signed-out');
// Fork asks first (owner, 2026-10-08): "Fork this canvas" before the sign-in, and again on the way back - never a silent fork.
const forkDialog = () => anon.page.getByRole('dialog', { name: 'Fork this canvas' });
const confirmFork = async () => { await forkDialog().waitFor({ timeout: 30000 }); await forkDialog().getByRole('button', { name: 'Fork', exact: true }).click(); };
const signInThen = async (button, expectNext, confirm = null) => {
  await anon.page.locator(button).click();
  if (confirm) await confirm();
  await anon.page.waitForURL(/\/(login|sign-in)\?next=/, { timeout: 20000 });
  const next = new URL(anon.page.url()).searchParams.get('next');
  // The dev worker refuses /login (the P0-B barrier): the session the sign-in would end with, then `next`.
  await anon.context.addCookies([{ name: 'small_session', value: who.late.session, url: BASE }]);
  await anon.page.goto(`${BASE}${next}`);
  return next === expectNext ? null : next;
};
const wrongFork = await signInThen('[data-fork-button]', `/e/${token}?fork=1`, confirmFork);
await forkDialog().waitFor({ timeout: 60000 });
check('back from sign-in, the Fork dialog opens again with the title, and nothing is forked yet', await forkDialog().getByRole('textbox', { name: 'Name' }).inputValue() === TITLE
  && (await api(who.late, '/api/canvases')).body.canvases.length === 0);
await confirmFork();
await anon.page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 60000 });
const forkName = new URL(anon.page.url()).pathname.split('/').pop();
const fork = (await api(who.late, `/api/apps/${forkName}`)).body;
check('Fork signed out -> sign in -> the fork is made from the same publication, owned by the forker, crediting @owner', wrongFork === null && fork.owner_handle === H.late && fork.forked_from_handle === H.owner && fork.forked_from_url === `/e/${token}` && fork.published === false, wrongFork || '');
await anon.context.clearCookies();
await anon.page.goto(`${BASE}/e/${token}`);
await anon.page.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
// Start Rabbit Hole asks From this canvas or Blank first (owner, 2026-10-08); the choice rides the sign-in.
const fromThisCanvas = async () => { const choice = anon.page.getByRole('dialog', { name: 'Start a Rabbit Hole' }); await choice.waitFor({ timeout: 30000 }); await choice.getByRole('button', { name: 'From this canvas', exact: true }).click(); };
const wrongHole = await signInThen('[data-start-rabbit-hole]', `/e/${token}?rabbit=root`, fromThisCanvas);
await anon.page.waitForURL(/\/apps\/canvas-[a-f0-9]{8}$/, { timeout: 60000 });
const tree = (await api(who.late, `/api/canvases/dives?app=${new URL(anon.page.url()).pathname.split('/').pop()}&board=main`)).body;
check('Start Rabbit Hole signed out -> sign in -> a private hole from the same publication', wrongHole === null && tree.path?.[0]?.href === `/e/${token}`, wrongHole || JSON.stringify(tree.path?.[0] || {}));
check('a fork counts once; the hole never', (await explore(who.viewer)).find(c => c.title === TITLE)?.fork_count === 1);

// ---- Remove from Explore: /e and the listing go, the share link stays ----
await owner.page.locator('[data-unpublish]').click();
await owner.page.getByRole('dialog', { name: 'Share this board' }).locator('[data-explore-publish="private"]').waitFor({ timeout: 30000 });
await shot(owner.page, '07-unpublished', owner.page.getByRole('dialog', { name: 'Share this board' }));
await viewer.page.goto(`${BASE}/e/${token}`);
await viewer.page.getByText('could not be opened', { exact: false }).or(viewer.page.getByText('not shared any more', { exact: false })).first().waitFor({ timeout: 30000 });
const share = await api(who.viewer, `/api/learn/boards/shared/${shareToken}`);
check('removed: /e no longer opens, Explore drops it, the share link still opens', !(await explore(who.viewer)).some(c => c.title === TITLE) && share.status === 200);
await shot(viewer.page, '08-unpublished-link');

// ---- the creator card (owner, 2026-10-08): square, the profile description as text, "N projects · M canvases" counting
// published canvases only (a private one never counts; the other creator has no public project) ----
const ABOUT = `Explains <b>trusses</b> & loads ${run}`;
check('a profile description saves through Settings\' route', (await api(who.other, '/api/profile', { method: 'PUT', body: JSON.stringify({ description: ABOUT }) })).body.description === ABOUT);
await api(who.other, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Private sketch (explore ${run})` }) });
const people = await contextFor(who.viewer);
await people.page.goto(`${BASE}/explore?tab=creators`);
const otherCard = people.page.locator(`[data-explore-creators] [data-creator-card="${H.other}"]`);
await otherCard.waitFor({ timeout: 30000 });
const square = async () => { const b = await otherCard.boundingBox(); return Math.abs(b.width - b.height) <= 1; };
const about = otherCard.locator('[data-creator-description]');
const counts = (await otherCard.locator('[data-creator-counts]').innerText()).trim();
check('a creator card is square, shows the description as text (never HTML) and N projects · M canvases of published canvases only',
  await square() && (await about.innerText()).trim() === ABOUT && await about.locator('*').count() === 0 && counts === '0 projects · 1 canvas', counts);
await shot(people.page, '09-creator-card', otherCard);
await people.page.setViewportSize({ width: 390, height: 844 });
await people.page.waitForTimeout(400);
const tops = await people.page.locator('[data-explore-creators] [data-creator-card]').evaluateAll(cards => cards.slice(0, 2).map(c => Math.round(c.getBoundingClientRect().top)));
check('on a phone the creator cards stay square, two to a row, with no sideways scroll', await square() && tops.length === 2 && tops[0] === tops[1]
  && await people.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(tops));
await shot(people.page, '10-creator-cards-phone');
await people.context.close();

// ---- the type filter (owner 2026-10-09: "Explore should have a filter for Projects or Canvas"; "same filter as library?"):
// the Library's Filters, Projects and Canvas only, in the same ?type=. A public project and a private-repository one are
// seeded in local D1 (importing needs the indexer), as project-canvases-check.mjs does; PERSIST is the stack's directory.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local';
const theirsCatalog = (await api(who.other, '/api/apps')).body;
const PUB = `repo-${run.slice(-8).padStart(8, '0')}-xpub`, PRIV = `repo-${run.slice(-8).padStart(8, '0')}-xpriv`, PUB_REPO = `acme/explore-${run}`, PRIV_REPO = `acme/hidden-${run}`;
execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to ${PERSIST} -c packages/web/wrangler.dev.jsonc --command "INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${theirsCatalog.org}','${PUB}','${theirsCatalog.email}','${PUB_REPO}','main','${'d'.repeat(40)}','ready'), ('${theirsCatalog.org}','${PRIV}','${theirsCatalog.email}','${PRIV_REPO}','main','${'d'.repeat(40)}','ready'); INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${PUB}'"`, { cwd: ROOT, shell: true, stdio: 'ignore' });
const boardIn = async (title, project) => {
  const c = (await api(who.other, '/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).body;
  await api(who.other, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: SEED(title) }) });
  return (await api(who.other, `/api/apps/${c.name}/publish`, { method: 'POST', body: '{}' })).status;
};
const PUB_BOARD = `Truss board ${run}`, PRIV_BOARD = `Hidden-repo board ${run}`;
check('a board published in a public project and one in a private repository', await boardIn(PUB_BOARD, PUB) === 200 && await boardIn(PRIV_BOARD, PRIV) === 200);
const typed = await contextFor(who.viewer);
const tp = typed.page;
const settle = () => tp.waitForTimeout(1200);
const search = async (text) => { await tp.locator('[data-explore-search]').fill(text); await settle(); };
const emptyLine = async () => (await tp.locator('[data-search-empty]').count()) ? (await tp.locator('[data-search-empty]').innerText()).trim() : null;
await tp.goto(`${BASE}/explore`);
await tp.locator('[data-explore-card]').first().waitFor({ timeout: 60000 });
await tp.getByRole('button', { name: 'Filters' }).click();
const rows = {};
for (const name of ['Projects', 'Canvas', 'Apps', 'Archived canvas', 'Mine']) rows[name] = await tp.getByRole('button', { name, exact: true }).count();
check('the Filters control beside Sort, the Library\'s, with its Projects and Canvas rows only', JSON.stringify(rows) === JSON.stringify({ Projects: 1, Canvas: 1, Apps: 0, 'Archived canvas': 0, Mine: 0 }), JSON.stringify(rows));
await shot(tp, '11-explore-filters', tp.locator('[data-explore-search]').locator('xpath=../..'));
await tp.getByRole('button', { name: 'Projects', exact: true }).click();
await tp.waitForURL(/\/explore\?type=projects$/);
await search(`explore-${run}`);
const project = tp.locator(`[data-explore-project="${PUB_REPO}"]`);
check('Projects: ?type=projects, the Library\'s chip, one card for the public project - its name, repository and "1 learning board" - and no board cards',
  await project.count() === 1 && (await project.locator('[data-card-title]').innerText()).trim() === `explore-${run}` && (await project.locator('[data-source-link]').innerText()).trim() === `github.com/${PUB_REPO}`
  && (await project.locator('[data-canvas-count]').innerText()).trim() === '1 learning board' && await tp.locator('[data-explore-card]').count() === 0
  && (await tp.getByRole('button', { name: 'Remove filter Projects' }).count()) === 1);
await shot(tp, '12-explore-projects');
await search(`hidden-${run}`);
check('Projects never lists a private repository: "No projects match"', await tp.locator('[data-explore-project]').count() === 0 && await emptyLine() === `No projects match “hidden-${run}”.`, await emptyLine());
await tp.reload();
await tp.locator('[data-explore-project]').first().waitFor({ timeout: 30000 });
check('a reload keeps ?type=projects and its chip', new URL(tp.url()).search === '?type=projects' && (await tp.getByRole('button', { name: 'Remove filter Projects' }).count()) === 1);
// Opened unsearched (the reload cleared the field), so the project view lists every board of the project.
await project.locator('[data-card-title]').click();
await tp.waitForURL(new RegExp(`/explore\\?project=${encodeURIComponent(PUB_REPO)}$`));
await tp.locator('[data-project-filter]').waitFor({ timeout: 30000 });
await settle();
check('a project card opens Explore\'s project view, listing its boards', (await tp.locator('[data-explore-card] [data-card-title]').allInnerTexts()).map(t => t.trim()).join() === PUB_BOARD);
await tp.goto(`${BASE}/explore?type=canvases`);
await tp.locator('[data-explore-card], [data-search-empty]').first().waitFor({ timeout: 60000 });
await search(`board ${run}`);
const boards = (await tp.locator('[data-explore-card] [data-card-title]').allInnerTexts()).map(t => t.trim());
check('Canvas: ?type=canvases lists boards naming no project - a private repository is never named - and never a public project\'s', boards.includes(PRIV_BOARD) && !boards.includes(PUB_BOARD)
  && await tp.locator('[data-explore-card] [data-card-project]').count() === 0 && (await tp.getByRole('button', { name: 'Remove filter Canvas' }).count()) === 1, JSON.stringify(boards));
await search(PUB_BOARD);
check('Canvas with a search that only a project\'s board matches: "No canvases match"', await emptyLine() === `No canvases match “${PUB_BOARD}”.`, await emptyLine());
await shot(tp, '13-explore-canvases-empty');
await tp.getByRole('button', { name: 'Remove filter Canvas' }).click();
await tp.waitForURL(/\/explore$/);
await settle();
check('removing the chip is All again: today\'s list, the public project\'s board included', (await tp.locator('[data-explore-card] [data-card-title]').allInnerTexts()).map(t => t.trim()).includes(PUB_BOARD));
await typed.context.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
