# Cleanup P6a (journey joins off) release candidate note

Branch `feat/tutor-cleanup-p6a` (MVP fast path, owner label 2026-11-05). Based on `d870aef1f9511c54f8cab2ba13b92dfbe79542d1` (P5 live), not on the R4 candidate. Code only: **no migration, no database operation, no schema change**; the six tables still exist and are untouched.

## Precondition (per environment, enforced by the launcher, not by this branch)

P4 live, then the archive backfill run and verified (`verify` = 0) with a receipt; `scripts\learn-retire-tutor.cmd <env> gate` prints `RESULT OK gate <env>` immediately before this is released there. Without it archived journeys' goals reopen (v0.5 risk 12). Runbook: `p6-db-runbook.md`.

## What P6a removed or changed

* `learn-coaching-store.js`: the `LEFT JOIN learning_journeys` reads and `journey_archived_at` (`readCoachingState`, `ownGoal`, `goalStatus`), the `ensureState` seeding from the board's live journey (now inserts a row with no active goal), `switchGoal` (the park/unpark/seed statements and their bind order), `delete_goal`'s journey `UPDATE`, and the three SQL builders `goalForJourneySql`, `parkJourneySql`, `unparkJourneySql`. A goal's lifecycle is its own column.
* `learn-attempt-store.js`: `ownActivity` no longer joins the journey; `acceptAttempt` refuses on `lifecycle !== 'open'` only.
* Tests: `test/learn-journey-rows.js` deleted; `learn-attempt-fixture.js` (`journeyActivity` keeps its name, makes the goal with `create_goal`), `learn-coaching-store.test.js` (journey cases rewritten onto goals; legacy goal rows are seeded as plain `learn_goals` rows), `learn-goal-management.test.js`, `shared-rabbit-hole.test.js` (no longer selects `learning_journeys`), `shared-canvas-privacy.test.js` (journey tables dropped from its seed list). New: `learn-goal-archive-backfill.test.js` (the v0.5 section 10 regression check in its post-removal form).
* New owner tooling: `scripts/learn-retire-tutor-data.mjs` (prints the `count`, `backfill`, `verify` SQL), `scripts/learn-retire-tutor-runner.mjs` and `scripts/learn-retire-tutor.cmd` (per-environment launcher), their test with an enforced-isolation case. The `retire` mode is on the P6b branch.
* `scripts/ci/check-map.json`, Push B for P2-P5: 47 `none` entries and their reasons for files the cleanup deleted, four `none` globs that match nothing (`public/audio/**`, `learn-tutor-*.js`, `learn-journey*.js`, `learn-grade*.js` under `packages/web/src`), and ten `checks` entries whose files are gone (`tutor-loop`, `grade-shadow`, `journey`, `journey-switch`, `nanogpt-audio`, `nanogpt-board`, `toc-plan`, `tutor-entry`, `tutor-image-context`, `tutor-slice`; all were `windows-only`). No mapped row names any of them; the area-threshold test is unaffected (no Linux check removed).

## Not done here (outside P6a in v0.5)

* The `packages/web/src/nanogpt/` card directory, its demo-scenes boards and the four checks that drive board `nanogpt-deep-dive` stay held (P4 note); the roughly 100 `nanogpt/*` check-map rows stay with them.
* `progress-chat-check.mjs` and `toc-cap-check.mjs` stay marked `ponytail: STALE` (`windows-only`). v0.5 lists `progress-chat-check.mjs` as a P6a owner-run check, but it cannot pass until it has a retained offline assessor; P6a is therefore released on `tutor-progress-check.mjs` plus the unit suites, and the stale check is reported, not run.
* `learn-usage.js` dead route strings for `/api/learn/assess` and `/api/learn/grade*` (P5 Push B) are Lead-owned.

## Interfaces R-lanes rely on

Unchanged: `readCoachingState` / `applyCoachingAction` shape (the goal list still carries `journeyId`, null for new goals), `ownActivity`'s other columns, attempts routes, Next Steps. `journey_id` is still stored on old goals.

## Recovery

`feat/tutor-cleanup-p6a-recovery`: one commit reverting P6a, tree equal to `d870aef1f`. It restores code that joins `learning_journeys`, so it is valid **only while the six tables exist**; the P6b window launcher deletes it from `rabbit-hole` when the window opens (v0.5 9, P6a). Using it needs no backfill rerun: the backfill only moves goals toward archived, so the restored join agrees with the column.
