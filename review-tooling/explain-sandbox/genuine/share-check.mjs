// Post-deploy check of the dev share link for the saved cooling card. READ-ONLY: GET requests and local UI interaction only.
// Usage (from a directory whose package.json resolves @playwright/test, e.g. landing-tutor):
//   node share-check.mjs <outDir>
// Credentials: Cloudflare Access service token, read BY NAME from small-deploy/.env into memory only; never printed.
// Note: the service token maps to the smoke user (the canvas owner), so this cannot prove the non-owner view; the program read itself
// never looks at the viewer, and the API cases below do not depend on it.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const BASE = 'https://preview.digrabbithole.com', TOKEN = '<SHARE_TOKEN>', CARD = 'card-sandbox-ex1-b', BOARD = 'canvas-d81af32e';
const env = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const get = name => (env.match(new RegExp(`^${name}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
const headers = { 'CF-Access-Client-Id': get('ACCESS_SMOKE_CLIENT_ID'), 'CF-Access-Client-Secret': get('ACCESS_SMOKE_CLIENT_SECRET') };
const log = []; const say = (k, v) => { log.push([k, v]); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };

// 1. API cases (no cookie)
const api = async path => { const r = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' }); let body = null; try { body = await r.json(); } catch {} return { status: r.status, body }; };
const ok = await api(`/api/learn/boards/shared/${TOKEN}/cards/${CARD}/program`);
say('program read status', ok.status); say('program read keys', Object.keys(ok.body || {}));
say('artifact keys', Object.keys(ok.body?.artifact || {})); say('identity', ok.body?.identity); say('execution', ok.body?.execution);
const bad = JSON.stringify(ok.body || {}); say('leaks (should be all false)', { jobId: /ej_[0-9a-f]{8}/.test(bad), email: /@example\.test|@/.test(bad.replace(/@(media|font|keyframes)/g, '')), diagnostics: /diagnostic|history|promptRef/i.test(bad) });
say('unrelated card', (await api(`/api/learn/boards/shared/${TOKEN}/cards/nothing/program`)).status);
say('unknown token', (await api(`/api/learn/boards/shared/not-a-real-token-0123456789abcd/cards/${CARD}/program`)).status);
say('POST refused', (await fetch(`${BASE}/api/learn/boards/shared/${TOKEN}/cards/${CARD}/program`, { method: 'POST', headers, redirect: 'manual' })).status);

// 2. The page in a fresh browser context (Access headers only, no cookies)
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: headers }); const page = await ctx.newPage();
  const reqs = []; const errs = [];
  page.on('request', r => reqs.push(`${r.method()} ${new URL(r.url()).pathname}`)); page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(`${BASE}/b/${TOKEN}`, { waitUntil: 'load' }); await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}-01-loaded.png` });
  const card = page.locator('[data-program-card], [data-explain-program], section:has-text("hot coffee")').first();
  say(`${name} card visible`, await card.isVisible().catch(() => false));
  const text = async () => (await page.locator('body').innerText()).match(/\d+(\.\d)? ?°C/g)?.slice(0, 4);
  say(`${name} readouts before`, await text());
  const play = page.getByRole('button', { name: /play/i }).first();
  if (await play.count()) { await play.click(); await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}-02-playing.png` }); say(`${name} readouts playing`, await text()); await page.getByRole('button', { name: /pause/i }).first().click().catch(() => {}); }
  const slider = page.locator('input[type=range]').first();
  if (await slider.count()) { await slider.fill('25'); await page.waitForTimeout(800); say(`${name} readouts room 25`, await text()); await page.screenshot({ path: `${out}/${name}-03-room25.png` }); }
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(5000); await page.screenshot({ path: `${out}/${name}-04-reloaded.png` });
  say(`${name} readouts after reload`, await text());
  say(`${name} forbidden requests (should be empty)`, reqs.filter(r => /^(POST|PUT|PATCH|DELETE) /.test(r) && !/telemetry|cdn-cgi/.test(r) || /\/api\/learn\/explain\/jobs/.test(r)));
  say(`${name} page errors`, errs); await ctx.close();
}
await browser.close(); fs.writeFileSync(`${out}/share-check.json`, JSON.stringify(log, null, 2));
