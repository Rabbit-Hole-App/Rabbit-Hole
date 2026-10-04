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

-- No backfill (owner, 2026-10-04): a migration never broadens visibility. Existing repositories have no row, so
-- they stay unknown - private to every share - until their owner imports or refreshes them, whose anonymous
-- git ls-remote is the only thing that marks one public (repositories.js). Nothing stored before this says a
-- repository is public. Existing shares are pinned at their first open or ask after this ships (sharePin).
