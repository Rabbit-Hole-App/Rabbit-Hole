CREATE TABLE IF NOT EXISTS repository_apps (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL,
 repo TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT, status TEXT NOT NULL DEFAULT 'queued',
 error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(org,name)
);
CREATE TABLE IF NOT EXISTS repository_versions (
 app_id INTEGER NOT NULL, commit_sha TEXT NOT NULL, storage_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(app_id,commit_sha)
);
CREATE TABLE IF NOT EXISTS threads (
 id TEXT PRIMARY KEY, org TEXT NOT NULL, user TEXT NOT NULL, scope_ref TEXT NOT NULL,
 commit_sha TEXT NOT NULL, title TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS repository_messages_thread ON messages(thread_id);
CREATE TABLE IF NOT EXISTS repository_message_graphs (
 message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
 graph_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learn_courses (
 app_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, brief TEXT NOT NULL,
 curriculum TEXT, approved_revision INTEGER, lesson TEXT, source_version TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS canvases (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL,
 owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT,
 device_id TEXT, UNIQUE(org,name)
);
-- One row per graded attempt: Jev's per-idea judgment beside today's Opus
-- verdict. Experiment data: pruned after 90 days on the next grade or report
-- call, and deleted at the switch decision. Learner identity stays here; the
-- grading service never sees it. docs/features/jev-grading.md
CREATE TABLE IF NOT EXISTS learn_grades (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  email TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT,
  block_id TEXT,
  mode TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'canvas',
  bench_run TEXT,
  bench_set TEXT,
  grader_protocol_version TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expects TEXT NOT NULL,
  answer TEXT NOT NULL,
  jev TEXT,
  jev_error TEXT,
  jev_ms INTEGER,
  jev_tokens INTEGER,
  jev_cost REAL,
  jev_model TEXT,
  jev_generation_id TEXT,
  baseline_verdict TEXT,
  baseline_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org, email, app, attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_learn_grades_learner ON learn_grades(org, email, app, created_at);
CREATE INDEX IF NOT EXISTS idx_learn_grades_created ON learn_grades(created_at);
-- Learn canvas boards saved on the server so they can be shared
-- (docs/features/canvas-sharing.md). One row per owner board; share links are
-- random tokens stored here, so turning sharing off revokes them.
CREATE TABLE IF NOT EXISTS learn_boards (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  view_token TEXT UNIQUE,
  edit_token TEXT UNIQUE,
  public_view INTEGER NOT NULL DEFAULT 0,
  -- A fork's title and where it came from (JSON: resource_id, board, board_id,
  -- title, creator, share_url); added to the dev D1 with ALTER TABLE.
  title TEXT,
  forked_from TEXT,
  UNIQUE (org, owner_email, app, board)
);
-- /dive (docs/features/dive-v1.md): a nested Rabbit Hole is a child canvas. The child keeps its own
-- canvases row (title, owner); this link row adds only where it came from. One parent per child,
-- one child per originating card on a board. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_dives (
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  child TEXT NOT NULL,
  parent_app TEXT NOT NULL,
  parent_board TEXT NOT NULL DEFAULT 'main',
  origin_block_id TEXT NOT NULL,
  dive_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, child),
  UNIQUE (org, owner_email, parent_app, parent_board, origin_block_id)
);

-- Settings > Profile (user, 2026-09-30): the name and picture a person chose for themselves. One row
-- per account principal; only its owner reads or writes it (profile.js). The picture is a small PNG
-- data URL, resized in the browser before it is sent. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS user_profiles (
  email TEXT PRIMARY KEY,
  name TEXT,
  avatar TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Canvas context documents (docs/features/canvas-context-docs.md): PDFs and text files a learner
-- uploads for the agent to read, never placed on the canvas. The bytes live in LEARN_MEDIA
-- (learn-context/...); this row is the list and the on/off toggle. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_context_documents (
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  attached INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, owner_email, app, id)
);
