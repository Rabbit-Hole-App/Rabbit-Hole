# VAR-1 step 4, round 3: the last three references, the two round-2 amendments, the bench plan

Branch `feat/var-1`, tip bf926057f (pushed, 0 behind main 1cffe2ef8). Commits this round: ca5e783ec (round 2 amendments, one commit), bf926057f (round 3 `vary`). No provider call, no bench.

## 1. Round 2 amendments (ca5e783ec), as the Reviewer ordered
- boosting-signed-corrections: the second correction is never larger in magnitude than the first, per sample. Bands moved: `series.1.values.1` [-2, -1, 0.5] (was [-2, -0.5, 0.5]), `series.2.values.1` [-0.75, -0.25, 0.25] (was [-1, -0.25, 0.25]), `series.1.values.2` [0.5, 1, 0.25] (was [0.25, 1, 0.25]); sample A and `series.2.values.2` unchanged. The written values still lie inside every band (-1, -0.5, 0.5). Why it now holds by construction: A |first| >= 1 >= |second|, B |first| >= 1 > |second|, C |first| >= 0.5 = max |second|. Check on the OLD bands over 200 seeds: 40 draws broke |second| <= |first|; on the new bands 0.
- ensemble-votes: `series.1.values.1` (weighted class B) removed from `vary`; it stays 2.4 as written (2 hard votes vs 2.4 confidence-weighted; the written value is Codex's call, REF-1, the band comes after). 4 varied paths remain.
- Patterns added to `reference-vary.test.mjs` (20 seeds, now also in the evidence script `round3.mjs`): boosting `|second| <= |first|` per sample (plus initial stays 3 and the signs); ensemble weighted <= hard for classes A and C (plus whole hard votes A > B > C, weighted A > B > C). The test file had no pattern map before; it now has one for the two amended references and the three new ones.

## 2. Round 3: which references (the last three of the Reviewer's 15, LIST.md order)
22 class-weighted-loss, 23 permutation-feature-importance, 24 feature-selection-stability. With these the 15 of LIST.md are done (#7 figure-retro-neighbor-search and #21 bayes-additive-log-scores stay unvaried). Bands are exactly LIST.md's, none changed. Data: `reference-vary.js` (the `bars` helper).

| reference | varied paths | stay as written |
| --- | --- | --- |
| class-weighted-loss | rare class weighted loss `series.1.values.1` [2, 6, 1] (1) | both raw losses (1, 1), the common class's weighted 1 |
| permutation-feature-importance | both shuffles, features A, B, C (6) by disjoint bands | nothing varied is cited in the text |
| feature-selection-stability | both selectors, features A, B, C (6) by disjoint bands, fractions in [0, 1] | |

Patterns checked on every seed (hand-written in `round3.mjs` and in `reference-vary.test.mjs`, not product code): class-weighted-loss equal raw losses, common weighted 1, rare weighted a whole number >= 2; permutation importance A > B > C in each shuffle with C within 0.02 of zero; selection stability fractions in [0, 1] and A > B > C under both selectors.

## 3. Evidence in this folder
- `lint.txt`: vary lint over the library: 469 references, 15 carry `vary`, 0 problems.
- `two-seed-and-20-seeds.txt` (script `round3.mjs`, also `run.out`): per reference, seeds request-0 / request-1: lint, unchanged vs changed paths (0 unexpected changes), the table written / seed A / seed B per varied path, and the 20-seed check (parse, draw at 320 / 408 / 720, the pattern). The two amended round-2 references are re-run in it with the new bands. Result: all five pass 20 of 20 seeds (distinct draws in 20 seeds: ensemble-votes 19, boosting 20, class-weighted-loss 5, permutation importance 20, selection stability 20).
- class-weighted-loss has one varied path with five possible values (2 to 6), and request-0 and request-1 happen to draw the same value (5), so the standard seed A / seed B pair shows no change. A second pair that does differ (request-0 = 5, request-2 = 2) is in `class-weighted-loss-seedA-alt.svg` / `class-weighted-loss-seedB-alt.svg`; the 20 draws are in `class-weighted-loss-alt-seeds.txt`.
- `<id>-written.svg`, `<id>-seedA.svg`, `<id>-seedB.svg`: SVG at width 408 as written and with the two seeds, for the five references (these specs have no derived fields, so the table is the varied inputs).
- `web-tests.txt`, `cp.txt`, `gemini-hashes-round3.json`, `replay-round3.json`.

## 4. Checks
Web `tutor-diagrams/*.test.mjs` + `learn-slash.test.mjs` (one process): 1397 tests, 0 fail (1394 + 3 round 3 tests), including svg-snapshots (0 moved: the snapshots are of the written spec), ml-reference-integration 473, content-contract, geometry-lint and `reference-vary.test.mjs` (15 tests; 20 seeds and every depth per varied reference, with the patterns). Control plane (`explanation-*`, `learn-artifact`, `roadmap-quote-vary`): 518 tests, 0 fail. Gemini request hashes over the 469 reference prompts: 469 of 469 identical to round 2 (and so to main). Planner-kind replay (474 rows, 114 steer events, 0 overrides): byte-identical to round 2, 0 picks moved. Not run: the whole `packages/web` suite, browser checks, any provider call, the bench; `author-prevalidate` in `scripts/topic-pipeline` (6 failures, missing `js-tiktoken`) as before.

## 5. The bench plan (prepared, not run): `../../bench-plan/` and C:/s/sprint2-evidence/var-1-bench/
`plan.md`, `plan.mjs`, `plan.json`, `run.mjs` (`--dry-run` passes, no provider call; a `--cap 0` self-test stops before any call). 626 runs: the section-6 303 numeric items on BEFORE (main 1cffe2ef8) and AFTER (feat/var-1 bf926057f) plus 20 variation runs (ten varied references, the same prompt twice) on AFTER. Estimate US$2.13 upper (US$0.0034 a run, section 6), stop line US$5.40, hard cap US$6.00, about 30 minutes. See `plan.md`.

## For the Reviewer
1. The spec's "158 numeric cells" is not a number the section-6 / 6b harness produces: 83 audit pairs (111 by raw depth label) plus 18 box cells = 101 distinct cells, 303 items. The plan uses those 303 items. Say if you meant a different set.
2. class-weighted-loss has only 5 possible draws; acceptable (it is one value), or leave it out of the variation set? (It is in the variation set; remove it if you prefer ten references with more room.)
3. The numeric arm (303 items x 2) exercises varied references only when a prompt selects one; the 20 variation runs are the direct test.
