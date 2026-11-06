-- DRAFT, NOT A MIGRATION. No number: the Lead allocates one at R4 integration (v1.4 4.2; manifest "R4 contracts: none").
-- Never place this file in learn-migrations/ unchanged: copy it, add the number and the header the repository requires, and mirror
-- it verbatim into repository-schema.sql (the consolidated schema; see records.md section 6).
-- LEARN_DB only. Additive and re-runnable: every statement is CREATE TABLE / CREATE [UNIQUE] INDEX IF NOT EXISTS, the only shape
-- scripts/schema-check.test.mjs accepts for a learn migration. No semicolons inside comments or strings (the check splits on them).
-- Every table carries (org, owner_user_id, app, board): ownership and scope are columns, never inferred from an id.
-- All times are INTEGER unix seconds, as in the usage tables.

-- Roadmaps: at most one unfinished per learner and board (the partial unique index below).
CREATE TABLE IF NOT EXISTS roadmap_roadmaps (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'questioning', 'proposed', 'active', 'paused', 'completed', 'ended', 'failed')),
  revision INTEGER NOT NULL DEFAULT 1,
  plan_version INTEGER NOT NULL DEFAULT 0,
  accepted_plan_version INTEGER,
  depth TEXT NOT NULL CHECK (depth IN ('overview', 'standard', 'deep')),
  practice_mode TEXT NOT NULL DEFAULT 'explanations' CHECK (practice_mode IN ('explanations')),
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  language TEXT,
  ceiling INTEGER NOT NULL,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'tutor' CHECK (mode IN ('auto', 'ask', 'tutor')),
  mode_revision INTEGER NOT NULL DEFAULT 0,
  paused_reason TEXT,
  policy_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_roadmaps_one_unfinished ON roadmap_roadmaps (org, owner_user_id, app, board) WHERE state IN ('draft', 'questioning', 'proposed', 'active', 'paused');
CREATE INDEX IF NOT EXISTS roadmap_roadmaps_board ON roadmap_roadmaps (org, owner_user_id, app, board, updated_at);

-- The learner's instruction, versioned. Version 1 is the original words and is never rewritten. It overrides an inferred topic.
CREATE TABLE IF NOT EXISTS roadmap_instructions (
  roadmap_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  text TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('create', 'revise', 'answer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (roadmap_id, version)
);

-- Plan drafts and revisions. A revision is a version with its own acceptance, not a roadmap state.
CREATE TABLE IF NOT EXISTS roadmap_plan_versions (
  roadmap_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'revision')),
  instruction_version INTEGER NOT NULL,
  plan_json TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT,
  accepted_at INTEGER,
  superseded_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (roadmap_id, version)
);

-- Invitations. One per (board, source set, source revision). Dismissal affects that row only.
CREATE TABLE IF NOT EXISTS roadmap_invitations (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('offered', 'accepted', 'dismissed', 'suppressed', 'expired')),
  suppress_reason TEXT,
  roadmap_id TEXT,
  offered_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_invitations_source ON roadmap_invitations (org, owner_user_id, app, board, source_key);

-- Steps. position is the private roadmap index (D37). source_ref_json is the passage the step explains.
CREATE TABLE IF NOT EXISTS roadmap_steps (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  position INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('planned', 'proposed', 'generating', 'delivered', 'incomplete', 'cancelled', 'skipped', 'already_understood')),
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  source_ref_json TEXT,
  plan_version INTEGER NOT NULL,
  answered INTEGER NOT NULL DEFAULT 0,
  card_removed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (roadmap_id, plan_version, position)
);
CREATE INDEX IF NOT EXISTS roadmap_steps_roadmap ON roadmap_steps (roadmap_id, position);

