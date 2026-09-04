CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  fly_app TEXT NOT NULL,
  proxy_secret TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'domain',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org, name)
);

CREATE TABLE IF NOT EXISTS members (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, email)
);
