// packages/web/e2e/rabbit-hole-check.mjs
// Rabbit Hole checks against this worktree's dev clone (T02 spec; brief §21 journeys).
// ONE harness for every area: each area inserts its block above the marker line near the end,
// wrapped in { } so helper names never collide. Blocks declare nothing at top level and never
// call browser.close(): the harness closes once, below the marker. D7: nothing here shares,
// renames, trashes or runs an app; a check that creates a canvas deletes it again. From packages/web:
//   SMALL_BASE=https://rabbit-hole-web-dev-smart-home.tryrabbithole.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env node e2e/rabbit-hole-check.mjs
// ONLY=build,J15 runs only labels that start with those prefixes. SHOTS=1 also saves screenshots.
// LOCAL=1 (verification only) runs against the lane's local stack instead: a /test/session from the local control plane,
// the nanoGPT repository stubbed from nanogpt-repository-fixture.mjs, and every /api/learn/ask a check does not route
// itself aborted, so nothing reaches a model. It reads no .env and prints no secret. From packages/web:
//   LOCAL=1 BASE=http://127.0.0.1:8848 SMALL_CP=http://127.0.0.1:8849 ONLY=bar-page,wp6-map node e2e/rabbit-hole-check.mjs
// STATUS (2026-09-30): signed-in execution is pending P0-B Phase 2B. /test/session is gone from live
// small-cp (P0-A containment) and the isolated Rabbit Hole dev environment is not ready yet; never
// work around that through production. Read-only mocked checks: e2e/mvp-surface-shots.mjs.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { DEV_CP } from './dev-cp.mjs';
import { repoRow, routeRepository } from './nanogpt-repository-fixture.mjs';
import { OVERVIEW_TAB } from '../src/inspector.js';

const LOCAL = process.env.LOCAL === '1';
const base = (LOCAL ? process.env.BASE : process.env.SMALL_BASE) || '';
const UA = { 'User-Agent': 'small-rabbit-hole-check' }; // Cloudflare 1010 refuses default script agents
let email, session;
if (LOCAL) {
  const cp = process.env.SMALL_CP || '';
  for (const url of [base, cp]) if (!/^http:[/][/](127[.]0[.]0[.]1|localhost)(:\d+)?$/.test(url)) throw new Error('LOCAL=1 runs against the local stack only: BASE and SMALL_CP must be http://127.0.0.1:<port>');
  const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  const run = Date.now().toString(36);
  email = `rh-check-${run}@example.com`;
  const login = await fetch(`${cp}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, secret, handle: `rhc_${run}` }) });
  if (!login.ok) throw new Error(`local test session: HTTP ${login.status}`);
  ({ session } = await login.json());
} else {
  // A per-session clone only, never the shared small-cp-dev (docs/features/parallel-dev-deploys.md). Legacy
  // small-cp-dev-<name> clones still pass until retired; new clones are rabbit-hole-web-dev-<name>.
  if (!/^https:[/][/](rabbit-hole-web-dev|small-cp-dev)-[a-z0-9-]+[.]tryrabbithole[.]workers[.]dev$/.test(base)) throw new Error('SMALL_BASE must be your clone, e.g. https://rabbit-hole-web-dev-smart-home.tryrabbithole.workers.dev');
  const env = parseEnv(readFileSync(process.env.SMALL_ENV_FILE || new URL('../../../.env', import.meta.url), 'utf8'));
  if (!env.RABBIT_HOLE_DEV_TEST_BYPASS) throw new Error('RABBIT_HOLE_DEV_TEST_BYPASS missing from the env file');
  email = 'yudhisteer.chin@gmail.com';
  const login = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email, secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) });
  if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
  ({ session } = await login.json());
}
// Locally, every context gets the stubbed project and then a blanket guard: a check's own page.route on /api/learn/ask
// runs before the context's, so an ask the check does not route itself is aborted and never reaches a model.
const localGuard = async (context) => {
  if (!LOCAL) return;
  await routeRepository(context);
  await context.route('**/api/learn/ask', (route) => route.abort());
};
const catalogResponse = await fetch(`${base}/api/apps`, { headers: { ...UA, Cookie: `small_session=${session}` } });
if (!catalogResponse.ok) throw new Error(`/api/apps: HTTP ${catalogResponse.status}`);
const data = await catalogResponse.json(); // { org, orgName, email, apps }
const apps = [...(LOCAL ? [repoRow(data)] : []), ...(data.apps || [])]; // locally, the stubbed project as every context sees it
// nanoGPT is the journeys' project; a newer test repository (octocat/Hello-World) must not displace it.
const repo = apps.find((a) => a.kind === 'repository' && /^karpathy\/nanogpt$/i.test(a.repo || '')) || apps.find((a) => a.kind === 'repository');
const plain = apps.find((a) => a.kind === 'job' || a.kind === 'server');
// api.js:4, copied: api.js is not imported because it pulls the OIDC client in through private-auth.js.
const wsName = (org) => ((org || '').split('-')[0] || org || '').replace(/^./, (c) => c.toUpperCase());
// The preview never names the email-domain workspace after its domain (api.js workspaceLabel).
const wsLabel = data.orgName || 'Personal';
// A connected project is owner-only (Privacy P0) and Rabbit Hole v1 is solo: the copy never names a domain audience.
const ONLY_YOU = 'Only you can see it.';
const railTile = `Rabbit Hole · ${wsLabel}`;
console.log(`${base} · ${wsLabel} · ${apps.length} resources · project ${repo?.name || 'none'} · app ${plain?.name || 'none'}`);

const only = (process.env.ONLY || '').split(',').filter(Boolean);
const failures = [];
const check = async (label, fn) => {
  if (only.length && !only.some((p) => label.startsWith(p))) return;
  try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} - ${e.message.split('\n')[0]}`); }
};
const must = (cond, message) => { if (!cond) throw new Error(message); };

