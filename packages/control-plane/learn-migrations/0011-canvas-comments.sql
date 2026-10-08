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
