// Verifies the Graph-first app page on the dev deployment: tab row replaces
// the breadcrumb, Graph is the default tab, non-graphified apps get a blank
// canvas beside the Graph Agent. Run: node e2e/app-tabs-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.zeroshothq.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('SMALL_TEST_BYPASS missing from .env');
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-tabs-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
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

if (repo) {
  await page.goto(`${base}/apps/${repo.name}?tab=code`);
  await page.getByRole('tab', { name: 'Graph', exact: true }).waitFor({ timeout: 20000 });
  await check('repo: Graph tab active', async () => { if (await page.getByRole('tab', { name: 'Graph', exact: true }).getAttribute('data-state') !== 'active') throw new Error('not active'); });
  await check('repo: Learn tab present', () => page.getByRole('tab', { name: 'Learn', exact: true }).waitFor({ timeout: 5000 }));
  await check('repo: repo name heading', () => page.getByRole('heading', { name: repo.repo }).waitFor({ timeout: 5000 }));
  await check('repo: breadcrumb gone', async () => { if (await page.getByText(`Apps/${repo.repo}`).count()) throw new Error('crumb found'); });
  await check('repo: Graph Agent panel', () => page.getByRole('heading', { name: 'Graph Agent' }).waitFor({ timeout: 10000 }));
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
