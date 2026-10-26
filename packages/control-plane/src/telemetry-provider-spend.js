// The platform's PROVIDER spend, apart from what the learner was charged (docs/features/telemetry.md "Provider cost").
// usage_operations (0016) is the platform ledger: settleSpend records the provider's actual cost there even when the learner's
// attempt (usage_attempts, 0022) was settled at 0 for our own failure. The accounting projection reads only usage_attempts, so it
// cannot see that spend. This reads the ledger itself, read-only, at request time: no copy, so nothing to double count or replay.
// One operation is one row (op_id is the primary key and equals the attempt id), and the LEFT JOIN matches at most one attempt.
// cost_usd is NOT proof of a measurement: admission writes the reservation there and settleSpend keeps it (COALESCE) when the
// provider reports no cost. State, per operation:
//   reserved   still admitted: cost_usd is the reservation, not spend
//   estimated  settled at an upper bound (error cost_estimated_upper_bound, image-jobs.js)
//   unknown    cost_usd is NULL or still equals the attempt's reservation, or the operation timed out, or no attempt can vouch for it
//   settled    anything else: the provider's reported cost (an overrun, spend_bound_exceeded, is a measured cost)
// A cancelled operation made no provider call and is left out. Amounts are integer micro-USD; unknown and reserved amounts are
// returned as bound_micros (never as a cost) and are never added to a cost.
// shortcut: a measured cost that is exactly the reservation reads as unknown (the conservative side); upgrade by recording the
// basis on usage_operations, which needs a LEARN_DB migration.
const SQL = `SELECT state, status, COUNT(*) AS operations,
    SUM(CASE WHEN state IN ('settled', 'estimated') THEN micros END) AS provider_cost_micros,
    SUM(CASE WHEN state IN ('unknown', 'reserved') THEN micros END) AS bound_micros,
    SUM(attempt_micros) AS attempt_micros
  FROM (SELECT o.status, CAST(ROUND(o.cost_usd * 1000000) AS INTEGER) AS micros, a.cost_micros AS attempt_micros,
      CASE WHEN o.status = 'admitted' THEN 'reserved'
           WHEN o.error = 'cost_estimated_upper_bound' THEN 'estimated'
           WHEN o.error = 'spend_bound_exceeded' THEN 'settled'
           WHEN o.status = 'timed_out' OR o.cost_usd IS NULL OR a.attempt_id IS NULL OR ABS(ROUND(o.cost_usd * 1000000) - a.reserved_micros) <= 1 THEN 'unknown'
           ELSE 'settled' END AS state
    FROM usage_operations o LEFT JOIN usage_attempts a ON a.attempt_id = o.op_id
    WHERE o.admitted_at >= ? AND o.status <> 'cancelled')
  GROUP BY state, status ORDER BY state, status`;

// -> rows, or null when LEARN_DB or its ledger table is not there (the dashboard says so instead of showing nothing).
export async function providerSpend(learnDb, sinceSeconds) {
  if (!learnDb) return null;
  try { return (await learnDb.prepare(SQL).bind(sinceSeconds).all()).results || []; }
  catch { return null; }
}
