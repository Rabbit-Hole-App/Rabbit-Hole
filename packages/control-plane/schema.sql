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
  kind TEXT NOT NULL DEFAULT 'server',
  image TEXT,
  schedule TEXT,
  schedule_paused INTEGER NOT NULL DEFAULT 0,
  last_scheduled_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  review TEXT,
  review_prev TEXT,
  reviewed_at TEXT,
  review_model TEXT,
  repo_url TEXT,
  repo_branch TEXT,
  repo_commit TEXT,
  repo_dirty INTEGER,
  repo_public INTEGER,
  deployed_at TEXT,
  runbook TEXT,
  folder_id INTEGER,
  deleted_at TEXT,
  inputs TEXT,
  outputs TEXT,
  agent_md TEXT,
  description TEXT,
  UNIQUE(org, name)
);
-- migrating an existing DB:
--   ALTER TABLE apps ADD COLUMN kind TEXT NOT NULL DEFAULT 'server';
--   ALTER TABLE apps ADD COLUMN image TEXT;
--   (web dashboard columns: migrations/0003-web.sql, 0004-stop.sql, 0005-folders-teams.sql)

-- Dashboard sidebar folders — org-wide, purely organizational.
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org, name)
);

-- People added on /members without any share yet — the pool groups draw from.
CREATE TABLE IF NOT EXISTS org_members (
  org TEXT NOT NULL,
  email TEXT NOT NULL,
  UNIQUE(org, email)
);

-- Share a whole folder with a person or a #team — a live grant over every app
-- currently (or later) filed in it.
CREATE TABLE IF NOT EXISTS folder_shares (
  folder_id INTEGER NOT NULL REFERENCES folders(id),
  email TEXT,
  team_id INTEGER REFERENCES teams(id),
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(folder_id, email, team_id)
);

-- Teams: #finance shares as a live reference — add someone to the team later and
-- they gain access to everything shared with it.
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org, name)
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  email TEXT NOT NULL,
  UNIQUE(team_id, email)
);
CREATE TABLE IF NOT EXISTS app_teams (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, team_id)
);

CREATE TABLE IF NOT EXISTS members (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, email)
);

CREATE TABLE IF NOT EXISTS deploys (
  id INTEGER PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  repo_url TEXT,
  branch TEXT,
  commit_sha TEXT,
  dirty INTEGER,
  deployed_by TEXT NOT NULL,
  deployed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER,
  reason TEXT,
  machine_id TEXT,
  inputs TEXT,
  diagnosis TEXT,
  deploy_id INTEGER
);

-- Ask (phase 1): one thread per question chain, scoped and per-user.
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  user TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_ref TEXT,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

-- Ask phase 2: tool calls become proposals; the row is the approval log.
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  thread_id INTEGER NOT NULL,
  org TEXT NOT NULL,
  user TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS run_logs (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  line TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  slug TEXT NOT NULL,
  ts TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  user TEXT
);
CREATE INDEX IF NOT EXISTS request_logs_app ON request_logs (org, slug, id);
CREATE INDEX IF NOT EXISTS request_logs_ts ON request_logs (ts);

-- Slack-approved runs get their outcome pushed back to the thread; one row per pending run.
CREATE TABLE IF NOT EXISTS slack_runs (
  org TEXT NOT NULL,
  run_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_ts TEXT,
  PRIMARY KEY (org, run_id)
);

-- 0018: apps.description — model-written on first deploy, user-editable after.

-- 0019: custom workspaces (slug w-*), explicit membership; domain workspace stays implicit.
CREATE TABLE IF NOT EXISTS workspaces (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workspace_members (
  slug TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (slug, email)
);

-- 0020: structured runbook JSON + validation warnings (docs/features/runbook.md).
-- ALTER TABLE apps ADD COLUMN runbook_json TEXT;
-- ALTER TABLE apps ADD COLUMN runbook_warnings TEXT;

-- 0021: per-org AI provider (Settings > Account) - platform Anthropic key or
-- the org's own AWS Bedrock via an assumed role.
CREATE TABLE IF NOT EXISTS org_ai (
  org TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  model TEXT,
  bedrock_region TEXT,
  bedrock_role_arn TEXT,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 0022: OpenAI-compatible provider (local LLMs via tunnel, vLLM, gateways).
-- ALTER TABLE org_ai ADD COLUMN openai_base_url TEXT;
-- ALTER TABLE org_ai ADD COLUMN openai_api_key TEXT;

-- 0024: one owner-reviewed Learn course per app.
CREATE TABLE IF NOT EXISTS learn_courses (
  app_id INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  brief TEXT NOT NULL,
  curriculum TEXT,
  approved_revision INTEGER,
  lesson TEXT,
  source_version TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Moments the tutor put in front of a learner (youtube-moment-recommendation.md).
-- Written from day one; the hot path starts reading it in phase 4. Keyed per
-- workspace: this is learner behaviour, never shared across orgs.
CREATE TABLE IF NOT EXISTS learn_moments (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  question TEXT NOT NULL,
  video_id TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER,
  confidence REAL,
  -- set when a learner keeps or dismisses the moment; null until phase 4 asks
  accepted INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learn_moments_org ON learn_moments(org, created_at);

-- 0025: CLI login challenges - keyed MAC of the code, attempt limit, single use, issuance cap.
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
