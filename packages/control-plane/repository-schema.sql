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
-- ask's usage events, which are also its rate-limit counts. Tables and indexes only. Additive and re-runnable;
-- LEARN_DB only.
--
-- A share link is identified here by its share_key: the SHA-256 of the link's token with a fixed prefix
-- (learn-shared-ask.js shareKey), derived on the server, one-way, never the token itself. Only learn_boards holds a
-- raw token (the share record).

-- One row per board. A shared board's pin: the repository (repository_apps.id, whose snapshots are per id and
-- commit) at the commit its link was made on; share_key is that link, and a new link pins again with repo_access
-- off. A fork's inherited revision: share_key NULL until the fork is shared, which keeps the revision.
-- repo_access: the board's owner let this link's viewers have the repository's code read (only their own private
-- repository; a public one needs nothing).
CREATE TABLE IF NOT EXISTS board_repository_pins (
  board_id TEXT PRIMARY KEY,
  repository_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  share_key TEXT,
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

-- One row per admitted shared-canvas question: who asked (viewer_email: the per-viewer bucket, and the account
-- Usage & Credits will meter), through which share link (share_key: the per-link bucket), about which shared board
-- (learn_boards.id) of whose, and whether repository code was in its context. Never the question, the answer, any
-- source or the link's token.
CREATE TABLE IF NOT EXISTS shared_ask_events (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  viewer_email TEXT NOT NULL,
  share_key TEXT NOT NULL,
  board_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  repository INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shared_ask_events_viewer ON shared_ask_events(viewer_email, asked_at);
CREATE INDEX IF NOT EXISTS shared_ask_events_share ON shared_ask_events(share_key, asked_at);

-- learn-migrations/0006-learning-journeys.sql
-- Learning journeys (docs/features/adaptive-learning-path-v1-architecture.md §9-§10): one row per adaptive learning
-- journey - its state, the learner's exact request, intake answers, constraints, the journey's claim registry, the
-- diagnostic with its server-only answer key, the evidence store and the current section's plan - and one immutable
-- row per version of its learning path. Additive and re-runnable; LEARN_DB only. Applied locally only until an
-- explicit GO: the shared dev and production LEARN_DB wait for it.
--
-- A journey is scoped to (org, owner_user_id, app, board), where owner_user_id is users.id (migration 0026), the stable
-- internal id the session carries as uid; never an email (§10.2, owner 2026-10-05). Only its owner reads or writes it.
-- revision is the optimistic-write counter: every save is conditional on it, so two tabs
-- never overwrite each other, and an archived journey is never written again. Evidence is written only by
-- appendJourneyEvidence (src/learn-journey-store.js). The learner's exact words live only in raw_request;
-- request_json is the rest of the request (intent, channel), grounding_json what the journey is grounded in.
-- A local database that already applied an earlier draft of 0006 must be reset: CREATE TABLE IF NOT EXISTS adds no columns.

CREATE TABLE IF NOT EXISTS learning_journeys (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  state TEXT NOT NULL, topic TEXT NOT NULL, raw_request TEXT NOT NULL,
  request_json TEXT NOT NULL, grounding_json TEXT NOT NULL DEFAULT '{"kind":"topic"}',
  intake_json TEXT NOT NULL, constraints_json TEXT NOT NULL DEFAULT '[]', pending_edits_json TEXT NOT NULL DEFAULT '[]',
  registry_json TEXT NOT NULL, diagnostic_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
  path_version INTEGER NOT NULL DEFAULT 0, active_section_id TEXT, section_plan_json TEXT,
  pending TEXT, error_json TEXT, paused_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
-- At most one live (not archived) journey per scope.
CREATE UNIQUE INDEX IF NOT EXISTS learning_journeys_live ON learning_journeys (org, owner_user_id, app, board) WHERE archived_at IS NULL;

-- A path version is written once and never changed, in the same batch as the journey row whose path_version names it.
CREATE TABLE IF NOT EXISTS learning_path_versions (
  journey_id TEXT NOT NULL, version INTEGER NOT NULL, path_json TEXT NOT NULL,
  source TEXT NOT NULL, reason TEXT NOT NULL, evidence_refs TEXT NOT NULL, changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (journey_id, version)
);

-- learn-migrations/0007-canvas-publications.sql
-- Explore publication (docs/features/explore-publish.md): a canvas is discoverable in Explore only while it has a row
-- here, written by its owner's explicit Publish to Explore and removed by Remove from Explore. No row = not
-- discoverable: a new canvas is private, and a share link stays unlisted - learn_boards.shared, view_token and
-- public_view are link access, never discoverability. No backfill (owner, 2026-10-06): every existing share stays
-- unlisted. Discoverability only: no content, Tutor state, evidence, share or repository permission lives here.
-- token is the publication's own read capability (/e/<token>): random, never derived from a share, edit or session
-- token, and dead once the canvas leaves Explore (publishing again mints a new one).
-- Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0008).
CREATE TABLE IF NOT EXISTS canvas_publications (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, canvas)
);

-- learn-migrations/0008-user-handles.sql
-- Public handles (docs/features/user-handles.md, owner 2026-10-06): every Rabbit Hole user's unique public identity,
-- rendered @handle and resolved by reference wherever a creator is shown - never copied into canvases, shares, forks
-- or publications. A narrow one-to-one extension of user_profiles, holding handle identity only: no name, avatar,
-- email-derived label, canvas ownership or publication state. No row = the user has not chosen a handle yet; nothing
-- is ever derived from an email. The handle is stored in its canonical lowercase form; UNIQUE with NOCASE makes the
-- database the authority (one winner per handle, whatever the case). Additive and re-runnable; LEARN_DB only.
-- Applied locally only until an explicit deploy GO (order 0004..0008).
CREATE TABLE IF NOT EXISTS user_handles (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- learn-migrations/0009-canvas-metadata.sql
-- Canvas metadata (docs/features/canvas-metadata.md, owner 2026-10-06): what canvases does not hold cleanly - an
-- optional description (at most 500 characters, written by its owner, never generated) and the time of the canvas's
-- last meaningful change (a rename, a description edit, a change to its saved content; never a view, a selection, a
-- fork or Rabbit Hole by someone else, a share link copied, a publication opened or a handle change). One row per
-- canvas, made at its first meaningful change: no row reads as description NULL and updated_at = canvases.created_at.
-- Never a copy of the title, owner, publication, fork state or content. Additive and re-runnable; LEARN_DB only.
-- Applied locally only until an explicit deploy GO (order 0004..0009).
CREATE TABLE IF NOT EXISTS canvas_metadata (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas)
);

-- learn-migrations/0010-library-trash.sql
-- Library trash (docs/features/library-trash.md, owner 2026-10-06): an owned top-level canvas or project moved to Trash -
-- a stronger removal than Archive, with an explicit Restore. A row hides the item from Home, Library, Explore and search,
-- suspends its share links (their configuration is kept, so Restore brings them back) and went with its publication
-- (Restore never republishes). Nothing is deleted: the canvas, its content, title, description, forks and nested holes
-- stay as they are. No row = not in Trash. Nested Rabbit Holes are never trashed on their own. Additive and re-runnable;
-- LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0010).
CREATE TABLE IF NOT EXISTS library_trash (
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  trashed_at TEXT NOT NULL,
  PRIMARY KEY (org, name)
);

