import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// Initial Learn load on the parallel clone, fresh browser each time: time to
// the canvas menubar and what was fetched by then (Tool Performance v1 check
// that the idle warm-up does not tax the first load). usage: node e2e/learn-load-timing.mjs [runs]
const BASE = 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const RUNS = Number(process.argv[2] || 5);
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'load-timing' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const browser = await chromium.launch();
const rows = [];
for (let run = 0; run < RUNS; run++) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  const bytes = { n: 0, count: 0 };
  page.on('requestfinished', async request => { try { bytes.n += (await request.sizes()).responseBodySize; bytes.count += 1; } catch {} });
  const started = Date.now();
  await page.goto(`${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=load-${Date.now().toString(36)}`);
  await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
  rows.push({ ms: Date.now() - started, kb: Math.round(bytes.n / 1024), requests: bytes.count });
  await context.close();
}
await browser.close();
const median = key => [...rows.map(row => row[key])].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(JSON.stringify(rows));
console.log('median', JSON.stringify({ ms: median('ms'), kb: median('kb'), requests: median('requests') }));
