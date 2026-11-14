// Owner-authorised (2026-11-13) dev-clone driver: puts the three reference toss-and-drop cards (Overview, Standard, Deep) on ONE canvas through the REAL /interactive job path with no model call.
// The clone runs INTERACT_BUILD_PROFILE=scripted (packages/control-plane/src/interact-scripted.js: the build roles answered by the scripted toss programs; admission, validate, headless run,
// oracle, sealing and the ledger row are the real path) with INTERACT_DESIGN_FIXTURE=toss, so Depth Brief / Balanced / Detailed give the Overview / Standard / Deep plan.
//   node scripts/interact/scripted-look.mjs            fresh owner account, fresh canvas, three Generates (Brief, Balanced, Detailed), waits for ready, prints the canvas URL
//   node scripts/interact/scripted-look.mjs --check    no Generate: session, canvas, signed-in page, jobs route, and the Chat composer + Depth menu the driver needs (headless, read only)
// Writes C:/s/spec/interact-real/look-canvas.json (or LOOK_FILE) (base, email, app, boardId, jobs) for open-look.cmd and current.json for ledger.mjs, and appends each job's ledger row (profile scripted).
// Dev clone only; the test-bypass secret is read BY NAME from small-deploy/.env and never printed. No model is called: a scripted job spends nothing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const ALL_DEPTHS = [['brief', 'Overview'], ['balanced', 'Standard'], ['detailed', 'Deep']];
// LOOK_FILE=mvp-canvas.json keeps the canvas of another clone setup apart (open-mvp.cmd reads it; the default look-canvas.json is open-template.cmd's); LOOK_TITLE names a new canvas.
const LOOK_FILE = `C:/s/spec/interact-real/${process.env.LOOK_FILE || 'look-canvas.json'}`, LOOK_TITLE = process.env.LOOK_TITLE || 'Toss look: Overview, Standard, Deep';
// LOOK_CANVAS=<canvas name> adds cards to that canvas (its board from look-canvas.json) instead of making a new one; LOOK_DEPTHS=brief picks the depths; LOOK_CARD names the card in the output (the ledge card: LOOK_CARD=Ledge).
const DEPTHS = (process.env.LOOK_DEPTHS ? process.env.LOOK_DEPTHS.split(',').map(d => ALL_DEPTHS.find(([depth]) => depth === d.trim()) ?? [d.trim(), d.trim()]) : ALL_DEPTHS).map(([depth, name]) => [depth, process.env.LOOK_CARD || name]);
const PROMPT = '/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?'; // the prompt of open-preview.cmd
const EMAIL = process.env.LOOK_EMAIL || `owner-interact-look-${Date.now().toString(36)}@example.com`, UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const check = process.argv.includes('--check');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const fail = (message, code = 1) => { console.log(`RESULT FAILED: ${message}`); process.exit(code); };

const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (!secret) fail('RABBIT_HOLE_DEV_TEST_BYPASS missing from small-deploy/.env. Next: add it there.', 2);
const minted = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) });
const session = (await minted.json().catch(() => ({}))).session;
if (!session) fail(`no dev session (HTTP ${minted.status}). Next: check rabbit-hole-cp-dev is up.`);
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const previous = (() => { try { return JSON.parse(readFileSync(LOOK_FILE, 'utf8')); } catch { return null; } })();
let app, boardId;
if (process.env.LOOK_CANVAS) {
  if (previous?.app !== process.env.LOOK_CANVAS) fail(`LOOK_CANVAS must be the canvas in ${LOOK_FILE} (it holds the board id).`);
  ({ app, boardId } = previous);
} else {
  const made = await api('POST', '/api/canvases', { title: `${LOOK_TITLE} ${Date.now().toString(36)}` });
  app = made.data?.name; if (!app) fail(`could not create a canvas (HTTP ${made.status}).`);
  const saved = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
  boardId = saved.data?.board_id; if (!boardId) fail(`could not save the canvas board (HTTP ${saved.status}).`);
}
const url = `${BASE}/apps/${app}`; // never ?board=: on a preview build that opens a separate review board
mkdirSync('C:/s/spec/interact-real', { recursive: true });
writeFileSync('C:/s/spec/interact-real/current.json', JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: new Date().toISOString() }, null, 2)); // ledger.mjs reads the account from here
const jobsOf = async () => { const l = await api('GET', `/api/learn/explain/jobs?board=${boardId}`); return Array.isArray(l.data) ? l.data : (l.data?.jobs || []); };

