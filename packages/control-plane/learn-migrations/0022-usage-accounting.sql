-- Usage accounting, Phase 1 (owner decisions 2026-10-16 D1-D3; design C:/s/spec/credits-phase1-design.md): measurement only, no
-- deduction and no enforcement. Beside usage_operations (0016), which stays the platform spend guard's only table, untouched.
-- usage_actions: one row per user action (an Ask, a Tutor turn, a Ctrl+K edit), its payer and status. The payer comes from the
-- server session only. client_key is the browser's X-RH-Action-Key, unique per user, so an automatic retry finds its action.
-- usage_attempts: one row per provider attempt (routing, generation, repair, retry, evaluation, escalation, tool step, media),
-- attempt_id = usage_operations.op_id when the call went through the ledger. Amounts are integer micro-USD (1 USD = 1000000).
-- cost_state: reserved (in flight: the reservation, never spend), settled (provider cost known), unknown (finished without a
-- known cost: the reservation stays), estimated (a ledger-bypass media call: cost_micros holds a documented estimate).
-- usage_adjustments: refunds and adjustments (Phase 1: table and writer, no UI flow). Period is 'YYYY-MM' UTC of the action's
-- start; a job keeps its starting period. Times are unix seconds, like usage_operations. Additive and re-runnable; LEARN_DB only.
-- ponytail: rows are never pruned; retention is set with the storage quotas, like 0016.
CREATE TABLE IF NOT EXISTS usage_actions (
  action_id TEXT PRIMARY KEY,
  user_id TEXT,
  payer TEXT NOT NULL CHECK (payer IN ('user', 'platform')),
  payer_reason TEXT NOT NULL CHECK (payer_reason IN ('signed_in', 'anonymous_public', 'system', 'free_action')),
  feature TEXT NOT NULL,
  charge_class TEXT NOT NULL CHECK (charge_class IN ('would_charge', 'free', 'platform')),
  period TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'interrupted', 'accounting_error')),
  result TEXT CHECK (result IS NULL OR result IN ('full', 'partial', 'none')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  client_key TEXT,
  UNIQUE (user_id, client_key)
);
CREATE INDEX IF NOT EXISTS usage_actions_user_period ON usage_actions (user_id, period);
CREATE INDEX IF NOT EXISTS usage_actions_period_payer ON usage_actions (period, payer);

CREATE TABLE IF NOT EXISTS usage_attempts (
  attempt_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('routing', 'generation', 'repair', 'retry', 'evaluation', 'escalation', 'tool', 'media')),
  provider TEXT,
  model TEXT,
  reserved_micros INTEGER,
  cost_micros INTEGER,
  cost_state TEXT NOT NULL CHECK (cost_state IN ('reserved', 'settled', 'unknown', 'estimated')),
  status TEXT NOT NULL CHECK (status IN ('running', 'settled', 'failed', 'cancelled')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  started_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS usage_attempts_action ON usage_attempts (action_id);
CREATE INDEX IF NOT EXISTS usage_attempts_status ON usage_attempts (status, started_at);

CREATE TABLE IF NOT EXISTS usage_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  action_id TEXT,
  user_id TEXT,
  micros INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
