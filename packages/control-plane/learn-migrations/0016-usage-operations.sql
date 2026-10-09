-- Usage operations (owner 2026-10-09, beta spend controls; app side: the Spend lane's metered(), Home owns the schema):
-- one row per admitted paid operation - a Tutor plan with its escalation, a board's multi-call pipeline, a home ask, an
-- image, a narration - not per model call. Admission inserts the row only while the person's hour and day counts, their
-- operations in flight and the platform's day count are under their caps (one INSERT ... SELECT ... WHERE, so two
-- concurrent requests can never both take the last slot); settlement records what it actually used. op_id is the
-- idempotency key: a replayed operation finds its row instead of being admitted twice. A table, not columns on
-- shared_ask_events (0005), so the file stays additive and re-runnable. LEARN_DB only.
-- Unknown cost stays NULL, never 0. Times are unix seconds, like shared_ask_events, for the window arithmetic.
-- ponytail: rows are never pruned yet; retention is set with the storage quotas (r34 audit item 5).
CREATE TABLE IF NOT EXISTS usage_operations (
  op_id TEXT PRIMARY KEY,                     -- idempotency key, one per operation; a replay finds this row
  user_id TEXT NOT NULL,                      -- users.id of the person who started it: the one it is metered to
  org TEXT NOT NULL,
  category TEXT NOT NULL,                     -- the operation kind (tutor_plan, board, home_ask, image, tts, ...): its own caps
  status TEXT NOT NULL CHECK (status IN ('admitted', 'settled', 'failed', 'timed_out', 'cancelled')),
  admitted_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,               -- past it, an unsettled row is no longer in flight and is settled timed_out
  settled_at INTEGER,
  calls INTEGER NOT NULL DEFAULT 0,           -- provider calls made under this one admission (an escalation is one more)
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cost_usd REAL,                              -- NULL until settled, and when the provider reports none
  provider TEXT,
  model TEXT,
  result_ref TEXT,                            -- what a replay returns: the stored answer, board or media id, never a payload
  error TEXT
);

-- The person's hour/day counts and their operations in flight; the platform's day count; one category's counts.
CREATE INDEX IF NOT EXISTS usage_operations_user ON usage_operations (user_id, admitted_at);
CREATE INDEX IF NOT EXISTS usage_operations_inflight ON usage_operations (user_id, status, deadline_at);
CREATE INDEX IF NOT EXISTS usage_operations_day ON usage_operations (admitted_at);
CREATE INDEX IF NOT EXISTS usage_operations_category ON usage_operations (category, admitted_at);
