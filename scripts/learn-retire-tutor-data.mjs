// Tutor cleanup (docs/features/explain-on-canvas/receipts/p6-db-runbook.md): the SQL for the archive backfill (before P6a) and for
// the controlled retirement of the old Tutor tables (P6b window). This file PRINTS SQL and touches no database;
// scripts/learn-retire-tutor-runner.mjs is what runs it, from the owner's terminal. Usage:
//   node scripts/learn-retire-tutor-data.mjs count|backfill|verify|retire
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The six retired tables, children first (D1 enforces foreign keys: tutor_eval_artifact_chunks and tutor_eval_artifacts
// reference their parents), and every index the drop takes with them: the 13 objects the production preflight reports.
export const TABLES = ['tutor_eval_artifact_chunks', 'tutor_eval_artifacts', 'tutor_eval_executions', 'learning_path_versions', 'learning_journeys', 'learn_grades'];
export const INDEXES = ['idx_learn_grades_created', 'idx_learn_grades_learner', 'learning_journeys_live', 'tutor_eval_artifacts_kind', 'tutor_eval_executions_date', 'tutor_eval_executions_sha', 'tutor_eval_executions_topic'];
export const RETIRED_OBJECTS = [...TABLES.map(t => `table:${t}`), ...INDEXES.map(i => `index:${i}`)].sort();

// Until P6a a goal's archived status was derived from its journey (learn-coaching-store.js joined learning_journeys). The join is
// gone in P6a, so the status must be the goal's own lifecycle column first. Idempotent: a second run changes nothing.
export const backfillSql = () => `UPDATE learn_goals SET lifecycle = 'archived'
  WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived';`;

// The same predicate as a count. It must be 0 in an environment before P6a is released there.
export const verifySql = () => `SELECT COUNT(*) AS unarchived_goals FROM learn_goals
  WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived';`;

// The automatic goal row the retired journey code made for each journey (label = the journey topic, outcome empty): origin
// 'journey', no criterion, no activity, no attempt, no observation, still open and never touched since (revision 0).
// ponytail: `revision = 0` and `lifecycle = 'open'` are stricter than v0.5 7.3 step 2, which lists only the first five
// conditions. A placeholder the learner renamed or deleted through /goal has revision > 0, and an archived one (the backfill
// archived the goals of archived journeys) is history that "stays archived throughout"; both are kept, so no deliberate goal and no
// archived goal is removed (decision 7); the cost is a few dead rows. Owner decision N6 in the runbook.
export const placeholderGoalIds = () => `SELECT g.id FROM learn_goals g WHERE g.origin = 'journey' AND g.lifecycle = 'open' AND g.revision = 0
  AND NOT EXISTS (SELECT 1 FROM learn_goal_criteria c WHERE c.goal_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM learn_activities a WHERE a.goal_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM learn_attempts t WHERE t.goal_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM learn_observations o WHERE o.goal_id = g.id)`;

// One row: what the retired tables hold, how many goals the backfill would change, and what retire would delete or clear.
// `present` is the set of retired tables that still exist; a dropped one counts 0 (so a rerun after a partial retire still reads).
export const countSql = (present = TABLES) => {
  const n = t => (present.includes(t) ? `(SELECT COUNT(*) FROM ${t})` : '0');
  return `SELECT
  ${n('learning_journeys')} AS journeys,
  ${present.includes('learning_journeys') ? '(SELECT COUNT(*) FROM learning_journeys WHERE archived_at IS NOT NULL)' : '0'} AS journeys_archived,
  ${n('learning_path_versions')} AS path_versions,
  ${n('learn_grades')} AS grades,
  ${n('tutor_eval_executions')} AS eval_executions,
  ${n('tutor_eval_artifacts')} AS eval_artifacts,
  ${n('tutor_eval_artifact_chunks')} AS eval_chunks,
  (SELECT COUNT(*) FROM learn_goals WHERE origin = 'journey') AS journey_goals,
  ${present.includes('learning_journeys') ? "(SELECT COUNT(*) FROM learn_goals WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived')" : '0'} AS goals_to_archive,
  (SELECT COUNT(*) FROM (${placeholderGoalIds()})) AS placeholder_goals_to_delete,
  (SELECT COUNT(*) FROM learn_coaching_state WHERE active_goal_id IN (${placeholderGoalIds()})) AS coaching_rows_to_clear;`;
};

// The window's statements, in order, one array entry per wrangler call so a stopped run resumes where it stopped (every entry is
// idempotent). v0.5 7.3: the backfill again (belt and braces; skipped when learning_journeys is already gone), then the coaching
// pointers, then the placeholder goals, then the six drops with their indexes. Nothing else is written.
export const retireSteps = (present = TABLES) => [
  ...(present.includes('learning_journeys') ? [{ name: 'backfill', sql: backfillSql() }] : []),
  { name: 'clear coaching pointers', sql: `UPDATE learn_coaching_state SET active_goal_id = NULL, active_activity_id = NULL WHERE active_goal_id IN (${placeholderGoalIds()});` },
  { name: 'delete placeholder goals', sql: `DELETE FROM learn_goals WHERE id IN (${placeholderGoalIds()});` },
  ...TABLES.map(t => ({ name: `drop ${t}`, sql: `DROP TABLE IF EXISTS ${t};` })),
];

export const SQL = {
  backfill: backfillSql, verify: verifySql, count: () => countSql(),
  retire: () => retireSteps().map(s => `-- ${s.name}\n${s.sql}`).join('\n'),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv[2];
  if (!SQL[mode]) { console.error('Use count, backfill, verify or retire'); process.exit(2); }
  console.log(SQL[mode]());
}
