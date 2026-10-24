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
const field = viewerPage.getByLabel('Handle', { exact: true });
const hint = viewerPage.locator('[data-handle-hint]');
const cont = viewerPage.getByRole('button', { name: /^(Continue|Saving)$/ });
const HELPER = '3–30 letters, numbers, or underscores.';
const helper = viewerPage.getByText(HELPER, { exact: true });
const contBox = page => page.getByRole('button', { name: /^(Continue|Saving)$/ }).boundingBox();
const flat = () => viewerPage.evaluate(() => { const m = document.querySelector('[data-handle-setup]'), cs = getComputedStyle(m); return { image: cs.backgroundImage, color: cs.backgroundColor, bodyColor: getComputedStyle(document.body).backgroundColor, overflow: document.documentElement.scrollWidth > innerWidth }; });
check('a signed-in person without a handle sees Choose your handle first, at the same URL', await setup.count() === 1 && new URL(viewerPage.url()).pathname === '/library' && await cont.isDisabled());
// Owner brief 2026-10-23 (polish the Choose your handle screen): the copy, one column, no dot grid, a labelled field.
check('empty: heading, supporting line, visible Handle label, helper and the quiet Settings note', await viewerPage.getByRole('heading', { name: 'Choose your handle', level: 1 }).count() === 1
  && await viewerPage.getByText('Your public name on Rabbit Hole.', { exact: true }).count() === 1 && await viewerPage.locator('label[for]', { hasText: 'Handle' }).isVisible()
  && await helper.isVisible() && await viewerPage.getByText('You can change this later in Settings.', { exact: true }).isVisible() && (await hint.innerText()).trim() === '' && await viewerPage.locator('[data-handle-brand]').innerText() === 'Rabbit Hole');
const empty = await contBox(viewerPage), column = await viewerPage.locator('[data-handle-setup] form').boundingBox(), box = await field.boundingBox();
check('one centred column of at most 400px; the field and Continue are 48px high; the field has its fixed @ and placeholder', column.width <= 400 && Math.abs(column.x + column.width / 2 - 720) <= 1 && Math.abs(box.height - 48) <= 1 && Math.abs(empty.height - 48) <= 1 && empty.width === column.width
  && await viewerPage.locator('[data-handle-prefix]').innerText() === '@' && await field.getAttribute('placeholder') === 'yourname' && await field.getAttribute('spellcheck') === 'false' && await field.getAttribute('autocapitalize') === 'none');
check('no dotted background on this screen: a solid page colour, no horizontal scroll', await (async () => { const f = await flat(); return f.image === 'none' && f.color === f.bodyColor && !f.overflow; })());
check('the field is focused with a visible focus ring, and described by its helper and feedback', await field.evaluate(n => { const cs = getComputedStyle(n); return document.activeElement === n && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2; })
  && (await field.getAttribute('aria-describedby')).split(' ').length === 2 && await field.getAttribute('aria-invalid') === null);
await shot(viewerPage, '01-setup-empty');
await field.fill('Admin');
check('a reserved word is refused before sending, in the feedback area under the helper; the helper stays', /reserved/.test(await hint.innerText()) && await cont.isDisabled() && await field.getAttribute('aria-invalid') === 'true' && await helper.isVisible()
  && await hint.getAttribute('role') === 'alert');
