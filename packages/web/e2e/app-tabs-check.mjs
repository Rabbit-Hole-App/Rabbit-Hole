// Verifies the Graph-first app page on the dev deployment: tab row replaces
// the breadcrumb, Graph is the default tab, non-graphified apps get a blank
// canvas beside the Graph Agent; a repository opens on its canvas. Run: node e2e/app-tabs-check.mjs
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
const plain = list.find((a) => a.kind !== 'repository');
console.log(`apps: ${list.length} · repo: ${repo?.name || 'none'} · plain: ${plain ? `${plain.name} (${plain.kind})` : 'none'}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
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
    const href = await page.locator('[data-repo-badge]').getAttribute('href', { timeout: 10000 });
    if (href !== `https://github.com/${repo.repo}`) throw new Error(`badge href ${href}`);
  });
  await check('repo: breadcrumb gone', async () => { if (await page.getByText(`Apps/${repo.repo}`).count()) throw new Error('crumb found'); });
  await page.screenshot({ path: 'e2e/shots/tabs-repo.png', fullPage: false });
}

if (plain) {
  await page.goto(`${base}/apps/${plain.name}`);
  await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 20000 });
  await check('app: Graph is default tab', async () => { if (await page.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('data-state') !== 'active') throw new Error('not active'); });
  await check('app: blank canvas present', () => page.locator('[aria-label="App graph"]').waitFor({ timeout: 5000 }));
  await check('app: Graph Agent header', () => page.getByRole('heading', { name: 'Graph Agent' }).waitFor({ timeout: 10000 }));
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
