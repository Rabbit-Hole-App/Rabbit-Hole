// Shared atomic runtime spend ledger; no provider/model/evaluator dependencies. admitSpend is the one admission for every
// paid provider call: the platform daily guard (usage_operations, 0016) and, for chargeable work, the payer's monthly AI
// allowance (usage_actions/usage_attempts, 0022; owner L12 2026-10-20), checked and reserved in one D1 transaction.
import { admissionPayer, attemptKind, beginAttempt, noteUsageRefusal, periodOf, periodReset, toMicros, usagePayer, usageRefusal, usageTotals, BALANCE_SCOPE, USED_SUM, HELD_SUM } from './learn-usage.js';
import { monthlyAllowanceMicros } from './learn-usage-config.js';

export const spendError = reason => Object.assign(new Error(reason), { code: reason });
const number = value => { const n = Number(String(value ?? '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
export const platformCaps = env => ({ usd: number(env?.USAGE_PLATFORM_DAY_USD), operations: number(env?.USAGE_PLATFORM_DAY) ?? 2000 });

// Diagnostic read only. Transport admission uses the atomic INSERT below, never a read-then-send check.
export async function platformSpendStatus(db, env, now = Math.floor(Date.now() / 1000)) {
  const caps = platformCaps(env);
  if (!caps.usd) return { refused: true, reason: 'cap_unset' };
  if (!db) return { refused: true, reason: 'spend_identity_unavailable' };
  try {
    const row = await db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS spent
      FROM usage_operations
      WHERE (COALESCE(settled_at, admitted_at) >= ? OR status = 'admitted') AND status <> 'cancelled'`).bind(now - 86400).first();
    return Number(row?.spent || 0) >= caps.usd
      ? { refused: true, reason: 'daily_cap_reached' }
      : { refused: false };
  } catch {
    return { refused: true, reason: 'spend_schema_unavailable' };
  }
}

// The platform guard, unchanged: the day's operation count, no unpriced or bound-breaking row, the day's dollars.
const PLATFORM_INSERT = `INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, cost_usd)
      SELECT ?, ?, ?, ?, 'admitted', ?, ?, ?
      WHERE (SELECT COUNT(*) FROM usage_operations WHERE admitted_at >= ? AND status <> 'cancelled') < ?
        AND NOT EXISTS (SELECT 1 FROM usage_operations WHERE (COALESCE(settled_at, admitted_at) >= ? OR status = 'admitted') AND status <> 'cancelled' AND (cost_usd IS NULL OR error = 'spend_bound_exceeded'))
        AND (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_operations WHERE (COALESCE(settled_at, admitted_at) >= ? OR status = 'admitted') AND status <> 'cancelled') + ? <= ?`;
// Chargeable work adds its allowance to the same INSERT: used + held + this reservation within the allowance.
const ALLOWANCE_CLAUSE = `
        AND (SELECT ${USED_SUM} + ${HELD_SUM} ${BALANCE_SCOPE}) + ? <= ?`;
// The reservation, written in the same transaction and only when that INSERT admitted.
const RESERVE = `INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_state, status, started_at)
      SELECT ?, ?, ?, ?, ?, ?, 'reserved', 'running', ?
      WHERE EXISTS (SELECT 1 FROM usage_operations WHERE op_id = ? AND admitted_at = ? AND status = 'admitted')`;

// Refusals of the person's allowance (definite: nothing was reserved), as opposed to the platform's.
export const ALLOWANCE_REASONS = ['allowance_exhausted', 'allowance_insufficient', 'allowance_reserved', 'allowance_unavailable', 'payer_unavailable'];

function refuse(env, reason, period = null) {
  noteUsageRefusal(env, { reason, period });
  return { refused: true, reason };
}

// Why a chargeable reservation was refused, for the person's explanation only; it never admits anything.
async function explain(db, payer, need) {
  try {
    const row = await db.prepare(`SELECT ${USED_SUM} AS used, ${HELD_SUM} AS held ${BALANCE_SCOPE}`).bind(payer.userId, payer.period).first();
    const left = payer.allowance - Number(row?.used || 0), held = Number(row?.held || 0);
    if (left - held >= need) return 'daily_cap_reached'; // the allowance fits: the platform guard refused
    if (left <= 0) return 'allowance_exhausted';
    if (held > 0 && (left - held <= 0 || left >= need)) return 'allowance_reserved'; // running work holds what would fit
    return 'allowance_insufficient';
  } catch {
    return 'allowance_unavailable';
  }
}

export async function admitSpend(db, env, { opId, userId, org, category, reservedUsd, kind, provider = null, model = null, now = Math.floor(Date.now() / 1000), deadlineAt = now + 120 }) {
  const caps = platformCaps(env);
  if (!caps.usd) return refuse(env, 'cap_unset');
  if (!db || !opId || !userId || !org || !category) return refuse(env, 'spend_identity_unavailable');
  if (!Number.isFinite(reservedUsd) || reservedUsd <= 0) return refuse(env, 'spend_bound_unavailable');
  const payer = await admissionPayer(env, db);
  if (payer.refused) return refuse(env, payer.reason, payer.period || periodOf(now));
  const reservedMicros = toMicros(reservedUsd);
  const platform = [opId, userId, org, category, now, deadlineAt, reservedUsd, now - 86400, caps.operations, now - 86400, now - 86400, reservedUsd, caps.usd];
  if (!payer.chargeable) {
    // Platform-funded (free practice grading, an anonymous public link, marked system work): the platform guard alone, and
    // its attempt recorded best effort, as in Phase 1.
    try {
      const result = await db.prepare(PLATFORM_INSERT).bind(...platform).run();
      if (result.meta?.changes !== 1) return refuse(env, 'daily_cap_reached');
    } catch {
      return refuse(env, 'spend_schema_unavailable');
    }
    return { refused: false, opId, attemptId: await beginAttempt(env, { attemptId: opId, kind, provider, model, reservedMicros, now }) };
  }
  try {
    // One D1 batch is one transaction: no other request reads the balance between this check and this reservation.
    const [admitted, reserved] = await db.batch([
      db.prepare(PLATFORM_INSERT + ALLOWANCE_CLAUSE).bind(...platform, payer.userId, payer.period, reservedMicros, payer.allowance),
      db.prepare(RESERVE).bind(opId, payer.actionId, attemptKind(env, kind), provider, model, reservedMicros, now, opId, now),
    ]);
    if (admitted.meta?.changes === 1 && reserved.meta?.changes === 1) return { refused: false, opId, attemptId: opId };
    // shortcut: an admitted row without its reservation cannot happen in one transaction; refuse rather than spend unaccounted.
    if (admitted.meta?.changes === 1) return refuse(env, 'allowance_unavailable', payer.period);
  } catch {
    return refuse(env, 'allowance_unavailable', payer.period);
  }
  return refuse(env, await explain(db, payer, reservedMicros), payer.period);
}

export async function settleSpend(db, opId, { status = 'settled', calls = 0, costUsd = null, provider = null, model = null, error = null, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!db || !opId) return;
  const known = Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : null;
  // A timeout, disconnect or absent usage is not evidence that the provider charged nothing.
  await db.prepare('UPDATE usage_operations SET status = ?, settled_at = ?, calls = ?, cost_usd = COALESCE(?, cost_usd), provider = ?, model = ?, error = CASE WHEN ? > cost_usd THEN \'spend_bound_exceeded\' ELSE ? END WHERE op_id = ? AND status = \'admitted\'')
    .bind(status === 'cancelled' && calls > 0 ? 'failed' : status, now, calls, known, provider, model, known, error, opId).run();
}

export function operationId(category) { return `${category}-${crypto.randomUUID()}`; }

export const spendEnforced = env => env.SMALL_ENV !== 'test';

// What the person is told when a paid call is refused. Their monthly allowance and the platform's daily limit read
// differently (owner D3/D4): the allowance names its reset date; the platform limit is temporary and not theirs.
const resetDate = period => new Date(periodReset(period)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function spendMessage(reason, period = null) {
  const resets = period ? ` It resets on ${resetDate(period)}.` : '';
  switch (reason) {
    case 'allowance_exhausted': return `You've used your monthly AI allowance.${resets}`;
    case 'allowance_insufficient': return `This action needs more than your remaining AI allowance.${resets}`;
    case 'allowance_reserved': return 'Your remaining AI allowance is reserved by AI work that is still running. Try again when it finishes.';
    case 'allowance_unavailable': return 'AI is temporarily unavailable: your AI allowance cannot be checked right now. Your work is saved; try again shortly.';
    case 'payer_unavailable': return 'AI is temporarily unavailable: your sign-in could not be confirmed. Your work is saved; reload and try again.';
    case 'cap_unset': return 'Paid Learn calls are paused until the platform daily dollar cap is configured.';
    case 'spend_bound_unavailable': return 'This model request is paused because its maximum dollar cost cannot be bounded with the configured prices.';
    case 'daily_cap_reached': return 'Paid Learn calls are paused because the platform daily dollar cap has been reached.';
    default: return 'Paid Learn calls are temporarily unavailable because spend controls are not ready.';
  }
}

// One refusal body for every route and the browser's shared handler: code 'allowance_limited' is the person's monthly
// allowance (reason exhausted / insufficient / reserved / unavailable, with its reset); 'spend_limited' is the platform.
export function refusalBody({ reason, period = null }) {
  if (!ALLOWANCE_REASONS.includes(reason)) return { error: spendMessage(reason), code: 'spend_limited', reason };
  const short = reason === 'payer_unavailable' ? 'unavailable' : reason.replace('allowance_', '');
  return { error: spendMessage(reason, period), code: 'allowance_limited', reason: short, ...(period ? { period, resetsAt: periodReset(period) } : {}) };
}
// Unavailable is temporary (503); a spent or held allowance and the platform limit are 429.
export const refusalReply = refusal => {
  const body = refusalBody(refusal);
  return Response.json(body, { status: body.code === 'allowance_limited' && body.reason === 'unavailable' ? 503 : 429, headers: { 'Cache-Control': 'no-store' } });
};

// The route boundary (dev-worker.js): a route that failed after a refused admission answers with that refusal, so every
// entry point says the same thing whatever its own error shape. Streams carry it in their error event instead.
export function boundaryReply(env, response) {
  const refusal = usageRefusal(env);
  if (!refusal || !(response instanceof Response) || response.ok || (response.headers.get('content-type') || '').includes('text/event-stream')) return response;
  return refusalReply(refusal);
}

// Before a streaming route starts, whose refusal would otherwise arrive inside a 200 stream: a chargeable caller with
// nothing available is answered at once with the same body admission would give. An explanation, never an admission:
// only admitSpend reserves. Null lets the route run (and refuse at admission if it must).
export async function allowanceFirst(env) {
  if (!spendEnforced(env) || !platformCaps(env).usd) return null;
  const payer = await usagePayer(env);
  if (payer?.chargeClass !== 'would_charge') return null; // free, public, or no session: the route's own rules answer
  const allowance = monthlyAllowanceMicros(env);
  let reason = null;
  if (allowance == null || !env.LEARN_DB) reason = 'allowance_unavailable';
  else {
    try {
      const { used, reserved } = await usageTotals(env.LEARN_DB, payer.userId, payer.period);
      if (allowance - used <= 0) reason = 'allowance_exhausted';
      else if (allowance - used - reserved <= 0) reason = 'allowance_reserved';
    } catch { reason = 'allowance_unavailable'; }
  }
  return reason ? refusalReply({ reason, period: payer.period }) : null;
}
