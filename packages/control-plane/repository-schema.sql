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

-- Canvas forks (docs/features/canvas-forking.md): a fork is a canvas. It keeps its own canvases row (title,
-- owner); this link row adds only where it came from, like canvas_dives. A canvas id is its name inside its
-- org (UNIQUE(org,name)), so every reference carries both. fork_key is the client's idempotency key: one
-- action, one fork. The parent's count is its direct forks only. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_forks (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  fork_key TEXT NOT NULL,
  forked_from_org TEXT,
  forked_from_canvas_id TEXT,
  root_org TEXT,
  root_canvas_id TEXT,
  forked_from_owner_id TEXT NOT NULL,
  forked_from_title TEXT NOT NULL,
  forked_from_share TEXT,
  forked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, canvas),
  UNIQUE (owner_email, fork_key)
);
CREATE INDEX IF NOT EXISTS canvas_forks_parent ON canvas_forks(forked_from_org, forked_from_canvas_id);

-- Shared canvas v1 (docs/features/shared-canvas-ask.md): the pinned repository revision a share answers from, the
-- owner's repository-code permission for a private repository, confirmed repository visibility, and the shared
-- ask's usage events, which are also its rate-limit counts. Additive and re-runnable; LEARN_DB only.

-- One row per board. A shared board's pin: the repository (repository_apps.id, whose snapshots are per id and
-- commit) at the commit its link was made on; view_token is that link, and a new link pins again with
-- repo_access off. A fork's inherited revision: view_token NULL until the fork is shared, which keeps the
-- revision. repo_access: the board's owner let this link's viewers have the repository's code read (only their
-- own private repository; a public one needs nothing).
CREATE TABLE IF NOT EXISTS board_repository_pins (
  board_id TEXT PRIMARY KEY,
  repository_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  view_token TEXT,
  repo_access INTEGER NOT NULL DEFAULT 0,
  pinned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What an anonymous read last confirmed (import and refresh run git ls-remote without credentials). No row is
-- unknown, and a share treats unknown as private.
CREATE TABLE IF NOT EXISTS repository_visibility (
  app_id INTEGER PRIMARY KEY,
  visibility TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per admitted shared-canvas question: who asked, about which shared board (learn_boards.id) of whose,
-- and whether repository code was in its context. Never the question, the answer or any source.
CREATE TABLE IF NOT EXISTS shared_ask_events (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  viewer_email TEXT NOT NULL,
  board_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  repository INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shared_ask_events_viewer ON shared_ask_events(viewer_email, asked_at);
CREATE INDEX IF NOT EXISTS shared_ask_events_board ON shared_ask_events(board_id, asked_at);
