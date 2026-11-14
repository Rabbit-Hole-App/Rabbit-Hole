// Brief 12 §2: drives the /interactive design path from Chat on the dev clone and times it. Fresh account, ONE canvas; per run it types the toss prompt at a depth, waits for the plan in Chat
// (prompt sent -> plan shown), presses Generate, waits for ready (Generate -> ready), screenshots the plan and the card at the top, waits for the shadow judge, and appends the job's ledger row.
//   node scripts/interact/drive-design.mjs --design fast|opus [--depth brief,balanced,detailed] [--runs N] [--prompt "<text>" | --prompts <list.json>] [--version <Version ID>] [--out <dir>] [--stop-usd N]
//   node scripts/interact/drive-design.mjs --design fast --prompts scripts/interact/sets/pick-clone-prompts.json [--depth balanced]   each listed prompt once on one canvas; expect gap stops at the plan (no Generate), expect fit builds the card
//   node scripts/interact/drive-design.mjs --design fast --check      session, canvas, signed-in page, Chat composer and Depth menu; sends nothing (headless, read only)
// The clone's design path is not readable from outside, so --design is checked against the deploy record C:/s/spec/interact-real/fast-deploy.json ({ design: 'fast'|'opus', versionId }), which the person
// who deploys writes right after `deploy-clone.mjs deploy`: a mismatch (or a missing record, or a different --version) refuses BEFORE any session, canvas or model call. After each run the ledger row's
// designKind is checked too (a fast deploy must say fast, an opus one opus); a mismatch stops the drive.
// Dev clone only; the test-bypass secret is read BY NAME from small-deploy/.env and never printed. Paid: the design calls of the deploy under test (fast: pennies; opus: US$2 to 6 a run) and the shadow judge.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC_DIR = 'C:/s/spec/interact-real', DEPLOY_FILE = process.env.DESIGN_DEPLOY_FILE || `${SPEC_DIR}/fast-deploy.json`; // the env override is for the refusal tests
const BASE = 'https://rabbit-hole-web-dev-interact.tryrabbithole.workers.dev', DEV_CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev', UA = { 'User-Agent': 'rabbit-hole-owner-launcher/1' };
const TOSS_PROMPT = 'At the highest point of a vertical throw, is acceleration zero because velocity is zero?'; // bench-design-mvp.mjs REQUEST, the prompt of open-preview.cmd
const DEPTHS = ['brief', 'balanced', 'detailed'];
const USAGE = 'usage: node scripts/interact/drive-design.mjs --design fast|opus [--depth brief,balanced,detailed] [--runs N] [--prompt "<text>" | --prompts <list.json>] [--version <id>] [--out <dir>] [--stop-usd N] [--check] [--help]';

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`), opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : argv[i + 1]; };
const fail = (message, code = 1) => { console.log(`RESULT FAILED: ${message}`); process.exit(code); };
if (flag('help')) { console.log(USAGE); process.exit(0); }
const promptsFile = opt('prompts'), design = opt('design'), depths = opt('depth', promptsFile ? 'balanced' : DEPTHS.join(',')).split(',').map(d => d.trim()), runs = Number(opt('runs', 1)), prompt = opt('prompt', TOSS_PROMPT), check = flag('check');
const stopUsd = opt('stop-usd') === undefined ? Infinity : Number(opt('stop-usd')), out = opt('out', `${SPEC_DIR}/drive-design-${design}-${Date.now().toString(36)}`);
if (!['fast', 'opus'].includes(design)) fail(`--design fast|opus is required. ${USAGE}`, 2);
if (!depths.length || depths.some(d => !DEPTHS.includes(d))) fail(`--depth takes ${DEPTHS.join(', ')}. ${USAGE}`, 2);
if (!Number.isInteger(runs) || runs < 1 || !(stopUsd > 0)) fail(`--runs is a whole number of 1 or more and --stop-usd a positive number. ${USAGE}`, 2);

// --prompts <list.json>: [{ id, prompt, expect: 'fit' | 'gap' }], run once each at ONE depth (default balanced); read and checked before anything is created.
let PROMPT_LIST = [];
if (promptsFile) {
  try { PROMPT_LIST = JSON.parse(readFileSync(promptsFile, 'utf8').replace(/^﻿/, '')); } catch (error) { fail(`--prompts ${promptsFile} is not readable JSON (${error.message}). ${USAGE}`, 2); }
  if (!Array.isArray(PROMPT_LIST) || !PROMPT_LIST.length || PROMPT_LIST.some(p => !p?.prompt || p.id === undefined || !['fit', 'gap'].includes(p.expect))) fail(`--prompts takes a list of { id, prompt, expect: "fit" | "gap" }. ${USAGE}`, 2);
  if (depths.length !== 1) fail(`--prompts runs at one depth: --depth takes one of ${DEPTHS.join(', ')}. ${USAGE}`, 2);
}

// Refuse the wrong deploy before anything is spent or created.
let deployed; try { deployed = JSON.parse(readFileSync(DEPLOY_FILE, 'utf8')); } catch { fail(`no deploy record at ${DEPLOY_FILE}. Next: after the clone deploy, write {"design":"${design}","versionId":"<Version ID>"} there.`, 2); }
if (deployed.design !== design) fail(`--design ${design}, but the deploy record says ${deployed.design} (${deployed.versionId}). Next: redeploy the clone for ${design} and update ${DEPLOY_FILE}, or pass the matching --design.`, 2);
if (opt('version') && opt('version') !== deployed.versionId) fail(`--version ${opt('version')}, but the deploy record says ${deployed.versionId}.`, 2);

const log = (...a) => console.log(new Date().toISOString(), ...a), sleep = ms => new Promise(r => setTimeout(r, ms));
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = (env.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (!secret) fail('RABBIT_HOLE_DEV_TEST_BYPASS missing from small-deploy/.env. Next: add it there.', 2);
const EMAIL = `owner-interact-fast-${Date.now().toString(36)}@example.com`;
const minted = await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) });
const session = (await minted.json().catch(() => ({}))).session;
if (!session) fail(`no dev session (HTTP ${minted.status}). Next: check rabbit-hole-cp-dev is up.`);
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...UA, cookie: `small_session=${session}`, ...(body ? { 'Content-Type': 'application/json', origin: BASE } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const made = await api('POST', '/api/canvases', { title: `Toss ${design} design ${Date.now().toString(36)}` });
const app = made.data?.name; if (!app) fail(`could not create a canvas (HTTP ${made.status}).`);
const saved = await api('PUT', `/api/learn/boards/${app}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] } });
const boardId = saved.data?.board_id; if (!boardId) fail(`could not save the canvas board (HTTP ${saved.status}).`);
const url = `${BASE}/apps/${app}`; // never ?board=: on a preview build that opens a separate review board
mkdirSync(SPEC_DIR, { recursive: true }); mkdirSync(out, { recursive: true });
writeFileSync(`${SPEC_DIR}/current.json`, JSON.stringify({ base: BASE, email: EMAIL, app, boardId, createdAt: new Date().toISOString() }, null, 2)); // ledger.mjs reads the account from here
const CANVAS_FILE = `${SPEC_DIR}/${promptsFile ? 'pick' : design === 'fast' ? 'fast' : 'opus'}-canvas.json`, canvasRecord = jobs => writeFileSync(CANVAS_FILE, JSON.stringify({ base: BASE, email: EMAIL, app, boardId, design, versionId: deployed.versionId, createdAt: new Date().toISOString(), jobs }, null, 2));
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
  const options = []; for (const depth of depths) { await chooseDepth(depth); options.push(await depthButton.getAttribute('data-depth')); }
  const composers = await box.count(), ok = pageOk && jobs.status === 200 && composers > 0 && options.join() === depths.join();
  await browser.close();
  console.log(`deploy record ${deployed.design} ${deployed.versionId}; signed in as ${EMAIL} (dev only); canvas ${app}; page ${pageOk ? 200 : 'not ok'}; jobs route HTTP ${jobs.status}; composer found ${composers}; Depth menu set to ${options.join(', ')}`);
  console.log(ok ? 'RESULT CHECK OK: deploy record, session, canvas, signed-in page, jobs route, Chat composer and Depth options work; nothing was sent' : 'RESULT FAILED: a check above did not pass');
  process.exit(ok ? 0 : 1);
}

