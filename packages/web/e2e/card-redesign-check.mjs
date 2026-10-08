// The canonical card redesign (docs/features/card-redesign.md) on Library, Home and Explore, against the LOCAL stack
// only: local D1 and fresh browser profiles. No model is called and nothing is sent from a composer. Prints no secrets.
// One project row is added to the owner's /api/apps reply in the browser (importing a repository needs the indexer,
// which the keyless stack has none of); everything else is real rows made through the routes.
// Usage: BASE=http://127.0.0.1:8838 SMALL_CP=http://127.0.0.1:8839 node e2e/card-redesign-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8838';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8839';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('card-redesign-check runs against the local stack only');
const SHOTS = process.argv[2] || 'card-redesign-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const H = { owner: `crd_${run}`, other: `crdo_${run}` };
const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
const owner = { session: await sessionFor(`crd-owner-${run}@example.com`, H.owner) };
const other = { session: await sessionFor(`crd-other-${run}@example.org`, H.other) };
const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${who.session}`, 'content-type': 'application/json' } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const post = (who, path, body = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body) });
const STATE = text => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [{ id: 'c1', type: 'explanation', dx: 0, dy: 0, title: text, body: `${text}, explained.` }] });
const canvas = async (who, title, extra = {}) => post(who, '/api/canvases', { title, ...extra });
const saveBoard = (who, c, text) => api(who, `/api/learn/boards/${c.name}/main`, { method: 'PUT', body: JSON.stringify({ state: STATE(text) }) });
const publish = async (who, c, text) => { await saveBoard(who, c, text); await post(who, `/api/apps/${c.name}/publish`); };

// ---- rows: the owner's canvases (one long description, one public, one on another device, a fork of another
// person's), and the other person's two public canvases ----
const T = { tides: `Tides ${run}`, bridges: `Bridges ${run}`, away: `Away notes ${run}`, orbits: `Orbits ${run}`, prisms: `Prisms ${run}` };
const LONG = 'Why the moon raises two bulges of water on opposite sides of the Earth, how the Sun adds spring and neap tides, why the timing drifts by about fifty minutes a day, how coastlines and basins resonate to make some harbours swing by metres while others barely move, and what tide tables actually predict.';
const tides = await canvas(owner, T.tides);
const bridges = await canvas(owner, T.bridges);
await publish(owner, bridges, 'Trusses');
const away = await canvas(owner, T.away, { device_id: `another-browser-${run}` });
const orbits = await canvas(other, T.orbits);
await api(other, `/api/apps/${orbits.name}`, { method: 'PATCH', body: JSON.stringify({ description: 'Kepler, ellipses and why a faster orbit is a lower one.' }) });
await publish(other, orbits, 'Ellipses');
const prisms = await canvas(other, T.prisms);
await publish(other, prisms, 'Refraction');
const published = async (sort = 'newest') => (await api(other, `/api/learn/boards/published?sort=${sort}`)).canvases;
const tokenOf = async title => (await published()).find(c => c.title === title).url.slice(3);
await post(other, '/api/learn/boards/fork', { source: { token: await tokenOf(T.bridges) }, key: `crd-a-${run}` });
const fork = await post(owner, '/api/learn/boards/fork', { source: { token: await tokenOf(T.orbits) }, key: `crd-b-${run}` });
// Orbits' description edited after publishing: a meaningful change, so it leads Recently updated (canvas-metadata.md).
await api(other, `/api/apps/${orbits.name}`, { method: 'PATCH', body: JSON.stringify({ description: 'Kepler, ellipses and why a faster orbit is a lower one - and what that means for docking.' }) });

// Tides' description is the owner's last meaningful change, so it leads Last updated.
await api(owner, `/api/apps/${tides.name}`, { method: 'PATCH', body: JSON.stringify({ description: LONG }) });
const catalog = await api(owner, '/api/apps');
const PROJECT = { kind: 'repository', hosting: 'repository', name: `repo-0c0ffee0-${run}`.slice(0, 40), org: catalog.org, email: catalog.email, owner_email: catalog.email, owner_handle: H.owner, owner_name: null,
  repo: 'karpathy/nanoGPT', branch: 'master', commit_sha: 'abc1234def', status: 'ready', created_at: '2026-10-01 09:00:00', canEdit: true, canView: true, visibility: 'domain',
  description: 'Learn from karpathy/nanoGPT', url: `/apps/repo-0c0ffee0-${run}`, members: [], inputs: {}, outputs: {} };
const keyOf = name => `small.adaptive-canvas:${catalog.org}:${catalog.email}:${name}`;
const SEEDS = {
  [`${keyOf(tides.name)}:ink`]: { strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'h1', type: 'heading', level: 1, text: 'Two bulges', done: true }, { id: 'h2', type: 'heading', level: 1, text: 'Spring and neap tides' }] },
  [`${keyOf(tides.name)}:chat`]: [{ id: 'q1', question: 'why two bulges and not one?' }],
  'small.recent': [tides.name, away.name, bridges.name],
};

const browser = await chromium.launch();
const errors = [];
// A canvas is saved on the server at creation now (canvas-persistence.md, Saved at creation), so a browser note only
// shows on an older canvas made before that: `legacy` names the rows this browser reads as board-less (board_saved off).
const contextFor = async (who, { project = false, legacy = [] } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (who) await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  if (who === owner) await context.addInitScript(seeds => { for (const [k, v] of Object.entries(seeds)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, SEEDS);
  if (project || legacy.length) {
    await context.route(url => new URL(url).pathname === '/api/apps', async route => {
      const response = await route.fetch();
      const body = await response.json();
      const apps = body.apps.map(a => legacy.includes(a.name) ? { ...a, board_saved: false } : a);
      route.fulfill({ response, json: { ...body, apps: project ? [...apps, PROJECT] : apps } });
    });
  }
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const titled = (page, sel, title) => page.locator(sel).filter({ has: page.locator('[data-card-title]', { hasText: new RegExp(`^${title}$`) }) });
const boxes = loc => loc.evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
// No textual type pill anywhere in a card: no leaf element reads exactly Canvas, Project or Standalone.
const typeWords = loc => loc.evaluateAll(ns => ns.flatMap(n => [...n.querySelectorAll('*')].filter(e => !e.children.length && /^(Canvas|Project|Standalone)$/.test(e.textContent.trim())).map(e => e.textContent.trim())));
const rgb = (loc, prop) => loc.evaluate((n, p) => getComputedStyle(n)[p], prop);
const ACCENT = 'rgb(35, 131, 226)';
// The portaled ⋮ menu closes on any scroll (ui.jsx Menu); a scroll landing just after the press closes it again, so
// one more press is allowed before the check fails.
const openMenu = async card => {
  for (let i = 0; i < 2; i++) {
    await card.getByTitle('More').click();
    if (await card.page().locator('[data-menu-rename]').waitFor({ timeout: 3000 }).then(() => true, () => false)) return;
  }
  throw Error('the ⋮ menu did not open');
};
const titlesIn = async (page, sel, mine) => (await page.locator(`${sel} [data-card-title]`).allInnerTexts()).map(t => t.trim()).filter(t => mine.includes(t));

// ---- Library ----
const lib = await contextFor(owner, { project: true, legacy: [tides.name, away.name] });
await lib.goto(`${BASE}/library`);
await lib.locator('[data-library-card="project"]').first().waitFor({ timeout: 60000 });
await lib.locator('[data-library-card="canvas"]').first().waitFor();
await check('1 Library at 1440x900: cards 420-500 x 210-260 px, two columns', async () => {
  await lib.goto(`${BASE}/library?type=canvases`);
  await titled(lib, '[data-library-card]', T.tides).waitFor({ timeout: 60000 });
  const all = await boxes(lib.locator('[data-library-card]'));
  assert.ok(all.length >= 4, `${all.length} cards`);
  for (const b of all) { assert.ok(b.w >= 420 && b.w <= 500, `width ${b.w}`); assert.ok(b.h >= 210 && b.h <= 260, `height ${b.h}`); }
  const columns = new Set(all.map(b => b.x));
  assert.equal(columns.size, 2, `columns at x ${[...columns]}`);
  assert.equal(all[0].y, all[1].y); assert.ok(all[2].y > all[0].y, 'the third card starts the second row');
});
await shot(lib, '02-library-canvases');
await check('2 no textual Canvas / Project / Standalone pill on any Library card; each has its type icon', async () => {
  await lib.goto(`${BASE}/library`);
  await lib.locator('[data-library-card="project"]').first().waitFor({ timeout: 60000 });
  const cards = lib.locator('[data-library-card]');
  assert.deepEqual(await typeWords(cards), []);
  assert.equal(await lib.locator('[data-library-card] [data-type-icon]').count(), await cards.count());
  assert.equal(await lib.locator('[data-library-card="project"] [data-type-icon="repository"] svg.lucide-folder-git-2').count(), 1);
  // A canvas is drawn as shapes, not a pen (owner, 2026-10-08).
  assert.ok(await lib.locator('[data-library-card="canvas"] [data-type-icon="canvas"] svg.lucide-shapes').count() >= 4);
});
await shot(lib, '01-library-all');
await check('3 the GitHub URL is on the repository project only, blue, opening GitHub in a new tab', async () => {
  const link = lib.locator('[data-library-card="project"] [data-source-link]');
  assert.equal(await link.getAttribute('href'), 'https://github.com/karpathy/nanoGPT');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal((await link.innerText()).trim(), 'github.com/karpathy/nanoGPT');
  assert.equal(await rgb(link, 'color'), ACCENT);
  assert.equal(await lib.locator('[data-library-card="canvas"] [data-source-link]').count(), 0);
  assert.equal(await lib.locator('[data-library-card="project"] [data-card-description]').count(), 0, 'the server placeholder is not a description');
});
await check('4 hierarchy and colour: blue title and owner badge; neutral @handle, description, visibility, forks, updated and ⋮; no Fork on your own card; a click selects, Open on hover', async () => {
  const card = titled(lib, '[data-library-card="canvas"]', T.tides);
  assert.equal(await rgb(card.locator('[data-card-title]'), 'color'), ACCENT);
  assert.equal((await card.locator('[data-creator]').innerText()).trim(), `@${H.owner}`);
  assert.equal(await card.locator('[data-owned-badge]').getAttribute('aria-label'), 'Owned by you');
  assert.equal(await rgb(card.locator('[data-owned-badge] path').first(), 'fill'), ACCENT);
  for (const sel of ['[data-creator]', '[data-card-description]', '[data-card-visibility]', '[data-updated]', '[title="More"]']) assert.notEqual(await rgb(card.locator(sel), 'color'), ACCENT, sel);
  assert.notEqual(await rgb(titled(lib, '[data-library-card="canvas"]', T.bridges).locator('[data-fork-count]'), 'color'), ACCENT, '[data-fork-count]');
  assert.equal((await card.locator('[data-card-visibility]').innerText()).trim(), 'Private');
  assert.equal((await titled(lib, '[data-library-card="canvas"]', T.bridges).locator('[data-card-visibility]').innerText()).trim(), 'Public');
  // Owner, 2026-10-08: no Fork on your own cards (Duplicate is in the ⋮).
  assert.equal(await lib.locator('[data-library-card] [data-fork-button], [data-library-card] [data-card-fork]').count(), 0, 'no Fork on any own card');
  assert.equal(await card.getByRole('button', { name: /Fork/ }).count(), 0);
  // A click on the card body selects it (accent edge), never opens it; Open shows on hover and on the selected card.
  const open = card.locator('[data-card-open]');
  await lib.mouse.move(5, 5);
  assert.equal(await rgb(open, 'opacity'), '0', 'Open hides at rest');
  await card.hover();
  await lib.waitForTimeout(200);
  assert.equal(await rgb(open, 'opacity'), '1', 'Open shows on hover');
  const at = lib.url();
  await card.locator('[data-card-description]').click();
  await lib.waitForTimeout(400);
  assert.equal(lib.url(), at, 'a click on the card does not open it');
  assert.equal(await card.evaluate(n => n === document.activeElement), true, 'the clicked card is selected');
  assert.equal(await rgb(card, 'border-top-color'), ACCENT);
  await lib.mouse.move(5, 5);
  assert.equal(await rgb(open, 'opacity'), '1', 'the selected card keeps Open');
});
await check('5 the owner badge sits on the owner\'s own cards only: every Library card, and the fork names its source owner without one', async () => {
  const cards = lib.locator('[data-library-card]');
  assert.equal(await lib.locator('[data-library-card] [data-owned-badge]').count(), await cards.count());
  const forkCard = titled(lib, '[data-library-card="canvas"]', T.orbits);
  assert.ok((await forkCard.locator('[data-forked-from]').innerText()).includes(`· @${H.other}`));
  assert.equal(await forkCard.locator('[data-forked-from] [data-owner-badge]').count(), 0);
});
await check('6 the read-only fork count shows only once forked (none at 0), beside Updated <time> in the footer, the card\'s last line', async () => {
  assert.equal((await titled(lib, '[data-library-card="canvas"]', T.bridges).locator('[data-fork-count]').innerText()).trim(), '1 fork');
  assert.equal(await titled(lib, '[data-library-card="canvas"]', T.tides).locator('[data-fork-count]').count(), 0, 'no "0 forks" (owner, 2026-10-08)');
  for (const t of await lib.locator('[data-library-card="canvas"] [data-updated]').allInnerTexts()) assert.match(t.trim(), /^Updated (just now|\d+[mhd] ago|[A-Z][a-z]{2} \d+)$/);
  assert.equal(await lib.locator('[data-library-card="project"] [data-fork-count]').count(), 0, 'a project row carries no fork count');
  // "why is the updated... in the middle of the cards??" (owner, 2026-10-08): one footer line at the bottom, the count and
  // Updated side by side, as on a GitHub repository card.
  const card = titled(lib, '[data-library-card="canvas"]', T.bridges);
  const [c] = await boxes(card), [f] = await boxes(card.locator('[data-card-footer]'));
  const [n] = await boxes(card.locator('[data-fork-count]')), [u] = await boxes(card.locator('[data-updated]'));
  assert.ok(c.y + c.h - (f.y + f.h) <= 24, `the footer ends the card: card ${JSON.stringify(c)} footer ${JSON.stringify(f)}`);
  assert.ok(Math.abs(n.y + n.h / 2 - (u.y + u.h / 2)) <= 2 && u.x > n.x && u.x - (n.x + n.w) <= 16, `count ${JSON.stringify(n)} beside Updated ${JSON.stringify(u)}`);
});
await check('7 the description clamps to three lines', async () => {
  const p = titled(lib, '[data-library-card="canvas"]', T.tides).locator('[data-card-description]');
  const m = await p.evaluate(n => ({ clamp: getComputedStyle(n).webkitLineClamp, line: parseFloat(getComputedStyle(n).lineHeight), h: n.clientHeight, full: n.scrollHeight }));
  assert.equal(m.clamp, '3');
  assert.ok(m.h <= 3 * m.line + 1 && m.full > m.h, JSON.stringify(m));
});
await check('8 the truthful browser states stay on older board-less canvases: Content in this browser, and On another device with the stored-only line', async () => {
  assert.equal((await titled(lib, '[data-library-card="canvas"]', T.tides).locator('[data-card-note]').innerText()).trim(), 'Content in this browser');
  const note = (await titled(lib, '[data-library-card="canvas"]', T.away).locator('[data-card-note]').innerText()).trim();
  assert.ok(note.startsWith('On another device') && note.includes('stored only in the browser that created it'), note);
});
await check('9 the owned ⋮ is the visibility menu as built, on the new card; it opens upward when the window has no room below', async () => {
  const card = titled(lib, '[data-library-card="canvas"]', T.tides);
  await openMenu(card);
  const low = await lib.locator('[data-menu-trash]').evaluate(n => n.getBoundingClientRect().bottom <= window.innerHeight);
  assert.ok(low, 'the whole menu is inside the window');
  await lib.keyboard.press('Escape');
  await card.scrollIntoViewIfNeeded();
  await openMenu(card);
  await lib.locator('[data-menu-visibility]').click();
  assert.equal(await lib.locator('[data-access="private"]').getAttribute('aria-checked'), 'true');
  // Copy link (owner, 2026-10-08): the link that matches what the card is, said on the row itself, then the menu closes.
  await lib.keyboard.press('Escape');
  await lib.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const copyFrom = async (title) => {
    await openMenu(titled(lib, '[data-library-card="canvas"]', title));
    await lib.locator('[data-menu-copy-link]').click();
    await lib.locator('[data-menu-copy-link]', { hasText: /copied/ }).waitFor({ timeout: 5000 });
    const said = (await lib.locator('[data-menu-copy-link]').innerText()).trim(), copied = await lib.evaluate(() => navigator.clipboard.readText());
    await lib.locator('[data-menu-copy-link]').waitFor({ state: 'detached', timeout: 5000 });
    return [said, copied];
  };
  assert.deepEqual(await copyFrom(T.tides), ['Private link copied, opens only for you', `${BASE}/apps/${tides.name}`]);
  const [said, copied] = await copyFrom(T.bridges);
  assert.equal(said, 'Public link copied');
  assert.match(copied, new RegExp(`^${BASE}/e/[A-Za-z0-9_-]{20,64}$`));
  assert.equal(await lib.locator('[data-toast], [role="status"]').filter({ hasText: /copied/i }).count(), 0, 'no corner toast');
  await openMenu(card);
  await lib.locator('[data-menu-visibility]').click();
});
await shot(lib, '03-menu-visibility');
await lib.keyboard.press('Escape');
await lib.locator('[data-menu-visibility]').waitFor({ state: 'detached' });
for (const [row, name] of [['[data-menu-rename]', '04-rename'], ['[data-menu-describe]', '05-describe'], ['[data-menu-trash]', '06-trash-confirm']]) {
  await openMenu(titled(lib, '[data-library-card="canvas"]', T.tides));
  await lib.locator(row).click();
  await lib.getByRole('dialog').waitFor();
  await shot(lib, name);
  await lib.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await lib.getByRole('dialog').waitFor({ state: 'detached' });
}
await check('10 Library sort: Last updated by default, then Created, Name and Most forked; the choice is kept on reload', async () => {
  await lib.goto(`${BASE}/library?type=canvases`);
  await titled(lib, '[data-library-card]', T.tides).waitFor({ timeout: 60000 });
  const ours = [T.tides, T.bridges, T.away, T.orbits];
  const mineRows = (await api(owner, '/api/canvases')).canvases.filter(c => ours.includes(c.title));
  const expect = { updated: (x, y) => y.updated_at.localeCompare(x.updated_at) || x.name.localeCompare(y.name), created: (x, y) => y.created_at.localeCompare(x.created_at) || x.name.localeCompare(y.name),
    name: (x, y) => x.title.localeCompare(y.title, undefined, { sensitivity: 'base', numeric: true }) || x.name.localeCompare(y.name),
    forks: (x, y) => y.fork_count - x.fork_count || y.updated_at.localeCompare(x.updated_at) || x.name.localeCompare(y.name) };
  const order = sort => [...mineRows].sort(expect[sort]).map(c => c.title);
  assert.equal(await lib.locator('[data-sort-control]').getAttribute('data-sort-control'), 'updated');
  assert.deepEqual(await titlesIn(lib, '[data-library-card]', ours), order('updated'));
  assert.equal((await titlesIn(lib, '[data-library-card]', ours))[0], T.tides, 'the described canvas was the last meaningful change');
  for (const sort of ['created', 'name', 'forks']) {
    await lib.locator('[data-sort-control]').click();
    if (sort === 'forks') await shot(lib, '07-library-sort');
    await lib.locator(`[data-sort-option="${sort}"]`).click();
    assert.deepEqual(await titlesIn(lib, '[data-library-card]', ours), order(sort), sort);
  }
  assert.equal((await titlesIn(lib, '[data-library-card]', ours))[0], T.bridges, 'the forked canvas leads Most forked');
  await lib.reload();
  await titled(lib, '[data-library-card]', T.tides).waitFor({ timeout: 60000 });
  assert.equal(await lib.locator('[data-sort-control]').getAttribute('data-sort-control'), 'forks');
  assert.deepEqual(await titlesIn(lib, '[data-library-card]', ours), order('forks'));
  // Sort sits beside Filters (owner, 2026-10-08), at its height.
  const [s] = await boxes(lib.locator('[data-sort-control]')), [fl] = await boxes(lib.getByRole('button', { name: /^Filters/ }));
  assert.ok(Math.abs(s.y - fl.y) <= 1 && s.h === fl.h && s.x > fl.x && s.x - (fl.x + fl.w) <= 12, `sort ${JSON.stringify(s)} filters ${JSON.stringify(fl)}`);
  // Search by name sits just before Filters (owner, 2026-10-08) and narrows the cards by title.
  const search = lib.locator('[data-library-search]');
  const [sr] = await boxes(search);
  assert.ok(sr.x + sr.w <= fl.x && fl.x - (sr.x + sr.w) <= 12 && Math.abs(sr.y + sr.h / 2 - (fl.y + fl.h / 2)) <= 2, `search ${JSON.stringify(sr)} filters ${JSON.stringify(fl)}`);
  await search.fill(T.tides.toLowerCase());
  await lib.waitForTimeout(300);
  assert.deepEqual(await titlesIn(lib, '[data-library-card]', ours), [T.tides], 'case-insensitive, by title');
  await search.fill('');
  await lib.waitForTimeout(300);
  assert.deepEqual(await titlesIn(lib, '[data-library-card]', ours), order('forks'), 'cleared: every card again');
});
await check('11 Enter on the selected card opens the canvas, and its first open saves its board to the server', async () => {
  const card = titled(lib, '[data-library-card="canvas"]', T.tides);
  await card.locator('[data-card-description]').click();
  assert.equal(new URL(lib.url()).pathname, '/library', 'the click only selected it');
  await lib.keyboard.press('Enter');
  await lib.waitForURL(new RegExp(`/apps/${tides.name}`), { timeout: 30000 });
  for (let i = 0; !(await api(owner, `/api/learn/boards/${tides.name}/main`)).version; i++) { assert.ok(i < 50, 'the board reached the server'); await lib.waitForTimeout(400); }
});

// ---- Home ----
const home = await contextFor(owner, { legacy: [away.name] });
await home.goto(`${BASE}/apps`); // Home: bare /apps (routes.js pageFor)
await check('12 Home Continue: the canonical card, "Continue learning", where it left off, no browser note once saved, a small Continue → and no big button', async () => {
  const section = home.getByRole('region', { name: 'Continue' });
  await section.locator('[data-continue-card]').waitFor({ timeout: 60000 });
  assert.equal((await section.locator('h2').innerText()).trim(), 'Continue learning');
  const card = section.locator('[data-continue-card]');
  const text = await card.innerText();
  for (const want of [T.tides, 'Last explored: why two bulges and not one?', 'Next: Spring and neap tides', `@${H.owner}`]) assert.ok(text.includes(want), want);
  assert.ok(!text.includes('Content in this browser'), 'its board is on the server (persistence step 8)');
  for (const t of await home.locator('[data-continue-card], [data-recent-card]').allInnerTexts()) assert.ok(!t.includes('@example.'), `an email on a Home card: ${t}`);
  assert.equal(await card.getByRole('button', { name: /Continue learning/ }).count(), 0);
  const link = card.locator('[data-continue-link]');
  assert.equal((await link.innerText()).trim(), 'Continue');
  assert.equal(await rgb(link, 'background-color'), 'rgba(0, 0, 0, 0)', 'a text link, not a filled button');
  const [b] = await boxes(card);
  assert.ok(b.w >= 420 && b.w <= 500 && b.h >= 210 && b.h <= 260, JSON.stringify(b));
  assert.deepEqual(await typeWords(home.locator('[data-continue-card], [data-recent-card]')), []);
});
await check('13 Home Recent: the same card; the away canvas keeps On another device and the stored-only line, and does not open; a saved board has no note', async () => {
  const card = titled(home, '[data-recent-card]', T.away);
  const note = (await card.locator('[data-card-note]').innerText()).trim();
  assert.ok(note.startsWith('On another device') && note.includes('stored only in the browser that created it'), note);
  assert.equal(await card.locator('a[data-card-title], button[data-card-title], [data-card-open]').count(), 0);
  assert.equal(await titled(home, '[data-recent-card]', T.bridges).locator('[data-card-note]').count(), 0, 'published, so its board is on the server');
  // Recent cards carry the Library's own ⋮ (owner, 2026-10-08), opened in place.
  const recent = titled(home, '[data-recent-card]', T.bridges);
  await recent.getByTitle('More').click();
  for (const row of ['[data-menu-rename]', '[data-menu-visibility]', '[data-menu-share]', '[data-menu-copy-link]', '[data-menu-trash]']) await home.locator(row).waitFor({ timeout: 5000 });
  assert.ok(await home.locator('[data-menu-trash]').evaluate(n => n.getBoundingClientRect().bottom <= window.innerHeight), 'the menu is inside the window');
  await home.keyboard.press('Escape');
  await home.locator('[data-menu-rename]').waitFor({ state: 'detached' });
});
await shot(home, '11-home');
await check('14 the Continue title opens where it left off', async () => {
  await home.locator('[data-continue-card] [data-card-title]').click();
  await home.waitForURL(new RegExp(`/apps/${tides.name}`), { timeout: 30000 });
});
await check('14b Home Continue on a project: Content in this browser until its Learn board is on the server (board_saved), then none', async () => {
  const page = await contextFor(owner, { project: true }); // the project row is the browser-side one above; the server field is unit-tested
  await page.context().addInitScript(([name, chat]) => { localStorage.setItem('small.recent', JSON.stringify([name])); localStorage.setItem(chat, JSON.stringify([{ id: 'p1', question: 'how does the training loop batch?' }])); }, [PROJECT.name, `${keyOf(PROJECT.name)}:chat`]);
  const continued = async () => {
    await page.goto(`${BASE}/apps`);
    const card = titled(page, '[data-continue-card]', 'nanoGPT');
    await card.waitFor({ timeout: 60000 });
    const text = await card.innerText();
    assert.ok(text.includes('Last explored: how does the training loop batch?'), text);
    return text;
  };
  assert.ok((await continued()).includes('Content in this browser'), 'its Learn board is not on the server');
  PROJECT.board_saved = true;
  assert.ok(!(await continued()).includes('Content in this browser'), 'its Learn board is on the server');
  await page.context().close();
});

// ---- Explore ----
const ours = [T.bridges, T.orbits, T.prisms];
const exploreOf = async page => { await page.goto(`${BASE}/explore`); await page.locator('[data-explore-card]').first().waitFor({ timeout: 60000 }); };
const ex = await contextFor(owner);
await exploreOf(ex);
await check('15 Explore, as the owner: own card badged, no Start/Fork, its read-only count; others\' cards: blue Start Rabbit Hole and one soft [Fork | N] whose dialog cancels in place', async () => {
  const mine = titled(ex, '[data-explore-card]', T.bridges), theirs = titled(ex, '[data-explore-card]', T.orbits), prisms = titled(ex, '[data-explore-card]', T.prisms);
  assert.equal(await mine.locator('[data-owned-badge]').count(), 1);
  assert.equal(await mine.locator('[data-card-start-rabbit-hole], [data-fork-button]').count(), 0);
  assert.equal((await mine.locator('[data-fork-count]').innerText()).trim(), '1 fork', 'your own card: the read-only count, once forked');
  assert.equal(await theirs.locator('[data-owner-badge]').count(), 0);
  assert.equal((await theirs.locator('[data-creator]').innerText()).trim(), `@${H.other}`);
  assert.equal(await rgb(theirs.locator('[data-card-start-rabbit-hole]'), 'background-color'), ACCENT);
  // "make the fork button more visible on the cards" and "the fork button should itself have the counts like github"
  // (owner, 2026-10-08): the soft accent fill, the count inside, 0 included, and no second count in the footer.
  const forkBg = await rgb(theirs.locator('[data-fork-button]'), 'background-color');
  assert.ok(forkBg !== 'rgb(255, 255, 255)' && forkBg !== ACCENT && forkBg !== 'rgba(0, 0, 0, 0)', `soft, below the primary: ${forkBg}`);
  assert.equal((await theirs.locator('[data-fork-button] [data-fork-count-value]').innerText()).trim(), '1');
  assert.equal(await theirs.locator('[data-fork-button]').getAttribute('aria-label'), 'Fork, 1 fork');
  assert.equal((await prisms.locator('[data-fork-button] [data-fork-count-value]').innerText()).trim(), '0');
  assert.equal(await ex.locator('[data-explore-card] [data-fork-button]').count(), await ex.locator('[data-explore-card] [data-card-start-rabbit-hole]').count(), 'one Fork per others\' card');
  assert.equal(await theirs.locator('[data-fork-count]').count() + await prisms.locator('[data-fork-count]').count(), 0, 'no "N forks" beside the button');
  assert.equal((await theirs.locator('[data-card-visibility]').innerText()).trim(), 'Public');
  // Fork asks first, in place: "Fork this canvas", prefilled; Cancel stays on Explore with nothing made.
  const before = (await api(owner, '/api/canvases')).canvases.length;
  await theirs.locator('[data-fork-button]').click();
  const dialog = ex.getByRole('dialog', { name: 'Fork this canvas' });
  await dialog.waitFor({ timeout: 10000 });
  assert.equal(await dialog.getByRole('textbox', { name: 'Name' }).inputValue(), T.orbits);
  await shot(ex, '08b-explore-fork-dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(new URL(ex.url()).pathname, '/explore');
  assert.equal((await api(owner, '/api/canvases')).canvases.length, before, 'Cancel forks nothing');
  // The actions row sits above the footer: Updated is the card's last line, never mid-card.
  const [start] = await boxes(theirs.locator('[data-card-start-rabbit-hole]')), [foot] = await boxes(theirs.locator('[data-card-footer]'));
  assert.ok(foot.y > start.y + start.h - 1, `footer ${JSON.stringify(foot)} under the actions ${JSON.stringify(start)}`);
  assert.deepEqual(await typeWords(ex.locator('[data-explore-card]')), []);
  const all = await boxes(ex.locator('[data-explore-card]'));
  for (const b of all) assert.ok(b.w >= 420 && b.w <= 500 && b.h >= 210 && b.h <= 260, JSON.stringify(b));
  assert.equal(new Set(all.map(b => b.x)).size, 2);
});
await shot(ex, '08-explore-owner');
await check('16 the Explore sort control orders the cards as the server does: Newest (default), Recently updated, Most forked', async () => {
  const seen = {};
  assert.equal(await ex.locator('[data-sort-control]').getAttribute('data-sort-control'), 'newest');
  for (const sort of ['newest', 'updated', 'forks']) {
    if (sort !== 'newest') {
      await ex.locator('[data-sort-control]').click();
      if (sort === 'forks') await shot(ex, '09-explore-sort');
      const answer = ex.waitForResponse(r => r.url().includes(`/api/learn/boards/published?sort=${sort}`));
      await ex.locator(`[data-sort-option="${sort}"]`).click();
      await answer; await ex.waitForTimeout(300);
    }
    const server = (await published(sort)).map(c => c.title).filter(t => ours.includes(t));
    seen[sort] = await titlesIn(ex, '[data-explore-card]', ours);
    assert.deepEqual(seen[sort], server, sort);
  }
  assert.deepEqual(seen.newest, [T.prisms, T.orbits, T.bridges]);
  assert.equal(seen.updated[0], T.orbits, 'the canvas edited last leads Recently updated');
  assert.notDeepEqual(seen.forks, seen.newest);
  assert.notDeepEqual(seen.updated, seen.newest);
});
const viewer = await contextFor(other);
await exploreOf(viewer);
await check('17 Explore, as the other person: the badge moves to their own cards, Start/Fork to the owner\'s', async () => {
  assert.equal(await titled(viewer, '[data-explore-card]', T.orbits).locator('[data-owned-badge]').count(), 1);
  assert.equal(await titled(viewer, '[data-explore-card]', T.bridges).locator('[data-owner-badge]').count(), 0);
  assert.equal(await titled(viewer, '[data-explore-card]', T.bridges).locator('[data-card-start-rabbit-hole]').count(), 1);
});
await shot(viewer, '10-explore-other');
await check('18 an Explore card\'s title opens its published canvas', async () => {
  const href = await titled(viewer, '[data-explore-card]', T.bridges).locator('[data-card-title]').getAttribute('href');
  assert.match(href, /^\/e\/[A-Za-z0-9_-]{20,64}$/);
  await titled(viewer, '[data-explore-card]', T.bridges).locator('[data-card-title]').click();
  await viewer.waitForURL(new RegExp(`${href}$`), { timeout: 30000 });
});
await check('19 no page errors, and no email on any card', async () => {
  assert.deepEqual(errors, []);
  for (const t of await ex.locator('[data-explore-card]').allInnerTexts()) assert.ok(!t.includes('@example.'), `an email on an Explore card: ${t}`);
});

await browser.close();
console.log(`\n${results.length}/20 checks passed`);
process.exit(results.length === 20 ? 0 : 1);
