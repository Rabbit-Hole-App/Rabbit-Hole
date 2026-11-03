// Creator analytics: learner keys, retention and deletion. No imports, so canvases.js and the restricted deletion tool
// (scripts/analytics-delete.mjs) can use it without a cycle through learn-boards.js.
const sha256Hex = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

// A learner is a one-way key: pseudonymous, not anonymous, since it can be recomputed from the id it came from.
export const learnerKey = (kind, id) => sha256Hex(`publication-learner:${kind}:${id}`);
export const accountKey = ({ userId, email }) => learnerKey(userId ? 'u' : 'e', userId || email);
export const visitorKey = visitorId => learnerKey('v', visitorId);

// 90 days: the MVP product default for records with a learner or session key. Reads ignore older rows, and each ingest and read purges them.
export const RETENTION_DAYS = 90;
export const retentionCutoff = now => new Date(Date.parse(now) - RETENTION_DAYS * 86400e3).toISOString();
export const purgeExpired = (db, now) => {
  const at = retentionCutoff(now), day = at.slice(0, 10);
  return [
    db.prepare('DELETE FROM publication_events WHERE received_at < ?').bind(at),
    db.prepare('DELETE FROM publication_sessions WHERE started_at < ?').bind(at),
    db.prepare('DELETE FROM publication_learners WHERE last_seen_at < ?').bind(at),
    db.prepare('DELETE FROM publication_learner_days WHERE day < ?').bind(day),
    db.prepare('DELETE FROM publication_learner_items WHERE day < ?').bind(day),
  ];
};

// Every table holding a learner's rows, for deletion by account or by visitor identifier. The counters in publication_board_days have no
// per-person column, so they stay. key is a sha256 hex string; checked, because the tool writes it into SQL text.
export const LEARNER_TABLES = ['publication_events', 'publication_sessions', 'publication_learners', 'publication_learner_days', 'publication_learner_items'];
export function deleteLearnerSql(key) {
  if (!/^[0-9a-f]{64}$/.test(key)) throw Error('not a learner key');
  return LEARNER_TABLES.map(table => `DELETE FROM ${table} WHERE learner_key = '${key}';`);
}

// A permanently deleted canvas (a Rabbit Hole is never published, so it has none): its creator analytics go with it. Unpublish, Archive and
// Trash keep them. Statements for the caller's batch.
const CANVAS_TABLES = [...LEARNER_TABLES, 'publication_board_days', 'publication_revisions'];
export const purgeAnalytics = (db, org, canvas) => CANVAS_TABLES.map(table => db.prepare(`DELETE FROM ${table} WHERE org = ? AND canvas = ?`).bind(org, canvas));
