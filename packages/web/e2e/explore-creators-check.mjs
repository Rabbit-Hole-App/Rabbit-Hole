// Explore > Creators as compact rows (owner brief 2026-10-23; the 760px column and the larger pictures, owner brief 2026-10-23 creators-ui), against the LOCAL stack only: local D1 and fresh browser
// profiles. No model is called and nothing is sent from a composer. Prints no secrets. Every row is made through the routes
// (profiles, canvases, publications) except the public projects, seeded in local D1 as project-canvases-check.mjs does
// (importing needs the indexer). The stack is shared with other checks, so every Creators read searches this run's handles.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 PERSIST=<stack local dir> node e2e/explore-creators-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { weeklyTopEmptyFixture, weeklyTopErrorFixture, weeklyTopFixture } from '../src/home/weekly-top-fixture.js';

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
const paged = await canvas('full', `Paged attention ${run}`, REPO.full);
await publish('full', paged);
await publish('full', await canvas('full', `KV cache ${run}`));
const gradient = await canvas('bare', `Gradient descent ${run}`);
await publish('bare', gradient);
await canvas('bare', `SECRET private ${run}`);
await publish('long', await canvas('long', `Tiling ${run}`, REPO.a));
await publish('long', await canvas('long', `Roofline ${run}`, REPO.b));
await publish('long', await canvas('long', `Flash attention ${run}`));
const unlisted = await canvas('long', `SECRET unlisted ${run}`);
await post('long', `/api/learn/boards/${unlisted.name}/main/share`, { shared: true, view: true, state: STATE('u') });
const archived = await canvas('long', `SECRET archived ${run}`);
const archivedToken = (await post('long', `/api/apps/${archived.name}/publish`)).body.publication_token;
// Weekly Top 5 against the REAL endpoint (docs/features/explore-weekly-top.md): stars and forks are made through the routes by six fans, so the
// ranking is read from the server's own records. The fans star the canvas that is archived next, so it must not appear in the answer.
const fans = [];
for (let i = 0; i < 6; i++) fans.push((await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `ec-fan${i}-${run}@example.com`, secret }) })).json()).session);
const asFan = (i, path, init = {}) => fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${fans[i]}`, 'content-type': 'application/json' } });
const tokenOf = async (k, c) => (await post(k, `/api/apps/${c.name}/publish`)).body.publication_token;
const pagedToken = await tokenOf('full', paged), gradientToken = await tokenOf('bare', gradient);
const fanStars = [];
for (let i = 0; i < 6; i++) fanStars.push((await asFan(i, `/api/learn/boards/shared/${pagedToken}/star`, { method: 'PUT' })).status);
for (let i = 0; i < 3; i++) fanStars.push((await asFan(i, `/api/learn/boards/shared/${gradientToken}/star`, { method: 'PUT' })).status, (await asFan(i, `/api/learn/boards/shared/${archivedToken}/star`, { method: 'PUT' })).status);
const fanForks = [];
for (let i = 0; i < 2; i++) for (const key of ['a', 'b']) fanForks.push((await asFan(i, '/api/learn/boards/fork', { method: 'POST', body: JSON.stringify({ source: { token: gradientToken }, key: `ecw-${i}-${key}-${run}` }) })).status);
await api('full', `/api/apps/${paged.name}/star`, { method: 'PUT' });
await post('long', `/api/apps/${archived.name}/archive`);

// The server may answer from a 60 second memory (explore-weekly-top.md), and another check on this stack may have filled it just before the
// fans above were made: ask again until this run's six stars show, for at most 75 seconds.
let weeklyRes, weekly;
for (let tries = 0; tries < 16; tries++) {
  weeklyRes = await fetch(`${BASE}/api/learn/boards/published/weekly-top`);
  weekly = await weeklyRes.json();
  if (weekly.canvases?.entries?.some(e => e.title === `Paged attention ${run}` && e.weekly_star_count === 6)) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
const entryOf = title => weekly.canvases.entries.find(e => e.title === title);
check('weekly endpoint (real): six fans seeded through the star and fork routes; 200, no-store, one answer for both tabs',
  fanStars.every(x => x === 200) && fanForks.every(x => x === 200) && weeklyRes.status === 200 && weeklyRes.headers.get('cache-control') === 'no-store' && weekly.ranking_version === 'weekly-top-v1' && weekly.timezone === 'America/Los_Angeles'
  && Array.isArray(weekly.canvases.entries) && Array.isArray(weekly.creators.entries) && weekly.canvases.entries.length <= 5 && weekly.creators.entries.length <= 5, JSON.stringify([fanStars, fanForks, weeklyRes.status]));
check('weekly endpoint (real): six distinct fans make 6 weekly stars, the owner own star adds none; repeated forks by one fan count once (2 forks from 2 fans); stars rank first, then forks',
  entryOf(`Paged attention ${run}`)?.weekly_star_count === 6 && entryOf(`Paged attention ${run}`)?.weekly_fork_count === 0 && entryOf(`Gradient descent ${run}`)?.weekly_star_count === 3 && entryOf(`Gradient descent ${run}`)?.weekly_fork_count === 2
  && weekly.canvases.entries.findIndex(e => e.title === `Paged attention ${run}`) < weekly.canvases.entries.findIndex(e => e.title === `Gradient descent ${run}`), JSON.stringify(weekly.canvases.entries.map(e => [e.rank, e.title, e.weekly_star_count, e.weekly_fork_count])));
check('weekly endpoint (real): creators count distinct supporters (6 for the full profile, 3 starred and 2 forked for the bare one); an archived canvas, its title and its creator share are absent; no private data',
  weekly.creators.entries.find(e => e.handle === H.full)?.weekly_star_supporter_count === 6 && weekly.creators.entries.find(e => e.handle === H.bare)?.weekly_star_supporter_count === 3 && weekly.creators.entries.find(e => e.handle === H.bare)?.weekly_fork_supporter_count === 2
  && !weekly.creators.entries.some(e => e.handle === H.long) && !/SECRET|@example\.com|ec-fan/.test(JSON.stringify(weekly)) && !entryOf(`Flash attention ${run}`), JSON.stringify(weekly.creators.entries.map(e => [e.rank, e.handle, e.weekly_star_supporter_count, e.weekly_fork_supporter_count])));

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
  // Weekly Top 5 is answered from the committed contract fixture (docs/features/explore-weekly-top.md), so the rows and states are exact
  // whatever the local stack holds; the real endpoint's ranking is the backend lane's tests. page.weeklyMode: full, empty or error.
  page.weeklyRequests = 0;
  page.weeklyMode = 'full';
  await page.route('**/api/learn/boards/published/weekly-top', route => {
    page.weeklyRequests += 1;
    if (page.weeklyMode === 'live') return route.continue();
    const [status, body] = page.weeklyMode === 'error' ? [500, weeklyTopErrorFixture] : [200, page.weeklyMode === 'empty' ? weeklyTopEmptyFixture : weeklyTopFixture];
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Telemetry seam: the section's events, collected in the page (home/weekly-top.js sendWeeklyEvent).
  await page.addInitScript(() => { window.__weekly = []; window.addEventListener('weekly-top:event', e => window.__weekly.push(e.detail)); });
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
check('the dot grid behind Explore, like Home and Library (owner 2026-10-23)', /radial-gradient/.test(await viewer.locator('main[data-explore]').evaluate(m => getComputedStyle(m).backgroundImage)));
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
const sizes96 = [await box(full.locator('img')), await box(bare.locator('span[title]').first())];
check('the avatar is 96px on desktop, picture or initial: the same box, the same offset in the row, no layout shift', sizes96.every(b => Math.round(b.width) === 96 && Math.round(b.height) === 96) && Math.round(sizes96[0].x - (await box(full)).x) === Math.round(sizes96[1].x - (await box(bare)).x), JSON.stringify(sizes96));
check('the avatar is a circle, a picture crops rather than stretches, and it never shrinks', await full.locator('img').evaluate(i => getComputedStyle(i).borderTopLeftRadius !== '0px' && getComputedStyle(i).objectFit === 'cover' && getComputedStyle(i).flexShrink === '0'));
const padding = await full.evaluate(r => { const s = getComputedStyle(r); return [s.paddingLeft, s.paddingTop]; });
const [img, text] = [await box(full.locator('img')), await box(full.locator('[data-creator-handle]'))];
const gap = Math.round(text.x - (img.x + img.width));
check('24px of row padding and 20-24px between the avatar and the text', JSON.stringify(padding) === '["24px","24px"]' && gap >= 20 && gap <= 24, JSON.stringify([padding, gap]));
// One column (owner brief 2026-10-23, creators-ui): the heading, the tabs, the search, the count and the rows share a left edge; the
// search and the rows share a right edge, at most 760px wide, narrower than the 958px content area at 1440.
const column = await viewer.evaluate(() => {
  const r = el => el.getBoundingClientRect(), h1 = r(document.querySelector('main[data-explore] h1')), tabs = r(document.querySelector('[data-explore-tabs]'));
  const field = r(document.querySelector('[data-explore-search]').closest('div')), count = r(document.querySelector('[data-creator-count]'));
  const rows = [...document.querySelectorAll('[data-explore-creators] [data-creator-card]')].map(r);
  return { h1: h1.left, tabs: tabs.left, tabsWidth: tabs.width, field: [field.left, field.right, field.width], count: count.left, rows: rows.map(b => [b.left, b.right, b.width]) };
});
check('Creators: the search, the count and every row share one 760px column, aligned with the heading and the tabs; the tabs strip stays full width',
  Math.abs(column.field[0] - column.h1) <= 1 && Math.abs(column.count - column.h1) <= 1 && Math.abs(column.tabs - column.h1) <= 1 && column.tabsWidth > 900
  && column.field[2] <= 760.5 && column.field[2] >= 758 && column.rows.every(b => Math.abs(b[0] - column.h1) <= 1 && Math.abs(b[1] - column.field[1]) <= 1 && b[2] <= 760.5), JSON.stringify(column));
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
// Recommended creators (the AI find is stubbed at the route: no model is called) are the same rows in the same column.
await viewer.route('**/api/learn/boards/published/find', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canvases: [], creators: listed.creators.filter(c => c.handle === H.full) }) }));
await viewer.locator('[data-explore-search]').fill(`${run} best creators for kernels`);
await viewer.locator('[data-explore-recommended="creators"] [data-creator-card]').waitFor({ timeout: 20000 });
check('Recommended creators: the same row at the same 760px column as the search results', await viewer.evaluate(() => {
  const f = document.querySelector('[data-explore-search]').closest('div').getBoundingClientRect(), r = document.querySelector('[data-explore-recommended="creators"] [data-creator-card]').getBoundingClientRect(), a = document.querySelector('[data-explore-recommended="creators"] [data-creator-card] img').getBoundingClientRect();
  return Math.abs(r.left - f.left) <= 1 && Math.abs(r.right - f.right) <= 1 && r.width <= 760.5 && Math.round(a.width) === 96;
}));
await viewer.unroute('**/api/learn/boards/published/find');
await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Canvases' }).click();
await viewer.locator('[data-explore-search]').fill('');
await viewer.locator('[data-explore-list] [data-explore-card]').first().waitFor({ timeout: 30000 });
check('the Canvases tab keeps its card grid and card size control', await viewer.locator('[data-explore-list] [data-explore-card]').count() > 0 && await viewer.locator('[data-card-size-slider]').count() === 1);
check('the Canvases tab is not narrowed: its toolbar is wider than the 760px Creators column', await viewer.locator('[data-explore-search]').evaluate(i => i.closest('div').getBoundingClientRect().width > 900));
// Weekly Top 5 brief §3 (owner, 2026-10-23): Search, Filters, Sort and Size are adjacent on one row, the search is about 280px
// (360px at most), the gaps are 10-12px and every control is about 36px tall with its centre on the row's.
const bar = await viewer.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { x: b.left, right: b.right, width: b.width, height: b.height, cy: b.top + b.height / 2 }; };
  const toolbar = document.querySelector('[data-explore-toolbar]');
  return { toolbar: r(toolbar), search: r(document.querySelector('[data-explore-search]')), filters: r([...toolbar.querySelectorAll('button')].find(b => /^Filters/.test(b.textContent.trim()))),
    sort: r(toolbar.querySelector('[data-sort-control]')), size: r(toolbar.querySelector('[data-card-size-control]')), justify: getComputedStyle(toolbar).justifyContent, wrap: getComputedStyle(toolbar).flexWrap };
});
const barParts = [bar.search, bar.filters, bar.sort, bar.size];
check('Canvases toolbar: Search, Filters, Sort, Size in that order on one row, no wrap, not spread (no justify-between)',
  barParts.every((b, i) => i === 0 || b.x >= barParts[i - 1].right) && barParts.every(b => Math.abs(b.cy - bar.search.cy) <= 1.5) && bar.wrap === 'nowrap' && !/between|around|evenly/.test(bar.justify), JSON.stringify(bar));
check('Canvases toolbar: the search is about 280px (at most 360px), the gaps 10-12px, every control about 36px tall',
  bar.search.width >= 279 && bar.search.width <= 360.5 && barParts.every((b, i) => i === 0 || (b.x - barParts[i - 1].right >= 9.5 && b.x - barParts[i - 1].right <= 12.5))
  && barParts.every(b => Math.abs(b.height - 36) <= 1), JSON.stringify(bar));
const weeklySection = page => page.locator('[data-weekly-top]');
const weeklyRows = page => page.locator('[data-weekly-top] [data-weekly-row]');
const events = (page, name) => page.evaluate(n => window.__weekly.filter(e => e.name === n), name);
{
// ---- Weekly Top 5 (owner brief 2026-10-23 sections 3-6, 9) against the contract fixture ----
await weeklySection(viewer).waitFor({ timeout: 30000 });
const requestsAtStart = viewer.weeklyRequests; // this page may have loaded Explore before this section; the claim is that nothing below asks again
check('Canvases: "Top canvases this week", five rows ranked 1 to 5 in the fixture order, after the toolbar and before the results',
  (await weeklySection(viewer).locator('h2').innerText()).trim() === 'Top canvases this week' && await weeklySection(viewer).getAttribute('data-weekly-top') === 'canvases'
  && JSON.stringify(await weeklyRows(viewer).evaluateAll(rs => rs.map(r => r.dataset.weeklyRow))) === '["1","2","3","4","5"]'
  && JSON.stringify(await weeklyRows(viewer).locator('[data-weekly-title]').allInnerTexts()) === JSON.stringify(weeklyTopFixture.canvases.entries.map(e => e.title))
  && await viewer.evaluate(() => { const s = document.querySelector('[data-weekly-top]'); return !!(document.querySelector('[data-explore-toolbar]').compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(s.compareDocumentPosition(document.querySelector('[data-explore-list]')) & Node.DOCUMENT_POSITION_FOLLOWING); }));
const gaps = await viewer.evaluate(() => {
  const r = el => el.getBoundingClientRect(), s = r(document.querySelector('[data-weekly-top]')), search = r(document.querySelector('[data-explore-search]')), list = r(document.querySelector('[data-explore-list]'));
  return { above: s.top - search.bottom, below: list.top - r(document.querySelector('[data-weekly-list]')).bottom, width: r(document.querySelector('[data-weekly-list]')).width, search: search.width };
});
check('spacing: about 24px between the toolbar and the section, 24-28px between the section and the regular results; the list is at most 760px, the search far narrower',
  gaps.above >= 23 && gaps.above <= 25 && gaps.below >= 23.5 && gaps.below <= 28.5 && gaps.width <= 760.5 && gaps.width >= 600 && gaps.search < gaps.width / 2, JSON.stringify(gaps));
check('no Top 5 collapse: no button, toggle, chevron or details in the section; every row is visible', await weeklySection(viewer).evaluate(s => !s.querySelector('button, details, summary, [aria-expanded], [aria-controls]')) && await weeklyRows(viewer).evaluateAll(rs => rs.every(r => r.getBoundingClientRect().height > 0)));
const look = await viewer.evaluate(() => {
  const css = (el, ...props) => Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]])), row = document.querySelector('[data-weekly-row="1"]');
  const thumb = row.querySelector('a[tabindex="-1"] > span');
  return { heading: css(document.querySelector('[data-weekly-top] h2'), 'fontSize', 'fontWeight'), title: css(row.querySelector('[data-weekly-title]'), 'fontSize', 'fontWeight'), handle: css(row.querySelector('a[data-weekly-target="profile"]'), 'fontSize'),
    count: css(row.querySelector('span.tabular-nums'), 'fontSize', 'fontVariantNumeric'), row: css(row, 'paddingLeft', 'paddingTop', 'columnGap'), list: css(document.querySelector('[data-weekly-list]'), 'borderTopLeftRadius', 'borderTopWidth'),
    thumb: [thumb.getBoundingClientRect().width, thumb.getBoundingClientRect().height, getComputedStyle(thumb).flexShrink, getComputedStyle(thumb).borderTopLeftRadius], icons: [...row.querySelectorAll('svg')].map(s => s.getBoundingClientRect().width) };
});
check('visual spec: 14px semibold heading, 13px medium title, 12px handle and tabular 12px counts, 16/12px row padding, 12px gaps, 10px list radius with a 1px border, a 40px non-shrinking rounded-square thumbnail, 14px icons',
  look.heading.fontSize === '14px' && Number(look.heading.fontWeight) >= 600 && look.title.fontSize === '13px' && Number(look.title.fontWeight) === 500 && look.handle.fontSize === '12px'
  && look.count.fontSize === '12px' && /tabular-nums/.test(look.count.fontVariantNumeric) && look.row.paddingLeft === '16px' && look.row.paddingTop === '12px' && look.row.columnGap === '12px'
  && look.list.borderTopLeftRadius === '10px' && look.list.borderTopWidth === '1px' && look.thumb[0] === 40 && look.thumb[1] === 40 && look.thumb[2] === '0' && look.thumb[3] !== '0px' && look.icons.every(w => w === 14 || w === 16), JSON.stringify(look));
// Links (brief 6.1-6.4): real anchors; the row itself is not one.
const first = weeklyRows(viewer).first();
const hrefs = await first.locator('a').evaluateAll(as => as.map(a => [a.getAttribute('href'), a.dataset.weeklyTarget]));
check('canvas row links: thumbnail, title and Open go to the canvas; the @handle goes to the profile; the row is not a link and shows no pointer over its background',
  JSON.stringify(hrefs) === JSON.stringify([['/e/tok-ice-floats', 'canvas'], ['/e/tok-ice-floats', 'canvas'], ['/@ana', 'profile'], ['/e/tok-ice-floats', 'canvas']])
  && await first.evaluate(r => r.tagName === 'LI' && !r.closest('a') && getComputedStyle(r).cursor === 'default') && await first.locator('[data-weekly-title]').evaluate(a => getComputedStyle(a).cursor === 'pointer'), JSON.stringify(hrefs));
check('counts are plain text with names for assistive tech, not buttons; the full title is reachable', await first.locator('button').count() === 0
  && /9 new stars this week/.test(await first.textContent()) && /3 forks this week/.test(await first.textContent()) && await first.locator('[data-weekly-title]').getAttribute('title') === 'Why ice floats');
// Hover (6.5, 6.6): Open appears with a colour and opacity change only; nothing moves.
const second = weeklyRows(viewer).nth(1), action = second.locator('[data-weekly-action]');
const rowBoxes = async () => JSON.stringify([await box(second), await box(second.locator('[data-weekly-title]')), await box(second.locator('span.tabular-nums').first())]);
await viewer.mouse.move(5, 5);
const [atRest, bgRest, boxRest] = [await action.evaluate(a => getComputedStyle(a).opacity), await second.evaluate(r => getComputedStyle(r).backgroundColor), await rowBoxes()];
await second.hover({ position: { x: 300, y: 4 } });
await viewer.waitForTimeout(400);
const [onHover, bgHover, boxHover] = [await action.evaluate(a => getComputedStyle(a).opacity), await second.evaluate(r => getComputedStyle(r).backgroundColor), await rowBoxes()];
check('hover: Open is hidden at rest and shown on hover, the row background changes subtly, and the title, counts and row do not move (no layout shift)', atRest === '0' && onHover === '1' && bgRest !== bgHover && boxRest === boxHover, JSON.stringify([atRest, onHover, bgRest, bgHover]));
check('the transition is 150ms, on colour and opacity only', await second.evaluate(r => getComputedStyle(r).transitionDuration) === '0.15s' && await action.evaluate(a => getComputedStyle(a).transitionProperty) === 'opacity');
await viewer.mouse.move(5, 5);
await viewer.evaluate(() => document.activeElement?.blur());
// Keyboard (6.8): the thumbnail is skipped; title, then @handle, then Open, each with a focus ring, the action shown while the row has focus.
await viewer.locator('[data-weekly-row="3"] [data-weekly-title]').focus();
const third = weeklyRows(viewer).nth(2);
const focusRing = await third.locator('[data-weekly-title]').evaluate(a => { const s = getComputedStyle(a); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
await viewer.keyboard.press('Tab');
const tabbed1 = await viewer.evaluate(() => document.activeElement.getAttribute('href'));
await viewer.keyboard.press('Tab');
await viewer.waitForTimeout(400); // the action fades in over 150ms; read its opacity after the transition, as the hover step does
const tabbed2 = await viewer.evaluate(() => [document.activeElement.getAttribute('aria-label'), getComputedStyle(document.activeElement).opacity]);
check('keyboard: the title, then the @handle, then Open (named "Open <title>"), each with a visible focus ring, the action shown while the row has focus',
  focusRing && tabbed1 === '/@ana' && tabbed2[0] === 'Open Attention, drawn out' && tabbed2[1] === '1', JSON.stringify([focusRing, tabbed1, tabbed2]));
await viewer.evaluate(() => document.activeElement?.blur());
// Analytics (brief 9): the clicks are observed here, not followed.
await viewer.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('[data-weekly-list]')) e.preventDefault(); }, true));
await weeklyRows(viewer).nth(3).locator('a[data-weekly-target="profile"]').click();
await weeklyRows(viewer).nth(0).locator('[data-weekly-action]').click();
const [viewedEvents, openedEvents] = [await events(viewer, 'weekly_top.viewed'), await events(viewer, 'weekly_top.opened')];
check('analytics: viewed once for Canvases with the week, version and entry count; opened carries tab, rank and target (a canvas row\'s @handle is a profile); no text, tokens or handles',
  viewedEvents.filter(e => e.tab === 'canvases').length === 1 && viewedEvents.find(e => e.tab === 'canvases').tab === 'canvases' && viewedEvents.find(e => e.tab === 'canvases').week_start_local === '2026-10-19' && viewedEvents.find(e => e.tab === 'canvases').ranking_version === 'weekly-top-v1' && viewedEvents.find(e => e.tab === 'canvases').entry_count === 5 && viewedEvents.find(e => e.tab === 'canvases').duration_ms >= 0
  && JSON.stringify(openedEvents.map(e => [e.tab, e.rank, e.target])) === JSON.stringify([['canvases', 4, 'profile'], ['canvases', 1, 'canvas']]) && !/tok-|cara|ice floats|@/.test(JSON.stringify([viewedEvents, openedEvents])), JSON.stringify([viewedEvents, openedEvents]));
// Search (4.5) and the regular controls (4.6).
const titles = () => weeklyRows(viewer).locator('[data-weekly-title]').allInnerTexts();
const ranking = await titles();
await viewer.locator('[data-explore-search]').fill('ice');
const hiddenAtOnce = await weeklySection(viewer).count();
await viewer.locator('[data-explore-search]').fill('   ');
const whitespace = await weeklySection(viewer).count();
await viewer.locator('[data-explore-search]').fill('');
check('search hides the section at once, whitespace alone keeps it, clearing restores the same rows, and nothing counts as a second view or request',
  hiddenAtOnce === 0 && whitespace === 1 && JSON.stringify(await titles()) === JSON.stringify(ranking) && (await events(viewer, 'weekly_top.viewed')).filter(e => e.tab === 'canvases').length === 1 && viewer.weeklyRequests === requestsAtStart,
  JSON.stringify([hiddenAtOnce, whitespace, await titles(), ranking, await events(viewer, 'weekly_top.viewed'), viewer.weeklyRequests, requestsAtStart]));
await viewer.locator('[data-sort-control]').click();
await viewer.locator('[data-sort-option="forks"]').click();
await viewer.getByRole('button', { name: /^Filters/ }).click();
await viewer.getByRole('button', { name: 'Canvas', exact: true }).click();
await viewer.waitForURL(/type=canvases/);
await viewer.locator('[data-card-size-slider]').fill('1');
check('Filters, Sort and Size change the regular results only: the weekly rows and their order are the same and no second request is made', JSON.stringify(await titles()) === JSON.stringify(ranking) && viewer.weeklyRequests === requestsAtStart, JSON.stringify([await titles(), ranking, viewer.weeklyRequests, requestsAtStart]));
await viewer.goto(`${BASE}/explore`);
await weeklySection(viewer).waitFor({ timeout: 30000 });
// The Creators tab.
await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
await viewer.locator('[data-weekly-top="creators"]').waitFor({ timeout: 30000 });
const cRows = weeklyRows(viewer);
const noName = cRows.nth(2), named = cRows.nth(0);
check('Creators: "Top creators this week", five rows, the display name with the @handle once, the @handle alone without a name, supporter counts and View profile',
  (await weeklySection(viewer).locator('h2').innerText()).trim() === 'Top creators this week' && await cRows.count() === 5
  && (await named.innerText()).replace(/\s+/g, ' ').includes('Ana Lee @ana') && (await noName.innerText()).match(/@cara/g).length === 1 && await noName.locator('[data-weekly-title]').innerText() === '@cara'
  && /13 people starred this week/.test(await named.textContent()) && /4 people forked this week/.test(await named.textContent()) && (await named.locator('[data-weekly-action]').textContent()).trim() === 'View profile'
  && JSON.stringify(await named.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')))) === JSON.stringify(['/@ana', '/@ana', '/@ana', '/@ana']));
check('Creators: the avatar is a circle, the Canvases-only controls are not shown, and each tab reported its own single view', await named.locator('a[tabindex="-1"] img, a[tabindex="-1"] span').first().evaluate(a => getComputedStyle(a).borderTopLeftRadius !== '0px')
  && await viewer.locator('[data-sort-control], [data-card-size-control]').count() === 0 && (await events(viewer, 'weekly_top.viewed')).map(e => e.tab).join() === 'canvases,creators');
const requestsAfterTabs = viewer.weeklyRequests;
await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Canvases' }).click();
await weeklySection(viewer).waitFor();
check('switching tabs shows each tab\'s own list from the one answer of the page load and does not ask again', await weeklySection(viewer).getAttribute('data-weekly-top') === 'canvases' && viewer.weeklyRequests === requestsAfterTabs && (await events(viewer, 'weekly_top.viewed')).length === 2);
}
await viewer.context().close();

// ---- Weekly Top 5 in the page against the REAL endpoint (no fixture): the stars, forks and archived canvas seeded above ----
const live = await pageFor({ k: 'none' });
live.weeklyMode = 'live';
await live.goto(`${BASE}/explore`);
await live.locator('[data-weekly-list]').waitFor({ timeout: 60000 });
const liveRow = live.locator('[data-weekly-row]', { hasText: `Paged attention ${run}` });
await live.evaluate(() => document.addEventListener('click', e => { if (e.target.closest('[data-weekly-list]')) e.preventDefault(); }, true));
await liveRow.locator('[data-weekly-title]').click();
const liveSeen = await live.evaluate(() => window.__weekly);
const liveRank = Number(await liveRow.getAttribute('data-weekly-row'));
check('real endpoint in the page: the seeded canvas is a row with 6 new stars, a real /e/ link and its creator profile link; the archived canvas and every SECRET title are absent; viewed once, opened carries the row rank',
  await liveRow.count() === 1 && /6 new stars this week/.test(await liveRow.textContent()) && await liveRow.locator('[data-weekly-title]').getAttribute('href') === `/e/${pagedToken}` && await liveRow.locator('a[data-weekly-target="profile"]').getAttribute('href') === `/@${H.full}`
  && !/SECRET/.test(await live.locator('[data-weekly-top]').textContent())
  && liveSeen.filter(e => e.name === 'weekly_top.viewed').length === 1 && liveSeen.find(e => e.name === 'weekly_top.viewed').ranking_version === 'weekly-top-v1' && liveSeen.find(e => e.name === 'weekly_top.viewed').entry_count === await live.locator('[data-weekly-row]').count()
  && JSON.stringify(liveSeen.filter(e => e.name === 'weekly_top.opened').map(e => [e.tab, e.rank, e.target])) === JSON.stringify([['canvases', liveRank, 'canvas']]), JSON.stringify(liveSeen));
await live.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
await live.locator('[data-weekly-top="creators"]').waitFor({ timeout: 30000 });
const liveCreator = live.locator('[data-weekly-row]', { hasText: `@${H.full}` });
check('real endpoint in the page, Creators: the full profile shows 6 supporters who starred this week, its own link, and the creator whose only starred canvas is archived is absent',
  await liveCreator.count() === 1 && /6 people starred this week/.test(await liveCreator.textContent()) && await liveCreator.locator('[data-weekly-action]').getAttribute('href') === `/@${H.full}` && await live.locator('[data-weekly-row]', { hasText: `@${H.long}` }).count() === 0);
await live.context().close();

// ---- Weekly Top 5: an empty week, a failed request, and a touch screen ----
const quiet = await pageFor({ k: 'none' });
quiet.weeklyMode = 'empty';
await quiet.goto(`${BASE}/explore`);
await quiet.locator('[data-weekly-empty]').waitFor({ timeout: 60000 });
check('empty week: the neutral message in place of rows, no fake entries', (await quiet.locator('[data-weekly-empty]').innerText()).trim() === 'No canvases have earned stars or forks yet this week.' && await quiet.locator('[data-weekly-row]').count() === 0 && await quiet.locator('[data-weekly-list]').count() === 0);
await quiet.context().close();
const broken = await pageFor({ k: 'none' });
broken.weeklyMode = 'error';
await broken.goto(`${BASE}/explore`);
await broken.locator('[data-explore-search]').waitFor({ timeout: 60000 });
await broken.waitForFunction(() => window.__weekly.some(e => e.name === 'weekly_top.request_failed'), null, { timeout: 15000 });
check('a failed request hides the section, leaves the controls working, and reports weekly_top.request_failed with the status and code',
  await broken.locator('[data-weekly-top]').count() === 0 && await broken.locator('[data-explore-search]').isEnabled() && JSON.stringify((await events(broken, 'weekly_top.request_failed')).map(e => [e.status, e.code])) === '[[500,"weekly_top_failed"]]');
await broken.context().close();
const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await touchContext.addCookies([{ name: 'small_session', value: who.none, url: BASE }]);
await touchContext.route('**/api/learn/boards/published/weekly-top', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weeklyTopFixture) }));
const touch = await touchContext.newPage();
touch.on('pageerror', error => errors.push(error.message));
await touch.goto(`${BASE}/explore`);
await weeklySection(touch).waitFor({ timeout: 60000 });
const touchLook = await touch.evaluate(() => ({ actions: [...document.querySelectorAll('[data-weekly-action]')].map(a => getComputedStyle(a).opacity), hover: matchMedia('(hover: none)').matches,
  fits: [...document.querySelectorAll('[data-weekly-row]')].every(r => r.scrollWidth <= r.clientWidth + 1), page: document.documentElement.scrollWidth <= window.innerWidth, title: document.querySelector('[data-weekly-title]').getBoundingClientRect().width }));
check('touch and narrow (390 wide): Open is always visible, every row fits, the page does not scroll sideways and the title keeps a readable width', touchLook.hover && touchLook.actions.length === 5 && touchLook.actions.every(o => o === '1') && touchLook.fits && touchLook.page && touchLook.title >= 90, JSON.stringify(touchLook));
await shot(touch, '03c-canvases-weekly-phone');
await touchContext.close();

// ---- phone, 390 wide ----
const phone = await pageFor({ k: 'none', width: 390 });
await phone.goto(`${BASE}/explore?tab=creators`);
await phone.locator('[data-explore-search]').waitFor({ timeout: 60000 });
await search(phone, run, '3 creators');
const p = { full: row(phone, H.full), long: row(phone, H.long), bare: row(phone, H.bare) };
const sizes72 = [await box(p.full.locator('img')), await box(p.bare.locator('span[title]').first())];
check('phone: the avatar is 72px, picture or initial', sizes72.every(b => Math.round(b.width) === 72 && Math.round(b.height) === 72), JSON.stringify(sizes72));
const phoneGap = Math.round((await box(p.full.locator('[data-creator-handle]'))).x - (sizes72[0].x + sizes72[0].width));
check('phone: 16px between the avatar and the text, closer than on desktop', phoneGap === 16, String(phoneGap));
check('phone: the search and the rows fill the screen width and share both edges', await phone.evaluate(() => { const f = document.querySelector('[data-explore-search]').closest('div').getBoundingClientRect(), r = document.querySelector('[data-creator-card]').getBoundingClientRect(); return Math.abs(f.left - r.left) <= 1 && Math.abs(f.right - r.right) <= 1 && r.width >= window.innerWidth - 40; }));
const below = async r => { const [t, v] = [await box(r.locator('[data-creator-handle]')), await box(r.locator('[data-creator-view]'))]; return v.y >= t.y + t.height; };
check('phone: View profile sits below the content', await below(p.full) && await below(p.long) && await below(p.bare));
check('phone: the long description clamps to two lines and the long name truncates, with no sideways scroll', await clampOk(p.long, true)
  && await p.long.locator('[data-creator-name]').evaluate(n => n.scrollWidth > n.clientWidth) && await noOverflow(phone));
await shot(phone, '03-creators-phone');
await phone.context().close();

// Weekly Top 5 brief §3: on a narrow window the Canvases toolbar scrolls inside itself (the search about 180px), the page never scrolls
// sideways, and the Sort menu opens in the page body, whole and on screen, not clipped by the scrolling row.
const narrow = await pageFor({ k: 'none', width: 390 });
await narrow.goto(`${BASE}/explore`);
await narrow.locator('[data-explore-list] [data-explore-card]').first().waitFor({ timeout: 60000 });
const narrowBar = await narrow.evaluate(() => { const t = document.querySelector('[data-explore-toolbar]'); return { scroll: t.scrollWidth, client: t.clientWidth, search: document.querySelector('[data-explore-search]').getBoundingClientRect().width, page: document.documentElement.scrollWidth, window: window.innerWidth, wrap: getComputedStyle(t).flexWrap }; });
check('narrow screen: the toolbar scrolls inside itself with a 180px search, one row, and the page has no sideways scroll',
  narrowBar.scroll > narrowBar.client && narrowBar.search >= 179 && narrowBar.search <= 182 && narrowBar.page <= narrowBar.window && narrowBar.wrap === 'nowrap', JSON.stringify(narrowBar));
await narrow.locator('[data-sort-control]').click();
const sortMenu = narrow.locator('[data-sort-option]').first();
await sortMenu.waitFor();
const menuBox = await narrow.evaluate(() => { const m = document.querySelector('[data-sort-option]').closest('.shadow-pop').getBoundingClientRect(); return { x: m.left, right: m.right, top: m.top, bottom: m.bottom, inToolbar: document.querySelector('[data-explore-toolbar]').contains(document.querySelector('[data-sort-option]')), width: window.innerWidth, height: window.innerHeight }; });
check('narrow screen: the Sort menu opens whole and on screen, outside the scrolling toolbar',
  !menuBox.inToolbar && menuBox.x >= 0 && menuBox.right <= menuBox.width && menuBox.top >= 0 && menuBox.bottom <= menuBox.height && await narrow.locator('[data-sort-option]').count() === 3, JSON.stringify(menuBox));
await narrow.keyboard.press('Escape');
await narrow.getByRole('button', { name: /^Filters/ }).click();
const filterMenu = await narrow.evaluate(() => { const m = document.querySelector('[data-menu-button-open]').closest('.shadow-pop').getBoundingClientRect(); return { x: m.left, right: m.right, inToolbar: document.querySelector('[data-explore-toolbar]').contains(document.querySelector('[data-menu-button-open]')), width: window.innerWidth }; });
check('narrow screen: the Filters menu opens whole and on screen, outside the scrolling toolbar', !filterMenu.inToolbar && filterMenu.x >= 0 && filterMenu.right <= filterMenu.width, JSON.stringify(filterMenu));
await narrow.keyboard.press('Escape');
await shot(narrow, '03a-canvases-narrow');
await narrow.context().close();

// ---- tablet, 768 wide: the content area (704px) is already narrower than the 760px cap, so the column shrinks to it ----
const tablet = await pageFor({ k: 'none', width: 768 });
await tablet.goto(`${BASE}/explore?tab=creators`);
await tablet.locator('[data-explore-search]').waitFor({ timeout: 60000 });
await search(tablet, run, '3 creators');
check('tablet: 96px avatars, one column that shrinks to the page with the search and the rows sharing both edges, no overflow', await tablet.evaluate(() => {
  const f = document.querySelector('[data-explore-search]').closest('div').getBoundingClientRect(), rows = [...document.querySelectorAll('[data-creator-card]')].map(r => r.getBoundingClientRect());
  const a = document.querySelector('[data-creator-card] img, [data-creator-card] span[title]').getBoundingClientRect();
  return Math.round(a.width) === 96 && f.width <= 760.5 && rows.every(b => Math.abs(b.left - f.left) <= 1 && Math.abs(b.right - f.right) <= 1);
}) && await noOverflow(tablet));
await shot(tablet, '03b-creators-tablet');
await tablet.context().close();

// ---- dark theme (the system preference; Appearance defaults to it) ----
const dark = await pageFor({ k: 'none', dark: true });
await dark.goto(`${BASE}/explore?tab=creators`);
await dark.locator('[data-explore-search]').waitFor({ timeout: 60000 });
// The weekly list is read before the search narrows the page to this run's creators: typing hides the section (brief 4.5).
await dark.locator('[data-weekly-list]').waitFor({ timeout: 30000 }).catch(async (error) => {
  console.log('weekly list missing on the dark Creators page:', JSON.stringify({ requests: dark.weeklyRequests, url: dark.url(), section: await dark.locator('[data-weekly-top]').count(), text: (await dark.locator('main').innerText().catch(() => '')).slice(0, 400), events: await dark.evaluate(() => window.__weekly).catch(() => null), errors }));
  throw error;
});
const darkWeekly = await dark.evaluate(() => { const row = document.querySelector('[data-weekly-row="1"]'); return [getComputedStyle(document.querySelector('[data-weekly-list]')).backgroundColor, getComputedStyle(row.querySelector('[data-weekly-title]')).color, getComputedStyle(row.querySelector('a[data-weekly-target="profile"]:not([data-weekly-title]):not([tabindex])')).color, getComputedStyle(document.querySelector('[data-weekly-list]')).borderTopColor]; });
await search(dark, run, '3 creators');
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const darkColors = await row(dark, H.full).evaluate(r => [getComputedStyle(r).backgroundColor, getComputedStyle(r.querySelector('[data-creator-name]')).color, getComputedStyle(r.querySelector('[data-creator-description]')).color]);
check('dark theme: a dark row with light text, from the theme tokens', await dark.evaluate(() => document.documentElement.classList.contains('dark'))
  && lum(darkColors[0]) < 0.3 && lum(darkColors[1]) > 0.6 && lum(darkColors[2]) > 0.45, JSON.stringify(darkColors));
const darkBlue = await accent(dark);
check('dark theme: the dot grid, the handle and the active tab underline in the theme\'s blue', /radial-gradient/.test(await dark.locator('main[data-explore]').evaluate(m => getComputedStyle(m).backgroundImage))
  && await row(dark, H.full).locator('[data-creator-handle]').evaluate(a => getComputedStyle(a).color) === darkBlue
  && (await underline(dark))[0] === darkBlue);
check('dark theme: the Weekly Top 5 list is a dark surface with bright titles and readable muted handles, from the theme tokens', lum(darkWeekly[0]) < 0.3 && lum(darkWeekly[1]) > 0.6 && lum(darkWeekly[2]) > 0.45 && lum(darkWeekly[3]) < 0.5, JSON.stringify(darkWeekly));
await shot(dark, '04-creators-dark');
await dark.context().close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const total = 68;
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total && results.length === total ? 0 : 1);
