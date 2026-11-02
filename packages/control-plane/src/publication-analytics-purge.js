// Deletion cleanup (a permanently deleted canvas or Rabbit Hole): its creator analytics go with it. Unpublish, Archive and Trash
// keep them. Statements for the caller's batch. No imports, so canvases.js can use it without a cycle through learn-boards.js.
const TABLES = ['publication_events', 'publication_learners', 'publication_sessions', 'publication_learner_days', 'publication_learner_items', 'publication_revisions'];
export const purgeAnalytics = (db, org, canvas) => TABLES.map(table => db.prepare(`DELETE FROM ${table} WHERE org = ? AND canvas = ?`).bind(org, canvas));
