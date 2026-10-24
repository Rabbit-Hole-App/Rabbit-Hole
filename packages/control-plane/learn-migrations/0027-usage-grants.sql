-- Monthly AI allowance grants, and what each charge was priced with and refunded (owner credits brief 2026-10-23: 2,500 AI credits every month).
-- usage_grants: the allowance a person was granted for one UTC month ('YYYY-MM'), written once, on the first admission or
-- balance read of that month, and never lowered afterwards. It is how an account keeps the allowance it already had through the
-- month the default changes: the new default applies to the periods that start after the cutover (AI_ALLOWANCE_CUTOVER_PERIOD),
-- and a person with earlier usage keeps AI_LEGACY_ALLOWANCE_USD for the cutover month and before. Admission and the usage screen
-- read it through the same function (learn-entitlement.js). source: 'default' | 'legacy_transition'. Amounts are integer micro-USD.
CREATE TABLE IF NOT EXISTS usage_grants (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  allowance_micros INTEGER NOT NULL CHECK (allowance_micros > 0),
  source TEXT NOT NULL CHECK (source IN ('default', 'legacy_transition')),
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, period)
);
-- usage_attempt_detail: beside usage_attempts, which is left unchanged (SQLite has no ADD COLUMN IF NOT EXISTS, so a column would
-- not re-run). One row per priced or refunded attempt. price_version is the registry version (pricing-registry.js PRICE_VERSION)
-- the charge used, tier the service tier, quantities the billable amounts by category (JSON: input, output, cache_read,
-- cache_write_5m, cache_write_1h, output_image, ... each counted once; absent means not reported, never 0), unverified the
-- categories whose rate the owner has not confirmed. refunded_micros is the part of a settled cost given back (a refund or a
-- platform failure, at most the cost, at most once); the balance counts cost_micros - refunded_micros as used, and the original
-- cost stays on the attempt. Additive and re-runnable; LEARN_DB only. Old code ignores both tables, so migrating first is safe.
CREATE TABLE IF NOT EXISTS usage_attempt_detail (
  attempt_id TEXT PRIMARY KEY,
  price_version TEXT,
  tier TEXT,
  quantities TEXT,
  unverified TEXT,
  refunded_micros INTEGER NOT NULL DEFAULT 0 CHECK (refunded_micros >= 0),
  refunded_at INTEGER,
  refund_reason TEXT
);
