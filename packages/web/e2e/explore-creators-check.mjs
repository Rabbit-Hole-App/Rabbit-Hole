// Explore > Creators as compact rows (owner brief 2026-10-23), against the LOCAL stack only: local D1 and fresh browser
// profiles. No model is called and nothing is sent from a composer. Prints no secrets. Every row is made through the routes
// (profiles, canvases, publications) except the public projects, seeded in local D1 as project-canvases-check.mjs does
// (importing needs the indexer). The stack is shared with other checks, so every Creators read searches this run's handles.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 PERSIST=<stack local dir> node e2e/explore-creators-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explore-creators-check runs against the local stack only');
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PERSIST = process.env.PERSIST || '.small/fork-local';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);

// Four people: a full profile (picture, name, description, one public project); a bare one (no picture, name or
// description); one with the longest name, handle and description the profile allows (two public projects); one who never
// published (never listed).
const H = { full: `ecf_${run}`, bare: `ecb_${run}`, long: `l${run}_`.padEnd(30, 'x'), none: `ecn_${run}` };
const EMAIL = Object.fromEntries(Object.keys(H).map(k => [k, `ec-${k}-${run}@example.com`]));
const NAME = { full: 'Mayank Rao', long: `Bartholomew Alexander Fitzgerald-Montgomery ${run}`.padEnd(60, 'x').slice(0, 60) };
const DESC = {
  full: 'Explains LLM inference one memory trip at a time.',
  long: `Writes about Pneumonoultramicroscopicsilicovolcanoconiosis and other very long words, tiling kernels, cache hierarchies and the arithmetic intensity of attention ${run}`.slice(0, 160),
};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const who = {};
for (const k of Object.keys(H)) who[k] = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL[k], secret, handle: H[k] }) })).json()).session;
const api = async (k, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(k ? { cookie: `small_session=${who[k]}` } : {}), 'content-type': 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (k, path, body = {}) => api(k, path, { method: 'POST', body: JSON.stringify(body) });

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

// ---- profiles, through Settings' own route ----
check('the profiles save: picture, name and description; none for the bare one', (await Promise.all([
  api('full', '/api/profile', { method: 'PUT', body: JSON.stringify({ name: NAME.full, avatar: PNG, description: DESC.full }) }),
  api('long', '/api/profile', { method: 'PUT', body: JSON.stringify({ name: NAME.long, description: DESC.long }) }),
  api('none', '/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Never Published' }) }),
])).every(r => r.status === 200));

// ---- public projects: seeded ready and confirmed public ----
const SHA = 'c'.repeat(40);
const org = {};
for (const k of ['full', 'long']) org[k] = (await api(k, '/api/apps')).body;
const STEM = `repo-${run.slice(-8).padStart(8, '0')}`;
const REPO = { full: `${STEM}-ecfull`, a: `${STEM}-eca`, b: `${STEM}-ecb` };
const seed = [['full', REPO.full], ['long', REPO.a], ['long', REPO.b]].map(([k, name]) => `INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('${org[k].org}','${name}','${org[k].email}','acme/${name}','main','${SHA}','ready'); INSERT INTO repository_visibility(app_id, visibility) SELECT id, 'public' FROM repository_apps WHERE name = '${name}';`).join(' ');
execFileSync(`npx wrangler d1 execute rabbit-hole-learn-dev --local --persist-to ${PERSIST} -c packages/web/wrangler.dev.jsonc --command "${seed}"`, { cwd: ROOT, shell: true, stdio: 'ignore' });

