import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

// How long each canvas + item takes to render on the parallel clone.
// Cold: a fresh browser (no HTTP cache), click to ready - includes the item's
// lazy code and data. Warm: a second insert of the same item on that page.
// Also counts bytes fetched and main-thread long tasks while it renders.
// Paid items are timed to their confirm-ready card only: nothing is generated.
// usage: node e2e/plus-render-timing.mjs [out.json]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const OUT = process.argv[2] || 'e2e/shots/plus-render-timing.json';
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'plus-timing' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;

// What "rendered" means beyond the card existing: the library's own output.
const READY = {
  Notebook: card => !card.innerText.includes('Starting Python') && !!card.querySelector('iframe'),
  'Interactive graph': card => !!card.querySelector('.dcg-container, .dcg-grapher, canvas'),
  'Data plot': card => !!card.querySelector('.main-svg'),
  'Flow diagram': card => card.querySelectorAll('.react-flow__node').length > 0,
  'Mermaid diagram': card => !!card.querySelector('svg g'),
  Whiteboard: card => !!card.querySelector('.tl-canvas, .tl-container'),
  '3D model': card => !!card.querySelector('canvas'),
  Paper: card => !!card.querySelector('canvas'),
  Image: card => [...card.querySelectorAll('img')].some(img => img.complete && img.naturalWidth > 0),
  Video: card => [...card.querySelectorAll('video')].some(video => video.readyState >= 1),
  Animation: card => !!card.querySelector('svg'),
  Walkthrough: card => !!card.querySelector('svg, button'),
  'Knowledge graph': card => !!card.querySelector('svg, canvas'),
  'Vector explorer': card => !!card.querySelector('svg, canvas'),
};

const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__long.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
  });
  const page = await context.newPage();
  const bytes = { n: 0, count: 0 };
  page.on('requestfinished', async request => { try { const sizes = await request.sizes(); bytes.n += sizes.responseBodySize; bytes.count += 1; } catch {} });
  await page.goto(`${BASE}/apps/${APP}?tab=learn&board=timing-${Date.now().toString(36)}`);
  await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  return { context, page, bytes };
};

// Click the item and time: mount (the card exists), ready (library output,
// no loading text, height steady for 400 ms).
const insert = async (page, bytes, label) => {
  const before = await page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.dataset.blockId));
  await page.getByRole('button', { name: 'Insert lesson block' }).click();
  const b0 = bytes.n, c0 = bytes.count;
  const t0 = await page.evaluate(() => performance.now());
  await page.getByRole('menu', { name: 'Lesson blocks' }).getByRole('menuitem', { name: label, exact: true }).click();
  if (label === 'YouTube moment') {
    await page.getByRole('dialog', { name: 'Search' }).waitFor({ timeout: 20000 });
    const t1 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Escape');
    return { mount: t1 - t0, ready: t1 - t0, kb: (bytes.n - b0) / 1024, requests: bytes.count - c0, blocked: 0 };
  }
  const id = await page.waitForFunction(ids => [...document.querySelectorAll('[data-block-id]')].map(node => node.dataset.blockId).find(value => !ids.includes(value)), before, { timeout: 30000, polling: 16 }).then(handle => handle.jsonValue());
  const mount = (await page.evaluate(() => performance.now())) - t0;
  const check = READY[label]?.toString() || 'card => true';
  const ready = await page.waitForFunction(({ id, check, t0 }) => {
    const card = document.querySelector(`[data-block-id="${id}"]`);
    if (!card) return false;
    const ok = (0, eval)(`(${check})`)(card) && !/Loading|Starting|Preparing/.test(card.innerText);
    const h = card.getBoundingClientRect().height, now = performance.now();
    const w = window.__steady || (window.__steady = {});
    if (!ok || w[id]?.h !== h) { w[id] = { h, since: now }; return false; }
    return now - w[id].since >= 400 ? now - 400 - t0 : false;
  }, { id, check, t0 }, { timeout: 90000, polling: 50 }).then(handle => handle.jsonValue()).catch(() => null);
  const blocked = await page.evaluate(({ t0, end }) => window.__long.filter(task => task.start >= t0 && task.start <= end).reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0), { t0, end: t0 + (ready ?? 90000) });
  return { mount, ready, kb: (bytes.n - b0) / 1024, requests: bytes.count - c0, blocked };
};

const first = await open();
await first.page.getByRole('button', { name: 'Insert lesson block' }).click();
const labels = await first.page.getByRole('menu', { name: 'Lesson blocks' }).getByRole('menuitem').allInnerTexts();
await first.page.keyboard.press('Escape');
await first.context.close();
console.log(`${labels.length} items`);

const rows = [];
for (const label of labels) {
  const { context, page, bytes } = await open();
  const cold = await insert(page, bytes, label);
  await page.waitForTimeout(800);
  const warm = await insert(page, bytes, label);
  await context.close();
  const row = { label, mountCold: Math.round(cold.mount), readyCold: cold.ready == null ? null : Math.round(cold.ready), readyWarm: warm.ready == null ? null : Math.round(warm.ready), kbCold: Math.round(cold.kb), requestsCold: cold.requests, blockedCold: Math.round(cold.blocked), blockedWarm: Math.round(warm.blocked) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync(OUT, JSON.stringify(rows, null, 2));
await browser.close();
