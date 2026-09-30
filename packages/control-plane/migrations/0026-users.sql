-- Internal users. email is the principal every app, share and org row keys on: a real address
-- proven by the email sign-in, or user@<id>.rabbithole.invalid for a user who has only signed in
-- with Google/GitHub. A provider-reported email never becomes a principal (no silent merge).
-- session_epoch: sessions carry it; logout bumps it, which revokes every session of the user.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  session_epoch INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- One row per way to sign in, keyed by the provider's immutable id: Google sub, GitHub numeric id,
-- or the address itself for provider 'email'. provider_email is informational (display, a future
-- explicit link flow) and is never a lookup key.
CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_email TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
-- Web sign-in links. The emailed token is a signed id only; this row makes it single use.
CREATE TABLE IF NOT EXISTS login_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  next TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_login_links_email ON login_links(email, created_at);
