// Compute usage (usage-limits-spec.md, owner 2026-11-15): every second a machine is held for a person is metered against a monthly Compute allowance, as the AI allowance is
// (learn-usage.js, learn-entitlement.js). A machine is a rehearsal the person started or a Run card session they pressed Start on; the controller reports the machine's size and
// times, the control plane writes the entry (never the sandbox). Amounts are integer micro-USD in the ledger; people see Compute units (1 unit = US$0.01 = 10,000 micros),
// never dollars. The wire keeps units only.
//
// RATES, copied from Modal's pricing page (not from memory): https://modal.com/pricing, read 2026-11-15, Sandboxes billed at the non-preemptible rates:
//   CPU     US$0.00003942 per physical core per second   -> 39.42 micro-USD
//   Memory  US$0.00000667 per GiB per second             ->  6.67 micro-USD
// Some third-party write-ups list the Sandbox memory rate as US$0.00000672; the owner confirms the two numbers. Snapshot storage and egress are not metered in v1.
// Both rates and the allowance are config (COMPUTE_RATE_CPU_CORE_SEC_MICROS, COMPUTE_RATE_MEM_GIB_SEC_MICROS, COMPUTE_MONTHLY_ALLOWANCE_USD); a bad value falls back to the default,
// never to unlimited. The monthly billing check against modal.billing.workspace_billing_report corrects the rate config; entries are never rewritten.
import { periodOf, periodReset } from './learn-usage.js';

export const COMPUTE_DEFAULTS = Object.freeze({ allowanceUsd: 10, cpuCoreSecMicros: 39.42, memGibSecMicros: 6.67, sessionCpu: 2, sessionMemoryGiB: 4, estimateSessionSec: 10 * 60, estimateRehearsalSec: 15 * 60 });
export const MICROS_PER_UNIT = 10_000; // 1 Compute unit = US$0.01
const positive = (raw, fallback) => { const n = Number(String(raw ?? '').trim()); return Number.isFinite(n) && n > 0 ? n : fallback; };

export const computeAllowanceMicros = env => Math.round(positive(env?.COMPUTE_MONTHLY_ALLOWANCE_USD, COMPUTE_DEFAULTS.allowanceUsd) * 1e6);
export const computeRates = env => ({ cpu: positive(env?.COMPUTE_RATE_CPU_CORE_SEC_MICROS, COMPUTE_DEFAULTS.cpuCoreSecMicros), mem: positive(env?.COMPUTE_RATE_MEM_GIB_SEC_MICROS, COMPUTE_DEFAULTS.memGibSecMicros) });
// micro-USD per second for a machine of this size
export const ratePerSec = (env, { cpu = COMPUTE_DEFAULTS.sessionCpu, memoryGiB = COMPUTE_DEFAULTS.sessionMemoryGiB } = {}) => { const r = computeRates(env); return cpu * r.cpu + memoryGiB * r.mem; };
export const computeMicros = (env, { cpu, memoryGiB, seconds }) => Math.ceil(Math.max(0, seconds) * ratePerSec(env, { cpu, memoryGiB }));
export const unitsOf = micros => Math.round(Number(micros || 0) / MICROS_PER_UNIT);
const secs = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
const nowSeconds = () => Math.floor(Date.now() / 1000);

// A running entry settles at its end; one past its hard deadline settles at the deadline (the sandbox's own hard timeout guarantees it is gone), so a missed stop never bills unbounded time.
async function settleStale(db, env, userId, now) {
  const { results } = await db.prepare("SELECT entry_id, started_at, deadline_at, cpu, memory_gib FROM compute_entries WHERE user_id = ? AND status = 'running' AND deadline_at IS NOT NULL AND deadline_at <= ?").bind(userId, now).all();
  for (const row of results || []) await endCompute(db, env, row.entry_id, { endedAt: row.deadline_at });
}

// Begin a machine's entry (idempotent on entry_id). deadlineAt: the machine's hard end (a session's deadline, a rehearsal's wall limit), the reservation's horizon.
export async function beginCompute(db, env, { entryId, userId, kind, appId = null, repo = null, commit = null, routeId = null, routeTitle = null, startedAt = nowSeconds(), deadlineAt = null, cpu, memoryGiB }) {
  const size = { cpu: cpu ?? COMPUTE_DEFAULTS.sessionCpu, memoryGiB: memoryGiB ?? COMPUTE_DEFAULTS.sessionMemoryGiB };
  await db.prepare(`INSERT OR IGNORE INTO compute_entries (entry_id, user_id, period, kind, app_id, repo, commit_sha, route_id, route_title, started_at, deadline_at, cpu, memory_gib, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`).bind(entryId, userId, periodOf(startedAt), kind, appId, repo, commit, routeId, routeTitle, startedAt, deadlineAt, size.cpu, size.memoryGiB).run();
}

