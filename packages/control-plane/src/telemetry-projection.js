// Accounting projections (docs/features/telemetry.md "Delivery" 1): LEARN_DB's usage_actions and usage_attempts (0022), copied by
// id into TELEMETRY_DB's accounting_actions and accounting_attempts. Read-only on LEARN_DB; an upsert here, so a re-run, a replay
// from cursor 0 or a full rebuild never double-counts and never touches the ledger. Amounts are copied as recorded: a NULL cost
// stays NULL (unknown), and cost_state says whether a number is measured, estimated or a reservation.
// The cursor is LEARN_DB seconds: COALESCE(ended_at, started_at) for actions, COALESCE(settled_at, started_at) for attempts. A row
// is re-read when it settles or ends later; rows that share the cursor's second are re-read (>=), which the upsert absorbs.
// ponytail: an action marked accounting_error keeps its ended_at, so that one change waits for the next full rebuild (cursor 0).
// shortcut: more than `limit` rows in one second would never advance the cursor; raise limit or add a tiebreak id if that occurs.

const ACTIONS = `SELECT action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at,
  COALESCE(ended_at, started_at) AS mark FROM usage_actions WHERE COALESCE(ended_at, started_at) >= ? ORDER BY mark LIMIT ?`;
const ATTEMPTS = `SELECT attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, input_tokens, output_tokens,
  started_at, settled_at, COALESCE(settled_at, started_at) AS mark FROM usage_attempts WHERE COALESCE(settled_at, started_at) >= ? ORDER BY mark LIMIT ?`;
const UPSERT_ACTION = `INSERT INTO accounting_actions (action_id, user_ref, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at, projected_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (action_id) DO UPDATE SET status = excluded.status, result = excluded.result,
  ended_at = excluded.ended_at, projected_at = excluded.projected_at`;
const UPSERT_ATTEMPT = `INSERT INTO accounting_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status,
  input_tokens, output_tokens, started_at, settled_at, projected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (attempt_id) DO UPDATE SET model = excluded.model, cost_micros = excluded.cost_micros, cost_state = excluded.cost_state,
  status = excluded.status, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, settled_at = excluded.settled_at,
  projected_at = excluded.projected_at`;

async function cursorOf(db, source) {
  return Number((await db.prepare('SELECT cursor FROM projection_cursors WHERE source = ?').bind(source).first())?.cursor ?? 0);
}

// One bounded pass per table: at most `limit` rows each. Returns what it copied and whether more remain (done false: run again).
// from: a cursor to start at instead of the stored one (0 rebuilds). Throws on a database failure; nothing is half-applied,
// because each table's rows and its cursor move in one TELEMETRY_DB batch.
export async function projectAccounting(learnDb, telemetryDb, { limit = 500, now = Date.now(), from = null } = {}) {
  const tables = [
    ['usage_actions', ACTIONS, UPSERT_ACTION, r => [r.action_id, r.user_id, r.payer, r.payer_reason, r.feature, r.charge_class, r.period, r.status, r.result, r.started_at, r.ended_at, now]],
    ['usage_attempts', ATTEMPTS, UPSERT_ATTEMPT, r => [r.attempt_id, r.action_id, r.kind, r.provider, r.model, r.reserved_micros, r.cost_micros, r.cost_state, r.status,
      r.input_tokens, r.output_tokens, r.started_at, r.settled_at, now]],
  ];
  const copied = {};
  let done = true;
  for (const [source, select, upsert, values] of tables) {
    const cursor = from ?? await cursorOf(telemetryDb, source);
    const { results = [] } = await learnDb.prepare(select).bind(cursor, limit).all();
    copied[source] = results.length;
    if (!results.length) continue;
    if (results.length === limit) done = false;
    const next = results.at(-1).mark;
    await telemetryDb.batch([...results.map(r => telemetryDb.prepare(upsert).bind(...values(r))),
      telemetryDb.prepare('INSERT INTO projection_cursors (source, cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT (source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at')
        .bind(source, next, now)]);
  }
  return { copied, done };
}
