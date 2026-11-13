import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [app, cardId, boardId, resultId, OUT] = process.argv.slice(2);
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const r = await fetch(`${BASE}/api/learn/explain/jobs/results/${resultId}?board=${boardId}`, { headers: { ...UA, cookie: `small_session=${session}` } });
const body = await r.json().catch(() => null);
console.log('result route', r.status, body ? Object.keys(body).join(',') : 'none');
const prog = body?.artifact?.program || body?.artifact || {};
const m = prog.manifest || {};
console.log('manifest viewport', JSON.stringify(m.viewport), 'duration', m.duration, 'source bytes', (prog.source || '').length);
const sizes = [...(prog.source || '').matchAll(/\b(?:size|fontSize|font)\s*:\s*(\d+(?:\.\d+)?)/g)].map(x => +x[1]);
console.log('text sizes in source (size/fontSize fields):', JSON.stringify([...new Set(sizes)].sort((a, b) => a - b)));
writeFileSync(`${OUT}/result-artifact.json`, JSON.stringify(body, null, 2));
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${app}`);
const card = page.locator(`[data-block-id="${cardId}"]`);
await card.waitFor({ timeout: 90000 }); await page.waitForTimeout(5000);
const dom = await card.evaluate(el => {
  const box = el.getBoundingClientRect(), svg = [...el.querySelectorAll('svg')].map(s => ({ vb: s.getAttribute('viewBox'), w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height) })).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const texts = [...el.querySelectorAll('svg text')].map(t => ({ fs: parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize), rendered: t.getBoundingClientRect().height }));
  return { cardW: Math.round(box.width), cardH: Math.round(box.height), svg, minFontAttr: Math.min(...texts.map(t => t.fs)), maxFontAttr: Math.max(...texts.map(t => t.fs)), nText: texts.length };
});
console.log('DOM', JSON.stringify(dom));
if (dom.svg?.vb) { const [, , vw, vh] = dom.svg.vb.split(/\s+/).map(Number); console.log('scale = drawn/declared', (dom.svg.w / vw).toFixed(3), 'declared frame', vw, 'x', vh); }
await browser.close();
