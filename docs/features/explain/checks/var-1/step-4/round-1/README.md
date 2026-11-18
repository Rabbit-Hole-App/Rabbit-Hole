# VAR-1 step 4, round 1: `vary` on six references

Branch `feat/var-1`, tip d589eca0d (pushed). Before the round, `rabbit-hole/main` (release 156, 710801bb2) was merged into `feat/var-1` with a normal merge, e576da73b (clean, no conflicts; nothing pushed was rebased or force-pushed). No provider call was made.

## Which references (the first six of the Reviewer's 15, in LIST.md order)
1 log-feature-scale, 2 learning-curves, 3 search-grid-and-random, 4 probability-calibration, 5 acf-pacf-stems, 6 ml-stable-diffusion-encoder-evaluation. Not in this round: 7 and 21 of LIST.md (left unvaried by the Reviewer); the other nine of the 15 come in rounds 2 and 3.

## Where `vary` lives
`packages/web/src/tutor-diagrams/reference-vary.js` (new): one map id -> `vary`, attached to the library's references in `reference-library.js` (a 5-line change). The ~40 reference files are not touched, so each round is one reviewable diff. Bands are the LIST.md bands (disjoint where an order is part of the lesson; no `order` element, no "distinct values" rule), the 6 draw paths below.

| reference | varied paths | bands |
| --- | --- | --- |
| log-feature-scale | series.0.points.0..3.y (4) | 0.3-0.9, 1.0-2.0, 2.1-3.0, 3.1-3.9 step 0.1 |
| learning-curves | series.0.points.0..3.y, series.1.points.0..3.y (8) | training 0.03-0.08 / 0.09-0.11 / 0.12-0.15 / 0.16-0.19; validation 0.40-0.48 / 0.28-0.36 / 0.22-0.26 / 0.20-0.21; step 0.01 |
| search-grid-and-random | series.1.points.0..5.x (6): the random candidates' x only; grid and every depth stay | 0.02-0.06, 0.10-0.30 (0.02), 0.5-1.2 (0.1), 2-4 (0.2), 6-12 (1), 25-60 (5) |
| probability-calibration | series.0.points.0..4.y (5); the diagonal stays | 0.02-0.08, 0.12-0.26, 0.30-0.46, 0.50-0.66, 0.70-0.86, step 0.01 |
| acf-pacf-stems | series.0.points.1..6.y (6); lag 0 stays 1 | 0.60-0.80, 0.35-0.55, 0.10-0.30, **-0.20 to -0.05, -0.40 to -0.25** (changed, see below), -0.25 to -0.05; step 0.05 |
| ml-stable-diffusion-encoder-evaluation | both series, x and y of 4 points (16); base, overview and deep share the paths | LIST.md bands, step 0.01 |

**One band changed from LIST.md (acf-pacf-stems, lags 4 and 5), please confirm.** LIST.md drew lag 4 as -0.20 to 0.00 and lag 5 as -0.35 to -0.20. The 20-seed check found 7 of 20 seeds that break the pattern the reference teaches (decay, then a sign change): lag 4 drew 0.00 in 5 seeds (a zero stem, no sign change) and lag 4 = lag 5 = -0.20 in 2 seeds (the bands touched, so they were not disjoint). The bands are now lag 4 -0.20 to -0.05 and lag 5 -0.40 to -0.25: still disjoint, still contain the written values (-0.10, -0.25), lag 4 stays below zero and above lag 5 in every draw. 20 of 20 seeds now pass.

## Evidence in this folder
- `lint.txt`: the vary lint over the whole library: 469 references, 6 carry `vary`, 0 problems (the depth variants of the encoder reference pass too).
- `two-seed-and-20-seeds.txt` (script `round1.mjs`): per reference, seeds request-0 / request-1: lint, unchanged vs changed paths (structure, axes, titles, labels, captions unchanged; 0 unexpected changes), a table written / seed A / seed B per varied path, and the 20-seed check (parse, draw at 320 / 408 / 720, every value inside its band, the reference's own pattern checked by hand-written rules in the script: rising / falling / below the diagonal / forward step lines). Result: all six pass in 20 of 20 seeds (and the encoder's base, overview and deep specs, 60 draws); 19 to 20 distinct draws in 20 seeds.
- `<id>-written.svg`, `<id>-seedA.svg`, `<id>-seedB.svg`: the SVG at width 408 of the reference as written and drawn with the two seeds (18 files). These plots have no derived fields (`derivedPaths` = 0), so the "derived table" is empty: the tables above are the varied inputs.
- `web-tests.txt`, `cp.txt`, `gemini-hashes-round1.json`, `replay-round1.json`.

## Checks
- Web `tutor-diagrams/*.test.mjs` + `learn-slash.test.mjs`: 1386 tests, 0 fail (`web-tests.txt`), including svg-snapshots (**0 moved**: the snapshots are of the written spec), ml-reference-integration 473, content-contract, reference-content-contract, geometry-lint, and the new `reference-vary.test.mjs` (6 tests: for each varied reference, 20 seeds and every depth: parses, draws at 3 widths, inside its bands, the written values lie inside the bands, a step line's x never goes backwards).
- Control plane: 47 test files (`explanation-*` and `learn-artifact`), 478 tests, 0 fail (`cp.txt`). Two tests of step 3 were written for a library with no `vary`: `explanation-vary` "the library is untouched by a seed" now skips prompts whose selection holds a varied reference (and one new test shows a varied reference is drawn from its bands under a seed, repeats for the same seed and goes out as written without one); `vary.test.mjs` "the library lint" now asserts the carriers are exactly the ids of `referenceVary`.
- Gemini request hashes over the 469 reference prompts: 469 of 469 identical to step 3 and to main (the request schema does not carry reference specs; references are drawn without a seed there).
- Planner-kind replay (recorded 3x gate run, 474 rows, 114 steer events, 0 overrides, 205 first picks): byte-identical to the step-3 result, 0 picks moved (`replay-round1.json`).
- Not run: the whole `packages/web` suite, browser checks, any provider call, any bench. `author-prevalidate` in `scripts/topic-pipeline` (6 failures, missing `js-tiktoken`) as before.

## For the Reviewer
1. The acf band change above (lags 4 and 5): accept?
2. Round 1 only changes what a request's author is shown in these six references; the written references and every snapshot are unchanged. Visible effect: a learner's card copied from one of them now draws its own numbers per request.
3. Not checked: whether a quote hash covers the author request body (carried from step 3); it matters now that six references vary.