-- Proposals: versioned offers. One offered step (checking, held or pending) per roadmap.
CREATE TABLE IF NOT EXISTS roadmap_proposals (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('checking', 'held', 'pending', 'accepted', 'cancelled', 'superseded', 'blocked')),
  format TEXT NOT NULL CHECK (format IN ('explanation', 'table')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source_relation_json TEXT,
  content_hash TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  check_json TEXT,
  accepted_at INTEGER,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (step_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_proposals_one_offered ON roadmap_proposals (roadmap_id) WHERE state IN ('checking', 'held', 'pending');

-- Generated results. The row exists (with its minted card id) before generation first writes to it.
-- body_json is NULL until generated and is never returned by a poll route (4.4).
CREATE TABLE IF NOT EXISTS roadmap_results (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version INTEGER NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  card_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  generation TEXT NOT NULL DEFAULT 'pending' CHECK (generation IN ('pending', 'generating', 'generated', 'failed', 'expired')),
  validation TEXT NOT NULL DEFAULT 'pending' CHECK (validation IN ('pending', 'checking', 'passed', 'held', 'blocked')),
  stale INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'none' CHECK (decision IN ('none', 'accepted', 'cancelled', 'superseded')),
  delivery TEXT NOT NULL DEFAULT 'not_delivered' CHECK (delivery IN ('not_delivered', 'delivered', 'removed')),
  billing TEXT NOT NULL DEFAULT 'pending' CHECK (billing IN ('pending', 'settled', 'refunded', 'failed', 'zero_priced')),
  reconciliation TEXT NOT NULL DEFAULT 'none' CHECK (reconciliation IN ('none', 'required', 'complete')),
  primitive TEXT CHECK (primitive IN ('explanation', 'table')),
  body_json TEXT,
  body_hash TEXT,
  check_json TEXT,
  failure_code TEXT,
  board_ack_version INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (proposal_id, proposal_version, slot_index, attempt),
  UNIQUE (org, owner_user_id, app, board, card_id)
);
CREATE INDEX IF NOT EXISTS roadmap_results_step ON roadmap_results (roadmap_id, step_id);
CREATE INDEX IF NOT EXISTS roadmap_results_work ON roadmap_results (generation, validation, updated_at);

-- Step authorization: the aggregate allowance admission for an accepted proposal version, with its per-card allocation (D6, 5.2).
CREATE TABLE IF NOT EXISTS roadmap_authorizations (
  proposal_id TEXT NOT NULL,
  proposal_version INTEGER NOT NULL,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  usage_client_key TEXT NOT NULL,
  hold_attempt_id TEXT,
  aggregate_micros INTEGER NOT NULL,
  allocation_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('admitted', 'released', 'refused')),
  created_at INTEGER NOT NULL,
  released_at INTEGER,
  PRIMARY KEY (proposal_id, proposal_version)
);

-- Action replay records: the first valid action wins, a repeat returns outcome_json (4.3).
CREATE TABLE IF NOT EXISTS roadmap_actions (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  roadmap_id TEXT,
  action TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  expected_revision INTEGER,
  outcome_status INTEGER NOT NULL,
  outcome_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org, owner_user_id, action_key)
);
CREATE INDEX IF NOT EXISTS roadmap_actions_roadmap ON roadmap_actions (roadmap_id, created_at);

-- Platform-call reservations and provider-call identity. op_id is the ledger operation id (usage_operations.op_id = usage_attempts.attempt_id).
CREATE TABLE IF NOT EXISTS roadmap_calls (
  op_id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  result_id TEXT,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('subject', 'plan', 'revise', 'propose', 'generate', 'repair', 'support_check', 'escalation', 'safety')),
  call_no INTEGER NOT NULL,
  retry_no INTEGER NOT NULL DEFAULT 0,
  payer TEXT NOT NULL CHECK (payer IN ('platform', 'learner')),
  task TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'sent', 'settled', 'failed', 'unknown', 'released')),
  reserved_micros INTEGER,
  cost_micros INTEGER,
  quota_scope TEXT,
  quota_window INTEGER,
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  UNIQUE (roadmap_id, stage, call_no, retry_no, result_id)
);
CREATE INDEX IF NOT EXISTS roadmap_calls_open ON roadmap_calls (state, created_at);
CREATE INDEX IF NOT EXISTS roadmap_calls_result ON roadmap_calls (result_id);

-- Per-learner platform-work quota counters (D14). A call increments in the same batch that reserves it and releases or settles after.
CREATE TABLE IF NOT EXISTS roadmap_quota (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  micros INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org, owner_user_id, scope, window_start)
);

-- Durable event outbox (5.4). An event commits with the fact it reports. Content-free payload: ids and enums only.
CREATE TABLE IF NOT EXISTS roadmap_events (
  event_id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  roadmap_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  fact_revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  next_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  deadline_at INTEGER NOT NULL,
  claimed_until INTEGER,
  processed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (org, owner_user_id, roadmap_id, kind, fact_id, fact_revision)
);
CREATE INDEX IF NOT EXISTS roadmap_events_due ON roadmap_events (processed_at, next_at);
