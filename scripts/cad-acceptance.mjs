// CAD review-first production acceptance helper (docs/features/cad-review-first-acceptance.md section 4). Plain Node, no packages.
// Production access, all read-only: GET https://rabbit-hole-cad-prod.fly.dev/health; `fly machine status` for the executor machine;
// and in `post` single SELECT statements on the learn D1 (the runner rejects anything else; credentials are read by NAME from the
// owner credentials file and never printed). Local writes: baseline/receipt files in CAD_ACCEPTANCE_DIR and the shared validation budget.
//   node scripts/cad-acceptance.mjs pre  [--go "RUN CAD ACCEPTANCE"]     baseline + preflight + budget reserve + browser steps
//   node scripts/cad-acceptance.mjs post [--go "RUN CAD ACCEPTANCE"] [--observed a,b,c] [--user <user id>]
//        [--override-usd N --evidence <file> --reason "<why>"]            collect usage, print the four groups, write the receipt, settle
//     --observed takes what the owner SAW: review-panel,ready,reload,double-click,invalid-edit,quick-edit,credits-only
//   node scripts/cad-acceptance.mjs stop                                   prints the stop commands (executes nothing)
// Without --go both `pre` and `post` are dry runs that write nothing.
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readOnly } from './motion-refund-failed-job.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DIR = process.env.CAD_ACCEPTANCE_DIR || 'C:/s/spec/cad-review-first';
const HEALTH = process.env.CAD_ACCEPTANCE_HEALTH_URL || 'https://rabbit-hole-cad-prod.fly.dev/health';
const PHRASE = 'RUN CAD ACCEPTANCE';
export const ATTEMPT = 11534336; // 10 MiB total_artifact_bytes + 1 MiB (cad-execute/production-budget.mjs reserve)
const RUN_ID = 'cad-review-first-acceptance-1';
const MIN_ATTEMPTS = 2; // one build + one accepted Quick edit rebuild; a refused edit may add one more (see classifyAttempts)
const STALE_MS = 60 * 60 * 1000;
export const OBSERVABLE = ['review-panel', 'ready', 'reload', 'double-click', 'invalid-edit', 'quick-edit', 'credits-only'];
const MAX_USD = 0.50;
const FLY = { app: 'rabbit-hole-cad-prod', machine: '8e2570a74ed058', usdPerHour: 0.0353 /* cad-production.md: 2 CPU / 4 GiB iad */, egressUsdPerGB: 0.02 /* Fly pricing, North America */ };
const MICROS_PER_CREDIT = 10_000; // packages/web/src/account-usage.js UNITS_PER_CREDIT
const PROMPT = 'Plate 80x50x6 mm, four 5 mm holes 8 mm in from the edges';
const BASELINE = path.join(DIR, 'acceptance-baseline.json');
const RECEIPT = path.join(DIR, 'acceptance-receipt.md');
const BUDGET = path.join(path.dirname(DIR), 'budget', 'budget.mjs');
const BUDGET_LEDGER = path.join(path.dirname(DIR), 'budget', 'ledger.md');
export const pt = ms => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' });
const usd = n => `US$${Number(n).toFixed(6)}`;

