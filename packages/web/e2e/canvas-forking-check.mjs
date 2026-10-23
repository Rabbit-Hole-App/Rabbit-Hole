// Canvas forking (docs/features/canvas-forking.md) end to end, against the LOCAL stack only - it writes to
// local D1 and fresh browser profiles; never point it at a deployed worker. No model calls; prints no secrets.
//   app:           npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8848
//   control plane: npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fork-local --port 8849
// Usage: BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 node e2e/canvas-forking-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-forking-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const sessionFor = async email => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json()).session;
const run = Date.now().toString(36);
const OWNER = `fork-owner-${run}@example.com`, VIEWER = `fork-viewer-${run}@example.org`;
const owner = { session: await sessionFor(OWNER) }, viewer = { session: await sessionFor(VIEWER) };
const api = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then(r => r.json());
const canvases = who => api(who, '/api/canvases').then(d => d.canvases);

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const pageFor = async (who, init = null) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---- the owner's canvas, its content only in their browser (as Learn saves it) ----
const TITLE = 'Attention (fork check)';
const source = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) });
const catalog = await api(owner, '/api/apps');
const base = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${source.name}`;
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SEED = { strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, ...style, text: 'Softmax', roughness: 2, seed: 4242 }] };
const CHAT = [{ id: 'seed-q', question: 'Why exponentiate?', answer: 'Scores become positive weights that add to 1.', status: 'done', dx: 0, dy: 0 }];
const ownerPage = await pageFor(owner, { fn: ([key, seed, chat]) => { if (localStorage.getItem(`${key}:ink`)) return; localStorage.setItem(`${key}:ink`, JSON.stringify(seed)); localStorage.setItem(`${key}:chat`, JSON.stringify(chat)); }, arg: [base, SEED, CHAT] });
await ownerPage.goto(`${BASE}/apps/${source.name}`);
await ownerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
await ownerPage.waitForTimeout(1200);
// Sloppiness (UI-34): the rectangle is saved Rough with a seed; every view of the board draws the same hand-drawn strokes.
const lookOf = page => page.locator('[data-shape-id="seed-rect"] g[data-sloppy="2"] path').evaluateAll(nodes => JSON.stringify(nodes.map(node => node.getAttribute('d'))));
const ownerLook = await lookOf(ownerPage);
check('the owner sees the rectangle drawn Rough: two hand-drawn strokes', JSON.parse(ownerLook).length === 2, ownerLook);
// No Fork on your own canvas (owner, 2026-10-08): Duplicate in the Library's ⋮ copies it.
check('your own canvas top bar has Share and no Fork', await ownerPage.locator('[data-fork-button]').count() === 0 && await ownerPage.locator('[data-share-button]').count() === 1);
check('no content card carries a fork control', await ownerPage.locator('[data-block-id] [data-fork-button], [data-shape-id] [data-fork-button]').count() === 0);
await shot(ownerPage, '01-source-top-bar');

// ---- a shared canvas: another person forks it through the link, after the confirm-and-rename dialog ----
const shared = await api(owner, `/api/learn/boards/${source.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: { ...SEED, exchanges: CHAT } }) });
const viewerPage = await pageFor(viewer);
await viewerPage.goto(`${BASE}/b/${shared.sharing.view}`);
await viewerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
check('a shared view draws the very same strokes as the owner', await lookOf(viewerPage) === ownerLook);
// The header's one Fork control carries the count (owner, 2026-10-06): [fork icon  Fork  N], no separate label.
// Zero forks: Fork alone - no count element, no count in the accessible name, no separator or reserved space.
const zeroHeader = async page => { const button = page.locator('header [data-fork-button]'); return (await button.locator('[data-fork-count-value]').count()) === 0 && (await button.getAttribute('aria-label')) === null && (await button.innerText()).trim() === 'Fork' && await page.locator('header [data-fork-count]').count() === 0; };
const headerCount = async page => ({ value: (await page.locator('header [data-fork-button] [data-fork-count-value]').innerText()).trim(), label: await page.locator('header [data-fork-button]').getAttribute('aria-label') });
const ownerCount = async () => (await canvases(owner)).find(c => c.name === source.name)?.fork_count;
let seen;
check('the shared board shows its title and one Fork control; at zero forks no 0, badge or separator (owner, 2026-10-22)', await viewerPage.getByText(TITLE).count() >= 1 && await viewerPage.locator('[data-fork-button]').count() === 1
  && await zeroHeader(viewerPage), await viewerPage.locator('header [data-fork-button]').evaluate(button => button.outerHTML));
