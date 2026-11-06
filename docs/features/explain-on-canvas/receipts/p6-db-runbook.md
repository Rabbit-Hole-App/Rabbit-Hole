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
