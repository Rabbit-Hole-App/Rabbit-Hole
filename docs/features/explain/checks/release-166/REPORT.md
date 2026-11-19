# Release 166 (kinds-fit-checks): renderer fixes, card checks, kindLimits, inline fractions: report

Release SHA (full): ab40f5dc9b561fb8923991e405b3dc84f303dc59 (branch feat/release-166 = main a42d5e0f1 (release 165) plus eight merges and one test fix; main is an ancestor: a fast-forward).
Recovery branch: recovery/kinds-fit-checks-166, tip c58c95fa97666856ee4c9bdb0354704246cba753 (one commit holding main's tree on top of the release SHA).
Clone: https://rabbit-hole-web-dev-r166-int.tryrabbithole.workers.dev (build 40d7b02e4961; MVP record 0b5c0e3795c04234; GET /library serves /static/app-BD--x8CF.js; broad CI and the release gate recorded as bypassed; refs/notes/dev-deploys not pushed).
Launcher (not handed to the owner before the Reviewer's GO): C:\s\spec\release-queue\release-166-kinds-fit-checks.cmd (pins 166-kinds-fit-checks.pins; preview-166-kinds-fit-checks.mjs; worktree C:/s/r166-int, clean at the SHA).
Preview history: the first preview run stopped on one failing test after the merge: the kindLimits test expected exactly six fitted kinds, but kinds-fit r4 added layers and tensor to FITTED_KINDS. The test now checks that the six it covers are still fitted and that every fitted kind has a table entry (82 of 82); commit ab40f5dc9; recovery branch and queue files were recreated on that SHA; the second run passed.

## Contents (merge order; branch tips in brackets)
- 6a0d6dc3b merge of feat/lbl-1 (95fe1a2fe): kinds-fit r4 fixes c12e79037 (min.parts never negative; frame:false crops 11 px per side, flow 13, tensor 5, so first and last blocks keep their full stroke), TOK-0 b356b7ed5 (token-links draws no arrow at weight 0; no library reference has a zero-weight link), LBL-1 (i) 55a34edb5 (a negative bar's value label no longer sits on its category name), (ii) 7a2fdfb1c + revision 2809a265a (if any value label would sit on a taller neighbouring bar, ALL value labels in the chart lose the unit and the unit is printed once after the top axis number, e.g. "60 %"; measured with the legend Arial table), (iii) e63e4e260 (a series name avoids the printed value labels).
- dbc863e9a merge of feat/samp-2 (e850e57ef): an out-of-bag sample group reads "N not drawn" with no "x n" (the spec's `outOfBagFor` field already existed; no schema change).
- c85b10031 merge of feat/tick-1 (c1152803b): integer axes tick at 1, 2 or 5 times a power of ten (0 to 20 prints 0, 5, 10, 15, 20; the old code doubled 3, 6, 12 and printed 0, 12, 20).
- d8a1baa02 merge of feat/num-3d (9c19d0aef): the softmax word test also takes "exponentiate and divide by the sum" spellings and the written sigma formula; SOFT-T: `T = <number>` on a label is computed and checked. Report: checks/num-3/LANE3-QUEUE-3-REPORT.md.
- d905ac157 merge of feat/secret-1 (92808e55f): FISH_AUDIO_API_KEY removed from the required list at scripts/prod-release.mjs:31.
- 60df5d27d merge of feat/kind-limits (a740c1786; 80ecac19e + a740c1786): the read-only table `kindLimits(kind)` (and `shownLength` exported from spec.js, the text() registry). Report: checks/kind-limits/KIND-LIMITS-REPORT.md.
- 69e159fc4 merge of feat/frac-1 (9fe11e26f; 313b7034a + the polish): a top-level inline fraction in card prose reads a/b, a single function-call argument gets no extra brackets (`(b - a)/\max(a, b)`). Report: checks/frac-1/FRAC-1-REPORT.md.
- 62ac98407 merge of feat/novis-1 (58da066fb; d87a1e398 + 58da066fb): a plan that names a diagram and a picture-only body is explanation_missing_visual (the repair runs); a `k:'spec'` visual that carries a spec object is read as a diagram. NOVIS-1 (b) was dropped by the Reviewer.
- ab40f5dc9: the kindLimits test fix above.
Not in 166: BOX-1 (third measurement read pending), R3, STK-1, REL-1 (own branch), the SAMP-2 pill nit ("ginger x 1" touches the pill edge: not done).

## Changed snapshot ids by fix (46 ids, counted in svg-snapshots.json: 46 sha256 and 5 height lines changed against release 165)
- LBL-1 (i), 5 ids: permutation-feature-importance /320 /408 /720; ml-transformer-vocabulary-softmax /960; ml-transformer-vocabulary-softmax-detailed /960 (the 5 height changes: those cards are taller).
- LBL-1 (ii) revised, 2 ids: ml-sampling-top-k /320 /408 (ml-label-prior-drift-comparison no longer changes with the Arial measure).
- LBL-1 (iii), 27 ids: clustering-elbow-silhouette /720; clustering-inertia-elbow /320 /408 /720; d2l-cnn-loss-and-accuracy-detail and -detailed-detail /408 /960 /natural; ml-differencing-transformation /320 /408 /720; ml-linear-regression-feature-scaling-overlay /320 /408 /720; ml-logistic-regression-sigmoid-shape /720; ml-model-evaluation-schedule-run-diagnostics /720; ml-model-evaluation-training-diagnostics /720; ml-trees-forest-size-accuracy, -brief, -detailed /960; persistent-drift-alerts /320 /408 /720; svm-hinge-loss /320 /408.
- TICK-1, 9 ids: ml-trees-bootstrap-coverage, -brief, -detailed each at /408 /960 /natural.
- SAMP-2, 3 ids: bootstrap-replacement-oob /320 /408 /720.
TOK-0, kinds-fit r4 and the checks change no snapshot id.
Renders (before and after, headless Chrome): checks/kinds-fit/r4/images/ (tok-0, lbl-1 incl. ii-revised-before/after of ml-sampling-top-k at 408, samp-2, tick-1) and checks/frac-1/.

## Hashes and replay, recomputed once on the assembled tree against release 165
Request hashes (hashes.mjs: Gemini schema, author body, Gemini request, Fireworks request per library reference): 492 keys before and after, 0 moved. 474-row planner replay: identical. kindLimits adds no schema or limit change (z.toJSONSchema byte-identical, checked in its lane). Max Gemini properties 350.

## Tests (the preview's own runs; one process per suite)
Affected-test runs 783, 73 and 721 tests, 0 fail; the smoke (30 test files: the release-165 smoke plus kind-limits, label-collisions, kinds-fit, plot-lines, inline-fractions, explanation-novis) 0 fail; 38 of 38 explain-program render checks. Lane runs: tutor-diagrams directory + theme 1464 (lbl-1), 1465 (tick-1), 1494 (kind-limits); full web unit run on frac-1: 7420 tests, 0 fail.

## Bundle (wrangler dry-run, prod config; Total Upload)
Release 165: 9155.78 KiB / gzip 2319.41. This candidate: 9157.86 KiB / gzip 2320.11: +2.08 KiB (+0.70 gzip). kind-limits.js is not imported by the worker.

## Startup
NOT QUIET and no figure: four alternating six-run sessions of the 165 bundle against the 166 bundle ran at 59 to 100 % CPU (other lanes' stacks on 8878, 8879 and 8880 were starting). True medians (active ms; mean of the two middle runs): 165 198.5 against 166 251.5 (CPU about 59 %); swapped order: 166 154.5 against 165 137.5 (CPU about 59 %); two later sessions at 63 to 100 % CPU gave 416.5 and 484.5 for one pair. The sign flips with the order, so: no measurable difference at best, nothing more can be said. The bundle grows 2 KiB and no startup-time module was touched. I will re-measure when the machine is quiet if you want a figure.

## Open questions and notes
- Plain-text formula fallback in the bootstrap-coverage caption ("(1 - 1/n)n" with the exponent flattened): whether a learner can ever see it is NOT yet answered (read-only code read pending).
- Glyph in "A . d=2" (ml-bayesian-acquisition-choice): the reference holds a middle dot (U+00B7) before KaTeX d=2; the square is the sheet's fallback font; the real app font check is pending (needs the app open on 8878).
- Known leftovers: the "Δy" collision in ml-differencing-transformation's second panel; a short bar label near a neighbour's category name; STK-1 (cause read at block-stack-layout.js:374-380).
- After the release: owner looks at the fitted pictures (bar charts with negative values, token-links causal mask, grouped bars with units, an out-of-bag bootstrap card, an integer axis) and one card with an inline fraction.
