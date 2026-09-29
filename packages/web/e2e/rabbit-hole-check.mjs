// packages/web/e2e/rabbit-hole-check.mjs
// Rabbit Hole checks against this worktree's dev clone (T02 spec; brief §21 journeys).
// ONE harness for every area: each area inserts its block above the marker line near the end,
// wrapped in { } so helper names never collide. Blocks declare nothing at top level and never
// call browser.close(): the harness closes once, below the marker. D7: nothing here shares,
// renames, trashes or runs an app; a check that creates a canvas deletes it again. From packages/web:
//   SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env node e2e/rabbit-hole-check.mjs
// ONLY=build,J15 runs only labels that start with those prefixes. SHOTS=1 also saves screenshots.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const base = process.env.SMALL_BASE || '';
// A per-session clone only, never the shared small-cp-dev (docs/features/parallel-dev-deploys.md).
if (!/^https:[/][/]small-cp-dev-[a-z0-9-]+[.]zeroshothq[.]workers[.]dev$/.test(base)) throw new Error('SMALL_BASE must be your clone, e.g. https://small-cp-dev-smart-home.zeroshothq.workers.dev');
const env = parseEnv(readFileSync(process.env.SMALL_ENV_FILE || new URL('../../../.env', import.meta.url), 'utf8'));
if (!env.SMALL_TEST_BYPASS) throw new Error('SMALL_TEST_BYPASS missing from the env file');
const UA = { 'User-Agent': 'small-rabbit-hole-check' }; // Cloudflare 1010 refuses default script agents
const email = 'yudhisteer.chin@gmail.com';
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email, secret: env.SMALL_TEST_BYPASS }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();
const catalogResponse = await fetch(`${base}/api/apps`, { headers: { ...UA, Cookie: `small_session=${session}` } });
if (!catalogResponse.ok) throw new Error(`/api/apps: HTTP ${catalogResponse.status}`);
const data = await catalogResponse.json(); // { org, orgName, email, apps }
const apps = data.apps || [];
// nanoGPT is the journeys' project; a newer test repository (octocat/Hello-World) must not displace it.
const repo = apps.find((a) => a.kind === 'repository' && /^karpathy\/nanogpt$/i.test(a.repo || '')) || apps.find((a) => a.kind === 'repository');
const plain = apps.find((a) => a.kind === 'job' || a.kind === 'server');
// api.js:4, copied: api.js is not imported because it pulls the OIDC client in through private-auth.js.
const wsName = (org) => ((org || '').split('-')[0] || org || '').replace(/^./, (c) => c.toUpperCase());
const wsLabel = data.orgName || wsName(data.org);
console.log(`${base} · ${wsLabel} · ${apps.length} resources · project ${repo?.name || 'none'} · app ${plain?.name || 'none'}`);

