// Shared atomic runtime spend ledger; no provider/model/evaluator dependencies.
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

export async function admitSpend(db, env, { opId, userId, org, category, reservedUsd, now = Math.floor(Date.now() / 1000), deadlineAt = now + 120 }) {
  const caps = platformCaps(env);
  if (!caps.usd) return { refused: true, reason: 'cap_unset' };
  if (!db || !opId || !userId || !org || !category) return { refused: true, reason: 'spend_identity_unavailable' };
  if (!Number.isFinite(reservedUsd) || reservedUsd <= 0) return { refused: true, reason: 'spend_bound_unavailable' };
  try {
    const result = await db.prepare(`INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, cost_usd)
      SELECT ?, ?, ?, ?, 'admitted', ?, ?, ?
      WHERE (SELECT COUNT(*) FROM usage_operations WHERE admitted_at >= ? AND status <> 'cancelled') < ?
        AND NOT EXISTS (SELECT 1 FROM usage_operations WHERE (COALESCE(settled_at, admitted_at) >= ? OR status = 'admitted') AND status <> 'cancelled' AND (cost_usd IS NULL OR error = 'spend_bound_exceeded'))
        AND (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_operations WHERE (COALESCE(settled_at, admitted_at) >= ? OR status = 'admitted') AND status <> 'cancelled') + ? <= ?`).bind(
      opId, userId, org, category, now, deadlineAt, reservedUsd, now - 86400, caps.operations, now - 86400, now - 86400, reservedUsd, caps.usd,
    ).run();
    return result.meta?.changes === 1 ? { refused: false, opId } : { refused: true, reason: 'daily_cap_reached' };
  } catch {
    return { refused: true, reason: 'spend_schema_unavailable' };
  }
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