check('feedback appearing moves nothing: Continue keeps its place and size', JSON.stringify(await contBox(viewerPage)) === JSON.stringify(empty));
await shot(viewerPage, '02-setup-reserved');
await field.fill('a b');
check('a space is refused', /no spaces|letters, numbers/.test(await hint.innerText()) && await cont.isDisabled());
await field.fill('ab');
check("too short is refused with the shared rule's words", /3-30 characters/.test(await hint.innerText()) && await cont.isDisabled());
// A failed save and the taken case; submitting by keyboard.
await field.fill(H.taken.toUpperCase());
await field.press('Enter');
await viewerPage.locator('[data-handle-hint][role="alert"]').waitFor({ timeout: 15000 });
check('a taken handle in another case is refused by the server, and the step stays', (await hint.innerText()).includes(`@${H.taken} is taken`) && await setup.count() === 1);
check('after a failed save the entered value is kept, Continue works again, and nothing moved', await field.inputValue() === H.taken.toUpperCase() && await cont.isEnabled() && JSON.stringify(await contBox(viewerPage)) === JSON.stringify(empty));
await shot(viewerPage, '03-setup-taken');
// Never "@@handle" (owner review of Figma 189:222): a pasted leading @ leaves the field, whose fixed prefix is the one @.
const typed = H.viewer.replace('viewer', 'Viewer');
await field.fill(`@${typed}`);
const shown = `${await viewerPage.locator('[data-handle-prefix]').innerText()}${await field.inputValue()}`;
check('a pasted leading @ leaves the field: one visible @, the case kept as typed', await field.inputValue() === typed && shown === `@${typed}` && !shown.includes('@@'), shown);
await field.fill(`@@${typed}`);
check('even two pasted @ leave one visible @', await field.inputValue() === typed);
check('a valid format shows no error and no "Available" (the server decides); Continue is enabled; the helper stays', (await hint.innerText()).trim() === '' && await cont.isEnabled() && await field.getAttribute('aria-invalid') === null
  && await helper.isVisible() && !/available|you will be/i.test(await viewerPage.locator('[data-handle-setup]').innerText()));
await shot(viewerPage, '04-setup-valid');
// A network failure is a failed save too: the message shows, the value stays.
let puts = 0, mode = 'abort';
await viewerPage.route('**/api/profile', async route => {
  if (route.request().method() !== 'PUT') return route.continue();
  puts += 1;
  if (mode === 'abort') return route.abort('failed');
  await new Promise(resolve => setTimeout(resolve, 1500));
  return route.continue();
});
await cont.click();
await viewerPage.locator('[data-handle-hint][role="alert"]').waitFor({ timeout: 15000 });
check('a network error is shown and the value is kept', (await hint.innerText()).trim() !== '' && await field.inputValue() === typed && await cont.isEnabled() && await setup.count() === 1 && puts === 1);
await shot(viewerPage, '05-setup-network-error');
// Saving: the label, a disabled button of the same size, and one request however often Enter is pressed.
mode = 'slow';
await field.press('Enter');
await viewerPage.getByRole('button', { name: 'Saving', exact: true }).waitFor({ timeout: 5000 });
await field.press('Enter');
await field.press('Enter');
check('while saving the button reads Saving, is disabled, keeps its size, and the extra Enter sends nothing', await cont.isDisabled() && JSON.stringify(await contBox(viewerPage)) === JSON.stringify(empty) && puts === 2 && (await hint.innerText()).trim() === '');
await shot(viewerPage, '06-setup-saving');
await setup.waitFor({ state: 'detached', timeout: 30000 });
await viewerPage.unroute('**/api/profile');
await viewerPage.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
check('claimed, the page it was asked for renders at the same URL', await setup.count() === 0 && new URL(viewerPage.url()).pathname === '/library' && puts === 2);
check('no background change elsewhere: the Library keeps its dot grid', await viewerPage.evaluate(() => getComputedStyle(document.querySelector('main')).backgroundImage.includes('radial-gradient')));
check('the handle is stored lowercase on the server', (await api(people.viewer, '/api/profile')).handle === H.viewer);

