# GEM-S2: columns { heading, items } with no rows (Q0)

Branch `feat/gem-s2` (base main 9531b382f, release 154). Commits: b2c74b16f (test), c9c96ba97 (the test moved next to its neighbours so it merges cleanly with GEM-S1's appended tests).
Source changed: none. Test changed: `packages/control-plane/test/explanation-matrix-coerce.test.js` (+1 test). Merge with the batch (5d13f435f): clean, tree 45b620fee, 14 tests pass.

## Finding

The object Gemini sends is `columns: [{ heading, items: [strings] }, ...]` with no `rows` (saved specs: CARD_27 forward diffusion heatmap, CARD_28, GINI_03, the logistic confusion matrix; all in
explanation-matrix-coerce.test.js). The schemas it is written against:

| kind | needs | source |
| --- | --- | --- |
| matrix | `columns: string[]` (2-5, 2-8 teaching), `rows: [{ heading, cells }]` (a row label is required on every row) | spec.js:71-73, ml-data-spec.js:21-23 |
| heatmap | `columns: string[]`, `rows: [{ label, cells }]` (label required, unique), `range: {min,max}` | ml-statistical-spec.js:7-12, checkHeatmap :46 |
| token-links, transformation | no `columns` field at all | token-links-spec.js, spec.js:94 |

{ heading, items } supplies: a heading per column (the column label) and the entries of that column. It supplies NO row label. Mapping heading -> column label and items -> the column's cells
therefore yields a table whose rows have no names, which is invalid; the only ways to name them are all inventions or guesses:
- "Item 1, Item 2": forbidden since release 126.
- copy the column headings down as row labels because the table is square: right for an attention heatmap (query tokens = key tokens), wrong for a confusion matrix (rows are Actual, columns Predicted) and a
  guess in general; the first column's items as row labels is wrong for GINI_03 and duplicates for CARD_27 (heatmap labels must be unique).
- rebuild as `comparison` (columns `{ heading, items }`, 2-4 columns, 1-5 items: every saved shape fits): lossless, but a different kind from the planned one, and SIMP-1 decided a matrix is never turned into a comparison.

Q0 already transposes when the author gives the row labels (rows with headings, one per item): that path is untouched. So no source change is built; the new test pins the decision (a square table,
a confusion matrix and the three saved cards stay left, no Item n, no comparison).

## Counts (counts.json)

- The 23 "no labels" events (AFTER, 66 runs; 12 of them in the 4 GEM-S1 cells, 17 of the 29 BEFORE) fire only when the former rows are absent or not one per item, i.e. when the object carries no row
  labels. A rule that invents nothing makes 0 of them valid: GEM-S2 first-attempt-valid stays 1/12.
- Correction to the fallbacks report: "attempt-0 columns received object error 0/12" is a harness bug (run.mjs regex `columns.d+`, backslashes lost; its README says it was fixed, the file is not). From the saved
  events the error occurred in 11/12 BEFORE and 8/12 AFTER runs of the GEM-S1 cells (17/33 and 14/33 over all cells). So Q0 does see the shape on almost every run; it is the missing row labels, not a missing key, that
  keeps first-attempt-valid at 1/12.
- The attempt-0 specs themselves are not saved anywhere (events keep the error text, which lists at most three issues, so even "rows absent" is not shown by it).

## Hunks that touch lines SIMP-1 / GEM-S1 touched

None in source. The test is inserted before `test('former row headings become the column headings ...` (hunk.diff, @@ -72), away from the tail where GEM-S1 appended its three tests.

## Runner (not run): rerun.mjs, report.mjs

Records the RAW attempt-0 Gemini answer (rawGoogle[0]) for every run, fixes the regex, three arms (before main 9531b382f / batch 5d13f435f / after 45b620fee; src of batch and after is identical, so the after arm only
repeats the batch; `--arms before,batch` or `--arms batch` is enough for the capture). Trees: C:/s/gem-s2-trees/{before,batch,after} (git archive of `packages`; no node_modules needed).

    cd C:/s/sprint2-evidence/gem-s2 && node rerun.mjs --dry-run                                  # done, passes: no provider call
    cd C:/s/sprint2-evidence/gem-s2 && node rerun.mjs --out results.jsonl --cap 0.40             # 36 runs, about US$0.18; resumable; stops at the cap (exit 3)
    cd C:/s/sprint2-evidence/gem-s2 && node rerun.mjs --out results.jsonl --arms batch --cap 0.10 # the cheaper form: 12 runs, about US$0.06, enough to capture the raw shapes
    node report.mjs                                                                                # REPORT.md, counts.json; replays the raw attempt-0 specs through each arm's Q0

report.mjs was tried on ../fallbacks-batch/results.jsonl (reproduces 29/23 events, 17/14 columns-object errors) and on a synthetic raw record (the unlabelled heatmap stays invalid, a labelled matrix is fixed).
