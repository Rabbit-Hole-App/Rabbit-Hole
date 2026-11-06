# Cleanup P5 (duplicate grading off) release note

Stacked release candidate `feat/tutor-p5-release` (MVP fast path, owner label 2026-11-05). Code only: no migration, no database operation.

- Stacked on: R4 release tip `d692444ec2dc017f1d30d05627ca04f055f82b46` (`feat/tutor-r4-release`), on R2 `e44aa04f00147d58e578e4d890dd1738b8e9e6ca`, P4 `cdac8cfc534614d98388695e8a2ff8e9a4138e31`, P3 `0c322bd50eed1bed9bef09cb5826f51ff565ced4`, R3 `4b754b6c2b36a41dc651ed4c2608ca239668d656`, R1 `15141c05a931e082aaa2e59693d288a421d73938`, cleanup P2 `409f4e8f3e4638bcc4b0477a2d2a26041ab40ec3`, main `9b798f7760b7af5aa2446d281a07eebfc4e10b84`. P2, R1, R3, P3, P4, R2 and R4 must be released first; this branch then fast-forwards from the released R4 tip.
- P5 came in as three cherry-picks from `feat/tutor-cleanup-p5` (`5efed411c`, `f524afb25`, `50ada944f`, built over the old P2 tip `cdeb77274`). Conflicts were in `learn-models.js`, `learn-models.test.js`, `dev-worker.js`, `LearnPage.jsx`, `check-map.json` and `run-part.sh`; each was resolved by keeping this chain's version and re-applying P5's hunks (the R1-R4 mounts, the six roadmap roles and the P3/P4 deletions are intact; the diff against the R4 tip is the builder's same 50 files, 41 insertions, 17316 deletions).

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

`feat/tutor-p5-release-recovery`: one forward commit reverting P5's three commits (restores the grade routes, modules, mounts and tests). Safe because `learn_grades` is untouched.

## check-map Push B (follow-up, not in this release)

Drop the five P5 `none` rows and reasons; keep the `grade-shadow-check.mjs` `checks` entry until the check list is pruned; remove the dead `/api/learn/assess`, `/api/learn/grade*` strings and the `assess`/`grade` features from `learn-usage.js` and `learn-usage.test.js`; drop the P2, P3 and P4 `none` rows the same way.
