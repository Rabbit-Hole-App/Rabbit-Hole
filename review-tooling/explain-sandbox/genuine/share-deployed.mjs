// Deployed shared-page acceptance at c59bae962: initial view BEFORE any pan, chat open, owner and simulated signed-out (api/me 401).
// Reads only; records every non-GET with its body; compares the shared board read before and after. Credentials by NAME, never printed.
// Usage (cwd = a dir whose package.json resolves @playwright/test): node share-deployed.mjs <outDir>
import fs from 'node:fs'; import crypto from 'node:crypto'; import { createRequire } from 'node:module'; import { join } from 'node:path';
const { chromium } = createRequire(join(process.cwd(), 'package.json'))('@playwright/test');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const env = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8'); const g = n => (env.match(new RegExp(`^${n}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
const headers = { 'CF-Access-Client-Id': g('ACCESS_SMOKE_CLIENT_ID'), 'CF-Access-Client-Secret': g('ACCESS_SMOKE_CLIENT_SECRET') };
const BASE = 'https://preview.digrabbithole.com', TOKEN = '<SHARE_TOKEN>';
const boardHash = async () => { const r = await fetch(`${BASE}/api/learn/boards/shared/${TOKEN}`, { headers }); const t = await r.text(); return `${r.status} ${crypto.createHash('sha256').update(t).digest('hex').slice(0, 16)} ${t.length}b`; };
const results = {}; const say = (k, v) => { console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
say('board before', await boardHash());
const b = await chromium.launch({ channel: 'chrome' });
for (const [vname, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) for (const role of ['owner', 'signedout-sim']) {
  const name = `${vname}-${role}`;
  const ctx = await b.newContext({ viewport, extraHTTPHeaders: headers, hasTouch: vname === 'phone', isMobile: vname === 'phone' }); const p = await ctx.newPage();
  const mut = []; const gets = []; const errs = [];
  p.on('request', r => { const u = new URL(r.url()); if (r.method() !== 'GET' && !/telemetry|cdn-cgi/.test(u.pathname)) mut.push({ m: r.method(), path: u.pathname, body: (r.postData() || '').slice(0, 300) }); else gets.push(u.pathname); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  // signed-out simulation: the server answers a signed-out visitor with no viewer and no access role (embed-api.js sharedRole -> guest), so the shared read is rewritten that way
  if (role !== 'owner') {
    await p.route('**/api/me', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthenticated"}' }));
    await p.route(new RegExp(`/api/learn/boards/shared/${TOKEN}$`), async route => { const res = await route.fetch(); const j = await res.json(); delete j.access; j.viewer = null; j.role = 'viewer'; await route.fulfill({ response: res, json: j }); });
  }
  const nsResp = []; p.on('response', async r => { if (/next-steps/.test(r.url())) nsResp.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 200) }); });
  await p.goto(`${BASE}/b/${TOKEN}`, { waitUntil: 'load' }); await p.waitForTimeout(7000);
  await p.screenshot({ path: `${out}/${name}-01-initial.png` });
  const probe = async sel => p.evaluate(s => { const els = [...document.querySelectorAll(s)]; return els.slice(0, 3).map(e => { const r = e.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; const inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight; const top = inView ? document.elementFromPoint(cx, cy) : null; return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inView, hit: top ? (top === e || e.contains(top) || top.contains(e)) : false, coveredBy: top && !(top === e || e.contains(top) || top.contains(e)) ? `${top.tagName}.${String(top.className).slice(0, 50)}` : null }; }); }, sel);
  const play = await probe('[data-animation-play="true"]'); const ranges = await probe('input[type=range]');
  const chat = await p.evaluate(() => { const e = [...document.querySelectorAll('[data-chat-panel], aside, [aria-label*="hat" i]')].filter(x => x.getBoundingClientRect().width > 150).slice(0, 2); return e.map(x => { const r = x.getBoundingClientRect(); return { tag: x.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }); });
  const reading = async () => (await p.locator('body').innerText()).match(/Time elapsed: [\d.]+ min|Coffee temperature: [\d.]+ °C|\d+(\.\d)? ?°C/g)?.slice(0, 4);
  const r = { play, ranges, chat, badge: await p.locator('[data-view-only]').count(), cardsMarker: await p.locator('[data-view-only-cards]').count(), before: await reading() };
  if (play[0]?.hit) { const bb = await p.locator('[data-animation-play="true"]').first().boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/${name}-02-after-play.png` }); r.afterPlayClickAtInitialView = await reading(); }
  else r.afterPlayClickAtInitialView = 'NOT REACHABLE at initial view (covered or off-screen)';
  r.mutations = mut; r.errors = errs; r.nextStepsPosts = mut.filter(x => /next-steps/.test(x.path)); r.nextStepsResponses = nsResp; r.guestNotice = await p.locator('[data-guest-draft-notice]').count(); results[name] = r; say(name, r);
  await ctx.close();
}
await b.close(); say('board after', await boardHash());
fs.writeFileSync(`${out}/share-deployed.json`, JSON.stringify(results, null, 2));
