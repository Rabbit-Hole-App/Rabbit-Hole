-- learn-migrations/0044-depth-names.sql
-- The Depth levels were renamed on 2026-11-08: Overview -> Brief (brief), Standard -> Balanced (balanced), Deep -> Detailed (detailed). Two stored columns
-- carry the value behind a CHECK (learn_canvas_depth.depth from 0037, learn_roadmaps.depth from 0039). This rebuilds both tables so the CHECK accepts BOTH
-- vocabularies: the new code writes only the new names, and every row already stored with the old names stays valid and is read through the alias map
-- (chat-depth.js depthOf). It rewrites no value: learn-repairs/depth-names-rewrite.sql.txt does that later, and a later migration can then narrow the CHECK.
-- Safe to apply BEFORE the code that writes the new names (old code only ever writes the old names, which still pass). Rows are copied unchanged; the
-- unfinished-roadmap unique index and the board index are recreated. Re-runnable (the _new tables are dropped first, the copy reads whatever is there).
-- LEARN_DB only. Not applied anywhere yet: applying it to dev and to production is an owner command, and it must be applied BEFORE the release that writes the new names.
DROP TABLE IF EXISTS learn_canvas_depth_new;
CREATE TABLE learn_canvas_depth_new (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  depth TEXT NOT NULL CHECK (depth IN ('brief', 'balanced', 'detailed', 'overview', 'standard', 'deep')),
  revision INTEGER NOT NULL DEFAULT 1,
  last_action_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board)
);
INSERT INTO learn_canvas_depth_new (org, owner_user_id, app, board, depth, revision, last_action_id, updated_at)
  SELECT org, owner_user_id, app, board, depth, revision, last_action_id, updated_at FROM learn_canvas_depth;
DROP TABLE learn_canvas_depth;
ALTER TABLE learn_canvas_depth_new RENAME TO learn_canvas_depth;

DROP TABLE IF EXISTS learn_roadmaps_new;
CREATE TABLE learn_roadmaps_new (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  board_id TEXT NOT NULL,
  app TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'questioning', 'proposed', 'active', 'paused', 'completed', 'ended', 'failed')),
  revision INTEGER NOT NULL DEFAULT 1,
  plan_version INTEGER NOT NULL DEFAULT 0,
  accepted_plan_version INTEGER,
  depth TEXT NOT NULL CHECK (depth IN ('brief', 'balanced', 'detailed', 'overview', 'standard', 'deep')),
  practice_mode TEXT NOT NULL DEFAULT 'explanations' CHECK (practice_mode IN ('explanations')),
  source_key TEXT NOT NULL,
  source_rev TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  scope_fingerprint TEXT NOT NULL,
  scope_snapshot_key TEXT,
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
INSERT INTO learn_roadmaps_new (id, org, owner_user_id, owner_email, board_id, app, state, revision, plan_version, accepted_plan_version, depth, practice_mode, source_key, source_rev, scope_json, scope_fingerprint, scope_snapshot_key, language, ceiling, delivered_count, mode, mode_revision, paused_reason, policy_version, created_at, updated_at, ended_at)
  SELECT id, org, owner_user_id, owner_email, board_id, app, state, revision, plan_version, accepted_plan_version, depth, practice_mode, source_key, source_rev, scope_json, scope_fingerprint, scope_snapshot_key, language, ceiling, delivered_count, mode, mode_revision, paused_reason, policy_version, created_at, updated_at, ended_at FROM learn_roadmaps;
DROP TABLE learn_roadmaps;
ALTER TABLE learn_roadmaps_new RENAME TO learn_roadmaps;
CREATE UNIQUE INDEX IF NOT EXISTS learn_roadmaps_one_unfinished ON learn_roadmaps (org, owner_user_id, board_id) WHERE state IN ('draft', 'questioning', 'proposed', 'active', 'paused');
CREATE INDEX IF NOT EXISTS learn_roadmaps_board ON learn_roadmaps (org, owner_user_id, board_id, updated_at);
