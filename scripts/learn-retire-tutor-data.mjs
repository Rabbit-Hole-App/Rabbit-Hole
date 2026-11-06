// Tutor cleanup (docs/features/explain-on-canvas/receipts/p6-db-runbook.md): the SQL for the archive backfill that must be
// verified in each environment before the journey joins leave the stores (P6a). This file PRINTS SQL and touches no database;
// scripts/learn-retire-tutor-runner.mjs is what runs it, from the owner's terminal. Usage:
//   node scripts/learn-retire-tutor-data.mjs count|backfill|verify
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ponytail: the `retire` mode (placeholder goals, the six table drops) is added by the P6b branch, not here.

// Until P6a a goal's archived status was derived from its journey (learn-coaching-store.js joined learning_journeys). The join is
// gone in P6a, so the status must be the goal's own lifecycle column first. Idempotent: a second run changes nothing.
export const backfillSql = () => `UPDATE learn_goals SET lifecycle = 'archived'
  WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived';`;

// The same predicate as a count. It must be 0 in an environment before P6a is released there.
export const verifySql = () => `SELECT COUNT(*) AS unarchived_goals FROM learn_goals
  WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived';`;

// One row: what the journey tables hold and how many goals the backfill would change. Read-only.
export const countSql = () => `SELECT
  (SELECT COUNT(*) FROM learning_journeys) AS journeys,
  (SELECT COUNT(*) FROM learning_journeys WHERE archived_at IS NOT NULL) AS journeys_archived,
  (SELECT COUNT(*) FROM learning_path_versions) AS path_versions,
  (SELECT COUNT(*) FROM learn_goals WHERE origin = 'journey') AS journey_goals,
  (SELECT COUNT(*) FROM learn_goals WHERE journey_id IN (SELECT id FROM learning_journeys WHERE archived_at IS NOT NULL) AND lifecycle <> 'archived') AS goals_to_archive;`;

export const SQL = { backfill: backfillSql, verify: verifySql, count: countSql };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv[2];
  if (!SQL[mode]) { console.error('Use count, backfill or verify'); process.exit(2); }
  console.log(SQL[mode]());
}