// ---- the owner shares a canvas; the shared header names them by @handle, never by email ----
const TITLE = `Transformers (handle check ${run})`;
const SEED = { strokes: [], links: [], items: [], blocks: [], shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false, text: 'Attention' }] };
const source = await api(people.owner, '/api/canvases', { method: 'POST', body: JSON.stringify({ title: TITLE }) });
const shared = await api(people.owner, `/api/learn/boards/${source.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, state: SEED }) });
const link = `${BASE}/b/${shared.sharing.view}`;
await viewerPage.goto(link);
await viewerPage.locator('[data-shape-id="seed-rect"]').waitFor({ timeout: 60000 });
// Owner decision 2026-10-23: the @handle alone, immediately left of Fork (was under the title, before that "by @handle"), linking to the public profile; no account circle or Comments icon in the header.
const handleBeside = async () => { const [c, f] = await Promise.all(['[data-shared-creator]', '[data-canvas-header] [data-fork-button]'].map(s => viewerPage.locator(s).evaluate(n => { const r = n.getBoundingClientRect(); return { right: r.right, left: r.left, mid: r.top + r.height / 2 }; }))); return c.right <= f.left && Math.abs(c.mid - f.mid) <= 1 && Math.abs(f.left - c.right - 8) <= 1.5; };
check('the shared header names the creator by @handle, beside Fork', (await viewerPage.locator('[data-shared-creator]').innerText()).trim() === `@${H.owner}` && await handleBeside()
  && await viewerPage.locator('[data-shared-creator] [data-creator-link]').getAttribute('href') === `/@${H.owner}`
  && await viewerPage.locator('[data-canvas-header] [data-viewer-account], [data-canvas-header] [data-comments-header]').count() === 0);
check('no email anywhere on the shared page', await noEmail(viewerPage));
await shot(viewerPage, '05-shared-header-handle');
await api(people.owner, '/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Ada Owner' }) });
await viewerPage.reload();
await viewerPage.locator('[data-shared-creator]').waitFor({ timeout: 60000 });
check('with a display name the line stays "@handle"; the name is on hover (owner brief 2026-10-23)', (await viewerPage.locator('[data-shared-creator]').innerText()).trim() === `@${H.owner}`
  && await viewerPage.locator('[data-shared-creator] [data-creator-link]').getAttribute('title') === `Ada Owner · @${H.owner}`);
await shot(viewerPage, '06-shared-header-name-handle');

// ---- a deep link resumes through the step: share -> choose handle -> the fork it asked for ----
const newbiePage = await pageFor(people.newbie);
await newbiePage.goto(`${link}?fork=1`);
await newbiePage.locator('[data-handle-setup]').waitFor({ timeout: 60000 });
const before = (await api(people.owner, '/api/canvases')).canvases.find(c => c.name === source.name)?.fork_count;
check('a deep link with ?fork=1 meets the step first, and nothing forks yet', before === 0 && newbiePage.url().endsWith('?fork=1'));
await shot(newbiePage, '07-deeplink-setup');
// Dark and narrow: theme-aware error colour, solid dark page, 24px gutters, no sideways scroll, Continue reachable on a short screen.
await newbiePage.evaluate(() => document.documentElement.classList.add('dark'));
await newbiePage.setViewportSize({ width: 375, height: 640 });
await newbiePage.getByLabel('Handle', { exact: true }).fill('Admin');
const narrow = await newbiePage.evaluate(() => { const m = document.querySelector('[data-handle-setup]'), f = m.querySelector('form').getBoundingClientRect(), cs = getComputedStyle(m);
  return { image: cs.backgroundImage, color: cs.backgroundColor, left: f.left, width: f.width, overflow: document.documentElement.scrollWidth > innerWidth, error: getComputedStyle(document.querySelector('[data-handle-hint]')).color }; });
check('dark and 375px wide: solid dark page, 24px gutters, no sideways scroll, a readable error colour', narrow.image === 'none' && narrow.color === 'rgb(25, 25, 25)' && narrow.left === 24 && narrow.width === 327 && !narrow.overflow && narrow.error === 'rgb(255, 100, 103)', JSON.stringify(narrow));
await shot(newbiePage, '07b-setup-dark-mobile-error');
await newbiePage.setViewportSize({ width: 375, height: 360 });
await newbiePage.getByRole('button', { name: 'Continue' }).scrollIntoViewIfNeeded();
check('on a short screen the page scrolls so the field and Continue stay reachable', await newbiePage.evaluate(() => { const b = [...document.querySelectorAll('button')].find(n => n.textContent === 'Continue').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }));
await newbiePage.evaluate(() => document.documentElement.classList.remove('dark'));
await newbiePage.setViewportSize({ width: 1440, height: 900 });
await newbiePage.getByRole('textbox', { name: 'Handle' }).fill(H.newbie);
await newbiePage.getByRole('button', { name: 'Continue' }).click();
// Owner header brief, 2026-10-22: back from sign-in the fork resumes at once - no dialog, no second press.
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
