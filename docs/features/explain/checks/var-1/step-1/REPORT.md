# VAR-1 step 1 close: snapshots, gallery tests, property counts, Gemini count with the fields

Branch `feat/var-1` off main 9531b382f. Step-1 commits 112a4c41b, 893bd7441, 147030336 (see `../round-1/README.md`) plus b692eb42e (this close). Reviewer's answer: Option A (computed fences are printed; regenerate the 3 snapshot ids).

## Snapshots and gallery tests (Option A)
- `UPDATE_TUTOR_SVG_SNAPSHOTS=1` moved exactly three entries: `shape-box-plot/320`, `/408`, `/720`. Each: sha256 changed, height 243.5 to 266.5 (width unchanged). No other id moved.
- 408 before/after: `shape-box-plot-408-before.svg` (tree of main, via the release-155 worktree, which has the same tutor-diagrams code as main) and `shape-box-plot-408-after.svg` (feat/var-1); `svg-diff.txt` lists the changed tags; `render-box.mjs` produced both. The gallery "Commute times" box (no `fences` written) now draws two dashed fence lines at x 0 and 40 (`data-tutor-box-fence`), a caption line "Lower fence: 0; Upper fence: 40" (and the same line in the figure's aria-label), and everything below moves down 23 px (grid line, axis ends 0 and 40, axis title). Nothing else changes.
- The four gallery tests (`kind-gallery` box-plot spec; `kind-gallery-depths` box-plot overview, standard, deep) asserted `parse(spec)` equals the spec; they now expect the spec plus its computed fences (`withComputedFences` in each test, using `boxFences` from `derived.js`). The gallery JSON is unchanged.

## Tests at the close (b692eb42e)
- Web `src/tutor-diagrams` (every *.test.mjs / *.test.js, subdirectories included): 1331 tests, 1331 pass, 0 fail.
- Control plane: explanation-fast-chain, explanation-visual-fallback, learn-artifact, explanation-references, explanation-prose-pass, explanation-gemini-illustration-bundles, explanation-validation, explanation-diagram-kinds: 132 tests, 0 fail.
- New in step 1: `derived.test.mjs` (10 tests) and `derived-schema.test.mjs` (9 tests): fence rule and fill, whisker rule, softmax recompute and `op` / `t`, the statistic decimals, token-links normalise, histogram counts, heatmap range, sample-set differences, `derive` on a point / segment / vector, the Gemini withholding.

## Property counts per bundle (offline; `../round-1/props.mjs`, `mixed.mjs`, `hashes.mjs`)
| Measure | Before (9531b382f) | After (feat/var-1) |
| --- | --- | --- |
| Full author schema | 1281 | 1299 (derive 16, op 1, t 1) |
| Full parser schema | 1598 | 1620 |
| Largest non-Gemini bundle (469 reference prompts) | 388 | 394 |
| Gemini unsteered bundle | 136 props / 9,977 chars | 136 / 9,977 |
| Largest Gemini bundle over the 469 reference prompts (limit 362) | 350 | 350 |
| Gemini mixed plot + heatmap + block-stack | 360 | 360 (366 without the withholding) |
| Gemini schema sha1 over the 469 reference prompts | | 469 of 469 identical |
Planner-kind replay (`C:/s/int8-replay.mjs`, recorded 3x gate run, offline): 474 rows, 114 steer events, 0 overrides; rows that differ between main and the build: 0.

## The Reviewer's extra ask: what Gemini would carry with the fields added
Today `derive`, `op`, `t` are withheld from Gemini's bundle, so `op: 'softmax'` (SOFT-1) and `derive` can only come from gpt-oss (any non-Gemini step); a Gemini softmax card still needs its `after` items typed and still goes through the 154 word trigger. Measured with `withoutDerived` turned off (`gemini-with-fields.mjs`, `gemini-with-fields.json`; the patch was a scratch edit, reverted):
| Gemini bundle | Withheld (now) | With derive / op / t added |
| --- | --- | --- |
| Unsteered | 136 props, 9,977 chars | 138 props, 10,033 chars (+2) |
| Largest over the 469 reference prompts | 350 (ml-transformer-vocabulary-softmax) | 356 (same id) |
| Reference prompts over 362 | 0 | 0 (largest 356) |
| Mixed plot + heatmap + block-stack (explanation-fast-chain test) | 360 | 366: OVER 362 by 4 |
| Reference prompts whose Gemini schema would carry `derive` | 0 | 280 of 469 |
So the fields fit for every reference prompt and the unsteered bundle, with 6 properties of headroom at the worst reference prompt; they do not fit the mixed bundle (a plot + heatmap + block-stack request) and anything like it. Options: (1) keep the withholding (SOFT-1 and `derive` on non-Gemini only, today's build); (2) give Gemini only `op` (+1 property; about 1 per transformation copy, `t` optional) and keep `derive` withheld: not measured separately beyond the arithmetic (op 1, t 1, derive 4 in the mixed bundle: dropping derive alone gives 362 = at the limit, not over it); (3) add the fields and let the existing reduction (`bundledAuthorSchema`) drop something in a mixed request. Recommendation: (2) in step 3 or later if SOFT-1 on Gemini proves to matter in the bench; the mixed bundle at 362 has zero margin.
