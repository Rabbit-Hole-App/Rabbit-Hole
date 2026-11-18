# VAR-1 step 4, round 2: `vary` on six more references; merge check, roadmap test, FONT-1

Branch `feat/var-1`, tip b23d501cf (pushed, 0 behind main 1cffe2ef8). Commits this round: b29327a53 (roadmap quote/dispatch test), c746c28e4 (FONT-1 comments), b23d501cf (round 2 `vary`). No provider call, no bench.

## 1. Merge with main 1cffe2ef8 (release 157), verified
The merge 044ba9d90 was clean (no conflict). `packages/web/src/tutor-diagrams/svg-snapshots.json` on the branch is byte-identical to main's (`git diff rabbit-hole/main -- svg-snapshots.json` = 0 lines), so main's 471 moved entries are in and the three `shape-box-plot` ids equal main's (they were never changed on this branch after the amendment). Re-run on the merged tree: svg-snapshots 1/1, reference-vary 6 (now 12), vary 11, ml-statistical 25, derived 11, derived-schema 9, learn-slash 40, explanation-vary 10, explanation-tokens 11: 0 fail. Gemini request hashes over the 469 reference prompts: 469 of 469 identical to round 1 (and so to main). Planner-kind replay (474 rows, 0 overrides): byte-identical to round 1, 0 picks moved.

## 2. Roadmap test: quoteRoadmapCard body == dispatch body (passes)
`packages/control-plane/test/roadmap-quote-vary.test.js` (2 tests). For a roadmap step ("Learning curves: How can learning curves show whether more data may help?") that selects the varied `learning-curves` reference, with the library as written (`vary` attached): the quote's fingerprint is accepted by `generateRoadmapCard`'s meter (no `request_mismatch`), the one dispatched author body hashes to the quoted `requestFingerprint`, it contains the reference ("Learning curves compare error as data increases"), and quoting twice gives the same fingerprint. Why it holds: a reference is drawn only when `input.requestSeed` is a string; only the typed route (`startExplain`) passes one, and `authorInput` (roadmap) never does, so the roadmap prompt carries the reference as written at both quote and dispatch. The second test pins the other half: the same input WITH a `requestSeed` produces a different body, so a roadmap that ever passed a seed would fail every card with `request_mismatch`; the test is the guard against that. Existing roadmap suites (roadmap-course 20, roadmap-routes 12, explanation-layout 16, explanation-model-profiles 7) pass. Not covered: the production Gemini fast-chain dispatch path (its steps go through `meterStep`, an existing mechanism with its own test in roadmap-course); the new test uses the plan-model path (no Gemini key) so no network is touched.

## 3. FONT-1 (comments only)
One comment above `TEACHING_FONT` in `teaching-theme.js` (names 'Inter'; the loaded family is 'Inter Variable' from index.css `@fontsource-variable/inter`, so figures draw in Liberation Sans / Arial; renaming needs the Arial table re-measured) and one above `legendTextWidth` in `ml-plot-layouts.js` (the ARIAL table depends on that). Nothing else; svg-snapshots unchanged.

## 4. Round 2: which references (the next six of the Reviewer's 15, LIST.md order)
8 d2l-dropout-validation-metrics, 10 d2l-cnn-loss-and-accuracy, 11 d2l-lag-regression-training-loss, 18 ensemble-votes, 19 bias-variance-decomposition, 20 boosting-signed-corrections. Not in this round: #7 and #21 (unvaried by the Reviewer). Round 3 would be 22 class-weighted-loss, 23 permutation-feature-importance, 24 feature-selection-stability.

Bands are exactly LIST.md's (no band changed this round). Data: `reference-vary.js` (a `bars` helper for bar series).

| reference | varied paths | struck (stay as written) |
| --- | --- | --- |
| d2l-dropout-validation-metrics | loss points 0 to 4 y (5), accuracy points 0 to 2 y (3) | accuracy at epochs 4 and 6 (the equal 0.77), the x grid |
| d2l-cnn-loss-and-accuracy | training and held-out points 2 to 5 y (8) | epochs 1 and 2 (the early plateau), the x grid |
| d2l-lag-regression-training-loss | training 6 y, validation 6 y (12) | the x grid; the last two validation bands overlap on purpose (leveling off) |
| ensemble-votes | hard votes A, B (2), weighted votes A, B, C (3) | hard class C (1) |
| bias-variance-decomposition | bias low, medium (2), variance medium, high (2) | noise (constant 2), bias at high, variance at low |
| boosting-signed-corrections | first correction (3), second correction (3), signs held by band | the initial prediction (3, 3, 3) |

The three d2l plots carry depth variants (overview, deep) with their own copies of the numbers; the paths are shared and each level draws its own values (checked: the written value of every varied path lies inside its band in all three specs).

## 5. Evidence in this folder
- `lint.txt`: vary lint over the library: 469 references, 12 carry `vary`, 0 problems.
- `two-seed-and-20-seeds.txt` (script `round2.mjs`): per reference, seeds request-0 / request-1: lint, unchanged vs changed paths (0 unexpected changes), the table written / seed A / seed B per varied path, and the 20-seed check (parse, draw at 320 / 408 / 720, the reference's own pattern, hand-written in the script: loss falls, accuracy rises to the two equal last values; held-out above training at every epoch; validation above training and leveling; whole hard votes with class A > B > C in both series; noise constant with bias falling, variance rising and the total U-shaped; initial stays 3 and the correction signs hold). Result: all six pass in 20 of 20 seeds (the three d2l plots over base, overview and deep = 60 draws each); distinct draws in 20 seeds: 20, 20, 20, 20, 20, and 13 for bias-variance-decomposition (it has few free values: 4 paths with 2 to 3 values each).
- `<id>-written.svg`, `<id>-seedA.svg`, `<id>-seedB.svg`: SVG at width 408 as written and with the two seeds (18 files). These specs have no derived fields (`derivedPaths` = 0), so the table above is the varied inputs.
- `web-tests.txt`, `cp.txt`, `gemini-hashes-round2.json`, `replay-round2.json`.

## 6. Checks
Web `tutor-diagrams/*.test.mjs` + `learn-slash.test.mjs` (one process): 1394 tests, 0 fail, including svg-snapshots (0 moved: the snapshots are of the written spec), ml-reference-integration 473, content-contract, reference-content-contract, geometry-lint, and `reference-vary.test.mjs` now 12 tests (20 seeds and every depth per varied reference). Control plane (`explanation-*`, `learn-artifact`, roadmap-quote-vary): 518 tests, 0 fail. Not run: the whole `packages/web` suite, browser checks, any provider call, any bench; `author-prevalidate` in `scripts/topic-pipeline` (6 failures, missing `js-tiktoken`) as before.

## For the Reviewer
1. bias-variance-decomposition has 4 free values and so few distinct draws (13 of 20 seeds); acceptable, or widen? (It is a stacked bar whose point is the U shape; the bands protect it.)
2. Round 3 (22, 23, 24) is the last of the 15; the one $6 bench follows it after the Reviewer confirms the owner's OK.
3. The quote-hash question from round 1 and step 3 is answered by section 2: no seed is ever passed on the roadmap path, quote and dispatch bodies match with `vary` attached.
