#!/usr/bin/env node
// Genuine-run DRIVER for the generic /explain sandbox (Agent C). One run = one prompt = one job, submitted once. Never automatic retry.
//
//   node driver.mjs --mode rehearse --base http://127.0.0.1:PORT --run-id R --prompt-id P [--ledger-dir D] [--poll-ms 300]
//   SANDBOX_GENUINE_APPROVED=<run-id> node driver.mjs --mode live --base https://preview.digrabbithole.com --run-id R --prompt-id P --expect-sha <main sha>
//
// LIVE spends real provider money (reserved first in the ledgers, settled at the measured cost). It refuses unless:
//   - the run id was approved for this launch by the environment variable SANDBOX_GENUINE_APPROVED (the integrator's typed go), and
//   - the base is exactly the stable preview, and the ledger dir is the real one, and the preview serves --expect-sha (Cloudflare version chain,
//     the same servedSha the deploy pipeline uses), and the smoke user's remaining credits cover the 332-credit generation reserve.
// REHEARSE refuses a non-loopback base and the real ledger: it exercises the same code against a local server and can spend nothing.
//
// Credentials: names only, read from small-deploy/.env into memory (ACCESS_SMOKE_CLIENT_ID, ACCESS_SMOKE_CLIENT_SECRET, CLOUDFLARE_API_TOKEN); never printed.
// Output: runs/<runId>/ (prompt, events.log, job.json, artifact.json, source.js, manifest.json, usage-before/after.json, summary.json, run.json).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback; };
const MODE = arg('mode'), BASE = (arg('base') || '').replace(/\/$/, ''), RUN_ID = arg('run-id'), PROMPT_ID = arg('prompt-id');
const REPO = arg('repo', 'C:/Users/cyudhist/Desktop/workspace/explain-sandbox-gen');
const REAL_LEDGER = 'C:/s/spec/budget';
const LEDGER = arg('ledger-dir', MODE === 'live' ? REAL_LEDGER : path.join(HERE, 'rehearsal-ledger'));
const OUT = arg('out', path.join(HERE, MODE === 'live' ? 'runs' : 'rehearsal-runs'));
const STATE = arg('state-dir', path.join(HERE, MODE === 'live' ? 'state' : 'rehearsal-state'));
const RESERVE_USD = Number(arg('reserve-usd', '3.31328')); // the policy generation ceiling (explain-policy.js explainReservation), derived in the reprice
const MIN_CREDITS = Number(arg('min-credits', '332'));      // the allowance check the job itself makes before it starts (admitGeneration)
const POLL_MS = Number(arg('poll-ms', '3000')), TIMEOUT_S = Number(arg('timeout-s', '420'));
const PREVIEW = 'https://preview.digrabbithole.com', PREVIEW_WORKER = 'rabbit-hole-web-dev-small-parallel', ACCOUNT = '<CF_ACCOUNT_ID>';
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';

let runRef = null, runDir = null;
const die = message => { console.error(`refused: ${message}`); if (runRef) { runRef.status = 'refused'; runRef.reason = message; runRef.endedAt = new Date().toISOString(); try { fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runRef, null, 2)); fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({ runId: runRef.runId, status: 'refused', reason: message, reserved: runRef.reserved, submitted: runRef.submitted }, null, 2)); } catch {} } process.exit(3); };
if (!['live', 'rehearse'].includes(MODE) || !RUN_ID || !PROMPT_ID || !BASE) die('usage: --mode live|rehearse --base <url> --run-id <id> --prompt-id <id>');
if (!/^[A-Za-z0-9._-]{3,64}$/.test(RUN_ID)) die('run id must be 3 to 64 letters, digits, dot, dash or underscore');
const norm = p => path.resolve(p).replace(/\\/g, '/').toLowerCase();
if (MODE === 'live') {
  if (BASE !== PREVIEW) die(`live runs go only to ${PREVIEW}`);
  if (process.env.SANDBOX_GENUINE_APPROVED !== RUN_ID) die('set SANDBOX_GENUINE_APPROVED to this exact run id (the integrator\'s go for this run)');
  if (norm(LEDGER) !== norm(REAL_LEDGER)) die(`live runs use the real ledger in ${REAL_LEDGER}`);
  if (!arg('expect-sha')) die('live runs need --expect-sha <the main commit the preview must serve>');
} else {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) die('rehearsal talks to a loopback server only');
  if (norm(LEDGER) === norm(REAL_LEDGER)) die('rehearsal never touches the real ledger');
}

