// The public creator profile and Explore's creator discovery (docs/features/creator-profile.md, owner 2026-10-06 #63),
// against the LOCAL stack only: local D1 and fresh browser profiles. No model is called and nothing is sent from a
// composer. Prints no secrets. Every row is made through the routes: profiles, canvases, publications, forks.
// Usage: BASE=http://127.0.0.1:8838 SMALL_CP=http://127.0.0.1:8839 node e2e/creator-profile-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8838';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8839';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('creator-profile-check runs against the local stack only');
const SHOTS = process.argv[2] || 'creator-profile-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const EMAIL = { full: `cp-full-${run}@example.com`, min: `cp-min-${run}@example.org`, viewer: `cp-viewer-${run}@example.net` };
const H = { full: `mayank_${run}`, min: `alice_${run}`, viewer: `viewer_${run}` };
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const who = {};
for (const k of Object.keys(EMAIL)) who[k] = { session: await sessionFor(EMAIL[k], H[k]) };
const api = async (p, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(p ? { cookie: `small_session=${p.session}` } : {}), 'content-type': 'application/json' } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const post = (p, path, body = {}) => api(p, path, { method: 'POST', body: JSON.stringify(body) });
const STATE = text => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.` }] });
const canvas = async (p, title, description) => {
  const c = (await post(p, '/api/canvases', { title })).body;
  await api(p, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(title) }) });
  if (description) await api(p, `/api/apps/${c.name}`, { method: 'PATCH', body: JSON.stringify({ description }) });
  return c;
};
const publish = async (p, c) => (await post(p, `/api/apps/${c.name}/publish`)).body.publication_token;

const browser = await chromium.launch();
const errors = [];
const contextFor = async p => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (p) await context.addCookies([{ name: 'small_session', value: p.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
// The full creator's picture: a real PNG drawn in a browser, uploaded through Settings' own route (PUT /api/profile).
const scratch = await contextFor(null);
await scratch.goto(`${BASE}/@${H.full}`);
const AVATAR = await scratch.evaluate(() => {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#5b7fd1'); g.addColorStop(1, '#8f5bd1');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 50, 22, 0, 7); x.fill(); x.beginPath(); x.arc(64, 128, 46, 0, 7); x.fill();
  return c.toDataURL('image/png');
});
await scratch.context().close();
// The profile description (owner, 2026-10-08: "in profile add a discription"), through the same route Settings uses.
const DESC = 'Explains LLM inference one memory trip at a time: KV caches, attention kernels and the prefill/decode split.';
assert.equal((await api(who.full, '/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'Mayank', avatar: AVATAR, description: DESC }) })).status, 200);

// ---- rows: the full creator's three public explainers (one forked twice) and three that must never show; the minimal
// creator's one; the viewer's own private canvas ----
const T = { kv: 'KV Cache', flash: 'Flash Attention', prefill: 'Prefill vs Decode', grad: 'Gradient Descent' };
const kv = await canvas(who.full, T.kv, 'Why decode re-reads every past key and value, and what caching them buys.');
const flash = await canvas(who.full, T.flash, 'Tiling attention so it never leaves fast memory.');
const prefill = await canvas(who.full, T.prefill, 'Two phases of LLM inference and why one is memory-bound.');
const tokens = {};
for (const [k, c] of [['kv', kv], ['flash', flash], ['prefill', prefill]]) tokens[k] = await publish(who.full, c);
const priv = await canvas(who.full, `SECRET private ${run}`);
const unlisted = await canvas(who.full, `SECRET unlisted ${run}`);
await post(who.full, `/api/learn/boards/${unlisted.name}/main/share`, { shared: true, view: true, state: STATE('u') });
const archived = await canvas(who.full, `SECRET archived ${run}`);
await publish(who.full, archived);
await post(who.full, `/api/apps/${archived.name}/archive`);
const grad = await canvas(who.min, T.grad, 'Walking downhill on a loss surface, one step at a time.');
tokens.grad = await publish(who.min, grad);
await post(who.viewer, '/api/learn/boards/fork', { source: { token: tokens.kv }, key: `cp-fork-a-${run}` });
await post(who.min, '/api/learn/boards/fork', { source: { token: tokens.kv }, key: `cp-fork-b-${run}` });
await post(who.viewer, '/api/learn/boards/fork', { source: { token: tokens.flash }, key: `cp-fork-c-${run}` });
await canvas(who.viewer, `Viewer notes ${run}`);

const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name, locator = page) => { await page.waitForTimeout(400); await locator.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
// Nobody else's email on the page (a signed-in person's own account menu may show their own, privately).
const noEmail = async (page, own = null) => { const html = await page.content(); for (const email of Object.values(EMAIL)) if (email !== own) assert.ok(!html.includes(email), `${email} on ${page.url()}`); };
const profileOf = async (page, handle) => { await page.goto(`${BASE}/@${handle}`); await page.locator('[data-creator-profile], [data-profile-missing]').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(600); };
const titles = async (page, sel) => (await page.locator(`${sel} [data-card-title]`).allInnerTexts()).map(t => t.trim());
const card = (page, sel, title) => page.locator(sel).filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
// Explore holds every run's rows on this local D1: this run's card is the one by this run's creator.
const ours = (page, title) => card(page, '[data-explore-card]', title).filter({ has: page.locator(`[data-creator-link][href="/@${H.full}"]`) });

const viewer = await contextFor(who.viewer);
// Owner, 2026-10-08: Explore has two tabs - Explainers (default) and Creators - and the creators row left the feed.
await check('1 Explore: Explainers by default with no creator row; the Creators tab lists profiles - picture or initials, name, @handle, public explainer count; never an email; the tab is in the URL', async () => {
  await viewer.goto(`${BASE}/explore`);
  await viewer.locator('[data-explore-card]').first().waitFor({ timeout: 60000 });
  assert.equal(await viewer.locator('[data-explore-tabs] [role="tab"][data-state="active"]').innerText(), 'Explainers');
  assert.equal(await viewer.locator('[data-creator-chip]').count(), 0, 'no creators in the Explainers feed');
  await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
  await viewer.locator('[data-explore-creators] [data-creator-chip]').first().waitFor({ timeout: 30000 });
  assert.equal(new URL(viewer.url()).search, '?tab=creators');
  assert.equal(await viewer.locator('[data-explore-card], [data-sort-control]').count(), 0, 'no cards and no Sort on Creators');
  const full = viewer.locator(`[data-creator-chip="${H.full}"]`), min = viewer.locator(`[data-creator-chip="${H.min}"]`);
  assert.equal(await full.getAttribute('href'), `/@${H.full}`);
  // Owner, 2026-10-08: a square card - name, @handle, the description, and "N projects · M canvases" of public things only
  // (the private, unlisted and archived canvases never count; neither creator has a public project).
  assert.match(await full.innerText(), new RegExp(`^Mayank\\s+@${H.full}\\s`));
  assert.equal((await full.locator('[data-creator-description]').innerText()).trim(), DESC);
  assert.equal((await full.locator('[data-creator-counts]').innerText()).trim(), '0 projects · 3 canvases');
  assert.equal(await full.locator('img').count(), 1, 'the uploaded picture');
  assert.match(await min.innerText(), new RegExp(`^@${H.min}\\s+0 projects · 1 canvas$`), 'no description, no empty line');
  assert.equal(await min.locator('img').count(), 0, 'initials');
  for (const h of [H.full, H.min]) {
    const box = await viewer.locator(`[data-creator-card="${h}"]`).boundingBox();
    assert.ok(Math.abs(box.width - box.height) <= 1, `square: ${box.width}x${box.height}`);
  }
  assert.equal(await viewer.locator(`[data-creator-chip="${H.viewer}"]`).count(), 0, 'no publication, no creator chip');
  await viewer.reload();
  await viewer.locator('[data-explore-creators] [data-creator-chip]').first().waitFor({ timeout: 30000 });
  assert.equal(await viewer.locator('[data-explore-tabs] [role="tab"][data-state="active"]').innerText(), 'Creators', 'a reload keeps the tab');
  await noEmail(viewer, EMAIL.viewer);
});
await shot(viewer, 'C-explore-creator-row');
await check('2 the Explore card\'s @handle is a neutral link to /@handle; the title still opens /e', async () => {
  // Check 1 ends on the Creators tab (kept in the URL); the cards are on Explainers, the default.
  await viewer.goto(`${BASE}/explore`);
  await viewer.locator('[data-explore-list]').waitFor({ timeout: 30000 });
  const c = ours(viewer, T.kv);
  const link = c.locator('[data-creator-link]');
  assert.equal(await link.getAttribute('href'), `/@${H.full}`);
  assert.equal((await link.innerText()).trim(), `Mayank · @${H.full}`);
  assert.notEqual(await link.locator('[data-creator]').evaluate(e => getComputedStyle(e).color), await c.locator('[data-card-title]').evaluate(e => getComputedStyle(e).color), 'blue is the title\'s');
  assert.equal(await c.locator('[data-card-title]').getAttribute('href'), `/e/${tokens.kv}`);
});
await check('3 Explore → @handle → the creator profile: name, @handle, explainer count and canonical forks; only public explainers', async () => {
  await ours(viewer, T.kv).locator('[data-creator-link]').click();
  await viewer.waitForURL(`${BASE}/@${H.full}`);
  await viewer.locator('[data-profile-card]').first().waitFor({ timeout: 60000 });
  assert.equal((await viewer.locator('[data-profile-name]').innerText()).trim(), 'Mayank');
  assert.equal((await viewer.locator('[data-profile-handle]').innerText()).trim(), `@${H.full}`);
  assert.equal((await viewer.locator('[data-profile-stats]').innerText()).trim(), '3 public explainers · 3 forks');
  assert.deepEqual(await titles(viewer, '[data-profile-card]'), [T.prefill, T.flash, T.kv], 'Newest first');
  assert.ok(!(await viewer.content()).includes('SECRET'), 'never private, unlisted or archived');
  assert.equal(await viewer.locator('[data-creator-profile] img').first().getAttribute('src').then(s => s.startsWith(`/api/learn/creators/${H.full}/avatar`)), true);
  assert.equal((await viewer.locator('[data-profile-description]').innerText()).trim(), DESC, 'the description under the name');
  assert.equal(await viewer.locator('[data-category]').count(), 0, 'no category storage: no empty row');
});
await check('4 another creator\'s profile: no blue check anywhere, no Edit profile or Analytics; their cards offer Start Rabbit Hole and Fork', async () => {
  assert.equal(await viewer.locator('[data-owner-badge]').count(), 0);
  assert.equal(await viewer.locator('[data-own-profile], [data-edit-profile], [data-creator-analytics-open]').count(), 0);
  assert.equal(await card(viewer, '[data-profile-card]', T.kv).locator('[data-card-start-rabbit-hole]').count(), 1);
  assert.equal(await card(viewer, '[data-profile-card]', T.kv).locator('[data-fork-button]').count(), 1);
  assert.equal(await viewer.getByRole('button', { name: /follow|subscribe|like/i }).count(), 0, 'no social features');
  await noEmail(viewer, EMAIL.viewer);
});
await shot(viewer, 'E-another-creators-profile');
await check('5 sorting: Newest and Most forked, in the server\'s order', async () => {
  await viewer.locator('[data-sort-control]').click();
  assert.deepEqual((await viewer.locator('[data-sort-option]').allInnerTexts()).map(t => t.trim()), ['Newest', 'Most forked']);
  await viewer.locator('[data-sort-option="forks"]').click();
  await viewer.waitForTimeout(800);
  const want = (await api(who.viewer, `/api/learn/creators/${H.full}?sort=forks`)).body.explainers.map(c => c.title);
  assert.deepEqual(want, [T.kv, T.flash, T.prefill]);
  assert.deepEqual(await titles(viewer, '[data-profile-card]'), want);
  // Others' cards carry the count inside Fork, GitHub style, 0 included; no second "N forks" beside it (owner, 2026-10-08).
  assert.deepEqual((await viewer.locator('[data-profile-card] [data-fork-button] [data-fork-count-value]').allInnerTexts()).map(t => t.trim()), ['2', '1', '0']);
  assert.equal(await viewer.locator('[data-profile-card] [data-fork-count]').count(), 0);
});
await shot(viewer, 'A-full-creator-most-forked');
await check('6 a profile explainer opens its canonical /e route, whose header links back to /@handle', async () => {
  await card(viewer, '[data-profile-card]', T.flash).locator('[data-card-title]').click();
  await viewer.waitForURL(`${BASE}/e/${tokens.flash}`);
  const by = viewer.locator('[data-shared-creator]');
  await by.waitFor({ timeout: 60000 });
  assert.equal((await by.innerText()).trim(), `Published by Mayank · @${H.full}`);
  assert.equal(await by.locator('[data-creator-link]').getAttribute('href'), `/@${H.full}`);
  await by.locator('[data-creator-link]').click();
  await viewer.waitForURL(`${BASE}/@${H.full}`);
});
await check('7 the minimal creator: initials, @handle as the name, their card; no empty description or category rows', async () => {
  await profileOf(viewer, H.min);
  assert.equal(await viewer.locator('[data-profile-description], [data-category]').count(), 0);
  assert.equal((await viewer.locator('[data-profile-name]').innerText()).trim(), `@${H.min}`);
  assert.equal(await viewer.locator('[data-profile-handle]').count(), 0, '@handle once, as the name');
  assert.equal(await viewer.locator('[data-creator-profile] header img').count(), 0, 'initials');
  assert.equal((await viewer.locator('[data-profile-stats]').innerText()).trim(), '1 public explainer · 0 forks');
  assert.deepEqual(await titles(viewer, '[data-profile-card]'), [T.grad]);
  assert.equal(await viewer.locator('[data-owner-badge]').count(), 0);
});
await shot(viewer, 'B-minimal-creator');
await check('8 handles are case-insensitive and the address takes the canonical handle; an unknown handle is a 404', async () => {
  await profileOf(viewer, H.full.toUpperCase());
  assert.equal((await viewer.locator('[data-profile-name]').innerText()).trim(), 'Mayank');
  assert.equal(new URL(viewer.url()).pathname, `/@${H.full}`);
  await profileOf(viewer, `nobody_${run}`);
  assert.match(await viewer.locator('[data-profile-missing]').innerText(), new RegExp(`No creator @nobody_${run}`));
  assert.equal((await api(null, `/api/learn/creators/nobody_${run}`)).status, 404);
});
await check('9 Explore search applies to the active tab only: Explainers by @handle and title, Creators by @handle first; never by email', async () => {
  await viewer.goto(`${BASE}/explore`);
  await viewer.locator('[data-explore-card]').first().waitFor({ timeout: 60000 });
  assert.equal(await viewer.locator('[data-explore-search]').getAttribute('placeholder'), 'Search explainers');
  await viewer.locator('[data-explore-search]').fill(`@${H.full}`);
  await viewer.waitForTimeout(900);
  assert.deepEqual(new Set(await titles(viewer, '[data-explore-card]')), new Set([T.kv, T.flash, T.prefill]));
  assert.equal(await viewer.locator('[data-creator-chip]').count(), 0, 'Explainers search shows no creators');
  await viewer.locator('[data-explore-search]').fill('flash attention');
  await viewer.waitForTimeout(900);
  const found = await titles(viewer, '[data-explore-card]');
  assert.ok(found.length >= 1 && found.every(t => t === T.flash), 'by title, any case');
  await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Creators' }).click();
  assert.equal(await viewer.locator('[data-explore-search]').getAttribute('placeholder'), 'Search creators');
  await viewer.locator('[data-explore-search]').fill(`@${H.full}`);
  await viewer.locator('[data-explore-creators] [data-creator-chip]').first().waitFor({ timeout: 10000 });
  await viewer.waitForTimeout(600);
  assert.equal(await viewer.locator('[data-explore-creators] [data-creator-chip]').first().getAttribute('data-creator-chip'), H.full);
  assert.equal(await viewer.locator('[data-explore-card]').count(), 0, 'Creators search shows no explainers');
  await shot(viewer, 'D-search-creators-explainers');
  for (const email of [EMAIL.full, EMAIL.min.split('@')[0]]) {
    await viewer.locator('[data-explore-search]').fill(email);
    await viewer.waitForTimeout(900);
    assert.equal(await viewer.locator('[data-explore-creators] [data-creator-chip]').count(), 0, email);
  }
  await viewer.locator('[data-explore-tabs]').getByRole('tab', { name: 'Explainers' }).click();
  for (const email of [EMAIL.full, EMAIL.min.split('@')[0]]) {
    await viewer.locator('[data-explore-search]').fill(email);
    await viewer.waitForTimeout(900);
    assert.equal(await viewer.locator('[data-explore-card]').count(), 0, email);
  }
  await noEmail(viewer, EMAIL.viewer);
});
const owner = await contextFor(who.full);
await check('10 your own profile: the same page, plus "Your profile" with the blue check, Edit profile and Analytics; your cards badged, no Start or Fork', async () => {
  await profileOf(owner, H.full);
  await owner.locator('[data-own-profile]').waitFor({ timeout: 10000 });
  assert.match(await owner.locator('[data-own-profile]').innerText(), /Your profile/);
  assert.equal(await owner.locator('[data-own-profile] [data-owned-badge]').count(), 1);
  assert.equal(await owner.locator('[data-edit-profile]').count(), 1);
  assert.equal(await owner.locator('[data-creator-analytics-open]').count(), 1);
  assert.equal(await owner.locator('[data-profile-card] [data-owned-badge]').count(), 3);
  assert.equal(await owner.locator('[data-profile-card] [data-card-start-rabbit-hole], [data-profile-card] [data-fork-button]').count(), 0);
  assert.deepEqual(await titles(owner, '[data-profile-card]'), [T.prefill, T.flash, T.kv], 'the same content as everyone sees');
});
await shot(owner, 'F-own-profile');
// Edit -> shown: a description saved in Settings shows under the name at once and on the creator card, as text.
const EDITED = `Tiles attention <b>so it never</b> leaves fast memory & <a href="https://example.com">links</a> stay text ${run}`;
await check('11 Edit profile opens Settings on Profile; a description saved there shows at once under the name, and on the creator card, as text', async () => {
  await owner.locator('[data-edit-profile]').click();
  await owner.getByRole('textbox', { name: 'Handle' }).waitFor({ timeout: 10000 });
  const field = owner.getByRole('textbox', { name: 'Description' });
  assert.equal(await field.inputValue(), DESC, 'beside name and handle, the saved description');
  assert.equal(await field.getAttribute('maxlength'), '160');
  await field.fill(EDITED);
  await owner.locator('form').filter({ has: field }).getByRole('button', { name: 'Save' }).click();
  await owner.waitForTimeout(800);
  await owner.keyboard.press('Escape');
  const shown = owner.locator('[data-creator-profile] [data-profile-description]');
  assert.equal((await shown.innerText()).trim(), EDITED, 'at once, without a reload');
  assert.equal(await shown.locator('*').count(), 0, 'markup is text, never HTML or a link');
  await owner.goto(`${BASE}/explore?tab=creators`);
  const onCard = owner.locator(`[data-creator-card="${H.full}"] [data-creator-description]`);
  await onCard.waitFor({ timeout: 30000 });
  assert.equal((await onCard.innerText()).trim(), EDITED);
  assert.equal(await onCard.locator('*').count(), 0);
  await shot(owner, 'G-creator-card-edited', owner.locator(`[data-creator-card="${H.full}"]`));
  // Back to the seeded description for the checks after this one.
  assert.equal((await api(who.full, '/api/profile', { method: 'PUT', body: JSON.stringify({ description: DESC }) })).body.description, DESC);
});
const anon = await contextFor(null);
await check('12 signed out, /@handle opens on its own, with the cards and no email', async () => {
  await profileOf(anon, H.full);
  await anon.locator('[data-profile-card]').first().waitFor();
  assert.equal(await anon.locator('[data-shared-brand]').count(), 1);
  assert.equal(await anon.locator('[data-owner-badge], [data-edit-profile]').count(), 0);
  assert.equal(await anon.locator('[data-profile-card] [data-card-start-rabbit-hole]').count(), 3, 'Start Rabbit Hole signs in, then resumes');
  await noEmail(anon);
});
await shot(anon, 'A-full-creator-signed-out');
await check('14 fork provenance: a fork made through the publication credits @handle as a link to /@handle; your own @handle links too', async () => {
  await viewer.goto(`${BASE}/library?type=canvases`);
  const fork = viewer.locator('[data-library-card="canvas"]').filter({ has: viewer.locator(`[data-forked-from-creator][href="/@${H.full}"]`) });
  await fork.first().waitFor({ timeout: 60000 });
  assert.equal(await fork.count(), 2, 'both forks the viewer made through /e (KV Cache, Flash Attention)');
  assert.equal((await fork.first().locator('[data-forked-from-creator]').innerText()).trim(), `@${H.full}`);
  // Every @handle links (owner, 2026-10-08): the viewer's own @handle on their own Library card opens their profile.
  assert.equal(await fork.first().locator('[data-creator-link]').getAttribute('href'), `/@${H.viewer}`);
  await fork.first().locator('[data-forked-from-creator]').click();
  await viewer.waitForURL(`${BASE}/@${H.full}`);
  await noEmail(viewer, EMAIL.viewer);
});
await check('13 a changed handle moves the profile and every attribution at once; the old one is a 404', async () => {
  const next = `mayank_r_${run}`;
  assert.equal((await api(who.full, '/api/profile', { method: 'PUT', body: JSON.stringify({ handle: next }) })).status, 200);
  assert.equal((await api(null, `/api/learn/creators/${H.full}`)).status, 404);
  await profileOf(anon, next);
  assert.equal((await anon.locator('[data-profile-handle]').innerText()).trim(), `@${next}`);
  const listed = (await api(null, '/api/learn/boards/published')).body.canvases.filter(c => c.creator.handle === next).map(c => c.title);
  assert.deepEqual(new Set(listed), new Set([T.kv, T.flash, T.prefill]));
  await api(who.full, '/api/profile', { method: 'PUT', body: JSON.stringify({ handle: H.full }) });
});
await check('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(`${results.length}/15 checks passed`);
process.exit(results.length === 15 ? 0 : 1);
