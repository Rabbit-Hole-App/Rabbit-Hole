-- Learn user settings (Explain-on-Canvas Tutor ladder, release R2; roadmap decisions D11, D12): the Auto-suggest preference of one
-- learner, and the Depth (overview, standard, deep) one learner chose for one canvas. Sidecar tables: learn_coaching_state and its
-- per-canvas tutor_enabled are untouched. A learner with no row has the defaults (Auto-suggest on, Depth standard); a row is written
-- by the learner's first change. Keys are the server-resolved org and users.id, never a client value. Additive and re-runnable;
-- LEARN_DB only. Not applied anywhere yet: applying it is an owner-controlled release step.
CREATE TABLE IF NOT EXISTS learn_user_settings (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  auto_suggest INTEGER NOT NULL DEFAULT 1 CHECK (auto_suggest IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id)
);
CREATE TABLE IF NOT EXISTS learn_canvas_depth (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  depth TEXT NOT NULL CHECK (depth IN ('overview', 'standard', 'deep')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board)
);