const prompts = JSON.parse(fs.readFileSync(arg('prompts', path.join(HERE, 'prompts.json')), 'utf8')).prompts;
const entry = prompts.find(p => p.id === PROMPT_ID) || die(`no prompt ${PROMPT_ID} in prompts.json`);
const PROMPT = arg('prompt-text', entry.prompt);

// ---- credentials by name, in memory only --------------------------------------------------------------------------------------------
const secret = key => { try { return fs.readFileSync(ENV_FILE, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '') || null; } catch { return null; } };
const access = MODE === 'live'
  ? { 'Cf-Access-Client-Id': secret('ACCESS_SMOKE_CLIENT_ID') || die('ACCESS_SMOKE_CLIENT_ID is not in the credentials file'), 'Cf-Access-Client-Secret': secret('ACCESS_SMOKE_CLIENT_SECRET') || die('ACCESS_SMOKE_CLIENT_SECRET is not in the credentials file') }
  : { 'Cf-Access-Client-Id': arg('rehearsal-id', 'rehearsal-id'), 'Cf-Access-Client-Secret': 'rehearsal-secret' }; // the local server emulates the bridge's header check

// ---- run record: a run id can run once ---------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(STATE, { recursive: true });
const dir = path.join(OUT, RUN_ID);
try { fs.mkdirSync(dir); } catch { die(`run ${RUN_ID} already exists in ${OUT}: a run id runs once (a new attempt needs a new id)`); }
const started = Date.now();
const log = line => { const text = `${new Date().toISOString()} ${line}`; fs.appendFileSync(path.join(dir, 'events.log'), `${text}\n`); console.log(text); };
const save = (name, value) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
const run = { runId: RUN_ID, promptId: PROMPT_ID, mode: MODE, base: BASE, status: 'started', startedAt: new Date(started).toISOString(), reserved: false, submitted: false, settled: null };
const flush = () => save('run.json', run);
runRef = run; runDir = dir;
save('prompt.txt', `${PROMPT}\n`); flush();

// ---- the ledgers (BOTH are updated by sandbox-budget.mjs) --------------------------------------------------------------------------
const ledger = (...a) => {
  try { return JSON.parse(execFileSync(process.execPath, [path.join(LEDGER, 'sandbox-budget.mjs'), ...a], { encoding: 'utf8' })); }
  catch (error) { try { return JSON.parse(String(error.stdout)); } catch { return { ok: false, reason: String(error.message).slice(0, 200) }; } }
};

// ---- HTTP with the service-token headers and a cookie jar --------------------------------------------------------------------------
const jar = new Map();
async function call(method, route, body) {
  const t0 = Date.now();
  const headers = { ...access, Accept: 'application/json', Origin: BASE, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(BASE + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  for (const cookie of response.headers.getSetCookie?.() ?? []) { const [pair] = cookie.split(';'); const i = pair.indexOf('='); if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1)); }
  let data = null; const text = await response.text(); try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  log(`${method} ${route.replace(/\?.*/, '')} -> ${response.status} (${Date.now() - t0} ms)`);
  return { status: response.status, body: data, location: response.headers.get('location') };
}

