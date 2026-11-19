# BOX-1: box-plot statistics from the data (feat/box-1, off main a88949c27; 2026-11-19)

The lead wrote this from the lane agent's text. Offline build; no provider call by the lane. Pushed to rabbit-hole, plain messages, no trailers. Worktree C:/s/box1.

## Commits
- (a) 2875788317ce2e5a62b24bfb5e5f6217bd644196: optional `values` (4 to 60 numbers) on each box, placed first in the schema. Code computes median, Q1, Q3 (medians of the halves, the middle value left out for odd n), fences, whiskers (extreme values inside the fences) and outliers; the picture draws the computed ones. Written q1 / median / q3 / whiskers are rejected, arithmetic-tagged, if off by more than half a unit of their own decimals. Absent outliers are filled with the fences drawn. Message example: Box "Trial": its 9 values give median 8 (not 8.5), Q3 11.5 (not 10.5); wrong outliers: "...its values have outliers 40 (outside the fences -3.5 and 20.5), not 12". IQR is a silent derived path `boxes.N.iqr` (token {{d:boxes.0.iqr}} works). Value-derived messages come before the fence message so the 280-character cut keeps them. Code: packages/web/src/tutor-diagrams/derived.js, ml-statistical-spec.js.
- (b) 42613ab722873c347a23d12d9b975dd35de74a29: `numbersIssue(block, question)` (also through `explanationProblem`; learn-artifact.js line 304 passes input.args). A question with a run of 5 or more numbers (comma, semicolon or "and") plus a box-plot card needs `values` on every box, and each list must equal some box's values (any order). Messages: 'the box-plot "T" must carry the learner's data: the question lists (3, 5, 6, 7, 8, 9, 11, 12, 40), so give the box "Scores" values equal to those numbers ...' or '... holds values (...), but the learner's data is (...): set the values of the box that shows it to exactly those numbers.' Code: packages/control-plane/src/learn-primitives.js.
- (c) b73c884aa49874be2365fa8583f512f708452976: a number after upper fence / lower fence / IQR / interquartile range / median / Q1 / Q3 in the diagram caption or prose must match a drawn statistic of any box (half a unit of the written decimals). Message: 'the text states "upper fence 19" but the box-plot "T" draws an upper fence of 20.5: state the drawn number...'. Operands are skipped ("Q3 - Q1 = 11.5 - 5.5", "1.5 x IQR = 9", "median of 9 values"); non-breaking hyphen and middle dot are normalised.

## Gemini properties (limit 362)
box-plot alone 37 to 38; box-plot + coordinate-plot (largest pair) 125 to 126; no pair over the limit; largest library request 350 to 350 (no box). An unplanned Fireworks bundle that carries box-plot: +1.

## Request hashes (C:/s/box1-bench/hashes.mjs + moved-check.mjs; before = C:/s/r164-int at a88949c27)
Main, 470 keys: 51 moved (author body and Fireworks request), 0 Gemini schema, 0 Gemini request: exactly the 51 requests whose author schema carries the box-plot kind. On the R2 tip (merged tree C:/s/box1-r2after, 492 = 470 + 22 pool): 53 moved, the same 51 plus pool-sunflower-tray-heights and pool-fired-tile-widths; 0 new or removed keys. List: C:/s/box1-bench/moved-keys.txt. svg-snapshots.json untouched.

## Pool and library agreement
The library has one box-plot reference (iqr-fences-and-outliers: summary only, no data, no `values`). Codex's two pool references (gen-1-box-plot-references.js on feat/gen-1-r2) are built from readings with median of halves, odd median excluded; all four pool boxes (north / south kiln, window / shelf tray) agree exactly with the computed q1, median, q3, whiskers and outliers. Rule (c) on all 9 box diagrams in main + pool (incl. depth variants): 0 flagged. Nothing was changed.

## False positives (C:/s/box1-bench/scan.mjs)
208 distinct saved box-plot cards (var-1, gen1-r1, gen1-r2, r3pre; the archive has 124 records, 0 box plots). (b) rejects 197 (they all list data and none carry `values`: expected for old cards). (c) flags 2, both genuine: caption "Lower fence 39 / Upper fence 101" against drawn 40 / 96, and "upper fence at 19" against 20.5. The first scan had 7 flags; 5 were false positives (non-breaking hyphen, middle dot, "minus", glued sign), fixed and tested.

