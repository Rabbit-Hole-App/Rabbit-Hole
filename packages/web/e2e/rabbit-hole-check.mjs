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
const repo = apps.find((a) => a.kind === 'repository');
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

// ── journey checks: each area inserts its block above this line, wrapped in { } ──

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