await shot(viewerPage, '02-shared-board');
// Fork opens "Fork this canvas" (owner, 2026-10-08): the name prefilled with the source title, Cancel and Fork.
const dialog = page => page.getByRole('dialog', { name: 'Fork this canvas' });
const nameField = page => dialog(page).getByRole('textbox', { name: 'Name' });
await viewerPage.locator('[data-fork-button]').dblclick();
await dialog(viewerPage).waitFor({ timeout: 10000 });
check('a press (even a double click) opens one dialog, prefilled with the source title, and forks nothing yet', await dialog(viewerPage).count() === 1
  && await nameField(viewerPage).inputValue() === TITLE && (await canvases(viewer)).length === 0);
check('the dialog offers Cancel and a primary Fork', await dialog(viewerPage).getByRole('button', { name: 'Cancel', exact: true }).count() === 1 && await dialog(viewerPage).getByRole('button', { name: 'Fork', exact: true }).count() === 1);
await shot(viewerPage, '03-fork-dialog');
await dialog(viewerPage).getByRole('button', { name: 'Cancel', exact: true }).click();
await viewerPage.waitForTimeout(800);
check('Cancel forks nothing and stays on the link', await dialog(viewerPage).count() === 0 && (await canvases(viewer)).length === 0 && new URL(viewerPage.url()).pathname === `/b/${shared.sharing.view}` && await ownerCount() === 0);
await viewerPage.locator('[data-fork-button]').click();
await dialog(viewerPage).waitFor({ timeout: 10000 });
await viewerPage.keyboard.press('Escape');
await viewerPage.waitForTimeout(800);
check('Escape forks nothing either', await dialog(viewerPage).count() === 0 && (await canvases(viewer)).length === 0);
// Rename in the dialog, then Fork (double-clicked: one fork): the copy takes the typed name; the provenance keeps the source title.
await viewerPage.locator('[data-fork-button]').click();
await nameField(viewerPage).fill('My attention notes');
await dialog(viewerPage).getByRole('button', { name: 'Fork', exact: true }).dblclick();
await viewerPage.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 20000 });
const viewerFork = new URL(viewerPage.url()).pathname.split('/').pop();
await viewerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 30000 });
check('the fork keeps the level and the seed, and draws the same strokes', await lookOf(viewerPage) === ownerLook && (await api(viewer, `/api/learn/boards/${viewerFork}/main`)).state?.shapes?.find(shape => shape.id === 'seed-rect')?.seed === 4242);
// The fork's origin is the header's fork-history button (decisions 1A and 4A, C:/s/spec/hdr-provenance.md): the label beside the
// title is gone; the button names the source, and its popover links each ancestor this viewer may open, in a new tab.
const forkButton = viewerPage.locator('[data-provenance-fork]');
const forkLabel = () => forkButton.getAttribute('aria-label');
const historyLinks = async () => {
  if (await forkButton.getAttribute('aria-expanded') !== 'true') await forkButton.click();
  await viewerPage.locator('[data-fork-history]').waitFor();
  return viewerPage.locator('[data-fork-history] [data-ancestor-link]');
};
await forkButton.waitFor({ timeout: 10000 });
let theirs = await canvases(viewer);
check('one confirmed fork, named as typed, in the viewer\'s Library, owned by them', theirs.length === 1 && theirs[0].name === viewerFork && theirs[0].title === 'My attention notes' && theirs[0].owner_email === VIEWER);
check('the fork names its source title in the top bar', await forkLabel() === `Forked from ${TITLE}`);
let links = await historyLinks();
check('the viewer\'s fork holds the shared content and links back through the link, in a new tab', await links.count() === 1 && (await links.first().getAttribute('href')) === `/b/${shared.sharing.view}` && (await links.first().getAttribute('target')) === '_blank');
await viewerPage.keyboard.press('Escape');
check('the fork\'s own top bar has no Fork: it is the viewer\'s canvas now', await viewerPage.locator('[data-fork-button]').count() === 0);
check('the source counts one direct fork', await ownerCount() === 1);
await shot(viewerPage, '04-fork-opened');
// Fork and source are independent (control-plane canvas-forking.test.js); here the link back opens the original.
await viewerPage.reload(); await forkButton.waitFor({ timeout: 30000 });
check('after a reload the fork still reads Forked from the source title', await forkLabel() === `Forked from ${TITLE}`);
links = await historyLinks();
const [original] = await Promise.all([viewerPage.context().waitForEvent('page'), links.first().click()]);
await original.waitForURL(new RegExp(`/b/${shared.sharing.view}$`), { timeout: 20000 });
await original.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 30000 });
check('the history link opens the original in a new tab, untouched by the fork\'s edits', await original.locator('[data-shape-id="seed-rect"]').count() === 1);
await original.close();

