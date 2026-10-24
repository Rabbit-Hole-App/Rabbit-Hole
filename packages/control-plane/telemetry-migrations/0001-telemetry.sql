-- The telemetry database, TELEMETRY_DB (docs/features/telemetry.md; owner decision 3, 2026-10-23): rabbit-hole-telemetry in
-- production, rabbit-hole-telemetry-dev in dev. Never LEARN_DB or DB: accounting stays in LEARN_DB (learn-migrations/0016, 0022)
-- and is projected here, read-only, as a rebuildable view. Nothing in this database is a charge, a balance or a credit.
-- Times are unix milliseconds unless a column says seconds (the projections keep LEARN_DB's seconds). Additive and re-runnable.

-- Normalized operational events (telemetry-contract.js). event_id is the idempotency key: a duplicate or replayed delivery is
-- an INSERT OR IGNORE that changes nothing. The join columns are promoted from the event; body is the whole validated event.
CREATE TABLE IF NOT EXISTS telemetry_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,   -- the producer's clock
  ingested_at INTEGER NOT NULL,   -- the sink's clock; ingested_at - occurred_at is delivery delay, not latency
  environment TEXT NOT NULL CHECK (environment IN ('production', 'dev', 'test', 'evaluation')),
  service TEXT NOT NULL,
  release_sha TEXT,
  action_id TEXT,
  attempt_id TEXT,
  job_id TEXT,
  trace_id TEXT,
  user_ref TEXT,                  -- users.id; never an email
  feature TEXT,
  outcome TEXT,
  error_code TEXT,
  sample_rate REAL,               -- NULL: unsampled. Financial events are never sampled.
  body TEXT NOT NULL
);
-- Overview and Reliability: counts by event and outcome over a time window, per environment.
CREATE INDEX IF NOT EXISTS telemetry_events_window ON telemetry_events (environment, event_name, occurred_at);
-- Action explorer: one action, attempt or job's timeline.
CREATE INDEX IF NOT EXISTS telemetry_events_action ON telemetry_events (action_id, occurred_at) WHERE action_id IS NOT NULL;
-- A request's trace: its browser failure and its server events (model_call.*) share one trace id.
CREATE INDEX IF NOT EXISTS telemetry_events_trace ON telemetry_events (trace_id, occurred_at) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telemetry_events_job ON telemetry_events (job_id, occurred_at) WHERE job_id IS NOT NULL;
-- Support investigation by account.
CREATE INDEX IF NOT EXISTS telemetry_events_user ON telemetry_events (user_ref, occurred_at) WHERE user_ref IS NOT NULL;

-- Delivery health (Task 4): one row per producer report or drain, so the dashboard shows backlog, age, failures and drops.
CREATE TABLE IF NOT EXISTS telemetry_delivery_health (
  source TEXT NOT NULL,           -- a producer: 'app_worker', 'explain_jobs', 'projection', ...
  observed_at INTEGER NOT NULL,
  pending INTEGER, dead INTEGER, oldest_age_ms INTEGER,
  delivered INTEGER, failed INTEGER, rejected INTEGER, dropped INTEGER,
  PRIMARY KEY (source, observed_at)
);

-- Financial reporting projections of LEARN_DB usage_actions and usage_attempts (telemetry-projection.js): copied by id, upserted,
-- rebuildable from scratch at any time. A NULL amount is unknown and stays unknown; it is never 0.
CREATE TABLE IF NOT EXISTS accounting_actions (
  action_id TEXT PRIMARY KEY,
  user_ref TEXT, payer TEXT, payer_reason TEXT, feature TEXT, charge_class TEXT, period TEXT,
  status TEXT, result TEXT, started_at INTEGER, ended_at INTEGER, -- seconds, as in LEARN_DB
  projected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounting_actions_period ON accounting_actions (period, feature);
CREATE INDEX IF NOT EXISTS accounting_actions_user ON accounting_actions (user_ref, period);
CREATE TABLE IF NOT EXISTS accounting_attempts (
  attempt_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  kind TEXT, provider TEXT, model TEXT,
  reserved_micros INTEGER, cost_micros INTEGER,
  cost_state TEXT,                -- reserved | settled | unknown | estimated: measured and estimated are never summed together
  status TEXT,
  input_tokens INTEGER, output_tokens INTEGER,
  started_at INTEGER, settled_at INTEGER, -- seconds
  -- From Credits' usage_attempt_detail (learn-migrations 0027, docs/features/credits-2500.md); NULL where that table is absent
  -- or has no row. quantities and unverified are its JSON as recorded; refunded_micros is part of cost_micros given back.
  price_version TEXT, tier TEXT, quantities TEXT, unverified TEXT, refunded_micros INTEGER, refunded_at INTEGER,
  projected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounting_attempts_action ON accounting_attempts (action_id);
CREATE INDEX IF NOT EXISTS accounting_attempts_state ON accounting_attempts (cost_state, started_at);
-- Credits' usage_grants (0027): each account's allowance for one UTC month, as granted. Read for reporting; never decided here.
CREATE TABLE IF NOT EXISTS accounting_grants (
  user_ref TEXT NOT NULL,
  period TEXT NOT NULL,
  allowance_micros INTEGER NOT NULL,
  source TEXT,
  granted_at INTEGER NOT NULL,    -- seconds
  projected_at INTEGER NOT NULL,
  PRIMARY KEY (user_ref, period)
);
-- Where each projection last read up to (LEARN_DB seconds), so a catch-up reads only what changed since.
CREATE TABLE IF NOT EXISTS projection_cursors (
  source TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Owner access audit (Task 17/18): each authorized dashboard read, export or diagnostic retrieval. Refused requests are not
-- written: an anonymous caller must not be able to grow this table.
CREATE TABLE IF NOT EXISTS owner_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_ref TEXT,
  route TEXT NOT NULL,
  method TEXT NOT NULL
);
