# VAR-1 round 1 (build step 1): the derived-field table, validator, fill, optional fields, the two schema properties

Branch `feat/var-1` off main 9531b382f (release 154), tip 147030336. Three commits: 112a4c41b (table, validator, fill, optional fields, tests), 893bd7441 (schema properties `derive`, `op`, `t` and the Gemini handling), 147030336 (docs). Hunks: `hunk.diffs` (renderer-constraints.md, a generated sheet, left out). Tools used for the counts: `props.mjs`, `hashes.mjs`, `mixed.mjs` (offline, no provider call).

## Before / after

| Measure | Before (9531b382f) | After | Note |
| --- | --- | --- | --- |
| Full author schema (`tutorDiagramAuthorJsonSchema`) properties | 1281 | 1299 (+18) | `derive` 16 (4 annotation kinds x 4 copies of coordinate-plot in the union (measured: 16)), `op` 1, `t` 1. The spec's "<= 362" is Gemini's per-request limit, not this union |
| Full parser schema (`tutorDiagramJsonSchema`) | 1598 | 1620 (+22) | `derive` 20, `op` 1, `t` 1 |
| Largest non-Gemini bundle (469 reference prompts) | 388 (ml-raw-log-distributions) | 394 (+6) | no limit on other providers |
| Gemini unsteered bundle | 136 properties, 9,977 characters | 136, 9,977 | unchanged: `derive`, `op`, `t` are withheld from Gemini |
| Largest Gemini bundle over the 469 reference prompts | 350 (ml-transformer-vocabulary-softmax), limit 362 | 350 | unchanged |
| Gemini mixed plot + heatmap + block-stack bundle (explanation-fast-chain test) | 360 | 360 | WITHOUT the withholding it was 366 (+6: derive 4, op 1, t 1), over 362, so the withholding is needed |
| Gemini schema, all 469 reference prompts, sha1 of the request schema | `gemini-hashes-before.json` | `gemini-hashes-after.json` | 469 of 469 byte-identical (`required` lists are put back for Gemini where a field became optional) |

## Planner-kind replay
Offline, no provider call: `C:/s/int8-replay.mjs` (the recorded 3x gate run `2026-11-09T134635-118-3x-gate-c0e8f365a-fresh-ledger/results.json`: selectWithSteer and planWithReferenceKind over each recorded planner answer) on both trees: 474 rows, 114 steer events, 0 overrides, 205 with a first pick; rows that differ between 9531b382f and the build: 0. This replays reference selection and kind steering; the planner's own model call is not repeated, and the planner schema is not changed by this step.

## Snapshots (STOP condition, not regenerated)
`svg-snapshots` moves for `shape-box-plot/320`, `/408`, `/720` and nothing else. Cause: the kind gallery's box-plot specs (the "Commute times" card and its three depth variants in `kind-gallery-depths`) carry no `fences`, so under "absent = computed" they now draw and print fences 0 and 40. The same cause fails 4 tests that assert `parse(spec)` equals the spec: `kind-gallery` (box-plot gallery spec) and `kind-gallery-depths` (box-plot overview, standard, deep). No reference given derive/tokens/vary moved (none exists in step 1). Decision for the Reviewer below.

