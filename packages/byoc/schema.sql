CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL,
  job_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  region TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  role_arn TEXT,
  signer_arn TEXT,
  stack_id TEXT,
  api_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Requested permissions are metadata only. AWS remains the approval authority.
CREATE TABLE IF NOT EXISTS access_requests (
  connection_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  app_name TEXT NOT NULL,
  s3_read TEXT,
  base_access TEXT NOT NULL,
  template_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