// ---- Libraries: no Fork on your own cards; the read-only count only once someone forked it ----
await ownerPage.goto(`${BASE}/library?type=canvases`);
await ownerPage.locator('[data-library-card="canvas"]').first().waitFor({ timeout: 30000 });
const card = (page, title) => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: title }) });
check('the owner\'s Library card: the title opens, no Fork, and 1 fork', (await card(ownerPage, TITLE).locator('[data-card-title]').getAttribute('href')) === `/apps/${source.name}`
  && await card(ownerPage, TITLE).locator('[data-fork-button]').count() === 0 && await card(ownerPage, TITLE).getByRole('button', { name: /Fork/ }).count() === 0
  && (await card(ownerPage, TITLE).locator('[data-fork-count]').innerText()).trim() === '1 fork');
await shot(ownerPage, '05-owner-library-card');
await viewerPage.goto(`${BASE}/library?type=canvases`);
await card(viewerPage, 'My attention notes').waitFor({ timeout: 30000 });
check('the viewer\'s fork card: Forked from the source, no Fork, no "0 forks"', (await card(viewerPage, 'My attention notes').locator('[data-forked-from]').innerText()).includes(`“${TITLE}”`)
  && await card(viewerPage, 'My attention notes').locator('[data-fork-button]').count() === 0 && await card(viewerPage, 'My attention notes').locator('[data-fork-count]').count() === 0);
await shot(viewerPage, '06-viewer-library-card');

// ---- a second fork with the name cleared falls back to the source title; the header and Library count 2 ----
const linkPage = await pageFor(viewer);
await linkPage.goto(`${BASE}/b/${shared.sharing.view}`);
await linkPage.locator('header [data-fork-button] [data-fork-count-value]').waitFor({ timeout: 60000 });
seen = await headerCount(linkPage);
check('a reload of the link reads the canonical count, 1', seen.value === '1' && seen.label === 'Fork, 1 fork' && await ownerCount() === 1, JSON.stringify(seen));
await linkPage.locator('[data-fork-button]').click();
await nameField(linkPage).fill('   ');
await nameField(linkPage).press('Enter');
await linkPage.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 20000 });
theirs = await canvases(viewer);
check('a blank name falls back to the source title (Enter confirms)', theirs.length === 2 && theirs.some(c => c.title === TITLE && c.forked_from?.state === 'accessible' && c.forked_from.title === TITLE));
check('the source now counts two direct forks', await ownerCount() === 2);
await linkPage.goto(`${BASE}/b/${shared.sharing.view}`);
await linkPage.locator('header [data-fork-button] [data-fork-count-value]').waitFor({ timeout: 60000 });
seen = await headerCount(linkPage);
check('a reload of the link reads the canonical count, 2', seen.value === '2' && seen.label === 'Fork, 2 forks', JSON.stringify(seen));
await shot(linkPage, '07-shared-header-2-forks');

