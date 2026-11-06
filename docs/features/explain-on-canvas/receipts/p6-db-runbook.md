# Cleanup P6 runbook and owner command sheet (owner-run, per environment)

Prepared by lane C2, 2026-11-06. The authoritative plan is `cleanup-v0.5.md` (6.5, 7.2, 7.3, 9, 10, risks 3, 10, 12, 18). Every database action below needs the owner's GO at the moment it runs, from the owner's own terminal; the agent that wrote this never runs one. The same text lives at `C:\s\spec\release-queue\p6-owner-commands.md` (that copy has the P6b values filled in).

## Status at 2026-11-06 10:45 AM PT

| Step | dev (and parallel, same D1) | prod |
| --- | --- | --- |
| P4 live (journey writers retired) | attested by the typed `BACKFILL DEV` | live (release run 42250400898 carries P4) |
| Backfill + verify = 0, receipt | DONE 09:46:10 AM PT, archived 0 | DONE 09:46:53 AM PT, archived 0 |
| `gate` OK | DONE 09:46:14 AM PT | DONE 09:46:59 AM PT |
| Counts at that time | journeys 0, journeys_archived 0, path_versions 0, journey_goals 0, goals_to_archive 0 | same, all 0 |
| P6a released | no | no (candidate 68, ready) |
| P6b window | not run | not run |

Both Learn databases hold no journey, no path version and no journey-made goal, so the backfill moved nothing and the placeholder rule (owner decision N6) deletes nothing today. `grades` and the three `eval_*` counts were not printed by the P6a generator; `window-check` prints them for the first time.

The backfill receipts record the P6a generator hash (`c2a22570...`). The P6b branch changes the generator (it adds `retire`), so its pin is different (`392207f1...`); nothing compares the two. The P6b `window-check` re-reads verify live.

## Pins (refresh if the Lead re-stacks P6a)

| What | Value |
| --- | --- |
| Production main today | `3b9348449e36fcfde1be02256d742abcc5f298a1` (release run 42265221173, attempt 2). Its pair, which P6a records as `previous`: cp `8efffe91-fbc7-4be3-89c7-c023367b6d9b`, app `e8b95296-d39e-4cb8-9dd2-e49520654395` |
| P6a release | `84d94faabca3e653e0e6b77c954aadcae084a57b` (`feat/tutor-cleanup-p6a-release`), pin `68-tutor-p6a-mvp`, MVP record `a33c1b30f0c57360` (build, affected-tests, smoke, preview pass), checkout `C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release` |
| P6a recovery (valid only until the drop) | `feat/tutor-cleanup-p6a-release-recovery-r2` = `f7d20f7a734a06af6346f2efcd424de15dc631b3`, one commit on the P6a release, tree equal to main's (`425f6920...`). Older P6a recovery branches: `feat/tutor-cleanup-p6a-release-recovery` `875b1face929c84b223bcd63b1006a6ef4cb7c61`, `feat/tutor-cleanup-p6a-recovery` `8209cec2366596b7544011a35b5f633cbde7c49c` |
| P6b release | branch `feat/tutor-cleanup-p6b-release` = `<P6B_SHA>`; a fast-forward of the P6a release; checkout `C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release` |
| P6b recovery | `feat/tutor-cleanup-p6b-release-recovery` = `<P6B_RECOVERY_SHA>`, descends from the P6b release; its `retire` command refuses |
| P6b pin | `<P6B_PIN>` (the Lead creates it when it orders the P6b preview) |
| Runner constants that must match | `P6A_SHA` (grep target in `window-check`) and `P6B_RECOVERY` in `scripts/learn-retire-tutor-runner.mjs` |

If the Lead re-stacks P6a onto a newer main, every P6a value above changes and `P6A_SHA` in the runner must be bumped: follow "Re-stack recipe" at the end before anything is sent.

## How the commands run

