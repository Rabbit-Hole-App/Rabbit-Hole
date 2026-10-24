// Accounting projections (docs/features/telemetry.md "Delivery" 1): LEARN_DB's usage_actions and usage_attempts (0022), with
// Credits' usage_attempt_detail and usage_grants (0027; interface docs/features/credits-2500.md), copied by id into TELEMETRY_DB.
// Read-only on LEARN_DB; an upsert here, so a re-run, a replay from cursor 0 or a full rebuild never double-counts and never
// touches the ledger. Amounts are copied as recorded: a NULL cost stays NULL (unknown), and cost_state says whether a number is
// measured, estimated or a reservation. Where 0027 is not applied yet, the attempts are read without their detail and grants are
// skipped; run one rebuild (from: 0) after it is applied so earlier attempts pick up their detail.
// The cursor is LEARN_DB seconds: an action's COALESCE(ended_at, started_at); an attempt's latest of settled_at / started_at and
// its refund time; a grant's granted_at. A row is re-read when it settles, ends or is refunded later; rows sharing the cursor's
// second are re-read (>=), which the upsert absorbs.
// ponytail: an action marked accounting_error keeps its ended_at, and a raised grant keeps its granted_at, so those changes wait
// for the next full rebuild (from: 0). The cursor expressions are not indexed: each pass scans the LEARN_DB tables it reads.
// shortcut: more than `limit` rows in one second would never advance the cursor; raise limit or add a tiebreak id if that occurs.

const ATTEMPT_COLUMNS = 't.attempt_id, t.action_id, t.kind, t.provider, t.model, t.reserved_micros, t.cost_micros, t.cost_state, t.status, t.input_tokens, t.output_tokens, t.started_at, t.settled_at';
const ATTEMPT_MARK = 'MAX(COALESCE(t.settled_at, t.started_at), COALESCE(d.refunded_at, 0))';
const SOURCES = [
  { source: 'usage_actions', selects: [`SELECT action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at,
    COALESCE(ended_at, started_at) AS mark FROM usage_actions WHERE COALESCE(ended_at, started_at) >= ? ORDER BY mark LIMIT ?`],
    upsert: `INSERT INTO accounting_actions (action_id, user_ref, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (action_id) DO UPDATE SET status = excluded.status, result = excluded.result,
      ended_at = excluded.ended_at, projected_at = excluded.projected_at`,
    values: (r, now) => [r.action_id, r.user_id, r.payer, r.payer_reason, r.feature, r.charge_class, r.period, r.status, r.result, r.started_at, r.ended_at, now] },
  { source: 'usage_attempts', selects: [
    `SELECT ${ATTEMPT_COLUMNS}, d.price_version, d.tier, d.quantities, d.unverified, d.refunded_micros, d.refunded_at, ${ATTEMPT_MARK} AS mark
      FROM usage_attempts t LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id WHERE ${ATTEMPT_MARK} >= ? ORDER BY mark LIMIT ?`,
    `SELECT ${ATTEMPT_COLUMNS}, COALESCE(t.settled_at, t.started_at) AS mark FROM usage_attempts t WHERE COALESCE(t.settled_at, t.started_at) >= ? ORDER BY mark LIMIT ?`],
    upsert: `INSERT INTO accounting_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status,
      input_tokens, output_tokens, started_at, settled_at, price_version, tier, quantities, unverified, refunded_micros, refunded_at, projected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (attempt_id) DO UPDATE SET model = excluded.model, cost_micros = excluded.cost_micros, cost_state = excluded.cost_state,
      status = excluded.status, input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, settled_at = excluded.settled_at,
      price_version = excluded.price_version, tier = excluded.tier, quantities = excluded.quantities, unverified = excluded.unverified,
      refunded_micros = excluded.refunded_micros, refunded_at = excluded.refunded_at, projected_at = excluded.projected_at`,
    values: (r, now) => [r.attempt_id, r.action_id, r.kind, r.provider, r.model, r.reserved_micros, r.cost_micros, r.cost_state, r.status,
      r.input_tokens, r.output_tokens, r.started_at, r.settled_at, r.price_version ?? null, r.tier ?? null, r.quantities ?? null, r.unverified ?? null,
      r.refunded_micros ?? null, r.refunded_at ?? null, now] },
  { source: 'usage_grants', selects: [`SELECT user_id, period, allowance_micros, source, granted_at, granted_at AS mark FROM usage_grants WHERE granted_at >= ? ORDER BY mark LIMIT ?`],
    upsert: `INSERT INTO accounting_grants (user_ref, period, allowance_micros, source, granted_at, projected_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_ref, period) DO UPDATE SET allowance_micros = excluded.allowance_micros, source = excluded.source, projected_at = excluded.projected_at`,
    values: (r, now) => [r.user_id, r.period, r.allowance_micros, r.source, r.granted_at, now] },
];
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function cursorOf(db, source) {
  return Number((await db.prepare('SELECT cursor FROM projection_cursors WHERE source = ?').bind(source).first())?.cursor ?? 0);
}

// The first of a source's queries this LEARN_DB can answer; null when none can (its table does not exist here yet).
async function read(learnDb, selects, cursor, limit) {
  for (const select of selects) {
    try { return (await learnDb.prepare(select).bind(cursor, limit).all()).results || []; }
    catch (error) { if (!missingTable(error)) throw error; }
  }
  return null;
}

// One bounded pass per source: at most `limit` rows each. Returns what it copied (null: that source does not exist here) and
// whether more remain (done false: run again). from: a cursor to start at instead of the stored one (0 rebuilds). Throws on any
// other database failure; nothing is half-applied, because each source's rows and its cursor move in one TELEMETRY_DB batch.
export async function projectAccounting(learnDb, telemetryDb, { limit = 500, now = Date.now(), from = null } = {}) {
  const copied = {};
  let done = true;
  for (const { source, selects, upsert, values } of SOURCES) {
    const rows = await read(learnDb, selects, from ?? await cursorOf(telemetryDb, source), limit);
    copied[source] = rows && rows.length;
    if (!rows?.length) continue;
    if (rows.length === limit) done = false;
    await telemetryDb.batch([...rows.map(r => telemetryDb.prepare(upsert).bind(...values(r, now))),
      telemetryDb.prepare('INSERT INTO projection_cursors (source, cursor, updated_at) VALUES (?, ?, ?) ON CONFLICT (source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at')
        .bind(source, rows.at(-1).mark, now)]);
  }
  return { copied, done };
}
