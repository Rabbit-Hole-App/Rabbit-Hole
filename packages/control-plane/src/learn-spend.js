// Runtime admission for paid Learn operations. Every production/dev paid call must pass here before a provider request.
// The platform cap is deliberately fail-closed: an unset cap or missing 0016 table refuses admission.
export const spendError = reason => Object.assign(new Error(reason), { code: reason });
const number = value => { const n = Number(String(value ?? '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
export const platformCaps = env => ({ usd: number(env?.USAGE_PLATFORM_DAY_USD), operations: number(env?.USAGE_PLATFORM_DAY) ?? 2000 });

// Provider paths that do not have an admission operation still check the
// shared ledger before transport. This closes the reached-cap gap for direct
// Anthropic/OpenAI/Bedrock callers while preserving local test environments
// that do not bind LEARN_DB.
export async function platformSpendStatus(db, env, now = Math.floor(Date.now() / 1000)) {
  const caps = platformCaps(env);
  if (!caps.usd) return { refused: true, reason: 'cap_unset' };
  if (!db) return { refused: false };
  try {
    const row = await db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS spent
      FROM usage_operations
      WHERE admitted_at >= ? AND status IN ('admitted', 'settled')`).bind(now - 86400).first();
    return Number(row?.spent || 0) >= caps.usd
      ? { refused: true, reason: 'daily_cap_reached' }
      : { refused: false };
  } catch {
    return { refused: true, reason: 'spend_schema_unavailable' };
  }
}

export async function admitSpend(db, env, { opId, userId, org, category, now = Math.floor(Date.now() / 1000), deadlineAt = now + 120 }) {
  const caps = platformCaps(env);
  if (!caps.usd) return { refused: true, reason: 'cap_unset' };
  if (!db || !opId || !userId || !org || !category) return { refused: true, reason: 'spend_identity_unavailable' };
  try {
    const result = await db.prepare(`INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, cost_usd)
      SELECT ?, ?, ?, ?, 'admitted', ?, ?, ?
      WHERE (SELECT COUNT(*) FROM usage_operations WHERE admitted_at >= ? AND status <> 'cancelled') < ?
        AND (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_operations WHERE admitted_at >= ? AND status IN ('admitted', 'settled')) + ? <= ?`).bind(
      opId, userId, org, category, now, deadlineAt, caps.usd, now - 86400, caps.operations, now - 86400, caps.usd, caps.usd,
    ).run();
    return result.meta?.changes === 1 ? { refused: false, opId } : { refused: true, reason: 'daily_cap_reached' };
  } catch {
    return { refused: true, reason: 'spend_schema_unavailable' };
  }
}

export async function settleSpend(db, opId, { status = 'settled', calls = 0, costUsd = null, provider = null, model = null, error = null, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!db || !opId) return;
  await db.prepare('UPDATE usage_operations SET status = ?, settled_at = ?, calls = ?, cost_usd = ?, provider = ?, model = ?, error = ? WHERE op_id = ? AND status = \'admitted\'')
    .bind(status, now, calls, costUsd, provider, model, error, opId).run();
}

export function operationId(category) { return `${category}-${crypto.randomUUID()}`; }

export const spendMessage = reason => reason === 'cap_unset'
  ? 'Paid Learn calls are paused until the platform daily dollar cap is configured.'
  : reason === 'daily_cap_reached'
    ? 'Paid Learn calls are paused because the platform daily dollar cap has been reached.'
    : 'Paid Learn calls are temporarily unavailable because spend controls are not ready.';