* Everything below runs in the owner's own Command Prompt (typed phrases need a real terminal; the runner refuses a mutating command without one before reading any credential). Credentials are read by name from `small-deploy\.env` and never printed.
* `learn-retire-tutor.cmd` writes `C:\s\spec\logs\tutor-cleanup-db-<env>.log`, prints `RESULT OK ...` / `RESULT CHECK ...` / `RESULT FAIL <reason>`, then `Exit code N` and waits for a key. Reruns are safe: backfill and every retire step are idempotent.
* Receipts are under `C:\s\spec\release-queue\tutor-cleanup\receipts\`: `<env>-backfill-verified.json` (exists for `dev` and `prod`) and `<env>-retire-done.json` (written by `retire`). There is no `parallel` receipt: `parallel` is the dev database, so use `parallel check` only (read-only, needs no receipt) and run `gate`, `window-check` and `retire` as `dev`.
* The P6a gate runs from the P6a checkout (it has `node_modules`). The P6b window runs from the P6b checkout, which must be clean at the pinned SHA and have wrangler installed; if `node_modules` is missing the runner stops with `run npm ci in <checkout> first (nothing was run)` before it does anything: `cd /d C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release && npm ci`.
* Release commands are `C:\s\spec\release-queue\release-mvp.cmd <pin> [--check]`; the agent never sets `MVP_ALLOWED_SHA`.

## Part 1. P6a live (before anything is dropped)

Do prod, and do dev whenever P6a code is deployed to the dev worker. The two are independent databases.

### 1a. prod

1. Gate, immediately before the release (read-only):
   `C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release\scripts\learn-retire-tutor.cmd prod gate`
   Expect `RESULT OK gate prod: receipt 2026-11-06T17:46:53.712Z, verify 0 now` and `Exit code 0`. Anything else: stop (see Stop conditions).
2. MVP record (read-only), from `C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release`:
   `node scripts\mvp-fast-path.mjs verify --sha 84d94faabca3e653e0e6b77c954aadcae084a57b`
   Expect `MVP record a33c1b30f0c57360 for 84d94faa: build pass, affected-tests pass, smoke pass, preview pass; ... recovery feat/tutor-cleanup-p6a-release-recovery-r2; broad CI and the release gate bypassed`.
3. Allow exactly this commit: `gh variable set MVP_ALLOWED_SHA --body 84d94faabca3e653e0e6b77c954aadcae084a57b -R Rabbit-Hole-App/Rabbit-Hole`
4. `C:\s\spec\release-queue\release-mvp.cmd 68-tutor-p6a-mvp --check` -> `checks ok: worktree at 84d94faa, main 3b934844 fast-forwards to it ...`, `CHECK COMPLETE: nothing was pushed`, `CHECK PASSED (exit code 0)`.
5. `C:\s\spec\release-queue\release-mvp.cmd 68-tutor-p6a-mvp` -> `main 3b934844..84d94faa pushed`, `release run <id>: success`, `the release log confirms: MVP MODE: broad CI and release gate BYPASSED by owner policy`, `released 84d94faabca3e653e0e6b77c954aadcae084a57b build <hash>: rabbit-hole-cp <v>, rabbit-hole-app <v>; smoke passed`, two HTTP codes for `/` and `/sign-in`, then `RELEASE DONE (68-tutor-p6a-mvp): 84d94faa is on main` and `OK (exit code 0)`.
6. Remove the allowance: `gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole`
7. Read the served pair (read-only GET), from the P6a checkout:
   `node C:\s\spec\day-1021\with-cf.mjs C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release node C:\s\spec\explain-sandbox\prod\cp-served.mjs`
   Expect `"readable":true` and `"cp_sha12":"84d94faabca3"`. The app Worker: same with `C:\s\spec\explain-sandbox\explain-worker-vars.mjs`, expect `"app_sha12":"84d94faabca3"`.
8. Save the release receipt (its `previous` pair is the rollback target of Recovery R1 and R3): `gh run list -R Rabbit-Hole-App/Rabbit-Hole --branch main --event push --limit 3`, then `gh run download <run id> -n release-receipt-84d94faabca3e653e0e6b77c954aadcae084a57b-<attempt> -D C:\s\spec\release-queue\tutor-cleanup\receipts\p6a-release -R Rabbit-Hole-App/Rabbit-Hole` (attempt 1 unless the run was re-run).

What the release preflight reports for P6a: nothing. P6a changes no schema, so the live `rabbit-hole-learn-prod` schema equals the sources; `prepare` prints `prepared 84d94faab... build <hash>` and no `blocked:` line. If it prints `blocked:`, read the lines (Stop conditions) and do not proceed.

### 1b. dev and parallel (one database, `rabbit-hole-learn-dev`)

1. Before P6a code is deployed to the dev worker: `C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release\scripts\learn-retire-tutor.cmd dev gate` -> `RESULT OK gate dev: receipt 2026-11-06T17:46:10.908Z, verify 0 now`.
2. `C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release\scripts\learn-retire-tutor.cmd parallel check` (optional, read-only) -> a note that parallel and dev bind the same database (`028f800f-ce8e-4461-adb2-827f417492eb`), the counts and `RESULT CHECK parallel: verify=0 (read-only; nothing was changed)`.
3. P6a does not go through `release-mvp` for dev (MVP deploys isolated clones; the P6a clone `rabbit-hole-web-dev-tutor-p6a-release` was previewed with record `a33c1b30f0c57360`). How the shared dev worker receives P6a is the Lead's dev deploy, not part of this sheet.

## Part 2. The P6b window

The window exists because the release preflight compares the live schema with the candidate's sources in both directions (`missing`, `unexpected`, `different`). The six tables and their seven indexes are 13 objects, so: before the drop only a commit that still defines them passes, after the drop only a commit that no longer defines them (P6b and its descendants) passes. Order, per environment: drop, then release P6b, with no other production release in between. On dev there is no release step in this sheet.

### Before the window opens (once)

1. P6a is served (1a.7) and its release receipt is saved (1a.8). For dev, P6a code is what the dev workers you care about run.
2. The P6b candidate (`feat/tutor-cleanup-p6b-release`, `<P6B_SHA>`) was previewed by the Lead under the MVP fast path (record, recovery branch) and `<P6B_PIN>` exists. Check the recovery branch is on the remote: `git ls-remote rabbit-hole refs/heads/feat/tutor-cleanup-p6b-release-recovery` shows `<P6B_RECOVERY_SHA>` (`window-check` also verifies it descends from HEAD).
3. Nothing else is queued for production between the drop and the P6b release. Every candidate released after the window must be a descendant of P6b (rebase it on P6b first); one released before must go before. The queued pins above 68 are named in the report to the Lead.
4. Open the window checkout and confirm it is clean and at the pinned commit:
   `cd /d C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release`
   `git fetch rabbit-hole` then `git rev-parse HEAD` (expect `<P6B_SHA>`) and `git status --porcelain --untracked-files=no` (expect nothing).
5. Announce a dev window first: all dev clones share the dev D1, and a clone or branch that runs code older than P6a breaks as soon as `retire` finishes.

### 2a. dev (and parallel), the rehearsal on the real D1

From `C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release`:

1. `scripts\learn-retire-tutor.cmd dev window-check` (read-only). Expect, in order:
   * `== <time> window-check on rabbit-hole-learn-dev (dev, remote)`
   * `checkout: HEAD <P6B_SHA>`
   * `recovery check: no query of a retired table at HEAD (P6b) <12 chars>`, `... at P6a 84d94faabca3`, `... at the P6b recovery tip <12 chars>`
   * `backfill receipt: 2026-11-06T17:46:10.908Z`
   * `counts: {"journeys":0,"journeys_archived":0,"path_versions":0,"grades":<n>,"eval_executions":<n>,"eval_artifacts":<n>,"eval_chunks":<n>,"journey_goals":0,"goals_to_archive":0,"placeholder_goals_to_delete":0,"coaching_rows_to_clear":0}`
   * `verify: 0 goals of an archived journey are unarchived`
   * `preflight today: 13 object(s) reported unexpected, all retired objects`
   * `steps: backfill | clear coaching pointers | delete placeholder goals | drop tutor_eval_artifact_chunks | drop tutor_eval_artifacts | drop tutor_eval_executions | drop learning_path_versions | drop learning_journeys | drop learn_grades`
   * `RESULT CHECK window dev: ready (read-only; nothing was changed)`
   The dev D1 is shared by every clone and branch, so it may hold objects from other branches: a `RESULT FAIL the live schema differs from this checkout in ways the window does not own` listing them is a legitimate stop, not something to work around.
2. Owner GO, quoting the counts line.
3. `scripts\learn-retire-tutor.cmd dev retire`, then type `RETIRE DEV` and, at the next prompt, `P6A SERVED`. Expect the same lines as above, then the warning that no rollback below the P6a pair is permitted, then `done: backfill`, `done: clear coaching pointers`, `done: delete placeholder goals`, six `done: drop ...` lines, and `RESULT OK retire dev: the preflight diff against <12 chars> is clean; prepare and release the P6b commit now`. It writes `dev-retire-done.json` and does not touch the P6a recovery branches (production still needs them).
4. `scripts\learn-retire-tutor.cmd parallel check` -> `RESULT CHECK parallel: learning_journeys is already retired (read-only; nothing was changed)`.
5. P6b reaches the dev worker through the Lead's dev deploy.

### 2b. prod (the window)

From `C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release`:

1. `scripts\learn-retire-tutor.cmd prod window-check`. Same lines as 2a with `rabbit-hole-learn-prod` and `backfill receipt: 2026-11-06T17:46:53.712Z`, ending `RESULT CHECK window prod: ready (read-only; nothing was changed)`.
2. Owner GO, quoting the counts line.
3. `scripts\learn-retire-tutor.cmd prod retire`, type `RETIRE PROD`, then `P6A SERVED`. Production additionally prints `feat/tutor-cleanup-p6a*recovery*: deleted (feat/tutor-cleanup-p6a-recovery, feat/tutor-cleanup-p6a-release-recovery, feat/tutor-cleanup-p6a-release-recovery-r2)` before the first SQL step (these branches restore code that joins the tables), then the nine `done:` lines and `RESULT OK retire prod: the preflight diff against <12 chars> is clean; prepare and release the P6b commit now`. It writes `prod-retire-done.json`.
4. Immediately, the P6b release (the only production release allowed now):
   * `gh variable set MVP_ALLOWED_SHA --body <P6B_SHA> -R Rabbit-Hole-App/Rabbit-Hole`
   * `C:\s\spec\release-queue\release-mvp.cmd <P6B_PIN> --check` -> `CHECK PASSED (exit code 0)`
   * `C:\s\spec\release-queue\release-mvp.cmd <P6B_PIN>` -> as in 1a.5 with `<P6B_SHA>`; its receipt's `previous` pair is the P6a pair.
   * `gh variable delete MVP_ALLOWED_SHA -R Rabbit-Hole-App/Rabbit-Hole`
5. Read the served pair as in 1a.7; expect the first 12 characters of `<P6B_SHA>`.
6. `scripts\learn-retire-tutor.cmd prod check` -> `RESULT CHECK prod: learning_journeys is already retired (read-only; nothing was changed)`.
7. Record everything in `m0.md` (its evidence list).

### What the release preflight reports (computed with the same functions, `scripts/schema-check.mjs`)

The difference between the P6a and the P6b schema is exactly 13 objects: tables `learn_grades`, `learning_journeys`, `learning_path_versions`, `tutor_eval_artifact_chunks`, `tutor_eval_artifacts`, `tutor_eval_executions`; indexes `idx_learn_grades_created`, `idx_learn_grades_learner`, `learning_journeys_live`, `tutor_eval_artifacts_kind`, `tutor_eval_executions_date`, `tutor_eval_executions_sha`, `tutor_eval_executions_topic`. A refused `prepare` deploys nothing and prints `blocked:` followed by the lines below (read them in the run: `gh run view <run id> -R Rabbit-Hole-App/Rabbit-Hole --log-failed`).

| Moment | `prepare` of | Reports |
| --- | --- | --- |
| Before the drop (P6a live) | P6a, or any commit that defines the tables | nothing; passes |
| Before the drop | P6b or a descendant | 13 lines `rabbit-hole-learn-prod schema: unexpected table:learn_grades` ... `unexpected index:...`, then `each migration needs the owner's GO; this job never applies one` |
| Half-dropped | any commit | `unexpected ...` for the tables still present (P6b) or `missing ...` for the ones gone (anything older); nothing releases until the drop is finished |
| After the drop | P6b or a descendant (the P6b recovery branch included) | nothing; passes |
| After the drop | P6a, the P6a recovery branches, any commit not a descendant of P6b | the same 13 lines as `missing table:...` / `missing index:...` |

