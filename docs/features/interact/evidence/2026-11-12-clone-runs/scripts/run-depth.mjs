// Owner-authorised (2026-11-13, $20) Playwright run against the dev clone ONLY: one pinned /interactive build at one Depth.
//   node run-depth.mjs <out-dir> <brief|balanced|detailed> [profile-label]
// Fresh canvas, the Depth chosen in the Chat menu, the fixed prompt, Generate on the pinned plan, wait for the job to end, append its ledger row, reload the canvas and
// take screenshots of the card at rest, at the top (the At top button) and with one slider changed. Secrets are read by name, never printed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [OUT, DEPTH = 'balanced', LABEL = 'opus-baseline'] = process.argv.slice(2);
if (!OUT) { console.error('usage: node run-depth.mjs <out-dir> <brief|balanced|detailed> [profile-label]'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const EMAIL = 'owner-interact-preview@example.com', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const PROMPT = '/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?';
const NAMES = { brief: /Brief/, balanced: /Balanced/, detailed: /Detailed/ };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const mint = async () => (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json()).session;
let session = await mint();
const api = async (method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
const made = await api('POST', '/api/canvases', { title: `Interactive ${DEPTH} ${LABEL} ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) throw new Error(`canvas create ${made.status}`);
const board = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
const boardId = board.data?.board_id; if (!boardId) throw new Error(`board save ${board.status}`);
const url = `${BASE}/apps/${app}`;
mkdirSync('C:/s/spec/interact-real', { recursive: true });
writeFileSync('C:/s/spec/interact-real/current.json', JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: new Date().toISOString() }, null, 2));
log('canvas', url, 'board', boardId, 'depth', DEPTH, 'profile', LABEL);

const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('console', m => { if (m.type() === 'error') log('console.error', m.text().slice(0, 200)); });
page.on('pageerror', e => log('pageerror', String(e).slice(0, 200)));
page.on('response', async r => { if (/\/api\/learn\/(explain\/jobs|chat)/.test(r.url()) && r.request().method() === 'POST') log('POST', r.url().replace(BASE, ''), r.status(), (await r.text().catch(() => '')).slice(0, 200)); });
await page.goto(url);
const composer = page.locator('[data-chat-pane] [data-chat-composer]').first();
await composer.waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);
// The Depth menu: open it, choose the depth by its name.
const current = await page.locator('[data-depth-menu] [data-depth]').first().getAttribute('data-depth').catch(() => null);
if (current !== DEPTH) { await page.locator('[data-depth-menu] [data-depth]').first().click(); await page.getByRole('menuitemradio', { name: NAMES[DEPTH] }).click(); }
log('depth now', await page.locator('[data-depth-menu] [data-depth]').first().getAttribute('data-depth').catch(() => null));
const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
const jobsNow = async () => { const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); return (l.data?.jobs || []).length; };
const sendOnce = async () => { await box.click(); await box.fill(PROMPT); await page.waitForTimeout(200); await box.press('Enter'); log('sent'); };
await sendOnce();
let waited = 0; while (waited < 20000 && !(await jobsNow())) { await page.waitForTimeout(1000); waited += 1000; }
if (!(await jobsNow())) { log('no job 20 s after send; reloading and resending once'); await page.reload(); await composer.waitFor({ timeout: 90000 }); await page.waitForTimeout(3000); await sendOnce(); }
const card = page.locator('[data-generation-proposal="explain"]').first();
await card.waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);
log('plan card visible');
await page.screenshot({ path: `${OUT}/1-plan-in-chat.png` });
const gen = card.locator('[data-proposal-generate]');
await gen.waitFor({ timeout: 30000 });
await gen.click();
const t0 = Date.now(); log('generate clicked');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let job = null, jobId = null;
while (Date.now() - t0 < 1500000) {
  const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); const arr = Array.isArray(l.data) ? l.data : (l.data?.jobs || []);
  jobId = arr[arr.length - 1]?.id || arr[0]?.id || jobId;
  if (jobId) { const r = await api('GET', `/api/learn/explain/jobs/${jobId}?board=${boardId}`); job = r.data?.job; if (job?.terminal || ['ready', 'failed', 'cancelled'].includes(job?.stage)) break; }
  await sleep(5000);
}
log('job end', JSON.stringify({ id: job?.id, stage: job?.stage, stop: job?.stopReason, failure: job?.failure?.message?.slice(0, 300), card: job?.cardId, ms: Date.now() - t0 }));
// The private detail (stages, calls, findings) and the ledger row.
let detailStatus = null;
if (jobId) {
  const d = await api('GET', `/api/learn/explain/jobs/${jobId}?board=${boardId}&detail=1`); detailStatus = d.status;
  writeFileSync(`${OUT}/job-${jobId}-final-full.json`, JSON.stringify(d.data, null, 2));
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/interact/ledger.mjs'), '--clone', BASE, '--job', jobId, '--board', boardId], { encoding: 'utf8' });
  log('ledger:', (r.stdout + r.stderr).trim().slice(0, 300));
}
writeFileSync(`${OUT}/result.json`, JSON.stringify({ url, app, boardId, jobId, depth: DEPTH, profile: LABEL, stage: job?.stage, stopReason: job?.stopReason, failure: job?.failure?.message ?? null, ms: Date.now() - t0, detailStatus }, null, 2));
await page.screenshot({ path: `${OUT}/2-after-generate.png` });

if (job?.stage === 'ready') {
  // Reload: the saved card must reopen with no model call. Then rest, At top, one slider changed.
  await page.reload();
  await page.waitForTimeout(6000);
  const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }); log('shot', name); };
  const cardEl = page.locator('[data-block-type="animation"], [data-animation-card], [data-explain-card]').first();
  try { await cardEl.scrollIntoViewIfNeeded({ timeout: 15000 }); } catch { log('NOTE card locator not found; whole-page shots'); }
  await shot('3-reopened-at-rest');
  try { await page.getByRole('button', { name: /At top/ }).first().click({ timeout: 10000 }); await page.waitForTimeout(1500); await shot('4-at-top'); } catch (e) { log('NOTE At top not clickable:', String(e).slice(0, 120)); }
  try { const slider = page.locator('input[type="range"]').first(); await slider.focus({ timeout: 10000 }); for (let i = 0; i < 8; i += 1) await slider.press('ArrowRight'); await page.waitForTimeout(1500); await shot('5-slider-changed'); } catch (e) { log('NOTE slider not found:', String(e).slice(0, 120)); }
  try { const html = await page.content(); writeFileSync(`${OUT}/page-after.html`, html.slice(0, 400000)); } catch { /* optional */ }
}
await browser.close();
log('done', job?.stage);
