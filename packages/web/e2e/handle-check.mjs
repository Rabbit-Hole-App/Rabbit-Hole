// Public @handles (docs/features/user-handles.md) end to end, against the LOCAL stack only - local D1 and fresh browser
// profiles; never a deployed worker. No model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/handle-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('handle-check runs against the local stack only');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
// handle: undefined = a random test handle, a string = that one, null = none (the setup step).
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, secret, ...(handle !== undefined ? { handle } : {}) }) })).json()).session;
const run = Date.now().toString(36);
const EMAIL = { owner: `handle-owner-${run}@example.com`, viewer: `handle-viewer-${run}@example.org`, newbie: `handle-new-${run}@example.net`, taker: `handle-taker-${run}@example.com` };
const H = { owner: `own_${run}`, taken: `taken_${run}`, viewer: `viewer_${run}`, newbie: `new_${run}`, renamed: `renamed_${run}` };
const people = {
  owner: { session: await sessionFor(EMAIL.owner, H.owner) },
  taker: { session: await sessionFor(EMAIL.taker, H.taken) },
  viewer: { session: await sessionFor(EMAIL.viewer, null) },
  newbie: { session: await sessionFor(EMAIL.newbie, null) },
};
const api = (who, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then(r => r.json());

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const pageFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
// Nobody else's email on the page (a person's own account menu may show their own, privately).
const noEmail = async (page, own = null) => { const html = await page.content(); return Object.values(EMAIL).filter(email => email !== own).every(email => !html.includes(email)); };

// ---- an existing person without a handle: the step comes first, in place ----
const viewerPage = await pageFor(people.viewer);
await viewerPage.goto(`${BASE}/library?type=canvases`);
const setup = viewerPage.locator('[data-handle-setup]');
await setup.waitFor({ timeout: 60000 });
const field = viewerPage.getByRole('textbox', { name: 'Handle' });
const hint = viewerPage.locator('[data-handle-hint]');
const cont = viewerPage.getByRole('button', { name: 'Continue' });
check('a signed-in person without a handle sees Choose your handle first, at the same URL', await setup.count() === 1 && new URL(viewerPage.url()).pathname === '/library' && await cont.isDisabled());
await shot(viewerPage, '01-setup-empty');
await field.fill('Admin');
check('a reserved word is refused before sending', /reserved/.test(await hint.innerText()) && await cont.isDisabled());
await shot(viewerPage, '02-setup-reserved');
await field.fill('a b');
check('a space is refused', /no spaces|letters, numbers/.test(await hint.innerText()) && await cont.isDisabled());
await field.fill(H.taken.toUpperCase());
await cont.click();
await viewerPage.locator('[data-handle-hint][role="alert"]').waitFor({ timeout: 15000 });
check('a taken handle in another case is refused by the server, and the step stays', (await hint.innerText()).includes(`@${H.taken} is taken`) && await setup.count() === 1);
await shot(viewerPage, '03-setup-taken');
// Never "@@handle" (owner review of Figma 189:222): a pasted leading @ leaves the field, whose fixed prefix is the one @.
const typed = H.viewer.replace('viewer', 'Viewer');
await field.fill(`@${typed}`);
const shown = `${await viewerPage.locator('[data-handle-setup] label span').first().innerText()}${await field.inputValue()}`;
check('a pasted leading @ leaves the field: one visible @, the case kept as typed', await field.inputValue() === typed && shown === `@${typed}` && !shown.includes('@@'), shown);
await field.fill(`@@${typed}`);
check('even two pasted @ leave one visible @', await field.inputValue() === typed);
check('a valid handle reads back in its canonical form', (await hint.innerText()).includes(`You will be @${H.viewer}`));
await shot(viewerPage, '04-setup-valid');
await cont.click();
await setup.waitFor({ state: 'detached', timeout: 30000 });
await viewerPage.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
check('claimed, the page it was asked for renders at the same URL', await setup.count() === 0 && new URL(viewerPage.url()).pathname === '/library');
check('the handle is stored lowercase on the server', (await api(people.viewer, '/api/profile')).handle === H.viewer);

// ---- the owner shares a canvas; the shared header names them by @handle, never by email ----
const TITLE = `Transformers (handle check ${run})`;
const SEED = { strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false, text: 'Attention' }] };
const source = await api(people.owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) });
const shared = await api(people.owner, `/api/learn/boards/${source.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: SEED }) });
const link = `${BASE}/b/${shared.sharing.view}`;
await viewerPage.goto(link);
await viewerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
check('the shared header names the creator by @handle', (await viewerPage.locator('[data-shared-creator]').innerText()).trim() === `Shared by @${H.owner}`);
check('no email anywhere on the shared page', await noEmail(viewerPage));
await shot(viewerPage, '05-shared-header-handle');
await api(people.owner, '/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Ada Owner' }) });
await viewerPage.reload();
await viewerPage.locator('[data-shared-creator]').waitFor({ timeout: 60000 });
check('with a display name: Display Name · @handle', (await viewerPage.locator('[data-shared-creator]').innerText()).trim() === `Shared by Ada Owner · @${H.owner}`);
await shot(viewerPage, '06-shared-header-name-handle');

// ---- a deep link resumes through the step: share -> choose handle -> the fork it asked for ----
const newbiePage = await pageFor(people.newbie);
await newbiePage.goto(`${link}?fork=1`);
await newbiePage.locator('[data-handle-setup]').waitFor({ timeout: 60000 });
const before = (await api(people.owner, '/api/canvases')).canvases.find(c => c.name === source.name)?.fork_count;
check('a deep link with ?fork=1 meets the step first, and nothing forks yet', before === 0 && newbiePage.url().endsWith('?fork=1'));
await shot(newbiePage, '07-deeplink-setup');
await newbiePage.getByRole('textbox', { name: 'Handle' }).fill(H.newbie);
await newbiePage.getByRole('button', { name: 'Continue' }).click();
// The resumed fork asks first, as every Fork does (owner, 2026-10-08): "Fork this canvas", then Fork.
const resumed = newbiePage.getByRole('dialog', { name: 'Fork this canvas' });
await resumed.waitFor({ timeout: 30000 });
check('claimed, the page reopens the Fork dialog it was asked for, and nothing forks before Fork', (await api(people.owner, '/api/canvases')).canvases.find(c => c.name === source.name)?.fork_count === 0);
await resumed.getByRole('button', { name: 'Fork', exact: true }).click();
await newbiePage.waitForURL(/\/apps\/canvas-[a-f0-9]{8}\?tab=learn$/, { timeout: 60000 });
const forkName = new URL(newbiePage.url()).pathname.split('/').pop();
check('claimed, the page resumes the fork it was asked for', (await api(people.newbie, '/api/canvases')).canvases.some(c => c.name === forkName && c.owner_email === EMAIL.newbie)
  && (await api(people.owner, '/api/canvases')).canvases.find(c => c.name === source.name)?.fork_count === 1);

// ---- cards: the fork is the forker's, and credits the original owner's handle ----
const cardOf = (page, title) => page.locator('[data-library-card="canvas"]').filter({ has: page.locator('[data-card-title]', { hasText: title }) });
await newbiePage.goto(`${BASE}/library?type=canvases`);
await cardOf(newbiePage, TITLE).first().waitFor({ timeout: 30000 });
const forkCard = cardOf(newbiePage, TITLE).first();
check('the fork card names its owner, the forker, by @handle', (await forkCard.locator('[data-creator]').innerText()).trim() === `@${H.newbie}`);
check('its provenance credits the original owner: Forked from … · @owner', (await forkCard.locator('[data-forked-from]').innerText()).includes(`· @${H.owner}`));
check('no other person\'s email on the Library page', await noEmail(newbiePage, EMAIL.newbie));
await shot(newbiePage, '08-fork-card-provenance');
const ownerPage = await pageFor(people.owner);
await ownerPage.goto(`${BASE}/library?type=canvases`);
await cardOf(ownerPage, TITLE).first().waitFor({ timeout: 30000 });
check('the owner\'s own card shows Display Name · @handle', (await cardOf(ownerPage, TITLE).first().locator('[data-creator]').innerText()).trim() === `Ada Owner · @${H.owner}`);
await shot(ownerPage, '09-owner-card');

// ---- a changed handle shows everywhere at once ----
const renamed = await api(people.owner, '/api/profile', { method: 'PUT', body: JSON.stringify({ handle: H.renamed }) });
check('the owner changes their handle', renamed.handle === H.renamed);
await viewerPage.reload();
await viewerPage.locator('[data-shared-creator]').waitFor({ timeout: 60000 });
await newbiePage.reload();
await cardOf(newbiePage, TITLE).first().waitFor({ timeout: 30000 });
check('the shared header and the fork provenance both show the new handle', (await viewerPage.locator('[data-shared-creator]').innerText()).includes(`@${H.renamed}`)
  && (await cardOf(newbiePage, TITLE).first().locator('[data-forked-from]').innerText()).includes(`· @${H.renamed}`));
check('and the old one is free for someone else', (await api(people.taker, '/api/profile', { method: 'PUT', body: JSON.stringify({ handle: H.owner }) })).handle === H.owner);

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
