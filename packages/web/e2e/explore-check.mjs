// Explore publishing end to end (docs/features/explore-publish.md), against the LOCAL stack only - local D1 and fresh
// browser profiles; never a deployed worker. No model calls; prints no secrets. The visibility matrix: PRIVATE (the
// default), UNLISTED (a share link), PUBLIC (Publish to Explore, opened at /e/<token> by anyone, read-only).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explore-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

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
check('Explore opens on the Explainers tab, with Sort, searching explainers only', (await viewer.page.locator('[data-explore-tabs] [role="tab"][data-state="active"]').innerText()) === 'Explainers'
  && await viewer.page.locator('[data-sort-control]').count() === 1 && (await viewer.page.locator('[data-explore-search]').getAttribute('placeholder')) === 'Search explainers'
  && await viewer.page.locator('[data-creator-chip]').count() === 0);
check('the Explore card shows the creator\'s @handle and the fork count, no email', (await card.locator('[data-creator]').innerText()).trim() === `@${H.owner}` && await noEmail(viewer.page, EMAIL.viewer));
await shot(viewer.page, '04-explore');
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
const creatorCard = people.page.locator(`[data-explore-creators] [data-creator-card="${H.other}"]`);
await creatorCard.waitFor({ timeout: 30000 });
const square = async () => { const b = await creatorCard.boundingBox(); return Math.abs(b.width - b.height) <= 1; };
const about = creatorCard.locator('[data-creator-description]');
const counts = (await creatorCard.locator('[data-creator-counts]').innerText()).trim();
check('a creator card is square, shows the description as text (never HTML) and N projects · M canvases of published canvases only',
  await square() && (await about.innerText()).trim() === ABOUT && await about.locator('*').count() === 0 && counts === '0 projects · 1 canvas', counts);
await shot(people.page, '09-creator-card', creatorCard);
await people.page.setViewportSize({ width: 390, height: 844 });
await people.page.waitForTimeout(400);
const tops = await people.page.locator('[data-explore-creators] [data-creator-card]').evaluateAll(cards => cards.slice(0, 2).map(c => Math.round(c.getBoundingClientRect().top)));
check('on a phone the creator cards stay square, two to a row, with no sideways scroll', await square() && tops.length === 2 && tops[0] === tops[1]
  && await people.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), JSON.stringify(tops));
await shot(people.page, '10-creator-cards-phone');
await people.context.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
