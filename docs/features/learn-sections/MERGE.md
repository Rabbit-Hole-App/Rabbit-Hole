# Merge of rehearsal/sections into main: pre-merge checks

Prepared on 2026-11-16 (PT) for the owner and the Reviewer, after the Reviewer's 11:55 and 12:10 rulings. **Nothing has been pushed to main**, and no production database was touched. The Reviewer reads this first; the owner gives the push and the `!` commands.

## 1. The local merge

- Remote main moved to **5f29c23a6** (the /explain lane's 150-explain release, 11:49 PT). `rabbit-hole/main` was merged into `rehearsal/sections` first (544645194, clean), so the sections tip contains it.
- Local `main` in `C:/s/main-merge` is `rabbit-hole/main` 5f29c23a6 plus one `--no-ff` merge commit of the sections tip. `git diff main rehearsal/sections` is empty. The SHAs are in section 8.
- The earlier local main (with 022bc04d2, 788ed2594 and 73600eabb) is kept as the branch `backup/main-before-sections-merge`. Every non-merge commit it had is in `rehearsal/sections`.

## 2. What changed for the 11:55 and 12:10 rulings

- **The rehearsal feature ships ON (12:10).** `scripts/prod-release.mjs BUILD_ENV` sets `VITE_REHEARSAL_TRIGGER: '1'`.
  - Production builds the codebase chip, the Tutor flow, the Run card, the section rows and the Start-from-GitHub canvas destination (`start-run.js`, which follows the flag).
  - `REHEARSAL_PIN_COMMIT` is added to `NEVER_ON_PRODUCTION`.
- **Section row:** renamed for users from "Make section" to "Build this section" (`tutor-rehearsal-text.js`). "Next section" is unchanged.
- **code-explain** has its own server switch, `CODE_EXPLAIN_ENABLED` (12:10).
  - `chat-capability-route.js availability()` returns true for it only when the switch is `'true'`. With the switch off, the route is not offered to the router, and a pick or a named capability becomes an ordinary answer.
  - The production config pins it `"false"`. `wrangler.dev.jsonc` and the local/CI stack (`scripts/ci/config/integ-local.jsonc`) set it `"true"`.
  - The 11:55 browser-flag gate is removed. Test: `tutor-prompt.test.js` "code-explain ships dark".
- **Production bundle check** (`e2e/production-bundle-check.mjs`), for a build with the flag:
  - The `RunCard` and `TutorRehearsal` chunks are required.
  - "Use the codebase", "Next section", "Build this section" and "Planning this section" must ship.
  - The code-explain card's chunks ship but stay dark, since its route is off.
  - "Make section" and `REHEARSAL_PIN_COMMIT` are new dev markers. The earlier `code-explain` marker is gone, per 11:55 (a).
- **Production config pins (11:55, 3):** `packages/web/wrangler.rabbit-hole-prod.jsonc` sets these explicitly:
  - `AI_MONTHLY_ALLOWANCE_USD` "25";
  - `COMPUTE_MONTHLY_ALLOWANCE_USD` "10";
  - `COMPUTE_RATE_CPU_CORE_SEC_MICROS` "39.42";
  - `COMPUTE_RATE_MEM_GIB_SEC_MICROS` "6.67";
  - `CODE_EXPLAIN_ENABLED` "false".
- **Brief overlay (11:55, 5):** the first two sentences of paragraph 2 of `tasks/learn-section-brief.md` are replaced exactly as ruled.
  - The datasette 1.2 re-run was refused again. The brief, as returned, is in `brief/data-1.2.json` under `log[0].submitted`. The validator's errors:
    - b1 `shows` backticks whole expressions (`Setting("default_page_size", 100, ...)`);
    - b2 `shows` names `default_page_size`, which is not in b2's own anchored lines;
    - b5 is a background beat that says "This brief did not read that body" and names `app.py`;
    - b5 and b6 ideas have three sentences.

## 3. Tests that fail on current main (pre-existing)

Run on `rabbit-hole/main` 5f29c23a6 in a clean worktree. The numbers are in section 4.
- The two animation runtime tests (`interact-checks.test.js` 28/28, `interact-e2e.test.js` 37/37) pass alone on main and on the merge. They failed earlier only when the web and control-plane suites ran at the same time. This time the suites ran one after the other.

## 4. Full suites on the merge commit

The suites ran one after the other on one machine: the merge commit (tree d84f0df2e) first, then `rabbit-hole/main` 5f29c23a6.

| Suite | Tests | Pass | Fail | Failures |
|---|---|---|---|---|
| Web unit, merge | 7189 | 7158 | 3 | the same 3 as main |
| Web unit, main 5f29c23a6 | 7069 | 7038 | 3 | `render-freshness` (committed static renders' fingerprints); `motion-ownership` mutation proof; tutor-diagrams `figure-layout` (small forces) |
| Control plane, merge | 4777 | 4774 | 2 | `explain-program-budget` (also on main); M3 (`explain-m3.test.js`), a load flake that passes alone 3 of 3 times (25/25 each) |
| Control plane, main 5f29c23a6 | 4632 | 4630 | 1 | `explain-program-budget.test.js:69` |

- **Nothing fails on the merge that does not fail on main**, apart from the M3 load flake.
- Of the Reviewer's three explain tests, `explain-heat-grid` and `explanation-gemini-illustration-bundles` now pass on main 5f29c23a6 and on the merge; the 150-explain release fixed them. `explain-program-budget` still fails on both, so it is pre-existing.
- The two animation runtime tests pass in both full runs.
- The earlier merge-only failures (the board-links annotation scan and the no-ellipsis check) were fixed in a4f51d707.

## 5. Production bundle (built with the flag) and workers

The build used `scripts/prod-release.mjs`'s own `BUILD_ENV`: `VITE_REHEARSAL_TRIGGER=1`, the dev-only variables stripped, both `dist` and `dist-dev`. It had no `VITE_TLDRAW_LICENSE_KEY`; its value is in the `.env` file, which I do not read, and it only affects tldraw's licence notice.

- **`EXPECT_ANALYTICS=1 node e2e/production-bundle-check.mjs`: PASS.** The output was "ok: the production build ships the Learn app and no dev-only tools; usage analytics configured".
  - Chunks shipped: `RunCard`, `TutorRehearsal`, `CodeExplainCard` and `code-explain-insert` (the last two dark).
  - None of these appears in any shipped file: "Make section", `REHEARSAL_PIN_COMMIT`, `__voiceFake`, "Review fixtures are on", and any `fixture` or `window.__` seam in the TutorRehearsal and RunCard chunks.
  - There is no spacing toggle yet.
- **Workers:** `wrangler deploy --dry-run --config wrangler.rabbit-hole-prod.jsonc` passed for both.
  - `rabbit-hole-app`: 10059.18 KiB, gzip 2547.73 KiB. The bound vars show `CODE_EXPLAIN_ENABLED "false"`, `COMPUTE_MONTHLY_ALLOWANCE_USD "10"`, `COMPUTE_RATE_CPU_CORE_SEC_MICROS "39.42"` and `COMPUTE_RATE_MEM_GIB_SEC_MICROS "6.67"`.
  - The app bundle exports `AnimationJobs`, `CadJobs`, `ExplainJobs`, `FileJobs`, `ImageJobs`, `LearnScenes`, `LearnVideos`, `RepositoryImports`, `RepositoryRehearsals`, `RoadmapJobs` and `WhiteboardJobs`.
  - `rabbit-hole-cp`: 5112.14 KiB, gzip 1216.61 KiB. No pdf.js is in either bundle.

## Backend (owner decision (a), 14:05): the rehearsal backend in production

**1. Controller (Fly).**
- App `rabbit-hole-rehearsal-prod` (org `rabbit-hole`, region iad), deployed from `packages/rehearsal-runtime` with the new `Dockerfile` and `fly.prod.toml`.
  - One shared-cpu machine with 1 GB, auto-stop, and the `/health` check. Python 3.13; requirements as pinned.
  - URL: https://rabbit-hole-rehearsal-prod.fly.dev. `/health` answers `{"ok": true}`, and an unauthenticated `/sessions/x` answers 401.
- Secrets on the app: `ANTHROPIC_API_KEY`, `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, taken by name from the credentials file, never printed. Plus a fresh `REHEARSAL_WORKER_TOKEN`, the production bearer: never printed, kept outside every repository at `C:/s/spec/prod-secrets/rehearsal-token-prod.txt`.
- No R2 credentials: the worker writes the records itself.

**2. Worker (`rabbit-hole-app`).**
- The secrets `REHEARSAL_WORKER_URL` (the Fly URL) and `REHEARSAL_WORKER_TOKEN` were set with `wrangler secret put` on the live production worker.
  - That makes a new version of the code already serving. After it, the signed-out smoke still answered `/` 200, `/api/me` 401 and `/a/x` 404.
  - The secrets are unused until the release, because the code serving now has no rehearsal routes.
- `wrangler.rabbit-hole-prod.jsonc` now binds `REPOSITORY_REHEARSALS` to `RepositoryRehearsals`, with the class migration `repository-rehearsals-1` (`new_sqlite_classes`, additive).
  - These land with the release deploy. A dry-run lists `env.REPOSITORY_REHEARSALS (RepositoryRehearsals)`.
  - Records go to `REPOSITORY_SNAPSHOTS` (`rabbit-hole-prod-repositories`) under `learn-repositories-dev/<app>/<commit>/`, the key shape dev uses.

**3. Smoke, 2026-11-16 at 14:14 PT** (`backend-smoke.json`).
- **Where it ran:** the production worker cannot run this before the release, because the binding and the rehearsal code ship with the release deploy. So the smoke ran the same worker code (this branch, on 8878) against the **production controller** with the production bearer, and without `REHEARSAL_PIN_COMMIT`, as in production.
  - The records went to the owner stack's local R2, not to the production bucket.
  - After the release, the owner's signed-in check repeats steps b to e from `digrabbithole.com`.
- **What it did,** on a throwaway canvas:
  - a. Imported nanoGPT at the branch head (`master`, which resolved to 3adf61e).
  - b. Catalogue: ready in 25 s, with 2 practical routes (`benchmark_training_step`, `shakespeare_char_cpu`).
  - c. Rehearsal `shakespeare_char_cpu`: ready in 151 s. `prepare_data` exit 0 (0.8 s), `train_cpu` exit 0 (89.7 s), `sample_text` exit 0 (11.4 s); `allChecksPassed` true. Taken as evidence only.
  - d. A Run card session started, and step 1 (`prepare_data`) ran: done, exit 0, 0.3 s.
  - e. Stop: the session ended `stopped`.
  - f. The canvas was deleted: `DELETE /api/apps/canvas-cbe23b6f` answered 200, and a GET then answered 404. The imported project `repo-1962f08f-nanogpt` remains.
- **Costs:**
  - model US$0.088034 (the record's `modelSpendUsd`);
  - compute: the rehearsal is 2 units (about US$0.02 at 1 unit = US$0.01) and the session 0 units, for 1 minute;
  - Modal's billing report did not yet show the job;
  - the Fly machine runs only while it is used.
- 8878 was switched back to the local controller afterwards.

## 6. Migrations (Learn D1, `rabbit-hole-learn-prod`): the owner applies

The release preflight requires the production Learn schema to equal `repository-schema.sql` plus every learn migration (`docs/features/prod-release.md`). This merge adds two tables, so **0045 and then 0046 must be applied before the release.** The bookmark comes first:

```
cd packages/control-plane && npx wrangler d1 time-travel info rabbit-hole-learn-prod --config wrangler.rabbit-hole-prod.jsonc
cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file learn-migrations/0045-compute-usage.sql -y
cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --file learn-migrations/0046-learn-sections.sql -y
```

| Order | Migration | Adds |
|---|---|---|
| (Document card) | none | The Document card is a canvas block (canvas JSON); no table. |
| 1 | `0045-compute-usage.sql` | `compute_entries`, index `compute_entries_user_period` |
| 2 | `0046-learn-sections.sql` | `learn_sections` (`purgeTutorRows` deletes its rows only where the table exists) |

Production was last read as identical through 0035 (5 November). 0036 to 0044 are assumed applied, because releases from main since then passed the identity preflight. The release preflight confirms this.

## 7. Rollback

- **Move the rollback branch to current main before the push** (the owner's command). It is now at 18cf9fce8, behind main:

  ```
  git push rabbit-hole 5f29c23a6a3c5cc40b8bc813a53d517d854c3e79:refs/heads/rollback/pre-rehearsal-merge --force
  ```
- **Code:** reset main to `rollback/pre-rehearsal-merge`, or `git revert -m 1 <merge sha>`, then release.
- **Workers:** from each package, `npx wrangler rollback <version from the receipt's previous pair> --config wrangler.rabbit-hole-prod.jsonc`, the app first, then the control plane.
- **Rehearsal backend:** run `cd packages/web && npx wrangler secret delete REHEARSAL_WORKER_URL --config wrangler.rabbit-hole-prod.jsonc` (and the same for `REHEARSAL_WORKER_TOKEN`). Stop the controller with `flyctl scale count 0 -a rabbit-hole-rehearsal-prod`; the app and its secrets stay, for a later retry. The binding and class migration are additive and stay in the config: a Durable Object class migration is not removed.
- **D1:** roll back in reverse order. The data in those tables is lost.

  ```
  cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "DROP TABLE IF EXISTS learn_sections" -y
  cd packages/control-plane && npx wrangler d1 execute rabbit-hole-learn-prod --remote --config wrangler.rabbit-hole-prod.jsonc --command "DROP INDEX IF EXISTS compute_entries_user_period; DROP TABLE IF EXISTS compute_entries" -y
  ```

  Or the whole database, back to the bookmark from section 6 (destructive, an owner GO every time):

  ```
  cd packages/control-plane && npx wrangler d1 time-travel restore rabbit-hole-learn-prod --bookmark <bookmark> --config wrangler.rabbit-hole-prod.jsonc
  ```

  After a code rollback, drop the two tables too. Otherwise the identity preflight refuses the next release from the old code.

## 8. SHAs

- Main: `rabbit-hole/main` 5f29c23a6 (5f29c23a6a3c5cc40b8bc813a53d517d854c3e79).
- `rehearsal/sections` tip: the commit that adds this version of the file.
- Code tested by the suites and the bundle check: d84f0df2e (merge 3794eeced).
- Since then, 6ff495fa7 adds only the controller's `Dockerfile`, `.dockerignore` and `fly.prod.toml`, the production binding and class migration (checked by the dry-run above), and BLOCKERS; this commit adds only documentation.
- Local `main` merge commit: one `--no-ff` merge of the tip onto 5f29c23a6. Its SHA is given with this report.
- Nothing is pushed to main. Order from here: the owner reads this file, then the migrations (section 6), the rollback-branch move (section 7), the push, and the `!` command.
