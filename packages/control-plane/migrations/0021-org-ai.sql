-- Per-org AI provider choice (Settings > Account): the platform's Anthropic key
-- by default, or the org's own AWS Bedrock via an assumed role.
CREATE TABLE IF NOT EXISTS org_ai (
  org TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'anthropic',  -- anthropic | bedrock
  model TEXT,                                  -- provider-specific model id; NULL = platform default
  bedrock_region TEXT,
  bedrock_role_arn TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