// ---- canvases: each public one is published through the API (a canvas added to a seeded project starts private: its
// project has no public canvas yet, repositories.js projectAccess). Private, unlisted and archived ones must never count. ----
const STATE = text => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.` }] });
const canvas = async (k, title, project) => {
  const c = (await post(k, '/api/canvases', { title, ...(project ? { project } : {}) })).body;
  await api(k, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(title) }) });
  return c;
};
const publish = async (k, c) => (await post(k, `/api/apps/${c.name}/publish`)).status;
await publish('full', await canvas('full', `Paged attention ${run}`, REPO.full));
await publish('full', await canvas('full', `KV cache ${run}`));
await publish('bare', await canvas('bare', `Gradient descent ${run}`));
await canvas('bare', `SECRET private ${run}`);
await publish('long', await canvas('long', `Tiling ${run}`, REPO.a));
await publish('long', await canvas('long', `Roofline ${run}`, REPO.b));
await publish('long', await canvas('long', `Flash attention ${run}`));
const unlisted = await canvas('long', `SECRET unlisted ${run}`);
await post('long', `/api/learn/boards/${unlisted.name}/main/share`, { shared: true, view: true, state: STATE('u') });
const archived = await canvas('long', `SECRET archived ${run}`);
await publish('long', archived);
await post('long', `/api/apps/${archived.name}/archive`);

const listed = (await api(null, `/api/learn/creators?q=${run}`)).body;
const counts = Object.fromEntries(listed.creators.map(c => [c.handle, [c.project_count, c.explainer_count]]));
check('signed out, the server counts public things only: 1 project and 2 canvases, 0 and 1, 2 and 3; the unpublished creator is not listed',
  JSON.stringify([counts[H.full], counts[H.bare], counts[H.long], counts[H.none]]) === JSON.stringify([[1, 2], [0, 1], [2, 3], undefined]) && listed.total === 3, JSON.stringify(listed.creators.map(c => [c.handle, c.project_count, c.explainer_count])));

const browser = await chromium.launch();
const errors = [];
const pageFor = async ({ k = null, width = 1440, dark = false } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
  if (k) await context.addCookies([{ name: 'small_session', value: who[k], url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const row = (page, h) => page.locator(`[data-explore-creators] [data-creator-card="${h}"]`);
const box = l => l.boundingBox();
// Search this run's creators and wait for the exact count line (or the empty state) the search produces.
const search = async (page, q, expected) => {
  await page.locator('[data-explore-search]').fill(q);
  if (expected) await page.locator('[data-creator-count]').filter({ hasText: new RegExp(`^${expected}$`) }).waitFor({ timeout: 20000 });
  else await page.locator('[data-search-empty]').filter({ hasText: q }).waitFor({ timeout: 20000 });
};
const meta = async (r) => Promise.all(['name', 'handle', 'description', 'counts'].map(async k => {
  const el = r.locator(`[data-creator-${k}]`);
  return (await el.count()) ? (await el.innerText()).trim() : null;
}));
// The page's own accent token, as a computed colour.
const accent = page => page.evaluate(() => { const p = Object.assign(document.createElement('span'), { style: 'color: var(--color-accent)' }); document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
  && [...document.querySelectorAll('[data-creator-card]')].every(r => r.scrollWidth <= r.clientWidth && r.getBoundingClientRect().right <= window.innerWidth));
const underline = page => page.locator('[data-explore-tabs] [role="tab"][data-state="active"]').evaluate(t => [getComputedStyle(t).borderBottomColor, getComputedStyle(t).borderBottomWidth]);

// ---- Explore, desktop, light: signed in as the person who never published (Explore needs sign-in) ----
const viewer = await pageFor({ k: 'none' });
await viewer.goto(`${BASE}/explore`);
await viewer.locator('[data-explore-tabs]').waitFor({ timeout: 60000 });
const tabs = (await viewer.locator('[data-explore-tabs] [role="tab"]').allInnerTexts()).map(t => t.trim());
check('the tabs are Canvases and Creators, Canvases active; the subtitle is the brief\'s', JSON.stringify(tabs) === '["Canvases","Creators"]'
  && (await viewer.locator('[data-explore-tabs] [role="tab"][data-state="active"]').innerText()).trim() === 'Canvases'
  && await viewer.getByText('Discover canvases and the people behind them.', { exact: true }).count() === 1, JSON.stringify(tabs));
check('no dot grid behind Explore: the plain page background', await viewer.locator('main[data-explore]').evaluate(m => getComputedStyle(m).backgroundImage) === 'none');
const blue = await accent(viewer);
check('the active tab has a blue underline', JSON.stringify(await underline(viewer)) === JSON.stringify([blue, '2px']), JSON.stringify([await underline(viewer), blue]));
await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
check('Search creators: a Search icon and a readable placeholder', await viewer.locator('[data-explore-search]').getAttribute('placeholder') === 'Search creators'
  && await viewer.locator('label:has([data-explore-search]) svg.lucide-search').count() === 1);
await search(viewer, run, '3 creators');
check('the search shows the matching creator count, plural', (await viewer.locator('[data-creator-count]').innerText()).trim() === '3 creators');
const [full, bare, long] = [row(viewer, H.full), row(viewer, H.bare), row(viewer, H.long)];
check('a full profile: name, @handle, description, 1 project and 2 canvases, and its picture',
  JSON.stringify(await meta(full)) === JSON.stringify([NAME.full, `@${H.full}`, DESC.full, '1 project · 2 canvases']) && await full.locator('img').count() === 1, JSON.stringify(await meta(full)));
check('a bare profile: no name or description line, the initial, and only the non-zero count, singular',
  JSON.stringify(await meta(bare)) === JSON.stringify([null, `@${H.bare}`, null, '1 canvas']) && await bare.locator('img').count() === 0
  && (await bare.locator('span[title]').first().innerText()).trim().toUpperCase() === H.bare[0].toUpperCase(), JSON.stringify(await meta(bare)));
check('private, unlisted and archived canvases never count: 2 projects and 3 canvases', (await meta(long))[3] === '2 projects · 3 canvases', (await meta(long))[3]);
check('the unpublished creator is not listed', await row(viewer, H.none).count() === 0);
const sizes64 = [await box(full.locator('img')), await box(bare.locator('span[title]').first())];
check('the avatar is 64px on desktop, picture or initial', sizes64.every(b => Math.round(b.width) === 64 && Math.round(b.height) === 64), JSON.stringify(sizes64));
const padding = await full.evaluate(r => { const s = getComputedStyle(r); return [s.paddingLeft, s.paddingTop]; });
const [img, text] = [await box(full.locator('img')), await box(full.locator('[data-creator-handle]'))];
const gap = Math.round(text.x - (img.x + img.width));
check('about 24px of row padding and 16-20px between the avatar and the text', JSON.stringify(padding) === '["24px","24px"]' && gap >= 16 && gap <= 20, JSON.stringify([padding, gap]));
const rowBoxes = await viewer.locator('[data-explore-creators] [data-creator-card]').evaluateAll(rs => rs.map(r => { const b = r.getBoundingClientRect(); return [b.top, b.bottom, b.left, b.width]; }));
const between = rowBoxes.slice(1).map((b, i) => Math.round(b[0] - rowBoxes[i][1]));
// Sized to their content: a row is far wider than tall (the old cards were squares).
check('rows one per line, 12-16px apart, sized to their content', rowBoxes.length === 3 && between.every(g => g >= 12 && g <= 16)
  && rowBoxes.every(b => Math.abs(b[2] - rowBoxes[0][2]) <= 1 && Math.abs(b[3] - rowBoxes[0][3]) <= 1 && b[1] - b[0] < b[3] / 3), JSON.stringify([between, rowBoxes]));
const view = full.locator('[data-creator-view]');
const [viewBox, descBox, fullBox] = [await box(view), await box(full.locator('[data-creator-description]')), await box(full)];
check('View profile: a labelled button with an ArrowRight icon, at the right, never over the text',
  (await view.innerText()).trim() === 'View profile' && await view.locator('svg.lucide-arrow-right').count() === 1
  && viewBox.x >= descBox.x + descBox.width && viewBox.x + viewBox.width > fullBox.x + fullBox.width - 40, JSON.stringify([viewBox, descBox]));
check('no chain-link, copy-link or overflow icon on a row', await viewer.locator('[data-creator-card] :is([data-copy-profile], svg.lucide-link, svg.lucide-link-2, svg.lucide-ellipsis, svg.lucide-more-horizontal, [title="Card options"])').count() === 0);
check('the row is not a link: two separate links, the @handle (blue) and View profile, both to /@handle', await full.evaluate((r, blueC) => {
  const links = [...r.querySelectorAll('a')], handle = r.querySelector('[data-creator-handle]');
  return !r.closest('a') && links.length === 2 && !links[0].contains(links[1]) && !links[1].contains(links[0])
    && links.every(a => a.getAttribute('href') === handle.getAttribute('href')) && getComputedStyle(handle).color === blueC;
}, blue) && await full.locator('[data-creator-handle]').getAttribute('href') === `/@${H.full}`);
const clampOk = (r, mustClamp = false) => r.locator('[data-creator-description]').evaluate((d, must) => {
  const s = getComputedStyle(d), lh = parseFloat(s.lineHeight);
  return s.webkitLineClamp === '2' && d.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) <= 2 * lh + 1 && (!must || d.scrollHeight > d.clientHeight + 1);
}, mustClamp);
check('a long name stays on one line and a long description within two lines, with no overflow', await clampOk(long)
  && await long.locator('[data-creator-name]').evaluate(n => getComputedStyle(n).textOverflow === 'ellipsis' && n.getBoundingClientRect().height <= parseFloat(getComputedStyle(n).lineHeight) + 1)
  && await noOverflow(viewer));
await shot(viewer, '01-creators-desktop-light');
// Keyboard: from the search field, Tab reaches the first row's @handle, then its View profile, each with a visible ring;
// Shift+Tab back from the field reaches the active tab, ringed too.
const ring = page => page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
const focused = page => page.evaluate(() => { const el = document.activeElement; return [...['data-creator-handle', 'data-creator-view'].filter(a => el.hasAttribute(a)), el.closest('[data-creator-card]')?.getAttribute('data-creator-card') ?? el.getAttribute('role')].join(' '); });
await viewer.locator('[data-explore-search]').focus();
await viewer.keyboard.press('Tab');
const first = await focused(viewer), firstRing = await ring(viewer);
await viewer.keyboard.press('Tab');
const second = await focused(viewer), secondRing = await ring(viewer);
check('keyboard: Tab reaches the @handle, then View profile of the same row, each with a visible focus ring',
  /^data-creator-handle \S+$/.test(first) && second === first.replace('data-creator-handle', 'data-creator-view') && firstRing && secondRing, `${first} | ${second}`);
await viewer.locator('[data-explore-search]').focus();
await viewer.keyboard.press('Shift+Tab');
check('keyboard: the active tab takes focus with a visible ring', await focused(viewer) === 'tab' && await ring(viewer));
// Explore itself needs sign-in (Shell loads /api/apps); the profile both links open does not. Each link's own href,
// opened signed out, is the public profile with the full description.
const hrefs = [await long.locator('[data-creator-handle]').getAttribute('href'), await long.locator('[data-creator-view]').getAttribute('href')];
const out = await pageFor();
const opened = [];
for (const href of hrefs) {
  await out.goto(`${BASE}${href}`);
  await out.locator('[data-creator-profile] [data-profile-description]').waitFor({ timeout: 30000 });
  opened.push([new URL(out.url()).pathname, (await out.locator('[data-creator-profile] [data-profile-description]').innerText()).trim() === DESC.long]);
}
await out.context().close();
check('signed out, the @handle and View profile links both open the same public profile, with the full description',
  JSON.stringify(opened) === JSON.stringify([[`/@${H.long}`, true], [`/@${H.long}`, true]]), JSON.stringify(opened));
// The links themselves: Enter on the focused View profile, and a click on an @handle.
await viewer.locator('[data-explore-search]').focus();
await viewer.keyboard.press('Tab');
await viewer.keyboard.press('Tab');
const target = second.split(' ')[1];
await viewer.keyboard.press('Enter');
await viewer.waitForURL(`${BASE}/@${target}`, { timeout: 30000 });
await viewer.locator('[data-creator-profile]').waitFor({ timeout: 30000 });
check('Enter on View profile opens the creator profile', new URL(viewer.url()).pathname === `/@${target}`);
await viewer.goto(`${BASE}/explore?tab=creators`);
await search(viewer, run, '3 creators');
await row(viewer, H.full).locator('[data-creator-handle]').click();
await viewer.waitForURL(`${BASE}/@${H.full}`, { timeout: 30000 });
await viewer.locator('[data-creator-profile]').waitFor({ timeout: 30000 });
check('a click on the @handle opens the creator profile', new URL(viewer.url()).pathname === `/@${H.full}`);
await viewer.goto(`${BASE}/explore?tab=creators`);
await search(viewer, H.bare, '1 creator');
check('one match: 1 creator, singular', (await viewer.locator('[data-creator-count]').innerText()).trim() === '1 creator' && await viewer.locator('[data-creator-card]').count() === 1);
await search(viewer, `zz${run}`, null);
check('no match: the empty state, no count and no rows', (await viewer.locator('[data-search-empty]').innerText()).trim() === `No creators match “zz${run}”.`
  && await viewer.locator('[data-creator-count], [data-creator-card]').count() === 0);
await shot(viewer, '02-creators-empty');
await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Canvases' }).click();
await viewer.locator('[data-explore-search]').fill('');
await viewer.locator('[data-explore-list] [data-explore-card]').first().waitFor({ timeout: 30000 });
check('the Canvases tab keeps its card grid and card size control', await viewer.locator('[data-explore-list] [data-explore-card]').count() > 0 && await viewer.locator('[data-card-size-slider]').count() === 1);
await viewer.context().close();

// ---- phone, 390 wide ----
const phone = await pageFor({ k: 'none', width: 390 });
await phone.goto(`${BASE}/explore?tab=creators`);
await phone.locator('[data-explore-search]').waitFor({ timeout: 60000 });
await search(phone, run, '3 creators');
const p = { full: row(phone, H.full), long: row(phone, H.long), bare: row(phone, H.bare) };
const sizes48 = [await box(p.full.locator('img')), await box(p.bare.locator('span[title]').first())];
check('phone: the avatar is 48px', sizes48.every(b => Math.round(b.width) === 48 && Math.round(b.height) === 48), JSON.stringify(sizes48));
const below = async r => { const [t, v] = [await box(r.locator('[data-creator-handle]')), await box(r.locator('[data-creator-view]'))]; return v.y >= t.y + t.height; };
check('phone: View profile sits below the content', await below(p.full) && await below(p.long) && await below(p.bare));
check('phone: the long description clamps to two lines and the long name truncates, with no sideways scroll', await clampOk(p.long, true)
  && await p.long.locator('[data-creator-name]').evaluate(n => n.scrollWidth > n.clientWidth) && await noOverflow(phone));
await shot(phone, '03-creators-phone');
await phone.context().close();

// ---- dark theme (the system preference; Appearance defaults to it) ----
const dark = await pageFor({ k: 'none', dark: true });
await dark.goto(`${BASE}/explore?tab=creators`);
await dark.locator('[data-explore-search]').waitFor({ timeout: 60000 });
await search(dark, run, '3 creators');
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const darkColors = await row(dark, H.full).evaluate(r => [getComputedStyle(r).backgroundColor, getComputedStyle(r.querySelector('[data-creator-name]')).color, getComputedStyle(r.querySelector('[data-creator-description]')).color]);
check('dark theme: a dark row with light text, from the theme tokens', await dark.evaluate(() => document.documentElement.classList.contains('dark'))
  && lum(darkColors[0]) < 0.3 && lum(darkColors[1]) > 0.6 && lum(darkColors[2]) > 0.45, JSON.stringify(darkColors));
const darkBlue = await accent(dark);
check('dark theme: no dot grid, the handle and the active tab underline in the theme\'s blue', await dark.locator('main[data-explore]').evaluate(m => getComputedStyle(m).backgroundImage) === 'none'
  && await row(dark, H.full).locator('[data-creator-handle]').evaluate(a => getComputedStyle(a).color) === darkBlue
  && (await underline(dark))[0] === darkBlue);
await shot(dark, '04-creators-dark');
await dark.context().close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const total = 32;
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