const flag = (args, name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const goes = args => flag(args, '--go') === PHRASE;
const fail = message => { throw Object.assign(new Error(message), { acceptance: true }); };

// ---- production reads -------------------------------------------------------------------------------------------------------
async function health() {
  const response = await fetch(HEALTH, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'rabbit-hole-cad-acceptance/1' } });
  if (!response.ok) throw new Error(`health returned ${response.status}`);
  return response.json();
}
const flyStatus = () => {
  const r = spawnSync('fly', ['machine', 'status', FLY.machine, '-a', FLY.app], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
};
// One SELECT per call against the production learn D1 through wrangler; the token comes from the owner credentials file by name.
function d1Runner() {
  const text = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
  const env = { ...process.env };
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (!m) fail(`${name} is missing from the credentials file`);
    env[name] = m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return readOnly(sql => {
    const r = spawnSync(process.execPath, [`${ROOT}node_modules/wrangler/bin/wrangler.js`, 'd1', 'execute', 'rabbit-hole-learn-prod', '--remote', '--config', 'wrangler.rabbit-hole-prod.jsonc', '--json', '--command', sql],
      { cwd: `${ROOT}packages/web`, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '').slice((r.stdout || '').indexOf('['));
    if (r.status !== 0 || !out) throw new Error(`wrangler failed (${r.status}): ${(r.stderr || '').slice(-300)}`);
    return JSON.parse(out)[0];
  });
}
const budget = (...args) => { const run = spawnSync(process.execPath, [BUDGET, ...args], { encoding: 'utf8' }); return { code: run.status, out: (run.stdout || run.stderr).trim() }; };

// ---- usage collection (pure over an injected read-only runner) ---------------------------------------------------------------
const num = value => (value === null || value === undefined ? null : Number(value));
// All CAD model operations admitted in the window, with their attempt, action and price rows. Window: the baseline instant to now.
export function collectUsage(run, { fromMs, toMs, user = null }) {
  const from = Math.floor(fromMs / 1000), to = Math.ceil(toMs / 1000);
  const ops = (run(`SELECT o.op_id, o.user_id, o.status, o.admitted_at, o.settled_at, o.calls, o.input_tokens, o.output_tokens, o.cache_read_tokens, o.cost_usd, o.provider, o.model, o.error,
      t.kind, t.status AS attempt_status, t.cost_state, t.cost_micros, t.reserved_micros, t.input_tokens AS attempt_input, t.output_tokens AS attempt_output, t.model AS attempt_model,
      a.action_id, a.feature, a.charge_class, a.status AS action_status, d.price_version, d.tier, d.quantities, COALESCE(d.refunded_micros, 0) AS refunded_micros
    FROM usage_operations o LEFT JOIN usage_attempts t ON t.attempt_id = o.op_id LEFT JOIN usage_actions a ON a.action_id = t.action_id LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id
    WHERE o.category = 'cad' AND o.admitted_at >= ${from} AND o.admitted_at <= ${to} ORDER BY o.admitted_at`).results ?? []).map(row => ({ ...row }));
  const users = [...new Set(ops.map(op => op.user_id))];
  const principal = user || (users.length === 1 ? users[0] : null);
  // Executor builds that reached the control plane: one file_derivatives revision (options_hash) per published build, every user.
  const derivatives = (run(`SELECT options_hash AS revision, MAX(created_at) AS created_at, SUM(bytes) AS bytes, GROUP_CONCAT(DISTINCT kind) AS kinds FROM file_derivatives
    WHERE converter = 'cad-execute' AND created_at >= ${from * 1000} AND created_at <= ${to * 1000} GROUP BY options_hash ORDER BY created_at`).results ?? []).map(row => ({ ...row }));
  return { from, to, users, principal, ambiguous: !principal && users.length > 1, mine: ops.filter(op => op.user_id === principal), others: ops.filter(op => op.user_id !== principal), derivatives };
}

// Never turn missing usage into zero: an operation is measured only when its cost is recorded on the operation AND settled on its attempt.
export function measure(op) {
  const micros = num(op.cost_micros), opMicros = op.cost_usd === null || op.cost_usd === undefined ? null : Math.round(Number(op.cost_usd) * 1e6);
  const measured = op.status === 'settled' && micros !== null && op.cost_state === 'settled' && opMicros !== null;
  const quantities = op.quantities ? (() => { try { return JSON.parse(op.quantities); } catch { return null; } })() : null;
  const input = num(op.input_tokens) ?? num(op.attempt_input) ?? num(quantities?.input), output = num(op.output_tokens) ?? num(op.attempt_output) ?? num(quantities?.output);
  return { measured, micros, mismatch: measured && opMicros !== micros, input, output, model: op.model || op.attempt_model || null, price: op.price_version || null, credits: micros === null ? null : micros / MICROS_PER_CREDIT };
}

// `fly machine status` events -> the runs of the machine that overlap the window, with their full duration (the run exists because of the acceptance).
export function machineRuns(statusText, fromMs, toMs) {
  if (!statusText) return null;
  const events = [...statusText.matchAll(/^\s*(started|stopped)\s*│[^│]*│[^│]*│\s*(\d{4}-\d\d-\d\dT[\d:.]+[+-]\d\d:\d\d)/gm)].map(m => ({ state: m[1], at: Date.parse(m[2]) })).sort((a, b) => a.at - b.at);
  const runs = [];
  for (const event of events) {
    if (event.state === 'started') runs.push({ start: event.at, end: null });
    else if (runs.length && runs.at(-1).end === null) runs.at(-1).end = event.at;
  }
  return runs.filter(run => run.start <= toMs && (run.end ?? toMs) >= fromMs).map(run => ({ ...run, stillRunning: run.end === null, end: run.end ?? toMs }));
}

// The ledger delta against what the flow can reserve: build + accepted rebuild always (2); one more only when an out-of-range edit passed the
// card and the server (the brief declared no maximum for it) and was refused by the executor, which still reserved at admission.
export function classifyAttempts({ dRes, dBytes, sameMonth, observed, published }) {
  if (!sameMonth) return { verdict: 'INCONCLUSIVE', line: 'the UTC month changed during the run' };
  if (dRes === 0) return { verdict: 'NOT SHOWN', line: 'the executor admitted no attempt (a 401 token mismatch, no dispatch, or the job stopped before the executor)' };
  if (dBytes !== dRes * ATTEMPT) return { verdict: 'UNEXPECTED', line: `${dRes} reservations but ${dBytes} B (expected ${dRes * ATTEMPT}); something else charged the ledger` };
  if (dRes < MIN_ATTEMPTS) return { verdict: 'MISSING', line: `${dRes} attempt(s) admitted, ${MIN_ATTEMPTS} expected (build and accepted rebuild)` };
  if (dRes === MIN_ATTEMPTS) return { verdict: 'CONSISTENT', line: 'exactly 2 attempts: the build and the accepted rebuild; the refused edit never reached the executor. Inference from the count; another CAD user at the same time would break it.' };
  if (dRes === MIN_ATTEMPTS + 1 && observed.has('invalid-edit') && published === MIN_ATTEMPTS) return { verdict: 'CONSISTENT', line: '3 attempts, 2 published builds: the out-of-range edit passed the card and the server (no declared maximum) and the executor refused it; an attempt is reserved at admission and never refunded (server.mjs reserve, production-budget.mjs "no refunds")' };
  return { verdict: 'UNEXPLAINED', line: `${dRes} attempts against ${published === null ? 'an unknown number of' : published} published builds; ${dRes > MIN_ATTEMPTS + 1 ? 'more than a refused edit can explain' : 'the third is not shown to be the refused edit'}: a second Preview, a Retry, an export, or another CAD user (read the card's Network/Details evidence)` };
}

// Everything the receipt says, as four groups. Returns {lines, settle} where settle is the amount to settle or null while anything is unresolved.
export function buildReport({ base, now, h, usage, usageError, runs, observed, statusText }) {
  const a = base.health.budget, b = h.budget, sameMonth = a.month === b.month, dRes = b.reservations - a.reservations, dBytes = b.reservedBytes - a.reservedBytes;
  const rows = usage?.mine.map(op => ({ op, m: measure(op) })) ?? [];
  const unresolved = [];
  if (usageError) unresolved.push(`usage could not be read: ${usageError}`);
  else if (usage.ambiguous) unresolved.push(`${usage.users.length} users had CAD operations in the window; pass --user <id> to name the owner's principal`);
  else if (!usage.principal || !rows.length) unresolved.push('no CAD model operation of the principal was found in the window');
  for (const { op, m } of rows) if (!m.measured) unresolved.push(`${op.op_id} has no settled cost (status ${op.status}, attempt ${op.cost_state ?? 'none'}); it stays at its reservation`);
  const published = usage?.derivatives && !usageError ? new Set(usage.derivatives.filter(d => String(d.kinds).includes('step')).map(d => d.revision)).size : null;
  const verdict = classifyAttempts({ dRes, dBytes, sameMonth, observed, published });
  const lines = ['# CAD review-first production acceptance receipt', `Baseline ${base.atPT}; after ${pt(now)}. Executor image ${h.image}; capabilities ${JSON.stringify(h.capabilities)}.`];

  lines.push('', '## 1. MEASURED (calculated from usage records, not estimated)');
  if (!rows.length) lines.push('- none found');
  let micros = 0, credits = 0, complete = rows.length > 0;
  for (const { op, m } of rows) {
    if (!m.measured) { complete = false; lines.push(`- ${op.op_id} admitted ${pt(op.admitted_at * 1000)}: NOT MEASURED (cost not recorded; reservation ${op.reserved_micros ?? 'unknown'} micro-USD stays held)`); continue; }
    micros += m.micros; credits += m.credits;
    lines.push(`- ${op.op_id} admitted ${pt(op.admitted_at * 1000)}, ${op.attempt_status}, ${op.calls} call(s), model ${m.model ?? 'not recorded'}, tokens in ${m.input ?? 'not recorded'} / out ${m.output ?? 'not recorded'}, price version ${m.price ?? 'not recorded'}: ${usd(m.micros / 1e6)} = ${m.credits.toFixed(2)} credits${m.mismatch ? ' (WARNING: operation and attempt costs differ)' : ''}`);
  }
  if (rows.length) lines.push(`- Platform provider cost (usage_operations, principal ${usage.principal}): ${usd(micros / 1e6)}${complete ? '' : ' for the measured rows only; the others are unknown and are NOT counted as zero'}`, `- Learner credits charged (micro-USD / ${MICROS_PER_CREDIT}, charge class ${[...new Set(rows.map(r => r.op.charge_class).filter(Boolean))].join(',') || 'not read'}): ${credits.toFixed(2)}${complete ? '' : ' for the measured rows only'}`);
  const open = rows.filter(r => r.op.action_status === 'running');
  if (open.length) lines.push(`- ${open.length} usage action row(s) are still 'running' although their attempts settled: the CAD model path never closes its action (cad-model.js uses withUsage, no finishActionOf). The balance is unaffected (it sums settled attempts, learn-usage.js BALANCE_SCOPE); only the action status is stale.`);
  if (usage && usage.others.length) lines.push(`- ${usage.others.length} CAD operation(s) of OTHER users in the window, not counted here`);

  lines.push('', '## 2. ESTIMATED (no per-job billing exists; labelled estimates)');
  let estimate = 0, estimated = true;
  if (runs && runs.length) {
    const seconds = runs.reduce((n, r) => n + (r.end - r.start) / 1000, 0), cost = seconds / 3600 * FLY.usdPerHour;
    estimate += cost;
    lines.push(`- Executor machine time: ${runs.map(r => `${pt(r.start)} to ${pt(r.end)}${r.stillRunning ? ' (still running, counted to now)' : ''}`).join('; ')} = ${seconds.toFixed(0)} s at US$${FLY.usdPerHour}/h = ${usd(cost)} ESTIMATE (includes the idle exit wait and any other use of the machine during the run)`);
  } else { estimated = false; lines.push('- Executor machine time: could not be read (fly machine status); NOT estimated, NOT counted as zero'); }
  if (usage?.derivatives && !usageError) {
    const bytes = usage.derivatives.reduce((n, d) => n + Number(d.bytes || 0), 0), cost = bytes / 1e9 * FLY.egressUsdPerGB;
    estimate += cost;
    lines.push(`- Executor transfer: ${bytes} B of artifacts published in the window x US$${FLY.egressUsdPerGB}/GB = ${usd(cost)} ESTIMATE (artifact bytes only; request and callback overhead is not counted)`);
  } else { estimated = false; lines.push('- Executor transfer: not estimated (published artifacts unreadable)'); }

  lines.push('', '## 3. UNKNOWN (no usage record is reachable; not zero)');
  lines.push('- Cloudflare Worker, Durable Object, R2 and D1 cost of this job: shared account allowances, no per-job billing');
  lines.push('- Fly volume and stopped-rootfs storage for the month: not per job');
  lines.push('- Control-plane CAD model ledger (Durable Object cad:production-budget) and retained bytes: readable only with CAD_DIAGNOSTIC_READ_TOKEN. The owner does not need to supply it: each call\'s measured cost is in section 1.');
  lines.push('- Fly invoice for the run: no billing export is reachable from here; section 2 is a rate calculation');
  for (const item of unresolved) lines.push(`- ${item}`);

  lines.push('', '## 4. RESERVED (capacity accounting and holds, not spend)');
  lines.push(`- Executor transfer ledger: month ${a.month} ${a.reservedBytes} B / ${a.reservations} -> ${b.month} ${b.reservedBytes} B / ${b.reservations}; delta ${dRes} attempt(s) = ${dBytes} B (${ATTEMPT} B each). Internal 2 GiB policy cap (production-budget.mjs), not provider funds.`);
  lines.push(`- Attempt check: ${verdict.verdict}: ${verdict.line}`);
  lines.push(`- Executor builds published in the window (all users): ${published ?? 'not read'}${usage?.derivatives ? ` [${usage.derivatives.map(d => `${d.revision} ${pt(d.created_at)}`).join('; ') || 'none'}]` : ''}`);
  for (const { op } of rows) lines.push(`- Model hold of ${op.op_id}: ${op.reserved_micros ?? 'unknown'} micro-USD at admission (released when the attempt settled)`);
  const settle = unresolved.length || !estimated ? null : Math.round((micros / 1e6 + estimate) * 1e6) / 1e6;
  lines.push(`- Validation budget entry ${RUN_ID}: reserved at its US$${MAX_USD.toFixed(2)} maximum until settled; ${settle === null ? 'UNRESOLVED, stays at the maximum' : `settles at ${usd(settle)} (measured ${usd(micros / 1e6)} + estimate ${usd(estimate)})`}`);

  lines.push('', '## Owner-observed in the browser (recorded as given by --observed)');
  const need = { 'review-panel': 'Review design appeared before any generation (brief approval)', ready: 'the card reached ready with STEP and GLB (source generation, build, review)', reload: 'reload recovery: the card and its state came back', 'double-click': 'a double click on Generate started one job', 'invalid-edit': 'an out-of-range Quick edit was refused with an explanation and no accepted change', 'quick-edit': 'Preview then Accept of a valid Quick edit (deterministic rebuild, no model call)', 'credits-only': 'only credits, never dollars, on the card, consent and usage meter' };
  for (const k of OBSERVABLE) lines.push(`- [${observed.has(k) ? 'x' : ' '}] ${need[k]}${observed.has(k) ? '' : ': NOT VERIFIED'}`);
  if (now - base.at > STALE_MS) lines.push('', `WARNING: baseline is ${Math.round((now - base.at) / 60000)} min old; other users may have used capacity`);
  return { lines, settle, verdict, micros, estimate, unresolved };
}

// ---- commands -----------------------------------------------------------------------------------------------------------------
export async function pre(args, io = {}) {
  const h = await (io.health || health)(), b = h.budget || {}, now = Date.now(), go = goes(args), log = io.log || console.log, write = io.write || fs.writeFileSync;
  log(`mode: ${go ? 'GO (writes baseline and reserves budget)' : 'DRY RUN (writes nothing; add --go "' + PHRASE + '")'}   now ${pt(now)}`);
  const room = b.maximumBytes - b.reservedBytes, attempts = Math.floor(room / ATTEMPT);
  log(`executor: ok=${h.ok} admission=${h.admission} busy=${h.busy} image=${String(h.image).slice(0, 8)} capabilities=${JSON.stringify(h.capabilities)}`);
  log(`ledger: month ${b.month} reservedBytes ${b.reservedBytes} reservations ${b.reservations} room ${room} B = ${attempts} attempts (internal 2 GiB transfer policy, not provider funds)`);
  if (!h.ok || h.admission !== true) fail('executor is not healthy or admission is off');
  if (!String(h.image).startsWith('3134c69a')) fail(`unexpected executor image ${h.image} (the 10-21 rollout was 3134c69a); read docs/features/cad-executor.md before continuing`);
  if (!(h.capabilities || []).includes('parameters')) fail('executor does not advertise parameters, so Quick edit rebuilds would be refused');
  if (h.busy) fail('executor is busy; try again in a minute');
  if (room < MIN_ATTEMPTS * ATTEMPT) fail(`REFUSED: the executor ledger has ${attempts} attempt(s) of capacity left this month (${room} B); the job needs ${MIN_ATTEMPTS} (build + Quick edit rebuild). Capacity returns Sat 2026-10-31 5:00 PM PDT (00:00 UTC Nov 1). Do not click Generate.`);
  if (attempts < MIN_ATTEMPTS + 1) log(`WARNING: ${attempts} attempts left; an out-of-range edit with no declared maximum can cost a third.`);
  log(`OK preflight (${attempts} attempts of capacity, ${MIN_ATTEMPTS} needed). Click Generate within 30 minutes; run pre again if you wait longer. Expect after the whole flow: reservations +${MIN_ATTEMPTS} (build, accepted rebuild), or +${MIN_ATTEMPTS + 1} if the refused edit reached the executor (bytes ${MIN_ATTEMPTS * ATTEMPT} or ${(MIN_ATTEMPTS + 1) * ATTEMPT}).`);
  if (go) {
    write(BASELINE, JSON.stringify({ at: now, atPT: pt(now), health: h }, null, 2));
    const r = (io.budget || budget)('reserve', RUN_ID, 'cad-review-first', String(MAX_USD));
    log(`budget reserve ${RUN_ID} ${MAX_USD}: ${r.out}`);
    if (r.code !== 0) fail('budget reserve refused; nothing may be run');
  } else log(`would write ${BASELINE} and run: node budget.mjs reserve ${RUN_ID} cad-review-first ${MAX_USD}`);
  log(`
BROWSER STEPS (the only owner actions after this command)
 1. digrabbithole.com, signed in as the org that owns CAD. New board named "CAD review-first acceptance". Select no other card, attach no picture.
 2. Type /cad and send:  ${PROMPT}
    Confirm the paid consent. The Review design panel must appear (call 1).
 3. Do NOT use Edit details. DOUBLE-CLICK Generate (second paid confirmation): exactly one job must start. Wait for the card to reach ready with STEP and GLB (calls 2 and 3).
 4. Reload the page: the card and its state must come back (reload recovery).
 5. Quick edit: open Details and note whether Hole diameter declares a maximum. Type a value far above it and read the message: "must be at most N" means the card blocked it (no executor attempt); a build that starts and then fails means it reached the executor (one attempt, charged by design). Write down which. Then set Hole diameter 5 to 6, Preview ONCE, Accept (no model call). Open Show dimensions.
 6. Look at every amount shown on the card, the consent and the usage meter: only credits, never dollars.
 7. Run:  node ${fileURLToPath(import.meta.url)} post --go "${PHRASE}" --observed review-panel,ready,reload,double-click,invalid-edit,quick-edit,credits-only   (list only what you actually saw; no dollar amount is needed)
 To stop at any time: node ${fileURLToPath(import.meta.url)} stop`);
}

export async function post(args, io = {}) {
  const log = io.log || console.log, read = io.read || (f => fs.readFileSync(f, 'utf8')), exists = io.exists || fs.existsSync, write = io.write || fs.writeFileSync;
  if (!exists(BASELINE)) fail('no baseline; run pre --go first');
  if (flag(args, '--actual-usd') !== undefined) fail('--actual-usd is retired: cost is collected from the usage records. A manual figure is only accepted as --override-usd N --evidence <file> --reason "<why>".');
  const base = JSON.parse(read(BASELINE)), h = await (io.health || health)(), go = goes(args), now = io.now ?? Date.now();
  const observed = new Set((flag(args, '--observed') || '').split(',').filter(Boolean));
  const unknown = [...observed].filter(x => !OBSERVABLE.includes(x)); if (unknown.length) fail(`unknown --observed item(s): ${unknown}; allowed: ${OBSERVABLE}`);
  const override = flag(args, '--override-usd'), evidence = flag(args, '--evidence'), reason = flag(args, '--reason');
  if (override !== undefined && (!(Number(override) >= 0) || !evidence || !exists(evidence) || !reason?.trim())) fail('--override-usd needs a number, an existing --evidence file path and a --reason');
  let usage = null, usageError = null;
  try { usage = collectUsage((io.run || d1Runner)(), { fromMs: base.at, toMs: now, user: flag(args, '--user') || null }); } catch (e) { usageError = e.message; }
  const statusText = (io.fly || flyStatus)(), runs = machineRuns(statusText, base.at, now);
  const report = buildReport({ base, now, h, usage, usageError, runs, observed, statusText });
  const lines = [...report.lines];
  if (override !== undefined) lines.push('', '## Manual override (audited)', `- override US$${Number(override)}; evidence file ${evidence}; reason: ${reason}; the measured/estimated figures above stay in this receipt`);
  log(lines.join('\n'));
  if (!go) return log(`\nDRY RUN: would write ${RECEIPT}${override !== undefined ? ` and settle ${RUN_ID} at the override` : report.settle !== null ? ` and settle ${RUN_ID} at ${usd(report.settle)}` : `; ${RUN_ID} stays reserved at US$${MAX_USD.toFixed(2)}`}`);
  write(RECEIPT, lines.join('\n') + '\n');
  const amount = override !== undefined ? Number(override) : report.settle;
  if (amount !== null) {
    const r = (io.budget || budget)('settle', RUN_ID, String(amount));
    log(`budget settle ${RUN_ID} ${amount}: ${r.out}`);
    if (override !== undefined && r.code === 0) (io.append || fs.appendFileSync)(BUDGET_LEDGER, `\n- ${pt(now)} ${RUN_ID} SETTLED by MANUAL OVERRIDE at US$${Number(override)}; evidence ${evidence}; reason: ${reason}\n`);
  } else log(`budget ${RUN_ID} left reserved at US$${MAX_USD.toFixed(2)}: ${report.unresolved.join('; ') || 'an estimate could not be computed'}`);
  log(`wrote ${RECEIPT}`);
}

export function stop(args, io = {}) {
  (io.log || console.log)(`STOP COMMANDS (printed only; each was checked against --help)
 Card: Cancel on the card (cancel spends nothing more).
 Model off (no release):  cd packages/web && npx wrangler secret put CAD_MODEL_ENABLED --config wrangler.rabbit-hole-prod.jsonc   (enter: false)
 Executor stop:           fly machine stop ${FLY.machine} -a ${FLY.app}
 Executor no autostart:   fly machine update ${FLY.machine} -a ${FLY.app} --autostart=false
 Release the unused budget:  node ${BUDGET} release ${RUN_ID}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const table = { pre, post, stop };
  if (!table[cmd]) { console.error('usage: pre | post | stop'); process.exit(1); }
  Promise.resolve(table[cmd](args)).catch(e => { console.error(`FAIL ${e.message}`); process.exit(2); });
}