const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
const page = await context.newPage();
page.on('pageerror', e => log('pageerror', String(e).slice(0, 200)));
let approveFailed = null;
page.on('response', async r => { if (/\/explain\/jobs\/[^/]+\/approve/.test(r.url()) && r.status() >= 400) approveFailed = `approve ${r.status()}: ${(await r.text().catch(() => '')).slice(0, 200)}`; });
await page.goto(url);
const composer = page.locator('[data-chat-pane] [data-chat-composer]').first();
await composer.waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);
const depthButton = page.locator('[data-depth-menu] [data-depth]').first();
const chooseDepth = async depth => {
  if (await depthButton.getAttribute('data-depth').catch(() => null) === depth) return;
  await depthButton.click(); await page.locator(`[data-depth-option="${depth}"]`).click(); await page.waitForTimeout(300);
  if (await depthButton.getAttribute('data-depth') !== depth) throw new Error(`could not set Depth to ${depth}`);
};
const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();

if (check) {
  const jobs = await api('GET', `/api/learn/explain/jobs?board=${encodeURIComponent(boardId)}`);
  const pageOk = (await fetch(url, { headers: { ...UA, cookie: `small_session=${session}` } })).ok;
  const options = []; for (const [depth] of DEPTHS) { await chooseDepth(depth); options.push(await depthButton.getAttribute('data-depth')); }
  const composers = await box.count(), ok = pageOk && jobs.status === 200 && composers > 0 && options.join() === DEPTHS.map(d => d[0]).join();
  await browser.close();
  console.log(`signed in as ${EMAIL} (dev only); canvas ${app}; page ${pageOk ? 200 : 'not ok'}; jobs route HTTP ${jobs.status}; composer found ${composers}; Depth menu set to ${options.join(', ')}`);
  console.log(ok ? 'RESULT CHECK OK: session, canvas, signed-in page, jobs route, Chat composer and the three Depth options work; nothing was generated' : 'RESULT FAILED: a check above did not pass');
  process.exit(ok ? 0 : 1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
for (const [depth, name] of DEPTHS) {
  const known = new Set((await jobsOf()).map(j => j.id));
  await chooseDepth(depth);
  await box.click(); await box.fill(PROMPT); await page.waitForTimeout(200); await box.press('Enter');
  log(depth, 'sent');
  let job = null;
  for (let waited = 0; waited < 60000 && !job; waited += 1000) { job = (await jobsOf()).find(j => !known.has(j.id)); if (!job) await sleep(1000); }
  if (!job) { await page.screenshot({ path: `C:/s/spec/interact-real/scripted-look-${depth}-nojob.png` }); await browser.close(); fail(`${depth}: no job 60 s after the prompt was sent. Screenshot in C:/s/spec/interact-real.`); }
  const generate = page.locator(`[data-generation-proposal][data-proposal-job="${job.id}"] [data-proposal-generate]`);
  await generate.waitFor({ timeout: 300000 });
  await page.waitForTimeout(1000);
  await generate.click();
  const t0 = Date.now(); log(depth, 'job', job.id, 'Generate pressed');
  let end = null;
  while (Date.now() - t0 < 300000) {
    end = (await api('GET', `/api/learn/explain/jobs/${job.id}?board=${boardId}`)).data?.job;
    if (end?.terminal || ['ready', 'failed', 'cancelled'].includes(end?.stage)) break;
    if (approveFailed) break;
    await sleep(2000);
  }
  const ledger = spawnSync(process.execPath, [join(REPO, 'scripts/interact/ledger.mjs'), '--clone', BASE, '--job', job.id, '--board', boardId], { encoding: 'utf8' });
  log(depth, 'ledger:', (ledger.stdout + ledger.stderr).trim().slice(0, 200));
  results.push({ depth, card: name, jobId: job.id, cardId: end?.cardId ?? null, stage: end?.stage ?? null, stopReason: end?.stopReason ?? null, failure: end?.failure?.message ?? approveFailed, ms: Date.now() - t0 });
  log(depth, JSON.stringify(results.at(-1)));
  if (end?.stage !== 'ready') { await page.screenshot({ path: `C:/s/spec/interact-real/scripted-look-${depth}-${end?.stage}.png` }); break; }
}
await browser.close();
const ready = results.length === DEPTHS.length && results.every(r => r.stage === 'ready');
writeFileSync(LOOK_FILE, JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: previous && process.env.LOOK_CANVAS ? previous.createdAt : new Date().toISOString(), scripted: true, jobs: [...(process.env.LOOK_CANVAS ? previous.jobs ?? [] : []), ...results] }, null, 2));
for (const r of results) console.log(`${r.depth.padEnd(8)} -> ${r.card.padEnd(8)} ${r.stage} ${r.jobId} ${r.ms} ms${r.failure ? ` (${r.failure})` : ''}`);
console.log(ready ? `RESULT OK canvas ${app} board ${boardId} (${EMAIL}): ${url}` : `RESULT FAILED: not all three cards reached ready; canvas ${url}`);
process.exit(ready ? 0 : 1);
