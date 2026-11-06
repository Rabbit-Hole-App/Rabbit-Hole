// packages/control-plane/src/learn-grade-store.js
// learn_grades on the dev-only Learn D1 (LEARN_DB = small-learn-dev). Every
// time comparison runs in SQL against the SQLite default created_at, never a
// JavaScript clock.
const STATUS = `CASE WHEN jev IS NOT NULL THEN 'done' WHEN jev_error IS NOT NULL THEN 'failed' WHEN created_at > datetime('now', '-2 minutes') THEN 'pending' ELSE 'incomplete' END`;
const RESERVED = ['org', 'email', 'app', 'board', 'block_id', 'mode', 'attempt_id', 'source', 'bench_run', 'bench_set', 'grader_protocol_version', 'prompt', 'expects', 'answer'];

// ponytail: pruned on the next grade, bench-grade or report call, because the
// dev worker has no scheduled handler and cron delivery is unreliable here.
// Move this to a scheduled prune once cron works.
export const pruneLearnGrades = env => env.LEARN_DB.prepare("DELETE FROM learn_grades WHERE created_at < datetime('now', '-90 days')").run();

// Idempotent on (org, email, app, attempt_id): the id comes from RETURNING or
// the follow-up SELECT, never meta.last_row_id, which is stale when the insert
// does nothing.
export async function reserveGrade(env, row) {
  const inserted = await env.LEARN_DB
    .prepare(`INSERT INTO learn_grades (${RESERVED.join(', ')}) VALUES (${RESERVED.map(() => '?').join(', ')}) ON CONFLICT(org, email, app, attempt_id) DO NOTHING RETURNING id`)
    .bind(...RESERVED.map(column => row[column] ?? null))
    .first();
  if (inserted) return { id: inserted.id, duplicate: false, existing: null };
  const existing = await env.LEARN_DB
    .prepare(`SELECT *, ${STATUS} AS status FROM learn_grades WHERE org = ? AND email = ? AND app = ? AND attempt_id = ?`)
    .bind(row.org, row.email, row.app, row.attempt_id)
    .first();
  return { id: existing.id, duplicate: true, existing };
}

export const completeGrade = (env, id, { jev, ms, inputTokens, cost, model, generationId }) => env.LEARN_DB
  .prepare('UPDATE learn_grades SET jev = ?, jev_ms = ?, jev_tokens = ?, jev_cost = ?, jev_model = ?, jev_generation_id = ? WHERE id = ?')
  .bind(JSON.stringify(jev), ms, inputTokens, cost, model, generationId, id)
  .run();

export const failGrade = (env, id, { error, ms }) => env.LEARN_DB
  .prepare('UPDATE learn_grades SET jev_error = ?, jev_ms = ? WHERE id = ?')
  .bind(String(error).slice(0, 500), ms, id)
  .run();

// One-shot, and only for the learner who owns the row.
export async function setBaseline(env, { id, org, email, app, verdict, ms }) {
  const result = await env.LEARN_DB
    .prepare('UPDATE learn_grades SET baseline_verdict = ?, baseline_ms = ? WHERE id = ? AND org = ? AND email = ? AND app = ? AND baseline_ms IS NULL')
    .bind(verdict, ms, id, org, email, app)
    .run();
  return Number(result.meta?.changes || 0);
}

export async function reportRows(env, { org, email, app }) {
  const { results } = await env.LEARN_DB
    .prepare(`SELECT mode, jev, jev_ms, jev_cost, baseline_verdict, baseline_ms, grader_protocol_version, ${STATUS} AS status, created_at <= datetime('now', '-15 minutes') AS old_enough FROM learn_grades WHERE org = ? AND email = ? AND app = ? AND source = 'canvas'`)
    .bind(org, email, app)
    .all();
  return results || [];
}
