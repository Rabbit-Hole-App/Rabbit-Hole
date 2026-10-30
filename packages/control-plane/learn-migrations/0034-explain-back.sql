-- Explain-back (docs/superpowers/plans/2026-10-30-explain-back.md, EB-02): private answer media, their transcripts and one
-- server draft per learner and card. Attempt assets are bytes in LEARN_MEDIA under a key derived from the owner scope and the
-- sha256; a row grants only its owner on that canvas (learn-attempt-assets.js), never a board viewer, share link or fork.
-- Kind timeline is a Sketch recording's JSON drawing timeline. meta_json is the Sketch capture's marks/text beside its PNG,
-- set once. Transcripts are immutable derivatives of one audio
-- hash (a failed one is replaced only by an explicit retry). Drafts are the learner's unsubmitted answer with a revision for
-- conflict protection. Additive and re-runnable; LEARN_DB only. Production: an owner command; never applied by a lane.
CREATE TABLE IF NOT EXISTS learn_attempt_assets (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'image', 'video', 'timeline')),
  mime TEXT NOT NULL,
  ext TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  duration_ms INTEGER,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_attempt_assets_hash ON learn_attempt_assets (org, owner_user_id, app, board, sha256);
CREATE TABLE IF NOT EXISTS learn_attempt_transcripts (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  audio_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, id)
);
CREATE INDEX IF NOT EXISTS learn_attempt_transcripts_audio ON learn_attempt_transcripts (org, owner_user_id, audio_sha256);
CREATE TABLE IF NOT EXISTS learn_explain_drafts (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  card_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board, card_id)
);