// ---- an unrelated shared canvas with no forks reads Fork 0 in its header and no count on its card ----
const zero = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Bridge loads (fork check)' }) });
const zeroShare = await api(owner, `/api/learn/boards/${zero.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: { ...SEED, shapes: [{ ...SEED.shapes[0], id: 'zero-rect', text: 'Truss' }] } }) });
await linkPage.goto(`${BASE}/b/${zeroShare.sharing.view}`);
await linkPage.locator('[data-shape-id="zero-rect"]').waitFor({ timeout: 60000 });
check('an unrelated shared canvas with no forks shows Fork alone, no 0', await zeroHeader(linkPage) && (await canvases(owner)).find(c => c.name === zero.name)?.fork_count === 0);
await shot(linkPage, '07b-shared-header-0-forks');
await ownerPage.goto(`${BASE}/library?type=canvases`);
await card(ownerPage, 'Bridge loads (fork check)').waitFor({ timeout: 30000 });
// 0 shows nothing on your own card (owner, 2026-10-08): the read-only count appears once someone forked it.
check('the owner\'s Library cards read the same counts: 2 forks, and none at 0', (await card(ownerPage, TITLE).locator('[data-fork-count]').innerText()).trim() === '2 forks'
  && await card(ownerPage, 'Bridge loads (fork check)').locator('[data-fork-count]').count() === 0);
await shot(ownerPage, '07c-library-cards-counts');
await viewerPage.goto(`${BASE}/apps/${viewerFork}?tab=learn`);

// ---- the owner stops sharing: the source still exists but this viewer may no longer open it, so it is a private canvas -
// no title and no link (decision 1A: inaccessible ancestors are never named) ----
await api(owner, `/api/learn/boards/${source.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: false }) });
await viewerPage.reload();
await viewerPage.waitForFunction(() => document.querySelector('[data-provenance-fork]')?.getAttribute('aria-label') === 'Forked from a private canvas', null, { timeout: 30000 });
links = await historyLinks();
check('with the link off, the source reads a private canvas, with no title and no link', await links.count() === 0 && (await viewerPage.locator('[data-fork-history] [data-ancestor="private"]').count()) === 1
  && !(await viewerPage.locator('[data-canvas-header]').innerText()).includes(TITLE));
await viewerPage.keyboard.press('Escape');
// The attribution can arrive before the canvas paints: wait for the shape, not a fixed moment.
await viewerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 30000 }).catch(() => {});
check('the fork still opens with its content', await viewerPage.locator('[data-shape-id="seed-rect"]').count() === 1);
await shot(viewerPage, '07-original-unavailable');
// A private canvas cannot be forked by someone else, by name.
const refused = await fetch(`${BASE}/api/learn/boards/fork`, { method: 'POST', headers: { cookie: `small_session=${viewer.session}`, 'content-type': 'application/json' }, body: JSON.stringify({ source: { canvas: source.name }, key: `refuse-${run}` }) });
check('a private canvas of someone else is refused', refused.status === 404 || refused.status === 403, String(refused.status));

