# Cleanup P3 (Server Tutor off) release candidate note

Stacked release candidate `feat/tutor-p3-release` (MVP fast path, owner label 2026-11-05).

- Stacked on: R3 release tip `4b754b6c2b36a41dc651ed4c2608ca239668d656` (`feat/tutor-r3-release`), on R1 release tip `15141c05a931e082aaa2e59693d288a421d73938`, on cleanup P2 tip `409f4e8f3e4638bcc4b0477a2d2a26041ab40ec3`. **P2, then R1, then R3, must be released to main first**; this branch then fast-forwards from the released R3.
- P3 builder branch `feat/tutor-cleanup-p3` (`f24e7dd7f`, `51368ee67`, built over the old P2 tip `cdeb77274`) was cherry-picked here with no conflicts.
- Removed: the Tutor planner route (`/api/learn/tutor/plan`, `evaluate`, `handoff`), escalation, handoff, the evaluation archive and its routes (`/api/learn/tutor-eval`), the Tutor telemetry route (`/api/telemetry/tutor`), the avatar modules, their tests, and the two avatar evals. `learn-tutor-routes.js`, `agents/learn-tutor.js`, `learn-tutor-escalation.js`, `learn-tutor-handoff.js`, `telemetry-tutor-route.js`, `tutor-eval-archive.js`, `tutor-eval-routes.js`, `learn-avatar-*` are gone from source; the ten source rows in `scripts/ci/check-map.json` are moved to `none` with `noneReasons` (Push A).
- Renamed: the attempts usage feature `tutor_evaluate` is now `attempt_assessment` (still free). Rows already written keep the old name; the recovery branch accepts both.
- Learner-visible: the Settings "Learning analytics" notice copy is trimmed (`RabbitHoleSettings.jsx`).
- Interfaces R1 and R3 rely on that still exist and are mounted after P3 (verified by grep and by their own tests): `card-feedback-routes.js` mount `/api/learn/card-feedback`; `source-refs.js` route mount in `packages/web/dev-worker.js`; `explain-job.js` (`explainRoute`, `ExplainJobs`); `learn-artifact.js` (`artifactFetch`); `learn-boards.js` (`saveOwn`); `shared-privacy.js`; `learn-next-steps-routes.js` mount (`ownedNextStepsRoute`); attempts mount `/api/learn/tutor/attempts`.
- Migration: none. Code-only; no production database change.
- Pending (P3 Push B, later): remove the ten `none` rows and `noneReasons` for the deleted sources from `scripts/ci/check-map.json` once this lands on main; strip the remaining dead `/api/learn/tutor/plan|evaluate` stubs in the other e2e checks.
- Recovery branch: `feat/tutor-p3-release-recovery` (strict descendant; one commit reverting P3's main commit, except `learn-usage.js` accepts both `tutor_evaluate` and `attempt_assessment` as free).