const only = (process.env.ONLY || '').split(',').filter(Boolean);
const failures = [];
const check = async (label, fn) => {
  if (only.length && !only.some((p) => label.startsWith(p))) return;
  try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} - ${e.message.split('\n')[0]}`); }
};
const must = (cond, message) => { if (!cond) throw new Error(message); };

const browser = await chromium.launch();
// A fresh context per check: clean storage, nothing leaks between checks.
const open = async (viewport = { width: 1500, height: 950 }) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  return page;
};
// Loaded = the sidebar names this workspace (sr-only in the collapsed rail), so Shell has the catalog.
// 'attached' because the sidebar is display:none below md unless its drawer is open.
const loaded = async (page, path = '/apps') => {
  await page.goto(`${base}${path}`);
  await page.locator('aside').getByText(wsLabel, { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 });
};
// In-app navigation exactly as navigate() does it (api.js:31-34).
const spa = (page, to) => page.evaluate((url) => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); }, to);
// Shared locators, so every appended block means the same element by them.
const settings = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const startDialog = (page) => page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true });
const openStart = async (page, path, at = '/apps') => {
  await loaded(page, at);
  await page.evaluate((p) => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: p } })), path);
  await startDialog(page).waitFor({ timeout: 10000 });
};
const barOf = (page) => page.locator('[data-agent-bar]');
const barInput = (page) => barOf(page).locator('[data-chat-composer] :is(input, textarea)');

// T12: the browser must run the bundle just built. A new version serves 15-20 s after
// wrangler returns, so poll for a minute before calling it stale.
await check('build: the browser runs the dist-dev entry script', async () => {
  const built = readFileSync(new URL('../dist-dev/index.html', import.meta.url), 'utf8').match(/[/]static[/]index-[A-Za-z0-9_-]+[.]js/)?.[0];
  must(built, 'no entry script in dist-dev/index.html; build first');
  const page = await open();
  let served;
  for (let i = 0; i < 12 && served !== built; i++) {
    if (i) await page.waitForTimeout(5000);
    await page.goto(`${base}/apps`);
    served = await page.evaluate(() => [...document.scripts].map((s) => s.src && new URL(s.src).pathname).find((p) => p?.startsWith('/static/index-')));
  }
  must(served === built, `built ${built}, the browser loaded ${served}`);
  await page.context().close();
});

// ── shell-home (T02 §1-4, §8.3-8.4, §11): routes, Home, Explore, Library, Sidebar ──
{
  await check('sh-title: the preview is titled Rabbit Hole and serves /library without a redirect (T02 §1)', async () => {
    const page = await open();
    await loaded(page, '/apps');
    must(await page.title() === 'Rabbit Hole', `title is ${await page.title()}`);
    await loaded(page, '/library');
    must(new URL(page.url()).pathname === '/library', `/library became ${new URL(page.url()).pathname}`);
    await page.context().close();
  });

  // Test canvases go to LEARN_DB (small-learn-dev) only, and each check deletes its own (D7).
  const shApi = (page, path, method = 'GET', body) => page.evaluate(async ([path, method, body]) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [path, method, body]);
  const shCanvas = async (page, title, device_id) => {
    const r = await shApi(page, '/api/canvases', 'POST', { title, ...(device_id ? { device_id } : {}) });
    must(r.status === 201, `create canvas: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };
  const shDrop = async (page, name) => {
    const r = await shApi(page, `/api/apps/${name}`, 'DELETE');
    must(r.status < 300, `delete ${name}: HTTP ${r.status}; remove it from small-learn-dev by hand`);
  };
  const shStart = (page) => page.getByRole('button', { name: 'Start a rabbit hole', exact: true });
  const shH1 = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });
  // The Library's one Filters control (Type, Ownership); its options are menu buttons by label.
  const filterBy = async (page, label) => {
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
  };

  await check('sh-routes: /apps and /dash are Home, /library and ?s= are the Library, the title is Rabbit Hole', async () => {
    const page = await open();
    for (const path of ['/apps', '/dash']) {
      await page.goto(`${base}${path}`);
      await shStart(page).waitFor({ timeout: 20000 });
    }
    must(await page.title() === 'Rabbit Hole', `title is ${await page.title()}`);
    for (const path of ['/library', '/apps?s=shared']) {
      await page.goto(`${base}${path}`);
      await shH1(page, 'Library').waitFor({ timeout: 20000 });
    }
    await page.getByRole('button', { name: 'Remove filter Shared with me' }).waitFor({ timeout: 10000 });
    await page.context().close();
  });

  await check('sh-home: one primary Start opens the Start dialog; Continue and Recent read this browser', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    await shStart(page).waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check home');
    try {
      const key = `small.adaptive-canvas:${c.org}:${c.email}:${c.name}`;
      await page.evaluate(([key, name]) => {
        localStorage.setItem('small.recent', JSON.stringify([name]));
        localStorage.setItem(`${key}:chat`, JSON.stringify([{ id: '1', question: 'why sqrt(dk)?' }]));
        localStorage.setItem(`${key}:ink`, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [
          { id: 'a', type: 'heading', level: 1, text: 'Tokens', done: true }, { id: 'b', type: 'heading', level: 1, text: 'Masked self-attention' }] }));
      }, [key, c.name]);
      await page.reload();
      const cont = page.getByRole('region', { name: 'Continue' });
      await cont.waitFor({ timeout: 20000 });
      const text = await cont.innerText();
      for (const want of ['rabbit-hole-check home', 'Last explored: why sqrt(dk)?', 'Next: Masked self-attention']) must(text.includes(want), `Continue lacks ${want}: ${text}`);
      await cont.getByRole('button', { name: 'Continue learning' }).waitFor();
      must((await page.getByRole('region', { name: 'Recent' }).innerText()).includes('Content in this browser'), 'Recent canvas card lacks Content in this browser');
      // Gate B F1: Recent is a gallery of compact bordered cards, not full-width list rows.
      const card = page.getByRole('region', { name: 'Recent' }).locator('[data-recent-card]').first();
      const box = await card.boundingBox(), border = await card.evaluate((n) => getComputedStyle(n).borderTopWidth);
      must(box && box.width < 400 && box.height < 160, `Recent card is ${box?.width}x${box?.height}, not a compact card`);
      must(border === '1px', `Recent card border ${border}`);
      await shStart(page).click(); // strict locator: exactly one primary Start on Home (T02 §3.3)
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('sh-explore: demo data behind a banner; Save stays in small.preview storage; no mutating API', async () => {
    const page = await open();
    const writes = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${u.pathname}`); });
    await page.goto(`${base}/explore`);
    await page.getByRole('note').filter({ hasText: 'Demo data — changes stay in this preview' }).waitFor({ timeout: 20000 });
    await shH1(page, 'Explore').waitFor();
    must(await page.getByText('Discover rabbit holes, projects, and learning resources shared beyond your library.', { exact: true }).count() === 1, 'Explore has no purpose sentence');
    // Discovery cards in a grid, never the Library's list rows.
    const xs = await page.locator('[data-explore-card]').evaluateAll((ns) => ns.map((n) => [n.getBoundingClientRect().x, getComputedStyle(n).borderTopWidth]));
    must(xs.length >= 3 && new Set(xs.map(([x]) => Math.round(x))).size >= 2 && xs.every(([, b]) => b === '1px'), `Explore cards: ${JSON.stringify(xs)}`);
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor({ timeout: 20000 });
    const stored = await page.evaluate(() => localStorage.getItem('small.preview:explore-saved'));
    must(JSON.parse(stored || '[]').length === 1, `small.preview:explore-saved is ${stored}`);
    must(!writes.length, `mutating calls: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('sh-library: the Filters control filters type and ownership; Canvases are cards without ops columns; a canvas on another device is flagged; an empty view offers Start', async () => {
    const page = await open();
    await page.goto(`${base}/library`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check library', 'rabbit-hole-check-device');
    try {
      await page.reload();
      await filterBy(page, 'Canvases');
      await page.waitForURL(/[?&]type=canvases/);
      const row = page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check library' });
      await row.waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Remove filter Canvases' }).waitFor();
      must(await page.locator('table').count() === 0, 'Canvases still render a table');
      for (const ops of ['Watch', 'Deployed', 'Last run']) must(!(await row.innerText()).includes(ops), `${ops} shown on a canvas card`);
      must((await row.innerText()).includes('On another device'), 'canvas card lacks On another device');
      must(await row.locator('svg.lucide-pen-line').count() === 1, 'canvas card lacks the canvas icon');
      await filterBy(page, 'Mine');
      await page.waitForURL(/[?&]s=private/);
      await row.waitFor();
      await page.goto(`${base}/library?type=canvases&s=shared`); // canvases are owner-only, so this view is always empty
      await page.getByText('Nothing here yet', { exact: true }).waitFor({ timeout: 20000 });
      await shStart(page).click();
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  // WP5 sidebar shell (user 2026-09-28): the Library owns browsing, so the Apps tree, Shared, Private,
  // Recent, New chat and + New are gone; pinning moved to the Library card menu.
  await check('sh-sidebar: workspace, Home, Library, Explore, Pinned, Members and Trash only; a canvas pinned from its Library card keeps a learn-safe menu', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.waitFor({ timeout: 20000 });
    must(await nav.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    const aside = page.locator('aside');
    for (const name of ['Search', 'Notifications', 'Members', 'Trash']) must(await aside.getByRole('button', { name, exact: true }).count() === 1, `the sidebar lacks ${name}`);
    for (const name of ['Apps', 'Shared', 'Private', 'New', 'New folder', 'Expand Apps', 'Expand Shared', 'Expand Private']) must(await aside.getByRole('button', { name, exact: true }).count() === 0, `the sidebar still offers ${name}`);
    must(await aside.getByRole('button', { name: /^New chat/ }).count() === 0, 'the sidebar still offers New chat');
    must(await aside.getByText('Recent', { exact: true }).count() === 0, 'the sidebar still shows Recent');
    const c = await shCanvas(page, 'rabbit-hole-check pin');
    try {
      await page.reload();
      await nav.getByRole('button', { name: 'Library', exact: true }).click();
      await page.waitForURL(/\/library$/);
      must(await nav.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-current') === 'page', 'Library is not current on /library');
      await filterBy(page, 'Canvases');
      await page.waitForURL(/[?&]type=canvases/);
      await page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check pin' }).getByTitle('More').click();
      await page.getByRole('button', { name: 'Pin', exact: true }).click();
      const pinned = aside.getByRole('region', { name: 'Pinned' });
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 10000 });
      must(await pinned.locator('svg.lucide-pen-line').count() === 1, 'the pinned canvas lacks its icon');
      await page.reload();
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 20000 });
      const row = pinned.locator('.group\\/r').filter({ hasText: 'rabbit-hole-check pin' });
      await row.hover();
      await row.getByTitle('More').click();
      must(await row.getByRole('button', { name: 'Share' }).isDisabled(), 'Share is enabled on a pinned canvas');
      for (const name of ['Rename', 'Duplicate', 'Move to Trash']) must(await row.getByRole('button', { name }).count() === 0, `${name} is offered on a pinned canvas`);
      await row.getByRole('button', { name: 'Unpin', exact: true }).click();
      await pinned.waitFor({ state: 'detached', timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('sh-rail: Ctrl+\\ collapses to a 48-56px icon rail with labelled workspace, Home, Library, Explore, Members and Trash; the current page is marked; the tile opens the workspace menu; Ctrl+\\ restores', async () => {
    const page = await open();
    await loaded(page, '/apps');
    const sidebar = page.locator('[data-shell-sidebar]');
    const aside = page.locator('aside');
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    const w = (await sidebar.boundingBox()).width;
    must(w >= 48 && w <= 56, `the rail is ${w}px wide`);
    for (const name of [wsLabel, 'Home', 'Library', 'Explore', 'Members', 'Trash', 'Open sidebar']) {
      const b = aside.getByRole('button', { name, exact: true });
      must(await b.count() === 1 && await b.getAttribute('title') === name, `the rail's ${name} button lacks its label or tooltip`);
    }
    must(await aside.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    await aside.getByRole('button', { name: wsLabel, exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 5000 });
    await page.mouse.click(26, 500); // the rail's empty middle closes the menu
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'detached', timeout: 5000 });
    const app = plain || repo;
    if (app) {
      await loaded(page, `/apps/${app.name}`);
      must(await aside.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-current') === 'page', 'Library is not current on an app page');
    }
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    must((await sidebar.boundingBox()).width > 150, 'Ctrl+\\ did not restore the sidebar');
    await page.context().close();
  });

  await check('sh-drawer: at 390px no rail; Open sidebar opens a drawer inside the viewport; Library navigates and closes it; Esc and the backdrop close it', async () => {
    const page = await open({ width: 390, height: 844 });
    await loaded(page, '/apps');
    await page.evaluate(() => localStorage.setItem('small.sidebar', 'closed')); // collapsed on a desktop is still no rail here
    await loaded(page, '/apps');
    const aside = page.locator('aside');
    must(!(await aside.isVisible()), 'a sidebar or rail shows at 390px');
    const openDrawer = async () => {
      await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
      await aside.waitFor({ state: 'visible', timeout: 5000 });
    };
    await openDrawer();
    const box = await aside.boundingBox();
    must(box.x >= 0 && box.x + box.width <= 390, `the drawer spans ${box.x} to ${box.x + box.width}px`);
    must(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, 'the drawer scrolls the page sideways');
    const library = aside.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Library', exact: true });
    await library.click();
    await page.waitForURL(/\/library$/);
    await aside.waitFor({ state: 'hidden', timeout: 5000 });
    await openDrawer();
    await page.keyboard.press('Escape');
    await aside.waitFor({ state: 'hidden', timeout: 5000 });
    await openDrawer();
    await page.locator('[data-shell-backdrop]').click({ position: { x: 370, y: 400 } });
    await aside.waitFor({ state: 'hidden', timeout: 5000 });
    await page.context().close();
  });

  await check('sh-legacy: Ctrl+O focuses the bar and keeps the URL; Filters -> Apps and Mine replace the Apps and Private sections', async () => {
    const page = await open();
    await loaded(page, '/library');
    await barOf(page).waitFor({ timeout: 20000 });
    await page.keyboard.press('Control+o');
    must(await barInput(page).evaluate((el) => el === document.activeElement), 'Ctrl+O did not focus the bar');
    must(new URL(page.url()).pathname === '/library', `Ctrl+O went to ${page.url()}`);
    await filterBy(page, 'Apps');
    await page.waitForURL(/[?&]type=apps/);
    await filterBy(page, 'Mine');
    await page.waitForURL(/[?&]s=private/);
    await page.getByRole('button', { name: 'Remove filter Apps' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Remove filter Mine' }).waitFor();
    await page.context().close();
  });

  await check('sh-library: Archive from a canvas card menu with confirmation; Archived lists it; Restore brings it back (T02 §8.4)', async () => {
    const page = await open();
    await page.goto(`${base}/library?type=canvases`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check archive', 'rabbit-hole-check-device');
    try {
      await page.reload();
      const row = page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check archive' });
      await row.getByTitle('More').click();
      await page.getByRole('button', { name: 'Archive…' }).click();
      await page.getByRole('dialog', { name: 'Archive rabbit-hole-check archive?' }).getByRole('button', { name: 'Archive', exact: true }).click();
      await row.waitFor({ state: 'detached', timeout: 20000 });
      await filterBy(page, 'Archived canvases');
      const item = page.getByRole('list', { name: 'Archived canvases' }).getByRole('listitem').filter({ hasText: 'rabbit-hole-check archive' });
      await item.getByRole('button', { name: 'Restore' }).click();
      await item.waitFor({ state: 'detached', timeout: 20000 });
      await filterBy(page, 'Archived canvases');
      await row.waitFor({ timeout: 20000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('sh-shots: Home, Library and Explore in light, dark and at 390px, with no sideways scroll', async () => {
    const ready = { '/apps': (p) => shStart(p), '/library': (p) => shH1(p, 'Library'), '/explore': (p) => shH1(p, 'Explore') };
    for (const [look, viewport, colorScheme] of [['light', undefined, 'light'], ['dark', undefined, 'dark'], ['narrow', { width: 390, height: 844 }, 'light']]) {
      const page = await open(viewport);
      await page.emulateMedia({ colorScheme });
      for (const [path, wait] of Object.entries(ready)) {
        await loaded(page, path); // the workspace has loaded, so no skeleton rows or placeholder names
        await wait(page).waitFor({ timeout: 20000 });
        await page.locator('.skel, [data-skeleton]').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `e2e/shots/sh-${path.slice(1)}-${look}.png`, fullPage: true });
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        must(wide <= 0, `${path} (${look}) scrolls sideways by ${wide}px`);
        // At phone width the cards stack: one column, each as wide as the column.
        if (look === 'narrow') {
          const xs = await page.locator('[data-recent-card], [data-explore-card]').evaluateAll((ns) => ns.map((n) => Math.round(n.getBoundingClientRect().x)));
          must(new Set(xs).size <= 1, `${path} cards do not stack at 390px: x=${xs}`);
        }
      }
      await page.context().close();
    }
  });

  // WP4 Library correction (user 2026-09-28): learning first, operations contextual.
  const opacityOf = (locator) => locator.evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).opacity)));
  await check('library: All shows Projects and Canvases as cards above Apps as compact rows; no Run at rest; Start a rabbit hole is the only header action', async () => {
    const page = await open();
    await loaded(page, '/library');
    const c = await shCanvas(page, 'rabbit-hole-check library all');
    try {
      await page.reload();
      const region = (name) => page.getByRole('region', { name, exact: true });
      await region('Projects').locator('[data-library-card="project"]').first().waitFor({ timeout: 20000 });
      await region('Canvases').locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check library all' }).waitFor();
      const ys = [];
      for (const name of ['Projects', 'Canvases', 'Apps']) ys.push((await region(name).boundingBox()).y);
      must(ys[0] < ys[1] && ys[1] < ys[2], `sections out of order: ${ys}`);
      must(await page.locator('table').count() === 0, 'All renders a table');
      must(await region('Apps').locator('[data-library-app-row]').count() > 0, 'Apps are not compact rows');
      must((await opacityOf(page.locator('main').getByRole('button', { name: 'Run', exact: true }))).every((o) => o === 0), 'Run buttons show at rest');
      must(await page.getByRole('button', { name: 'Import repository' }).count() === 0, 'Import repository is still the CTA');
      await shStart(page).click(); // strict: exactly one Start a rabbit hole on the page
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  if (apps.filter((a) => a.kind === 'job' || a.kind === 'server').length > 6) await check('library: a long section shows six and View all opens its view', async () => {
    const page = await open();
    await loaded(page, '/library');
    const section = page.getByRole('region', { name: 'Apps', exact: true });
    await section.locator('[data-library-app-row]').first().waitFor({ timeout: 20000 });
    must(await section.locator('[data-library-app-row]').count() === 6, 'not six app rows');
    await section.getByRole('button', { name: /^View all/ }).click();
    await page.waitForURL(/[?&]type=apps/);
    await page.locator('tbody tr').first().waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (repo) await check('library: Projects is a card grid; the card opens the project; its menu offers Learn and Map', async () => {
    const page = await open();
    await loaded(page, '/library?type=projects');
    const card = page.locator('[data-library-card="project"]').filter({ hasText: repo.repo });
    await card.waitFor({ timeout: 20000 });
    must(await page.locator('table').count() === 0, 'Projects renders a table');
    for (const ops of ['Deployed', 'Last run', 'Watch']) must(!(await card.innerText()).includes(ops), `${ops} on a project card`);
    await card.getByTitle('More').click();
    for (const name of ['Learn', 'Map']) await page.getByRole('button', { name, exact: true }).waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await card.locator('[data-card-title]').click();
    await page.waitForURL(`**/apps/${repo.name}`, { timeout: 10000 });
    await page.context().close();
  });

  const job = apps.find((a) => a.kind === 'job'), server = apps.find((a) => a.kind === 'server');
  if (job) await check('library: Apps is the operational table with Deployed and Last run; Run only on jobs, shown on row hover', async () => {
    const page = await open();
    await loaded(page, '/library?type=apps');
    await page.locator('tbody tr').first().waitFor({ timeout: 20000 });
    const heads = (await page.locator('thead th').allInnerTexts()).join('|');
    for (const col of ['Deployed', 'Last run']) must(heads.includes(col), `no ${col} column: ${heads}`);
    const row = page.locator('tbody tr').filter({ hasText: job.name }).first();
    const run = row.getByRole('button', { name: 'Run', exact: true });
    must((await opacityOf(run))[0] === 0, 'Run shows at rest');
    await row.hover();
    await page.waitForTimeout(250);
    must((await opacityOf(run))[0] === 1, 'Run does not show on hover');
    if (server) must(await page.locator('tbody tr').filter({ hasText: server.name }).first().getByRole('button', { name: 'Run', exact: true }).count() === 0, 'a server offers Run');
    await page.context().close();
  });

  await check('library: on a touch tablet (no hover) the card menu and the Recent action are visible', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
    const page = await context.newPage();
    await loaded(page, '/library?type=canvases');
    const c = await shCanvas(page, 'rabbit-hole-check touch');
    try {
      await page.evaluate((name) => localStorage.setItem('small.recent', JSON.stringify([name])), c.name);
      await page.reload();
      const more = page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check touch' }).getByTitle('More');
      await more.waitFor({ timeout: 20000 });
      must((await opacityOf(more))[0] === 1, 'the canvas card menu is invisible without hover');
      await loaded(page, '/apps');
      const action = page.locator('[data-recent-card]').first().getByRole('button');
      await action.waitFor({ timeout: 20000 });
      must((await opacityOf(action))[0] === 1, 'the Recent card action is invisible without hover');
    } finally {
      await shDrop(page, c.name);
      await context.close();
    }
  });

  // Provenance review fixtures (user 2026-09-28): preview only, off by default, never sent anywhere.
  await check('provenance: ?fixtures=1 shows the source-owner check, Forked from and fork counts on Home and the Library; nothing is written; ?fixtures=0 and a fresh browser show none', async () => {
    const page = await open();
    const writes = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${u.pathname}`); });
    await loaded(page, '/library');
    must(await page.locator('[data-library-card]').filter({ hasText: 'nanoGPT from First Principles' }).count() === 0, 'fixtures show without ?fixtures=1');
    await loaded(page, '/library?fixtures=1');
    await page.getByRole('note').filter({ hasText: 'Review fixtures are on' }).waitFor({ timeout: 20000 });
    const card = (title) => page.locator('[data-library-card]').filter({ hasText: title }).first();
    const check = 'Created by repository owner';
    const original = card('nanoGPT from First Principles');
    await original.waitFor({ timeout: 20000 });
    must(await original.locator('[data-creator]').getByRole('img', { name: check }).count() === 1, 'the original project lacks the source-owner check');
    must((await original.locator('[data-fork-count]').innerText()).trim() === '84 forks', 'original fork count');
    const fork = card('My Attention Deep Dive');
    must(await fork.locator('[data-creator]').getByRole('img', { name: check }).count() === 0, 'the forking user got the check');
    const from = await fork.locator('[data-forked-from]').innerText();
    must(/Forked from nanoGPT from First Principles · Yudhisteer/.test(from), `provenance reads ${from}`);
    must(await fork.locator('[data-forked-from]').getByRole('img', { name: check }).count() === 1, 'the original creator lost the check in the provenance');
    must((await fork.locator('[data-fork-count]').innerText()).trim() === '12 forks', 'fork count');
    const plain = card('Why B-trees stay shallow');
    must(await plain.getByRole('img', { name: check }).count() === 0 && await plain.locator('[data-fork-count]').count() === 0, 'a standalone canvas shows a check or 0 forks');
    must(await card('nanoGPT speedrun notes').locator('[data-creator]').getByRole('img', { name: check }).count() === 0, 'a matching display name got the check');
    must((await card('Attention Is All You Need, Line by Line').locator('[data-fork-count]').innerText()).trim() === '1.2k forks', 'compact fork count');
    const app = page.getByRole('region', { name: 'Apps', exact: true }).locator('[data-library-app-row]').filter({ hasText: 'fixture-nightly-eval' });
    await app.hover();
    await app.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('Review fixture: there is nothing behind this card.').waitFor({ timeout: 5000 });
    must(await page.locator('[data-library-card]').getByRole('button', { name: 'Run', exact: true }).count() === 0, 'a learning card offers Run');
    await loaded(page, '/apps');
    const recent = page.getByRole('region', { name: 'Recent' });
    const recentCard = (title) => recent.locator('[data-recent-card]').filter({ has: page.getByText(title, { exact: true }) }).first();
    await recentCard('nanoGPT from First Principles').getByRole('img', { name: check }).first().waitFor({ timeout: 20000 });
    must((await recentCard('My Attention Deep Dive').locator('[data-forked-from]').innerText()).includes('Forked from nanoGPT from First Principles'), 'Home fork card lacks its provenance');
    await loaded(page, '/library?fixtures=0');
    await page.locator('[data-library-card]').first().waitFor({ timeout: 20000 });
    must(await page.locator('[data-library-card]').filter({ hasText: 'nanoGPT from First Principles' }).count() === 0, '?fixtures=0 left fixtures on');
    must(!writes.length, `fixtures wrote: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('provenance-links: a solid Source owner badge; the GitHub line opens GitHub in a new tab without opening the card; Forked from opens the original', async () => {
    const page = await open();
    await page.context().route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>github stub</title>' }));
    await loaded(page, '/library?type=projects&fixtures=1');
    const card = page.locator('[data-library-card]').filter({ hasText: 'minbpe, Explained' }).first();
    await card.waitFor({ timeout: 20000 });
    const badge = card.locator('[data-creator] [data-owner-badge]');
    must(await badge.getAttribute('aria-label') === 'Created by repository owner', 'badge label');
    must(await badge.locator('path').first().evaluate((n) => getComputedStyle(n).fill) === 'rgb(35, 131, 226)', 'the badge is not solid blue');
    const link = card.getByRole('link', { name: 'github.com/karpathy/minbpe' });
    must(await link.getAttribute('href') === 'https://github.com/karpathy/minbpe' && await link.getAttribute('target') === '_blank', 'GitHub link target');
    await link.focus();
    must(await link.evaluate((n) => { const c = getComputedStyle(n); return c.textDecorationLine.includes('underline') && c.backgroundColor !== 'rgba(0, 0, 0, 0)'; }), 'no visible focus on the GitHub link');
    const popup = page.waitForEvent('popup');
    await link.click();
    must((await popup).url() === 'https://github.com/karpathy/minbpe', 'the link did not open GitHub');
    await page.waitForTimeout(500);
    must(await page.getByText('Review fixture: there is nothing behind this card.').count() === 0, 'the link click also opened the card');
    await loaded(page, '/library?type=canvases');
    const fork = page.locator('[data-library-card]').filter({ hasText: 'My Attention Deep Dive' }).first();
    must(await fork.locator('[data-forked-from] [data-owner-badge]').count() === 1, 'the original owner has no badge in Forked from');
    await fork.locator('[data-forked-from]').getByRole('button', { name: 'nanoGPT from First Principles' }).click();
    await page.getByText('Review fixture: there is nothing behind this card.').waitFor({ timeout: 5000 }); // a fixture's original has no page
    await page.context().close();
  });

  await check('library: one Filters control, no permanent tabs; the popover, View all and the Agent Bar set the same state', async () => {
    const page = await open();
    await loaded(page, '/library');
    await page.getByRole('region', { name: 'Projects', exact: true }).waitFor({ timeout: 20000 });
    must(await page.locator('main button[aria-pressed]').count() === 0, 'permanent filter tabs are back');
    await filterBy(page, 'Canvases');
    await page.waitForURL(/[?&]type=canvases/);
    await filterBy(page, 'Mine');
    await page.waitForURL(/[?&]s=private/);
    const viaFilters = new URL(page.url()).search;
    await page.getByRole('button', { name: 'Remove filter Canvases' }).click();
    await page.waitForURL((u) => !u.searchParams.has('type'));
    await loaded(page, '/library');
    await page.getByRole('region', { name: 'Projects', exact: true }).getByRole('button', { name: /^View all/ }).click();
    await page.waitForURL(/[?&]type=projects/);
    await loaded(page, '/library');
    await barInput(page).fill('Show my canvases');
    await barInput(page).press('Enter');
    await page.waitForURL((u) => u.search === viaFilters, { timeout: 10000 });
    await page.context().close();
  });

  await check('bar: the dock is 64-76px on desktop and 56-68px on a phone, with no separator; on a phone it hides neither Start nor the cards', async () => {
    const page = await open();
    await loaded(page, '/apps');
    const composer = barOf(page).locator('[data-chat-composer]');
    const h = (await composer.boundingBox()).height;
    must(h >= 64 && h <= 76, `desktop dock ${h}px`);
    must(await barOf(page).evaluate((n) => getComputedStyle(n).borderTopWidth) === '0px', 'the separator line is back');
    await page.context().close();
    const phone = await open({ width: 390, height: 844 });
    await loaded(phone, '/apps');
    await phone.evaluate((names) => localStorage.setItem('small.recent', JSON.stringify(names)), apps.slice(0, 5).map((a) => a.name));
    await phone.reload();
    await shStart(phone).waitFor({ timeout: 20000 });
    const ph = (await barOf(phone).locator('[data-chat-composer]').boundingBox()).height;
    must(ph >= 56 && ph <= 68, `phone dock ${ph}px`);
    await phone.locator('[data-shell-sidebar] ~ main').evaluate((m) => m.scrollTo(0, m.scrollHeight));
    await phone.waitForTimeout(300);
    const top = (await barOf(phone).boundingBox()).y;
    const start = await shStart(phone).boundingBox();
    must(start.y + start.height <= top, `Start (${start.y + start.height}) is under the bar (${top})`);
    await phone.context().close();
  });

  if (repo) await check('bar-words: find my nanoGPT project, show canvases about attention, open the project I worked on recently, start a rabbit hole from owner/repo', async () => {
    const page = await open();
    await loaded(page, '/library');
    const c = await shCanvas(page, 'rabbit-hole-check attention words');
    try {
      await page.evaluate((name) => localStorage.setItem('small.recent', JSON.stringify([name])), repo.name);
      await page.reload();
      await barOf(page).waitFor({ timeout: 20000 });
      const sheet = page.locator('[data-result-sheet]');
      const say = async (text) => { await barInput(page).fill(text); await barInput(page).press('Enter'); };
      await say('Find my nanoGPT project');
      await sheet.getByRole('button', { name: `${repo.repo} · Project` }).waitFor({ timeout: 10000 });
      await say('Show canvases about attention');
      await sheet.getByRole('button', { name: 'rabbit-hole-check attention words · Canvas' }).waitFor({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await say('Open the project I worked on recently');
      await page.waitForURL(`**/apps/${repo.name}`, { timeout: 10000 });
      await loaded(page, '/library');
      let posts = 0;
      page.on('request', (r) => { if (r.method() === 'POST' && /[/]api[/]repositories$/.test(new URL(r.url()).pathname)) posts++; });
      await page.route('**/api/repositories/branches**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repo: 'rabbit-hole-e2e/demo', defaultBranch: 'main', branches: ['main'], hasMore: false, page: 1 }) }));
      await page.route(/[/]api[/]repositories$/, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
      await say('Start a rabbit hole from rabbit-hole-e2e/demo');
      const card = page.locator('[data-confirm-card="pending"]');
      await card.getByText('rabbit-hole-e2e/demo', { exact: false }).first().waitFor({ timeout: 15000 });
      await card.getByRole('button', { name: 'Cancel' }).click();
      must(posts === 0, `${posts} repository creates`);
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('bar-states: every send ends visibly - a built-in answer, a clarification, an unknown command, an unsupported request', async () => {
    const page = await open();
    await loaded(page, '/library');
    const made = [await shCanvas(page, 'Attention masks check'), await shCanvas(page, 'Attention heads check')];
    try {
      await page.reload();
      await barOf(page).waitFor({ timeout: 20000 });
      const sheet = page.locator('[data-result-sheet]');
      const say = async (text) => { await barInput(page).fill(text); await barInput(page).press('Enter'); };
      // First send in a fresh page: a one-line result is a compact card, not an empty chat window.
      await say('/foobar');
      await sheet.getByText('Unknown command /foobar. Try /ask, /teach, /research, /do, /find', { exact: false }).waitFor({ timeout: 10000 });
      const short = (await sheet.boundingBox()).height;
      must(short < 200, `a one-line result fills a ${short}px sheet`);
      await say('What is a Project?');
      await sheet.getByText('is the learning hub around a codebase or topic', { exact: false }).waitFor({ timeout: 10000 });
      await say('Open attention');
      await sheet.getByText('Which one do you mean?').waitFor({ timeout: 10000 });
      for (const title of ['Attention masks check · Canvas', 'Attention heads check · Canvas']) await sheet.getByRole('button', { name: title }).waitFor();
      must((await sheet.boundingBox()).height <= page.viewportSize().height * 0.5, 'the sheet grew past half the screen');
      if (!(await import('../src/flags.js')).askLiveOnPreview) {
        await say('Book me a flight to Lisbon');
        await sheet.getByText('Try /find, /open or /new, or open a project to ask about its code.', { exact: false }).waitFor({ timeout: 10000 });
      }
    } finally {
      for (const c of made) await shDrop(page, c.name);
      await page.context().close();
    }
  });

  // ── shell-home checks end: later shell-home tasks insert above this line ──
}

{
  await check('G5: preview sentence searches never call the live model (/api/apps/find)', async () => {
    const page = await open();
    const hits = [];
    // Recorded and aborted in the browser, so even a failing run never reaches the live model (G5).
    await page.route(/[/]api[/](apps|runs)[/]find$/, (route) => { hits.push(route.request().url()); return route.abort(); });
    await loaded(page);
    await page.keyboard.press('Control+k'); // Search.jsx:21
    await page.keyboard.type('apps that write logs to s3 every day');
    await page.waitForTimeout(1500); // Search.jsx debounces 600 ms before it calls the model
    must(hits.length === 0, `called ${hits.join(', ')}`);
    await page.context().close();
  });
}

{
  await check('G2-branch: the repository worker says whether the default branch is real', async () => {
    const r = await fetch(`${base}/api/repositories/branches?url=${encodeURIComponent('https://github.com/karpathy/nanoGPT')}`, { headers: { ...UA, Cookie: `small_session=${session}` } });
    must(r.ok, `HTTP ${r.status}`);
    const meta = await r.json();
    must(meta.defaultBranchKnown === true && typeof meta.defaultBranch === 'string', `got ${JSON.stringify({ defaultBranch: meta.defaultBranch, defaultBranchKnown: meta.defaultBranchKnown })}`);
  });
}

{
  // ── Start a rabbit hole (T02 §5; brief §21 J17, J18). Never creates a repository. ──
  const URL_FIELD = 'https://github.com/owner/repository';

  await check('start: one lookup in flight; an error keeps every field; the copy says what is true', async () => {
    const page = await open();
    let lookups = 0;
    // Hold the lookup, then fail it the way repository_jobs.py:27 does for a private or missing repository.
    await page.route('**/api/repositories/branches**', async (route) => {
      lookups++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Public repository was not found or GitHub is unavailable' }) });
    });
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    const url = dialog.getByPlaceholder(URL_FIELD);
    const typed = 'https://github.com/rabbit-hole-e2e/private-or-missing';
    await url.fill(typed);
    await url.press('Enter');
    await url.press('Enter');
    must(await dialog.getByRole('button', { name: 'Check repository' }).isDisabled(), 'submit enabled while a lookup is in flight');
    await dialog.getByRole('alert').waitFor({ timeout: 5000 });
    must(lookups === 1, `${lookups} lookups for one submit`);
    must(await url.inputValue() === typed, 'the error cleared the URL');
    const text = await dialog.innerText();
    for (const fact of [`Visible to everyone in ${wsLabel}`, "can't be deleted yet", "private repositories aren't supported yet"]) must(text.includes(fact), `missing: ${fact}`);
    await dialog.getByRole('tab', { name: 'Blank canvas', exact: true }).click();
    await dialog.getByPlaceholder('Untitled canvas').fill('kept');
    await dialog.getByRole('tab', { name: 'Repository', exact: true }).click();
    must(await url.inputValue() === typed, 'switching tabs lost the URL');
    await dialog.getByRole('tab', { name: 'Blank canvas', exact: true }).click();
    must(await dialog.getByPlaceholder('Untitled canvas').inputValue() === 'kept', 'switching tabs lost the title');
    await page.context().close();
  });

  await check('start: a GitHub URL shows the connect card with workspace, target and branch; Change keeps the URL', async () => {
    const page = await open();
    const writes = [];
    page.on('request', (r) => { if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    // A canned lookup: the check never reaches GitHub and never clicks Confirm, so no project is created.
    await page.route('**/api/repositories/branches**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repo: 'rabbit-hole-e2e/demo', defaultBranch: 'main', branches: ['main'], hasMore: false, page: 1 }) }));
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    const url = dialog.getByPlaceholder(URL_FIELD);
    await url.fill('https://github.com/rabbit-hole-e2e/demo');
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const card = dialog.locator('[data-confirm-card]');
    await card.waitFor({ timeout: 10000 });
    const text = await card.innerText();
    for (const fact of [wsLabel, 'rabbit-hole-e2e/demo', 'main']) must(text.includes(fact), `card lacks ${fact}: ${text}`);
    must(await card.getByRole('button', { name: 'Confirm' }).isEnabled(), 'connect_repository is Blocked, but T02 §16 allows it on the review copy');
    await card.getByRole('button', { name: 'Change' }).click();
    await card.waitFor({ state: 'detached', timeout: 3000 });
    must(await url.inputValue() === 'https://github.com/rabbit-hole-e2e/demo', 'Change lost the URL');
    must(!writes.some((w) => w.endsWith('/api/repositories')), `a repository create was sent: ${writes}`);
    await page.context().close();
  });

  await check('start: the dialog opens on the path it was asked for', async () => {
    const page = await open();
    await openStart(page, 'question');
    must(await startDialog(page).getByRole('tab', { name: 'Question', exact: true }).getAttribute('data-state') === 'active', 'the Question tab is not active');
    await page.context().close();
  });

  await check('J17: Start Sources → From a connection lists Planned tiles and cannot submit', async () => {
    const page = await open();
    await openStart(page, 'sources');
    const dialog = startDialog(page);
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    for (const name of ['Google Slides', 'Google Drive / Docs', 'Notion']) {
      const tile = dialog.locator('[aria-disabled="true"]', { hasText: name });
      must(await tile.count() === 1 && (await tile.innerText()).includes('Planned'), `${name} tile is not Planned`);
    }
    must(await dialog.getByRole('button', { name: 'Create canvas' }).isDisabled(), 'Create canvas is enabled for a planned method');
    await page.context().close();
  });

  await check('J18: choosing a planned deck does nothing and claims nothing', async () => {
    const page = await open();
    await openStart(page, 'sources');
    const dialog = startDialog(page);
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    const writes = [];
    page.on('request', (r) => { if (r.method() !== 'GET') writes.push(r.url()); });
    const before = page.url();
    await dialog.locator('[aria-disabled="true"]', { hasText: 'Google Slides' }).click({ force: true }); // force: aria-disabled blocks the actionability wait
    must(page.url() === before && writes.length === 0, 'a planned tile navigated or wrote');
    must(!/connected|imported|syncing/i.test(await dialog.innerText()), 'the dialog claims a connection or import');
    await page.context().close();
  });

  // ── WP1 link decisions in the Start dialog (user decision, 2026-09-28): the dialog renders the
  // router's decision for the workspace's catalog. nanoGPT is connected in the harness workspace.
  // POST /api/repositories is aborted in all three, so a regression can never create a duplicate.
  const noCreate = async (page) => {
    const creates = [];
    await page.route('**/api/repositories', (route) => { if (route.request().method() === 'POST') { creates.push(route.request().url()); return route.abort(); } return route.continue(); });
    return creates;
  };
  const nanoUrl = `https://github.com/${repo.repo}`;

  await check('start-link: a connected repository opens its project, with no card and no create', async () => {
    const page = await open();
    const creates = await noCreate(page);
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    await dialog.getByPlaceholder(URL_FIELD).fill(nanoUrl);
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    await page.waitForURL((u) => u.pathname === `/apps/${repo.name}`, { timeout: 10000 });
    must(await startDialog(page).count() === 0, 'the dialog stayed open');
    must(creates.length === 0, `a repository create was sent: ${creates}`);
    await page.context().close();
  });

  await check('start-link: another /tree/ branch of a connected repository offers open or connect, never a dead end', async () => {
    const page = await open();
    const creates = await noCreate(page);
    const other = repo.branch === 'dev' ? 'e2e-other' : 'dev';
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    await dialog.getByPlaceholder(URL_FIELD).fill(`${nanoUrl}/tree/${other}`);
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const openIt = dialog.getByRole('button', { name: `${repo.repo} (${repo.branch}) · Project` });
    const connectIt = dialog.getByRole('button', { name: `Connect ${repo.repo} at ${other}` });
    await openIt.waitFor({ timeout: 10000 });
    must(await connectIt.count() === 1, 'no Connect-this-branch option');
    must(await dialog.getByRole('alert').count() === 0, `an error replaced the choice: ${await dialog.innerText()}`);
    await openIt.click();
    await page.waitForURL((u) => u.pathname === `/apps/${repo.name}`, { timeout: 10000 });
    must(creates.length === 0, `a repository create was sent: ${creates}`);
    await page.context().close();
  });

  await check('start-link: with a stale list, another branch found at Confirm offers open or connect, never a dead end', async () => {
    const page = await open();
    const creates = await noCreate(page);
    let stale = true;
    await page.route('**/api/apps', async (route) => {
      if (!stale || route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      return route.fulfill({ response, json: { ...body, apps: (body.apps || []).filter((a) => a.name !== repo.name) } });
    });
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    await dialog.getByPlaceholder(URL_FIELD).fill(`${nanoUrl}/tree/rabbit-hole-e2e-branch`);
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const card = dialog.locator('[data-confirm-card]');
    await card.waitFor({ timeout: 15000 });
    stale = false;
    await card.getByRole('button', { name: 'Confirm' }).click();
    await dialog.getByRole('button', { name: `Connect ${repo.repo} at rabbit-hole-e2e-branch` }).waitFor({ timeout: 15000 });
    await dialog.getByRole('button', { name: new RegExp(`^${repo.repo.replace('/', '\\/')} \\(`) }).first().waitFor();
    must(await dialog.locator('[data-confirm-card="failed"]').count() === 0, 'a Failed card is left');
    must(creates.length === 0, `a repository create was sent: ${creates}`);
    await page.context().close();
  });

  await check('start-link: with a stale list the card shows, and Confirm opens the connected project instead of creating one', async () => {
    const page = await open();
    const creates = await noCreate(page);
    // Until Confirm, the page's catalog lacks nanoGPT (a colleague connected it a minute ago);
    // Confirm's executor re-reads /api/apps and must find it.
    let stale = true;
    await page.route('**/api/apps', async (route) => {
      if (!stale || route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      return route.fulfill({ response, json: { ...body, apps: (body.apps || []).filter((a) => a.name !== repo.name) } });
    });
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    await dialog.getByPlaceholder(URL_FIELD).fill(nanoUrl);
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const card = dialog.locator('[data-confirm-card]');
    await card.waitFor({ timeout: 15000 });
    stale = false;
    await card.getByRole('button', { name: 'Confirm' }).click();
    await page.waitForURL((u) => u.pathname === `/apps/${repo.name}`, { timeout: 15000 });
    must(creates.length === 0, `a repository create was sent: ${creates}`);
    await page.context().close();
  });
}

{
  // ── agent-ui (T02 §3.3, §5): the one Start host, with the workspace identity in its ctx ──
  await check('start-host: small:start opens one Start dialog on the asked tab, naming the workspace after a navigation', async () => {
    const page = await open();
    await loaded(page, '/apps');
    await spa(page, '/members'); // a new page and a new Root baseline: the identity must survive both
    await page.evaluate(() => dispatchEvent(new CustomEvent('small:start', { detail: { path: 'question' } })));
    const dialog = startDialog(page);
    await dialog.waitFor({ timeout: 10000 });
    must(await page.getByRole('dialog', { name: 'Start a rabbit hole' }).count() === 1, 'more than one Start dialog');
    must(await dialog.getByRole('tab', { name: 'Question', exact: true }).getAttribute('aria-selected') === 'true', 'the Question tab is not selected');
    await dialog.getByRole('tab', { name: 'Repository', exact: true }).click();
    await dialog.getByText(`Visible to everyone in ${wsLabel}.`).waitFor({ timeout: 10000 });
    await page.context().close();
  });
}

{
  // ── Settings and Connections (T02 §11; brief §21 J15-J17, J19-J22) ──
  const row = (page, id) => settings(page).locator(`[data-settings-focus="${id}"]`);
  const settingsAt = async (detail, path = '/apps', viewport) => {
    const page = await open(viewport);
    await loaded(page, path);
    await page.evaluate((d) => window.dispatchEvent(new CustomEvent('small:settings', { detail: d })), detail);
    await settings(page).waitFor({ timeout: 5000 });
    return page;
  };

  await check('J15: Settings opens from the workspace menu; Esc returns to the same route', async () => {
    const page = await open();
    await loaded(page, '/apps?s=shared');
    await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await settings(page).waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    must(page.url() === `${base}/apps?s=shared`, `route changed to ${page.url()}`);
    await page.context().close();
  });

  await check('J15: Settings opens with the sidebar collapsed and below md, inside the viewport', async () => {
    for (const width of [1500, 390]) {
      const page = await open({ width, height: 900 });
      await loaded(page);
      if (width >= 768) await page.keyboard.press('Control+Backslash'); // collapse (Shell.jsx:44-50)
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
      await settings(page).waitFor({ timeout: 5000 });
      const box = await settings(page).boundingBox();
      must(box && box.x >= 0 && box.x + box.width <= width, `Settings off-screen at ${width}px`);
      await page.keyboard.press('Escape');
      await settings(page).waitFor({ state: 'detached', timeout: 5000 });
      await page.context().close();
    }
  });

  await check('J16: theme survives reload and revisit; no-op preferences are Planned and disabled; copy names the product', async () => {
    const page = await settingsAt({ tab: 'preferences' });
    const dialog = settings(page);
    must((await dialog.innerText()).includes('Choose how you want Rabbit Hole to look and behave'), 'Preferences copy does not use PRODUCT');
    for (const name of ['High contrast', 'Use Enter to add a new line', 'Language', 'Number format', 'Always show text direction controls', 'Mail & Calendar', 'Import', 'Small MCP', 'Public pages', 'Emoji']) {
      must(await dialog.getByText(new RegExp(`^${name} ?Planned$`)).count() === 1, `${name} has no Planned badge`);
    }
    for (const name of ['Use system setting', 'English (US)', 'Default']) must(await dialog.getByRole('button', { name, exact: true }).isDisabled(), `${name} select is enabled`);
    must(await dialog.getByRole('switch').evaluateAll((all) => all.length === 2 && all.every((s) => s.disabled)), 'the Enter-newline or text-direction toggle is enabled');
    await dialog.getByRole('button', { name: 'System', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await loaded(page);
    must(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme did not survive reload');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
    await dialog.getByRole('button', { name: 'Dark', exact: true }).waitFor({ timeout: 5000 }); // the revisit shows the saved choice
    await dialog.getByText('Mail & Calendar').click();
    await dialog.getByText('Planned — not available yet.').waitFor({ timeout: 3000 });
    await page.context().close(); // the theme lives in this throwaway context only
  });

  await check('J17: a planned provider opens highlighted in Settings, says Planned, and offers no action', async () => {
    const page = await settingsAt({ tab: 'connections', focus: 'google-slides' });
    must(await row(page, 'google-slides').getAttribute('aria-current') === 'true', 'the Google Slides row is not highlighted');
    for (const id of ['google-slides', 'google-drive', 'notion']) {
      must((await row(page, id).innerText()).includes('Planned'), `${id} is not Planned`);
      must(await row(page, id).getByRole('button').count() === 0, `${id} offers an action`);
    }
    await page.context().close();
  });

  await check('J19: Manage connections from Start on a project returns to the same draft and route, with nothing created', async () => {
    must(repo, 'no repository project in the catalog');
    const page = await open();
    await openStart(page, 'sources', `/apps/${repo.name}`);
    const writes = [];
    page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && /^[/]api[/](canvases|repositories|apps)/.test(p)) writes.push(`${r.method()} ${p}`); });
    const dialog = startDialog(page);
    await dialog.getByPlaceholder('Untitled canvas').fill('e2e J19 draft');
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    await dialog.getByRole('button', { name: 'Manage connections' }).click();
    await settings(page).waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    must(await dialog.isVisible(), 'Start closed together with Settings');
    must(await dialog.getByPlaceholder('Untitled canvas').inputValue() === 'e2e J19 draft', 'the draft title was lost');
    must(new URL(page.url()).pathname === `/apps/${repo.name}`, `route changed to ${page.url()}`);
    must(!writes.length, `a cancelled source choice wrote: ${writes}`);
    await page.context().close();
  });

  await check('J20: AWS management stays with its installer; a workspace switch re-scopes the catalog', async () => {
    const page = await settingsAt({ tab: 'connections' });
    if (await row(page, 'aws').count()) {
      const { connection } = await page.evaluate(() => fetch('/api/byoc/connection').then((r) => r.json()));
      if (connection && !connection.can_deploy && connection.state !== 'connected') must((await row(page, 'aws').innerText()).includes('manages this connection'), 'a non-installer sees no manager line (AwsConnection.jsx:91)');
      if (connection?.state === 'connected' && !connection.can_deploy) must(await row(page, 'aws').getByRole('button', { name: 'Connected' }).isDisabled(), 'a non-installer can disconnect');
    }
    const { workspaces = [], active } = await page.evaluate(() => fetch('/api/workspaces').then((r) => r.json()));
    const other = workspaces.find((w) => w.slug !== active);
    if (!other) { console.log('note: J20 switch not exercised; the test user has one workspace'); return page.context().close(); }
    await page.keyboard.press('Escape');
    await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
    await Promise.all([page.waitForEvent('load'), page.getByText(other.name || wsName(other.slug), { exact: true }).click()]); // Sidebar.jsx:797-805 reloads /apps
    const now = await page.evaluate(() => fetch('/api/apps', { headers: { 'X-Small-Workspace': localStorage.getItem('small.ws') || '' } }).then((r) => r.json()));
    must(now.org === other.slug, `catalog still scoped to ${now.org}`);
    await page.context().close();
  });

  await check('J21: availability is shown apart from account status', async () => {
    const page = await settingsAt({ tab: 'connections' });
    const github = await row(page, 'github').innerText();
    must(github.includes('Available') && github.includes('No account needed for public repositories'), 'GitHub mixes or drops availability and account status');
    for (const id of ['slack', 'google-slides', 'google-drive', 'notion']) must(!/account|connected|synced|imported/i.test(await row(page, id).innerText()), `${id} implies an account or sync state`);
    await page.context().close();
  });

  await check('J22: only AWS offers disconnect, behind a confirmation that states consequences', async () => {
    const page = await settingsAt({ tab: 'connections' });
    for (const id of ['github', 'slack', 'google-slides', 'google-drive', 'notion']) must(!(await row(page, id).getByText(/disconnect|remove/i).count()), `${id} offers a removal it can't perform`);
    const connected = row(page, 'aws').getByRole('button', { name: 'Connected' });
    if (await connected.count() && await connected.isEnabled()) {
      const confirm = page.getByRole('dialog', { name: 'Disconnect AWS?', exact: true });
      await connected.click();
      await confirm.waitFor({ timeout: 5000 });
      must((await confirm.innerText()).includes('Your AWS resources and data stay intact'), 'disconnect consequences missing');
      await page.keyboard.press('Escape'); // the confirm is the top layer: Esc closes it, not Settings
      await confirm.waitFor({ state: 'detached', timeout: 3000 });
      must(await settings(page).isVisible(), 'Esc on the confirm also closed Settings');
      await connected.click();
      await confirm.getByRole('button', { name: 'Cancel' }).click(); // D7: never Disconnect
      await confirm.waitFor({ state: 'detached', timeout: 3000 });
    } else console.log('note: J22 confirm not exercised; this user has no AWS connection it can disconnect');
    await page.context().close();
  });
}

{
  // ── WP4 review (user 2026-09-28): kind pills keep today's light colours and get dark surfaces in dark mode ──
  const rgb = (css) => (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  await check('pill-dark: kind pills are unchanged in light, dark surfaces with readable text in dark, job still distinct', async () => {
    const colours = {};
    for (const scheme of ['light', 'dark']) {
      const page = await open();
      await page.emulateMedia({ colorScheme: scheme });
      await loaded(page, '/library?type=apps');
      await page.locator('tbody tr').first().waitFor({ timeout: 30000 });
      for (const kind of ['server', 'job']) {
        const pill = page.locator('tbody span[style*="background"]', { hasText: new RegExp(`^${kind}$`) }).first();
        const [bg, fg] = await pill.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
        colours[`${scheme}-${kind}`] = { bg: rgb(bg), fg: rgb(fg) };
      }
      await page.context().close();
    }
    must(colours['light-server'].bg.join() === '227,226,224', `light server pill changed: ${colours['light-server'].bg}`);
    must(colours['light-job'].bg.join() === '211,229,239', `light job pill changed: ${colours['light-job'].bg}`);
    for (const kind of ['server', 'job']) {
      const { bg, fg } = colours[`dark-${kind}`];
      must(lum(bg) < 0.12, `dark ${kind} pill is a light slab: rgb(${bg})`);
      must(contrast(bg, fg) >= 4.5, `dark ${kind} pill text contrast ${contrast(bg, fg).toFixed(2)} < 4.5`);
    }
    must(colours['dark-server'].bg.join() !== colours['dark-job'].bg.join(), 'dark job and server pills look the same');
  });
}

{
  // ── agent-ui (T02 §6): the Agent Bar frame. Nothing here reaches /api/ask: a workspace
  // or app ask would write live chat history. Project asks are the 'bar-page:' checks. ──
  const { askLiveOnPreview } = await import('../src/flags.js');
  const barOpen = async (path = '/apps', viewport) => {
    const page = await open(viewport);
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };
  const barH = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--agent-bar-h').trim());

  await check('bar: one bar on Home, no chip, workspace placeholder, its height padding the page, following the sidebar', async () => {
    const page = await barOpen();
    const bar = barOf(page);
    await page.locator('[data-shell-sidebar] ~ main').waitFor({ timeout: 20000 }); // Home is a lazy chunk
    must(await page.locator('[data-agent-bar]').count() === 1, 'more than one bar');
    must(await page.locator('[data-scope-chip]').count() === 0, 'a chip on Home');
    must(await barInput(page).getAttribute('placeholder') === 'Start, open, ask, or paste a link…', 'not the workspace placeholder');
    const { x, height } = await bar.boundingBox();
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-shell-sidebar] ~ main')).paddingBottom));
    must(Math.abs(parseFloat(await barH(page)) - height) < 1 && Math.abs(pad - height) < 1, `bar ${height}, --agent-bar-h ${await barH(page)}, main padding ${pad}`);
    must(Math.abs(x - (await page.locator('[data-shell-sidebar]').boundingBox()).width) < 2, 'not aligned with the sidebar');
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    const rail = (await page.locator('[data-shell-sidebar]').boundingBox()).width;
    must(rail >= 48 && rail <= 56 && Math.abs((await bar.boundingBox()).x - rail) < 2, `did not follow the sidebar collapse to the ${rail}px rail`);
    await page.keyboard.press('Control+Backslash');
    await page.context().close();
  });

  await check('bar: one bar survives Home → Library → Explore → /apps?s=shared with its draft, no chip on any', async () => {
    const page = await barOpen();
    const node = await barOf(page).elementHandle();
    await barInput(page).fill('kept across pages');
    for (const to of ['/library', '/explore', '/apps?s=shared', '/apps']) {
      await spa(page, to);
      await page.locator('[data-shell-sidebar] ~ main').waitFor({ timeout: 20000 });
      must(await page.locator('[data-agent-bar]').count() === 1, `${to}: not exactly one bar`);
      must(await node.evaluate((n) => n.isConnected), `${to}: the bar was remounted`);
      must(await page.locator('[data-scope-chip]').count() === 0, `${to}: a chip`);
      must(await barInput(page).inputValue() === 'kept across pages', `${to}: the draft was lost`);
    }
    await page.context().close();
  });

  await check('bar: works on Home, Library and Explore: a find with no match answers in the sheet', async () => {
    const page = await barOpen();
    for (const to of ['/apps', '/library', '/explore']) {
      await spa(page, to);
      await barInput(page).fill(`find zz-no-such-thing ${to}`);
      await barInput(page).press('Enter');
      await page.locator('[data-result-sheet]').getByRole('button', { name: 'Ask instead' }).last().waitFor({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await page.locator('[data-result-sheet]').waitFor({ state: 'detached', timeout: 3000 });
    }
    await page.context().close();
  });

  await check('bar: Ctrl+J focuses the bar', async () => {
    const page = await barOpen('/library');
    await page.keyboard.press('Control+j');
    must(await barInput(page).evaluate((el) => el === document.activeElement), 'the input is not focused');
    await page.context().close();
  });

  // WP4 ruling R1: toasts keep their sides (notes left, errors right) and only lift above the bar.
  await check('bar: toasts sit above the bar and keep their sides', async () => {
    const page = await barOpen();
    const top = (await barOf(page).boundingBox()).y;
    const width = page.viewportSize().width;
    await page.evaluate(() => {
      dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui info toast' } }));
      dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui error toast', tone: 'error' } }));
    });
    const info = await page.getByText('agent-ui info toast').boundingBox();
    const error = await page.locator('[data-toast-error]').boundingBox();
    for (const [label, box] of [['info', info], ['error', error]]) must(box.y + box.height <= top, `${label} toast overlaps the bar`);
    must(info.x < 40, `info toast moved off the left (x ${info.x})`);
    must(width - (error.x + error.width) < 40, 'error toast is not on the right');
    await page.context().close();
  });

  await check('bar: hidden on /chat, Learn, a canvas, an app page and a run subpage (T02 §6.1, WP4 R2); back on /members', async () => {
    const page = await barOpen();
    const hides = [['/chat', '/chat'], ['a canvas', '/apps/canvas-00000000'], ...(repo ? [['project Learn', `/apps/${repo.name}?tab=learn`]] : []), ...(plain ? [['an app page', `/apps/${plain.name}`], ['a run subpage', `/apps/${plain.name}/runs/r-check`]] : [])];
    for (const [label, to] of hides) {
      await spa(page, to);
      await barOf(page).waitFor({ state: 'detached', timeout: 10000 });
      must(await barH(page) === '0px', `--agent-bar-h is ${await barH(page)} on ${label}`);
    }
    await spa(page, '/members');
    await barOf(page).waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (repo) await check('bar: project Learn has exactly one composer, its own', async () => {
    const page = await open();
    await page.goto(`${base}/apps/${repo.name}?tab=learn`);
    await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    must(await page.locator('[data-agent-bar]').count() === 0, 'the Agent Bar shows on Learn');
    must(await page.locator('[data-chat-composer]').count() === 1, `${await page.locator('[data-chat-composer]').count()} composers on Learn`);
    await page.context().close();
  });

  if (!askLiveOnPreview) await check('bar: a workspace ask is off on this preview: the reason shows, the draft stays, nothing reaches /api/ask', async () => {
    const page = await barOpen('/library');
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') asks++; });
    await barInput(page).fill('what does this workspace run?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText('Asking about the workspace or apps is off on this preview: it would write to live chat history.').waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === 'what does this workspace run?', 'the draft was cleared');
    must(asks === 0, `${asks} requests to /api/ask`);
    await page.context().close();
  });

  await check('bar: a workspace switch warns while a draft waits', async () => {
    const page = await barOpen();
    await barInput(page).click();
    await barInput(page).fill('unsent question');
    const dialog = page.waitForEvent('dialog', { timeout: 5000 });
    page.evaluate(() => location.assign('/apps')).catch(() => {});
    const d = await dialog;
    must(d.type() === 'beforeunload', `dialog ${d.type()}`);
    await d.dismiss();
    await page.context().close();
  });

  await check('bar: Stay at the workspace-switch warning keeps this workspace; Leave switches', async () => {
    const page = await barOpen();
    const before = await page.evaluate(() => localStorage.getItem('small.ws'));
    // A second workspace, so the menu offers a switch; the answer is canned, nothing is created.
    await page.route('**/api/workspaces', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: data.org, workspaces: [{ slug: data.org, kind: 'domain', name: wsLabel }, { slug: 'rabbit-hole-e2e-other', kind: 'team', name: 'Other check workspace' }] }) })
      : route.abort()));
    await barInput(page).fill('unsent question');
    const pick = async () => {
      await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
      await page.getByRole('button', { name: /Other check workspace/ }).click();
    };
    // The handler is set before the click: the click itself waits while the dialog is up.
    const answered = [];
    page.once('dialog', (d) => { answered.push(d.type()); d.dismiss(); });
    await pick();
    await page.waitForTimeout(500);
    must(answered.join() === 'beforeunload', `dialog ${answered}`);
    must(await page.evaluate(() => localStorage.getItem('small.ws')) === before, 'Stay still switched the workspace for every later request');
    page.once('dialog', (d) => d.accept());
    await pick();
    await page.waitForURL((u) => u.pathname === '/apps' && !u.searchParams.has('ws'), { timeout: 20000 });
    must(await page.evaluate(() => localStorage.getItem('small.ws')) === 'rabbit-hole-e2e-other', 'Leave did not switch the workspace');
    await page.context().close();
  });

  await check('bar: screenshots for pixel review (light, dark, narrow)', async () => {
    for (const [name, viewport, scheme] of [['light', undefined, 'light'], ['dark', undefined, 'dark'], ['narrow', { width: 390, height: 844 }, 'light']]) {
      const page = await open(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await loaded(page, '/apps');
      await barOf(page).waitFor({ timeout: 20000 });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `e2e/shots/agent-bar-${name}.png` });
      await page.context().close();
    }
  });
}

{
  await check('bar-multiline: Shift+Enter adds a line and Enter sends the whole message (T02 §6.2)', async () => {
    const page = await open();
    await loaded(page);
    const input = barInput(page);
    await input.click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    const value = await input.inputValue();
    must(value === 'first line\nsecond line', `value was ${JSON.stringify(value)}`);
    await page.keyboard.press('Enter');
    // On Home the preview refuses workspace asks (G1), which proves the send happened.
    await page.getByText('Asking about the workspace or apps is off on this preview', { exact: false }).first().waitFor({ timeout: 10000 });
    await page.context().close();
  });
}

{
  // ── agent-ui (T02 §6.4-§7.3): commands, cards and modes from the bar, all on /library.
  // Every send is a command or a refused workspace ask; none reaches /api/ask. ──
  const { askLiveOnPreview } = await import('../src/flags.js');
  const { openedNotice } = await import('../src/connections.js');
  const editable = apps.find((a) => ['server', 'job'].includes(a.kind) && a.canEdit);
  const FIXTURE = 'rabbit-hole-e2e/demo'; // never connected here: the Connect card, not open_resource
  console.log(`agent-ui bar-cmd: share ${editable?.name || 'none, share check skipped'} · connect fixture ${FIXTURE}`);
  // After the workspace load: commands resolve names against the catalog Shell publishes.
  const barOpen = async (path = '/library') => {
    const page = await open();
    await loaded(page, path);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };

  await check('bar-cmd: find with no match shows the empty state with Ask instead, and clears the draft', async () => {
    const page = await barOpen();
    await barInput(page).fill('find zz-no-such-thing-agent-ui');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByRole('button', { name: 'Ask instead' }).waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === '', 'the draft stayed after a finished command');
    await page.context().close();
  });

  if (repo) await check('bar-cmd: open <project> navigates through open_resource', async () => {
    const page = await barOpen();
    await barInput(page).fill(`open ${repo.name}`);
    await barInput(page).press('Enter');
    await page.waitForURL(`**/apps/${repo.name}`, { timeout: 10000 });
    await page.context().close();
  });

  await check('bar-cmd: connect Google Slides opens Settings, says it is planned and connects nothing (T02 §11)', async () => {
    const page = await barOpen();
    await barInput(page).fill('connect google slides');
    await barInput(page).press('Enter');
    await settings(page).waitFor({ timeout: 10000 });
    await barOf(page).getByText(openedNotice('connections', 'google-slides')).waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (editable) await check('bar-cmd: share is a Blocked card on this preview (D7) that names the workspace, and Cancel stays local', async () => {
    const page = await barOpen();
    let calls = 0;
    page.on('request', (r) => { if (/\/api\/ask\/(approve|reject)/.test(r.url())) calls++; });
    await barInput(page).fill(`share ${editable.name} with bar-check@example.com as view`);
    await barInput(page).press('Enter');
    const card = page.locator('[data-confirm-card="blocked"]');
    await card.waitFor({ timeout: 10000 });
    await card.getByText('Blocked on this preview: it would change live apps.').waitFor();
    await card.getByText(wsLabel, { exact: true }).waitFor();
    for (const row of ['Target', 'Operation', 'Effect']) await card.getByText(row, { exact: true }).waitFor();
    must(await card.getByRole('button', { name: 'Confirm' }).isDisabled(), 'Confirm is enabled');
    await page.screenshot({ path: 'e2e/shots/agent-bar-blocked-card.png' });
    await card.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-confirm-card="cancelled"]').waitFor({ timeout: 3000 });
    must(calls === 0, `${calls} approve or reject calls from a Blocked card`);
    await page.context().close();
  });

  await check('bar-cmd: a GitHub URL resolves its branch into a Confirm card that is not Blocked (T02 §16); Cancel sends nothing', async () => {
    must(!apps.some((a) => (a.repo || '').toLowerCase() === FIXTURE), `${FIXTURE} is connected here; the check needs an unconnected repository`);
    const page = await barOpen();
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(repositories|ask\/reject)(\?|$)/.test(new URL(r.url()).pathname)) posts++; });
    // A canned lookup, and a create is aborted in the browser even if something clicks Confirm.
    await page.route('**/api/repositories/branches**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repo: FIXTURE, defaultBranch: 'main', branches: ['main'], hasMore: false, page: 1 }) }));
    await page.route(/[/]api[/]repositories$/, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
    await barInput(page).fill(`https://github.com/${FIXTURE}`);
    await barInput(page).press('Enter');
    const card = page.locator('[data-confirm-card="pending"]');
    await card.waitFor({ timeout: 20000 });
    must(!(await card.getByRole('button', { name: 'Confirm' }).isDisabled()), 'connect_repository is blocked');
    await card.getByText('branch', { exact: false }).first().waitFor();
    await card.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-confirm-card="cancelled"]').waitFor({ timeout: 3000 });
    must(posts === 0, `${posts} POSTs from a cancelled connect card`);
    await page.context().close();
  });

  await check('bar-cmd: a question about an unconnected repository offers Connect and runs nothing by itself', async () => {
    const page = await barOpen();
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(repositories|ask)(\?|$)/.test(new URL(r.url()).pathname)) posts++; });
    await barInput(page).fill(`what is https://github.com/${FIXTURE} about?`);
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.getByText(`${FIXTURE} isn't connected, so answers can't read its code yet.`).waitFor({ timeout: 10000 });
    await sheet.getByRole('button', { name: `Connect ${FIXTURE}` }).waitFor();
    must(posts === 0, `${posts} POSTs before the user chose Connect`);
    await page.context().close();
  });

  await check('bar-cmd: new canvas stays on the page with Canvas created · Undo, and Undo removes it (T02 §8.4)', async () => {
    const page = await barOpen();
    const title = `agent-ui check ${Date.now()}`;
    const sheet = page.locator('[data-result-sheet]');
    await barInput(page).fill(`new canvas called ${title}`);
    await barInput(page).press('Enter');
    await sheet.getByText(`Canvas created · ${title}`).waitFor({ timeout: 15000 });
    must(new URL(page.url()).pathname === '/library', 'the bar navigated away');
    await sheet.getByRole('button', { name: 'Undo' }).click();
    await sheet.getByText(`Canvas created · ${title} · Undone`).waitFor({ timeout: 15000 });
    const { apps: after } = await (await fetch(`${base}/api/apps`, { headers: { ...UA, Cookie: `small_session=${session}` } })).json();
    must(!after.some((a) => a.kind === 'canvas' && a.title === title), 'the canvas is still in the catalog');
    await page.context().close();
  });

  await check('bar-cmd: "/" opens the four modes then the shortcuts, unavailable ones dimmed with their reason, Esc closes only the picker; /teach pill; Backspace returns to Auto', async () => {
    const page = await barOpen();
    const bar = barOf(page);
    await barInput(page).fill('/');
    const options = bar.getByRole('option');
    await options.first().waitFor({ timeout: 5000 });
    // The four modes, then the shortcuts this place can use (WP5): /run only with a job in the catalog.
    const expected = ['/ask', '/teach', '/research', '/do', '/find', '/open', '/new', '/connect', ...(apps.some((a) => a.kind === 'job') ? ['/run'] : []), '/share'];
    must(JSON.stringify(await options.locator('span:first-child').allTextContents()) === JSON.stringify(expected), `picker: ${await options.locator('span:first-child').allTextContents()}`);
    must(await bar.getByRole('listbox').getByRole('separator').count() === 1, 'no divider between modes and shortcuts');
    const research = bar.getByRole('option', { name: /research/ });
    must(await research.getAttribute('aria-disabled') === 'true', 'research is not dimmed');
    await research.getByText('Off on this preview', { exact: true }).waitFor(); // a review-copy limit; the product offers research everywhere
    must(await research.getByTitle('Research here would call the live model, so it is off on this preview.').count() === 1, 'the full reason is not the tooltip');
    if (!askLiveOnPreview) await bar.getByRole('option', { name: /^\/ask/ }).getByText('Off on this preview', { exact: true }).waitFor();
    await barInput(page).press('Escape');
    must(await options.count() === 0, 'the picker is still open');
    must(await barInput(page).inputValue() === '/', 'Esc changed the draft');
    await barInput(page).fill('/te');
    await barInput(page).press('Enter');
    await bar.getByRole('button', { name: 'Back to Auto' }).waitFor({ timeout: 3000 });
    must(await barInput(page).inputValue() === '', 'the slash text stayed');
    must(await page.locator('[data-result-sheet]').count() === 0, 'Enter on the picker also sent the text');
    await barInput(page).press('Backspace');
    await bar.getByRole('button', { name: 'Auto' }).waitFor({ timeout: 3000 });
    await page.context().close();
  });
  // ── WP5 batch 1: the composer chrome and the Home/Library shortcuts ──
  await check('bar-wp5: + Add lists the four Start paths and a disabled Attach; Question opens Start on Question', async () => {
    const page = await barOpen();
    await barOf(page).getByRole('button', { name: 'Add' }).click();
    for (const name of ['Repository', 'Sources', 'Question', 'Blank canvas']) await barOf(page).getByRole('button', { name, exact: true }).waitFor({ timeout: 5000 });
    must(await barOf(page).getByRole('button', { name: 'Attach a file' }).isDisabled(), 'Attach is enabled on the preview');
    await barOf(page).getByText("Attachments aren't available on this preview.").waitFor();
    await barOf(page).getByRole('button', { name: 'Question', exact: true }).click();
    const dialog = startDialog(page);
    await dialog.waitFor({ timeout: 10000 });
    must(await dialog.getByRole('tab', { name: 'Question', exact: true }).getAttribute('data-state') === 'active', 'Start did not open on Question');
    await page.context().close();
  });

  await check('bar-slash: /new question opens Start; /find nanoGPT finds it; /run alone opens the Apps filter; /share on Home says how', async () => {
    const page = await barOpen();
    const say = async (text) => { await barInput(page).fill(text); await barInput(page).press('Enter'); };
    // A bare shortcut opens the picker: the first Enter picks it into the draft ('/share '), the second sends.
    const sayBare = async (text) => { await say(text); await barInput(page).press('Enter'); };
    await say('/new question');
    await startDialog(page).waitFor({ timeout: 10000 });
    must(await startDialog(page).getByRole('tab', { name: 'Question', exact: true }).getAttribute('data-state') === 'active', '/new question is not on Question');
    await page.keyboard.press('Escape');
    await startDialog(page).waitFor({ state: 'detached', timeout: 5000 });
    if (repo) {
      await say('/find nanoGPT');
      await page.locator('[data-result-sheet]').getByRole('button', { name: `${repo.repo} · Project` }).waitFor({ timeout: 10000 });
      await page.keyboard.press('Escape');
    }
    await sayBare('/share');
    await page.locator('[data-result-sheet]').getByText('Open a project, canvas or app to share it, or type /share <name> with <email>.').waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    if (apps.some((a) => a.kind === 'job')) {
      await sayBare('/run');
      await page.waitForURL(/[?&]type=apps/, { timeout: 10000 });
    }
    await page.context().close();
  });

  await check('bar-dock: the floating dock is the default - a lifted composer over a soft fade, no frosted glass, no review switch', async () => {
    const page = await open();
    await loaded(page, '/apps?dock=integrated');
    const composer = barOf(page).locator('[data-chat-composer]');
    must((await composer.evaluate((n) => getComputedStyle(n).boxShadow)).split('rgba').length > 3, 'the composer is not lifted (popover shadow)');
    must(await barOf(page).evaluate((n) => getComputedStyle(n).backdropFilter) === 'none', 'frosted glass on the strip');
    must(/gradient/.test(await barOf(page).evaluate((n) => getComputedStyle(n).backgroundImage)), 'no fade behind the dock');
    await page.context().close();
  });

}

{
  // ── agent-ui on the project page (WP4 slice of Task 47): project scope, and the Map
  // with one composer. Sends only in project scope (LEARN_DB): 2 LLM calls. ──
  const ready = apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha);
  const barOpen = async (path) => {
    const page = await open();
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };
  const chip = (page) => barOf(page).locator('[data-scope-chip="resource"]');
  console.log(`agent-ui bar-page: project ${ready?.repo || 'none, project checks skipped'}`);

  if (ready) await check('bar-page: a project names itself in the chip and the placeholder, and the chip does not stick on /members', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).getByText(ready.repo, { exact: true }).waitFor({ timeout: 15000 });
    must(await barInput(page).getAttribute('placeholder') === `Ask about ${ready.repo}…`, 'the placeholder does not name the ready project');
    await spa(page, '/members');
    await barOf(page).waitFor({ timeout: 10000 });
    must(await barOf(page).locator('[data-scope-chip]').count() === 0, 'a stale chip on /members');
    await page.context().close();
  });

  if (ready) await check('bar-page: the Map has one composer, the bar; a Map ask lands in the sheet, names its scope while streaming across navigation, and Stop ends it', async () => {
    const page = await barOpen(`/apps/${ready.name}?tab=map`);
    await chip(page).waitFor({ timeout: 15000 }); // project scope (LEARN_DB) is proven before anything is sent
    must(await page.locator('[data-chat-composer]').count() === 1, 'a second composer on the Map');
    must(await page.getByRole('heading', { name: 'Graph Agent' }).count() === 0, 'the Graph Agent is still shown');
    const question = 'Where should I start reading?';
    await barInput(page).fill(question);
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(question).waitFor({ timeout: 10000 });
    const status = barOf(page).getByText(/^Answering in /);
    await status.waitFor({ timeout: 10000 });
    await spa(page, '/library');
    if (await status.count()) {
      await barOf(page).getByRole('button', { name: 'Stop' }).click();
      await status.waitFor({ state: 'detached', timeout: 5000 });
    }
    if (await page.locator('[data-result-sheet]').count()) await barOf(page).getByRole('button', { name: 'Collapse results' }).click();
    const line = await page.locator('[data-result-line]').textContent();
    must(line.startsWith(`${ready.repo} · `), `the collapsed line ${line} does not name the project`);
    await page.context().close();
  });

  if (ready) await check('bar-page: History lists this project threads and reopens one; New chat clears the results', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.waitFor({ timeout: 10000 }).catch(() => { throw new Error('no sheet after the ask'); });
    await barOf(page).getByText(/^Answering in /).waitFor({ state: 'detached', timeout: 120000 });
    await page.screenshot({ path: 'e2e/shots/agent-bar-sheet.png' });
    await sheet.getByRole('button', { name: 'New chat' }).click();
    must(await sheet.getByText('Which file defines the model?').count() === 0, 'New chat kept the results');
    await sheet.getByRole('button', { name: 'History' }).click();
    const row = sheet.getByRole('button', { name: /Which file defines the model\?/ }).first();
    await row.waitFor({ timeout: 10000 }).catch(async () => { throw new Error(`no History row: ${await sheet.innerText()}`); });
    await row.click();
    await sheet.getByText('Which file defines the model?').first().waitFor({ timeout: 10000 }).catch(async () => { throw new Error(`thread did not reopen: ${await sheet.innerText()}`); });
    await page.context().close();
  });

  if (ready) await check('bar-page: a Map question naming an unconnected repository is asked, and Connect is offered beside it', async () => {
    const page = await barOpen(`/apps/${ready.name}?tab=map`);
    await chip(page).waitFor({ timeout: 15000 });
    let asks = 0;
    // Counted and aborted in the browser: no model call, the check only needs to see the ask go out.
    await page.route('**/api/learn/ask', (route) => { asks++; return route.abort(); });
    await barInput(page).fill('How does this compare to https://github.com/rabbit-hole-e2e/demo?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.getByRole('button', { name: 'Connect rabbit-hole-e2e/demo' }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    must(asks === 1, `${asks} asks sent for the question`);
    await page.context().close();
  });

  if (ready) await check('bar-page: the scope chips sit on the dock, directly above the composer', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    const chips = await barOf(page).locator('[data-scope-chips]').boundingBox();
    const composer = await barOf(page).locator('[data-chat-composer]').boundingBox();
    const gap = composer.y - (chips.y + chips.height);
    must(gap >= 0 && gap <= 8, `chips sit ${gap}px from the composer`);
    await page.context().close();
  });

  if (ready) await check('bar-page: Send becomes Stop while an answer streams; Stop ends it and Send returns', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    await page.route('**/api/learn/ask', () => {}); // held: never answered, never sent on
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    const stop = barOf(page).getByRole('button', { name: 'Stop', exact: true });
    await stop.waitFor({ timeout: 10000 });
    must(await barOf(page).getByRole('button', { name: 'Send', exact: true }).count() === 0, 'Send and Stop both show');
    await stop.click();
    await page.locator('[data-result-sheet]').getByText('Stopped.').waitFor({ timeout: 5000 });
    await barOf(page).getByRole('button', { name: 'Send', exact: true }).waitFor({ timeout: 5000 });
    await page.context().close();
  });

  if (ready) await check('bar-page: × on the project chip widens to the workspace and takes the draft along', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    await barInput(page).fill('carry me');
    await chip(page).getByRole('button').click();
    must(await barOf(page).locator('[data-scope-chip]').count() === 0, 'the chip is still shown');
    must(await barInput(page).inputValue() === 'carry me', 'the draft did not move with ×');
    must(await barInput(page).getAttribute('placeholder') === 'Start, open, ask, or paste a link…', 'not the workspace scope');
    await page.context().close();
  });

  if (ready) await check('bar-page: /teach on a project opens Learn once, sends nothing while learnHandoff is false, and keeps the prompt', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    const before = await page.evaluate(() => history.length);
    await barInput(page).fill('/teach why does attention scale by sqrt(dk)?');
    await barInput(page).press('Enter');
    await page.getByText("Opened Learn. Your prompt wasn't transferred; it's kept here.").waitFor({ timeout: 10000 });
    must(new URL(page.url()).searchParams.get('tab') === 'learn', 'not on Learn');
    must(await page.evaluate(() => history.length) === before + 1, 'Learn was opened more than once'); // learnAction navigates; the bar never does
    must(await page.evaluate(() => sessionStorage.getItem('small.learn.request')) === null, 'a Learn request was written');
    await spa(page, `/apps/${ready.name}`);
    await barOf(page).waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === '/teach why does attention scale by sqrt(dk)?', 'the prompt was not kept');
    await page.context().close();
  });
}

// ── journey checks: each area inserts its block above this line, wrapped in { } ──

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