## The twelve single-dataset R2 cards (replay12.mjs)
Six no-method cards drew Q3 10 or 10.5; six exclusive-method. As saved, all 12 fall to (b). With `values` injected (what (a) then says): the 6 no-method cards are rejected, 2 of the 6 exclusive-method cards are rejected (they drew median 8.5), 4 are accepted. (c) rejects none of the 12.

## Tests (0 fail)
Web src/tutor-diagrams/*.test.mjs 1413/1413 (new (a) tests in derived.test.mjs); control plane: test/explanation-box-values.test.js (new, 12), explanation-diagram-kinds, explanation-fast-chain, explanation-gemini-illustration-bundles, explanation-gemini-plan-bundles, explanation-prose-numbers, explanation-prose-pass, explanation-references, explanation-tokens, explanation-validation, learn-artifact, explanation-visual-fallback: 181/181. Full control-plane run: 5 to 6 failures in rabbit-hole-prod-config.test.js and explain-m3.test.js, identical on untouched main (5 there).

## Not checked or risks
1. No instruction tells the author model to fill `values`, so first attempts may fail (b) and need the repair; the measurement shows it. A one-sentence box-plot guidance line would fix it but moves system-text hashes: not added (the Reviewer's call).
2. Box plots inside comparison panels, space-only number lists and "Q1 and Q3 are 5.5 and 11.5" are not read (ponytail comments in the code).
3. The tolerance is the repo's half unit of the written decimals, so Q1 written "6" passes for 5.5.
4. The full web suite beyond tutor-diagrams was not run. Temp worktrees C:/s/box1-before, box1-r2, box1-r2after (local merge for hashes only, not pushed) remain; the harness denied the lane's rm of one helper, not retried.

## Paid measurement (harness C:/s/box1-bench/, run by the lead; result in a separate section when it ends)
Plan: R3-pre cells 23 to 27 (the five box prompts) x 3 seeds x 2 arms (before = main a88949c27, after = feat/box-1) = 30 runs, google-low; estimate US$0.15, stop line US$0.18, approved cap US$0.50.

## Paid measurement result (run by the lead; US$0.175 settled of the US$0.18 stop line, cap US$0.50; stopped at the stop line after 29 of 30 runs)
Five box prompts (R3-pre cells 23 to 27) x 3 seeds, google-low; BEFORE = main a88949c27, AFTER = feat/box-1 (three commits), results in results.jsonl (rows without raw text).
| arm | runs | delivered | box plot kept | statistics right (Q1 / median / Q3 equal the data's) | carries `values` | first attempt valid | provider calls | settled US$ |
|---|---|---|---|---|---|---|---|---|
| BEFORE | 14 | 14 | 14 | 5 | 0 | 9 | 19 | 0.053 |
| AFTER | 15 | 5 | 5 | 5 | 5 | 0 | 62 | 0.121 |
READING: with the rules alone and no author guidance, AFTER delivers 5 of 15 (10 honest `validation_error` failures after 4 repairs each) and every delivered card is right (5 of 5); BEFORE delivers 14 of 14 but only 5 of 14 have the right statistics (9 wrong, e.g. Q3 10.5 for data whose Q3 is 11.5; 62.5 / 76.5 for 61 / 75). So BOX-1 turns wrong-but-delivered cards into failures: not shippable as it stands. The author model almost never fills `values` unprompted (first attempt valid 0 of 15) and the repair messages did not get it there in 10 of 15 cases. The five delivered cards are all from the prompts that list the data in a way the model reuses. Options for the Reviewer: (1) a one-sentence box-plot guidance line telling the author to put the learner's numbers in `values` and let the code compute the statistics (moves system-text hashes of the 51 box-plot bundles; a branch with it is being prepared for a second measurement); (2) keep (a) and (c) only and drop the requirement (b) (then values stay optional and nothing forces them: the statistics would stay wrong when written by hand and not checked unless `values` is present); (3) hold BOX-1.
