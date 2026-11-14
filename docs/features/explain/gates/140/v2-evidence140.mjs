// Release 140 (AR-2) local v2 evidence. Runs against a LOCAL stack started by stack-v2.sh (no model call, nothing paid, never a deployed worker).
//   node v2-evidence140.mjs <stack persist dir> <candidate worktree>   e.g. .../stack-140v2 C:/s/explain-140
// 1. API: a v2 job is created on a fresh canvas and cancelled at once (terminal: cancelled).
// 2. Browser (the scripted-look.mjs path): /interactive in Chat with Depth Brief, press Generate; the scripted build profile makes no model call. Terminal: ready or failed.
// Then it counts explain-archive/ objects in the stack's R2 file, and checks each: id, outcome, userId, no email.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [P, W] = [process.argv[2], process.argv[3]];
if (!P || !W) { console.error('usage: node v2-evidence140.mjs <persist dir> <worktree>'); process.exit(2); }
const BASE = 'http://127.0.0.1:8968';
const vars = readFileSync(join(W, 'packages/control-plane/.dev.vars'), 'utf8');
const secret = (vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1] || '').trim(); // read by name, never printed
const EMAIL = `ar2-evidence-${Date.now().toString(36)}@example.com`;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const minted = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json().catch(() => ({}));
const session = minted.session; if (!session) { console.log('RESULT FAILED: no test session'); process.exit(1); }
const api = async (method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { cookie: `small_session=${session}`, ...(body ? { 'content-type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
const made = await api('POST', '/api/canvases', { title: `AR-2 evidence ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) { console.log(`RESULT FAILED: canvas (HTTP ${made.status})`); process.exit(1); }
const saved = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
const boardId = saved.data?.board_id; if (!boardId) { console.log(`RESULT FAILED: board (HTTP ${saved.status})`); process.exit(1); }
log('canvas', app, 'board', boardId);
const results = [];

// 1. create + cancel
const created = await api('POST', '/api/learn/explain/jobs', { boardId, requestId: 'req-ar2-cancel-1', cardId: 'card-ar2-cancel', prompt: 'Explain a pendulum.', requestClass: 'simple' });
const jobId = created.data?.job?.id; log('create', created.status, jobId);
if (jobId) {
  const cancelled = await api('POST', `/api/learn/explain/jobs/${jobId}/cancel`, { boardId });
  log('cancel', cancelled.status, cancelled.data?.job?.stage);
  results.push({ path: 'api-cancel', jobId, stage: cancelled.data?.job?.stage ?? null });
}

// 2. the /interactive job through the browser
const { chromium } = createRequire('C:/s/explain-layout-web/package.json')('playwright');
let browser; try { browser = await chromium.launch({ channel: 'chrome', headless: true }); } catch { browser = await chromium.launch({ headless: true }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${app}`);
try {
  const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 90000 }); await page.waitForTimeout(2000);
  const depthButton = page.locator('[data-depth-menu] [data-depth]').first();
  if (await depthButton.getAttribute('data-depth').catch(() => null) !== 'brief') { await depthButton.click(); await page.locator('[data-depth-option="brief"]').click(); await page.waitForTimeout(300); }
  const known = new Set(((await api('GET', `/api/learn/explain/jobs?board=${boardId}`)).data?.jobs || []).map(j => j.id));
  await box.click(); await box.fill('/interactive At the highest point of a vertical throw, is acceleration zero because velocity is zero?'); await page.waitForTimeout(200); await box.press('Enter');
  let job = null;
  for (let w = 0; w < 60000 && !job; w += 1000) { job = ((await api('GET', `/api/learn/explain/jobs?board=${boardId}`)).data?.jobs || []).find(j => !known.has(j.id)); if (!job) await sleep(1000); }
  if (!job) throw new Error('no /interactive job 60 s after the prompt');
  const generate = page.locator(`[data-generation-proposal][data-proposal-job="${job.id}"] [data-proposal-generate]`);
  await generate.waitFor({ timeout: 300000 }); await page.waitForTimeout(1000); await generate.click();
  log('interactive job', job.id, 'Generate pressed');
  let end = null; const t0 = Date.now();
  while (Date.now() - t0 < 300000) { end = (await api('GET', `/api/learn/explain/jobs/${job.id}?board=${boardId}`)).data?.job; if (['ready', 'failed', 'cancelled'].includes(end?.stage)) break; await sleep(2000); }
  results.push({ path: 'browser-interactive', jobId: job.id, stage: end?.stage ?? null, failure: end?.failure?.category ?? null });
} catch (error) { results.push({ path: 'browser-interactive', error: String(error.message).slice(0, 200) }); }
await browser.close();
await sleep(1500);

// count the archive objects
const r2 = join(P, 'local/v3/r2'); const dbFile = readdirSync(join(r2, 'miniflare-R2BucketObject')).find(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
const db = new DatabaseSync(join(r2, 'miniflare-R2BucketObject', dbFile), { readOnly: true });
const rows = db.prepare("select key, blob_id from _mf_objects where key like 'explain-archive/%'").all();
const blobDir = readdirSync(r2).find(d => d !== 'miniflare-R2BucketObject');
const recs = rows.map(r => ({ key: r.key, rec: JSON.parse(readFileSync(join(r2, blobDir, 'blobs', r.blob_id), 'utf8')) }));
const summary = recs.map(({ key, rec }) => ({ key, id: rec.id, flow: rec.flow, outcome: rec.outcome, attempt: rec.attempt, userId: !!rec.userId, requestClass: rec.request?.class, hasResult: rec.result !== null, email: JSON.stringify(rec).includes('@') && JSON.stringify(rec).includes(EMAIL) }));
const out = { at: new Date().toISOString(), worktree: W, base: BASE, email: '[test account, not recorded]', jobs: results, archiveObjects: recs.length, objects: summary };
writeFileSync(join(P, 'v2-evidence.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
const jobIds = results.map(r => r.jobId).filter(Boolean);
const ok = jobIds.length > 0 && jobIds.every(id => summary.some(s => s.id === id || s.id.startsWith(`${id}.`)) ) && summary.every(s => s.userId && !s.email);
console.log(ok ? `RESULT OK: ${recs.length} archive object(s) for ${jobIds.length} v2 job(s), user id present, no email` : 'RESULT FAILED: see the objects above');
process.exit(ok ? 0 : 1);