// ---- SHARE-02 (owner brief 2026-10-22 sections 3 and 9): signed out, a visitor edits a temporary copy; the source never
// changes; Fork goes through sign-in with the copy kept, and the fork holds the visitor's edit ----
const guestSource = await api(owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'Guest draft (fork check)' }) });
const guestShare = await api(owner, `/api/learn/boards/${guestSource.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: SEED }) });
const ownerShapes = async () => (await api(owner, `/api/learn/boards/${guestSource.name}/main`)).state?.shapes?.length;
const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestPage = await guestContext.newPage();
guestPage.on('pageerror', error => errors.push(error.message));
const writes = [];
// A write to the source: any non-GET naming its board or its link, other than the read-only hooks and questions routes.
guestPage.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (!['GET', 'HEAD'].includes(request.method()) && (path.includes(guestSource.name) || path.includes(`/shared/${guestShare.sharing.view}`)) && !/\/(next-steps|ask)$/.test(path)) writes.push(`${request.method()} ${path}`);
});
await guestPage.goto(`${BASE}/b/${guestShare.sharing.view}`);
await guestPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
await guestPage.waitForTimeout(800);
// Owner header brief, 2026-10-22 item 5: the note belongs directly beneath Fork in the temporary-edit experience, from the first moment.
const noteBox = await guestPage.locator('[data-guest-draft-notice]').boundingBox(), forkBox = await guestPage.locator('header [data-fork-button]').boundingBox();
check('signed out, the note sits directly beneath Fork before any edit, and there is no Sign in button', (await guestPage.locator('[data-guest-draft-notice]').innerText()).trim() === "Changes aren't saved. Fork to keep them"
  && noteBox.y >= forkBox.y + forkBox.height - 1 && noteBox.y - (forkBox.y + forkBox.height) < 16 && noteBox.x + noteBox.width > forkBox.x - 1 && noteBox.x < forkBox.x + forkBox.width + 1
  && await guestPage.locator('[data-canvas-header] [data-guest-draft-notice]').count() === 1 && await guestPage.locator('[data-sign-in]').count() === 0);
const toScreen = (x, y) => guestPage.evaluate(([x, y]) => {
  const world = document.querySelector('[data-canvas-surface] > div[style*="scale"]'), m = new DOMMatrix(getComputedStyle(world).transform), box = world.parentElement.getBoundingClientRect();
  return { x: box.left + m.e + x * m.a, y: box.top + m.f + y * m.d };
}, [x, y]);
await guestPage.keyboard.press('r');
const from = await toScreen(420, 360), to = await toScreen(560, 440);
await guestPage.mouse.move(from.x, from.y); await guestPage.mouse.down(); await guestPage.mouse.move(to.x, to.y, { steps: 6 }); await guestPage.mouse.up();
await guestPage.keyboard.press('Escape');
await guestPage.locator('[data-guest-draft-notice]').waitFor({ timeout: 10000 });
check('after the first edit the same exact note stays', (await guestPage.locator('[data-guest-draft-notice]').innerText()).trim() === "Changes aren't saved. Fork to keep them");
await guestPage.waitForTimeout(800);
check('the guest\'s edit never reaches the source', await ownerShapes() === 1 && writes.length === 0, writes.join(', '));
await shot(guestPage, '08-guest-draft-notice');
const guestCount = async () => (await canvases(owner)).find(c => c.name === guestSource.name)?.fork_count;
// Owner header brief, 2026-10-22 item 4: signed out, Fork is the sign-in step - no dialog first, no Sign in button.
await guestPage.locator('[data-fork-button]').click();
await guestPage.waitForURL(/\/login\?next=/, { timeout: 20000 });
const next = new URL(guestPage.url()).searchParams.get('next');
check('signed out, Fork goes straight through sign-in (no dialog) and back to this link', next === `/b/${guestShare.sharing.view}?fork=1` && await guestCount() === 0, next);
// Cancelling the sign-in: back on the link without ?fork, the shared canvas is usable, the draft is kept and nothing was forked.
await guestPage.goto(`${BASE}/b/${guestShare.sharing.view}`);
await guestPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
check('a cancelled sign-in keeps the temporary copy and its note, and forks nothing', await guestPage.locator('[data-guest-draft-notice]').count() === 1 && await guestPage.locator('[data-shape-id]').count() === 2 && await guestCount() === 0
  && await guestPage.getByRole('dialog').count() === 0);
// Back from sign-in in the same tab (the session set as the sign-in page would): the fork resumes with no second press.
await guestContext.addCookies([{ name: 'small_session', value: viewer.session, url: BASE }]);
await guestPage.goto(`${BASE}${next}`);
await guestPage.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 60000 });
const guestFork = new URL(guestPage.url()).pathname.split('/').pop();
const forkShapes = (await api(viewer, `/api/learn/boards/${guestFork}/main`)).state?.shapes || [];
check('the fork holds the visitor\'s edit beside the source content', forkShapes.length === 2 && forkShapes.some(shape => shape.id === 'seed-rect'), String(forkShapes.length));
check('one fork, one count, and the source unchanged', await guestCount() === 1 && await ownerShapes() === 1);
check('the kept copy is cleared once it is in the fork', await guestPage.evaluate(token => sessionStorage.getItem(`rh.guest-draft:${token}`), guestShare.sharing.view) === null);
await shot(guestPage, '09-guest-fork');
await guestContext.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
