# Cleanup P5 (duplicate grading off) release note

Stacked release candidate `feat/tutor-p5-release-3` (MVP fast path, owner label 2026-11-05). Code only: no migration, no database operation. Re-based directly on main (the R2 release) and not on R4, so it carries no roadmap migration (0039), `ROADMAP_JOBS` binding or roadmap contract.

- Stacked on: main `d2428e357fd40416b2ca83ec0ab6a7bfc3c203f2` (the R2 release, live in production). R4 is not in this branch.
- P5 came in as five cherry-picks from `feat/tutor-p5-release-2` (`20f5ae5fa`, `104836384`, `039870031`, `5e7938c15`, `8ed4cb20e`). Conflicts were in `LearnPage.jsx` (kept main's `NextStepsHost` line, dropped `onGrade`) and `check-map.json` (kept main's jev row, dropped the three grade rows); R4-only additions (`roadmap.active`, `roadmap-money.test.js`) are not present.

## What P5 removed or changed

- Web: `learn-grade.js`, `learn-grade-shadow.js`, `learn-grade-prompts.js`, `learn-grade-shadow.test.mjs`, `e2e/grade-shadow-check.mjs`. Control plane: `learn-grade-routes.js`, `learn-grade-store.js`, `learn-grade-report.js`, `agents/learn-grade.js` and their five tests (`learn-assess`, `learn-assess-sketch`, `learn-grade-report`, `learn-grade-routes`, `learn-grade-store`). Evals: `tests/evals/learn-grade/` and `tests/evals/explain-back-sketch.mjs` (the fixtures directory stays: `explain-sketch.test.mjs` reads it).
- `learn-models.js`: the `grading` task row (and its comment) is gone. `dev-worker.js`: the `/api/learn/assess` and `/api/learn/grade*` mounts and the grade-route import are gone. `run.sh`: the `learn-grade` eval line is gone. `credits-meter-check` seeds a `render` charge instead of `grade`.
- `check-map.json` Push A: five rows (`web/src/learn-grade*.js`, `agents/learn-grade.js`, `learn-grade-report.js`, `-routes.js`, `-store.js`) moved to `none` with reasons; `grade-shadow-check.mjs` is stripped from every row, its `checks` entry is kept; its `PORT` row is gone from `run-part.sh`.

## Retained interfaces P5 touches

- `stripVerdict` now lives in `explain-back-view.js` (`LearningBlocks.jsx`, `learn-challenge.test.mjs` and `explain-sketch.test.mjs` import it from there); nothing in the web bundle imports `agents/learn-grade.js`.
- `LearnPage.jsx` no longer calls `/api/learn/assess`: no `onGrade` prop is passed to `AdaptiveCanvas`, and `graded` (the Professor Next Steps basis count) is the constant `0`. `LearningBlocks.jsx` still accepts an absent `onGrade` (the answer is saved, no verdict is requested).
- The `grading` model task no longer exists; `learn-usage.js` route classification for `/api/learn/assess` and `/api/learn/grade*` is left as it was (dead strings, Push B).
- `learn-grade-jev.js` (the Jev transport and `sha256Hex`, imported widely) and `test/learn-grade-fixture.js` stay.
- Learner-visible: a legacy Challenge card on a canvas where the durable attempt store is off saves the answer and shows no tutor verdict.

## Data and migration

None. The `learn_grades` table is untouched and stays until the owner script in P6b drops it; nothing reads or writes it after this release.

## Recovery

`feat/tutor-p5-release-3-recovery`: one forward commit reverting P5's commits (tree identical to `d2428e357`). Safe because `learn_grades` is untouched.

## check-map Push B (follow-up, not in this release)

Drop the five P5 `none` rows and reasons; keep the `grade-shadow-check.mjs` `checks` entry until the check list is pruned; remove the dead `/api/learn/assess`, `/api/learn/grade*` strings and the `assess`/`grade` features from `learn-usage.js` and `learn-usage.test.js`; drop the P2, P3 and P4 `none` rows the same way.
