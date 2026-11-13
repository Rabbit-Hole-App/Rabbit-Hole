// Owner-authorised (2026-11-12) Playwright run against the dev clone ONLY. Signed in via the launcher's session mint (rabbit-hole-cp-dev /test/session).
// Stage A: fresh canvas, Depth Balanced, send the prompt, wait for the plan, click Generate, wait for the job to end. Secrets read by name, never printed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const PROMPT = '/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?';
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
const api = async (method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
const made = await api('POST', '/api/canvases', { title: `Interactive Standard try-it ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) throw new Error(`canvas create ${made.status}`);
const board = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
const boardId = board.data?.board_id; if (!boardId) throw new Error(`board save ${board.status}`);
const url = `${BASE}/apps/${app}`;
writeFileSync('C:/s/spec/interact-real/current.json', JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: new Date().toISOString() }, null, 2));
console.log('canvas', url, 'board', boardId);

const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('request', r => { if (/\/api\//.test(r.url()) && r.method() !== 'GET') console.log(new Date().toISOString(), 'REQ', r.method(), r.url().replace(BASE, '').slice(0, 110)); });
page.on('requestfailed', r => console.log(new Date().toISOString(), 'REQFAILED', r.url().replace(BASE, '').slice(0, 110), r.failure()?.errorText));
page.on('console', m => { if (m.type() === 'error') console.log('console.error', m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('pageerror', String(e).slice(0, 200)));
page.on('response', async r => { if (/\/api\/learn\/(explain\/jobs|chat)/.test(r.url()) && r.request().method() === 'POST') console.log('POST', r.url().replace(BASE, ''), r.status(), (await r.text().catch(() => '')).slice(0, 300)); });
await page.goto(url);
await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 90000 });
const depth = await page.locator('[data-depth-menu] [data-depth]').first().getAttribute('data-depth').catch(() => null);
console.log('depth attr', depth);
if (depth !== 'balanced' && depth !== 'standard') { console.log('NOTE depth is not balanced; clicking Balanced'); await page.locator('[data-depth-menu] [data-depth]').first().click(); await page.getByRole('menuitemradio', { name: /Balanced/ }).click(); }
const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
await page.waitForTimeout(3000);
const jobsNow = async () => { const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); return (l.data?.jobs || []).length; };
const sendOnce = async () => { await box.click(); await box.fill(PROMPT); await page.waitForTimeout(200); await box.press('Enter'); console.log('sent at', new Date().toISOString()); };
await sendOnce();
let waited = 0; while (waited < 20000 && !(await jobsNow())) { await page.waitForTimeout(1000); waited += 1000; }
if (!(await jobsNow())) { console.log('NOTE no job 20 s after send (stalled create); reloading and resending once'); await page.reload(); await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 90000 }); await page.waitForTimeout(3000); await sendOnce(); }
await page.waitForTimeout(6000); await page.screenshot({ path: `${OUT}/0-after-send.png` });
const card = page.locator('[data-generation-proposal="explain"]').first();
await card.waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);
console.log('plan card visible at', new Date().toISOString(), (await card.innerText()).slice(0, 80).replace(/\s+/g, ' '));
await page.screenshot({ path: `${OUT}/1-plan-in-chat.png` });
const gen = card.locator('[data-proposal-generate]');
await gen.waitFor({ timeout: 30000 });
console.log('generate enabled', await gen.isEnabled());
await gen.click();
console.log('generate clicked at', new Date().toISOString());
// wait for the job to end (the poller records details); here: poll the API for a terminal stage
const sleep = ms => new Promise(r => setTimeout(r, ms));
let job = null; const t0 = Date.now();
while (Date.now() - t0 < 1500000) {
  const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); const arr = Array.isArray(l.data) ? l.data : (l.data?.jobs || []);
  const id = arr[arr.length - 1]?.id || arr[0]?.id;
  if (id) { const r = await api('GET', `/api/learn/explain/jobs/${id}?board=${boardId}`); job = r.data?.job; if (job?.terminal) break; }
  await sleep(10000);
}
console.log('job end', JSON.stringify({ id: job?.id, stage: job?.stage, stop: job?.stopReason, failure: job?.failure?.message?.slice(0, 200), card: job?.cardId }));
writeFileSync(`${OUT}/stageA.json`, JSON.stringify({ url, app, boardId, jobId: job?.id, cardId: job?.cardId, stage: job?.stage }, null, 2));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/2-after-generate.png` });
await browser.close();
