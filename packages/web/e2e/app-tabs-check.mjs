// Verifies dev app navigation: repositories open their canvas; regular server/job apps keep
// Runbook as their default and an explicit Graph tab with one Agent Bar (T02 section 12, D3).
// Run: node e2e/app-tabs-check.mjs. A missing regular app uses a labeled, read-only API fixture.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.tryrabbithole.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('RABBIT_HOLE_DEV_TEST_BYPASS missing from .env');
const login = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-tabs-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const apps = await (await fetch(`${base}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'small-tabs-check' } })).json();
const list = apps.apps || apps;
const repo = list.find((a) => a.kind === 'repository');
const existingPlain = list.find((a) => ['server', 'job'].includes(a.kind));
const plain = existingPlain || { name: 'ui-tabs-read-fixture', kind: 'server', org: apps.org, email: apps.email, owner_email: apps.email, members: [], teams: [], visibility: 'private', created_at: '2026-10-16 00:00:00', canEdit: false, runbook: null, url: 'https://example.invalid' };
if (!repo) throw new Error('Repository fixture missing: repository navigation must be exercised');
console.log(`regular app evidence: ${existingPlain ? 'actual dev app' : 'read-only API fixture (no regular app in this account)'}`);
console.log(`apps: ${list.length} · repo: ${repo?.name || 'none'} · plain: ${plain ? `${plain.name} (${plain.kind})` : 'none'}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
let fixtureReads = 0;
if (!existingPlain) await context.route(url => url.origin === new URL(base).origin && url.pathname === `/api/apps/${plain.name}`, route => {
  if (route.request().method() !== 'GET') return route.abort();
  fixtureReads++;
  return route.fulfill({ json: plain });
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', message => { if (message.type() === 'error') console.log('CONSOLEERROR:', message.text().slice(0, 800)); });
const failures = [];
const check = async (label, fn) => { try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} — ${e.message.split('\n')[0]}`); } };

// A repository opens on its canvas (repo-canvas-graph.md, owner 2026-10-15): no Files | Graph | Learn page, no repository
// heading or Graph Agent beside it. An old ?tab=code link opens the canvas with Files beside Chat, once.
if (repo) {
  await page.goto(`${base}/apps/${repo.name}?tab=code`);
  const companion = page.locator('aside[data-companion]');
  await check('repo: ?tab=code opens the canvas with Files beside Chat', async () => {
    await page.locator('[data-learn-files]').waitFor({ timeout: 20000 });
    if (await companion.locator('[data-companion-view="files"]').getAttribute('aria-pressed') !== 'true') throw new Error('Files not the open viewer');
  });
  await check('repo: no repository page tabs', async () => { if (await page.locator('[data-project-tabs]').count()) throw new Error('tab row found'); });
  await check('repo: the link becomes the plain canvas URL', async () => { await page.waitForURL((u) => !u.searchParams.has('tab'), { timeout: 5000 }); });
  await check('repo: badge opens GitHub', async () => {
    // The repository is one named dropdown (owner brief 2026-10-16 item 1): its GitHub link is the dropdown's first row.
    await page.locator('[data-repo-menu]').click({ timeout: 10000 });
    const href = await page.locator('[data-menu-button-open] a[data-repo-badge]').getAttribute('href', { timeout: 10000 });
    await page.keyboard.press('Escape');
    if (href !== `https://github.com/${repo.repo}`) throw new Error(`badge href ${href}`);
  });
  await check('repo: breadcrumb gone', async () => { if (await page.getByText(`Apps/${repo.repo}`).count()) throw new Error('crumb found'); });
  await page.screenshot({ path: 'e2e/shots/tabs-repo.png', fullPage: false });
}

if (plain) {
  await page.goto(`${base}/apps/${plain.name}`);
  try { await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 20000 }); }
  catch (error) {
    console.log('app mount diagnostic:', JSON.stringify({ pathname: new URL(page.url()).pathname, fixtureReads, text: (await page.locator('body').innerText()).slice(0, 1200) }));
    await page.screenshot({ path: 'e2e/shots/tabs-app-mount-failed.png', fullPage: false });
    throw error;
  }
  // docs/features/rabbit-hole-t02-spec.md section 12: Runbook landing replaces the old Graph default;
  // on Graph the Agent Bar replaces the Graph Agent input. Keep both navigation and composer coverage.
  await check('app: Runbook is default tab', async () => { if (await page.getByRole('tab', { name: 'Runbook', exact: true }).getAttribute('data-state') !== 'active') throw new Error('not active'); });
  await check('app: explicit Graph tab shows the blank canvas', async () => {
    await page.getByRole('tab', { name: 'Graph', exact: true }).click();
    await page.locator('[aria-label="App graph"]').waitFor({ timeout: 5000 });
    if (await page.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('data-state') !== 'active') throw new Error('Graph not active');
  });
  await check('app: Graph has one Agent Bar and no second Graph Agent composer', async () => {
    await page.locator('[data-agent-bar]').waitFor({ timeout: 10000 });
    if (await page.locator('[data-agent-bar]').count() !== 1) throw new Error('expected one Agent Bar');
    if (await page.getByRole('heading', { name: 'Graph Agent', exact: true }).count()) throw new Error('obsolete Graph Agent composer');
    if (await page.locator('[data-agent-bar] textarea').count() !== 1) throw new Error('expected one bar input');
  });
  await check('app: Runbook tab present', () => page.getByRole('tab', { name: 'Runbook', exact: true }).waitFor({ timeout: 5000 }));
  await check('app: legacy ?tab=agent maps to Graph', async () => {
    await page.goto(`${base}/apps/${plain.name}?tab=agent`);
    await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 15000 });
    if (await page.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('data-state') !== 'active') throw new Error('not active');
  });
  await page.screenshot({ path: 'e2e/shots/tabs-app.png', fullPage: false });
}

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
