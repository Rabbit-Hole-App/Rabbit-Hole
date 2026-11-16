# theme-ship: the visual sprint, release readiness (feat/visual-sprint, state at 4f4e99b56)

Status: NOT releasable yet. The affected-tests selection (110 files, 3 uncovered, `packages/web`) runs 1665 tests: 1649 pass, 14 fail, 2 skipped. `reference-linter.test.mjs` runs and passes (js-tiktoken installed with `npm ci` in `scripts/topic-pipeline`; the root workspaces installed with `npm ci`; no junctions). Both `vite build` runs exited 0 earlier in the session (before the test-only commits).

Commits on top of main 18cf9fce8: the 13 sprint commits, then
- b036c77da theme pins (pushed first, as asked),
- 231a75946 fix 1 of 3: geometry lint, the shared fork drop (diff in `fix1-geometry-lint.diff`; before/after renders at 408 in `lint-fork-before.png` / `lint-fork-after.png`: the picture is identical, the lint output changes from one violation, "b: parallel wires 0 px apart over 18.5 px near (204, 297.3); the minimum is 6 px", to none; `flow-lanes.test.mjs` and `geometry-lint.test.mjs` pass),
- 4f4e99b56 the test rewrites (56 expectations, tests only, one commit; the list is `affected-tests.md`).

Fix 2 (histogram y-title): no code change. The title is a rotated "Count" at x 22 and fits (`histogram-title-408.png`); the test measured its un-rotated width. The test now measures a rotated title by its line height around the rotation centre (in the test commit).

Fix 3 (flow minimum width settled at 180): no code change; `NODE_MIN` is 180 and the flow's natural width is 406. The explanation-diagram test's 320-px scroll window moved from 400 to 408 (the narrowest card content, CV-1); see `flow-min-width-408.png`. The same two tests then fail on a coordinate-plot (below).

## The 14 tests left failing (no old-behaviour reason fits; details one line each in affected-tests.md)
1. flow.test: three labelled arrivals cross at 408 (house:dies and senate:dies): a possible routing defect from the new fork and node sizes.
2. ml-plot: very narrow log domains: the min label (start-anchored) overlaps the "Midpoint" label (my sampled-tick merge compares centres, not anchors).
3. ml-plot: stacked baselines: the single continuous zero baseline now runs through the value notes.
4-5. interact-style (2): success is teal-dark #3A7E69 under the #32211c ink, 3.19:1, below the 4.5:1 check.
6-7. frame-look (2): my "an id names a kind only when it is exactly one word" also rejects the sdk's own vector ids (vec.v, vec.a, vec.F, tossedVelocity): a regression.
8. TutorDiagram: the minimized Gemma diagram's nested flow is 598 px wide at card widths 360 to 440 (scrolls), 418 at 320.
9. block-stack and 10-11. illustration-integration: 36 px tensor cells make the 6x4 token row 1110 px, over the 960 px maximum; and the deep Gemma stack is 418 wide at a 320 request.
12. ml-data: the 15 px formula overflows its matrix cell by 8 px each side.
13-14. explanation-diagram (2): a plain coordinate-plot at a 320 request is 420 wide (the themed plot layout's minimum), over the 408 px narrowest card content.

## Product surfaces that render a tutor diagram narrower than 406 px (a ticket after the release)
Read-only grep of the consumers of the renderer: (a) program frame figures: `explain-program/FrameFigures.jsx` calls `renderTutorDiagram(spec, box.w)` with the width the program gives the figure, with no 406 floor; (b) the minimized explanation tile, `LearningBlocks.jsx` line 2107 (`<TutorDiagram>` inside `data-explanation-tile`, which has 16 px side padding): at the 440 px card minimum its content is 408, only 2 px above the flow minimum, and the nested Gemma flow already scrolls there (item 8). Written cards (`Md.jsx` fences) are clamped 440 to 720 with a 408 minimum visual width.

## Not done
Recovery branch, preview, MVP record and the whole-library sheets at 408 and 720: they depend on the final SHA, and the release is blocked on the 14 tests. The sheet generator is ready (494 figures, 25 sheets, no render errors).