// The row of a finished job from the clone's own diagnostics (detail=1), once the shadow judge has answered (or 120 s have passed).
const detailOf = async id => (await api('GET', `/api/learn/explain/jobs/${id}?board=${boardId}&detail=1`)).data;
const results = []; let spent = 0, stopped = null;
// The work list: one entry per (run, depth) of the single prompt, or, with --prompts, one per listed prompt at the one depth. expect 'gap' stops at the plan in Chat (Generate is never pressed: the Opus plan would build with Opus).
const items = promptsFile ? PROMPT_LIST.map(p => ({ n: 1, depth: depths[0], prompt: p.prompt, id: String(p.id), expect: p.expect === 'gap' ? 'gap' : 'fit' })) : Array.from({ length: runs }, (_, i) => depths.map(depth => ({ n: i + 1, depth, prompt, id: null, expect: 'fit' }))).flat();
outer: for (const { n, depth, prompt, id, expect } of items) {
  const tag = id ? `${design}-p${id}` : `${design}-${depth}-${n}`, known = new Set((await jobsOf()).map(j => j.id)), plans0 = await page.locator('[data-generation-proposal] [data-proposal-generate]').count();
  await chooseDepth(depth);
  await box.click(); await box.fill(`/interactive ${prompt}`); await page.waitForTimeout(200);
  const tSent = Date.now(); await box.press('Enter'); log(tag, 'sent');
  const r = { run: n, design, depth, deploy: deployed.versionId, canvasId: app, account: EMAIL, jobId: null, ...(id ? { id, expect } : {}), promptToPlanMs: null, generateToReadyMs: null, promptToCardMs: null, stage: null, stopReason: null, failure: null };
  // The plan is shown when a new proposal with a Generate button appears in Chat; a job that ends first (failed, cancelled) ends the wait.
  let job = null, shown = false;
  const planWait = page.waitForFunction(count => document.querySelectorAll('[data-generation-proposal] [data-proposal-generate]').length > count, plans0, { timeout: 900000, polling: 'raf' }).then(() => { shown = Date.now(); });
  const failWait = (async () => { while (!shown) { job ??= (await jobsOf()).find(j => !known.has(j.id)); const s = job && (await api('GET', `/api/learn/explain/jobs/${job.id}?board=${boardId}`)).data?.job; if (s && ['failed', 'cancelled'].includes(s.stage)) return s; await sleep(500); } })();
  const early = await Promise.race([planWait.then(() => null), failWait]);
  if (early) { Object.assign(r, { jobId: early.id ?? job?.id, stage: early.stage, stopReason: early.stopReason ?? null, failure: early.failure?.message ?? null }); }
  else {
    r.promptToPlanMs = shown - tSent;
    const proposal = page.locator('[data-generation-proposal][data-proposal-job]').last();
    r.jobId = await proposal.getAttribute('data-proposal-job'); job = { id: r.jobId };
    await proposal.screenshot({ path: `${out}/${tag}-plan.png` }).catch(() => {});
    if (expect === 'gap') { r.stage = (await api('GET', `/api/learn/explain/jobs/${r.jobId}?board=${boardId}`)).data?.job?.stage ?? null; log(tag, 'job', r.jobId, `plan shown ${r.promptToPlanMs} ms, Generate NOT pressed (expect gap)`); }
    const tGen = Date.now(); if (expect !== 'gap') { await proposal.locator('[data-proposal-generate]').click(); log(tag, 'job', r.jobId, `plan shown ${r.promptToPlanMs} ms, Generate pressed`); }
    let end = null;
    while (expect !== 'gap' && Date.now() - tGen < 300000) {
      end = (await api('GET', `/api/learn/explain/jobs/${r.jobId}?board=${boardId}`)).data?.job;
      if (end?.terminal || ['ready', 'failed', 'cancelled'].includes(end?.stage) || approveFailed) break;
      await sleep(400);
    }
    if (expect !== 'gap') { r.generateToReadyMs = Date.now() - tGen; r.promptToCardMs = r.promptToPlanMs + r.generateToReadyMs; }
    if (expect !== 'gap') Object.assign(r, { stage: end?.stage ?? null, stopReason: end?.stopReason ?? null, failure: end?.failure?.message ?? approveFailed });
    if (end?.stage === 'ready') {
      const card = page.locator('[data-program-card]').last();
      try { await card.waitFor({ timeout: 30000 }); await card.scrollIntoViewIfNeeded(); const top = card.getByRole('button', { name: 'At top' }); if (await top.count()) { await top.first().click(); await page.waitForTimeout(800); } await card.screenshot({ path: `${out}/${tag}-card-top.png` }); } catch (e) { r.cardShotError = String(e).slice(0, 120); }
    } else if (expect !== 'gap') await page.screenshot({ path: `${out}/${tag}-${end?.stage ?? 'nostage'}.png` }).catch(() => {});
  }
  if (r.jobId) {
    for (let t = 0; t < 120000; t += 3000) { const d = await detailOf(r.jobId); if (d?.diagnostics?.bench?.judge || d?.diagnostics?.bench?.error || r.stage !== 'ready' || expect === 'gap') break; await sleep(3000); }
    const led = spawnSync(process.execPath, [join(REPO, 'scripts/interact/ledger.mjs'), '--clone', BASE, '--job', r.jobId, '--board', boardId], { encoding: 'utf8' });
    log(tag, 'ledger:', (led.stdout + led.stderr).trim().slice(0, 200));
    const det = (await detailOf(r.jobId))?.diagnostics, row = det?.ledger ?? null; r.designFast = det?.designFast ?? null; // firstProblem and lastProblem of a fast design that was refused
    r.ledger = row && Object.fromEntries(['designKind', 'designModel', 'designFallback', 'designCalls', 'msDesign', 'designCostUsd', 'costUsd', 'buildKind', 'pickFamily', 'pickConfidence', 'msPick', 'judgeVerdict', 'judgeMajor', 'judgeCostUsd'].map(k => [k, row[k]]));
    const fb = row?.designFallback ?? det?.designFast?.fallback ?? null; // which path the design took: the fast fill, the Opus design straight after a pick gap, or the Opus design after a failed correction
    r.path = row ? (fb === 'gap' ? 'opus-gap' : fb === 'after_correction' ? 'opus-after-correction' : row.designKind === 'fast' ? 'fast' : row.designKind) : null;
    spent += Math.max(row?.costUsd ?? 0, row?.designCostUsd ?? 0); // a gap plan's Opus design counts toward --stop-usd
    if (row && row.designKind !== design && !(design === 'fast' && ['after_correction', 'gap'].includes(row.designFallback))) /* a fast deploy that fell back to the Opus design is a result, not the wrong deploy */ { r.failure ??= `the deploy ran the ${row.designKind} design, not ${design}`; stopped = `ledger designKind ${row.designKind} is not ${design}: the clone is not the deploy ${DEPLOY_FILE} says`; }
  }
  results.push(r); appendFileSync(`${out}/results.jsonl`, JSON.stringify(r) + '\n'); canvasRecord(results); log(tag, JSON.stringify(r));
  if (stopped) break outer;
  if (spent >= stopUsd) { stopped = `spent US$${spent.toFixed(2)} reached --stop-usd ${stopUsd}`; break outer; }
}
await browser.close();
for (const r of results) console.log(`${r.id ? `p${r.id} ${r.expect} ${r.path ?? '-'} pick ${r.ledger?.pickFamily ?? 'none'} ${r.ledger?.pickConfidence ?? '-'} ${r.ledger?.msPick ?? '-'} ms ` : ''}${r.depth.padEnd(9)} #${r.run} ${String(r.stage).padEnd(9)} plan ${r.promptToPlanMs ?? '-'} ms, ready ${r.generateToReadyMs ?? '-'} ms, card ${r.promptToCardMs ?? '-'} ms ${r.jobId}${r.failure ? ` (${r.failure})` : ''}`);
const ok = !stopped && results.length === items.length && results.every(r => r.stage === (r.expect === 'gap' ? 'awaiting_approval' : 'ready'));
console.log(ok ? `RESULT OK canvas ${app} (${EMAIL}): ${url}; results in ${out}/results.jsonl` : `RESULT FAILED: ${stopped ?? 'not every run reached ready'}; ${results.length} of ${items.length} runs done; canvas ${url}; results in ${out}/results.jsonl`);
process.exit(ok ? 0 : 1);
