-- One row per CLI login code sent. The challenge the CLI holds is only a signed id;
-- the code's keyed MAC stays here, with an attempt count and a single-use stamp.
CREATE TABLE IF NOT EXISTS cli_login_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_mac TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cli_login_challenges_email ON cli_login_challenges(email, created_at);
