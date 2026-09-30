CREATE TABLE IF NOT EXISTS repository_apps (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL, owner_email TEXT NOT NULL,
 repo TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT, status TEXT NOT NULL DEFAULT 'queued',
 error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(org,name)
);
CREATE TABLE IF NOT EXISTS repository_versions (
 app_id INTEGER NOT NULL, commit_sha TEXT NOT NULL, storage_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY(app_id,commit_sha)
);
CREATE TABLE IF NOT EXISTS threads (
 id TEXT PRIMARY KEY, org TEXT NOT NULL, user TEXT NOT NULL, scope_ref TEXT NOT NULL,
 commit_sha TEXT NOT NULL, title TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS repository_messages_thread ON messages(thread_id);
CREATE TABLE IF NOT EXISTS repository_message_graphs (
 message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
 graph_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learn_courses (
 app_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, brief TEXT NOT NULL,
 curriculum TEXT, approved_revision INTEGER, lesson TEXT, source_version TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS canvases (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL,
 owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT,
 device_id TEXT, UNIQUE(org,name)
);
