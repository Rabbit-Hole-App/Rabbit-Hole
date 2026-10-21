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

-- learn-migrations/0015-library-folders.sql
-- Library folders (docs/features/library-folders.md, owner 2026-10-09): flat folders a person makes in their own Library
-- to group their canvases and projects. Private to their owner, always: never on Explore, a share or a profile. A folder
-- is keyed to the owner as canvases are (org, owner_email); its colour is one of the canvas's six swatches. An item (the
-- Library's org + name, a canvas-* or repo-*) is in at most one folder; no row means it sits loose in the Library. A
-- trashed or archived item keeps its row and comes back into its folder on Restore; deleting a folder deletes its rows,
-- never an item. Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (after 0014).
CREATE TABLE IF NOT EXISTS library_folders (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_folders_owner ON library_folders (org, owner_email);
CREATE TABLE IF NOT EXISTS library_folder_items (
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  PRIMARY KEY (org, name)
);
CREATE INDEX IF NOT EXISTS library_folder_items_folder ON library_folder_items (folder_id);
-- learn-migrations/0016-usage-operations.sql
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

-- learn-migrations/0018-inline-ai-telemetry.sql
-- Inline AI editor telemetry (docs/features/inline-ai-editor.md A3 and A5, owner 2026-10-12): one row per inline Edit or
-- Explain request, keyed by its request id, so a retried write never makes a second row. Stored: who (users.id) and which
-- board (the app id), whether it was a live request or a tagged benchmark run (run_id, the tested sha, the fixture id),
-- whether the provider was mocked, whether the result streamed, how it was routed (direct = an explicit / command,
-- jev = classified by JEV, bypassed = no routing: Edit or a plain explain), the capability that answered, the outcome,
-- and metrics_json: stage timings in milliseconds and counters only (the learn-inline.js cleanMetrics allowlist).
-- Never stored: prompt text, selected or surrounding canvas content, code, screenshots, model output or an email.
-- Written best effort after Accept, Reject or Cancel; a missing table skips the row, never the request.
-- Additive and re-runnable; LEARN_DB only. Shared dev and production apply wait for the owner's GO.
CREATE TABLE IF NOT EXISTS inline_ai_telemetry (
  request_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT,
  board TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'benchmark')),
  run_id TEXT,
  sha TEXT,
  fixture TEXT,
  mocked INTEGER NOT NULL DEFAULT 0 CHECK (mocked IN (0, 1)),
  streaming INTEGER NOT NULL DEFAULT 0 CHECK (streaming IN (0, 1)),
  route TEXT NOT NULL CHECK (route IN ('direct', 'jev', 'bypassed')),
  capability TEXT,
  outcome TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inline_ai_telemetry_run ON inline_ai_telemetry (source, run_id, created_at);

-- learn-migrations/0019-chat-message-meta.sql
-- Chat workspace answers (agent-coordination/tasks/chat-workspace-CONTRACT.md B7; owner decision 2026-10-13 11:45 PM PT: local
-- and shared dev; production needs its own GO). Side tables beside the canvas chat's threads and messages
-- (repository-schema.sql), which stay untouched: a message with no meta row is an old message and renders as plain text.
-- chat_message_meta: one row per message. User rows hold {mode, command, contextRefs}; assistant rows hold
-- {version, mode, kind, contextRefs, actions, followUps, syllabus} or {status: 'stopped'}. alternative_of: a regenerated
-- answer points at the turn's first answer. chat_message_feedback: one rating per message and user; clearing deletes it.
-- chat_thread_state: per thread mode, draft, attached refs, the versioned summary, and last_activity_at (written only on a
-- message insert). Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS chat_message_meta (
  message_id INTEGER PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  alternative_of INTEGER,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_message_meta_thread ON chat_message_meta (thread_id);
CREATE TABLE IF NOT EXISTS chat_message_feedback (
  message_id INTEGER NOT NULL,
  user TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user)
);
CREATE TABLE IF NOT EXISTS chat_thread_state (
  thread_id TEXT PRIMARY KEY,
  mode TEXT,
  draft_json TEXT,
  summary_json TEXT,
  context_json TEXT,
  last_activity_at TEXT,
  updated_at TEXT NOT NULL
);