## Stop conditions (stop, do not improvise, copy the last `RESULT FAIL` or `RELEASE STOP` line to the Lead)

* `gate`/`window-check` does not end `RESULT OK`/`RESULT CHECK ... ready`, or exits non-zero. Named refusals: tracked files modified; the recovery branch missing or not a descendant of HEAD; a Worker-source query of a retired table at HEAD, at P6a or at the recovery tip; no backfill receipt (or one for another database id); `verify is N now` (a journey was archived after the receipt: rerun `backfill`, then start over); `the live schema differs ... in ways the window does not own` (a pending migration on this checkout's base, or an object from another branch); `scripts/learn-retire-tutor-data.mjs is ..., not the pinned ...` (an edited generator); `does not bind LEARN_DB to ...` (wrong config); `run npm ci ...`; `git fetch rabbit-hole failed`.
* The served pair is not the P6a build on both Workers (1a.7): do not type `P6A SERVED`.
* Any other production release is queued or running between the drop and the P6b release.
* `release-mvp` prints `RELEASE STOP`, the release log lacks `MVP MODE` (`the workflow IGNORED the MVP record`), or the run is not `success`.
* `counts` shows a non-zero `goals_to_archive` or `verify` (rerun `backfill` for that environment first), or a `placeholder_goals_to_delete` that the owner has not seen quoted in the GO.
* Never run SQL by hand, never run `wrangler d1 time-travel restore`, never `wrangler rollback` below the P6a pair after the drop, never force-push.

## Recovery

### R1. P6a misbehaves (any time before the window opens)

P6a changed no schema or data shape, so no database action is involved. Either:

* Fast, a Worker rollback to the previous pair in P6a's release receipt (`previous.app`, `previous.cp`; today cp `8efffe91-fbc7-4be3-89c7-c023367b6d9b`, app `e8b95296-d39e-4cb8-9dd2-e49520654395`, but the receipt is authoritative). App first, then the control plane (`docs/features/prod-release.md`, "Manual rollback"). Both commands below use `npx` through `with-cf.mjs` (credentials by name); its own `wrangler` shortcut has a stale hard-coded path.
  `node C:\s\spec\day-1021\with-cf.mjs C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release\packages\web npx wrangler rollback <previous.app> --config wrangler.rabbit-hole-prod.jsonc --message "rollback P6a" --yes`
  `node C:\s\spec\day-1021\with-cf.mjs C:\Users\cyudhist\Desktop\workspace\tutor-p6a-release\packages\control-plane npx wrangler rollback <previous.cp> --config wrangler.rabbit-hole-prod.jsonc --message "rollback P6a" --yes`
  then the served-pair read of 1a.7 (expect `3b9348449e36`). Main still holds P6a afterwards, so the next release needs the forward fix below.
* Forward, release the recovery branch `feat/tutor-cleanup-p6a-release-recovery-r2` (`f7d20f7a734a06af6346f2efcd424de15dc631b3`). Its tree equals `3b9348449`'s, so it is the previous code on top of the P6a release (a strict descendant, as `release-mvp` requires). The Lead needs a preview record for that SHA and a pin (`SHA=f7d20f7a...`, `MAIN_PREV=84d94faab...`), then 1a.3-1a.6 with the recovery SHA. If main moved after P6a was cut (for example the R4 hotfix), the recovery is valid only if its tree equals the then-current main's tree: compare `git rev-parse rabbit-hole/feat/tutor-cleanup-p6a-release-recovery-r2^{tree}` with `git rev-parse <that main>^{tree}`; if they differ the Lead re-cuts it first.
* Both restore code that joins `learning_journeys`, which is valid only while the six tables exist, i.e. never after step 3 of 2b. The P6a note records that using the recovery needs no backfill rerun (the backfill only moves goals toward archived); that was not re-run here.

### R2. The drop is half done (resumable)

`retire` runs nine wrangler calls, each its own idempotent statement, children before parents, and ends by running the release preflight's own schema diff, which it requires to be empty before it writes `<env>-retire-done.json`.

1. Do not release anything (every preflight fails in a half-dropped state). Users are not affected by the Worker source: the P6a pair does not query the six tables (`node C:\s\spec\release-queue\check-p6-dangling.mjs 6a`, run in a checkout of the P6a release, exits 0).
2. Find where it stopped, read-only: the `done:` lines in `C:\s\spec\logs\tutor-cleanup-db-<env>.log`, and `scripts\learn-retire-tutor.cmd <env> check` (a dropped table counts 0; it prints `already retired` once `learning_journeys` is gone).
3. Rerun `scripts\learn-retire-tutor.cmd <env> window-check` (it tolerates retired objects that are already gone and still refuses any other schema difference), then `scripts\learn-retire-tutor.cmd <env> retire` with the same two phrases. Finished steps are skipped (`backfill` is skipped once `learning_journeys` is gone), the production branch deletion reports `already absent`, and the final diff must be empty.
4. If the same step fails twice with a D1 error, stop and send the `RESULT FAIL` line. Do not drop by hand.
5. If production failed before the first SQL step but after the branch deletion (`... nothing was dropped`), the tables still exist and the P6a recovery branches are gone; restore the one you need only if it is needed: `git push rabbit-hole f7d20f7a734a06af6346f2efcd424de15dc631b3:refs/heads/feat/tutor-cleanup-p6a-release-recovery-r2` (valid only while the tables exist; the next `retire` deletes it again).

### R3. The P6b release fails after the drop (the schema is already the P6b schema)

Read the outcome first: the run (`gh run list -R Rabbit-Hole-App/Rabbit-Hole --branch main --event push --limit 3`), its log (`gh run view <id> -R Rabbit-Hole-App/Rabbit-Hole --log-failed`), and the receipt (`gh run download <id> -n release-receipt-<P6B_SHA>-<attempt> -D C:\s\spec\release-queue\tutor-cleanup\receipts\p6b-release -R Rabbit-Hole-App/Rabbit-Hole`, field `outcome`).

* `blocked:` in `prepare` (no receipt): nothing was deployed and the P6a pair still serves; it keeps working on the P6b schema (it queries none of the six tables). Fix the named cause. `missing ...` means the released commit does not descend from P6b: release `<P6B_SHA>` (or a descendant), never an older commit. Then `release-mvp.cmd <P6B_PIN> --check` and the release again; a rerun resumes.
* `outcome: rolled-back` (upload or smoke failed; the P6a pair serves again): same safety. A transient cause (for example a Cloudflare upload error): `release-mvp.cmd <P6B_PIN>` again, which re-runs a failed run once. A code cause: a forward fix on top of `feat/tutor-cleanup-p6b-release-recovery`. The target must descend from `<P6B_SHA>` (`git merge-base --is-ancestor <P6B_SHA> <target>`), pass `node C:\s\spec\release-queue\check-p6-dangling.mjs 6b`, and go through a fresh MVP preview, pin and `MVP_ALLOWED_SHA` for its own SHA. Its `retire` command refuses.
* `outcome: rollback-failed`: a person acts now. Roll back to the receipt's `previous` pair only (the P6a pair), app first, then the control plane, with the two commands of R1 and the P6a pair's ids, then read the served pair. Do not roll back further.
* Never: a rollback below the P6a pair (older code joins the dropped tables), a release of a commit that does not descend from P6b, or `wrangler d1 time-travel restore <db> --bookmark <receipt bookmark>`. The restore is destructive, brings the six tables back and makes the P6b preflight report them `unexpected`; it needs its own plan and the owner's GO.
* Whether Cloudflare keeps Worker versions older than the P6a pair available to `wrangler rollback` is unverified; no rule here depends on it.

## Re-stack recipe (the Lead re-stacks P6a once onto the released main)

When P6a is re-cut as a new commit `X` (its own release candidate, preview, recovery):

1. In `C:\Users\cyudhist\Desktop\workspace\tutor-p6b-release`: `git rebase --onto X 84d94faab feat/tutor-cleanup-p6b-release` onto a new branch name (`feat/tutor-cleanup-p6b-release-2`; never force-push the old one).
2. Set `P6A_SHA` in `scripts/learn-retire-tutor-runner.mjs` to `X` and replace the P6a values in this file and the sheet.
3. Rerun: `node --test scripts/learn-retire-tutor-runner.test.mjs scripts/schema-check.test.mjs`, `node C:\s\spec\release-queue\check-p6-dangling.mjs 6b`, and `node --test test/learn-*.test.js test/shared-*.test.js` in `packages/control-plane`.
4. Cut the recovery branch again (the retire-refusal commit on the new tip), push both, update `P6B_RECOVERY` if the name changed. The P6b preview record and the pin name the new SHA.

## Not verified

* The launcher's `check`, `gate` and (with nothing to archive) `backfill` have run against the real dev and production D1s (logs above). `retire` has not: D1's handling of `DELETE` and `DROP TABLE` through `wrangler d1 execute --remote --command` was exercised only against a fake that runs the SQL on node:sqlite. The dev window is the first real run; D1's handling of `DROP TABLE` on a parent with foreign-key children was not observed (children are dropped first).
* That the served pair is the P6a build is an owner attestation (`P6A SERVED`) plus the read in 1a.7, not a check inside the runner.
* The `ls-remote` pattern for the P6a recovery branches was read against the real remote (three branches matched); the delete was not run.
* Whether the dev worker's own deploy script checks the dev D1 schema.
