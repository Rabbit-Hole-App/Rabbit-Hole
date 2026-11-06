# Cleanup P6 database runbook (owner-run, per environment)

Prepared by lane C. Nothing here has been run against any database. The authoritative plan is `cleanup-v0.5.md` (6.5, 7.2, 7.3, 9, 10, risks 3, 10, 12, 18). Every database action below needs the owner's GO at the moment it runs, from the owner's own terminal; the agent that wrote this never runs it.

## Order (fixed, per environment)

1. **P4 live** in that environment: no code can archive a journey (`archiveJourney` is gone). Done on production and dev as of P4/P5.
2. **Backfill and verify** (this section). Sets `lifecycle = 'archived'` on every goal whose journey is archived; the `verify` count must be 0.
3. **P6a released** (join removal). The launcher `gate` command refuses unless the receipt exists and verify is still 0.
4. **Recovery check, then the P6b window** (section P6b, added on the P6b branch).

Environments: `dev` and `parallel` bind the same Learn D1 (`rabbit-hole-learn-dev`, id `028f800f-ce8e-4461-adb2-827f417492eb`; both `wrangler.dev.jsonc` and `wrangler.parallel.jsonc` name it), so one backfill covers both; the launcher still keeps a receipt per label. `prod` is `rabbit-hole-learn-prod` (`f28417c4-d8ce-448e-8687-cc7bc2edf3a8`). The launcher refuses to run unless the wrangler config binds `LEARN_DB` to exactly that name and id.

## The launcher

`scripts/learn-retire-tutor.cmd <dev|parallel|prod> <check|backfill|gate>` (runs `scripts/learn-retire-tutor-runner.mjs`; SQL comes from `scripts/learn-retire-tutor-data.mjs`, whose sha256 the runner pins, so an edited generator refuses to run). Credentials are read by name from `small-deploy/.env` and never printed. A log line goes to `C:\s\spec\logs\tutor-cleanup-db-<env>.log`; the window stays open with the exit code.

| Command | Writes? | What it does |
| --- | --- | --- |
| `check` | no | Prints the journey/path-version/journey-goal counts and the verify count. Never asks. |
| `backfill` | yes, one `UPDATE` on `learn_goals` | Requires a terminal and the typed phrase `BACKFILL <ENV>` (which also attests P4 is live there). Runs the update only when verify > 0, re-runs verify, and writes the receipt only if it is 0. Idempotent: rerun any time. |
| `gate` | no | Exit 0 only if the receipt exists, names this database id, and verify is still 0 now. Run it immediately before the P6a release for that environment. |

Receipt: `C:\s\spec\release-queue\tutor-cleanup\receipts\<env>-backfill-verified.json` (`env`, `database`, `database_id`, `verified_at`, `unarchived_goals: 0`, `archived_by_this_run`, `generator_sha256`). Quote it in the P7 receipt (`m0.md`).

## Steps (each environment, dev first)

1. `scripts\learn-retire-tutor.cmd dev check` and read the counts. `goals_to_archive` is what the backfill will change.
2. Owner GO, then `scripts\learn-retire-tutor.cmd dev backfill`, type `BACKFILL DEV`. Expect `RESULT OK backfill dev: ... verify 0`.
3. `scripts\learn-retire-tutor.cmd dev gate` must print `RESULT OK gate dev`.
4. Production: same three commands with `prod`, on the owner's GO, quoting the `check` output.
5. P6a is released only after `gate` is OK for the environment being released. Production release is the MVP path (`MVP_ALLOWED_SHA` set by the owner for the exact SHA, `C:\s\spec\release-queue\release-mvp.cmd <name>`); the agent never sets it.

If the P4 recovery branch (`feat/tutor-p4-release-recovery-2`) is ever used in an environment, it restores the journey writers: rerun `backfill` and `gate` before releasing P6a there.

## What P6a changes for a learner (what the verify count protects)

