# Cleanup P6b (schema source and table drop) candidate note

Branch `feat/tutor-cleanup-p6b` (MVP fast path, owner label 2026-11-05), stacked on `feat/tutor-cleanup-p6a`, which is on `d870aef1f9511c54f8cab2ba13b92dfbe79542d1`. **Not releasable on its own:** the release is one window with the table drop, and the commit must be rebased on current `main` first (`p6-db-runbook.md`, "Decisions and base"). No migration is added; no database operation has been run.

## Commits

1. Schema-source commit: `repository-schema.sql` and `learn-migrations/0006`, `0017` lose the six retired tables and their 7 indexes (13 objects); the two test references to them are gone.
2. Retire tooling: the `retire` steps in `scripts/learn-retire-tutor-data.mjs`, the `window-check` and `retire` commands in `scripts/learn-retire-tutor-runner.mjs` (typed `RETIRE <ENV>` then `P6A SERVED`; production deletes `feat/tutor-cleanup-p6a-recovery` first; each step is one idempotent wrangler call; it ends on the preflight's own schema diff), their tests including the enforced-isolation case, the retired-DDL fixture, the runbook's P6b section.

## Proof

* `git grep -nE "learning_journeys|learning_path_versions|learn_grades|tutor_eval_" -- packages/control-plane/src packages/web/src packages/web/dev-worker.js packages/web/app-worker.js` returns nothing at this commit and at the P6a commit (the recovery-check grep of v0.5 6.5 step 5 (ii)). Elsewhere the names appear only in comments of the verbatim learn 0025 block, the owner scripts, the DDL fixture and the regression test, which rebuilds a minimal journeys table so it survives the drop.
* `node --test scripts/schema-check.test.mjs`: green; the P6a-to-P6b schema difference is exactly the 13 objects, computed with `scripts/schema-check.mjs`.

## Recovery

`feat/tutor-cleanup-p6b-recovery`: a strict descendant of the P6b release commit that takes the retire tooling back to its P6a form (it can never drop anything again) and keeps the schema sources and application files exactly as P6b has them. Valid after the drop. A branch that does not descend from P6b fails the preflight (`missing ...`).

## Check-map

Nothing removed: the new files are covered by the existing `scripts/*.mjs`, `scripts/fixtures/**` and `scripts/**/*.test.mjs` `none` globs and the `.cmd` row P6a added. No Linux check is added or removed.
