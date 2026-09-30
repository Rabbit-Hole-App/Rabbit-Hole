// packages/web/e2e/mvp-surface-shots.mjs
// Screenshots of the MVP surface cleanup. /test/session is gone from live small-cp (P0-A
// containment, F5), so the real dev bundle renders against mocked /api/* answers; every request is
// answered here and nothing reaches a backend. No review worker until P0-B Phase 2B: serve the
// dist-dev build locally. From packages/web:
//   npx vite preview --outDir dist-dev --port 4173 --strictPort
//   SMALL_BASE=http://localhost:4173 OUT=<dir> node e2e/mvp-surface-shots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.SMALL_BASE || '';
if (!/^(https:[/][/]small-cp-dev-[a-z0-9-]+[.]zeroshothq[.]workers[.]dev|http:[/][/]localhost:[0-9]+)$/.test(base)) throw new Error('SMALL_BASE must be a local preview or your clone');
const out = process.env.OUT || 'shots';
mkdirSync(out, { recursive: true });
const catalog = { org: 'gmail-com', orgName: null, email: 'yudhisteer.chin@gmail.com', apps: [], folders: [] };
// The three AWS states: not configured (byoc.js:77), configured with no connection, configured but failing.
const AWS = {
  unconfigured: { status: 503, body: { error: 'AWS preview is not configured' } },
  configured: { status: 200, body: { connection: null } },
  failing: { status: 500, body: { error: 'Internal error' } },
};

const browser = await chromium.launch();
const failures = [];
const must = (cond, message) => { if (!cond) failures.push(message); };
const open = async (aws, path = '/apps') => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, json: { error: 'mocked: no writes' } });
    if (path === '/api/apps') return route.fulfill({ json: catalog });
    if (path === '/api/byoc/connection') return route.fulfill({ status: AWS[aws].status, json: AWS[aws].body });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}${path}`);
  await page.locator('aside').getByText('Personal', { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(800);
  return page;
};
const settings = async (page, tab) => {
  const open = page.getByRole('dialog', { name: 'Settings' });
  if (await open.count()) { await page.keyboard.press('Escape'); await open.waitFor({ state: 'detached', timeout: 3000 }); }
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: t } })), tab);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  return dialog;
};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

// 1. AWS not configured: no error anywhere, no AWS row.
let page = await open('unconfigured', '/library'); // Library hosts the preview's AWS catalog error (App.jsx)
must(!/not configured|Could not load AWS/.test(await page.locator('body').innerText()), 'unconfigured: an AWS error is shown');
must(await page.locator('aside').getByRole('button', { name: 'Explore', exact: true }).count() === 0, 'Explore is still in the sidebar');
await shot(page, '1-library-aws-unconfigured');
let dialog = await settings(page, 'preferences');
must(!(await dialog.innerText()).includes('Planned'), 'preferences: Planned shown');
must(!/Small AI|Rabbit Hole AI/.test(await dialog.innerText()), 'settings: the AI page is still in the nav');
await shot(page, '2-settings-preferences');
dialog = await settings(page, 'connections');
must(!/AWS|Planned|Slack|Notion|Google/.test(await dialog.innerText()), 'connections: hidden provider shown');
await shot(page, '3-settings-connections-aws-unconfigured');
await page.keyboard.press('Escape');
for (const path of ['repository', 'sources', 'question', 'blank']) {
  await page.evaluate((p) => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: p } })), path);
  const start = page.getByRole('dialog', { name: 'Start a rabbit hole' });
  await start.waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  must(!/Planned/.test(await start.innerText()), `start ${path}: Planned shown`);
  await shot(page, `5-start-${path}`);
  await page.keyboard.press('Escape');
  await start.waitFor({ state: 'detached', timeout: 3000 });
}
await page.context().close();

// 2. AWS configured: the AWS row shows.
page = await open('configured');
dialog = await settings(page, 'connections');
must((await dialog.innerText()).includes('Run in your AWS account'), 'configured: AWS row missing');
await shot(page, '6-settings-connections-aws-configured');
await page.context().close();

// 3. AWS configured but the request fails: the real error stays visible.
page = await open('failing', '/library');
must((await page.locator('body').innerText()).includes('Could not load AWS apps: Internal error'), 'failing: real AWS error hidden');
await shot(page, '7-library-aws-real-error');
await page.context().close();

await browser.close();
console.log(failures.length ? `FAIL:\n${failures.join('\n')}` : `ok: all surface checks passed; screenshots in ${out}`);
process.exitCode = failures.length ? 1 : 0;