// ---- the preview must be serving the sandbox commit --------------------------------------------------------------------------------
async function servedShaCheck() {
  const token = secret('CLOUDFLARE_API_TOKEN') || die('CLOUDFLARE_API_TOKEN is not in the credentials file');
  const { servedSha } = await import(pathToFileURL(path.join(REPO, 'scripts/dev-deploy.mjs')).href);
  const api = async p => { const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${PREVIEW_WORKER}${p}`, { headers: { Authorization: `Bearer ${token}` } }); const j = await r.json().catch(() => ({})); if (!j.success) die(`Cloudflare ${p}: ${r.status}`); return j.result; };
  const deployments = (await api('/deployments')).deployments.map(d => ({ versions: d.versions.map(v => v.version_id) }));
  const versions = {};
  for (const id of new Set(deployments.flatMap(d => d.versions))) { const v = await api(`/versions/${id}`); versions[id] = { message: v.annotations?.['workers/message'], trigger: v.annotations?.['workers/triggered_by'] }; }
  const sha = servedSha(deployments, versions), want = arg('expect-sha');
  return { served: sha, expected: want, ok: !!sha && (sha === want || sha.startsWith(want) || want.startsWith(sha)) };
}

// ---- main ----------------------------------------------------------------------------------------------------------------------------
let outcome = 'error';
try {
  if (MODE === 'live') {
    const served = await servedShaCheck();
    run.served = served; flush(); log(`preview serves ${served.served} (expected ${served.expected})`);
    if (!served.ok) die('the preview is not serving the expected sandbox commit');
  } else run.served = { served: null, note: 'rehearsal: no deploy record; the live check compares the Cloudflare version chain (dev-deploy.mjs servedSha) with --expect-sha' };

  // 1. authenticate and read the allowance (the 401 before and the 200 after prove the headers/cookie path)
  const before = await call('GET', '/api/learn/usage');
  save('usage-before.json', before);
  if (before.status !== 200) die(`not signed in on ${BASE} (usage answered ${before.status}); no ledger reservation was made`);
  run.credits = { allowance: before.body.allowanceCredits, used: before.body.usedCredits, remaining: before.body.remainingCredits, enforced: before.body.enforced };
  flush();
  if (!(before.body.remainingCredits >= MIN_CREDITS)) die(`remaining credits ${before.body.remainingCredits} do not cover the ${MIN_CREDITS}-credit generation reserve; nothing reserved or submitted`);

  // 2. a board the smoke user owns (created once per mode, then reused)
  const stateFile = path.join(STATE, 'board.json');
  let board = null;
  try { board = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* none yet */ }
  if (board) {
    const check = await call('GET', `/api/learn/boards/${board.canvas}/main`);
    if (check.status !== 200 || check.body.board_id !== board.boardId) board = null;
  }
  if (!board) {
    const canvas = await call('POST', '/api/canvases', { title: `Sandbox validation ${new Date().toISOString().slice(0, 10)}` });
    if (canvas.status >= 300 || !canvas.body.name) die(`canvas creation answered ${canvas.status}`);
    const saved = await call('PUT', `/api/learn/boards/${canvas.body.name}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], sources: [], blocks: [] }, version: 0 });
    if (saved.status !== 200 || !saved.body.board_id) die(`board creation answered ${saved.status}`);
    board = { canvas: canvas.body.name, boardId: saved.body.board_id };
    fs.writeFileSync(stateFile, JSON.stringify(board));
  }
  run.board = board; flush();

  // 3. reserve BEFORE submitting (both ledgers); a refusal stops here
  const reservation = ledger('reserve', RUN_ID, String(RESERVE_USD));
  save('ledger-reserve.json', reservation); log(`ledger reserve ${RESERVE_USD} -> ${reservation.ok ? 'ok' : `REFUSED ${JSON.stringify(reservation).slice(0, 200)}`}`);
  if (!reservation.ok) die('the ledger refused the reservation; nothing submitted');
  run.reserved = true; flush();

  // 4. submit once (the exact request startExplain sends: simple class, an explicit /explain)
  const requestId = `drv-${RUN_ID}`.slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '-').padEnd(8, '0'), cardId = `card-${RUN_ID}`.slice(0, 64).replace(/[^A-Za-z0-9_-]/g, '-').padEnd(8, '0');
  run.requestId = requestId; run.cardId = cardId; run.submitted = true; flush(); // set BEFORE the network call: from here the spend may have started
  const created = await call('POST', '/api/learn/explain/jobs', { boardId: board.boardId, requestId, cardId, prompt: PROMPT, requestClass: 'simple', source: 'explicit' });
  save('job-create.json', created);
  if (created.status !== 202 || !created.body.job?.id) {
    // Refused at admission (no job made): nothing ran. Any other answer is unknown until the job list says otherwise.
    const refused = [400, 404, 409, 413, 429, 503].includes(created.status) && !created.body.job;
    run.createFailure = { status: created.status, body: created.body };
    outcome = refused ? 'refused' : 'unknown';
    throw new Error(`job creation answered ${created.status}`);
  }
  const jobId = created.body.job.id; run.jobId = jobId; flush();

  // 5. poll to a terminal stage, a brief that wants the learner's approval (never auto-approved), or the hard timeout
  const deadline = Date.now() + TIMEOUT_S * 1000;
  let view = null, last = '';
  while (Date.now() < deadline) {
    const got = await call('GET', `/api/learn/explain/jobs/${jobId}?board=${board.boardId}`);
    if (got.status !== 200) { log(`poll answered ${got.status}`); await new Promise(r => setTimeout(r, POLL_MS)); continue; }
    view = got.body; const stage = view.job.stage;
    if (stage !== last) { log(`stage ${stage} round ${view.job.round}`); last = stage; }
    if (view.job.terminal || stage === 'awaiting_approval') break;
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  if (!view || !(view.job.terminal || view.job.stage === 'awaiting_approval')) {
    log('hard timeout: asking the job to stop (a stop is not a retry)');
    await call('POST', `/api/learn/explain/jobs/${jobId}/cancel`, { boardId: board.boardId });
    await new Promise(r => setTimeout(r, Math.max(POLL_MS, 2000)));
    view = (await call('GET', `/api/learn/explain/jobs/${jobId}?board=${board.boardId}`)).body;
    run.timedOut = true;
  }
  save('job.json', view);
  const job = view.job;
  // 5b. owner diagnostics (GET only; needs EXPLAIN_DIAGNOSTICS on the preview): the per-round history incl. its truncated/cut flags, saved as evidence
  try {
    const d = await call('GET', `/api/learn/explain/jobs/${jobId}?board=${board.boardId}&detail=1`);
    save('diagnostics.json', d);
    const h = d.body?.explainDiagnostics?.history ?? d.body?.diagnostics?.history ?? d.body?.history ?? null;
    run.historyCheck = { status: d.status, entries: Array.isArray(h) ? h.length : null, truncated: Array.isArray(h) ? h.filter(e => e.truncated).map(e => ({ round: e.round, cut: e.cut })) : null };
  } catch (e) { run.historyCheck = { error: String(e.message || e).slice(0, 200) }; }

  // 6. the stored result, through the owner-only route, with its hashes re-checked here
  let artifact = null, results = null;
  if (job.stage === 'ready' && job.result?.resultId) {
    results = await call('GET', `/api/learn/explain/jobs/results/${job.result.resultId}?board=${board.boardId}`);
    save('result-route.json', results);
    artifact = results.body?.artifact ?? job.result.program ?? null;
    if (artifact) {
      const { verifyHashes } = await import(pathToFileURL(path.join(REPO, 'packages/web/src/explain-program/contract.js')).href);
      run.artifact = { bundleHash: artifact.bundleHash, sourceHash: artifact.sourceHash, manifestHash: artifact.manifestHash, runtimeVersion: artifact.runtimeVersion, fingerprints: artifact.fingerprints,
        hashesVerifiedHere: await verifyHashes(artifact), sameAsJobAnswer: job.result.program ? job.result.program.bundleHash === artifact.bundleHash : null, sourceBytes: Buffer.byteLength(artifact.source),
        execution: results.body?.execution ?? job.result.execution ?? null, blockHasNoSource: !JSON.stringify(view.block ?? {}).includes(artifact.source.slice(0, 40)) };
      save('artifact.json', artifact); save('source.js', artifact.source); save('manifest.json', artifact.manifest); save('hashes.json', run.artifact);
    }
  }

  // 7. measured usage: the job's own credits plus the allowance delta (credits are the finest unit the routes expose)
  const after = await call('GET', '/api/learn/usage');
  save('usage-after.json', after);
  const stages = job.timing?.stages ?? [];
  const sum = key => stages.reduce((n, s) => n + (s[key] || 0), 0);
  const delta = after.status === 200 ? (after.body.usedCredits - before.body.usedCredits) : null;
  const unknownDelta = after.status === 200 ? (after.body.unknownAttempts - before.body.unknownAttempts) : null;
  run.usage = { jobCredits: job.usage?.credits ?? null, jobUnknown: !!job.usage?.unknown, allowanceDeltaCredits: delta, unknownAttemptsDelta: unknownDelta, calls: sum('calls'), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), images: sum('images'), captures: sum('captures'), repairs: job.timing?.repairs ?? null, processingMs: job.timing?.processingMs ?? null };
  run.final = { stage: job.stage, stopReason: job.stopReason, round: job.round, failure: job.failure, recovery: job.recovery, timedOut: !!run.timedOut };
  outcome = job.stage;
  flush();
} catch (error) {
  if (!['refused', 'unknown'].includes(outcome)) outcome = run.submitted ? 'unknown' : 'error';
  run.error = String(error.message).slice(0, 300); log(`stopped: ${run.error}`);
} finally {
  // ---- settle: measured when it is known, uncertain (counted at the reserved max) when it is not, released when nothing was sent ----
  try {
    if (run.reserved) {
      const u = run.usage;
      const certain = u && u.jobUnknown === false && u.unknownAttemptsDelta === 0 && u.jobCredits !== null && u.allowanceDeltaCredits !== null
        && run.final && !(run.final.stopReason === 'error') && run.final.failure?.category !== 'transport' && !run.timedOut;
      if (!run.submitted || outcome === 'refused') { run.settled = { how: 'release', result: ledger('release', RUN_ID) }; }
      else if (certain) {
        const credits = Math.max(u.jobCredits, u.allowanceDeltaCredits), usd = Number((credits * 0.01).toFixed(4)); // 1 credit = US$0.01, rounded up per action: an upper bound
        run.settled = { how: 'settle', usd, credits, result: ledger('settle', RUN_ID, String(usd)) };
      } else run.settled = { how: 'uncertain (counted at the reserved max)', result: ledger('uncertain', RUN_ID) };
      log(`ledger ${run.settled.how} -> ${JSON.stringify(run.settled.result).slice(0, 240)}`);
    }
  } catch (error) { run.settled = { how: 'FAILED to update the ledger', error: String(error.message) }; log(run.settled.how); }
  run.status = outcome; run.endedAt = new Date().toISOString(); run.elapsedMs = Date.now() - started;
  flush();
  save('summary.json', { runId: RUN_ID, promptId: PROMPT_ID, prompt: PROMPT, mode: MODE, base: BASE, status: run.status, served: run.served, credits: run.credits, jobId: run.jobId ?? null, final: run.final ?? null, usage: run.usage ?? null,
    artifact: run.artifact ?? null, settled: run.settled, elapsedMs: run.elapsedMs, error: run.error ?? null });
  console.log(`\n${RUN_ID}: ${run.status} in ${(run.elapsedMs / 1000).toFixed(1)} s; ledger ${run.settled?.how ?? 'untouched'}; files in ${dir}`);
  process.exit(run.status === 'ready' ? 0 : run.status === 'error' ? 1 : 2);
}
