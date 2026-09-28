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
// Loaded = the sidebar names this workspace (Sidebar.jsx:779), so Shell has the catalog.
// 'attached' because the sidebar is display:none below md (Sidebar.jsx:733).
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
const barInput = (page) => barOf(page).locator('[data-chat-composer] input');

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

  await check('sh-routes: /apps and /dash are Home, /library and ?s= are the Library, the title is Rabbit Hole', async () => {
    const page = await open();
    for (const path of ['/apps', '/dash']) {
      await page.goto(`${base}${path}`);
      await shStart(page).waitFor({ timeout: 20000 });
    }
    must(await page.title() === 'Rabbit Hole', `title is ${await page.title()}`);
    for (const [path, name] of [['/library', 'Library'], ['/apps?s=shared', 'Shared']]) {
      await page.goto(`${base}${path}`);
      await shH1(page, name).waitFor({ timeout: 20000 });
    }
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
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor({ timeout: 20000 });
    const stored = await page.evaluate(() => localStorage.getItem('small.preview:explore-saved'));
    must(JSON.parse(stored || '[]').length === 1, `small.preview:explore-saved is ${stored}`);
    must(!writes.length, `mutating calls: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('sh-library: type and scope chips filter; Canvases hide ops columns; a canvas on another device is flagged; an empty view offers Start', async () => {
    const page = await open();
    await page.goto(`${base}/library`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check library', 'rabbit-hole-check-device');
    try {
      await page.reload();
      const chip = (name) => page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${name}$`) });
      for (const name of ['All', 'Projects', 'Canvases', 'Apps', 'Mine', 'Shared with me', 'Workspace']) must(await chip(name).count() === 1, `chip ${name} missing`);
      await chip('Canvases').click();
      await page.waitForURL(/[?&]type=canvases/);
      const row = page.locator('tbody tr').filter({ hasText: 'rabbit-hole-check library' });
      await row.waitFor({ timeout: 20000 });
      must(await chip('Canvases').getAttribute('aria-pressed') === 'true', 'Canvases chip is not pressed');
      const heads = await page.locator('thead th').allInnerTexts();
      for (const ops of ['Watch', 'Deployed', 'Last run']) must(!heads.some((t) => t.includes(ops)), `${ops} column shown for Canvases`);
      must((await row.innerText()).includes('On another device'), 'canvas row lacks On another device');
      must(await row.locator('svg.lucide-pen-line').count() === 1, 'canvas row lacks the canvas icon');
      await chip('Mine').click();
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

  await check('sh-sidebar: Home, Library and Explore nav; flat Pinned with Pin and Unpin; no Recent; canvas rows offer no live-app actions', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.waitFor({ timeout: 20000 });
    must(await nav.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    const aside = page.locator('aside');
    const c = await shCanvas(page, 'rabbit-hole-check pin');
    try {
      await page.reload();
      await nav.waitFor({ timeout: 20000 });
      must(await aside.getByText('Recent', { exact: true }).count() === 0, 'the sidebar still shows Recent');
      await nav.getByRole('button', { name: 'Library', exact: true }).click();
      await page.waitForURL(/\/library$/);
      must(await nav.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-current') === 'page', 'Library is not current on /library');
      await aside.getByRole('button', { name: 'Expand Private' }).click(); // new users start collapsed
      const row = aside.locator('.group\\/r').filter({ hasText: 'rabbit-hole-check pin' }).last();
      await row.hover();
      await row.getByTitle('More').click();
      must(await row.getByRole('button', { name: 'Share' }).isDisabled(), 'Share is enabled on a canvas');
      for (const name of ['Rename', 'Duplicate', 'Move to Trash']) must(await row.getByRole('button', { name }).count() === 0, `${name} is offered on a canvas`);
      await row.getByRole('button', { name: 'Pin', exact: true }).click();
      const pinned = aside.getByRole('region', { name: 'Pinned' });
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 10000 });
      must(await pinned.locator('svg.lucide-pen-line').count() === 1, 'the pinned canvas lacks its icon');
      await page.reload();
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 20000 });
      await row.hover();
      await row.getByTitle('More').click();
      await row.getByRole('button', { name: 'Unpin', exact: true }).click();
      await pinned.waitFor({ state: 'detached', timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('sh-library: Archive from a canvas row menu with confirmation; Archived lists it; Restore brings it back (T02 §8.4)', async () => {
    const page = await open();
    await page.goto(`${base}/library?type=canvases`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check archive', 'rabbit-hole-check-device');
    try {
      await page.reload();
      const row = page.locator('tbody tr').filter({ hasText: 'rabbit-hole-check archive' });
      await row.getByTitle('More').click();
      await page.getByRole('button', { name: 'Archive…' }).click();
      await page.getByRole('dialog', { name: 'Archive rabbit-hole-check archive?' }).getByRole('button', { name: 'Archive', exact: true }).click();
      await row.waitFor({ state: 'detached', timeout: 20000 });
      const archivedChip = page.locator('button[aria-pressed]').filter({ hasText: /^Archived$/ });
      await archivedChip.click();
      const item = page.getByRole('list', { name: 'Archived canvases' }).getByRole('listitem').filter({ hasText: 'rabbit-hole-check archive' });
      await item.getByRole('button', { name: 'Restore' }).click();
      await item.waitFor({ state: 'detached', timeout: 20000 });
      await archivedChip.click();
      await row.waitFor({ timeout: 20000 });
    } finally {
      await shDrop(page, c.name);
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

// ── journey checks: each area inserts its block above this line, wrapped in { } ──

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
