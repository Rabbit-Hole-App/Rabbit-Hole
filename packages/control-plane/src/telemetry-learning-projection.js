// Learning evidence projections (docs/features/telemetry.md "Tutor evidence"): LEARN_DB's attempts, assessments, observations and
// goal criteria (learn 0025 and 0026) copied by id into TELEMETRY_DB (migration 0002). Read-only on LEARN_DB; an upsert here, so a
// re-run, a replay from cursor 0 or a full rebuild changes nothing. Same shape as telemetry-projection.js, which it runs beside.
// ALLOWLIST BY SELECT: each query names the columns it copies. The learner's answer (content_json), the references behind it, goal
// and criterion text, an activity's objective and prompt, an assessment's free reason and the raw provenance are never selected,
// and the few values derived from JSON columns are counts, latency and model tokens only.
// Cursors are the product's ISO timestamps as unix seconds. A source whose table does not exist yet (LEARN_DB without 0025 or 0026)
// is reported null and skipped, so the projection works before and after those migrations are applied.
// ponytail: a validity change (disputed, superseded) is a later write that does not move observed_at, so each pass also sweeps the
// newest observations of the last week (RECENT of them) and rewrites only those whose validity, conflict or application changed;
// a change to an older observation waits for a full rebuild (from: 0). The cursor expressions are not indexed: each pass scans the
// table it reads, which is small.
// shortcut: more than `limit` rows in one second would never advance a cursor; raise limit or add a tiebreak id if that occurs.

const WEEK = 7 * 86400, RECENT = 500;
const TOKEN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const token = value => (typeof value === 'string' && TOKEN.test(value) ? value : null);
const secs = column => `CAST(strftime('%s', ${column}) AS INTEGER)`;
const length = json => { try { const list = JSON.parse(json); return Array.isArray(list) ? list.length : null; } catch { return null; } };
// Evaluator calls recorded in an assessment's provenance: how many, how long they took, which models, whether the larger one ran.
function calls(json) {
  try {
    const list = (JSON.parse(json)?.calls) || [];
    if (!Array.isArray(list)) return { count: null, ms: null, models: null, escalated: null };
    const latencies = list.map(call => call?.latencyMs).filter(ms => Number.isFinite(ms) && ms >= 0);
    const models = [...new Set(list.map(call => token(call?.servedModel)).filter(Boolean))];
    return { count: list.length, ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0)) : null, models: models.length ? models.join(',') : null, escalated: list.some(call => call?.role === 'tutor_evaluator') ? 1 : 0 };
  } catch { return { count: null, ms: null, models: null, escalated: null }; }
}

