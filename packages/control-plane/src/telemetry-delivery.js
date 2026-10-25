// Telemetry delivery (docs/features/telemetry.md "Delivery"; brief Task 4). Three paths, and no transaction spans two services:
//  1. Accounting is not delivered at all: LEARN_DB's own rows are the durable record, projected by telemetry-projection.js.
//  2. A Durable Object job appends its event to telemetryOutbox in its own SQLite storage, in the same transaction as the state
//     change it describes, and drains it to TELEMETRY_DB later (an alarm or its next request): crash-safe, retried, bounded.
//  3. A request's own event (a model call, a browser batch) is written once, best effort, by emitTelemetry. It can be lost when
//     TELEMETRY_DB is down; the loss is counted, and it never fails or delays the user's request beyond one bounded write.
// Every write is INSERT OR IGNORE by event_id, so duplicate and replayed delivery are harmless. Analytics never decides a charge.
import { validateEvent, telemetryEnvironment } from './telemetry-contract.js';

const INSERT = `INSERT OR IGNORE INTO telemetry_events (event_id, event_name, schema_version, occurred_at, ingested_at, environment, service,
  release_sha, action_id, attempt_id, job_id, trace_id, user_ref, feature, outcome, error_code, sample_rate, body)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const column = value => value ?? null;

// Writes already-validated events to TELEMETRY_DB in one batch (one D1 transaction). Throws when the database does; the caller
// decides whether that is a retry (the outbox) or a counted drop (emitTelemetry). Returns how many rows were new.
export async function writeEvents(db, events, now = Date.now()) {
  if (!events.length) return 0;
  const results = await db.batch(events.map(e => db.prepare(INSERT).bind(e.event_id, e.event_name, e.schema_version, e.occurred_at, now,
    e.environment, e.service, column(e.release_sha), column(e.action_id), column(e.attempt_id), column(e.job_id), column(e.trace_id),
    column(e.user_ref), column(e.feature), column(e.outcome), column(e.error_code), column(e.sample_rate), JSON.stringify(e))));
  return results.reduce((sum, r) => sum + (r.meta?.changes || 0), 0);
}

// The browser's per-request trace id (x-rh-trace, client-telemetry.js), kept on the request's env so the server events for that
// request (model_call.*) carry it and a client failure can be linked to its server timeline. Anything that is not 16 hex is ignored.
export function withTrace(req, env) {
  const id = req.headers.get('x-rh-trace') || '';
  return /^[0-9a-f]{16}$/.test(id) ? { ...env, TELEMETRY_TRACE: id } : env;
}

// Per-isolate counts of what emitTelemetry could not deliver, reported in the next telemetry.delivery event and the logs.
export const deliveryCounts = { delivered: 0, rejected: 0, dropped: 0 };

// Path 3: validate, stamp this deployment's environment, write once. Never throws. A worker with no TELEMETRY_DB, or no
// TELEMETRY_ENVIRONMENT, writes nothing (provisioning has not happened there); an event for another environment is refused.
export async function emitTelemetry(env, event) {
  const environment = telemetryEnvironment(env);
  if (!env?.TELEMETRY_DB || !environment) return false;
  const checked = validateEvent({ ...event, environment });
  if (!checked.ok) {
    deliveryCounts.rejected++;
    console.warn(JSON.stringify({ event: 'telemetry_rejected', name: event?.event_name ?? null, errors: checked.errors.slice(0, 5) }));
    return false;
  }
  try {
    await writeEvents(env.TELEMETRY_DB, [checked.event]);
    deliveryCounts.delivered++;
    return true;
  } catch {
    deliveryCounts.dropped++;
    console.warn(JSON.stringify({ event: 'telemetry_dropped', name: checked.event.event_name, dropped: deliveryCounts.dropped }));
    return false;
  }
}

// Path 2: a durable outbox in a job's own SQLite. sql(query, ...params) runs synchronously and returns the rows: doSql(ctx.storage)
// in a Durable Object, node:sqlite in tests. Being synchronous, append can sit inside ctx.storage.transactionSync with the state
// change it reports, so both commit or neither does. Rows survive a crash or eviction and drain on the next try.
export const doSql = storage => (query, ...params) => storage.sql.exec(query, ...params).toArray();
const OUTBOX = `CREATE TABLE IF NOT EXISTS telemetry_outbox (event_id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, dead INTEGER NOT NULL DEFAULT 0)`;
// Retry after 30 s, 1, 2, 4 ... minutes, capped at an hour; after maxAttempts the row is dead: kept, counted, never retried.
const backoff = attempts => Math.min(30_000 * 2 ** attempts, 3_600_000);

export function telemetryOutbox(sql, { maxAttempts = 8 } = {}) {
  sql(OUTBOX);
  return {
    // Validated before it is stored: an invalid event is refused here, where the producer can see it, not later in a drain.
    append(event, now = Date.now()) {
      const checked = validateEvent(event);
      if (!checked.ok) return { ok: false, errors: checked.errors };
      sql('INSERT OR IGNORE INTO telemetry_outbox (event_id, body, created_at, next_at) VALUES (?, ?, ?, ?)', checked.event.event_id, JSON.stringify(checked.event), now, now);
      return { ok: true };
    },
    // Sends up to limit due rows, oldest first, to sink(events, now) (writeEvents on TELEMETRY_DB). On success they are deleted;
    // on failure each is retried later, and dead after maxAttempts. Never throws: an outage is a result, not an error.
    async drain(sink, { now = Date.now(), limit = 50 } = {}) {
      const rows = sql('SELECT event_id, body, attempts FROM telemetry_outbox WHERE dead = 0 AND next_at <= ? ORDER BY created_at LIMIT ?', now, limit);
      if (!rows.length) return { delivered: 0, failed: 0, dead: 0 };
      try {
        await sink(rows.map(row => JSON.parse(row.body)), now);
      } catch {
        let dead = 0;
        for (const row of rows) {
          const attempts = row.attempts + 1, gone = attempts >= maxAttempts;
          if (gone) dead++;
          sql('UPDATE telemetry_outbox SET attempts = ?, next_at = ?, dead = ? WHERE event_id = ?', attempts, now + backoff(row.attempts), gone ? 1 : 0, row.event_id);
        }
        return { delivered: 0, failed: rows.length, dead };
      }
      for (const row of rows) sql('DELETE FROM telemetry_outbox WHERE event_id = ?', row.event_id);
      return { delivered: rows.length, failed: 0, dead: 0 };
    },
    // The backlog for the telemetry.delivery event: rows waiting, rows given up on, and the age of the oldest waiting row.
    health(now = Date.now()) {
      const [row] = sql('SELECT SUM(dead = 0) AS pending, SUM(dead = 1) AS dead, MIN(CASE WHEN dead = 0 THEN created_at END) AS oldest FROM telemetry_outbox');
      return { pending: Number(row?.pending || 0), dead: Number(row?.dead || 0), oldest_age_ms: row?.oldest == null ? 0 : Math.max(0, now - row.oldest) };
    },
  };
}
