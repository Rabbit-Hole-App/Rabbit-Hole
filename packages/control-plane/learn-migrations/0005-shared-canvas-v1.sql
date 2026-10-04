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

-- Backfill: every existing repository came in through the anonymous import (repositories.js POST and the
-- indexer's git ls-remote, no credentials), so each was public when imported. Existing shares are pinned at
-- their first open or ask after the code that reads this ships (learn-shared-ask.js sharePin).
INSERT OR IGNORE INTO repository_visibility (app_id, visibility, checked_at) SELECT id, 'public', created_at FROM repository_apps;