const SOURCES = [
  { source: 'learning_attempts',
    select: `SELECT id, owner_user_id, app, board, goal_id, activity_id, activity_revision, response_kind, assistance, assistance_refs_json, source_refs_json, submitted_at,
      ${secs('submitted_at')} AS mark FROM learn_attempts WHERE ${secs('submitted_at')} >= ? ORDER BY mark LIMIT ?`,
    upsert: `INSERT INTO learning_attempts (id, user_ref, canvas_ref, board, goal_id, activity_id, activity_revision, response_kind, assistance, assistance_ref_count, source_ref_count, submitted_at, submitted_s, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET assistance = excluded.assistance, projected_at = excluded.projected_at`,
    values: (r, now) => [r.id, r.owner_user_id, r.app, r.board, r.goal_id, r.activity_id, r.activity_revision, r.response_kind, r.assistance, length(r.assistance_refs_json), length(r.source_refs_json), r.submitted_at, r.mark, now] },
  { source: 'learning_assessments',
    select: `SELECT id, attempt_id, owner_user_id, status, route, reason, rubric_version, evaluator_version, supersedes_assessment_id, provenance_json, created_at, updated_at,
      ${secs('updated_at')} AS mark FROM learn_assessments WHERE ${secs('updated_at')} >= ? ORDER BY mark LIMIT ?`,
    upsert: `INSERT INTO learning_assessments (id, attempt_id, user_ref, status, route, reason, rubric_version, evaluator_version, supersedes_assessment_id, escalated, call_count, call_ms, served_models, created_at, updated_at, updated_s, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET status = excluded.status, route = excluded.route, reason = excluded.reason, rubric_version = excluded.rubric_version,
      evaluator_version = excluded.evaluator_version, escalated = excluded.escalated, call_count = excluded.call_count, call_ms = excluded.call_ms, served_models = excluded.served_models,
      updated_at = excluded.updated_at, updated_s = excluded.updated_s, projected_at = excluded.projected_at`,
    values: (r, now) => { const c = calls(r.provenance_json); return [r.id, r.attempt_id, r.owner_user_id, r.status, token(r.route), token(r.reason), r.rubric_version, r.evaluator_version, r.supersedes_assessment_id, c.escalated, c.count, c.ms, c.models, r.created_at, r.updated_at, r.mark, now]; } },
  { source: 'learning_observations',
    select: `SELECT id, assessment_id, attempt_id, owner_user_id, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, validity, conflict, application, retention_of, observed_at,
      ${secs('observed_at')} AS mark FROM learn_observations WHERE ${secs('observed_at')} >= ? ORDER BY mark LIMIT ?`,
    upsert: `INSERT INTO learning_observations (id, assessment_id, attempt_id, user_ref, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, validity, conflict, application, retention_of, observed_at, observed_s, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET validity = excluded.validity, conflict = excluded.conflict, application = excluded.application, projected_at = excluded.projected_at
      WHERE learning_observations.validity IS NOT excluded.validity OR learning_observations.conflict IS NOT excluded.conflict OR learning_observations.application IS NOT excluded.application`,
    recent: `SELECT id, assessment_id, attempt_id, owner_user_id, goal_id, criterion_id, criterion_version, fit, reasoning, assistance, validity, conflict, application, retention_of, observed_at,
      ${secs('observed_at')} AS mark FROM learn_observations WHERE ${secs('observed_at')} >= ? ORDER BY mark DESC LIMIT ?`,
    values: (r, now) => [r.id, r.assessment_id, r.attempt_id, r.owner_user_id, r.goal_id, r.criterion_id, r.criterion_version, r.fit, r.reasoning, r.assistance, r.validity, r.conflict, r.application, r.retention_of, r.observed_at, r.mark, now] },
  { source: 'learning_criteria',
    select: `SELECT c.goal_id, c.scope_version, c.criterion_id, c.version, g.owner_user_id, c.requires_reasoning, c.requires_transfer, c.rubric_version,
      ${secs('c.created_at')} AS mark FROM learn_goal_criteria c JOIN learn_goals g ON g.id = c.goal_id WHERE ${secs('c.created_at')} >= ? ORDER BY mark LIMIT ?`,
    upsert: `INSERT INTO learning_criteria (goal_id, scope_version, criterion_id, version, user_ref, requires_reasoning, requires_transfer, rubric_version, created_s, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (goal_id, scope_version, criterion_id) DO UPDATE SET projected_at = excluded.projected_at`,
    values: (r, now) => [r.goal_id, r.scope_version, r.criterion_id, r.version, r.owner_user_id, r.requires_reasoning, r.requires_transfer, r.rubric_version, r.mark, now] },
];
const missingTable = error => /no such table|no such column/i.test(String(error?.message || error));

// One bounded pass per source; -> { copied: { source: rows | null }, done }. null: that source does not exist in this LEARN_DB yet.
export async function projectLearning(learnDb, telemetryDb, { limit = 500, now = Date.now(), from = null } = {}) {
  const copied = {};
  let done = true;
  for (const { source, select, upsert, values, recent } of SOURCES) {
    const start = from ?? Number((await telemetryDb.prepare('SELECT cursor FROM projection_cursors WHERE source = ?').bind(source).first())?.cursor ?? 0);
    let rows;
    try { rows = (await learnDb.prepare(select).bind(start, limit).all()).results || []; }
    catch (error) { if (missingTable(error)) { copied[source] = null; continue; } throw error; }
    copied[source] = rows.length;
    if (rows.length) {
      if (rows.length === limit) done = false;
      await telemetryDb.batch([...rows.map(row => telemetryDb.prepare(upsert).bind(...values(row, now))),
        telemetryDb.prepare('INSERT INTO projection_cursors (source, cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT (source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at')
          .bind(source, rows.at(-1).mark, now)]);
    }
    if (recent) {
      const newest = (await learnDb.prepare(recent).bind(Math.floor(now / 1000) - WEEK, RECENT).all()).results || [];
      if (newest.length) await telemetryDb.batch(newest.map(row => telemetryDb.prepare(upsert).bind(...values(row, now))));
    }
  }
  return { copied, done };
}