const browser = await chromium.launch();
// A crash (an unhandled error in a check, the harness or the shared fixture) still closes the browser, then fails the run:
// the error is printed and the exit code is 1. A crashed run once left 4 headless browsers behind (2026-10-07).
const crash = async (error) => { console.error(error); await browser.close().catch(() => {}); process.exit(1); };
process.once('uncaughtException', crash);
process.once('unhandledRejection', crash);
// A fresh context per check: clean storage, nothing leaks between checks.
const open = async (viewport = { width: 1500, height: 950 }) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]); await localGuard(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  return page;
};
// Loaded = the sidebar names this workspace (sr-only in the collapsed rail), so Shell has the catalog.
// 'attached' because the sidebar is display:none below md unless its drawer is open. The local test user has no display
// name, so its sidebar names the person by email instead (session-display.js shownIdentity).
const loaded = async (page, path = '/apps') => {
  await page.goto(`${base}${path}`);
  await page.locator('aside').getByText(LOCAL ? email : wsLabel, { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 });
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
// A Home question is answered in place by POST /api/learn/home-ask (home-ask.md), a model call: stubbed here with a
// scripted answer, so a check that sends one on Home calls no model. Returns the bodies it received.
const HOME_ANSWER = 'Scripted Home answer (no model).';
const stubHomeAsk = async (page) => {
  const seen = [];
  await page.route('**/api/learn/home-ask', (route) => { seen.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ json: { answer: HOME_ANSWER, references: [] } }); });
  return seen;
};

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

  await check('sh-routes: /apps and /dash are Home, /library and ?s= are the Library (solo v1: ?s=shared filters nothing), the title is Rabbit Hole', async () => {
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
    await page.waitForTimeout(1000);
    must(await page.getByRole('button', { name: /^Remove filter/ }).count() === 0, 'an old ?s=shared link still sets a Library filter');
    must(await page.getByText('Shared with me', { exact: true }).count() === 0, 'the Library names Shared with me');
    await page.context().close();
  });

  await check('sh-home: one primary Start, top right, opens the Start dialog; Continue and Recent read this browser', async () => {
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
      // Start is the page's top-right header action, above Continue and Recent (owner, 2026-10-08).
      const sb = await shStart(page).boundingBox(), cb = await cont.boundingBox();
      must(sb.y + sb.height <= cb.y, `Start (bottom ${sb.y + sb.height}) is not above Continue (${cb.y})`);
      must(sb.x + sb.width >= cb.x + cb.width - 2, `Start ends at ${sb.x + sb.width}, not the right edge ${cb.x + cb.width}`);
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
    await shH1(page, 'Explore').waitFor({ timeout: 20000 });
    must(await page.getByText('Discover rabbit holes, projects, and learning resources shared beyond your library.', { exact: true }).count() === 1, 'Explore has no purpose sentence');
    // Nothing is shared publicly yet: no demo cards that open nothing, and no empty-state message (owner, 2026-10-08).
    must(await page.locator('[data-explore-empty]').count() === 0, 'Explore shows no empty-state message');
    must(await page.locator('[data-explore-card]').count() === 0, 'no demo cards on Explore');
    must(!writes.length, `mutating calls: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('sh-library: the Filters control filters type and ownership (Mine only, solo v1); Canvases are cards without ops columns; a canvas on another device is flagged; an empty view offers Start', async () => {
    const page = await open();
    await page.goto(`${base}/library`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check library', 'rabbit-hole-check-device');
    try {
      await page.reload();
      await filterBy(page, 'Canvas');
      await page.waitForURL(/[?&]type=canvases/);
      const row = page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check library' });
      await row.waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: 'Remove filter Canvas' }).waitFor();
      must(await page.locator('table').count() === 0, 'Canvases still render a table');
      for (const ops of ['Watch', 'Deployed', 'Last run']) must(!(await row.innerText()).includes(ops), `${ops} shown on a canvas card`);
      must((await row.innerText()).includes('On another device'), 'canvas card lacks On another device');
      must(await row.locator('svg.lucide-shapes').count() === 1, 'canvas card lacks the canvas icon');
      await page.getByRole('button', { name: /^Filters/ }).click();
      for (const name of ['Shared with me', 'Workspace']) must(await page.getByRole('button', { name, exact: true }).count() === 0, `Filters offers ${name}`);
      await page.getByRole('button', { name: 'Mine', exact: true }).click();
      await page.waitForURL(/[?&]s=private/);
      await row.waitFor();
      await page.goto(`${base}/library?type=canvases&s=shared`); // solo v1: an old ?s=shared link filters nothing
      await row.waitFor({ timeout: 20000 });
      must(await page.getByRole('button', { name: 'Remove filter Shared with me' }).count() === 0, '?s=shared still reads Shared with me');
      await page.route(/[/]api[/]apps$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...data, apps: [] }) }));
      await page.goto(`${base}/library?type=canvases`); // an empty catalog, so an empty view
      await shStart(page).waitFor({ timeout: 20000 }); // an empty view shows no message and no mark (owner, 2026-10-08)
      must(await page.getByText('Nothing here yet', { exact: true }).count() === 0, 'the empty Library shows no "Nothing here yet"');
      await shStart(page).click();
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  // WP5 sidebar shell (user 2026-09-28): the Library owns browsing, so the Apps tree, Shared, Private,
  // Recent, New chat and + New are gone; pinning moved to the Library card menu.
  await check('sh-sidebar: workspace, Home, Library, Pinned and Trash only (Explore hidden for the MVP) (solo v1: no Members); a canvas pinned from its Library card keeps a learn-safe menu with no Share', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.waitFor({ timeout: 20000 });
    must(await nav.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    const aside = page.locator('aside');
    for (const name of ['Search', 'Notifications', 'Trash']) must(await aside.getByRole('button', { name, exact: true }).count() === 1, `the sidebar lacks ${name}`);
    for (const name of ['Members', 'Apps', 'Shared', 'Private', 'New', 'New folder', 'Expand Apps', 'Expand Shared', 'Expand Private', 'Explore']) must(await aside.getByRole('button', { name, exact: true }).count() === 0, `the sidebar still offers ${name}`);
    must(await aside.getByRole('button', { name: /^New chat/ }).count() === 0, 'the sidebar still offers New chat');
    must(await aside.getByText('Recent', { exact: true }).count() === 0, 'the sidebar still shows Recent');
    const c = await shCanvas(page, 'rabbit-hole-check pin');
    try {
      await page.reload();
      await nav.getByRole('button', { name: 'Library', exact: true }).click();
      await page.waitForURL(/\/library$/);
      must(await nav.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-current') === 'page', 'Library is not current on /library');
      await filterBy(page, 'Canvas');
      await page.waitForURL(/[?&]type=canvases/);
      await page.locator('[data-library-card="canvas"]').filter({ hasText: 'rabbit-hole-check pin' }).getByTitle('More').click();
      await page.getByRole('button', { name: 'Pin', exact: true }).click();
      const pinned = aside.getByRole('region', { name: 'Pinned' });
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 10000 });
      must(await pinned.locator('svg.lucide-shapes').count() === 1, 'the pinned canvas lacks its icon');
      await page.reload();
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 20000 });
      const row = pinned.locator('.group\\/r').filter({ hasText: 'rabbit-hole-check pin' });
      await row.hover();
      await row.getByTitle('More').click();
      await row.getByRole('button', { name: 'Unpin', exact: true }).waitFor({ timeout: 5000 });
      for (const name of ['Share', 'Rename', 'Duplicate', 'Move to Trash']) must(await row.getByRole('button', { name }).count() === 0, `${name} is offered on a pinned canvas`);
      await row.getByRole('button', { name: 'Unpin', exact: true }).click();
      await pinned.waitFor({ state: 'detached', timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });

  await check('sh-rail: Ctrl+\\ collapses to a 48-56px icon rail with labelled workspace, Search, Notifications, Home, Library and Trash, and no Members or Explore (solo v1, MVP); the current page is marked; the tile opens the workspace menu; Notifications opens beside the rail; Ctrl+\\ restores', async () => {
    const page = await open();
    await loaded(page, '/apps');
    const sidebar = page.locator('[data-shell-sidebar]');
    const aside = page.locator('aside');
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    const w = (await sidebar.boundingBox()).width;
    must(w >= 48 && w <= 56, `the rail is ${w}px wide`);
    for (const name of [railTile, 'Home', 'Library', 'Trash', 'Open sidebar']) {
      const b = aside.getByRole('button', { name, exact: true });
      must(await b.count() === 1 && await b.getAttribute('title') === name, `the rail's ${name} button lacks its label or tooltip`);
    }
    for (const name of ['Members', 'Explore']) must(await aside.getByRole('button', { name, exact: true }).count() === 0, `the rail offers ${name}`);
    must(await aside.getByRole('button', { name: 'Search', exact: true }).count() === 1, 'the rail has no Search');
    await aside.getByRole('button', { name: 'Notifications', exact: true }).click();
    const inbox = page.getByText('Notifications', { exact: true });
    await inbox.waitFor({ timeout: 5000 });
    const x = (await inbox.boundingBox()).x;
    must(x > w && x < w + 60, `the notifications panel opens at x=${x}, not beside the ${w}px rail`);
    await page.mouse.click(900, 500); // the backdrop closes it
    await inbox.waitFor({ state: 'detached', timeout: 5000 });
    must(await aside.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    await aside.getByRole('button', { name: railTile, exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(100); // Menu attaches its outside-click listener on the next tick (ui.jsx)
    await page.mouse.click(26, 500); // the rail's empty middle closes the menu
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'detached', timeout: 5000 });
    const app = plain || repo;
    if (app) {
      await loaded(page, `/apps/${app.name}`);
      must(await aside.locator('nav[aria-label="Main"] [aria-current]').count() === 0, 'a global destination is current on an app page');
    }
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    must((await sidebar.boundingBox()).width > 150, 'Ctrl+\\ did not restore the sidebar');
    await page.context().close();
  });

  await check('sh-naming: nothing reads the email-domain name; the sidebar, rail and drawer say Rabbit Hole with the workspace as its own switcher; the Library has no workspace crumb; the sheet header is Rabbit Hole; a Project page marks only its pinned row', async () => {
    if (data.orgName) return; // a named workspace keeps its name; the rule is about the domain one
    const domain = wsName(data.org); // what gmail.com used to become
    const leak = async (page, where) => {
      const hits = await page.evaluate((word) => {
        const re = new RegExp(`\\b${word}\\b`);
        const out = re.test(document.body.innerText) ? ['text'] : [];
        for (const el of document.querySelectorAll('[title], [aria-label]')) {
          if (re.test(el.getAttribute('title') || '') || re.test(el.getAttribute('aria-label') || '')) out.push(el.outerHTML.slice(0, 80));
        }
        return out;
      }, domain);
      must(!hits.length, `${where} shows ${domain}: ${hits.join(' | ')}`);
    };
    const page = await open();
    const aside = page.locator('aside');
    await loaded(page, '/apps');
    await aside.getByText('Rabbit Hole', { exact: true }).waitFor({ timeout: 10000 });
    await aside.getByRole('button', { name: wsLabel, exact: true }).waitFor();
    await leak(page, 'Home');
    await loaded(page, '/library');
    await page.getByRole('heading', { name: 'Library', level: 1 }).waitFor({ timeout: 10000 });
    must(await page.locator('main').getByRole('button', { name: wsLabel, exact: true }).count() === 0, 'the Library shows a workspace crumb');
    await leak(page, 'Library');
    await loaded(page, '/explore');
    await leak(page, 'Explore');
    await loaded(page, '/apps');
    await barInput(page).fill('What is a Project?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.getByText('is the learning hub around a codebase or topic', { exact: false }).waitFor({ timeout: 10000 });
    await sheet.getByText('Rabbit Hole', { exact: true }).waitFor();
    await leak(page, 'the result sheet');
    await page.keyboard.press('Control+Backslash');
    await aside.getByRole('button', { name: railTile, exact: true }).waitFor({ timeout: 5000 });
    await leak(page, 'the rail');
    await page.keyboard.press('Control+Backslash');
    if (repo) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`small.pinned:${data.org}:${email}`, JSON.stringify([repo.name])]);
      await loaded(page, `/apps/${repo.name}?tab=map`);
      const pinnedRow = aside.getByRole('region', { name: 'Pinned' }).locator('[aria-current="page"]');
      await pinnedRow.waitFor({ timeout: 10000 });
      must(await aside.locator('[aria-current="page"]').count() === 1, 'a Project page marks more than its pinned row');
      await leak(page, 'the Project Map');
      for (const [where, path] of [['the Project Overview', `/apps/${repo.name}`], ['project Learn', `/apps/${repo.name}?tab=learn`], ...(plain ? [['an app page', `/apps/${plain.name}`]] : [])]) {
        await loaded(page, path);
        await page.waitForTimeout(1500);
        must(await aside.locator('[aria-current="page"]').count() <= 1, `${where} marks more than one location`);
        await leak(page, where);
      }
    }
    await page.context().close();
    const phone = await open({ width: 390, height: 844 });
    await loaded(phone, '/apps');
    await phone.getByRole('button', { name: 'Open sidebar' }).first().click();
    await phone.locator('aside').getByText('Rabbit Hole', { exact: true }).waitFor({ timeout: 5000 });
    await leak(phone, 'the phone drawer');
    await phone.context().close();
  });

  await check('d7-app-learn: a job or server has no Learn tab on the preview, and ?tab=learn never mounts Learn for it (its asks would write the live D1 through apiAsk)', async () => {
    if (!plain) return;
    const page = await open();
    let asks = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/learn\/(ask|selection)/.test(r.url())) asks++; });
    await loaded(page, `/apps/${plain.name}`);
    await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 20000 });
    must(await page.getByRole('tab', { name: 'Learn', exact: true }).count() === 0, `${plain.name} offers a Learn tab`);
    await loaded(page, `/apps/${plain.name}?tab=learn`);
    await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 20000 });
    must(await page.locator('[data-chat-composer]').count() <= 1, 'Learn mounted a second composer for a live app');
    must(asks === 0, `${asks} Learn asks were sent for a live app`);
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
      await page.getByRole('button', { name: 'Archive', exact: true }).click();
      await page.getByRole('dialog', { name: 'Archive rabbit-hole-check archive?' }).getByRole('button', { name: 'Archive', exact: true }).click();
      await row.waitFor({ state: 'detached', timeout: 20000 });
      await filterBy(page, 'Archived canvas');
      const item = page.getByRole('list', { name: 'Archived canvas' }).getByRole('listitem').filter({ hasText: 'rabbit-hole-check archive' });
      await item.getByRole('button', { name: 'Restore' }).click();
      await item.waitFor({ state: 'detached', timeout: 20000 });
      await filterBy(page, 'Archived canvas');
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
    await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]); await localGuard(context);
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
    await filterBy(page, 'Canvas');
    await page.waitForURL(/[?&]type=canvases/);
    await filterBy(page, 'Mine');
    await page.waitForURL(/[?&]s=private/);
    const viaFilters = new URL(page.url()).search;
    await page.getByRole('button', { name: 'Remove filter Canvas' }).click();
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
      await page.locator('aside').getByText(wsLabel, { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 }); // the catalog is in before Find runs
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
    for (const fact of [ONLY_YOU, "can't be deleted yet", "private repositories aren't supported yet"]) must(text.includes(fact), `missing: ${fact}`);
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

  // Owner, 2026-10-08: "start a rabbit hole with a repository should allow us to choose which branch".
  await check('start: the connect card has a Branch select - the default preselected, a pick rebuilds the card, More branches loads the next page', async () => {
    const page = await open();
    const writes = [], pages = [];
    page.on('request', (r) => { if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    // Canned lookups (page 1, then page 2): never GitHub, and Confirm is never clicked, so no project is created.
    await page.route('**/api/repositories/branches**', (route) => {
      const n = Number(new URL(route.request().url()).searchParams.get('page') || 1);
      pages.push(n);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n === 1
        ? { repo: 'rabbit-hole-e2e/demo', defaultBranch: 'main', defaultBranchKnown: true, branches: ['dev', 'main'], hasMore: true, page: 1 }
        : { repo: 'rabbit-hole-e2e/demo', defaultBranch: 'main', defaultBranchKnown: true, branches: ['feature/x'], hasMore: false, page: 2 }) });
    });
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    await dialog.getByPlaceholder(URL_FIELD).fill('https://github.com/rabbit-hole-e2e/demo');
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const card = dialog.locator('[data-confirm-card]'), select = dialog.locator('[data-branch-select]');
    await card.waitFor({ timeout: 10000 });
    must((await select.innerText()).trim() === 'main', `the default is not preselected: ${await select.innerText()}`);
    must((await card.innerText()).includes('branch main'), 'the card does not name main');
    await select.click();
    await page.getByRole('button', { name: 'dev', exact: true }).click();
    await page.waitForTimeout(300);
    must((await select.innerText()).trim() === 'dev' && (await card.innerText()).includes('branch dev'), `the pick did not rebuild the card: ${await card.innerText()}`);
    must(await card.getByRole('button', { name: 'Confirm' }).isEnabled(), 'Confirm is not offered for the picked branch');
    await select.click();
    await page.getByRole('button', { name: 'More branches…', exact: true }).click();
    await page.waitForTimeout(600);
    must(pages.join() === '1,2', `pages fetched: ${pages}`);
    await select.click();
    must(await page.getByRole('button', { name: 'feature/x', exact: true }).count() === 1 && await page.getByRole('button', { name: 'More branches…', exact: true }).count() === 0, 'page 2 is not listed, or More branches stayed');
    await page.getByRole('button', { name: 'feature/x', exact: true }).click();
    await page.waitForTimeout(300);
    must((await card.innerText()).includes('branch feature/x'), 'the page-2 branch did not rebuild the card');
    must(!writes.some((w) => w.endsWith('/api/repositories')), `a repository create was sent: ${writes}`);
    await page.context().close();
  });

  await check('start: the dialog opens on the path it was asked for', async () => {
    const page = await open();
    await openStart(page, 'question');
    must(await startDialog(page).getByRole('tab', { name: 'Question', exact: true }).getAttribute('data-state') === 'active', 'the Question tab is not active');
    await page.context().close();
  });

  // MVP surface cleanup: every connection source is planned, so Sources offers PDF upload only and
  // advertises nothing it cannot do (StartDialog.jsx connectionSources). This replaces J17/J18/J19's planned tiles.
  await check('J17: Start Sources offers PDF upload only, with no planned connection sources', async () => {
    const page = await open();
    await openStart(page, 'sources');
    const dialog = startDialog(page);
    must(await dialog.getByRole('radio', { name: 'From a connection' }).count() === 0, 'Sources still offers From a connection');
    must(!/Planned|Google Slides|Google Drive|Notion/.test(await dialog.innerText()), 'Sources still advertises a planned provider');
    must((await dialog.innerText()).includes('Sources → PDF'), 'Sources lost its PDF upload guidance');
    must(await dialog.getByRole('button', { name: 'Create canvas' }).isEnabled(), 'Create canvas is disabled for PDF upload');
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
    await spa(page, '/library'); // a new page and a new Root baseline: the identity must survive both
    await page.evaluate(() => dispatchEvent(new CustomEvent('small:start', { detail: { path: 'question' } })));
    const dialog = startDialog(page);
    await dialog.waitFor({ timeout: 10000 });
    must(await page.getByRole('dialog', { name: 'Start a rabbit hole' }).count() === 1, 'more than one Start dialog');
    must(await dialog.getByRole('tab', { name: 'Question', exact: true }).getAttribute('aria-selected') === 'true', 'the Question tab is not selected');
    await dialog.getByRole('tab', { name: 'Repository', exact: true }).click();
    await dialog.getByText(ONLY_YOU, { exact: false }).waitFor({ timeout: 10000 });
    must(!/anyone who signs in|everyone in /.test(await dialog.innerText()), 'Start names a domain or workspace audience');
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

  await check('J16: theme survives reload and revisit; unfinished preferences and tabs are absent; copy names the product', async () => {
    const page = await settingsAt({ tab: 'preferences' });
    const dialog = settings(page);
    must((await dialog.innerText()).includes('Choose how you want Rabbit Hole to look and behave'), 'Preferences copy does not use PRODUCT');
    for (const name of ['High contrast', 'Use Enter to add a new line', 'Language', 'Number format', 'Always show text direction controls', 'Mail & Calendar', 'Import', 'Small AI', 'Rabbit Hole AI', 'Small MCP', 'Public pages', 'Emoji']) {
      must(await dialog.getByText(name, { exact: true }).count() === 0, `${name} is still shown`);
    }
    must(!(await dialog.innerText()).includes('Planned'), 'Settings still says Planned');
    await dialog.getByRole('button', { name: 'System', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await loaded(page);
    must(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme did not survive reload');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
    await dialog.getByRole('button', { name: 'Dark', exact: true }).waitFor({ timeout: 5000 }); // the revisit shows the saved choice
    await page.context().close(); // the theme lives in this throwaway context only
  });

  await check('J17: Connections lists only working providers; planned ones and live-only Slack are absent', async () => {
    const page = await settingsAt({ tab: 'connections', focus: 'google-slides' });
    for (const id of ['slack', 'google-slides', 'google-drive', 'notion']) must(await row(page, id).count() === 0, `${id} is still listed`);
    must(!(await settings(page).innerText()).includes('Planned'), 'Connections still says Planned');
    must(await row(page, 'github').count() === 1, 'GitHub is missing');
    // An unconfigured AWS preview is an absent capability, never an error (app-data.js awsUnavailable).
    must(!/not configured|Could not load AWS/.test(await page.locator('body').innerText()), 'an unconfigured AWS preview shows as an error');
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

  // WP6 closeout (user option A, 2026-09-29): one bottom-right column, errors above info, above the bar.
  await check('bar: toasts stack bottom-right above the bar, errors over info, never overlapping, at desktop and phone width', async () => {
    for (const viewport of [undefined, { width: 390, height: 844 }]) {
      const page = await barOpen('/apps', viewport);
      const top = (await barOf(page).boundingBox()).y;
      const width = page.viewportSize().width;
      await page.evaluate(() => {
        dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui info toast' } }));
        dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui error toast', tone: 'error' } }));
      });
      const info = await page.getByText('agent-ui info toast').boundingBox();
      const error = await page.locator('[data-toast-error]').boundingBox();
      const where = `${width}px`;
      for (const [label, box] of [['info', info], ['error', error]]) {
        must(box.y + box.height <= top, `${where}: ${label} toast overlaps the bar`);
        must(width - (box.x + box.width) >= 8 && width - (box.x + box.width) < 40 && box.x >= 8, `${where}: ${label} toast is not on the right, inside the edge`);
      }
      must(error.y + error.height <= info.y, `${where}: the error toast is not above the info toast, or they overlap`);
      // ponytail: the phone safe area is env(safe-area-inset-bottom), 0 in this browser; the CSS max() covers devices that have one.
      await page.context().close();
    }
  });

  await check('bar: hidden on Learn, a canvas and a run subpage (T02 §6.1; the preview has no /chat, wp7-d7-chrome); back on the Library', async () => {
    const page = await barOpen();
    const hides = [['a canvas', '/apps/canvas-00000000'], ...(repo ? [['project Learn', `/apps/${repo.name}?tab=learn`]] : []), ...(plain ? [['a run subpage', `/apps/${plain.name}/runs/r-check`]] : [])];
    for (const [label, to] of hides) {
      await spa(page, to);
      await barOf(page).waitFor({ state: 'detached', timeout: 10000 });
      must(await barH(page) === '0px', `--agent-bar-h is ${await barH(page)} on ${label}`);
    }
    await spa(page, '/library');
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

  // A Home question is answered in place from the user's own library (home-ask.md, since 2026-10-03), never by the old
  // apps agent: its route is stubbed here (stubHomeAsk), so no model is called.
  await check('bar: a Home question is answered in place by /api/learn/home-ask (stubbed, no model); nothing reaches /api/ask', async () => {
    const page = await barOpen('/library');
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') asks++; });
    const home = await stubHomeAsk(page);
    await barInput(page).fill('what does this workspace run?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(HOME_ANSWER).waitFor({ timeout: 10000 });
    must(home.length === 1 && home[0].message === 'what does this workspace run?', `home-ask: ${JSON.stringify(home)}`);
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
    // A second workspace the person owns (solo v1 lists only their own), so the menu offers a switch; the answer is canned, nothing is created.
    await page.route('**/api/workspaces', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: data.org, workspaces: [{ slug: data.org, kind: 'domain', name: wsLabel }, { slug: 'rabbit-hole-e2e-other', kind: 'team', role: 'owner', name: 'Other check workspace' }] }) })
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
    const home = await stubHomeAsk(page);
    await page.keyboard.press('Enter');
    // On Home the question is answered in place (stubbed home-ask): the whole two-line message was sent.
    await page.getByText(HOME_ANSWER).first().waitFor({ timeout: 10000 });
    must(home[0]?.message === 'first line\nsecond line', `sent ${JSON.stringify(home[0]?.message)}`);
    await page.context().close();
  });
}

{
  // ── agent-ui (T02 §6.4-§7.3): commands, cards and modes from the bar, all on /library.
  // Every send is a command or a refused workspace ask; none reaches /api/ask. ──
  const { askLiveOnPreview } = await import('../src/flags.js');
  const { openedNotice } = await import('../src/connections.js');
  const FIXTURE = 'rabbit-hole-e2e/demo'; // never connected here: the Connect card, not open_resource
  console.log(`agent-ui bar-cmd: connect fixture ${FIXTURE}`);
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

  // Solo v1: sharing with a person is no command, so it is never a card; on /library it is a Home question, answered in
  // place (home-ask, stubbed here: no model).
  await check('bar-cmd: share <app> with <email> is no command in solo v1 - no card, no /api/ask call, a Home question answered in place', async () => {
    const page = await barOpen();
    let calls = 0;
    page.on('request', (r) => { if (r.method() !== 'GET' && /^[/]api[/]ask([/]|$)/.test(new URL(r.url()).pathname)) calls++; });
    const home = await stubHomeAsk(page);
    const text = `share ${plain?.name || 'counter'} with bar-check@example.com as view`;
    await barInput(page).fill(text);
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(HOME_ANSWER).first().waitFor({ timeout: 10000 });
    must(home.length === 1 && home[0].message === text, `home-ask: ${JSON.stringify(home)}`);
    must(await page.locator('[data-confirm-card]').count() === 0, 'share still becomes a card');
    must(calls === 0, `${calls} /api/ask calls`);
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

  await check('bar-cmd: "/" opens the modes this place can run then the shortcuts, none dimmed and no /research, Esc closes only the picker; /teach pill; Backspace returns to Auto', async () => {
    const page = await barOpen();
    const bar = barOf(page);
    await barInput(page).fill('/');
    const options = bar.getByRole('option');
    await options.first().waitFor({ timeout: 5000 });
    // The modes this place can run, then its shortcuts (WP5): /run only with a job in the catalog. A mode refused here is not
    // offered (r28 audit): /research is refused everywhere and unwired, so it is never a row. Solo v1: no /share.
    const expected = ['/ask', '/teach', '/do', '/find', '/open', '/new', '/connect', ...(apps.some((a) => a.kind === 'job') ? ['/run'] : [])];
    must(JSON.stringify(await options.locator('[data-picker-name]').allTextContents()) === JSON.stringify(expected), `picker: ${await options.locator('[data-picker-name]').allTextContents()}`);
    // Every command in its own colour (owner, 2026-10-08): a toned mark per offered row, no two alike.
    const tones = await options.locator('[data-command-tone]').evaluateAll((all) => all.map((n) => getComputedStyle(n).color));
    must(tones.length === expected.length && new Set(tones).size === tones.length, `picker tones: ${tones}`);
    must(await bar.getByRole('listbox').getByRole('separator').count() === 1, 'no divider between modes and shortcuts');
    must(await bar.locator('[role="option"][aria-disabled="true"]').count() === 0, 'a dimmed row is offered');
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

  await check('bar-slash: /new question opens Start; /find nanoGPT finds it; /run alone opens the Apps filter; /share is an unknown command (solo v1)', async () => {
    const page = await barOpen();
    const say = async (text) => { await barInput(page).fill(text); await barInput(page).press('Enter'); };
    // A bare shortcut opens the picker: the first Enter picks it into the draft ('/run '), the second sends.
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
    await say('/share'); // no picker entry matches, so the first Enter sends
    await page.locator('[data-result-sheet]').getByText('Unknown command /share.', { exact: false }).first().waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    if (apps.some((a) => a.kind === 'job')) {
      await sayBare('/run');
      await page.waitForURL(/[?&]type=apps/, { timeout: 10000 });
    }
    await page.context().close();
  });

  await check('bar-dock: the workspace dock is chrome (owner, 2026-10-06, workspace-dock.md) - a hairline input shadow, an opaque strip with a top divider, no fade, no frosted glass, no review switch', async () => {
    const page = await open();
    await loaded(page, '/apps?dock=integrated');
    const composer = barOf(page).locator('[data-chat-composer]');
    must((await composer.evaluate((n) => getComputedStyle(n).boxShadow)).split('rgba').length === 2, 'the composer still floats (popover shadow)');
    must(await barOf(page).evaluate((n) => getComputedStyle(n).backdropFilter) === 'none', 'frosted glass on the strip');
    must(await barOf(page).evaluate((n) => getComputedStyle(n).backgroundImage) === 'none', 'a fade behind the dock');
    must(await barOf(page).evaluate((n) => getComputedStyle(n).borderTopWidth) === '1px', 'no top divider on the dock');
    await page.context().close();
  });

}

{
  // ── agent-ui on the project page (WP4 slice of Task 47): project scope, and the Map
  // with one composer. Every ask is held, aborted or stubbed: no LLM call. ──
  const ready = apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha);
  const barOpen = async (path) => {
    const page = await open();
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };
  const chip = (page) => barOf(page).locator('[data-scope-chip="resource"]');
  console.log(`agent-ui bar-page: project ${ready?.repo || 'none, project checks skipped'}`);

  if (ready) await check('bar-page: a project names itself in the chip and the placeholder, and the chip does not stick on the Library', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).getByText(ready.repo, { exact: true }).waitFor({ timeout: 15000 });
    must(await barInput(page).getAttribute('placeholder') === `Ask about ${ready.repo}…`, 'the placeholder does not name the ready project');
    await spa(page, '/library');
    await barOf(page).waitFor({ timeout: 10000 });
    must(await barOf(page).locator('[data-scope-chip]').count() === 0, 'a stale chip on the Library');
    await page.context().close();
  });

  // Since the dock (workspace-dock.md, project-map-learn.md "The Map's side panel"), a Map answer opens in the bar's window as
  // everywhere else, never in the inspector; minimized, the chat icon beside + names it (data-result-open, no result line).
  if (ready) await check('bar-page: the Map has one composer, the bar; a Map ask opens in the answer window, never the inspector, names its scope while streaming across navigation, and Stop ends it', async () => {
    const page = await barOpen(`/apps/${ready.name}?tab=map`);
    await chip(page).waitFor({ timeout: 15000 }); // project scope (LEARN_DB) is proven before anything is sent
    must(await page.locator('[data-chat-composer]').count() === 1, 'a second composer on the Map');
    must(await page.getByRole('heading', { name: 'Graph Agent' }).count() === 0, 'the Graph Agent is still shown');
    await page.route('**/api/learn/ask', () => {}); // held: never answered, never sent on (no model call)
    const question = 'Where should I start reading?';
    await barInput(page).fill(question);
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(question).waitFor({ timeout: 10000 });
    must(await page.locator('[data-map-panel]').getByText(question).count() === 0, 'the Map ask landed in the inspector');
    const status = barOf(page).getByText(/^Answering in /);
    await status.waitFor({ timeout: 10000 });
    await spa(page, '/library');
    if (await status.count()) {
      await barOf(page).getByRole('button', { name: 'Stop' }).click();
      await status.waitFor({ state: 'detached', timeout: 5000 });
    }
    if (await page.locator('[data-result-sheet]').count()) await barOf(page).getByRole('button', { name: 'Collapse results' }).click();
    const line = await barOf(page).locator('[data-result-open]').getAttribute('title');
    must(line.startsWith(`${ready.repo} · `), `the collapsed window ${line} does not name the project`);
    await page.context().close();
  });

  // The window over the bar is just a window (owner, 2026-10-04, project-map-learn.md "The composers"): its label, a clear
  // icon and minimize, no History or New chat; closed or minimized, the chat icon beside + reopens it.
  if (ready) await check('bar-page: the answer window has its label, clear and minimize, and no History or New chat; minimized, the chat icon beside + reopens it; clear empties the conversation and closes it, leaving nothing to reopen', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    const sse = [['chunk', { text: 'model.py defines the model.' }], ['done', {}]].map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`).join('');
    await page.route('**/api/learn/ask', (r) => r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })); // stubbed: no model call
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.getByText('model.py defines the model.').waitFor({ timeout: 10000 }).catch(() => { throw new Error('no answer in the window after the ask'); });
    await page.screenshot({ path: 'e2e/shots/agent-bar-sheet.png' });
    must(await sheet.getByText(ready.repo, { exact: true }).count() === 1, 'the window does not name the project');
    for (const name of ['History', 'New chat']) must(await sheet.getByRole('button', { name }).count() === 0, `the window offers ${name}`);
    const minimize = sheet.getByRole('button', { name: 'Collapse results' });
    must(await sheet.locator('[data-result-clear]').count() === 1 && await minimize.count() === 1, 'the window lacks clear or minimize');
    await minimize.click();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    await barOf(page).locator('[data-result-open]').click();
    await sheet.getByText('Which file defines the model?').waitFor({ timeout: 5000 });
    await sheet.locator('[data-result-clear]').click();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    must(await barOf(page).locator('[data-result-open]').count() === 0, 'clear left a conversation to reopen');
    await page.context().close();
  });

  if (ready) await check('bar-page: a Map question naming an unconnected repository is asked, and Connect is offered in the answer window', async () => {
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

  // WP7 (user, 2026-09-29): a mode is transient. A new page or resource starts in Auto; project tabs, a node pick and drafts keep theirs.
  if (ready) await check('bar-mode: Teach picked on Project A is Auto on Library, Home and Project B; a typed draft stays', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    const bar = barOf(page);
    const other = apps.find((a) => a.kind === 'repository' && a.name !== ready.name) || plain; // Project B, else another resource
    const teach = async (text = '') => {
      await spa(page, `/apps/${ready.name}`);
      await chip(page).getByText(ready.repo, { exact: true }).waitFor({ timeout: 15000 });
      await barInput(page).fill('/te');
      await barInput(page).press('Enter');
      await bar.getByRole('button', { name: 'Back to Auto' }).waitFor({ timeout: 3000 });
      if (text) await barInput(page).fill(text);
    };
    for (const to of ['/library', '/apps', ...(other ? [`/apps/${other.name}`] : [])]) {
      await teach();
      await spa(page, to);
      await bar.getByRole('button', { name: 'Auto', exact: true }).waitFor({ timeout: 5000 });
      must(await bar.getByRole('button', { name: 'Back to Auto' }).count() === 0, `Teach carried to ${to}`);
    }
    await teach('keep me');
    await spa(page, '/library');
    await bar.getByRole('button', { name: 'Auto', exact: true }).waitFor({ timeout: 5000 });
    must(await barInput(page).inputValue() === 'keep me', 'the reset dropped the held draft');
    await page.context().close();
  });
}

{
  // ── WP6 destinations, checkpoint 1 (rabbit-hole-checklist.md "WP6 destinations"). D7: test canvases go to
  // LEARN_DB only and are deleted; Learn asks are aborted or held in the browser (no model call, no thread, so
  // DELETE never 405s); nothing clicks Run, Open, Refresh branch, Duplicate, Trash, Share or Request access. ──
  const { NOT_HERE, NOT_HERE_WHY, canvasKeys } = await import('../src/home/canvas-local.js'); // pure, like flags.js
  const D7 = 'Blocked on this preview: it would change live apps.'; // agent/commands.js D7_REASON (commands.js pulls api.js, so not imported)
  const ASK_OFF = 'Asking about an app is off on this preview: it would write to live chat history.'; // agent/slash.js ASK_OFF
  const ready = apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha && /^karpathy\/nanogpt$/i.test(a.repo || ''))
    || apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha);
  const job = apps.find((a) => a.kind === 'job' && a.hosting !== 'aws' && a.lastRun) || apps.find((a) => a.kind === 'job' && a.hosting !== 'aws');
  const server = apps.find((a) => a.kind === 'server');
  const api6 = (page, path, method = 'GET', body) => page.evaluate(async ([p, m, b]) => {
    const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [path, method, body]);
  const canvas6 = async (page, body) => { const r = await api6(page, '/api/canvases', 'POST', body); must(r.status === 201, `create canvas: HTTP ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  const drop6 = async (page, name) => { const r = await api6(page, `/api/apps/${name}`, 'DELETE'); must(r.status < 300, `delete ${name}: HTTP ${r.status}; remove it from small-learn-dev by hand`); };
  // Non-GET /api/ calls, except RepositorySource's read (POST .../file) and Learn asks aborted in the browser.
  const writes6 = (page) => { const w = []; page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && p.startsWith('/api/') && !/\/file$|^\/api\/learn\/ask$/.test(p)) w.push(`${r.method()} ${p}`); }); return w; };
  const noAsks = (page) => page.route('**/api/learn/ask', (r) => r.abort());
  const ptab = (page, name) => page.locator('[data-project-tabs]').getByRole('tab', { name, exact: true });
  const isSelected = async (loc) => (await loc.getAttribute('aria-selected')) === 'true';
  const composers = (page) => page.locator('[data-chat-composer]').count();
  const ownComposers = (page) => page.locator('[data-chat-composer]:not([data-agent-bar] [data-chat-composer])').count();
  const pickNode = async (page, label = 'CausalSelfAttention') => { // the WP5 naming shots' mapNode
    await page.getByRole('textbox', { name: 'Search repository' }).fill(label);
    await page.waitForTimeout(800);
    await page.getByText(label, { exact: true }).first().click({ timeout: 10000 });
    await barOf(page).locator('[data-scope-chip="selected"]').waitFor({ timeout: 10000 });
  };
  console.log(`wp6: project ${ready?.repo || 'none'} · job ${job?.name || 'none'}${job?.lastRun ? ' (ran)' : ''} · server ${server?.name || 'none'}`);
  if (job) await check('wp6-app-d7: on the preview a job changes nothing live - the D7 line shows; rename, description, Schedule, Duplicate, Trash and Run are off; the run peek and run page have no chat; only GETs reach /api', async () => {
    const page = await open(), writes = writes6(page);
    await loaded(page, `/apps/${job.name}`);
    await page.locator('[data-app-ops]').getByText(D7).waitFor({ timeout: 20000 });
    must(await page.locator('h1[title="Click to rename"], [title="Click to edit"]').count() === 0, 'rename or description editing is offered');
    await page.getByTitle('More').click();
    for (const name of ['Duplicate', 'Move to Trash']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) must(await b.isDisabled(), `${name} is enabled`); }
    must(await page.getByRole('button', { name: 'Schedule', exact: true }).count() === 0, 'Schedule is offered');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Run', exact: true }).click();
    must(await page.getByRole('button', { name: 'Run', exact: true }).isDisabled(), 'Run is enabled');
    if (job.lastRun) {
      await page.getByRole('tab', { name: 'Logs', exact: true }).click();
      await page.locator('tbody tr').first().click();
      await page.getByRole('button', { name: 'Copy run ID' }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      must(await ownComposers(page) === 0, 'the run peek offers live chat');
      await loaded(page, `/apps/${job.name}/runs/${job.lastRun.runId}`);
      await page.getByRole('heading', { name: /^Run / }).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(1000);
      must(await ownComposers(page) === 0, 'the run page offers live chat');
    }
    must(!writes.length, `writes: ${writes.join(', ')}`);
    await page.context().close();
  });

  await check('wp6-app-denied: a 403 app says no access, and in solo v1 names no owner to ask and offers no Request access', async () => {
    const page = await open(), writes = writes6(page);
    await page.route('**/api/apps/rabbit-hole-check-denied', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'no access', owner: 'owner@example.com' }) }));
    await loaded(page, '/apps/rabbit-hole-check-denied');
    await page.getByText(/have access\.$/).waitFor({ timeout: 20000 });
    must(await page.getByText('owner@example.com', { exact: false }).count() === 0, 'the denied page names an owner to ask');
    must(await page.getByRole('button', { name: 'Request access' }).count() === 0, 'Request access is offered');
    must(!writes.length, `writes: ${writes.join(', ')}`);
    await page.context().close();
  });

  if (plain) await check('wp6-app-bar: an app page lands on Runbook with the bar naming the app; an app ask is off and reaches no /api/ask; the Graph tab has no composer of its own; ?tab=logs deep-links; a server has no Run', async () => {
    const page = await open();
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') asks++; });
    await loaded(page, `/apps/${plain.name}`);
    await barOf(page).locator('[data-scope-chip="resource"]').getByText(plain.name, { exact: true }).waitFor({ timeout: 20000 });
    must(await isSelected(page.getByRole('tab', { name: 'Runbook', exact: true })), 'the app does not land on Runbook');
    await barInput(page).fill('what does this app do?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText(ASK_OFF).waitFor({ timeout: 10000 });
    await page.getByRole('tab', { name: 'Graph', exact: true }).click();
    await page.getByText('Questions about this app go through the bar below.').waitFor({ timeout: 10000 });
    must(await composers(page) === 1 && await page.getByRole('heading', { name: 'Graph Agent' }).count() === 0, 'the Graph tab keeps its own composer');
    await loaded(page, `/apps/${plain.name}?tab=logs`);
    await page.getByRole('tab', { name: 'Logs', exact: true, selected: true }).waitFor({ timeout: 20000 });
    if (server) {
      await loaded(page, `/apps/${server.name}`);
      await page.getByRole('tab', { name: 'Runbook', exact: true }).waitFor({ timeout: 20000 });
      must(await page.getByRole('tab', { name: 'Run', exact: true }).count() === 0, 'a server offers Run');
    }
    must(asks === 0, `${asks} requests reached /api/ask`);
    await page.context().close();
  });

  await check('wp6-canvas: a canvas opens straight into Learn under a light row with its title; a project canvas names its project, which opens; content from another browser shows the not-in-this-browser state at /apps/<c> and ?tab=learn and never mounts Learn', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, '/library');
    const solo = await canvas6(page, { title: 'wp6 standalone' });
    const owned = ready && await canvas6(page, { title: 'wp6 owned', project: ready.name });
    const away = await canvas6(page, { title: 'wp6 away', ...(ready ? { project: ready.name } : {}), device_id: 'rabbit-hole-check-device' });
    try {
      await loaded(page, `/apps/${solo.name}`);
      await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
      await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 }); // Learn's composer mounts just after the canvas
      const row = page.locator('[data-canvas-parent]');
      // One title: Learn's header names the canvas (an editable input there); smart-home's row only links a parent project (user, WP6 closeout).
      const titles = (t) => page.evaluate((t) => [...document.querySelectorAll('body *')].filter((n) => n.offsetParent !== null && (n.matches('input, textarea') ? n.value === t : n.childElementCount === 0 && n.textContent.trim() === t)).length, t);
      must(await row.count() === 0, 'a standalone canvas has a parent row');
      must(await titles('wp6 standalone') === 1, `the canvas title shows ${await titles('wp6 standalone')} times`);
      must(await composers(page) === 1 && await barOf(page).count() === 0 && await page.getByRole('tab', { name: 'Runbook' }).count() === 0, 'not Learn, or the generic app page');
      if (owned) {
        await loaded(page, `/apps/${owned.name}`);
        await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
        must(await titles('wp6 owned') === 1 && !(await row.innerText()).includes('wp6 owned'), `the project canvas title shows ${await titles('wp6 owned')} times`);
        await row.getByRole('button', { name: `In ${ready.repo} →` }).click();
        await page.waitForURL(`**/apps/${ready.name}`);
      }
      for (const q of ['', '?tab=learn']) {
        await loaded(page, `/apps/${away.name}${q}`);
        const gate = page.locator('[data-canvas-gate]');
        await gate.getByRole('heading', { name: NOT_HERE }).waitFor({ timeout: 20000 });
        await gate.getByText(NOT_HERE_WHY).waitFor();
        must(await composers(page) === 0 && await page.getByLabel('Lesson canvas').count() === 0, `Learn mounted behind the gate${q}`);
        must(await page.evaluate((k) => localStorage.getItem(k), canvasKeys({ org: away.org, email, slug: away.name }).ink) === null, 'Learn wrote the foreign canvas');
      }
      if (ready) { await page.locator('[data-canvas-gate]').getByRole('button', { name: 'Open project' }).click(); await page.waitForURL(`**/apps/${ready.name}`); }
    } finally { for (const c of [solo, owned, away].filter(Boolean)) await drop6(page, c.name); await page.context().close(); }
  });

  // No Overview (owner, 2026-10-04, project-map-learn.md Layout): a project is Map or Learn. /apps/<repo>, its old aliases and
  // an old ?tab=overview link land on the Map; only ?tab=learn opens Learn, which has no project pill, and its Map icon goes back.
  if (ready) await check('wp6-project: bare /apps/<project> is the Graph, under one Files | Graph | Learn navigation (repository-browser.md) and no Overview; map, code, graph, agent and an old ?tab=overview open the Graph; Learn has one composer and no project tabs, its Map icon returns to the Map, and on a phone ?tab=learn opens Learn below the top strip', async () => {
    const page = await open();
    await loaded(page, `/apps/${ready.name}`);
    await page.getByRole('textbox', { name: 'Search repository' }).waitFor({ timeout: 20000 });
    const tabs = (await page.locator('[data-project-tabs]').getByRole('tab').allInnerTexts()).map((t) => t.trim()).join(' | ');
    must(tabs === 'Files | Graph | Learn' && await isSelected(ptab(page, 'Graph')), `bare /apps/<project> shows ${tabs}, not the Graph of Files | Graph | Learn`);
    for (const t of ['map', 'code', 'graph', 'agent', 'overview']) {
      await spa(page, `/apps/${ready.name}?tab=${t}`);
      await page.getByRole('textbox', { name: 'Search repository' }).waitFor({ timeout: 20000 });
      must(await isSelected(ptab(page, 'Graph')), `?tab=${t} is not the Graph`);
    }
    await ptab(page, 'Learn').click();
    await page.waitForURL(/[?]tab=learn$/);
    await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
    must(await page.locator('[data-project-tabs]').count() === 0 && await composers(page) === 1 && await barOf(page).count() === 0, 'Learn shows project tabs, or has two composers');
    // On the Main canvas the Map icon opens the repository's Files in the panel, which links on to the Map (owner, 2026-10-08).
    await page.locator('[data-learn-map]').click();
    await page.locator('[data-learn-files] [data-file-tree]').waitFor({ timeout: 10000 });
    await page.locator('[data-learn-open-map]').click();
    await page.waitForURL(/[?]tab=map$/);
    await page.context().close();
    const phone = await open({ width: 390, height: 844 });
    await loaded(phone, `/apps/${ready.name}?tab=learn`);
    await phone.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
    must(await phone.locator('[data-project-tabs]').count() === 0, '?tab=learn did not open Learn');
    must((await phone.locator('[data-learn-map]').boundingBox()).y >= 40, 'Learn starts under the phone top strip');
    await phone.context().close();
  });

  // The canvas switcher in Learn's header (docs/features/project-canvases.md) replaced the plain picker. A canvas made in
  // another browser now opens too: its board is made with its row (canvas-persistence.md), so the not-in-this-browser gate
  // is reachable only by canvases older than that, which no API can make (project-canvases-check.mjs covers the rest locally).
  if (ready) await check('wp6-learn: the canvas switcher lists Main canvas and this project canvases; a pick stays in the project frame at ?tab=learn&canvas=, from this browser or another', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, `/apps/${ready.name}`);
    const owned = await canvas6(page, { title: 'wp6 learn owned', project: ready.name });
    const away = await canvas6(page, { title: 'wp6 learn away', project: ready.name, device_id: 'rabbit-hole-check-device' });
    const pick = async (name) => { await page.locator('[data-canvas-switcher]').click(); await page.locator(`[data-canvas-option="${name}"]`).click(); };
    try {
      await loaded(page, `/apps/${ready.name}?tab=learn`);
      await page.locator('[data-canvas-switcher]').waitFor({ timeout: 30000 });
      await page.locator('[data-canvas-switcher]').click();
      const options = (await page.locator('[data-canvas-option]').allInnerTexts()).map((t) => t.trim());
      for (const t of ['Main canvas', 'wp6 learn owned', 'wp6 learn away']) must(options.includes(t), `switcher: ${options.join(' | ')}`);
      await page.keyboard.press('Escape');
      for (const c of [owned, away]) {
        await pick(c.name);
        await page.waitForURL(new RegExp(`[?]tab=learn&canvas=${c.name}$`));
        await page.getByLabel('Lesson canvas').waitFor({ timeout: 30000 });
        await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 }); // Learn's composer mounts just after the canvas
        must(await page.locator('[data-project-tabs]').count() === 0 && await composers(page) === 1 && await page.locator('[data-learn-map]').count() === 1, `${c.title} left the project frame`);
      }
    } finally { await drop6(page, owned.name); await drop6(page, away.name); await page.context().close(); }
  });

  // Since the dock (inspector.md, workspace-dock.md, project-map-learn.md): a project opens on the Map (no Overview); the side
  // panel is the Inspector, closed until something is selected; answers open in the bar's window, which sits over the
  // workspace beside an open inspector, and the inspector keeps the conversation about its object.
  if (ready) await check('wp6-map: a project opens on the Map; its side panel is the Inspector, closed until a selection, with no input; a Map ask opens in the answer window, never the inspector; a node opens the inspector on Overview | Source | Chat with path:line, in context; its ask streams into the node\'s Chat tab, which Send opens and counts, and only its error reaches the window (owner, 2026-10-08); one composer', async () => {
    const page = await open(), writes = writes6(page);
    let asks = 0;
    await page.route('**/api/learn/ask', (r) => { asks++; return r.abort(); }); // no model call, no LEARN_DB thread
    await loaded(page, `/apps/${ready.name}`);
    await barOf(page).locator('[data-scope-chip="resource"]').waitFor({ timeout: 20000 }); // the project scope is registered before anything is sent
    must(await isSelected(ptab(page, 'Graph')), 'the project does not open on the Graph');
    const panel = page.locator('[data-map-panel]'), sheet = page.locator('[data-result-sheet]');
    must(await panel.getAttribute('aria-label') === 'Inspector', 'the panel is not the Inspector');
    await page.locator('[data-map-panel-open]').waitFor({ timeout: 10000 }); // closed until something is selected
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    await sheet.getByText('Which file defines the model?').waitFor({ timeout: 10000 });
    must(await panel.getByText('Which file defines the model?').count() === 0, 'a Map ask landed in the inspector');
    must(await panel.locator('input, textarea, [contenteditable="true"]').count() === 0 && await composers(page) === 1, 'a second input');
    await barInput(page).fill(''); // the aborted ask kept its draft, and a waiting draft would offer Use selection instead of retargeting
    await pickNode(page);
    await panel.locator('[data-inspector-header]').getByText(/^model\.py:\d+$/).waitFor({ timeout: 10000 });
    const tabs = (await panel.getByRole('tab').allInnerTexts()).map((t) => t.trim()).join(' | ');
    // Overview is hidden for now (src/inspector.js OVERVIEW_TAB): a node opens Source | Chat on Chat.
    const first = OVERVIEW_TAB ? 'Overview' : 'Chat', want = OVERVIEW_TAB ? 'Overview | Source | Chat' : 'Source | Chat';
    must(tabs === want && await isSelected(panel.getByRole('tab', { name: first, exact: true })), `a node opens ${tabs}, not ${want} on ${first}`);
    must(await panel.locator('[data-in-context]').count() === 1, 'the node is not in context');
    must(await barInput(page).getAttribute('placeholder') === 'Ask about CausalSelfAttention…', 'the bar is not scoped to the node');
    await barInput(page).fill('Why does this exist?');
    await barInput(page).press('Enter');
    const chatTab = panel.locator('[data-inspector-chat-tab]');
    await panel.locator('[data-inspector-chat]').getByText('Why does this exist?').waitFor({ timeout: 10000 });
    must(await isSelected(chatTab), 'Send did not open the Chat tab');
    await chatTab.getByText('2').waitFor({ timeout: 10000 }); // Chat 2: the question and its (aborted) answer
    // The aborted ask's error is the window's; the question itself never is.
    await sheet.getByText("Couldn't reach the server.", { exact: false }).first().waitFor({ timeout: 10000 });
    must(await sheet.getByText('Why does this exist?').count() === 0, 'the node question landed in the window');
    const win = await page.locator('[data-result-sheet] > div').boundingBox(), side = await panel.boundingBox();
    must(win.x + win.width <= side.x + 1, `the window covers the inspector: ${win.x + win.width} > ${side.x}`);
    await page.waitForTimeout(1000);
    must(asks === 2 && !writes.length, `${asks} asks; writes: ${writes.join(', ')}`);
    await page.context().close();
  });

  // A project is Map or Learn, and Learn has no project pill; its strip's Map icon goes back (project-map-learn.md).
  if (ready) await check('wp6-learn-this: Learn this and /teach this open the project Learn carrying the node and send nothing; Learn shows no project tabs, and its Map icon returns to the Map with the node still in context', async () => {
    const page = await open();
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/learn/ask') asks++; });
    await loaded(page, `/apps/${ready.name}?tab=map`);
    await pickNode(page);
    await page.locator('[data-map-panel]').getByRole('button', { name: 'Learn this' }).click();
    await page.waitForURL(/[?]tab=learn$/);
    await page.getByText(/^Asking about: CausalSelfAttention/).first().waitFor({ timeout: 30000 }); // Learn's own pill: it shows only what Learn sends (LearnPage.jsx:310,897)
    await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 }); // Learn's composer mounts just after the frame
    must(await page.locator('[data-learn-context]').count() === 0, 'a second context label beside Learn');
    must(await page.locator('[data-project-tabs]').count() === 0 && await composers(page) === 1 && await barOf(page).count() === 0, 'not the project Learn frame');
    await page.locator('[data-learn-map]').click();
    await page.locator('[data-learn-open-map]').click(); // the icon opens Files in the panel; it links on to the Map (owner, 2026-10-08)
    await page.waitForURL(/[?]tab=map$/);
    await barOf(page).locator('[data-scope-chip="selected"]', { hasText: 'CausalSelfAttention' }).waitFor({ timeout: 10000 });
    await barInput(page).fill('/teach this');
    await barInput(page).press('Enter');
    await page.waitForURL(/[?]tab=learn$/);
    await page.getByText(/^Asking about: CausalSelfAttention/).first().waitFor({ timeout: 30000 });
    must(await page.evaluate(() => sessionStorage.getItem('small.learn.request')) === null && asks === 0, 'a Learn request or ask was sent');
    await page.context().close();
  });

  // No Overview (owner, 2026-10-04, project-map-learn.md Layout): an old ?tab=overview link lands on the Map, which names the
  // repository and keeps its details behind one info icon. Overview's Continue learning, canvas list and recent activity went
  // with it; the project's canvases are Learn's picker (wp6-learn).
  if (ready) await check('wp6-overview: an old ?tab=overview link lands on the Map, which names the repository; its GitHub source, branch, commit and status sit behind one info icon, with no operational clutter at rest; nothing written', async () => {
    const page = await open();
    await noAsks(page);
    const writes = writes6(page);
    await loaded(page, `/apps/${ready.name}?tab=overview`);
    await page.getByRole('textbox', { name: 'Search repository' }).waitFor({ timeout: 20000 });
    must(await isSelected(ptab(page, 'Graph')), '?tab=overview is not the Graph');
    await page.getByRole('heading', { level: 1, name: ready.repo, exact: true }).waitFor({ timeout: 10000 });
    for (const clutter of ['Refresh branch', 'Last run']) must(await page.locator('main').getByText(clutter).count() === 0, `${clutter} on the Map at rest`);
    must(await page.locator('[data-repo-details]').count() === 0, 'the repository details show before the info icon');
    await page.locator('[data-repo-info]').click();
    const details = page.locator('[data-repo-details]');
    await details.waitFor({ timeout: 5000 });
    must(await details.locator('a[data-source-link]').getAttribute('href') === `https://github.com/${ready.repo}`, 'no GitHub source link');
    const text = await details.innerText();
    for (const want of [ready.branch, `Commit ${ready.commit_sha.slice(0, 7)}`, `Status: ${ready.status}`]) must(text.includes(want), `the details lack ${want}: ${text}`);
    await page.keyboard.press('Escape');
    must(!writes.length, `the Map wrote: ${writes.join(', ')}`);
    await page.context().close();
  });

  if (job) await check('wp6-app-ops: a job shows its last run with status, runtime and an Outputs link to that run (or Never run); a server shows neither', async () => {
    const page = await open();
    await loaded(page, `/apps/${job.name}`);
    const line = page.locator('[data-last-run]');
    await line.waitFor({ timeout: 20000 });
    const text = await line.innerText();
    if (!job.lastRun) must(text === 'Never run', text);
    else {
      must(text.startsWith('Last run') && text.includes(job.lastRun.status), text);
      await line.getByRole('button', { name: 'Outputs →' }).click();
      await page.waitForURL(`**/apps/${job.name}/runs/${job.lastRun.runId}`);
    }
    if (server) {
      await loaded(page, `/apps/${server.name}`);
      await page.locator('[data-app-ops]').waitFor({ timeout: 20000 });
      must(await page.locator('[data-last-run]').count() === 0, 'a server shows a last run');
    }
    await page.context().close();
  });

  if (plain && repo && /^karpathy\/nanogpt$/i.test(repo.repo || '')) await check('wp6-built-from: Built from shows only with ?fixtures=1, labelled Fixture · UI preview, and opens the project Overview; never inferred from the app repository', async () => {
    const page = await open();
    await loaded(page, `/apps/${plain.name}`);
    await page.locator('[data-app-ops]').waitFor({ timeout: 20000 });
    must(await page.locator('[data-built-from]').count() === 0, 'Built from without ?fixtures=1');
    await loaded(page, `/apps/${plain.name}?fixtures=1`);
    const from = page.locator('[data-built-from]');
    await from.getByText('Fixture · UI preview').waitFor({ timeout: 20000 });
    await from.getByRole('button', { name: `Built from ${repo.repo} →` }).click();
    await page.waitForURL(`**/apps/${repo.name}`);
    await ptab(page, 'Overview').waitFor({ timeout: 20000 });
    await page.context().close();
  });

  await check('wp6-mobile: at 390px Overview, Map, project Learn, a canvas and an app page scroll only vertically and start below the top strip', async () => {
    const page = await open({ width: 390, height: 844 });
    await noAsks(page);
    await loaded(page, '/library');
    const c = await canvas6(page, { title: 'wp6 phone', ...(ready ? { project: ready.name } : {}) });
    try {
      const stops = [...(ready ? ['', '?tab=map', '?tab=learn'].map((q) => [`/apps/${ready.name}${q}`, '[data-project-tabs]']) : []), [`/apps/${c.name}`, '[data-canvas-parent]'], ...(plain ? [[`/apps/${plain.name}`, 'main h1']] : [])];
      for (const [path, top] of stops) {
        await loaded(page, path);
        await page.locator(top).first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(800);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); // as sh-shots measures it
        must(wide <= 0, `${path} scrolls sideways by ${wide}px`);
        must((await page.locator(top).first().boundingBox()).y >= 40, `${path}: ${top} sits under the top strip`);
      }
    } finally { await drop6(page, c.name); await page.context().close(); }
  });

  if (job) await check('wp6-library-d7: on the preview the Library Run panel cannot start a live run and its runbook is read-only; a pinned job offers no live Rename, Duplicate or Trash; only GETs reach /api', async () => {
    const page = await open(), writes = writes6(page);
    await loaded(page, '/library?type=apps');
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`small.pinned:${data.org}:${email}`, JSON.stringify([job.name])]);
    await loaded(page, '/library?type=apps');
    const row = page.locator('tbody tr').filter({ hasText: job.name }).first();
    await row.waitFor({ timeout: 20000 });
    await row.hover();
    await row.getByRole('button', { name: 'Run', exact: true }).click();
    const run = page.getByRole('tabpanel').getByRole('button', { name: /^Run( batch)?/ }).first();
    await run.waitFor({ timeout: 20000 });
    must(await run.isDisabled(), 'the Library panel Run is enabled');
    await page.getByRole('tab', { name: 'Runbook', exact: true }).click();
    await page.waitForTimeout(2000);
    must(await page.getByRole('tabpanel').locator('[contenteditable="true"]').count() === 0, 'the panel runbook is editable');
    await page.keyboard.press('Escape');
    const pinned = page.locator('aside').getByRole('region', { name: 'Pinned' }).locator('.group\\/r').filter({ hasText: job.name }).first();
    await pinned.hover();
    await pinned.getByTitle('More').click();
    must(await page.getByRole('button', { name: 'Rename', exact: true }).count() === 0, 'Rename is offered');
    for (const name of ['Duplicate', 'Move to Trash']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) must(await b.isDisabled(), `${name} is enabled`); }
    must(!writes.length, `writes: ${writes.join(', ')}`);
    await page.context().close();
  });

  // No Overview (project-map-learn.md): a project opens on the Map, so a graph answer shows on the graph it was asked beside,
  // and stays in the bar's window, never the inspector (inspector.md §6).
  if (ready) await check('wp6-show-on-graph: a graph answer on the Map opens in the answer window and shows its nodes on the graph; once a search moves the graph on, Show on graph brings the answer back; the answer never lands in the inspector', async () => {
    const page = await open();
    await loaded(page, `/apps/${ready.name}`);
    await barOf(page).locator('[data-scope-chip="resource"]').waitFor({ timeout: 20000 });
    const snap = (await api6(page, `/api/repositories/${ready.name}/snapshot`)).data;
    const node = snap.graph.nodes.find((n) => n.label === 'CausalSelfAttention') || snap.graph.nodes[0];
    const view = { id: 'g-wp6', commit: snap.commit, kind: 'explain_symbol', title: node.label, nodes: [{ ...node, commit: snap.commit }], edges: [] };
    const sse = [['chunk', { text: 'It is defined in model.py.' }], ['graph', view], ['done', {}]].map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`).join('');
    await page.route('**/api/learn/ask', (r) => r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })); // no model call
    await barInput(page).fill('Where is attention defined?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.getByText('It is defined in model.py.').waitFor({ timeout: 10000 });
    const shown = () => page.locator('[data-graph-node]').evaluateAll((all) => all.map((n) => n.dataset.graphNode).join());
    await page.locator(`[data-graph-node="${node.id}"]`).waitFor({ timeout: 10000 });
    must(await shown() === node.id, `the graph shows ${await shown()}, not the answer's ${node.id}`);
    await page.getByRole('textbox', { name: 'Search repository' }).fill('train');
    await page.waitForTimeout(500);
    must(await shown() !== node.id, 'the search did not move the graph on');
    await sheet.getByRole('button', { name: 'Show on graph' }).click();
    await page.waitForTimeout(500);
    must(await shown() === node.id, `Show on graph shows ${await shown()}, not the answer's ${node.id}`);
    must(await page.locator('[data-map-panel]').getByText('It is defined in model.py.').count() === 0, 'the answer landed in the inspector');
    await page.context().close();
  });

  await check('wp6-composer-parity: the Learn composer is the Mothership shell - same height, radius, border, Send and + size (the dock is flat at rest since 2026-10-06, so the resting shadow differs); canvas controls never overlap it; no canvas slug or sample course title; on a phone it sits fully on screen', async () => {
    // Measured in the same focus state on both sides: blurred, then focused (Learn autofocuses its composer).
    const shell = async (form, focused = false) => form.evaluate((n, focused) => {
      if (focused) n.querySelector('textarea, input:not([type="file"]):not([type="hidden"])')?.focus(); else document.activeElement?.blur(); // the text field, not Learn's hidden file input
      const s = getComputedStyle(n), send = n.querySelector('button[aria-label="Send"], button[aria-label="Stop"]'), add = n.querySelector('button[aria-label="Add"]');
      const r = n.getBoundingClientRect();
      return { h: Math.round(r.height), gap: Math.round(innerHeight - r.bottom), radius: s.borderTopLeftRadius, border: s.borderTopColor, shadow: s.boxShadow, send: send && Math.round(send.getBoundingClientRect().width), add: add && Math.round(add.getBoundingClientRect().height), box: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } };
    }, focused);
    const overlaps = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await open(viewport);
      await noAsks(page);
      await loaded(page, '/apps');
      const bar = await shell(barOf(page).locator('[data-chat-composer]'));
      const barFocused = await shell(barOf(page).locator('[data-chat-composer]'), true);
      const c = await canvas6(page, { title: 'wp6 parity canvas' });
      try {
        await loaded(page, `/apps/${c.name}`);
        const form = page.locator('[data-chat-composer]').first();
        await form.waitFor({ timeout: 30000 });
        await page.waitForTimeout(1000);
        const learn = await shell(form);
        const where = `${viewport.width}px`;
        for (const k of ['radius', 'border', 'send', 'add']) must(learn[k] === bar[k], `${where}: Learn ${k} ${learn[k]} vs Mothership ${bar[k]}`);
        const learnFocused = await shell(form, true);
        for (const k of ['border', 'shadow']) must(learnFocused[k] === barFocused[k], `${where}, focused: Learn ${k} ${learnFocused[k]} vs Mothership ${barFocused[k]}`);
        must(Math.abs(learn.h - bar.h) <= 2, `${where}: Learn height ${learn.h} vs Mothership ${bar.h}`);
        must(Math.abs(learn.gap - bar.gap) <= 2, `${where}: Learn sits ${learn.gap}px above the bottom edge, the Mothership ${bar.gap}px (the shared DOCK_PAD footprint and safe area)`);
        const zoom = await page.getByRole('button', { name: 'Add section' }).first().boundingBox().catch(() => null);
        must(!overlaps(learn.box, zoom && { top: zoom.y, bottom: zoom.y + zoom.height, left: zoom.x, right: zoom.x + zoom.width }), `${where}: the zoom bar overlaps the Learn composer`);
        must(learn.box.top >= 0 && learn.box.bottom <= viewport.height, `${where}: the Learn composer is off screen (${learn.box.top}-${learn.box.bottom})`);
        const placeholder = await form.locator('textarea, input:not([type="file"]):not([type="hidden"])').first().getAttribute('placeholder');
        must(placeholder, `${where}: the composer text field has no placeholder`);
        must(!/canvas-[a-f0-9]{8}/.test(placeholder || ''), `${where}: the composer shows the canvas slug: ${placeholder}`);
        must(await page.getByText('From classification to object detection').count() === 0, `${where}: the sample course title shows on a canvas`);
      } finally { await drop6(page, c.name); await page.context().close(); }
    }
  });

  await check('wp6-learn-chrome: a fresh canvas shows no sample lesson; on a phone, project Learn keeps every menu item on screen or in a row that scrolls on purpose, no drawing tool cut by the toolbar edge and the last one reachable, the drawing tools clear of the zoom controls, and the composer fully visible', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, '/library');
    const c = await canvas6(page, { title: 'wp6 fresh canvas', ...(ready ? { project: ready.name } : {}) });
    try {
      await loaded(page, `/apps/${c.name}`);
      await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(1500);
      const sample = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((n) => n.offsetParent !== null && n.childElementCount === 0 && /Lesson 1: Logistic regression/i.test(n.textContent)).length);
      must(sample === 0, 'a fresh canvas shows the sample Logistic regression lesson');
      if (ready) await phoneChrome(); // with the canvas kept, project Learn shows its canvas picker, as a real project does
    } finally { await drop6(page, c.name); await page.context().close(); }
  });

  // The phone half of wp6-learn-chrome. Its caller keeps a project canvas alive, so the picker row takes its
  // real height; without one the toolbar has 48px more room and a cut control never shows.
  async function phoneChrome() {
    const phone = await open({ width: 390, height: 844 });
    await noAsks(phone);
    await loaded(phone, `/apps/${ready.name}?tab=learn`);
    const composer = phone.locator('[data-chat-composer]').first();
    await composer.waitFor({ timeout: 30000 });
    await phone.waitForTimeout(1500);
    const clipped = await phone.evaluate(() => {
      const names = /^(Files|Insert|Edit|Arrange|View)\b/;
      const scrolls = (n) => { for (let p = n.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      return [...document.querySelectorAll('main button')].filter((b) => b.offsetParent !== null && names.test(b.textContent.trim())).filter((b) => {
        const r = b.getBoundingClientRect();
        return (r.left < 0 || r.right > innerWidth) && !scrolls(b);
      }).map((b) => b.textContent.trim());
    });
    must(!clipped.length, `Learn menu items render partly off screen: ${clipped.join(', ')}`);
    const box = async (loc) => ((await loc.count()) ? loc.first().boundingBox() : null);
    const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const tools = await box(phone.getByRole('toolbar', { name: 'Canvas tools' }));
    const zoom = await box(phone.locator('[data-zoom]'));
    must(!overlap(tools, zoom) && (!tools || !zoom || zoom.y - (tools.y + tools.height) >= 8), `the drawing tools sit on the zoom controls (gap ${tools && zoom ? Math.round(zoom.y - tools.y - tools.height) : '-'}px)`);
    // A control is cut when a clipping ancestor inside the toolbar shows part of it. Scrolled fully out
    // of view is fine as long as scrolling to the end shows the last control whole.
    const cut = (end) => phone.evaluate((end) => {
      const bar = document.querySelector('[role="toolbar"][aria-label="Canvas tools"]');
      if (!bar) return { cut: [], last: true };
      const clips = [bar, ...bar.querySelectorAll('*')].filter((n) => getComputedStyle(n).overflowY !== 'visible');
      if (end) for (const n of clips) n.scrollTop = n.scrollHeight;
      const shown = (b) => {
        const q = b.getBoundingClientRect(); let top = q.top, bottom = q.bottom;
        for (let p = b.parentElement; p; p = p.parentElement) {
          if (clips.includes(p)) { const r = p.getBoundingClientRect(); top = Math.max(top, r.top + p.clientTop); bottom = Math.min(bottom, r.top + p.clientTop + p.clientHeight); }
          if (p === bar) break;
        }
        return [Math.max(0, bottom - top), q.height];
      };
      const controls = [...bar.querySelectorAll('button, [role="button"]')].filter((b) => b.offsetParent !== null);
      const last = controls.at(-1), [lastShown, lastH] = last ? shown(last) : [0, 0];
      return { cut: controls.filter((b) => { const [v, h] = shown(b); return v > 0.5 && v < h - 0.5; }).map((b) => b.getAttribute('aria-label') || b.title), last: !last || lastShown >= lastH - 0.5 };
    }, end);
    const rest = await cut(false);
    must(!rest.cut.length, `drawing tools cut by the toolbar edge: ${rest.cut.join(', ')}`);
    must((await cut(true)).last, 'scrolling the drawing tools to the end still does not show the last control whole');
    const cb = await composer.boundingBox();
    must(cb.y >= 0 && cb.y + cb.height <= 844 && !overlap(cb, zoom) && !overlap(cb, tools), 'the composer is covered or off screen');
    await phone.context().close();
  }

  await check('wp6-learn-immersive: a standalone canvas, a project canvas and project Learn show no sidebar or icon rail, Learn starts at the window edge, a top-left Home button clear of the page and no Open sidebar button, and Library keeps its sidebar', async () => {
    const page = await open();
    await noAsks(page);
    await loaded(page, '/library');
    const edge = () => page.evaluate(() => { const s = document.querySelector('[data-shell-sidebar]'); return { rail: Math.round(s?.getBoundingClientRect().width ?? 0), drawer: Math.round(s?.firstElementChild?.getBoundingClientRect().width ?? 0), left: Math.round(s?.nextElementSibling?.getBoundingClientRect().left ?? -1) }; });
    must((await edge()).rail > 0, 'Library lost its sidebar');
    const made = [await canvas6(page, { title: 'wp6 immersive canvas' })];
    try {
      if (ready) made.push(await canvas6(page, { title: 'wp6 immersive project canvas', project: ready.name }));
      const urls = [...made.map((c) => `/apps/${c.name}`), ...(ready ? [`/apps/${ready.name}?tab=learn`] : [])];
      for (const url of urls) {
        await loaded(page, url);
        await page.locator('[data-chat-composer]').first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(500);
        const at = await edge();
        must(at.rail === 0, `${url}: a sidebar or icon rail still takes ${at.rail}px`);
        must(at.left === 0, `${url}: Learn starts at x=${at.left}, not the window edge`);
        must(await page.getByRole('button', { name: 'Open sidebar' }).count() === 0, `${url}: Learn still shows an Open sidebar button`);
        const opener = page.locator('[data-learn-home]');
        const ob = await opener.boundingBox();
        must(ob && ob.x < 24 && ob.y < 24, `${url}: no Home button at the top left`);
        const under = await page.evaluate((b) => [...document.querySelector('[data-shell-sidebar]').nextElementSibling.querySelectorAll('button, a, input, select, span, h1, h2, p')]
          .filter((n) => { if (n.offsetParent === null) return false; const r = n.getBoundingClientRect(); return r.width && r.height && r.left < b.x + b.width && b.x < r.right && r.top < b.y + b.height && b.y < r.bottom; })
          .map((n) => n.getAttribute('aria-label') || n.textContent.trim().slice(0, 30) || n.tagName), ob);
        must(!under.filter((name) => name !== 'Home').length, `${url}: the Home button covers ${under.join(', ')}`);
      }
    } finally { for (const c of made) await drop6(page, c.name); await page.context().close(); }
  });

  // WP6 checkpoint 2: the Map's work-memory layers. Real behaviour without fixtures; labelled nanoGPT fixtures with ?fixtures=1.
  const nano = ready && /^karpathy\/nanogpt$/i.test(ready.repo || '');
  const FX = 'Fixture · UI preview';
  const held = (page) => { const asks = []; page.route('**/api/learn/ask', (r) => { asks.push(r.request().postDataJSON()); }); return asks; }; // never answered: no model call
  const mapAt = async (page, fixtures = false) => {
    await loaded(page, `/apps/${ready.name}?tab=map${fixtures ? '&fixtures=1' : ''}`);
    await page.locator('[data-graph-node]').first().waitFor({ timeout: 30000 });
  };
  // The layers sit behind one button (project-map-learn.md) and open beside the graph; open them before each use.
  const openLayers = async (page) => { if (!(await page.locator('[data-map-layers]').count())) await page.locator('[data-map-layers-open]').click(); };
  // Layers is a popover of node-type checkboxes since repository-browser.md (owner brief §3).
  const layer = (page, name) => page.locator('[data-map-layers]').getByRole('checkbox', { name: new RegExp(`^${name}`) });

  if (ready) await check('wp6-kg-layers: the Map shows Code only; behind the layers icon, without fixtures Decisions, Questions and Sessions are off as none recorded and nothing says Fixture; with ?fixtures=1 on nanoGPT, Decisions adds its 6 decision nodes, recorded links solid and inferred dashed, and the layer row says Fixture · UI preview', async () => {
    const page = await open();
    await noAsks(page);
    await mapAt(page);
    must(await page.locator('[data-memory-node]').count() === 0, 'the default Map shows work-memory nodes');
    await openLayers(page);
    for (const name of ['Decisions', 'Questions', 'Sessions']) must(await layer(page, name).isDisabled(), `${name} is on offer with nothing recorded`);
    must(!(await page.locator('main').innerText()).includes('Fixture'), 'the real Map says Fixture');
    await page.context().close();
    if (!nano) return;
    const fx = await open();
    await noAsks(fx);
    await mapAt(fx, true);
    await openLayers(fx);
    await layer(fx, 'Decisions').click();
    await fx.locator('[data-memory-node="decision"]').first().waitFor({ timeout: 10000 });
    must(await fx.locator('[data-memory-node="decision"]').count() === 6, `${await fx.locator('[data-memory-node="decision"]').count()} decision nodes, not 6`);
    must(await fx.locator('[data-memory-node="question"], [data-memory-node="session"]').count() === 0, 'questions or sessions show with only Decisions on');
    must(await fx.locator('[data-map-layers]').getByText(FX).isVisible(), 'the layer row does not say Fixture · UI preview');
    const lines = await fx.evaluate(() => [...document.querySelectorAll('[data-memory-edge]')].map((l) => [l.dataset.memoryEdge, l.getAttribute('stroke-dasharray')]));
    must(lines.some(([c, d]) => c === 'RECORDED' && !d) && lines.some(([c, d]) => c === 'INFERRED' && d), `recorded solid, inferred dashed: ${JSON.stringify(lines)}`);
    await fx.context().close();
  });

  // The inspector (inspector.md §3, Data gaps): Why it matters says "No explanation yet" with an ask, and lists the code's
  // fixture decisions on review builds; empty sections are omitted; fixture questions and sessions sit in Conversation.
  const insp = (page) => page.locator('[data-map-panel]');
  if (ready) await check('wp6-kg-selected: a selected code node opens the inspector; without fixtures Why it matters says No explanation yet with an ask, and nothing says Fixture; on nanoGPT fixtures CausalSelfAttention lists 2 decisions under Why it matters and 2 questions and 1 session under Conversation, labelled Fixture', async () => {
    const page = await open();
    await noAsks(page);
    await mapAt(page);
    await pickNode(page);
    if (OVERVIEW_TAB) await insp(page).locator('[data-inspector-section="why"]').getByText('No explanation yet.').waitFor({ timeout: 10000 });
    else await insp(page).locator('[data-inspector-chat]').waitFor({ timeout: 10000 });
    must(!(await insp(page).innerText()).includes('Fixture'), 'the real inspector says Fixture');
    await page.context().close();
    if (!nano) return;
    const fx = await open();
    await noAsks(fx);
    await mapAt(fx, true);
    await pickNode(fx);
    const why = insp(fx).locator('[data-inspector-section="why"]'), convo = insp(fx).locator('[data-inspector-chat]');
    if (OVERVIEW_TAB) {
      await why.getByText(FX).waitFor({ timeout: 10000 });
      must(await why.locator('button').count() === 2, `${await why.locator('button').count()} decisions under Why it matters, not 2`);
    }
    await insp(fx).locator('[data-inspector-chat-tab]').click(); // the node's conversation is its Chat tab (owner, 2026-10-08)
    const rows = (await convo.locator('button').allInnerTexts()).map((t) => t.trim()).filter((t) => !t.startsWith('Ask about this'));
    must(rows.length === 3 && rows.filter((t) => t.endsWith('?')).length === 2 && rows.filter((t) => t.startsWith('Attention internals walkthrough')).length === 1, `Conversation should list 2 questions and 1 session: ${rows.join(' | ')}`);
    must(await convo.getByText(FX).isVisible(), 'the fixture questions and sessions are not labelled');
    await fx.context().close();
  });

  if (nano) await check('wp6-kg-entity: with fixtures, a decision node opens its record in the inspector (rationale, alternatives, session, provenance, Fixture label); the bar keeps naming code, never the fixture; its code chip selects the code node, shown at model.py:29', async () => {
    const fx = await open();
    await noAsks(fx);
    await mapAt(fx, true);
    await pickNode(fx, 'LayerNorm');
    await fx.getByRole('textbox', { name: 'Search repository' }).fill(''); // pickNode's search would filter the decision out
    await openLayers(fx);
    await layer(fx, 'Decisions').click();
    await fx.locator('[data-graph-node="fx-d-fused-qkv"]').click();
    const card = insp(fx).locator('[data-memory-entity="decision"]');
    await card.waitFor({ timeout: 10000 });
    const text = await card.innerText();
    for (const want of ['Project Q, K and V with one Linear layer', 'One matmul instead of three', 'Three separate Linear layers', 'Attention internals walkthrough', FX]) must(text.includes(want), `the decision record lacks ${want}`);
    must((await barOf(fx).locator('[data-scope-chip="selected"]').innerText()).includes('LayerNorm'), 'selecting a fixture moved the bar off the code');
    await card.getByRole('button', { name: 'CausalSelfAttention', exact: true }).click();
    await barOf(fx).locator('[data-scope-chip="selected"]', { hasText: 'CausalSelfAttention' }).waitFor({ timeout: 10000 });
    await insp(fx).locator('[data-inspector-header]').getByText('model.py:29').waitFor({ timeout: 10000 });
    await fx.context().close();
  });

  // Owner, 2026-10-08: an Ask writes its question into the composer and focuses it; only Send asks.
  if (ready) await check('wp6-kg-starters: the empty inspector offers 5 starter prompts; one click writes it into the Mothership\'s composer and sends nothing; no text input appears in the inspector', async () => {
    const page = await open();
    const asks = held(page);
    await mapAt(page);
    await page.locator('[data-map-panel-open]').click(); // the inspector starts closed (project-map-learn.md)
    const starters = page.locator('[data-map-starters] button');
    must(await starters.count() === 5, `${await starters.count()} starter prompts, not 5`);
    await starters.filter({ hasText: 'Give me an architecture tour' }).click();
    await page.waitForTimeout(800);
    must(await barInput(page).inputValue() === 'Give me an architecture tour', `the composer holds: ${await barInput(page).inputValue()}`);
    must(asks.length === 0, `a starter sent: ${JSON.stringify(asks)}`);
    must(await page.locator('[data-map-panel] textarea, [data-map-panel] input[type="text"]').count() === 0, 'the panel grew a text input');
    await page.context().close();
  });

  if (ready) await check('wp6-kg-why: Ask why in the inspector writes "Why does <node> matter in this codebase?" into the composer and sends nothing; with nanoGPT fixtures a typed Why does this exist? answers in the answer window with no request, labelled Fixture, evidence in hierarchy order; a prior question in the inspector is written into the composer; a private session of another user never shows', async () => {
    const page = await open();
    const asks = held(page);
    await mapAt(page);
    await pickNode(page);
    // Ask why lives in the Overview, hidden for now (OVERVIEW_TAB).
    if (OVERVIEW_TAB) {
      await insp(page).locator('[data-inspector-section="why"]').getByRole('button', { name: 'Ask why →' }).click();
      await page.waitForTimeout(1200);
      must(/^Why does .+ matter in this codebase\?$/.test(await barInput(page).inputValue()), `the composer holds: ${await barInput(page).inputValue()}`);
      must(asks.length === 0, `Ask why sent: ${JSON.stringify(asks)}`);
    }
    await page.context().close();
    if (!nano) return;
    const fx = await open();
    const none = held(fx);
    await mapAt(fx, true);
    await pickNode(fx);
    // With fixture decisions, Why it matters lists them instead of an ask, so the learner asks in the bar, the only input.
    await barInput(fx).fill('Why does this exist?');
    await barInput(fx).press('Enter');
    const answer = insp(fx).locator('[data-inspector-chat]'); // a node's answer is its Chat's, never the window's (owner, 2026-10-08)
    await answer.getByText('2 recorded decisions explain why CausalSelfAttention looks like this.').waitFor({ timeout: 10000 });
    must(await answer.getByText(FX).first().isVisible(), 'the fixture answer is not labelled');
    const kinds = await answer.locator('[data-evidence] [data-evidence-kind]').evaluateAll((l) => l.map((n) => n.dataset.evidenceKind));
    const RANK = ['decision', 'question', 'session', 'code', 'inferred', 'model'];
    must(kinds.length && kinds[0] === 'decision' && kinds.every((k, i) => !i || RANK.indexOf(kinds[i - 1]) <= RANK.indexOf(k)), `evidence out of order: ${kinds}`);
    await answer.getByRole('button', { name: /square root of the head size/ }).click();
    await fx.waitForTimeout(400);
    must(/square root of the head size/.test(await barInput(fx).inputValue()), 'the prior question is not in the composer');
    await openLayers(fx);
    for (const name of ['Decisions', 'Questions', 'Sessions']) if (!(await layer(fx, name).isChecked())) await layer(fx, name).click();
    await fx.waitForTimeout(800);
    const all = await fx.locator('body').innerText();
    must(!/Private debugging session|generate slow down/.test(all), 'a private record of another user shows');
    must(none.length === 0, `fixture answers made ${none.length} model requests`);
    await fx.context().close();
  });

  // WP7 (user, 2026-09-29): report a bug or suggest a feature from the bottom of the left strip - Learn's FeedbackButton,
  // app-less. The report is intercepted here (201), so the check stores nothing.
  await check('wp7-feedback-rail: the sidebar and its icon rail end with a feedback button below Trash; its panel opens fully on screen beside the strip; Bug/Idea and Submit send one app-less report and the button confirms; on a phone the drawer has it too', async () => {
    for (const [label, viewport, setup] of [
      ['expanded', undefined, null],
      ['rail', undefined, 'rail'],
      ['phone drawer', { width: 390, height: 844 }, 'drawer'],
    ]) {
      const page = await open(viewport);
      const sent = [];
      await page.route('**/api/learn/feedback', (r) => { sent.push(r.request().postDataJSON()); r.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"check"}' }); });
      if (setup === 'rail') await page.addInitScript(() => localStorage.setItem('small.sidebar', 'closed'));
      await loaded(page, '/library');
      if (setup === 'drawer') await page.getByRole('button', { name: 'Open sidebar' }).click();
      const button = page.locator('aside [data-feedback]');
      await button.waitFor({ timeout: 15000 });
      const trash = await page.locator('aside').getByRole('button', { name: 'Trash' }).boundingBox();
      const b = await button.boundingBox();
      must(b.y >= trash.y + trash.height, `${label}: the feedback button is not below Trash`);
      await button.click();
      const panel = page.locator('[data-feedback-panel]');
      await panel.waitFor({ timeout: 5000 });
      const p = await panel.boundingBox(), size = page.viewportSize();
      must(p.x >= 0 && p.y >= 0 && p.x + p.width <= size.width && p.y + p.height <= size.height, `${label}: the panel runs off screen`);
      const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-feedback-panel]'), { x: p.x + p.width / 2, y: p.y + p.height / 2 });
      must(hit, `${label}: the panel is clipped or covered`);
      await panel.getByRole('radio', { name: 'Suggest a feature' }).click();
      await panel.locator('textarea').fill('wp7 check: feedback from the sidebar');
      await panel.getByRole('button', { name: 'Submit' }).click();
      await page.locator('aside [data-feedback][title="Sent, thank you"]').waitFor({ timeout: 5000 });
      must(sent.length === 1 && sent[0].app === null && sent[0].kind === 'idea' && sent[0].text === 'wp7 check: feedback from the sidebar', `${label}: reports sent: ${JSON.stringify(sent)}`);
      await page.context().close();
    }
  });

  // WP7 QA: the Map graph stays usable on a phone and follows the dark theme.
  if (ready) await check('wp7-map-phone-dark: on a phone the Map graph keeps at least 300px of height; in the dark theme its surface is dark and its labels light, at desktop width', async () => {
    const phone = await open({ width: 390, height: 844 });
    await noAsks(phone);
    await loaded(phone, `/apps/${ready.name}?tab=map`);
    const graph = phone.getByRole('img', { name: 'Repository dependency graph' });
    await graph.waitFor({ timeout: 30000 });
    const h = await graph.evaluate((svg) => svg.parentElement.getBoundingClientRect().height); // the visible graph, not the clipped svg
    must(h >= 300, `the phone Map graph shows ${Math.round(h)}px`);
    await phone.context().close();
    const dark = await open();
    await dark.addInitScript(() => localStorage.setItem('small.theme', 'dark'));
    await noAsks(dark);
    await loaded(dark, `/apps/${ready.name}?tab=map`);
    await dark.getByRole('img', { name: 'Repository dependency graph' }).waitFor({ timeout: 30000 });
    await dark.waitForTimeout(800);
    const tones = await dark.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
      const svg = document.querySelector('svg[aria-label="Repository dependency graph"]');
      const label = svg.querySelector('[data-graph-node] text');
      return { dark: document.documentElement.classList.contains('dark'), surface: lum(getComputedStyle(svg.parentElement).backgroundColor), label: lum(getComputedStyle(label).fill) };
    });
    must(tones.dark && tones.surface < 0.25 && tones.label > 0.5, `dark Map graph: ${JSON.stringify(tones)}`);
    await dark.context().close();
  });

  // WP7 D7 (final review): the preview's own chrome never writes live small-cp. api() refuses every write the dev worker
  // does not serve itself (routes.js previewWriteAllowed), and the preview has no /chat page.
  await check('wp7-d7-chrome: on the preview (solo v1) /members is Home with no Members page and nothing written; /chat goes to /apps', async () => {
    const page = await open();
    const writes = [];
    // Every write is aborted here, so even a run against an unguarded build never reaches live small-cp.
    await page.route('**/api/**', (r) => { if (r.request().method() === 'GET') return r.continue(); writes.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`); return r.abort(); });
    await loaded(page, '/members');
    must(new URL(page.url()).pathname === '/apps', `/members stayed at ${new URL(page.url()).pathname}`);
    await page.getByRole('button', { name: 'Start a rabbit hole', exact: true }).first().waitFor({ timeout: 20000 });
    for (const name of ['Add person', 'New team']) must(await page.getByRole('button', { name }).count() === 0, `the preview offers ${name}`);
    await page.waitForTimeout(800);
    must(!writes.length, `writes reached the network: ${writes.join(', ')}`);
    await loaded(page, '/chat');
    must(new URL(page.url()).pathname === '/apps', `/chat stayed at ${new URL(page.url()).pathname}`);
    await page.context().close();
  });

  // WP7 (user, 2026-09-29): a deploy replaces the hashed chunks, so a tab opened before it gets a 404 on its next lazy chunk.
  // It reloads once and carries on; if the chunk still fails, it says so instead of going blank, and never loops.
  if (ready) await check('wp7-stale-chunk: a lazy chunk gone after a deploy reloads the page once and the project opens; a chunk that keeps failing shows an error, not a blank page, and reloads no more', async () => {
    for (const persistent of [false, true]) {
      const page = await open();
      let failed = 0, reloads = 0;
      await page.route('**/static/RepositoryPage-*.js', (r) => (persistent || !failed++ ? r.fulfill({ status: 404, body: 'gone' }) : r.continue()));
      await loaded(page, '/library');
      page.on('load', () => reloads++); // full page loads only; framenavigated also fires for the pushState step
      await spa(page, `/apps/${ready.name}`);
      if (!persistent) {
        await page.locator('[data-project-tabs]').waitFor({ timeout: 30000 });
        must(reloads === 1, `expected one reload, saw ${reloads}`);
      } else {
        await page.getByText("This page couldn't load", { exact: false }).waitFor({ timeout: 30000 });
        await page.waitForTimeout(4000);
        must(reloads === 1, `expected exactly one reload before the error, saw ${reloads}`);
      }
      await page.context().close();
    }
  });

  // Checks from Tasks 1-11 go here, in task order.
}

{
  // ── Solo v1 (user, 2026-09-29): Rabbit Hole v1 is solo-user only. A normal user meets no team, member, invitation,
  // role or shared-workspace administration. The backend routes stay (the live build uses them); this checks the UI. ──
  const TEAM_WORDS = /\b(members?|teammates?|teamspaces?|invite|invitations?|add someone|add person|manage team)\b/i;
  await check('solo-v1: Settings shows only solo sections - no People, Teamspaces or Admin; no pane mentions members, teams or invites; the workspace menu has no New workspace', async () => {
    const page = await open();
    await loaded(page, '/apps');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
    const dialog = settings(page);
    await dialog.waitFor({ timeout: 5000 });
    for (const name of ['People', 'Teamspaces', 'Admin']) must(await dialog.getByText(name, { exact: true }).count() === 0, `Settings shows ${name}`);
    for (const tab of ['Preferences', 'Notifications', 'General', 'Connections', 'Developer', 'Security', 'Identity']) {
      await dialog.getByText(tab, { exact: true }).first().click();
      await dialog.getByText(tab, { exact: true }).nth(1).waitFor({ timeout: 5000 }); // the pane title under the nav item
      await page.waitForTimeout(300); // General loads its data
      const words = (await dialog.innerText()).match(TEAM_WORDS);
      must(!words, `Settings → ${tab} says "${words?.[0]}"`);
    }
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('aside').getByTitle('Switch workspace').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ timeout: 5000 });
    must(await page.getByRole('button', { name: /New workspace/ }).count() === 0, 'the workspace menu offers New workspace');
    await page.context().close();
  });

  await check('solo-v1: Home, Library and Explore show no member, team or invite copy, and an app page has no Share popover', async () => {
    const page = await open();
    for (const path of ['/apps', '/library', '/library?type=apps', '/explore']) {
      await loaded(page, path);
      await page.waitForTimeout(1000);
      const words = (await page.locator('main').innerText()).match(TEAM_WORDS);
      must(!words, `${path} says "${words?.[0]}"`);
    }
    if (plain) {
      await loaded(page, `/apps/${plain.name}`);
      await page.getByRole('heading', { level: 1, name: plain.name, exact: true }).waitFor({ timeout: 20000 });
      must(await page.locator('main').getByRole('button', { name: 'Share', exact: true }).count() === 0, 'an app page offers Share');
      await loaded(page, `/apps/${plain.name}?share=1`); // the old sidebar link opens nothing
      await page.waitForTimeout(1000);
      must(await page.getByPlaceholder(/Add people by email/).count() === 0, '?share=1 opens a share-with-people popover');
    } else console.log('note: solo-v1 app page not exercised; the catalog has no job or server');
    await page.context().close();
  });
}

// ── journey checks: each area inserts its block above this line, wrapped in { } ──

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