* A goal's archived status is its own `lifecycle` column. Before P6a it was derived from the journey row; without the backfill an archived journey's goal would reopen.
* `ensureState` no longer points a first-time learner at the board's live journey, and goal switches no longer park or unpark journeys. A **live** journey that never got a goal row (older than learn 0025 and never opened since) will not appear as a goal. These are the zero-criteria placeholder goals the P6b `retire` mode deletes anyway (v0.5 7.3 step 2); no criterion, attempt or observation is lost.
* `learn_goals.journey_id` stays as a column. The journey tables still exist and are untouched until P6b.

## Not verified

* The real wrangler `--json` output of a remote `--command` SELECT/UPDATE was read from the existing owner launchers (`apply-prod-migrations-tutor.sh`), not run; `parseWrangler` takes the JSON from the first line that starts with `[`. The first `check` on dev is the proof; it writes nothing.
* The launcher cannot tell that P4 is live in an environment; the typed phrase is the attestation.

# P6b: the schema-source commit and the table drop (one window)

Branch `feat/tutor-cleanup-p6b`, stacked on P6a. Nothing here has been run.

## What the P6b commit contains

* `repository-schema.sql` loses the `CREATE` statements (and indexes) of `learn_grades`, `learning_journeys`, `learning_path_versions`, `tutor_eval_executions`, `tutor_eval_artifacts`, `tutor_eval_artifact_chunks`; `learn-migrations/0006-learning-journeys.sql` and `0017-tutor-eval-archive.sql` are deleted (their content was already in the consolidated file; no kept table references them). Learn migrations stay additive: nothing non-additive was written (`scripts/schema-check.test.mjs`).
* `scripts/learn-retire-tutor-data.mjs` gains `retire` (the ordered steps), `scripts/learn-retire-tutor-runner.mjs` gains `window-check` and `retire`, with their tests (`scripts/learn-retire-tutor-runner.test.mjs`, a fixture of the retired DDL in `scripts/fixtures/learn-retired-tables.sql`).
* Test references to the dropped tables are gone (`shared-canvas-privacy.test.js` seed list, a fixture comment).

## What the release job reports (read from `scripts/prod-release.mjs` `schemaBlockers` and `scripts/schema-check.mjs`)

The preflight compares the live `rabbit-hole-learn-prod` schema with the schema built from the candidate's sources, in both directions. The difference between P6a and P6b is exactly 13 objects (computed with the same functions, not estimated): tables `learn_grades`, `learning_journeys`, `learning_path_versions`, `tutor_eval_artifact_chunks`, `tutor_eval_artifacts`, `tutor_eval_executions`; indexes `idx_learn_grades_created`, `idx_learn_grades_learner`, `learning_journeys_live`, `tutor_eval_artifacts_kind`, `tutor_eval_executions_date`, `tutor_eval_executions_sha`, `tutor_eval_executions_topic`.

| Moment | `prepare` of | Reports |
| --- | --- | --- |
| Before the drop | P6b | `blocked:` then 13 lines `rabbit-hole-learn-prod schema: unexpected table:learn_grades` ... (`unexpected index:...`), then `each migration needs the owner's GO; this job never applies one`. Nothing is deployed. |
| After the drop | any commit before P6b (P6a, the P6a recovery branch, any Tutor release not rebased on P6b) | the same 13 lines as `missing table:...` / `missing index:...`. Nothing is deployed. |
| After the drop | P6b (or a descendant) | no schema blocker. |

So the window order is forced: drop, then release P6b, with nothing else released in between. The automatic matched rollback of a failed P6b release returns to the P6a pair, which does not query the dropped tables.

## Window order (production; dev first on the same steps)