-- learn-migrations/0011-canvas-comments.sql
-- Canvas comments and per-canvas members (docs/features/canvas-comments.md section 7): threads and comments pinned to a
-- canvas's cards or empty space, stored apart from the board (a comment never writes learn_boards), and the members an
-- owner invites by email (recipient-only invitations, section 6; H7 contract). Every permission identity is users.id;
-- the principal beside it is for display joins only and never leaves the server. Invitation, code and send tables use
-- integer unix seconds (C1, C7). Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit
-- deploy GO (order 0004..0011).
CREATE TABLE IF NOT EXISTS canvas_members (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL, canvas TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  member_user_id TEXT,
  member_email TEXT,
  status TEXT NOT NULL,
  token_hash TEXT UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL,
  email_sent_at INTEGER,
  invited_by TEXT NOT NULL,
  invited_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  accepted_at INTEGER, ended_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_members_open ON canvas_members (org, canvas, invited_email) WHERE status IN ('pending', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS canvas_members_person ON canvas_members (org, canvas, member_user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS canvas_members_mine ON canvas_members (member_user_id, status);

CREATE TABLE IF NOT EXISTS canvas_invite_codes (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL, user_id TEXT NOT NULL,
  code_hmac TEXT NOT NULL,
  sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS canvas_invite_codes_invitation ON canvas_invite_codes (invitation_id, user_id, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_codes_user ON canvas_invite_codes (user_id, sent_at);

CREATE TABLE IF NOT EXISTS canvas_invite_sends (
  id TEXT PRIMARY KEY,
  cap_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  owner_user_id TEXT,
  invitation_id TEXT NOT NULL,
  user_id TEXT,
  sent_at INTEGER NOT NULL,
  delivered INTEGER
);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_recipient ON canvas_invite_sends (cap_key, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_owner ON canvas_invite_sends (owner_user_id, sent_at);
CREATE INDEX IF NOT EXISTS canvas_invite_sends_invitation ON canvas_invite_sends (invitation_id, user_id, sent_at);
-- ponytail: canvas_invite_sends rows are never pruned; prune anything older than 2 days if the table grows.

CREATE TABLE IF NOT EXISTS canvas_comment_settings (
  org TEXT NOT NULL, canvas TEXT NOT NULL,
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  public_mode TEXT NOT NULL DEFAULT 'off',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas)
);
CREATE TABLE IF NOT EXISTS canvas_comment_blocks (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL, canvas TEXT NOT NULL,
  user_id TEXT NOT NULL, user_email TEXT NOT NULL,
  blocked_by TEXT NOT NULL, blocked_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_comment_blocks_person ON canvas_comment_blocks (org, canvas, user_id);

CREATE TABLE IF NOT EXISTS canvas_comment_threads (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL, org TEXT NOT NULL, canvas TEXT NOT NULL,
  audience TEXT NOT NULL,
  anchor_json TEXT NOT NULL,
  created_by TEXT NOT NULL, created_by_email TEXT NOT NULL,
  create_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, last_activity_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS canvas_comment_threads_board ON canvas_comment_threads (board_id, audience, last_activity_at);

CREATE TABLE IF NOT EXISTS canvas_comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL, author_id TEXT NOT NULL, author_email TEXT NOT NULL,
  body TEXT NOT NULL,
  create_hash TEXT NOT NULL,
  created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS canvas_comments_thread ON canvas_comments (thread_id, created_at);
CREATE INDEX IF NOT EXISTS canvas_comments_author ON canvas_comments (author_id, created_at);

CREATE TABLE IF NOT EXISTS canvas_comment_mentions (
  comment_id TEXT NOT NULL, pos INTEGER NOT NULL, len INTEGER NOT NULL,
  user_id TEXT NOT NULL, user_email TEXT NOT NULL,
  PRIMARY KEY (comment_id, pos)
);
CREATE INDEX IF NOT EXISTS canvas_comment_mentions_person ON canvas_comment_mentions (user_id);
CREATE TABLE IF NOT EXISTS canvas_comment_reads (
  thread_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

-- learn-migrations/0012-next-steps-telemetry.sql
-- Professor Next Steps telemetry (docs/features/professor-next-steps.md §2.3, owner 2026-10-08): one row per planned hook
-- set, owned or shared - the planner telemetry the route returns (tier, escalation reason, the validator rule names, calls,
-- ms, versions, model role and id, usage, cost; shared adds the one-way share key, a structural input summary and the trim
-- counts). Never a hook, the planner input, a card, an answer, an email or a share token. A cache hit plans nothing and
-- writes no row; a planner failure writes none. user_id is users.id (the owner's, or a signed-in shared viewer's; null
-- for an anonymous one); board is the owned app id, or the one-way share key on a shared canvas. Additive and re-runnable;
-- LEARN_DB only. Production waits for an explicit release GO.
CREATE TABLE IF NOT EXISTS next_steps_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT,
  board TEXT NOT NULL,
  telemetry_json TEXT NOT NULL
);

-- learn-migrations/0013-user-profile-descriptions.sql
-- Profile description (docs/features/creator-profile.md, owner 2026-10-08: "in profile add a discription"): the short
-- plain-text line a person writes about themselves in Settings > Profile, shown under their name on /@handle and on
-- their creator card. At most 160 characters, never a link or HTML (rendered as text). One row per account principal,
-- written only when they fill one in; clearing it deletes the row, so no row means no description and nothing renders.
-- A narrow one-to-one extension of user_profiles, as user_handles is: not a creator record, never copied onto canvases
-- or publications. A table, not a user_profiles column: SQLite has no ADD COLUMN IF NOT EXISTS, so an ALTER would fail
-- on its second run. Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (after 0012).
CREATE TABLE IF NOT EXISTS user_profile_descriptions (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 160)
);

-- learn-migrations/0014-canvas-comment-colors.sql
-- A comment pin's colour (docs/features/canvas-comments.md section 8, owner 2026-10-08): one row per recoloured thread,
-- from the canvas's six-swatch palette, set by whoever may resolve the thread. No row is the default orange. Stored apart
-- from the board (a colour never writes learn_boards) and deleted with its thread. A table rather than a column so the
-- file stays additive and re-runnable. LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0014).
CREATE TABLE IF NOT EXISTS canvas_comment_colors (
  thread_id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- learn-migrations/0017-tutor-eval-archive.sql
-- Tutor evaluation archive (r34 audit follow-up, owner 2026-10-09; storage contract reviewed by Tutor eval and
-- Parallel 2026-10-09): the offline session simulator's originals (tests/evals/tutor-session: run.json manifest,
-- aggregate.json, one session bundle per profile, and the run's logs) kept in the Learn D1, apart from customer
-- learning evidence (learning_journeys, 0006) and Next Steps telemetry (0012). Additive, re-runnable, LEARN_DB only.
-- Nothing here is read or written by a learner's request: an owner-only private import behind /api/learn/tutor-eval.
--
-- One execution = one run that happened once; its id is minted at run start (or backfilled from started time + tested
-- sha). A recomputed aggregate is a new ARTIFACT on the same execution under its own analysis_version, never a new
-- execution and never a replacement: an artifact's bytes, once stored, are immutable. Every artifact carries the sha256
-- of its whole payload; a payload too large for one D1 row (2,000,000 bytes, developers.cloudflare.com/d1/platform/limits)
-- is split into bounded, ordered, individually hashed chunks that reassemble to those exact bytes. An import is
-- complete only when every declared artifact is whole and verified and their number equals artifact_count: an
-- interrupted import stays visibly incomplete (completed_at NULL) and can be resumed, never silently finished.

CREATE TABLE IF NOT EXISTS tutor_eval_executions (
  execution_id TEXT PRIMARY KEY,              -- the run's own unique id (paid-20261008T180918Z-01a7a508), never the date label
  run_id TEXT NOT NULL,                       -- the harness's display label (paid-YYYY-MM-DD)
  run_date TEXT NOT NULL,                     -- YYYY-MM-DD of run_started_at
  run_started_at TEXT NOT NULL,               -- ISO 8601, from the manifest (or started.txt / run.log on a backfill)
  run_finished_at TEXT,                       -- ISO 8601; NULL when the run never finished
  topic TEXT NOT NULL,                        -- the simulator topic id
  mode TEXT NOT NULL CHECK (mode IN ('real', 'scripted', 'unknown')), -- unknown when a backfill cannot prove it; never guessed
  -- The run's own outcome as the harness (or, on a backfill, the importer with a note) reported it. partial = the
  -- harness did not finish; a session's own error is in its bundle, not here. The row never changes after import.
  status TEXT NOT NULL CHECK (status IN ('running', 'checkpointed', 'completed', 'stopped', 'failed', 'partial')),
  status_note TEXT,
  source_sha TEXT NOT NULL,                   -- the repository commit the run tested
  tested_tree TEXT NOT NULL,                  -- that commit's tree: what the evaluated code was
  harness_version TEXT NOT NULL,              -- the evaluator commit
  config_version TEXT,                        -- sha256(limits + models)[:12] from the manifest; NULL with no manifest
  anthropic_usd REAL,                         -- NULL = unmetered or unknown, never 0
  anthropic_calls INTEGER,
  jev_cost_usd REAL,                          -- NULL = the provider reports no cost, never 0
  jev_cost_note TEXT,
  imported_by TEXT NOT NULL,                  -- users.id of the importer (owner-only)
  artifact_count INTEGER NOT NULL,            -- declared up front, logs included: completion is checked against it
  imported_at TEXT NOT NULL,                  -- ISO 8601: when the import was declared
  completed_at TEXT                           -- ISO 8601: the IMPORT's completion; NULL until every artifact verifies
);

-- One row per artifact of an execution: the manifest, each aggregate version, each session bundle, each log.
CREATE TABLE IF NOT EXISTS tutor_eval_artifacts (
  execution_id TEXT NOT NULL REFERENCES tutor_eval_executions(execution_id),
  artifact_key TEXT NOT NULL,                 -- the original file name; a recomputed aggregate is aggregate@<analysis_version>.json
  kind TEXT NOT NULL CHECK (kind IN ('manifest', 'aggregate', 'session', 'log')),
  analysis_version TEXT,                      -- the aggregation code's commit; NULL for manifest, session and log rows
  content_type TEXT NOT NULL,                 -- application/json, text/plain or text/csv
  byte_length INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                       -- of the whole payload; the import re-hashes the reassembled bytes
  chunk_count INTEGER NOT NULL,
  verified_at TEXT,                           -- ISO 8601; NULL until every chunk is present and the hash matches
  PRIMARY KEY (execution_id, artifact_key)
);

-- Ordered chunks of an artifact's bytes. Each chunk is bounded (the store's CHUNK_BYTES, 524,288 bytes, about a quarter of a D1 row) and
-- hashed on its own, so a conflicting re-upload of one chunk is caught before the whole is re-hashed.
CREATE TABLE IF NOT EXISTS tutor_eval_artifact_chunks (
  execution_id TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  seq INTEGER NOT NULL,                       -- 0-based, dense: chunk_count rows reassemble the artifact
  bytes BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (execution_id, artifact_key, seq),
  FOREIGN KEY (execution_id, artifact_key) REFERENCES tutor_eval_artifacts(execution_id, artifact_key)
);

CREATE INDEX IF NOT EXISTS tutor_eval_executions_topic ON tutor_eval_executions (topic, mode, status);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_sha ON tutor_eval_executions (source_sha);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_date ON tutor_eval_executions (run_date);
CREATE INDEX IF NOT EXISTS tutor_eval_artifacts_kind ON tutor_eval_artifacts (execution_id, kind);
