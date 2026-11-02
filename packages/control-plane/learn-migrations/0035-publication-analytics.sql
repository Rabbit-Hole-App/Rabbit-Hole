-- Creator analytics storage (docs/features/creator-analytics-contract.md "Storage"): what visitors do on public /e
-- publications, keyed by the publication's canvas (org, canvas), never by its replaceable token. Learner keys are one-way
-- hashes (no users.id, visitor id, email, IP, user agent or free text is stored). Raw event ids are kept 90 days as the replay
-- guard and the rate limiter's count; the per-learner rollups are kept for the life of the canvas. Written only by the ingest
-- route and the Rabbit Hole start and fork success paths (publication-analytics.js). Additive and re-runnable; LEARN_DB only.
-- Production: an owner command, applied before the release that reads it.
CREATE TABLE IF NOT EXISTS publication_events (
  event_id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  session_key TEXT NOT NULL,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publication_events_session ON publication_events (session_key, received_at);
CREATE INDEX IF NOT EXISTS publication_events_canvas ON publication_events (org, canvas, received_at);
CREATE INDEX IF NOT EXISTS publication_events_received ON publication_events (received_at);
-- One row per learner and publication: signed in or not, synthetic (an identifiable check, never reported as audience), and
-- the end of the last credited active interval, so overlapping tabs cannot credit the same wall-clock second twice.
CREATE TABLE IF NOT EXISTS publication_learners (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  learner_key TEXT NOT NULL,
  signed_in INTEGER NOT NULL DEFAULT 0,
  synthetic INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  credited_through TEXT,
  PRIMARY KEY (org, canvas, learner_key)
);
-- One row per visit (session): the cumulative active seconds the browser last reported and what was credited from it.
CREATE TABLE IF NOT EXISTS publication_sessions (
  session_key TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  learner_key TEXT NOT NULL,
  started_at TEXT NOT NULL,
  reported_active INTEGER NOT NULL DEFAULT 0,
  credited_active INTEGER NOT NULL DEFAULT 0
);
-- One row per learner, publication, UTC day and revision segment: opens (new sessions), credited active seconds, and the
-- day's first source (an allowlisted category, a sanitized campaign tag and a referrer hostname only).
CREATE TABLE IF NOT EXISTS publication_learner_days (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  learner_key TEXT NOT NULL,
  day TEXT NOT NULL,
  segment INTEGER NOT NULL,
  opens INTEGER NOT NULL DEFAULT 0,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  campaign TEXT,
  referrer_host TEXT,
  PRIMARY KEY (org, canvas, learner_key, day, segment)
);
CREATE INDEX IF NOT EXISTS publication_learner_days_day ON publication_learner_days (org, canvas, day);
-- Per learner, day and item: kind card_seen | card_acted | concept_seen | concept_explored | concept_deeper | resource |
-- step_shown | step_selected | quiz | start | fork. n counts repeats; extra is a Next Step position or a quiz outcome (1 correct).
CREATE TABLE IF NOT EXISTS publication_learner_items (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  learner_key TEXT NOT NULL,
  day TEXT NOT NULL,
  segment INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  extra INTEGER,
  PRIMARY KEY (org, canvas, learner_key, day, segment, kind, item_id)
);
CREATE INDEX IF NOT EXISTS publication_learner_items_day ON publication_learner_items (org, canvas, day);
-- Revision segments: each board version seen by ingest, with its card set. A segment starts at the first version whose card
-- set (card ids and their concepts) differs from the version before it; text edits, moves and resizes keep the segment.
CREATE TABLE IF NOT EXISTS publication_revisions (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  version INTEGER NOT NULL,
  card_set_key TEXT NOT NULL,
  segment INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas, version)
);
-- An anonymous browser (visitor key) seen signed in: read-time linking counts its earlier anonymous visits as that account,
-- and a browser the creator signed in on is never counted on the creator's own publications. principal_key is a one-way hash.
CREATE TABLE IF NOT EXISTS publication_visitor_links (
  visitor_key TEXT PRIMARY KEY,
  learner_key TEXT NOT NULL,
  principal_key TEXT NOT NULL,
  linked_at TEXT NOT NULL
);
-- Collection metadata: collection_started_at (the first ingest or read after deployment) and last_ingest_at.
CREATE TABLE IF NOT EXISTS analytics_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
