# Release 137: preliminary stacked rebase onto the 136 candidate (coordinator request)

Branch `explain/video-release-137-stacked` (pushed) at `04079665378b8bb665626c91bab5cceccf14ac03`, rebased from `explain/video-release-137` (e306bc4e4) onto `release/explain-136` = ee9966384ca8c2127ee0b8e6c4ff378089c76ec7 (chain: main a8ef11d64 <- 134 bbd2c581b <- 135 2a31d4d7b <- 136).
The FINAL base for 137 is 136b's candidate (coordinator will send `BASE = <sha>`); the re-rebase should be trivial (136b adds data files only).

## Rebase: 7 commits replayed, 0 conflicts
| now | was | what |
|---|---|---|
| 3aaf7604a | 45659cc3e | CV-4 markdown anchor |
| e252e166f | 98497fb62 | UX-1 first version (kept: the shared-toolbar commit does not apply without it) |
| b03c1d340 | 50c2eb4b0 | UX-1 shared four-button toolbar |
| 1144c6719 | 4a61bd900 | UX-1 tests |
| a0b0d5762 | d32f11eb8 | UX-2 place-near |
| e1bee4a4d | 6cce634cc | UX-3 Ask in chat |
| 040796653 | e306bc4e4 | guard in inline-highlight.test.mjs + check-map row for place-near.js |
136's changes to tutor-diagrams data, snapshots and check-map, and its larger `git ls-files` buffer in scripts/ci/check-map.test.mjs, did not touch any file of this stack: my place-near check-map row survived (`scripts/ci/check-map.json` line 1242) and `check-map.test.mjs` passes 22/22 on the stacked tip.

## Single small test files re-run on the stacked tip (one at a time, no lock, no suites)
All pass: beside-placement 12, place-near 3, selection-toolbar 4, selection-explain 8, explanation-card-interactions 26, inline-highlight 25, webcard 14, answer-destination 13, canvas-equation 12, card-icons 6, card-rename-render 5, card-selection 13, code-refs 3, content-gestures 6, context-docs 6, explanation-highlight-v2 4, file-doc-highlights 10, learn-ask-target 9, map-files 8, project-ui 21, slash-preview-header 3, slash-sheet 17, toc-conversation 6, explanation-card-width 9, explanation-full-length 7; scripts/ci/check-map.test.mjs 22/22.

## Diff against 136's candidate: 17 files, all inside the 137 scope
packages/web/src (AdaptiveCanvas.jsx, ExplanationInteractions.jsx, FileDocMarkdown.jsx, WebpageCard.jsx, ask.jsx, selection-toolbar.jsx, place-near.js and their tests), packages/web/e2e/source-ref-command-check.mjs, docs/features/explain.md, scripts/ci/check-map.json. No control-plane, no tutor-diagrams, no snapshot, no wrangler file.

## Scripts prepared (not run)
`C:/s/spec/release-queue/gate137.sh` (BASE_SHA + BASE_TREE env; steps ci, scripts, tutor-diagrams, figure-briefs, FULL web unit, build, props, replay; control-plane skipped because the diff has no server file; heavy lock name r137 taken inside each step) and `prep137.sh` (MAINWANT env = the final BASE; scope filter = packages/web/src js/jsx/mjs, packages/web/e2e mjs, docs/features/explain.md, scripts/ci/check-map.json; refuses a control-plane change; pushes release/explain-137 + rollback; pins MAIN_PREV = MAINWANT). Both pass `bash -n`. At gate time: `git -C /c/s/explain-137 checkout -B release/explain-137` at the final stacked tip before `prep137.sh finish`.

## Still to do on BASE (gate phase)
re-rebase onto 136b, FULL web gate under the lock, toolbar before/after screenshots (explanation, markdown, web page; PDF unchanged) on a local stack, reports to release/evidence gates/137/, prep + finish + MVP record (make-preview-137.cjs), the four owner commands.