-- learn-migrations/0021-canvas-refs.sql
-- Canvas references (C:/s/spec/canvas-references-mvp.md; owner decisions 2026-10-14 Q1/Q2: local and the feature's dev preview;
-- production needs its own GO). The saved source board is authoritative: a CanvasNode block holds refs [{ id, target }]. This
-- table is a derived index for backlinks, rewritten in the same LEARN_DB.batch as the board write and guarded on the row that
-- write produced (canvas-refs.js), so a rejected or stale save never changes it. One row per indexed reference: source_board
-- and target_board are learn_boards.id, source_object the card's block id, object_title its title (at most 120 characters).
-- A target the saver cannot read is not indexed. Additive and re-runnable; LEARN_DB only. Independent of the held 0020.
CREATE TABLE IF NOT EXISTS learn_canvas_refs (
  source_board TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  source_object TEXT NOT NULL,
  object_title TEXT,
  target_board TEXT NOT NULL,
  PRIMARY KEY (source_board, ref_id)
);
CREATE INDEX IF NOT EXISTS learn_canvas_refs_target ON learn_canvas_refs (target_board);
-- learn-migrations/0022-usage-accounting.sql
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

-- learn-migrations/0023-file-imports.sql
-- Canvas file imports (docs/features/canvas-file-imports.md section 4; owner spec and decisions in C:/s/spec/file-imports.md).
-- Sources are immutable originals, derivatives are converter outputs tied to one source revision, jobs are durable
-- conversion work driven by the FileJobs Durable Object, documents hold edited text/code/notebook content apart from the
-- board, and file_source_refs is a derived index of which boards reference a source (rewritten with each board save,
-- like learn_canvas_refs), so removing one reference never deletes bytes another board still uses.
-- Access is decided here, never by knowing an id or an R2 key (section 4.1). Times are Unix milliseconds.
-- Additive and re-runnable; LEARN_DB only; mirrored into repository-schema.sql. Local first; shared learn-dev after review
-- (owner decision B, 2026-10-16); production needs its own approval.
CREATE TABLE IF NOT EXISTS file_sources (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  declared_type TEXT,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'stored', 'failed', 'deleted')),
  created_at INTEGER NOT NULL,
  stored_at INTEGER,
  deleted_at INTEGER
);
-- Reuse within one owner only: never cross-account deduplication.
CREATE INDEX IF NOT EXISTS file_sources_owner_sha ON file_sources (org, owner_email, sha256);
CREATE INDEX IF NOT EXISTS file_sources_board ON file_sources (board_id);

CREATE TABLE IF NOT EXISTS file_derivatives (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  converter TEXT NOT NULL,
  converter_version TEXT NOT NULL,
  options_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  media_type TEXT,
  bytes INTEGER,
  sha256 TEXT,
  r2_key TEXT,
  coverage_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (source_id, source_sha256, kind, converter_version, options_hash, name)
);

CREATE TABLE IF NOT EXISTS file_jobs (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  card_id TEXT,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  converter TEXT NOT NULL,
  converter_version TEXT,
  options_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'validating', 'converting', 'preparing_preview', 'ready', 'ready_with_limitations', 'failed', 'cancelled')),
  stage TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_until INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  derivative_ids_json TEXT,
  limitations_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE (org, owner_email, idempotency_key)
);
CREATE INDEX IF NOT EXISTS file_jobs_state ON file_jobs (state, lease_until);
CREATE INDEX IF NOT EXISTS file_jobs_source ON file_jobs (source_id);

CREATE TABLE IF NOT EXISTS file_documents (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  head_rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS file_document_revisions (
  doc_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  parent_rev INTEGER,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, rev)
);

CREATE TABLE IF NOT EXISTS file_source_refs (
  source_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  PRIMARY KEY (source_id, board_id)
);
CREATE INDEX IF NOT EXISTS file_source_refs_board ON file_source_refs (board_id);

