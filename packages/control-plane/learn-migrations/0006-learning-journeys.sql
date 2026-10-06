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
