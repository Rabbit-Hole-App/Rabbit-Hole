-- Base schema for a brand-new main D1: the two tables that existed before migration 0001.
-- The migrations start from here (0001 alters apps), so a fresh database runs this file once,
-- then every file in migrations/ in order. Never run it on a database that already has tables.
-- Rebuild steps: docs/features/rabbit-hole-dev.md. Checked by test/migrations-bootstrap.test.js.

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  fly_app TEXT NOT NULL,
  proxy_secret TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'domain',
  owner_email TEXT NOT NULL,
  aws_role_arn TEXT,
  deploy_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org, name)
);

CREATE TABLE IF NOT EXISTS members (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, email)
);