-- learn-migrations/0024-pdf-highlights.sql
-- PDF highlights and excerpts (C:/s/spec/pdf-excerpts/contract.md, owner decisions 2026-10-19). pdf_source_hashes caches the
-- sha256 of a learner's own stored PDF bytes (a context document or an uploaded paper), computed once by the server, so an
-- anchor names the exact document version. pdf_highlights are reader highlights, private to their author and tied to that
-- version. Region crops are ordinary file_sources rows (0023). Times are Unix milliseconds.
-- Additive and re-runnable; LEARN_DB only; mirrored into repository-schema.sql. Local first; learn-dev by Parallel after
-- review; production needs owner GO.
CREATE TABLE IF NOT EXISTS pdf_source_hashes (org TEXT NOT NULL, owner_email TEXT NOT NULL, source_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, computed_at INTEGER NOT NULL, PRIMARY KEY (org, owner_email, source_key));
CREATE TABLE IF NOT EXISTS pdf_highlights (id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL,
  source_key TEXT NOT NULL, source_sha256 TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('text','region')),
  page_index INTEGER NOT NULL, anchor_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pdf_highlights_owner_source ON pdf_highlights (org, owner_email, source_key, source_sha256);

-- learn-migrations/0025-tutor-coaching-state.sql
-- Tutor coaching state (C:/s/spec/tutor-workflow/draft.md Task 02 and "Progress data schema"; owner decision 5a,
-- 2026-10-20): personal Tutor controls, several resumable goals per learner and canvas with one active pointer, versioned
-- milestone criteria and activities. Attempts, assessments and evidence links are learn 0026 (Tasks 05/06, their own lane
-- and GOs; C:/s/spec/tutor-workflow/migrations.md section 6). Additive and re-runnable, CREATE only
-- (scripts/schema-check.test.mjs: schema identity is a learn migration's identity); LEARN_DB only.
-- Applied locally only until its learn-dev GO; production waits for its own GO. 0020 stays reserved by fix/chat-save-unique.
--
-- Every row is scoped to owner_user_id (users.id, never an email) and only its owner reads or writes it: a shared or forked
-- canvas carries no one's personal state. There is no SQL backfill (a migration is DDL only): the store seeds a learner's
-- row on first use, pointing at the board's live journey as that learner's active goal, before any second goal can exist
-- (learn-coaching-store.js ensureState). No criterion, attempt or evidence is ever made from an old conversation.
-- One journey per board stays live (learning_journeys_live is unchanged); a paused journey-backed goal parks its journey
-- off the board's live index, never archives it (learn-journey-store.js parkJourneySql).

-- One row per learner and canvas: the controls and the active pointer. revision guards every coaching write; last_action_id
-- replays a retried action.
CREATE TABLE IF NOT EXISTS learn_coaching_state (
  org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'ask', 'tutor')),
  tutor_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tutor_enabled IN (0, 1)),
  suggestions_paused INTEGER NOT NULL DEFAULT 0 CHECK (suggestions_paused IN (0, 1)),
  active_goal_id TEXT, active_activity_id TEXT, last_action_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board)
);

-- A goal the learner accepted. Paused is not stored: an open goal the pointer does not name is paused. journey_id links a
-- goal to its adaptive learning journey (one goal per journey); activity_id is the activity a return resumes.
CREATE TABLE IF NOT EXISTS learn_goals (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  label TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL CHECK (origin IN ('coaching', 'journey')),
  scope_version INTEGER NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'open' CHECK (lifecycle IN ('open', 'completed', 'archived')),
  journey_id TEXT UNIQUE, activity_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learn_goals_scope ON learn_goals (org, owner_user_id, app, board);

-- A goal's milestone criteria, one set per scope version, never rewritten: a scope change adds the next version's rows.
CREATE TABLE IF NOT EXISTS learn_goal_criteria (
  goal_id TEXT NOT NULL, scope_version INTEGER NOT NULL, criterion_id TEXT NOT NULL, version INTEGER NOT NULL,
  position INTEGER NOT NULL, label TEXT NOT NULL, requirement TEXT NOT NULL,
  requires_reasoning INTEGER NOT NULL CHECK (requires_reasoning IN (0, 1)), rubric_version TEXT NOT NULL, skill_key TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (goal_id, scope_version, criterion_id)
);

-- An activity: the exact task (revision is its prompt version; attempts bind to it) and the step it reached.
CREATE TABLE IF NOT EXISTS learn_activities (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, org TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'awaiting_feedback', 'feedback_ready', 'completed', 'paused', 'skipped')),
  objective TEXT NOT NULL, prompt TEXT NOT NULL, response_kind TEXT NOT NULL,
  criterion_refs_json TEXT NOT NULL DEFAULT '[]', source_refs_json TEXT NOT NULL DEFAULT '[]', checkpoint_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learn_activities_goal ON learn_activities (goal_id);