// Settle a machine's entry once, at endedAt (epoch seconds) or seconds held. Idempotent: a second call changes nothing.
export async function endCompute(db, env, entryId, { endedAt = nowSeconds(), seconds = null } = {}) {
  const row = await db.prepare("SELECT started_at, cpu, memory_gib FROM compute_entries WHERE entry_id = ? AND status = 'running'").bind(entryId).first();
  if (!row) return false;
  const held = seconds ?? Math.max(0, endedAt - row.started_at);
  const micros = computeMicros(env, { cpu: row.cpu, memoryGiB: row.memory_gib, seconds: held });
  const done = await db.prepare("UPDATE compute_entries SET ended_at = ?, seconds = ?, micros = ?, status = 'settled' WHERE entry_id = ? AND status = 'running'").bind(row.started_at + Math.round(held), held, micros, entryId).run();
  return (done?.meta?.changes ?? 1) > 0;
}

// This month for one person: used (settled plus what running machines have accrued), reserved (a running machine's remaining hard time at its rate), remaining, and the machine rows.
export async function computeUsage(db, env, userId, { now = nowSeconds(), limit = 25 } = {}) {
  const period = periodOf(now), allowance = computeAllowanceMicros(env);
  await settleStale(db, env, userId, now);
  const { results } = await db.prepare('SELECT entry_id, kind, repo, commit_sha, route_title, started_at, ended_at, deadline_at, cpu, memory_gib, seconds, micros, status FROM compute_entries WHERE user_id = ? AND period = ? ORDER BY started_at DESC').bind(userId, period).all();
  let used = 0, reserved = 0;
  const byMachine = [];
  for (const row of results || []) {
    const size = { cpu: row.cpu, memoryGiB: row.memory_gib }, running = row.status === 'running';
    const held = running ? Math.max(0, now - row.started_at) : Number(row.seconds || 0);
    const micros = running ? computeMicros(env, { ...size, seconds: held }) : Number(row.micros || 0);
    used += micros;
    if (running && row.deadline_at) reserved += Math.ceil(Math.max(0, row.deadline_at - now) * ratePerSec(env, size));
    if (byMachine.length < limit) byMachine.push({ kind: row.kind, repo: row.repo, commit: row.commit_sha ? String(row.commit_sha).slice(0, 7) : null, routeTitle: row.route_title, startedAt: row.started_at, minutes: Math.max(1, Math.round(held / 60)), usedUnits: unitsOf(micros), running });
  }
  const remaining = Math.max(0, allowance - used - reserved);
  return { period, resetsAt: periodReset(period), allowanceMicros: allowance, usedMicros: used, reservedMicros: reserved, remainingMicros: remaining, byMachine };
}

// The wire body for GET /api/learn/usage `compute`: units only, never micros or dollars.
export async function computeSummary(db, env, userId, opts = {}) {
  const u = await computeUsage(db, env, userId, opts);
  return { allowanceUnits: unitsOf(u.allowanceMicros), usedUnits: unitsOf(u.usedMicros), reservedUnits: unitsOf(u.reservedMicros), remainingUnits: unitsOf(u.remainingMicros),
    minutesLeft: Math.floor(u.remainingMicros / Math.max(1, ratePerSec(env)) / 60), resetsAt: u.resetsAt, byMachine: u.byMachine };
}

// The gate: may this person start a machine that will hold (estimate) seconds? -> { ok, remainingMicros, minutesLeft, lowBalance } or { ok: false, reason, resetsAt, allowanceUnits }.
// Never silent: a refusal names the allowance and the renewal date; an accounting failure is its own reason, never an admit.
export async function admitCompute(db, env, userId, { kind = 'session', cpu, memoryGiB, estimateSec, now = nowSeconds() } = {}) {
  try {
    const u = await computeUsage(db, env, userId, { now, limit: 0 });
    const sec = estimateSec ?? (kind === 'rehearsal' ? COMPUTE_DEFAULTS.estimateRehearsalSec : COMPUTE_DEFAULTS.estimateSessionSec);
    const rate = ratePerSec(env, { cpu, memoryGiB }), estimate = Math.ceil(sec * rate);
    if (u.remainingMicros < estimate) return { ok: false, reason: 'compute_exhausted', resetsAt: u.resetsAt, allowanceUnits: unitsOf(u.allowanceMicros) };
    return { ok: true, remainingMicros: u.remainingMicros, minutesLeft: Math.floor(u.remainingMicros / rate / 60), lowBalance: u.remainingMicros < estimate * 2 };
  } catch { return { ok: false, reason: 'compute_unavailable' }; }
}

// A machine the controller reports (session state: sessionId, startedUtc, deadlineUtc, endedUtc, cpu, memoryGiB) as the entry's fields.
export function entryFromSession(state, { userId, appId, repo, commit, routeId = null, routeTitle = null }) {
  return { entryId: state.sessionId, userId, kind: 'session', appId, repo, commit, routeId, routeTitle, startedAt: secs(state.startedUtc) ?? nowSeconds(), deadlineAt: secs(state.deadlineUtc), cpu: state.cpu, memoryGiB: state.memoryGiB };
}
export const endedAtOf = state => secs(state?.endedUtc);