0. Before the window: P6a is released and served in this environment (the P6a build is the previous pair in the release receipt); the backfill receipt exists; the P6b candidate is rebased on current `main` (see below), previewed under the MVP fast path (build, affected tests, smoke, record), and `feat/tutor-cleanup-p6b-recovery` is pushed and descends from it; no other production release is queued; the owner has not set `MVP_ALLOWED_SHA` yet.
1. `scripts\learn-retire-tutor.cmd prod window-check` (read-only). It refuses on: a modified checkout; a P6b recovery branch that does not descend from HEAD; any query of a retired table in the Worker source (the `git grep` of v0.5 6.5 step 5 (ii)) at HEAD, at the P6a commit or on the recovery tip; a missing backfill receipt; verify not 0; any live-schema difference other than the 13 retired objects (a migration the checkout's base lacks, for example). It prints the counts (`journeys`, `path_versions`, `grades`, eval rows, `goals_to_archive`, `placeholder_goals_to_delete`, `coaching_rows_to_clear`) and the ordered steps. Quote the output with the GO.
2. Owner GO, quoting those counts.
3. `scripts\learn-retire-tutor.cmd prod retire`, then type `RETIRE PROD` and `P6A SERVED`. On production it first deletes `rabbit-hole/feat/tutor-cleanup-p6a-recovery` (that branch restores code that joins the tables), then runs, one wrangler call each: the backfill again, clear the coaching pointers of placeholder goals, delete the placeholder goals, and the six drops (children first). It ends by running the preflight's own `schemaDiff` against this checkout: it must be empty, or the run fails with the diff and can be rerun (every step is idempotent). It writes `<env>-retire-done.json` beside the backfill receipt.
4. Immediately: the owner sets `MVP_ALLOWED_SHA` for the P6b SHA, runs `C:\s\spec\release-queue\release-mvp.cmd <name>`, and deletes the variable. The release prints `MVP MODE`; its receipt names the P6a pair as `previous`.
5. Record in the P7 receipt (`m0.md`): the counts, the typed GO, the retire output, the clean diff, the release receipt.

The dev window is the same with `dev` (and `parallel` is the same database). It does not delete the P6a recovery branch. Because the dev D1 is shared by every clone, announce it first: a dev clone or branch that still runs code which queries the retired tables breaks as soon as step 3 finishes.

## Recovery rules (v0.5 6.5 step 5)

* Rollback below the P6a pair after the drop is not permitted: older code joins `learning_journeys`. The automatic matched rollback of the release job returns to the P6a pair and is the only supported one. The launcher text and step 3's second confirmation say so.
* The P6b recovery branch `feat/tutor-cleanup-p6b-recovery` descends from the P6b commit, keeps the schema sources and every application file exactly as P6b has them, and only turns the launcher's `retire` command into a refusal (and drops the tests that ran it), so a recovery release can never drop anything again and never mentions the retired tables in Worker source. A branch that does not descend from P6b fails the schema preflight (`missing ...`).
* A D1 Time Travel restore across the drop (`wrangler d1 time-travel restore <db> --bookmark <the release receipt's bookmark>`) is destructive and a last resort: the six tables return and the P6b build's preflight then reports them `unexpected`. It needs its own plan and an owner GO.
* Whether Cloudflare keeps Worker versions older than the P6a pair available to `wrangler rollback` is unverified; the rule does not depend on it.

## Decisions and base for the owner

* **N6 (new, recommended yes): the placeholder rule is stricter than v0.5 7.3 step 2.** Besides `origin = 'journey'` with no criterion, activity, attempt or observation, the launcher deletes a goal only if it is still `open` and was never touched since it was made (`revision = 0`). A placeholder the learner renamed or deleted through /goal, and the archived goal of an archived journey ("archived stays archived throughout"), are kept as dead rows. Without this, step 2 as written would also delete the archived placeholders the backfill just archived. `placeholder_goals_to_delete` in `count` is the stricter number.
* **The P6b base.** `main` now carries the Tutor R4 migration `0039-roadmap-core.sql`; production's Learn D1 may already hold its tables (a production apply log exists; not read). The preflight needs the exact schema, so P6b must be rebased on current `main` before its preview (the schema commit touches only the three blocks above and does not overlap 0039). `window-check` names any difference it finds. Rebasing changes the SHA, the MVP record and the recovery branch; redo them.

## Not verified

* The launcher's real wrangler calls (remote `--command` per step, the `--json` output) were exercised only against a fake that runs the SQL on node:sqlite, never against D1. D1's handling of `DROP TABLE` on a parent with foreign-key children was not observed; the order is children first.
* That the served production pair is the P6a build is an owner attestation (`P6A SERVED`), not a check.
