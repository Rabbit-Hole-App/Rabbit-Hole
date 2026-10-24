-- Canvas Stars (docs/features/stars.md; owner brief 2026-10-23): a signed-in user saves a reference to a canvas. A row copies
-- no content, grants no access and freezes no version; what a star opens is decided by the access rules at that moment.
-- 0027 is taken by feat/credits-2500 (usage grants) and 0020 is held, so this is 0028. Additive and re-runnable; LEARN_DB only.
--
-- canvas_stars: one active relationship per person per canvas. (org, canvas) is the canonical canvas identity every canvas
-- table uses (canvases.org, canvases.name; canvas_publications, canvas_forks): never a share token, a publication token,
-- a board id or an alias of them. user_id is users.id, the stable internal account id (never a handle or display name).
-- user_email is that account's principal, kept for one join only - the public profile's user_handles.email, which is how
-- a handle reaches a person here - and never leaves the server. users.email is immutable (no email change exists, a provider
-- email never becomes a principal: migrations/0026-users.sql), so the pair cannot drift.
-- created_at is the star time with milliseconds (the form canvas_metadata.updated_at uses): "recently starred" order, with
-- (org, canvas) as the tie-breaker.
-- No counter column: a canvas's star count is count(*) over the (org, canvas) key prefix, which the primary key indexes.
CREATE TABLE IF NOT EXISTS canvas_stars (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  PRIMARY KEY (org, canvas, user_id)
);
CREATE INDEX IF NOT EXISTS canvas_stars_mine ON canvas_stars (user_id, created_at DESC, org, canvas);
CREATE INDEX IF NOT EXISTS canvas_stars_person ON canvas_stars (user_email, created_at DESC, org, canvas);

-- canvas_star_events: one row per real transition, written in the same batch as the change it records, so a retried request
-- (which changes nothing) writes none. It is the durable source for the telemetry and creator-analytics adapters (a later
-- increment): they read rows with delivered_at NULL and mark them, so a telemetry outage loses nothing and a retry sends
-- nothing twice. reason: 'voluntary' (the person starred or unstarred) or 'lifecycle' (the system removed the star because
-- its canvas was deleted). owner_star: the person is the canvas's owner. Ids and times only: no title, token or content.
CREATE TABLE IF NOT EXISTS canvas_star_events (
  event_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('added', 'removed')),
  reason TEXT NOT NULL CHECK (reason IN ('voluntary', 'lifecycle')),
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  user_id TEXT NOT NULL,
  owner_star INTEGER NOT NULL DEFAULT 0 CHECK (owner_star IN (0, 1)),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS canvas_star_events_canvas ON canvas_star_events (org, canvas, at);
CREATE INDEX IF NOT EXISTS canvas_star_events_pending ON canvas_star_events (at) WHERE delivered_at IS NULL;