## Tests (final tip)
Web `src/tutor-diagrams` whole directory: 1331 tests, 1326 pass, 5 fail (the five above). Single files: spec 25, ml-statistical 25, ml-plot 29, ml-data 12, token-links 8, derived 10 (new), derived-schema 9 (new), content-contract 13, reference-content-contract 1, ml-reference-integration 473, geometry-lint 9, stray-hex 2, palette-guard 1, TutorDiagram 8: all pass. Control plane: explanation-fast-chain 22, explanation-visual-fallback 5, learn-artifact 23, explanation-references 11, explanation-prose-pass 9, explanation-gemini-illustration-bundles 14 (one new), explanation-validation 16, explanation-diagram-kinds 32: all pass. `renderer-constraints.md` regenerated (the generator now also reads `derived.js`); its two tests pass. `scripts/topic-pipeline/test/author-prevalidate.test.mjs`: 6 of 11 fail here with `Cannot find package 'js-tiktoken'` (not installed in this checkout's node_modules; unrelated to this change, the renderer-constraints tests in that file pass).

## Tests changed (a rejection became a fill, or a message moved)
- `token-links.test.mjs`: weights that do not sum to 0.98 to 1.02 under `normalized` are now raw scores and are normalised, not rejected: `[0.49, 0.4899, 0, 0]` and `[0.51, 0.5101, 0, 0]` now pass; `[0, 0, 0, 1.01]` with `normalized: true` passes (the `.max(1)` per weight left the schema; a non-normalized weight above 1 is still rejected, by `validateTokenLinks`); the zero total and the comparison child test now use all-zero weights.
- No other existing test changed. The 154 fence, softmax, bootstrap and whisker messages are byte-identical (they moved from `ml-statistical-spec.js` / `spec.js` into `derived.js`).

## Acceptance (spec section 6, items 1 to 3), run through the real parser
1. Trial box (q1 6, q3 12, fences 2/16) fails with 154's message, tagged arithmetic; fences omitted: filled -3 and 21 and printed ("Lower fence: -3; Upper fence: 21"). `derived.test.mjs`.
2. `derive: 'series.0:mean'` with no value is filled with the mean (1, 4, 2, 5, 3 gives 3); a wrong value is rejected: `Mean is at the mean of "Data" (y): 3, not 4.`. `derived-schema.test.mjs`.
3. `op: 'softmax'` with no softmax word: the 0.70 / 0.26 / 0.04 card fails naming 0.66, 0.24, 0.10; `t: 0.5` recomputes with before / 0.5 (0.86, 0.12, 0.02); a gate word in the title does not switch `op` off. `derived-schema.test.mjs`.

## For the Reviewer to decide
1. Fence-less box plots now draw computed fences (the gallery box-plot above). Options: (A) accept it: regenerate the 3 snapshot ids, and change the 4 gallery tests to expect the computed fences; (B) fill fences only for a box that has `outliers` (a fence only matters there), which fails acceptance 1 for an outlier-free trial card. Recommendation A, since fences are what the spec asks the figure to print.
2. A box without written fences keeps 154's outlier rule (outliers read against the whiskers) and no whisker-vs-fence check; a computed fence is only filled. Tightening it (read outliers and whiskers against the computed fences) rejects a card 154 accepts, and a test written for 154 asserts the current behaviour (`box plot without fences is unaffected by the fence arithmetic`). Left as 154.
3. `after.items` is optional only with `op: 'softmax'`; without `op` an item list is still required. `omitted` is never filled (absent means "do not draw it"); only a written one is checked.
4. `derive: 'series.<i>:on'` on a segment or vector applies to both ends (each omitted y is filled, a written one is checked); an end that is not on the series cannot use `derive`. A line draws as a monotone cubic unless `smooth: false`, and the on-series y uses the same curve (Steffen tangents, `plot-lines.js`). An uncertainty band's clamp of that curve is not modelled (`shortcut:` comment in `derived.js`).
5. Token-links: any `normalized` weights outside 0.98 to 1.02 (or with one above 1) are replaced by 2-decimal shares summing to exactly 1 (largest remainder). Histogram: a `measure: 'proportion'` list of whole numbers that is not already proportions (each at most 1, sum 1) is read as counts and replaced, 2 decimals, summing to exactly 1 (a bin under 0.5 percent of the total becomes 0).
6. Heatmap `range` absent: the cells' own extent (a written range is kept and still bounds the cells; it is not required to equal the cells' extent).
7. Property counts above are the true ones: the spec's "two properties in total" is 16 + 1 + 1 in the full author schema, because coordinate-plot appears four times in the union (top level, comparison panels, the two visual transformation states; a guess at the copies, the count 16 is measured). All of it is withheld from Gemini.
8. Statistic decimals follow the Reviewer's change (inputs' max decimals + 1, capped at 3): integer targets 1, 4, 2, 5, 3 give 3; 1.5 and 2.5 give 2; integers with mean 5/3 give 1.7.
